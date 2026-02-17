import { normalizeScore } from '../scoring';
import { ReviewFetchResult } from '../types';

// Using "Travel Advisor" API by APIDojo on RapidAPI
// https://rapidapi.com/apidojo/api/travel-advisor
const TRIPADVISOR_API_HOST = 'travel-advisor.p.rapidapi.com';

async function rapidApiFetch(url: string): Promise<Response> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) throw new Error('RAPIDAPI_KEY not configured');

  return fetch(url, {
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': TRIPADVISOR_API_HOST,
    },
  });
}

interface AutoCompleteResult {
  documentId?: string;
  detailsV2?: {
    locationId?: number;
    placeType?: string;
    names?: {
      name?: string;
      longOnlyHierarchyTypeaheadV2?: string;
    };
    route?: { url?: string } | null;
  };
}

export async function searchTripAdvisor(
  hotelName: string,
  city: string | null
): Promise<{ locationId: string; confidence: 'high' | 'medium' | 'low' } | null> {
  const query = city ? `${hotelName} ${city}` : hotelName;
  const params = new URLSearchParams({
    query,
    lang: 'en_US',
    units: 'mi',
  });

  try {
    const res = await rapidApiFetch(
      `https://${TRIPADVISOR_API_HOST}/locations/v2/auto-complete?${params}`
    );

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.error('TripAdvisor search returned non-JSON response:', res.status);
      return null;
    }

    const data = await res.json();

    // Response structure: data.data.Typeahead_autocomplete.results[]
    const results: AutoCompleteResult[] =
      data?.data?.Typeahead_autocomplete?.results || [];

    if (results.length === 0) return null;

    // Look for ACCOMMODATION type results
    const hotelResults = results.filter(
      (r) => r.detailsV2?.placeType === 'ACCOMMODATION'
    );

    const searchResults = hotelResults.length > 0 ? hotelResults : results;
    const first = searchResults[0];

    // Extract location ID
    const locationId = first.detailsV2?.locationId?.toString() ||
      first.documentId?.replace('loc;', '');
    if (!locationId) return null;

    const nameLower = hotelName.toLowerCase();
    const resultName = (first.detailsV2?.names?.name || '').toLowerCase();

    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (resultName.includes(nameLower) || nameLower.includes(resultName)) {
      confidence = 'high';
    } else if (searchResults.length <= 3) {
      confidence = 'medium';
    }

    return { locationId, confidence };
  } catch (error) {
    console.error('TripAdvisor search error:', error);
    return null;
  }
}

export async function getTripAdvisorReviewsData(locationId: string) {
  try {
    // Use reviews/list endpoint - this actually works and returns ratings
    const params = new URLSearchParams({
      location_id: locationId,
      limit: '25',
      currency: 'USD',
      lang: 'en_US',
    });

    const res = await rapidApiFetch(
      `https://${TRIPADVISOR_API_HOST}/reviews/list?${params}`
    );

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.error('TripAdvisor reviews returned non-JSON response:', res.status);
      return null;
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error('TripAdvisor reviews error:', error);
    return null;
  }
}

export async function fetchTripAdvisorReviews(
  hotelName: string,
  city: string | null
): Promise<ReviewFetchResult> {
  const result: ReviewFetchResult = {
    channel: 'tripadvisor',
    average_score: null,
    normalized_score: null,
    total_reviews: null,
    url: null,
    raw_response: null,
    confidence: null,
  };

  try {
    const found = await searchTripAdvisor(hotelName, city);
    if (!found) {
      result.error = 'Hotel not found on TripAdvisor';
      return result;
    }

    const reviewsData = await getTripAdvisorReviewsData(found.locationId);
    if (!reviewsData) {
      result.error = 'Could not fetch TripAdvisor reviews';
      return result;
    }

    const reviews: Array<{ rating?: string; url?: string }> = reviewsData.data || [];
    const totalResults = parseInt(reviewsData.paging?.total_results || '0', 10);

    if (reviews.length === 0) {
      result.error = 'No reviews found on TripAdvisor';
      result.raw_response = { locationId: found.locationId, reviewsData };
      return result;
    }

    // Calculate average rating from the returned reviews (1-5 scale)
    const ratings = reviews
      .filter((r) => r.rating)
      .map((r) => parseFloat(r.rating!));

    if (ratings.length === 0) {
      result.error = 'No rating data in TripAdvisor reviews';
      result.raw_response = { locationId: found.locationId, reviewsData };
      return result;
    }

    const averageRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;

    // Extract URL from first review
    const firstReviewUrl = reviews[0]?.url || '';
    // Convert review URL to hotel page URL
    const hotelUrl = firstReviewUrl
      ? firstReviewUrl.replace(/ShowUserReviews.*?-Reviews-/, 'Hotel_Review-').replace(/#.*$/, '')
      : `https://www.tripadvisor.com/Hotel_Review-d${found.locationId}`;

    result.average_score = Math.round(averageRating * 100) / 100;
    result.normalized_score = normalizeScore(averageRating, 'tripadvisor');
    result.total_reviews = totalResults || ratings.length;
    result.url = hotelUrl;
    result.confidence = found.confidence;
    result.raw_response = {
      locationId: found.locationId,
      reviews: reviews.slice(0, 5), // Store a few sample reviews
      totalResults,
      calculatedAverage: averageRating,
    };

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
}
