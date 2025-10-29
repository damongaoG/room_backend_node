export type UserRole = string;

export interface UserProfile {
  created_at: string;
  user_id: string;
  role: UserRole;
  updated_at: string;
}

export interface UserProfileInsert {
  user_id: string;
  role: UserRole;
}

export interface UserProfileUpdate {
  role?: UserRole;
}
