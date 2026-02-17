'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { HotelWithScores, ChannelScores, Channel, ReviewSnapshot } from '@/lib/types';
import { calculateWeightedAverage, formatScore, formatReviewCount, getScoreColor, CHANNEL_LABELS } from '@/lib/scoring';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Building2, Star, TrendingUp, BarChart3, Plus } from 'lucide-react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6b7280'];

export default function DashboardPage() {
  const [hotels, setHotels] = useState<HotelWithScores[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: hotelsData } = await supabase
      .from('hotels')
      .select('*')
      .eq('user_id', user.id)
      .order('name');

    if (!hotelsData) {
      setLoading(false);
      return;
    }

    const hotelIds = hotelsData.map((h) => h.id);

    // Get latest snapshot per hotel per channel
    const { data: snapshots } = await supabase
      .from('review_snapshots')
      .select('*')
      .in('hotel_id', hotelIds.length > 0 ? hotelIds : ['none'])
      .order('fetched_at', { ascending: false });

    const hotelsWithScores: HotelWithScores[] = hotelsData.map((hotel) => {
      const hotelSnapshots = (snapshots || []).filter((s) => s.hotel_id === hotel.id);
      const scores: ChannelScores = {
        google: null,
        tripadvisor: null,
        expedia: null,
        booking: null,
        airbnb: null,
      };

      const channels: Channel[] = ['google', 'tripadvisor', 'expedia', 'booking', 'airbnb'];
      for (const channel of channels) {
        const latest = hotelSnapshots.find((s) => s.channel === channel);
        if (latest) {
          scores[channel] = {
            average_score: latest.average_score,
            normalized_score: latest.normalized_score,
            total_reviews: latest.total_reviews,
            fetched_at: latest.fetched_at,
          };
        }
      }

      return {
        ...hotel,
        scores,
        weighted_average: calculateWeightedAverage(scores),
      };
    });

    setHotels(hotelsWithScores);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const totalHotels = hotels.length;
  const hotelsWithData = hotels.filter((h) => h.weighted_average !== null);
  const avgScore =
    hotelsWithData.length > 0
      ? hotelsWithData.reduce((sum, h) => sum + (h.weighted_average || 0), 0) / hotelsWithData.length
      : null;

  const scoreDistribution = [
    { name: 'Excellent (8+)', value: hotels.filter((h) => h.weighted_average !== null && h.weighted_average >= 8).length, color: '#10b981' },
    { name: 'Good (6-8)', value: hotels.filter((h) => h.weighted_average !== null && h.weighted_average >= 6 && h.weighted_average < 8).length, color: '#f59e0b' },
    { name: 'Needs Work (<6)', value: hotels.filter((h) => h.weighted_average !== null && h.weighted_average < 6).length, color: '#ef4444' },
    { name: 'No Data', value: hotels.filter((h) => h.weighted_average === null).length, color: '#6b7280' },
  ].filter((d) => d.value > 0);

  const channelCoverage = (['google', 'tripadvisor', 'expedia', 'booking', 'airbnb'] as Channel[]).map((channel) => ({
    name: CHANNEL_LABELS[channel],
    hotels: hotels.filter((h) => h.scores[channel]?.normalized_score != null).length,
    avgScore:
      hotels.filter((h) => h.scores[channel]?.normalized_score != null).length > 0
        ? hotels
            .filter((h) => h.scores[channel]?.normalized_score != null)
            .reduce((sum, h) => sum + (h.scores[channel]?.normalized_score || 0), 0) /
          hotels.filter((h) => h.scores[channel]?.normalized_score != null).length
        : 0,
  }));

  const topHotels = [...hotelsWithData]
    .sort((a, b) => (b.weighted_average || 0) - (a.weighted_average || 0))
    .slice(0, 10);

  const totalReviews = hotels.reduce((sum, h) => {
    const channels: Channel[] = ['google', 'tripadvisor', 'expedia', 'booking', 'airbnb'];
    return sum + channels.reduce((cSum, c) => cSum + (h.scores[c]?.total_reviews || 0), 0);
  }, 0);

  if (totalHotels === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Card className="p-12">
          <div className="text-center space-y-4">
            <Building2 className="h-16 w-16 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">No hotels yet</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Upload a CSV or add hotels manually to get started with reputation monitoring.
            </p>
            <Link href="/hotels">
              <Button className="mt-2">
                <Plus className="h-4 w-4 mr-2" />
                Add Hotels
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Hotels</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalHotels}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {hotelsWithData.length} with review data
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Weighted Score</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${getScoreColor(avgScore)}`}>
              {formatScore(avgScore)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Out of 10.0</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Reviews</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalReviews.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Across all channels</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Best Performer</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold truncate">
              {topHotels[0]?.name || '—'}
            </div>
            <p className={`text-sm font-medium mt-1 ${getScoreColor(topHotels[0]?.weighted_average ?? null)}`}>
              {formatScore(topHotels[0]?.weighted_average ?? null)} / 10
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={scoreDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {scoreDistribution.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Channel Coverage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reviews by Channel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={channelCoverage}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="hotels" fill="#6366f1" name="Hotels with Data" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Hotels Table */}
      {topHotels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Performing Hotels</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topHotels.map((hotel, index) => (
                <div
                  key={hotel.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-muted-foreground w-6">
                      #{index + 1}
                    </span>
                    <div>
                      <p className="font-medium">{hotel.name}</p>
                      <p className="text-sm text-muted-foreground">{hotel.city || 'Unknown city'}</p>
                    </div>
                  </div>
                  <div className={`text-lg font-bold ${getScoreColor(hotel.weighted_average)}`}>
                    {formatScore(hotel.weighted_average)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
