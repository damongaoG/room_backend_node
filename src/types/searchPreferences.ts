export interface SearchPreferences {
  created_at: string;
  max_budget_per_week: number | null;
  min_budget_per_week: number | null;
  move_in_date: string | null;
  suburb: string | null;
  updated_at: string;
  user_id: string;
}

export interface SearchPreferencesInsert
  extends Omit<SearchPreferences, "created_at" | "updated_at"> {}

export interface SearchPreferencesUpdate {
  max_budget_per_week?: number | null;
  min_budget_per_week?: number | null;
  move_in_date?: string | null;
  suburb?: string | null;
}
