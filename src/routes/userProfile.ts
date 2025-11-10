import { Router, Request, Response } from "express";
import type { PostgrestError, User } from "@supabase/supabase-js";
import {
  UserProfile,
  UserProfileInsert,
  UserProfileUpdate,
} from "../types/userProfile.js";
import type { SearchPreferences } from "../types/searchPreferences.js";
import type { PropertyInformation } from "../types/propertyInformation.js";
import { supabase } from "../supabaseClient.js";
import { supabaseAuthGuard } from "../middleware/supabaseAuthGuard.js";

const USER_PROFILE_COLUMNS = "user_id, role, created_at, updated_at";
const SEARCH_PREFERENCES_COLUMNS =
  "user_id, suburb, move_in_date, min_budget_per_week, max_budget_per_week, created_at, updated_at";
const PROPERTY_INFORMATION_COLUMNS = [
  "id",
  "accommodation_type",
  "property_type",
  "bedrooms_number",
  "bathrooms_number",
  "parking",
  "accessibility_features",
  "number_of_people_living",
  "room_name",
  "room_type",
  "room_furnishings",
  "bathroom",
  "bed_size",
  "room_furnishings_features",
  "weekly_rent",
  "bills_included",
  "suburb",
  "room_available_date",
  "created_at",
  "updated_at",
  "user_id",
].join(", ");
const USER_PROFILE_WITH_RELATIONS_SELECT = [
  USER_PROFILE_COLUMNS,
  `search_preferences(${SEARCH_PREFERENCES_COLUMNS})`,
  `property_information(${PROPERTY_INFORMATION_COLUMNS})`,
].join(", ");

const CONFLICT_ERROR_CODES = new Set(["23505"]);
const PERMISSION_ERROR_CODES = new Set(["42501"]);
const CLIENT_ERROR_CODES = new Set(["22P02", "23502", "23503"]);

type UserProfileWithRelations = UserProfile & {
  search_preferences?: SearchPreferences[] | SearchPreferences | null;
  property_information?: PropertyInformation[] | PropertyInformation | null;
};

const normalizeSingleRelation = <T>(
  value: T[] | T | null | undefined,
): T | null => {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
};

const respondWithSupabaseError = (res: Response, error: PostgrestError) => {
  const status = (() => {
    if (error.code && CONFLICT_ERROR_CODES.has(error.code)) return 409;
    if (error.code && PERMISSION_ERROR_CODES.has(error.code)) return 403;
    if (error.code && CLIENT_ERROR_CODES.has(error.code)) return 400;
    return 502;
  })();

  return res.status(status).json({
    error: error.message,
    details: error.details,
  });
};

const router = Router();

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
      return respondWithSupabaseError(res, error);
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
      .update(update)
      .eq("user_id", user_id)
      .select();

    if (error) {
      return respondWithSupabaseError(res, error);
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
        .status(401)
        .json({ error: "Authenticated user context missing" });
    }

    const { data: userProfileData, error: userProfileError } = await supabase
      .from("user_profile")
      .select(USER_PROFILE_WITH_RELATIONS_SELECT)
      .eq("user_id", supabaseUser.id)
      .maybeSingle();

    if (userProfileError) {
      return respondWithSupabaseError(res, userProfileError);
    }

    const userProfileRow =
      (userProfileData as UserProfileWithRelations | null) ?? null;

    if (!userProfileRow) {
      return res.status(200).json({
        data: {
          user_profile: null,
          search_preferences: null,
          property_information: null,
        },
      });
    }

    const userProfile: UserProfile = {
      user_id: userProfileRow.user_id,
      role: userProfileRow.role,
      created_at: userProfileRow.created_at,
      updated_at: userProfileRow.updated_at,
    };

    const searchPreferencesRecord = normalizeSingleRelation<SearchPreferences>(
      userProfileRow.search_preferences,
    );
    const propertyInformationRecord =
      normalizeSingleRelation<PropertyInformation>(
        userProfileRow.property_information,
      );
    const searchPreferences =
      userProfile.role === "looker" ? searchPreferencesRecord : null;
    const propertyInformation =
      userProfile.role === "lister" ? propertyInformationRecord : null;

    return res.status(200).json({
      data: {
        user_profile: userProfile,
        search_preferences: searchPreferences ?? null,
        property_information: propertyInformation ?? null,
      },
    });
  },
);

export default router;
