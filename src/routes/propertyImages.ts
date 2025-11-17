import { randomUUID } from "node:crypto";
import { Router, Request, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient.js";
import { supabaseAuthGuard } from "../middleware/supabaseAuthGuard.js";

const BUCKET_NAME = "property-images";
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour
const MAX_COMPRESSED_BYTES = 1 * 1024 * 1024; // 1 MB
const MAX_FILES_PER_REQUEST = 10;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_FILES_PER_REQUEST,
    fileSize: 10 * MAX_COMPRESSED_BYTES,
  },
});

const ACCEPTED_IMAGE_PREFIX = "image/";

const QUALITY_STEPS = [90, 80, 70, 60, 50, 45, 40, 35, 30, 25, 20];

class UnsupportedFileTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFileTypeError";
  }
}

class CompressionFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompressionFailedError";
  }
}

class StorageServiceError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StorageServiceError";
  }
}

type UploadResult = {
  path: string;
  signedUrl: string;
  expiresAt: string;
  size: number;
  contentType: string;
  originalName: string;
};

const router = Router();

async function compressImage(buffer: Buffer) {
  const base = sharp(buffer).rotate().resize({
    width: 1920,
    height: 1920,
    fit: "inside",
    withoutEnlargement: true,
  });

  for (const quality of QUALITY_STEPS) {
    const compressed = await base.clone().webp({ quality }).toBuffer();

    if (compressed.byteLength <= MAX_COMPRESSED_BYTES) {
      return {
        buffer: compressed,
        contentType: "image/webp",
        extension: "webp",
      } as const;
    }
  }

  throw new CompressionFailedError("Unable to compress image below 1MB");
}

async function uploadAndSign(
  userId: string,
  file: Express.Multer.File,
): Promise<UploadResult> {
  if (!file.mimetype.startsWith(ACCEPTED_IMAGE_PREFIX)) {
    throw new UnsupportedFileTypeError(
      `Unsupported file type: ${file.mimetype}`,
    );
  }

  const { buffer, contentType, extension } = await compressImage(file.buffer);
  const objectPath = `${userId}/${randomUUID()}.${extension}`;
  const bucket = supabase.storage.from(BUCKET_NAME);

  const { error: uploadError } = await bucket.upload(objectPath, buffer, {
    contentType,
    upsert: false,
  });

  if (uploadError) {
    throw new StorageServiceError(uploadError.message, uploadError);
  }

  const { data: signedUrlData, error: signedUrlError } =
    await bucket.createSignedUrl(objectPath, SIGNED_URL_EXPIRY_SECONDS);

  if (signedUrlError || !signedUrlData?.signedUrl) {
    const { error: cleanupError } = await bucket.remove([objectPath]);
    if (cleanupError) {
      console.error("Failed to cleanup uploaded image", cleanupError);
    }

    throw new StorageServiceError(
      signedUrlError?.message ??
        "Failed to create signed URL for uploaded image",
      signedUrlError,
    );
  }

  return {
    path: objectPath,
    signedUrl: signedUrlData.signedUrl,
    expiresAt: new Date(
      Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000,
    ).toISOString(),
    size: buffer.byteLength,
    contentType,
    originalName: file.originalname,
  };
}

router.post(
  "/api/property-images",
  supabaseAuthGuard,
  (req: Request, res: Response, next) => {
    upload.array("images", MAX_FILES_PER_REQUEST)(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }

      const { supabaseUser } = res.locals as { supabaseUser?: User };

      if (!supabaseUser) {
        return res
          .status(401)
          .json({ error: "Authenticated user context missing" });
      }

      const files = req.files as Express.Multer.File[] | undefined;

      if (!files || files.length === 0) {
        return res
          .status(400)
          .json({ error: "At least one image file is required" });
      }

      const uploads: UploadResult[] = [];
      const uploadedPaths: string[] = [];

      try {
        for (const file of files) {
          const result = await uploadAndSign(supabaseUser.id, file);
          uploads.push(result);
          uploadedPaths.push(result.path);
        }

        return res.status(200).json({ data: uploads });
      } catch (error) {
        if (uploadedPaths.length > 0) {
          const { error: cleanupError } = await supabase.storage
            .from(BUCKET_NAME)
            .remove(uploadedPaths);

          if (cleanupError) {
            console.error(
              "Failed to cleanup partially uploaded images",
              cleanupError,
            );
          }
        }

        if (error instanceof UnsupportedFileTypeError) {
          return res.status(415).json({ error: error.message });
        }

        if (error instanceof CompressionFailedError) {
          return res.status(413).json({ error: error.message });
        }

        if (error instanceof StorageServiceError) {
          return res.status(502).json({
            error: "Failed to upload images",
            details: error.message,
          });
        }

        console.error("Unexpected error during property image upload", {
          error,
        });
        return res
          .status(500)
          .json({ error: "Unexpected error during image upload" });
      }
    });
  },
);

router.get(
  "/api/property-images",
  supabaseAuthGuard,
  async (_req: Request, res: Response) => {
    const { supabaseUser } = res.locals as { supabaseUser?: User };

    if (!supabaseUser) {
      return res
        .status(401)
        .json({ error: "Authenticated user context missing" });
    }

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list(supabaseUser.id, {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });

    if (error) {
      return res.status(502).json({
        error: "Failed to list images",
        details: error.message,
      });
    }

    if (!data || data.length === 0) {
      return res.status(200).json({ data: [] });
    }

    try {
      const signedResults = await Promise.all(
        data
          .filter((item) => item.name)
          .map(async (item) => {
            const objectPath = `${supabaseUser.id}/${item.name}`;
            const { data: signedUrlData, error: signedUrlError } =
              await supabase.storage
                .from(BUCKET_NAME)
                .createSignedUrl(objectPath, SIGNED_URL_EXPIRY_SECONDS);

            if (signedUrlError || !signedUrlData?.signedUrl) {
              throw new Error(
                signedUrlError?.message ??
                  `Failed to create signed URL for ${objectPath}`,
              );
            }

            return {
              path: objectPath,
              name: item.name,
              signedUrl: signedUrlData.signedUrl,
              expiresAt: new Date(
                Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000,
              ).toISOString(),
              metadata: item.metadata ?? null,
              createdAt: item.created_at ?? null,
              updatedAt: item.updated_at ?? null,
              lastAccessedAt: item.last_accessed_at ?? null,
            };
          }),
      );

      return res.status(200).json({ data: signedResults });
    } catch (error) {
      return res.status(502).json({
        error: "Failed to generate signed URLs",
        details: (error as Error).message,
      });
    }
  },
);

export default router;
