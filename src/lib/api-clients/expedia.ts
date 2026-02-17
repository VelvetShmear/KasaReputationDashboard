import { ReviewFetchResult } from '../types';

/**
 * Expedia / Hotels.com review data via the hotels-com-provider RapidAPI.
 *
 * Flow:
 *   1. Search: GET /v2/regions?query=...&domain=US  → hotelId
 *   2. Reviews Summary: GET /v2/hotels/reviews/summary?hotel_id=...  → averageOverallRating (0-10), totalCount
 *
 * The reviews/summary endpoint returns the score already on a 0-10 scale,
 * so we store it directly as both average_score AND normalized_score
 * (no multiplication needed — Expedia/Hotels.com uses a 10-point scale).
 */

const HOTELS_API_HOST = 'hotels-com-provider.p.rapidapi.com';

async function rapidApiFetch(url: string): Promise<Response> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) throw new Error('RAPIDAPI_KEY not configured');

  return fetch(url, {
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': HOTELS_API_HOST,
    },
  });
}

// ---------- Types ----------

interface RegionResult {
  '@type'?: string;
  type?: string;
  hotelId?: string;
  gaiaId?: string;
  regionId?: string;
  regionNames?: {
    fullName?: string;
    shortName?: string;
    displayName?: string;
    primaryDisplayName?: string;
  };
  coordinates?: { lat?: string; long?: string };
  hotelAddress?: { street?: string; city?: string; province?: string };
}

interface ReviewSummaryResponse {
  __typename?: string;
  averageOverallRating?: { raw?: number };
  totalCount?: { raw?: number };
  cleanliness?: { raw?: number };
  hotelCondition?: { raw?: number };
  roomComfort?: { raw?: number };
  serviceAndStaff?: { raw?: number };
  propertyId?: string;
  reviewDisclaimer?: string;
}

// ---------- Search ----------

export async function searchExpedia(
  hotelName: string,
  city: string | null
): Promise<{ hotelId: string; confidence: 'high' | 'medium' | 'low'; data: RegionResult } | null> {
  const query = city ? `${hotelName}, ${city}` : hotelName;
  const params = new URLSearchParams({
    query,
    locale: 'en_US',
    currency: 'USD',
    domain: 'US',
  });

  try {
    const res = await rapidApiFetch(
      `https://${HOTELS_API_HOST}/v2/regions?${params}`
    );

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.error('Expedia search returned non-JSON response:', res.status);
      return null;
    }

    const data = await res.json();

    const results: RegionResult[] = data.data || [];
    if (!Array.isArray(results) || results.length === 0) return null;

    // Look for hotel-type results (gaiaHotelResult)
    const hotelResults = results.filter(
      (r) => r['@type'] === 'gaiaHotelResult' || r.type === 'HOTEL'
    );

    const first = hotelResults.length > 0 ? hotelResults[0] : results[0];
    const hotelId =
      first.hotelId?.toString() ||
      first.gaiaId?.toString() ||
      first.regionId?.toString();
    if (!hotelId) return null;

    // Confidence scoring
    const nameLower = hotelName.toLowerCase();
    const resultName = (
      first.regionNames?.primaryDisplayName ||
      first.regionNames?.shortName ||
      first.regionNames?.fullName ||
      ''
    ).toLowerCase();

    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (resultName.includes(nameLower) || nameLower.includes(resultName)) {
      confidence = 'high';
    } else if (hotelResults.length > 0 && results.length <= 5) {
      confidence = 'medium';
    }

    return { hotelId, confidence, data: first };
  } catch (error) {
    console.error('Expedia/Hotels.com search error:', error);
    return null;
  }
}

// ---------- Reviews Summary ----------

async function getExpediaReviewsSummary(
  hotelId: string
): Promise<ReviewSummaryResponse | null> {
  const params = new URLSearchParams({
    hotel_id: hotelId,
    locale: 'en_US',
    domain: 'US',
    currency: 'USD',
  });

  try {
    const res = await rapidApiFetch(
      `https://${HOTELS_API_HOST}/v2/hotels/reviews/summary?${params}`
    );

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.error('Expedia reviews summary returned non-JSON:', res.status);
      return null;
    }

    const data = await res.json();

    // Response is an array with one element
    if (Array.isArray(data) && data.length > 0) {
      return data[0] as ReviewSummaryResponse;
    }

    // Or might be a direct object
    if (data?.averageOverallRating) {
      return data as ReviewSummaryResponse;
    }

    return null;
  } catch (error) {
    console.error('Expedia reviews summary error:', error);
    return null;
  }
}

// ---------- Main Fetch ----------

export async function fetchExpediaReviews(
  hotelName: string,
  city: string | null
): Promise<ReviewFetchResult> {
  const result: ReviewFetchResult = {
    channel: 'expedia',
    average_score: null,
    normalized_score: null,
    total_reviews: null,
    url: null,
    raw_response: null,
    confidence: null,
  };

  try {
    // Step 1: Search for the hotel
    const found = await searchExpedia(hotelName, city);
    if (!found) {
      result.error = 'Hotel not found on Expedia/Hotels.com';
      return result;
    }

    result.confidence = found.confidence;

    // Build Expedia URL
    const expediaUrl = `https://www.hotels.com/ho${found.hotelId}`;
    result.url = expediaUrl;

    // Step 2: Get review summary (score + count)
    const summary = await getExpediaReviewsSummary(found.hotelId);

    if (!summary || summary.averageOverallRating?.raw == null) {
      result.error = 'Could not fetch Expedia review summary';
      result.raw_response = {
        hotelId: found.hotelId,
        hotelName: found.data.regionNames?.primaryDisplayName || hotelName,
        expediaUrl,
        summaryResponse: summary,
      };
      return result;
    }

    // Score is already on a 0-10 scale from Hotels.com/Expedia
    const overallScore = summary.averageOverallRating.raw;
    const totalReviews = summary.totalCount?.raw || null;

    // Expedia/Hotels.com uses a 10-point scale natively.
    // We store it as both average_score and normalized_score since it's already 0-10.
    result.average_score = overallScore;
    result.normalized_score = overallScore;
    result.total_reviews = totalReviews;

    result.raw_response = {
      hotelId: found.hotelId,
      hotelName: found.data.regionNames?.primaryDisplayName || hotelName,
      hotelAddress: found.data.hotelAddress,
      expediaUrl,
      overallScore,
      totalReviews,
      subScores: {
        cleanliness: summary.cleanliness?.raw ?? null,
        hotelCondition: summary.hotelCondition?.raw ?? null,
        roomComfort: summary.roomComfort?.raw ?? null,
        serviceAndStaff: summary.serviceAndStaff?.raw ?? null,
      },
    };

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
}
