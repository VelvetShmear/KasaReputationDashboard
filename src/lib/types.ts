export type Channel = 'google' | 'tripadvisor' | 'expedia' | 'booking' | 'airbnb';

export interface Profile {
  id: string;
  email: string;
  created_at: string;
}

export interface Hotel {
  id: string;
  user_id: string;
  name: string;
  city: string | null;
  state: string | null;
  website_url: string | null;
  google_place_id: string | null;
  google_url: string | null;
  tripadvisor_url: string | null;
  expedia_url: string | null;
  booking_url: string | null;
  airbnb_url: string | null;
  num_keys: number | null;
  hotel_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewSnapshot {
  id: string;
  hotel_id: string;
  channel: Channel;
  average_score: number | null;
  normalized_score: number | null;
  total_reviews: number | null;
  fetched_at: string;
  raw_response: Record<string, unknown> | null;
}

export interface Group {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface GroupHotel {
  group_id: string;
  hotel_id: string;
}

export interface ReviewTheme {
  id: string;
  hotel_id: string | null;
  group_id: string | null;
  positive_themes: ThemeItem[];
  negative_themes: ThemeItem[];
  generated_at: string;
  model_used: string;
}

export interface ThemeItem {
  theme: string;
  summary: string;
  mention_count: number;
}

// Aggregated view types
export interface HotelWithScores extends Hotel {
  scores: ChannelScores;
  weighted_average: number | null;
  groups?: Group[];
}

export interface ChannelScore {
  average_score: number | null;
  normalized_score: number | null;
  total_reviews: number | null;
  fetched_at: string | null;
}

export interface ChannelScores {
  google: ChannelScore | null;
  tripadvisor: ChannelScore | null;
  expedia: ChannelScore | null;
  booking: ChannelScore | null;
  airbnb: ChannelScore | null;
}

export interface GroupWithStats extends Group {
  hotel_count: number;
  weighted_average: number | null;
  hotels?: HotelWithScores[];
}

// CSV import types
export interface CSVHotelRow {
  'Hotel Name': string;
  'City'?: string;
  'Website'?: string;
  'Google URL'?: string;
  'TripAdvisor URL'?: string;
  'Expedia URL'?: string;
  'Booking URL'?: string;
  [key: string]: string | undefined;
}

// API response types
export interface FetchReviewsProgress {
  hotel_id: string;
  hotel_name: string;
  channel: Channel;
  status: 'pending' | 'fetching' | 'success' | 'error' | 'not_found';
  message?: string;
}

export interface ReviewFetchResult {
  channel: Channel;
  average_score: number | null;
  normalized_score: number | null;
  total_reviews: number | null;
  url: string | null;
  raw_response: Record<string, unknown> | null;
  confidence: 'high' | 'medium' | 'low' | null;
  error?: string;
}
