import { normalizeScore } from '../scoring';
import { ReviewFetchResult } from '../types';

const BOOKING_API_HOST = 'booking-com15.p.rapidapi.com';

async function rapidApiFetch(url: string): Promise<Response> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) throw new Error('RAPIDAPI_KEY not configured');

  return fetch(url, {
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': BOOKING_API_HOST,
    },
  });
}

export async function searchBooking(
  hotelName: string,
  city: string | null
): Promise<{ hotelId: string; reviewCount: number; confidence: 'high' | 'medium' | 'low'; data: Record<string, unknown> } | null> {
  const query = city ? `${hotelName}, ${city}` : hotelName;
  const params = new URLSearchParams({
    query,
    languagecode: 'en-us',
  });

  try {
    const res = await rapidApiFetch(
      `https://${BOOKING_API_HOST}/api/v1/hotels/searchDestination?${params}`
    );

    // Handle rate limiting or non-JSON responses
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.error('Booking.com search returned non-JSON response:', res.status);
      return null;
    }

    const data = await res.json();

    const results = data.data || data;
    if (!Array.isArray(results) || results.length === 0) return null;

    // Find hotel type results (search_type "hotel" or type "ho")
    const hotelResults = results.filter(
      (r: Record<string, unknown>) =>
        r.search_type === 'hotel' || r.dest_type === 'hotel' || r.type === 'ho'
    );

    const first = hotelResults.length > 0 ? hotelResults[0] : results[0];
    const hotelId = first.dest_id?.toString() || first.hotel_id?.toString() || first.id?.toString();
    if (!hotelId) return null;

    const nameLower = hotelName.toLowerCase();
    const resultName = (first.name || first.label || '').toLowerCase();

    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (resultName.includes(nameLower) || nameLower.includes(resultName)) {
      confidence = 'high';
    } else if (results.length <= 3) {
      confidence = 'medium';
    }

    return { hotelId, reviewCount: 0, confidence, data: first };
  } catch (error) {
    console.error('Booking.com search error:', error);
    return null;
  }
}

export async function getBookingReviews(hotelId: string) {
  try {
    // Use getHotelReviews endpoint — it returns individual reviews with average_score (hotel avg on 0-4 scale)
    const params = new URLSearchParams({
      hotel_id: hotelId,
      languagecode: 'en-us',
      sort_type: 'SORT_MOST_RELEVANT',
    });

    const res = await rapidApiFetch(
      `https://${BOOKING_API_HOST}/api/v1/hotels/getHotelReviews?${params}`
    );

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.error('Booking.com reviews returned non-JSON response:', res.status);
      return null;
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Booking.com reviews error:', error);
    return null;
  }
}

export async function getBookingHotelInfo(hotelId: string) {
  try {
    // getHotelDetails requires arrival_date and departure_date
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const dayAfter = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];

    const params = new URLSearchParams({
      hotel_id: hotelId,
      arrival_date: tomorrow,
      departure_date: dayAfter,
      languagecode: 'en-us',
      currency_code: 'USD',
      adults: '1',
      room_qty: '1',
    });

    const res = await rapidApiFetch(
      `https://${BOOKING_API_HOST}/api/v1/hotels/getHotelDetails?${params}`
    );

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.error('Booking.com details returned non-JSON response:', res.status);
      return null;
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Booking.com details error:', error);
    return null;
  }
}

export async function fetchBookingReviews(
  hotelName: string,
  city: string | null
): Promise<ReviewFetchResult> {
  const result: ReviewFetchResult = {
    channel: 'booking',
    average_score: null,
    normalized_score: null,
    total_reviews: null,
    url: null,
    raw_response: null,
    confidence: null,
  };

  try {
    const found = await searchBooking(hotelName, city);
    if (!found) {
      result.error = 'Hotel not found on Booking.com';
      return result;
    }

    // Strategy: get reviews (which include average_score) + hotel details (which include review_nr and url)
    const [reviewsResponse, detailsResponse] = await Promise.all([
      getBookingReviews(found.hotelId),
      getBookingHotelInfo(found.hotelId),
    ]);

    const detailsData = detailsResponse?.data || {};
    const reviewsList = reviewsResponse?.data?.result || [];

    // Get review count from details (most accurate)
    const reviewCount = detailsData.review_nr || reviewsResponse?.data?.count || 0;

    // Get average score from reviews — each review has average_score (hotel-level avg on ~0-4 scale)
    // Booking.com review scores: individual reviews have average_score representing the hotel average
    // The scale on the API returns ~0-4 but Booking.com public site shows 0-10
    // We need to extract the actual per-review scores or use the hotel-level average
    let bookingScore = 0;

    if (reviewsList.length > 0 && reviewsList[0].average_score) {
      // average_score on reviews represents the HOTEL's overall score on a 0-4 scale
      // Multiply by 2.5 to convert to 0-10 scale (Booking.com's public-facing scale)
      const rawScore = parseFloat(reviewsList[0].average_score);
      bookingScore = rawScore * 2.5; // 2.8 * 2.5 = 7.0 (matches Booking.com public display)
    }

    // Build URL
    const hotelUrl = detailsData.url
      ? `https://www.booking.com${detailsData.url.startsWith('/') ? '' : '/'}${detailsData.url}`
      : null;

    if (bookingScore > 0) {
      result.average_score = Math.round(bookingScore * 10) / 10;
      result.normalized_score = normalizeScore(bookingScore, 'booking'); // booking is 1-10 scale
      result.total_reviews = reviewCount || null;
      result.url = hotelUrl;
      result.confidence = found.confidence;
      result.raw_response = {
        hotelId: found.hotelId,
        hotelName: detailsData.hotel_name,
        reviewCount,
        bookingScore,
        rawAvgScore: reviewsList[0]?.average_score,
        sampleReviews: reviewsList.slice(0, 3),
      };
    } else {
      result.error = 'No rating data available on Booking.com';
      result.raw_response = {
        hotelId: found.hotelId,
        searchData: found.data,
        reviewCount,
      };
    }

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
    return result;
  }
}
