import { normalizeScore } from '../scoring';
import { ReviewFetchResult } from '../types';

const GOOGLE_PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

interface PlaceSearchResult {
  place_id: string;
  name: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
}

interface PlaceDetailsResult {
  place_id: string;
  name: string;
  rating?: number;
  user_ratings_total?: number;
  url?: string;
  reviews?: Array<{
    author_name: string;
    rating: number;
    text: string;
    time: number;
    relative_time_description: string;
  }>;
}

export async function findGooglePlace(
  hotelName: string,
  city: string | null
): Promise<{ placeId: string; confidence: 'high' | 'medium' | 'low' } | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  const query = city ? `${hotelName}, ${city}` : hotelName;
  const params = new URLSearchParams({
    input: query,
    inputtype: 'textquery',
    fields: 'place_id,name,formatted_address,rating,user_ratings_total',
    key: apiKey,
  });

  try {
    const res = await fetch(`${GOOGLE_PLACES_BASE}/findplacefromtext/json?${params}`);
    const data = await res.json();

    if (data.status !== 'OK' || !data.candidates?.length) return null;

    const candidate: PlaceSearchResult = data.candidates[0];
    const nameLower = hotelName.toLowerCase();
    const candidateLower = candidate.name.toLowerCase();

    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (candidateLower === nameLower || candidateLower.includes(nameLower) || nameLower.includes(candidateLower)) {
      confidence = 'high';
    } else if (data.candidates.length === 1) {
      confidence = 'medium';
    }

    return { placeId: candidate.place_id, confidence };
  } catch (error) {
    console.error('Google Places search error:', error);
    return null;
  }
}

export async function getGooglePlaceDetails(placeId: string): Promise<PlaceDetailsResult | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'place_id,name,rating,user_ratings_total,url,reviews',
    key: apiKey,
  });

  try {
    const res = await fetch(`${GOOGLE_PLACES_BASE}/details/json?${params}`);
    const data = await res.json();

    if (data.status !== 'OK' || !data.result) return null;
    return data.result;
  } catch (error) {
    console.error('Google Place Details error:', error);
    return null;
  }
}

export async function fetchGoogleReviews(
  hotelName: string,
  city: string | null,
  existingPlaceId: string | null
): Promise<ReviewFetchResult> {
  const result: ReviewFetchResult = {
    channel: 'google',
    average_score: null,
    normalized_score: null,
    total_reviews: null,
    url: null,
    raw_response: null,
    confidence: null,
  };

  try {
    let placeId = existingPlaceId;
    let confidence: 'high' | 'medium' | 'low' = 'high';

    if (!placeId) {
      const found = await findGooglePlace(hotelName, city);
      if (!found) {
        result.error = 'Hotel not found on Google';
        return result;
      }
      placeId = found.placeId;
      confidence = found.confidence;
    }

    const details = await getGooglePlaceDetails(placeId);
    if (!details) {
      result.error = 'Could not fetch place details';
      return result;
    }

    result.average_score = details.rating ?? null;
    result.normalized_score = details.rating != null ? normalizeScore(details.rating, 'google') : null;
    result.total_reviews = details.user_ratings_total ?? null;
    result.url = details.url ?? null;
    result.confidence = confidence;
    result.raw_response = { placeId, details };

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
}
