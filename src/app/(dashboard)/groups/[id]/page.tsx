'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { Group, HotelWithScores, ChannelScores, Channel, ReviewTheme } from '@/lib/types';
import {
  calculateWeightedAverage,
  formatScore,
  formatReviewCount,
  getScoreColor,
  getScoreBgColor,
  CHANNEL_LABELS,
} from '@/lib/scoring';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ScoreBadge } from '@/components/score-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft,
  RefreshCw,
  Star,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [group, setGroup] = useState<Group | null>(null);
  const [hotels, setHotels] = useState<HotelWithScores[]>([]);
  const [themes, setThemes] = useState<ReviewTheme | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingReviews, setFetchingReviews] = useState(false);
  const [generatingThemes, setGeneratingThemes] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    loadGroupData();
  }, [id]);

  async function loadGroupData() {
    const { data: groupData } = await supabase
      .from('groups')
      .select('*')
      .eq('id', id)
      .single();

    if (!groupData) {
      setLoading(false);
      return;
    }
    setGroup(groupData);

    const { data: memberLinks } = await supabase
      .from('group_hotels')
      .select('hotel_id')
      .eq('group_id', id);

    const hotelIds = (memberLinks || []).map((m) => m.hotel_id);

    if (hotelIds.length === 0) {
      setHotels([]);
      setLoading(false);
      return;
    }

    const { data: hotelsData } = await supabase
      .from('hotels')
      .select('*')
      .in('id', hotelIds)
      .order('name');

    const { data: snapshots } = await supabase
      .from('review_snapshots')
      .select('*')
      .in('hotel_id', hotelIds)
      .order('fetched_at', { ascending: false });

    const hotelsWithScores: HotelWithScores[] = (hotelsData || []).map((hotel) => {
      const hotelSnapshots = (snapshots || []).filter((s) => s.hotel_id === hotel.id);
      const scores: ChannelScores = { google: null, tripadvisor: null, expedia: null, booking: null, airbnb: null };

      const channels: Channel[] = ['google', 'tripadvisor', 'expedia', 'booking', 'airbnb'];
      for (const ch of channels) {
        const latest = hotelSnapshots.find((s) => s.channel === ch);
        if (latest) {
          scores[ch] = {
            average_score: latest.average_score,
            normalized_score: latest.normalized_score,
            total_reviews: latest.total_reviews,
            fetched_at: latest.fetched_at,
          };
        }
      }

      return { ...hotel, scores, weighted_average: calculateWeightedAverage(scores) };
    });

    setHotels(hotelsWithScores);

    // Load themes
    const { data: themesData } = await supabase
      .from('review_themes')
      .select('*')
      .eq('group_id', id)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();

    if (themesData) setThemes(themesData);

    setLoading(false);
  }

  async function handleFetchReviews() {
    setFetchingReviews(true);
    try {
      const batchSize = 5;
      for (let i = 0; i < hotels.length; i += batchSize) {
        const batch = hotels.slice(i, i + batchSize);
        await Promise.allSettled(
          batch.map((hotel) =>
            fetch('/api/reviews', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ hotel_id: hotel.id, force: true }),
            })
          )
        );
        if (i + batchSize < hotels.length) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      toast.success('Reviews refreshed');
      loadGroupData();
    } catch {
      toast.error('Error fetching reviews');
    } finally {
      setFetchingReviews(false);
    }
  }

  async function handleGenerateThemes() {
    setGeneratingThemes(true);
    try {
      const res = await fetch('/api/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: id }),
      });
      if (res.ok) {
        toast.success('Theme analysis generated');
        loadGroupData();
      } else {
        toast.error('Failed to generate themes');
      }
    } catch {
      toast.error('Failed to generate themes');
    } finally {
      setGeneratingThemes(false);
    }
  }

  async function handleExport() {
    window.open(`/api/export?group_id=${id}`, '_blank');
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Group not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/groups')}>
          Back to Groups
        </Button>
      </div>
    );
  }

  const hotelsWithAvg = hotels.filter((h) => h.weighted_average !== null);
  const groupAvg =
    hotelsWithAvg.length > 0
      ? hotelsWithAvg.reduce((sum, h) => sum + (h.weighted_average || 0), 0) / hotelsWithAvg.length
      : null;

  // Chart data for comparing hotels in the group
  const chartData = hotels.map((hotel) => ({
    name: hotel.name.length > 20 ? hotel.name.substring(0, 20) + '...' : hotel.name,
    Google: hotel.scores.google?.normalized_score || 0,
    TripAdvisor: hotel.scores.tripadvisor?.normalized_score || 0,
    Expedia: hotel.scores.expedia?.normalized_score || 0,
    'Booking.com': hotel.scores.booking?.normalized_score || 0,
    Airbnb: hotel.scores.airbnb?.normalized_score || 0,
  }));

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/groups')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{group.name}</h1>
              <p className="text-muted-foreground">{hotels.length} hotels</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={handleFetchReviews} disabled={fetchingReviews}>
              <RefreshCw className={`h-4 w-4 mr-2 ${fetchingReviews ? 'animate-spin' : ''}`} />
              Refresh Reviews
            </Button>
            <Button variant="outline" onClick={handleGenerateThemes} disabled={generatingThemes}>
              <Sparkles className={`h-4 w-4 mr-2 ${generatingThemes ? 'animate-spin' : ''}`} />
              AI Analysis
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Group Summary */}
        <Card className={`border ${getScoreBgColor(groupAvg)}`}>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Group Average Score</p>
              <p className={`text-4xl font-bold ${getScoreColor(groupAvg)}`}>
                {formatScore(groupAvg)} <span className="text-lg text-muted-foreground font-normal">/ 10</span>
              </p>
            </div>
            <Star className={`h-12 w-12 ${getScoreColor(groupAvg)} opacity-20`} />
          </CardContent>
        </Card>

        {/* Comparison Chart */}
        {chartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Score Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 10]} />
                    <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Google" fill="#4285F4" />
                    <Bar dataKey="TripAdvisor" fill="#00af87" />
                    <Bar dataKey="Expedia" fill="#ffc72c" />
                    <Bar dataKey="Booking.com" fill="#003580" />
                    <Bar dataKey="Airbnb" fill="#FF5A5F" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Hotels Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hotels in Group</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hotel Name</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead className="text-center">Google</TableHead>
                  <TableHead className="text-center">TripAdvisor</TableHead>
                  <TableHead className="text-center">Expedia</TableHead>
                  <TableHead className="text-center">Booking</TableHead>
                  <TableHead className="text-center">Airbnb</TableHead>
                  <TableHead className="text-center">Weighted Avg</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hotels.map((hotel) => (
                  <TableRow
                    key={hotel.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/hotels/${hotel.id}`)}
                  >
                    <TableCell className="font-medium">{hotel.name}</TableCell>
                    <TableCell className="text-muted-foreground">{hotel.city || '—'}</TableCell>
                    <TableCell><ScoreBadge channel="google" score={hotel.scores.google} /></TableCell>
                    <TableCell><ScoreBadge channel="tripadvisor" score={hotel.scores.tripadvisor} /></TableCell>
                    <TableCell><ScoreBadge channel="expedia" score={hotel.scores.expedia} /></TableCell>
                    <TableCell><ScoreBadge channel="booking" score={hotel.scores.booking} /></TableCell>
                    <TableCell><ScoreBadge channel="airbnb" score={hotel.scores.airbnb} /></TableCell>
                    <TableCell>
                      <div className={`text-center font-bold ${getScoreColor(hotel.weighted_average)}`}>
                        {formatScore(hotel.weighted_average)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* AI Themes */}
        {themes && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ThumbsUp className="h-4 w-4 text-emerald-500" />
                  Positive Themes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(themes.positive_themes || []).map((theme, i) => (
                    <div key={i} className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-emerald-800">{theme.theme}</span>
                        <Badge variant="secondary" className="text-xs">{theme.mention_count} mentions</Badge>
                      </div>
                      <p className="text-sm text-emerald-700 mt-1">{theme.summary}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ThumbsDown className="h-4 w-4 text-red-500" />
                  Negative Themes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(themes.negative_themes || []).map((theme, i) => (
                    <div key={i} className="p-3 bg-red-50 rounded-lg border border-red-100">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-red-800">{theme.theme}</span>
                        <Badge variant="secondary" className="text-xs">{theme.mention_count} mentions</Badge>
                      </div>
                      <p className="text-sm text-red-700 mt-1">{theme.summary}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
