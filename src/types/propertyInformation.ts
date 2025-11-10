export interface PropertyInformation {
  id: number;
  accommodation_type: string | null;
  property_type: string | null;
  bedrooms_number: number | null;
  bathrooms_number: number | null;
  parking: string | null;
  accessibility_features: string | null;
  number_of_people_living: number | null;
  room_name: string | null;
  room_type: string | null;
  room_furnishings: string | null;
  bathroom: string | null;
  bed_size: string | null;
  room_furnishings_features: string | null;
  weekly_rent: number | null;
  bills_included: string | null;
  suburb: string | null;
  room_available_date: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
}
