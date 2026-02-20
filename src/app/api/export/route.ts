import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { Channel, ChannelScores } from '@/lib/types';
import { calculateWeightedAverage, CHANNEL_LABELS } from '@/lib/scoring';
import * as XLSX from 'xlsx';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('group_id');
    const format = searchParams.get('format') || 'csv'; // 'csv' or 'xlsx'

    // Get hotels
    const hotelQuery = supabase.from('hotels').select('*').eq('user_id', user.id).order('name');

    const { data: hotels } = await hotelQuery;
    if (!hotels || hotels.length === 0) {
      return new NextResponse('No data to export', { status: 404 });
    }

    let filteredHotelIds = hotels.map((h) => h.id);

    // Filter by group if specified
    if (groupId) {
      const { data: groupHotelsData } = await supabase
        .from('group_hotels')
        .select('hotel_id')
        .eq('group_id', groupId);

      if (groupHotelsData) {
        filteredHotelIds = groupHotelsData.map((gh) => gh.hotel_id);
      }
    }

    // Get latest snapshots
    const { data: snapshots } = await supabase
      .from('review_snapshots')
      .select('*')
      .in('hotel_id', filteredHotelIds)
      .order('fetched_at', { ascending: false });

    // Get group memberships
    const { data: groupHotels } = await supabase
      .from('group_hotels')
      .select('hotel_id, groups(name)')
      .in('hotel_id', filteredHotelIds);

    // Build data — extended columns matching Kasa format
    const headers = [
      '#',
      'Hotel Name',
      'City',
      'State',
      'Hotel Type',
      'Keys',
      'Google Score (Raw)',
      'Google Score (0-10)',
      '# Google Reviews',
      'TripAdvisor Score (Raw)',
      'TripAdvisor Score (0-10)',
      '# TripAdvisor Reviews',
      'Booking Score',
      '# Booking Reviews',
      'Expedia Score',
      '# Expedia Reviews',
      'Airbnb Score (Raw)',
      'Airbnb Score (0-10)',
      '# Airbnb Reviews',
      'Weighted Average',
      'Group Name(s)',
      'Booking Name',
      'Expedia Name',
      'TripAdvisor Name',
    ];

    const channels: Channel[] = ['google', 'tripadvisor', 'expedia', 'booking', 'airbnb'];

    const rows = hotels
      .filter((h) => filteredHotelIds.includes(h.id))
      .map((hotel, index) => {
        const hotelSnapshots = (snapshots || []).filter((s) => s.hotel_id === hotel.id);

        const channelScores: Record<string, { average_score: number | null; normalized_score: number | null; total_reviews: number | null; fetched_at: string | null }> = {};
        // Extract resolved platform names from raw_response
        const resolvedNames: Record<string, string> = {};

        for (const ch of channels) {
          const latest = hotelSnapshots.find((s) => s.channel === ch);
          channelScores[ch] = {
            average_score: latest?.average_score ?? null,
            normalized_score: latest?.normalized_score ?? null,
            total_reviews: latest?.total_reviews ?? null,
            fetched_at: latest?.fetched_at ?? null,
          };

          // Extract resolved name from raw_response for verification
          if (latest?.raw_response) {
            const raw = latest.raw_response as Record<string, unknown>;
            const details = raw.details as Record<string, unknown> | undefined;
            resolvedNames[ch] =
              (raw.hotelName as string) ||
              (details?.name as string) ||
              (raw.listingName as string) ||
              '';
          }
        }

        const weightedAvg = calculateWeightedAverage({
          google: channelScores.google || null,
          tripadvisor: channelScores.tripadvisor || null,
          expedia: channelScores.expedia || null,
          booking: channelScores.booking || null,
          airbnb: channelScores.airbnb || null,
        } as ChannelScores);

        const groups = (groupHotels || [])
          .filter((gh) => gh.hotel_id === hotel.id)
          .map((gh) => {
            const g = gh.groups as unknown as { name: string } | null;
            return g?.name || '';
          })
          .filter(Boolean)
          .join('; ');

        return [
          (index + 1).toString(),
          hotel.name,
          hotel.city || '',
          hotel.state || '',
          hotel.hotel_type || '',
          hotel.num_keys != null ? hotel.num_keys.toString() : '',
          // Google: raw (1-5) and normalized (0-10)
          channelScores.google?.average_score?.toFixed(1) || '',
          channelScores.google?.normalized_score?.toFixed(1) || '',
          channelScores.google?.total_reviews?.toString() || '',
          // TripAdvisor: raw (1-5) and normalized (0-10)
          channelScores.tripadvisor?.average_score?.toFixed(1) || '',
          channelScores.tripadvisor?.normalized_score?.toFixed(1) || '',
          channelScores.tripadvisor?.total_reviews?.toString() || '',
          // Booking: already 0-10 scale
          channelScores.booking?.normalized_score?.toFixed(1) || '',
          channelScores.booking?.total_reviews?.toString() || '',
          // Expedia: already 0-10 scale
          channelScores.expedia?.normalized_score?.toFixed(1) || '',
          channelScores.expedia?.total_reviews?.toString() || '',
          // Airbnb: raw (1-5) and normalized (0-10)
          channelScores.airbnb?.average_score?.toFixed(1) || '',
          channelScores.airbnb?.normalized_score?.toFixed(1) || '',
          channelScores.airbnb?.total_reviews?.toString() || '',
          weightedAvg?.toFixed(2) || '',
          groups,
          // Resolved platform names for verification
          resolvedNames.booking || '',
          resolvedNames.expedia || '',
          resolvedNames.tripadvisor || '',
        ];
      });

    const dateStr = new Date().toISOString().split('T')[0];

    if (format === 'xlsx') {
      // Build Excel workbook
      const wsData = [headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Auto-size columns
      const colWidths = headers.map((h, i) => {
        const maxLen = Math.max(
          h.length,
          ...rows.map((r) => String(r[i] || '').length)
        );
        return { wch: Math.min(maxLen + 2, 40) };
      });
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Reputation Data');

      // Write to buffer
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="kasa-reputation-export-${dateStr}.xlsx"`,
        },
      });
    }

    // Default: CSV
    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => {
          const str = String(cell);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(',')
      ),
    ].join('\n');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="kasa-reputation-export-${dateStr}.csv"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
