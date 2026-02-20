import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { fetchGoogleReviews } from '@/lib/api-clients/google-places';
import { fetchTripAdvisorReviews } from '@/lib/api-clients/tripadvisor';
import { fetchBookingReviews } from '@/lib/api-clients/booking';
import { fetchExpediaReviews } from '@/lib/api-clients/expedia';
import { fetchAirbnbReviews } from '@/lib/api-clients/airbnb';
import { Channel, ReviewFetchResult } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    // Pre-flight: check which API keys are present
    const hasGoogleKey = !!process.env.GOOGLE_PLACES_API_KEY;
    const hasRapidApiKey = !!process.env.RAPIDAPI_KEY;

    // If NO keys at all, return immediately with a helpful message
    if (!hasGoogleKey && !hasRapidApiKey) {
      return NextResponse.json({
        error: 'No API keys configured. Add GOOGLE_PLACES_API_KEY and RAPIDAPI_KEY to your .env.local file and restart the server.',
        missingKeys: ['GOOGLE_PLACES_API_KEY', 'RAPIDAPI_KEY'],
        results: [],
      }, { status: 503 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { hotel_id, force = false } = body;

    if (!hotel_id) {
      return NextResponse.json({ error: 'hotel_id is required' }, { status: 400 });
    }

    // Get hotel
    const { data: hotel, error: hotelError } = await supabase
      .from('hotels')
      .select('*')
      .eq('id', hotel_id)
      .eq('user_id', user.id)
      .single();

    if (hotelError || !hotel) {
      return NextResponse.json({ error: 'Hotel not found' }, { status: 404 });
    }

    // Check cache - skip if fetched within last 24 hours (unless force)
    if (!force) {
      const { data: recentSnapshots } = await supabase
        .from('review_snapshots')
        .select('channel, fetched_at, average_score')
        .eq('hotel_id', hotel_id)
        .not('average_score', 'is', null)
        .gte('fetched_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (recentSnapshots && recentSnapshots.length >= 3) {
        return NextResponse.json({
          message: 'Reviews were recently fetched. Use force=true to refresh.',
          cached: true,
        });
      }
    }

    // ── Build channel fetch functions ──
    const makeMissingKeyResult = (channel: Channel, keyName: string): ReviewFetchResult => ({
      channel,
      average_score: null,
      normalized_score: null,
      total_reviews: null,
      url: null,
      raw_response: null,
      confidence: null,
      error: `${keyName} not configured in .env.local`,
    });

    // Fetch Google FIRST (sequential) — we need its resolved name before the rest
    let googleResult: ReviewFetchResult;
    let resolvedName = hotel.name; // fallback to stored name

    if (!hasGoogleKey) {
      googleResult = makeMissingKeyResult('google', 'GOOGLE_PLACES_API_KEY');
    } else {
      try {
        googleResult = await fetchGoogleReviews(hotel.name, hotel.city, hotel.google_place_id);

        // Extract the full, official hotel name from Google Places
        const googleDetails = googleResult.raw_response?.details as
          | { name?: string }
          | undefined;
        if (googleDetails?.name) {
          resolvedName = googleDetails.name;
          // Persist the full name back to the database
          if (resolvedName !== hotel.name) {
            await supabase
              .from('hotels')
              .update({ name: resolvedName })
              .eq('id', hotel_id);
          }
        }
      } catch (error) {
        googleResult = {
          channel: 'google',
          average_score: null,
          normalized_score: null,
          total_reviews: null,
          url: null,
          raw_response: null,
          confidence: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    // ── Fetch remaining channels IN PARALLEL for speed ──
    const parallelFetches: { channel: Channel; promise: Promise<ReviewFetchResult> }[] = [];

    // TripAdvisor
    if (!hasRapidApiKey) {
      parallelFetches.push({ channel: 'tripadvisor', promise: Promise.resolve(makeMissingKeyResult('tripadvisor', 'RAPIDAPI_KEY')) });
    } else {
      parallelFetches.push({ channel: 'tripadvisor', promise: fetchTripAdvisorReviews(resolvedName, hotel.city).catch(e => ({
        channel: 'tripadvisor' as Channel, average_score: null, normalized_score: null, total_reviews: null,
        url: null, raw_response: null, confidence: null, error: e instanceof Error ? e.message : 'Unknown error',
      })) });
    }

    // Booking
    if (!hasRapidApiKey) {
      parallelFetches.push({ channel: 'booking', promise: Promise.resolve(makeMissingKeyResult('booking', 'RAPIDAPI_KEY')) });
    } else {
      parallelFetches.push({ channel: 'booking', promise: fetchBookingReviews(resolvedName, hotel.city).catch(e => ({
        channel: 'booking' as Channel, average_score: null, normalized_score: null, total_reviews: null,
        url: null, raw_response: null, confidence: null, error: e instanceof Error ? e.message : 'Unknown error',
      })) });
    }

    // Expedia
    if (!hasRapidApiKey) {
      parallelFetches.push({ channel: 'expedia', promise: Promise.resolve(makeMissingKeyResult('expedia', 'RAPIDAPI_KEY')) });
    } else {
      parallelFetches.push({ channel: 'expedia', promise: fetchExpediaReviews(resolvedName, hotel.city).catch(e => ({
        channel: 'expedia' as Channel, average_score: null, normalized_score: null, total_reviews: null,
        url: null, raw_response: null, confidence: null, error: e instanceof Error ? e.message : 'Unknown error',
      })) });
    }

    // Airbnb
    if (!hasRapidApiKey) {
      parallelFetches.push({ channel: 'airbnb', promise: Promise.resolve(makeMissingKeyResult('airbnb', 'RAPIDAPI_KEY')) });
    } else {
      parallelFetches.push({ channel: 'airbnb', promise: fetchAirbnbReviews(resolvedName, hotel.city).catch(e => ({
        channel: 'airbnb' as Channel, average_score: null, normalized_score: null, total_reviews: null,
        url: null, raw_response: null, confidence: null, error: e instanceof Error ? e.message : 'Unknown error',
      })) });
    }

    // Await all parallel fetches
    const parallelResults = await Promise.all(parallelFetches.map(f => f.promise));

    // Combine all results: Google first, then parallel results
    const results: ReviewFetchResult[] = [googleResult, ...parallelResults];

    // ── Save snapshots and update hotel URLs ──
    for (const result of results) {
      // Only store snapshot if we got actual data (not a config error)
      if (result.average_score !== null || !result.error?.includes('not configured')) {
        await supabase.from('review_snapshots').insert({
          hotel_id,
          channel: result.channel,
          average_score: result.average_score,
          normalized_score: result.normalized_score,
          total_reviews: result.total_reviews,
          raw_response: result.raw_response,
        });
      }

      // Update hotel with resolved IDs/URLs (always update URLs to keep them fresh)
      if (result.channel === 'google') {
        const updates: Record<string, string> = {};
        if (result.raw_response?.placeId && !hotel.google_place_id) {
          updates.google_place_id = result.raw_response.placeId as string;
        }
        // Always store the Google Maps URL from the API (most reliable link)
        if (result.url) {
          updates.google_url = result.url;
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from('hotels').update(updates).eq('id', hotel_id);
        }
      }

      if (result.channel === 'tripadvisor' && result.url) {
        await supabase
          .from('hotels')
          .update({ tripadvisor_url: result.url })
          .eq('id', hotel_id);
      }

      if (result.channel === 'booking' && result.url) {
        await supabase
          .from('hotels')
          .update({ booking_url: result.url })
          .eq('id', hotel_id);
      }

      if (result.channel === 'expedia' && result.url) {
        await supabase
          .from('hotels')
          .update({ expedia_url: result.url })
          .eq('id', hotel_id);
      }

      if (result.channel === 'airbnb' && result.url) {
        await supabase
          .from('hotels')
          .update({ airbnb_url: result.url })
          .eq('id', hotel_id);
      }
    }

    return NextResponse.json({ results, hotel_name: resolvedName });
  } catch (error) {
    console.error('Reviews API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
