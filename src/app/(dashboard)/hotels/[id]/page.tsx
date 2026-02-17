'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { Hotel, ReviewSnapshot, Channel, ReviewTheme } from '@/lib/types';
import {
  calculateWeightedAverage,
  formatScore,
  formatReviewCount,
  getScoreColor,
  getScoreBgColor,
  CHANNEL_LABELS,
  CHANNEL_MAX_SCORES,
} from '@/lib/scoring';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  RefreshCw,
  ExternalLink,
  Star,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const CHANNEL_COLORS: Record<Channel, string> = {
  google: '#4285F4',
  tripadvisor: '#00af87',
  expedia: '#ffc72c',
  booking: '#003580',
  airbnb: '#FF5A5F',
};

export default function HotelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [snapshots, setSnapshots] = useState<ReviewSnapshot[]>([]);
  const [themes, setThemes] = useState<ReviewTheme | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingReviews, setFetchingReviews] = useState(false);
  const [generatingThemes, setGeneratingThemes] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    loadHotelData();
  }, [id, dateFrom, dateTo]);

  async function loadHotelData() {
    const { data: hotelData } = await supabase
      .from('hotels')
      .select('*')
      .eq('id', id)
      .single();

    if (!hotelData) {
      setLoading(false);
      return;
    }

    setHotel(hotelData);

    let snapshotQuery = supabase
      .from('review_snapshots')
      .select('*')
      .eq('hotel_id', id)
      .order('fetched_at', { ascending: true });

    if (dateFrom) {
      snapshotQuery = snapshotQuery.gte('fetched_at', new Date(dateFrom).toISOString());
    }
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1);
      snapshotQuery = snapshotQuery.lt('fetched_at', endDate.toISOString());
    }

    const { data: snapshotsData } = await snapshotQuery;

    setSnapshots(snapshotsData || []);

    const { data: themesData } = await supabase
      .from('review_themes')
      .select('*')
      .eq('hotel_id', id)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();

    if (themesData) {
      setThemes(themesData);
    }

    setLoading(false);
  }

  async function handleFetchReviews() {
    setFetchingReviews(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hotel_id: id, force: true }),
      });

      if (res.ok) {
        toast.success('Reviews updated');
        loadHotelData();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to fetch reviews');
      }
    } catch {
      toast.error('Failed to fetch reviews');
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
        body: JSON.stringify({ hotel_id: id }),
      });

      if (res.ok) {
        toast.success('Theme analysis generated');
        loadHotelData();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to generate themes');
      }
    } catch {
      toast.error('Failed to generate themes');
    } finally {
      setGeneratingThemes(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!hotel) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Hotel not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/hotels')}>
          Back to Hotels
        </Button>
      </div>
    );
  }

  // Get latest scores
  const channels: Channel[] = ['google', 'tripadvisor', 'expedia', 'booking', 'airbnb'];
  const latestScores: Record<Channel, ReviewSnapshot | undefined> = {} as Record<Channel, ReviewSnapshot | undefined>;
  for (const ch of channels) {
    latestScores[ch] = [...snapshots].reverse().find((s) => s.channel === ch);
  }

  function buildChannelScore(ch: Channel) {
    const snap = latestScores[ch];
    return snap ? {
      average_score: snap.average_score,
      normalized_score: snap.normalized_score,
      total_reviews: snap.total_reviews,
      fetched_at: snap.fetched_at,
    } : null;
  }

  const scores = {
    google: buildChannelScore('google'),
    tripadvisor: buildChannelScore('tripadvisor'),
    expedia: buildChannelScore('expedia'),
    booking: buildChannelScore('booking'),
    airbnb: buildChannelScore('airbnb'),
  };

  const weightedAvg = calculateWeightedAverage(scores);

  // Build chart data from snapshots
  const chartData: Record<string, Record<string, number | string>>[] = [];
  const dateMap = new Map<string, Record<string, number | string>>();

  for (const snap of snapshots) {
    if (snap.normalized_score === null) continue;
    const dateKey = new Date(snap.fetched_at).toLocaleDateString();
    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, { date: dateKey });
    }
    dateMap.get(dateKey)![snap.channel] = snap.normalized_score;
  }

  const chartDataArr = Array.from(dateMap.values());

  // OTA links
  const links: { channel: Channel; url: string | null }[] = [
    { channel: 'google', url: hotel.google_place_id ? `https://maps.google.com/?cid=${hotel.google_place_id}` : null },
    { channel: 'tripadvisor', url: hotel.tripadvisor_url },
    { channel: 'expedia', url: hotel.expedia_url },
    { channel: 'booking', url: hotel.booking_url },
    { channel: 'airbnb', url: hotel.airbnb_url },
  ];

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.push('/hotels')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{hotel.name}</h1>
              <p className="text-muted-foreground">{hotel.city || 'Unknown city'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleFetchReviews} disabled={fetchingReviews}>
              <RefreshCw className={`h-4 w-4 mr-2 ${fetchingReviews ? 'animate-spin' : ''}`} />
              {fetchingReviews ? 'Fetching...' : 'Refresh Reviews'}
            </Button>
            <Button variant="outline" onClick={handleGenerateThemes} disabled={generatingThemes}>
              <Sparkles className={`h-4 w-4 mr-2 ${generatingThemes ? 'animate-spin' : ''}`} />
              {generatingThemes ? 'Analyzing...' : 'AI Analysis'}
            </Button>
          </div>
        </div>

        {/* Date Range Filter */}
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 p-3 bg-muted/30 rounded-lg border">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Filter by Date:
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 w-40 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 w-40 text-sm"
              />
            </div>
          </div>
          {(dateFrom || dateTo) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => { setDateFrom(''); setDateTo(''); }}
            >
              Clear dates
            </Button>
          )}
        </div>

        {/* Weighted Average */}
        <Card className={`border ${getScoreBgColor(weightedAvg)}`}>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Weighted Average Score</p>
              <p className={`text-4xl font-bold ${getScoreColor(weightedAvg)}`}>
                {formatScore(weightedAvg)} <span className="text-lg text-muted-foreground font-normal">/ 10</span>
              </p>
            </div>
            <Star className={`h-12 w-12 ${getScoreColor(weightedAvg)} opacity-20`} />
          </CardContent>
        </Card>

        {/* Channel Score Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {channels.map((ch) => {
            const snap = latestScores[ch];
            const link = links.find((l) => l.channel === ch);

            return (
              <Card key={ch}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center justify-between">
                    {CHANNEL_LABELS[ch]}
                    {link?.url && (
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary" />
                      </a>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {snap && snap.normalized_score !== null ? (
                    <>
                      <p className={`text-3xl font-bold ${getScoreColor(snap.normalized_score)}`}>
                        {formatScore(snap.normalized_score)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatScore(snap.average_score)} / {CHANNEL_MAX_SCORES[ch]} raw
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatReviewCount(snap.total_reviews)} reviews
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No data available</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Historical Trend Chart */}
        {chartDataArr.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Score History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartDataArr}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 10]} />
                    <Tooltip />
                    <Legend />
                    {channels.map((ch) => (
                      <Line
                        key={ch}
                        type="monotone"
                        dataKey={ch}
                        name={CHANNEL_LABELS[ch]}
                        stroke={CHANNEL_COLORS[ch]}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI Theme Analysis */}
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
                        <Badge variant="secondary" className="text-xs">
                          {theme.mention_count} mentions
                        </Badge>
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
                        <Badge variant="secondary" className="text-xs">
                          {theme.mention_count} mentions
                        </Badge>
                      </div>
                      <p className="text-sm text-red-700 mt-1">{theme.summary}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Hotel Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hotel Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">City:</span>
                <span className="ml-2 font-medium">{hotel.city || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Website:</span>
                {hotel.website_url ? (
                  <a
                    href={hotel.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-primary hover:underline"
                  >
                    Visit
                  </a>
                ) : (
                  <span className="ml-2 text-muted-foreground">—</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Google Place ID:</span>
                <span className="ml-2 font-mono text-xs">{hotel.google_place_id || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Added:</span>
                <span className="ml-2">{new Date(hotel.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
