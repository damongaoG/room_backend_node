/// <reference types="vitest" />

import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/supabaseClient.js", () => {
  const bucketApi = {
    upload: vi.fn(),
    createSignedUrl: vi.fn(),
    remove: vi.fn(),
    list: vi.fn(),
  };
  const fromMock = vi.fn(() => bucketApi);

  return {
    supabase: {
      storage: {
        from: fromMock,
      },
    },
    __storageMocks: {
      bucketApi,
      fromMock,
    },
  };
});

vi.mock("../src/middleware/supabaseAuthGuard.js", () => ({
  supabaseAuthGuard: (
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    res.locals.supabaseUser = { id: "user-123" };
    next();
  },
}));

type ToBufferImpl = () => Promise<Buffer>;

let toBufferImplementation: ToBufferImpl = () =>
  Promise.resolve(Buffer.alloc(512 * 1024));

vi.mock("sharp", () => {
  const createClone = () => {
    const clone: {
      webp: ReturnType<typeof vi.fn>;
      toBuffer: ReturnType<typeof vi.fn>;
    } = {
      webp: vi.fn(),
      toBuffer: vi.fn(),
    };

    clone.webp.mockImplementation(() => clone);
    clone.toBuffer.mockImplementation(() => toBufferImplementation());

    return clone;
  };

  const sharpMock = vi.fn(() => {
    const pipeline: {
      rotate: ReturnType<typeof vi.fn>;
      resize: ReturnType<typeof vi.fn>;
      clone: ReturnType<typeof vi.fn>;
    } = {
      rotate: vi.fn(),
      resize: vi.fn(),
      clone: vi.fn(),
    };

    pipeline.rotate.mockImplementation(() => pipeline);
    pipeline.resize.mockImplementation(() => pipeline);
    pipeline.clone.mockImplementation(createClone);

    return pipeline;
  });

  return {
    __esModule: true,
    default: (buffer: Buffer) => sharpMock(buffer),
    __sharpTestUtils: {
      sharpMock,
      setToBufferImpl: (impl: ToBufferImpl) => {
        toBufferImplementation = impl;
      },
      reset: () => {
        toBufferImplementation = () =>
          Promise.resolve(Buffer.alloc(512 * 1024));
        sharpMock.mockClear();
      },
    },
  };
});

const propertyImagesModule = await import("../src/routes/propertyImages.js");
const propertyImagesRouter = propertyImagesModule.default;

const storageModule = await import("../src/supabaseClient.js");
const { __storageMocks } = storageModule as {
  __storageMocks: {
    bucketApi: {
      upload: ReturnType<typeof vi.fn>;
      createSignedUrl: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      list: ReturnType<typeof vi.fn>;
    };
    fromMock: ReturnType<typeof vi.fn>;
  };
};

const sharpModule = await import("sharp");
const sharpTestUtils = sharpModule.__sharpTestUtils as {
  sharpMock: ReturnType<typeof vi.fn>;
  setToBufferImpl: (impl: ToBufferImpl) => void;
  reset: () => void;
};

function createApp() {
  const app = express();
  app.use(propertyImagesRouter);
  return app;
}

describe("propertyImages routes", () => {
  beforeEach(() => {
    const { bucketApi, fromMock } = __storageMocks;

    fromMock.mockClear();
    bucketApi.upload.mockReset();
    bucketApi.createSignedUrl.mockReset();
    bucketApi.remove.mockReset();
    bucketApi.list.mockReset();

    bucketApi.upload.mockResolvedValue({ data: {}, error: null });
    bucketApi.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://cdn.example.com/file.webp" },
      error: null,
    });
    bucketApi.remove.mockResolvedValue({ data: null, error: null });
    bucketApi.list.mockResolvedValue({ data: [], error: null });

    sharpTestUtils.reset();
  });

  it("uploads a supported image and returns metadata", async () => {
    const app = createApp();
    const response = await request(app)
      .post("/api/property-images")
      .set("Authorization", "Bearer valid")
      .attach("images", Buffer.from("fake-image"), {
        filename: "photo.jpg",
        contentType: "image/jpeg",
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(__storageMocks.bucketApi.upload).toHaveBeenCalledTimes(1);
    expect(__storageMocks.bucketApi.remove).not.toHaveBeenCalled();
  });

  it("cleans up partial uploads when a later file is unsupported", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/api/property-images")
      .set("Authorization", "Bearer valid")
      .attach("images", Buffer.from("valid-image"), {
        filename: "photo.jpg",
        contentType: "image/jpeg",
      })
      .attach("images", Buffer.from("not-image"), {
        filename: "document.txt",
        contentType: "text/plain",
      });

    expect(response.status).toBe(415);
    expect(__storageMocks.bucketApi.remove).toHaveBeenCalledWith([
      expect.stringMatching(/^user-123\//),
    ]);
  });

  it("returns 413 when compression cannot reduce the image below threshold", async () => {
    sharpTestUtils.setToBufferImpl(() =>
      Promise.resolve(Buffer.alloc(2 * 1024 * 1024)),
    );

    const app = createApp();

    const response = await request(app)
      .post("/api/property-images")
      .set("Authorization", "Bearer valid")
      .attach("images", Buffer.from("huge-image"), {
        filename: "photo.jpg",
        contentType: "image/jpeg",
      });

    expect(response.status).toBe(413);
    expect(__storageMocks.bucketApi.upload).not.toHaveBeenCalled();
  });

  it("cleans up storage when signed URL generation fails", async () => {
    __storageMocks.bucketApi.createSignedUrl.mockResolvedValueOnce({
      data: null,
      error: { message: "signed url failed" },
    });

    const app = createApp();

    const response = await request(app)
      .post("/api/property-images")
      .set("Authorization", "Bearer valid")
      .attach("images", Buffer.from("fake-image"), {
        filename: "photo.jpg",
        contentType: "image/jpeg",
      });

    expect(response.status).toBe(502);
    expect(__storageMocks.bucketApi.remove).toHaveBeenCalledWith([
      expect.stringMatching(/^user-123\//),
    ]);
  });

  it("lists existing images for the authenticated user", async () => {
    __storageMocks.bucketApi.list.mockResolvedValueOnce({
      data: [
        {
          name: "file.webp",
          metadata: { width: 1280 },
          created_at: "2025-01-01T00:00:00Z",
          updated_at: null,
          last_accessed_at: null,
        },
      ],
      error: null,
    });

    const app = createApp();

    const response = await request(app)
      .get("/api/property-images")
      .set("Authorization", "Bearer valid");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      path: "user-123/file.webp",
      name: "file.webp",
    });
  });
});
