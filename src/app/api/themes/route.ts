import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { hotel_id, group_id } = body;

    if (!hotel_id && !group_id) {
      return NextResponse.json({ error: 'hotel_id or group_id is required' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
    }

    // Gather review text from raw_response data
    let hotelIds: string[] = [];
    let hotelNames: string[] = [];

    if (hotel_id) {
      const { data: hotel } = await supabase
        .from('hotels')
        .select('id, name')
        .eq('id', hotel_id)
        .eq('user_id', user.id)
        .single();

      if (!hotel) {
        return NextResponse.json({ error: 'Hotel not found' }, { status: 404 });
      }
      hotelIds = [hotel.id];
      hotelNames = [hotel.name];
    } else if (group_id) {
      const { data: groupHotels } = await supabase
        .from('group_hotels')
        .select('hotel_id, hotels(name)')
        .eq('group_id', group_id);

      if (!groupHotels || groupHotels.length === 0) {
        return NextResponse.json({ error: 'No hotels in group' }, { status: 400 });
      }

      hotelIds = groupHotels.map((gh) => gh.hotel_id);
      hotelNames = groupHotels.map((gh) => {
        const h = gh.hotels as unknown as { name: string } | null;
        return h?.name || 'Unknown';
      });
    }

    // Get review snapshots with raw responses that may contain review text
    const { data: snapshots } = await supabase
      .from('review_snapshots')
      .select('*')
      .in('hotel_id', hotelIds)
      .not('raw_response', 'is', null)
      .order('fetched_at', { ascending: false });

    // Extract any review text from raw responses
    let reviewTexts: string[] = [];

    if (snapshots) {
      for (const snap of snapshots) {
        const raw = snap.raw_response as Record<string, unknown>;
        if (!raw) continue;

        // Google reviews
        const details = raw.details as Record<string, unknown> | undefined;
        if (details?.reviews && Array.isArray(details.reviews)) {
          for (const review of details.reviews) {
            if (review.text) {
              reviewTexts.push(`[${snap.channel}] ${review.text}`);
            }
          }
        }

        // Try extracting from various structures
        const rawData = raw.data as Record<string, unknown> | undefined;
        const reviewData = raw.reviews || rawData?.reviews;
        if (Array.isArray(reviewData)) {
          for (const review of reviewData) {
            const text = review.text || review.comment || review.review || review.title;
            if (text) {
              reviewTexts.push(`[${snap.channel}] ${text}`);
            }
          }
        }
      }
    }

    // If we don't have individual reviews, create a summary prompt from scores
    let prompt: string;

    if (reviewTexts.length > 0) {
      // Limit to 50 reviews to stay within token limits
      const limitedReviews = reviewTexts.slice(0, 50);
      prompt = `Analyze the following hotel reviews for ${hotelNames.join(', ')} and extract:
1. Top 5 positive themes (with brief summary and approximate mention frequency)
2. Top 5 negative themes (same format)

Reviews:
${limitedReviews.join('\n\n')}

Respond in JSON format:
{
  "positive_themes": [{"theme": "...", "summary": "...", "mention_count": N}],
  "negative_themes": [{"theme": "...", "summary": "...", "mention_count": N}]
}`;
    } else {
      // Generate insights based on available score data
      const scoreInfo = snapshots?.map((s) => ({
        hotel: hotelNames[hotelIds.indexOf(s.hotel_id)] || 'Unknown',
        channel: s.channel,
        score: s.normalized_score,
        reviews: s.total_reviews,
      }));

      prompt = `Based on the following hotel review scores and your general knowledge of hospitality industry trends, generate likely review themes for ${hotelNames.join(', ')}:

Score Data:
${JSON.stringify(scoreInfo, null, 2)}

Generate plausible positive and negative themes that would be common for hotels with these scores. Mark these as "inferred" themes.

Respond in JSON format:
{
  "positive_themes": [{"theme": "...", "summary": "...", "mention_count": N}],
  "negative_themes": [{"theme": "...", "summary": "...", "mention_count": N}]
}`;
    }

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    // Parse the response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    const themesData = JSON.parse(jsonMatch[0]);

    // Store in database
    const { error: insertError } = await supabase.from('review_themes').insert({
      hotel_id: hotel_id || null,
      group_id: group_id || null,
      positive_themes: themesData.positive_themes || [],
      negative_themes: themesData.negative_themes || [],
      model_used: 'claude-sonnet-4-5-20250929',
    });

    if (insertError) {
      console.error('Error storing themes:', insertError);
    }

    return NextResponse.json({
      positive_themes: themesData.positive_themes,
      negative_themes: themesData.negative_themes,
      model_used: 'claude-sonnet-4-5-20250929',
      review_count: reviewTexts.length,
    });
  } catch (error) {
    console.error('Themes API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
