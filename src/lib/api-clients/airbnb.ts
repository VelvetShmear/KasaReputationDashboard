import { normalizeScore } from '../scoring';
import { ReviewFetchResult } from '../types';

/**
 * Airbnb review data via airbnb13.p.rapidapi.com (Airbnb API by apiheya).
 *
 * Flow:
 *   1. Search: GET /search-location → find listings by name + city
 *   2. Reviews: GET /reviews → get individual reviews with ratings
 *
 * Airbnb uses a 1-5 star scale for overall ratings.
 * Normalization: ×2 to get 0-10 scale.
 */

const AIRBNB_API_HOST = 'airbnb13.p.rapidapi.com';

async function rapidApiFetch(url: string): Promise<Response> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) throw new Error('RAPIDAPI_KEY not configured');

  return fetch(url, {
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': AIRBNB_API_HOST,
    },
  });
}

// ---------- Types ----------

interface AirbnbSearchResult {
  id?: string;
  listing_id?: string;
  name?: string;
  city?: string;
  rating?: number;
  reviewsCount?: number;
  url?: string;
}

// ---------- Name Matching ----------

/**
 * STRICT name matching: checks if an Airbnb listing is a plausible match for the hotel.
 * We require at least one significant word from the hotel name to appear in the
 * listing name. Common filler words are ignored.
 *
 * This is intentionally strict — it's better to show "No Airbnb data" than to
 * show a random short-term rental that has nothing to do with the hotel.
 * Most traditional hotels (Hilton, Marriott, Hyatt, etc.) are NOT on Airbnb.
 */
function isNameMatch(hotelName: string, listingName: string): boolean {
  const stopWords = new Set([
    'the', 'hotel', 'resort', 'inn', 'suites', 'suite', 'by', 'at', 'and',
    'of', 'a', 'an', 'in', 'on', 'to', 'for', 'los', 'las', 'san', 'santa',
  ]);
  const hotelWords = hotelName
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
  const listingLower = listingName.toLowerCase();

  // At least one significant hotel-name word must appear in the listing name
  const matchingWords = hotelWords.filter((w) => listingLower.includes(w));
  return matchingWords.length >= 1;
}

// ---------- Search ----------

async function searchAirbnb(
  hotelName: string,
  city: string | null
): Promise<AirbnbSearchResult | null> {
  const location = city ? `${city}` : hotelName;
  const params = new URLSearchParams({
    location,
    checkin: '',
    checkout: '',
    adults: '1',
    page: '1',
  });

  try {
    const res = await rapidApiFetch(
      `https://${AIRBNB_API_HOST}/search-location?${params}`
    );

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.error('Airbnb search returned non-JSON:', res.status);
      return null;
    }

    const data = await res.json();

    // The API returns results under data.results or similar
    const results = data?.results || data?.data || [];
    if (!Array.isArray(results) || results.length === 0) return null;

    // STRICT matching: only accept listings whose name matches the hotel name.
    // Do NOT fall back to results[0] — that would return a random Airbnb listing
    // in the area (e.g., someone's apartment) which has nothing to do with the hotel.
    const matched = results.find((r: Record<string, unknown>) => {
      const rName = (r.name as string) || '';
      return isNameMatch(hotelName, rName);
    });

    // If no name match found, return null — better to show "No Airbnb data"
    // than to show a random short-term rental
    if (!matched) return null;

    return {
      id: String(matched.id || matched.listing_id || ''),
      name: matched.name as string,
      city: matched.city as string,
      rating: (matched.rating as number) || (matched.avgRating as number) || null,
      reviewsCount: (matched.reviewsCount as number) || (matched.reviews_count as number) || null,
      url: (matched.url as string) || (matched.id ? `https://www.airbnb.com/rooms/${matched.id}` : null),
    } as AirbnbSearchResult;
  } catch (error) {
    console.error('Airbnb search error:', error);
    return null;
  }
}

// ---------- Get Reviews ----------

async function getAirbnbReviews(
  listingId: string
): Promise<{ rating: number | null; count: number | null; reviews: Array<{ text: string; rating: number; date: string }> }> {
  const params = new URLSearchParams({
    id: listingId,
    page: '1',
  });

  try {
    const res = await rapidApiFetch(
      `https://${AIRBNB_API_HOST}/reviews?${params}`
    );

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.error('Airbnb reviews returned non-JSON:', res.status);
      return { rating: null, count: null, reviews: [] };
    }

    const data = await res.json();

    // Extract overall rating and count
    const overallRating = data?.rating || data?.averageRating || data?.avg_rating || null;
    const totalCount = data?.count || data?.totalCount || data?.reviews_count || null;
    const reviewsList = data?.data || data?.reviews || [];

    const reviews = Array.isArray(reviewsList)
      ? reviewsList.slice(0, 50).map((r: Record<string, unknown>) => ({
          text: (r.comments || r.text || r.review || '') as string,
          rating: (r.rating || r.stars || 5) as number,
          date: (r.createdAt || r.created_at || r.date || '') as string,
        }))
      : [];

    // If no overall rating but we have reviews, calculate from reviews
    let rating = overallRating;
    if (!rating && reviews.length > 0) {
      const validRatings = reviews.filter((r) => r.rating > 0);
      if (validRatings.length > 0) {
        rating = validRatings.reduce((sum, r) => sum + r.rating, 0) / validRatings.length;
      }
    }

    return {
      rating: rating ? Math.round(rating * 100) / 100 : null,
      count: totalCount || reviews.length || null,
      reviews,
    };
  } catch (error) {
    console.error('Airbnb reviews error:', error);
    return { rating: null, count: null, reviews: [] };
  }
}

// ---------- Main Fetch ----------

export async function fetchAirbnbReviews(
  hotelName: string,
  city: string | null
): Promise<ReviewFetchResult> {
  const result: ReviewFetchResult = {
    channel: 'airbnb',
    average_score: null,
    normalized_score: null,
    total_reviews: null,
    url: null,
    raw_response: null,
    confidence: null,
  };

  try {
    // Step 1: Search for the listing
    const found = await searchAirbnb(hotelName, city);
    if (!found || !found.id) {
      result.error = 'No matching Airbnb listing found. Most traditional hotels do not list on Airbnb.';
      return result;
    }

    result.url = found.url || `https://www.airbnb.com/rooms/${found.id}`;

    // If the search already returned rating info, use it
    if (found.rating) {
      result.average_score = found.rating;
      result.normalized_score = normalizeScore(found.rating, 'airbnb');
      result.total_reviews = found.reviewsCount || null;
      result.confidence = 'medium';
      result.raw_response = {
        listingId: found.id,
        listingName: found.name,
        source: 'search',
        rating: found.rating,
        reviewsCount: found.reviewsCount,
      };
      return result;
    }

    // Step 2: Get reviews for more detail
    const reviewData = await getAirbnbReviews(found.id);

    if (reviewData.rating) {
      result.average_score = reviewData.rating;
      result.normalized_score = normalizeScore(reviewData.rating, 'airbnb');
      result.total_reviews = reviewData.count;
      result.confidence = 'medium';
      result.raw_response = {
        listingId: found.id,
        listingName: found.name,
        source: 'reviews',
        rating: reviewData.rating,
        reviewsCount: reviewData.count,
        sampleReviews: reviewData.reviews.slice(0, 10),
      };
    } else {
      result.error = 'Airbnb listing found but no review data available';
      result.confidence = 'low';
      result.raw_response = {
        listingId: found.id,
        listingName: found.name,
        note: 'Listing found but reviews endpoint returned no data',
      };
    }

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
}
