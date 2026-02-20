import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

// Allow up to 60 seconds for AI analysis on Vercel
export const maxDuration = 60;

// Try multiple model IDs for compatibility
const MODEL_OPTIONS = [
  'claude-sonnet-4-5-20250929',
  'claude-3-5-sonnet-20241022',
  'claude-3-sonnet-20240229',
];

export async function POST(request: NextRequest) {
  try {
    // Auth check via cookie-based server client
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
      console.error('[themes] ANTHROPIC_API_KEY is not set');
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
    }

    // Use service role client for DB operations to bypass RLS
    const serviceClient = createServiceRoleClient();

    // Gather hotel info
    let hotelIds: string[] = [];
    let hotelNames: string[] = [];

    if (hotel_id) {
      const { data: hotel } = await serviceClient
        .from('hotels')
        .select('id, name, city')
        .eq('id', hotel_id)
        .eq('user_id', user.id)
        .single();

      if (!hotel) {
        return NextResponse.json({ error: 'Hotel not found' }, { status: 404 });
      }
      hotelIds = [hotel.id];
      hotelNames = [hotel.name + (hotel.city ? ` (${hotel.city})` : '')];
    } else if (group_id) {
      // Verify group belongs to user
      const { data: group } = await serviceClient
        .from('groups')
        .select('id')
        .eq('id', group_id)
        .eq('user_id', user.id)
        .single();

      if (!group) {
        return NextResponse.json({ error: 'Group not found' }, { status: 404 });
      }

      const { data: groupHotels } = await serviceClient
        .from('group_hotels')
        .select('hotel_id, hotels(name, city)')
        .eq('group_id', group_id);

      if (!groupHotels || groupHotels.length === 0) {
        return NextResponse.json({ error: 'No hotels in group' }, { status: 400 });
      }

      hotelIds = groupHotels.map((gh: Record<string, unknown>) => gh.hotel_id as string);
      hotelNames = groupHotels.map((gh: Record<string, unknown>) => {
        const h = gh.hotels as { name: string; city?: string } | null;
        return h ? `${h.name}${h.city ? ` (${h.city})` : ''}` : 'Unknown';
      });
    }

    // Get review snapshots with raw responses
    const { data: snapshots } = await serviceClient
      .from('review_snapshots')
      .select('*')
      .in('hotel_id', hotelIds)
      .not('raw_response', 'is', null)
      .order('fetched_at', { ascending: false });

    // Extract review text from raw API responses
    const reviewTexts: string[] = [];

    if (snapshots) {
      for (const snap of snapshots) {
        const raw = snap.raw_response as Record<string, unknown>;
        if (!raw) continue;

        // Google reviews — stored at raw.details.reviews
        const details = raw.details as Record<string, unknown> | undefined;
        if (details?.reviews && Array.isArray(details.reviews)) {
          for (const review of details.reviews) {
            if (review.text) {
              reviewTexts.push(`[Google] Rating: ${review.rating || '?'}/5 — ${review.text}`);
            }
          }
        }

        // TripAdvisor — stored at raw.reviews (sample reviews array)
        if (raw.reviews && Array.isArray(raw.reviews)) {
          for (const review of raw.reviews) {
            const text = review.text || review.title || review.review_text;
            if (text) {
              reviewTexts.push(`[TripAdvisor] Rating: ${review.rating || '?'}/5 — ${text}`);
            }
          }
        }

        // Booking.com — stored at raw.sampleReviews
        if (raw.sampleReviews && Array.isArray(raw.sampleReviews)) {
          for (const review of raw.sampleReviews) {
            const pros = review.pros || review.positive || '';
            const cons = review.cons || review.negative || '';
            if (pros) reviewTexts.push(`[Booking.com] Positive: ${pros}`);
            if (cons) reviewTexts.push(`[Booking.com] Negative: ${cons}`);
          }
        }

        // Airbnb — stored at raw.sampleReviews
        if (snap.channel === 'airbnb' && raw.sampleReviews && Array.isArray(raw.sampleReviews)) {
          for (const review of raw.sampleReviews) {
            const text = review.comments || review.text || review.review;
            if (text) {
              reviewTexts.push(`[Airbnb] ${text}`);
            }
          }
        }
      }
    }

    // Build the prompt
    let prompt: string;

    if (reviewTexts.length > 0) {
      const limitedReviews = reviewTexts.slice(0, 50);
      prompt = `You are a hospitality industry analyst. Analyze the following hotel reviews for ${hotelNames.join(', ')} and extract the most common themes.

For each theme, provide:
- A short theme name (2-4 words)
- A brief summary explaining what guests say about this topic
- An estimated mention count based on how frequently this theme appears

Reviews (${limitedReviews.length} total):
${limitedReviews.map((r, i) => `${i + 1}. ${r}`).join('\n')}

You MUST respond with ONLY valid JSON, no markdown, no code fences, no extra text:
{"positive_themes":[{"theme":"Theme Name","summary":"What guests say","mention_count":5}],"negative_themes":[{"theme":"Theme Name","summary":"What guests say","mention_count":3}]}

Return exactly 5 positive themes and 5 negative themes, ordered by mention_count descending.`;
    } else {
      // Infer themes from score data when no review text is available
      const scoreInfo = (snapshots || []).map((s: Record<string, unknown>) => ({
        hotel: hotelNames[hotelIds.indexOf(s.hotel_id as string)] || 'Unknown',
        channel: s.channel,
        score: s.normalized_score,
        reviews: s.total_reviews,
      }));

      prompt = `You are a hospitality industry analyst. Based on the following hotel review scores and your expertise in hospitality trends, generate the most likely review themes for: ${hotelNames.join(', ')}.

Score Data (normalized to 0-10 scale):
${JSON.stringify(scoreInfo, null, 2)}

Generate plausible positive and negative themes that would be typical for hotels with these rating profiles. Base your analysis on common patterns in the hospitality industry. Mark each summary with "(Inferred from scores)" at the end.

You MUST respond with ONLY valid JSON, no markdown, no code fences, no extra text:
{"positive_themes":[{"theme":"Theme Name","summary":"Likely guest sentiment (Inferred from scores)","mention_count":5}],"negative_themes":[{"theme":"Theme Name","summary":"Likely guest concern (Inferred from scores)","mention_count":3}]}

Return exactly 5 positive themes and 5 negative themes.`;
    }

    // Try each model in order until one works
    const client = new Anthropic({ apiKey });
    let message: Anthropic.Message | null = null;
    let usedModel = MODEL_OPTIONS[0];

    for (const model of MODEL_OPTIONS) {
      try {
        console.log(`[themes] Trying model: ${model}`);
        message = await client.messages.create({
          model,
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }],
        });
        usedModel = model;
        console.log(`[themes] Success with model: ${model}`);
        break;
      } catch (modelError: unknown) {
        const errMsg = modelError instanceof Error ? modelError.message : String(modelError);
        console.warn(`[themes] Model ${model} failed: ${errMsg}`);
        if (model === MODEL_OPTIONS[MODEL_OPTIONS.length - 1]) {
          throw modelError;
        }
      }
    }

    if (!message) {
      return NextResponse.json({ error: 'All AI models failed' }, { status: 500 });
    }

    // Parse the AI response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log('[themes] AI response length:', responseText.length);

    // Extract JSON — handle markdown code fences if present
    let jsonString = responseText;
    const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonString = codeBlockMatch[1].trim();
    }
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[themes] Failed to extract JSON from response:', responseText.substring(0, 500));
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    const themesData = JSON.parse(jsonMatch[0]);
    const positiveThemes = Array.isArray(themesData.positive_themes) ? themesData.positive_themes : [];
    const negativeThemes = Array.isArray(themesData.negative_themes) ? themesData.negative_themes : [];

    // Store in database using service role client
    const { error: insertError } = await serviceClient.from('review_themes').insert({
      hotel_id: hotel_id || null,
      group_id: group_id || null,
      positive_themes: positiveThemes,
      negative_themes: negativeThemes,
      model_used: usedModel,
    });

    if (insertError) {
      console.error('[themes] DB insert error:', insertError);
    }

    return NextResponse.json({
      positive_themes: positiveThemes,
      negative_themes: negativeThemes,
      model_used: usedModel,
      review_count: reviewTexts.length,
    });
  } catch (error) {
    console.error('[themes] API error:', error);
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Theme analysis failed: ${errMsg}` },
      { status: 500 }
    );
  }
}
