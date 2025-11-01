import { Request, Response, Router } from "express";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient.js";
import { SearchPreferencesInsert } from "../types/searchPreferences.js";
import { supabaseAuthGuard } from "../middleware/supabaseAuthGuard.js";

const router = Router();

router.post(
  "/api/search-preferences",
  supabaseAuthGuard,
  async (req: Request, res: Response) => {
    const body = req.body as Partial<SearchPreferencesInsert>;
    const { supabaseUser } = res.locals as { supabaseUser?: User };

    if (!body || typeof body.user_id !== "string") {
      return res.status(400).json({ error: "user_id is required as string" });
    }

    if (!supabaseUser || supabaseUser.id !== body.user_id) {
      return res
        .status(403)
        .json({ error: "user_id does not match authenticated user" });
    }

    const { max_budget_per_week, min_budget_per_week, move_in_date, suburb } =
      body;

    if (
      max_budget_per_week !== undefined &&
      max_budget_per_week !== null &&
      typeof max_budget_per_week !== "number"
    ) {
      return res.status(400).json({
        error: "max_budget_per_week must be a number or null",
      });
    }

    if (
      min_budget_per_week !== undefined &&
      min_budget_per_week !== null &&
      typeof min_budget_per_week !== "number"
    ) {
      return res.status(400).json({
        error: "min_budget_per_week must be a number or null",
      });
    }

    if (
      move_in_date !== undefined &&
      move_in_date !== null &&
      typeof move_in_date !== "string"
    ) {
      return res.status(400).json({
        error: "move_in_date must be an ISO date string or null",
      });
    }

    if (suburb !== undefined && suburb !== null && typeof suburb !== "string") {
      return res.status(400).json({
        error: "suburb must be a string or null",
      });
    }

    const payload: SearchPreferencesInsert = {
      user_id: body.user_id,
      max_budget_per_week:
        max_budget_per_week === undefined ? null : max_budget_per_week,
      min_budget_per_week:
        min_budget_per_week === undefined ? null : min_budget_per_week,
      move_in_date: move_in_date === undefined ? null : move_in_date,
      suburb: suburb === undefined ? null : suburb,
    };

    const { data, error } = await supabase
      .from("search_preferences")
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

export default router;
