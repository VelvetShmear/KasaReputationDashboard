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

    // Try to find a match by name
    const nameLower = hotelName.toLowerCase();
    const matched = results.find((r: Record<string, unknown>) => {
      const rName = (r.name as string || '').toLowerCase();
      return rName.includes(nameLower) || nameLower.includes(rName);
    });

    const best = matched || results[0];
    if (!best) return null;

    return {
      id: String(best.id || best.listing_id || ''),
      name: best.name as string,
      city: best.city as string,
      rating: best.rating as number || best.avgRating as number || null,
      reviewsCount: best.reviewsCount as number || best.reviews_count as number || null,
      url: best.url as string || (best.id ? `https://www.airbnb.com/rooms/${best.id}` : null),
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
      result.error = 'Property not found on Airbnb. Note: Many hotels do not list on Airbnb.';
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
