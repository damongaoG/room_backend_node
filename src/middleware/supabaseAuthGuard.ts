import { NextFunction, Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient.js";

export async function supabaseAuthGuard(
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
