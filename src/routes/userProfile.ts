import { NextFunction, Router, Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { UserProfileInsert, UserProfileUpdate } from "../types/userProfile.js";
import { supabase } from "../supabaseClient.js";

const router = Router();

async function supabaseAuthGuard(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.header("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(401).json({ error: "Missing Bearer token" });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res
        .status(401)
        .json({ error: "Unauthorized", details: error?.message });
    }

    const locals = res.locals as { supabaseUser?: User };
    locals.supabaseUser = data.user;
    return next();
  } catch (err) {
    return res.status(500).json({
      error: "Failed to validate Supabase token",
      details: (err as Error).message,
    });
  }
}

router.post(
  "/api/user-profile",
  supabaseAuthGuard,
  async (req: Request, res: Response) => {
    const body = req.body as Partial<UserProfileInsert>;
    const { supabaseUser } = res.locals as { supabaseUser?: User };

    if (
      !body ||
      typeof body.user_id !== "string" ||
      typeof body.role !== "string"
    ) {
      return res
        .status(400)
        .json({ error: "user_id and role are required as strings" });
    }

    if (!supabaseUser || supabaseUser.id !== body.user_id) {
      return res
        .status(403)
        .json({ error: "user_id does not match authenticated user" });
    }

    const payload: UserProfileInsert = {
      user_id: body.user_id,
      role: body.role,
    };

    // Insert new record
    const { data, error } = await supabase
      .from("user_profile")
      .insert([payload])
      .select();

    if (error) {
      const status = error.code === "23505" ? 409 : 400;
      return res
        .status(status)
        .json({ error: error.message, details: error.details });
    }

    return res.status(200).json({ data });
  },
);

router.put(
  "/api/user-profile/:user_id",
  supabaseAuthGuard,
  async (req: Request, res: Response) => {
    const { supabaseUser } = res.locals as { supabaseUser?: User };
    const { user_id } = req.params as { user_id: string };
    const body = req.body as Partial<UserProfileUpdate>;

    if (!user_id || typeof user_id !== "string") {
      return res.status(400).json({ error: "user_id param is required" });
    }

    if (!supabaseUser || supabaseUser.id !== user_id) {
      return res
        .status(403)
        .json({ error: "user_id does not match authenticated user" });
    }

    const update: UserProfileUpdate = {};
    if (typeof body.role === "string") update.role = body.role;

    if (Object.keys(update).length === 0) {
      return res
        .status(400)
        .json({ error: "At least one field to update is required" });
    }

    const { data, error } = await supabase
      .from("user_profile")
      .update(update as Record<string, unknown>)
      .eq("user_id", user_id)
      .select();

    if (error) {
      return res
        .status(400)
        .json({ error: error.message, details: error.details });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: "User profile not found" });
    }

    return res.status(200).json({ data });
  },
);

router.get(
  "/api/user-profile/me",
  supabaseAuthGuard,
  async (req: Request, res: Response) => {
    const { supabaseUser } = res.locals as { supabaseUser?: User };

    if (!supabaseUser) {
      return res
        .status(500)
        .json({ error: "Authenticated user context missing" });
    }

    const { data, error } = await supabase
      .from("user_profile")
      .select("*")
      .eq("user_id", supabaseUser.id)
      .maybeSingle();

    if (error) {
      return res
        .status(400)
        .json({ error: error.message, details: error.details });
    }

    return res.status(200).json({ data: data ?? null });
  },
);

export default router;
