'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { HotelWithScores, ChannelScores, Channel } from '@/lib/types';
import { calculateWeightedAverage, formatScore, getScoreColor, CHANNEL_LABELS } from '@/lib/scoring';
import { CSVUpload } from '@/components/csv-upload';
import { HotelForm } from '@/components/hotel-form';
import { ScoreBadge } from '@/components/score-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, RefreshCw, ArrowUpDown, Hotel, Trash2, AlertTriangle, CheckCircle2, XCircle, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';

// Title Case: capitalize first letter of each word
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

type SortField = 'name' | 'city' | 'google' | 'tripadvisor' | 'expedia' | 'booking' | 'airbnb' | 'weighted_average';
type SortDir = 'asc' | 'desc';

interface ApiKeyStatus {
  configured: boolean;
  keys: { google: boolean; rapidapi: boolean; anthropic: boolean };
  missingKeys: string[];
}

export default function HotelsPage() {
  const [hotels, setHotels] = useState<HotelWithScores[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [fetchingReviews, setFetchingReviews] = useState(false);
  const [fetchProgress, setFetchProgress] = useState<string>('');
  const [fetchErrors, setFetchErrors] = useState<string[]>([]);
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const router = useRouter();
  const supabase = createClient();

  // Check API key status on mount
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setApiKeyStatus(data))
      .catch(() => {});
  }, []);

  const loadHotels = useCallback(async () => {
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

    let snapshotQuery = supabase
      .from('review_snapshots')
      .select('*')
      .in('hotel_id', hotelIds.length > 0 ? hotelIds : ['none'])
      .order('fetched_at', { ascending: false });

    // Apply date range filters
    if (dateFrom) {
      snapshotQuery = snapshotQuery.gte('fetched_at', new Date(dateFrom).toISOString());
    }
    if (dateTo) {
      // Add one day to include the end date fully
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1);
      snapshotQuery = snapshotQuery.lt('fetched_at', endDate.toISOString());
    }

    const { data: snapshots } = await snapshotQuery;

    // Get group memberships
    const { data: groupHotels } = await supabase
      .from('group_hotels')
      .select('hotel_id, group_id, groups(name)')
      .in('hotel_id', hotelIds.length > 0 ? hotelIds : ['none']);

    const hotelsWithScores: HotelWithScores[] = hotelsData.map((hotel) => {
      const hotelSnapshots = (snapshots || []).filter((s) => s.hotel_id === hotel.id);
      const scores: ChannelScores = { google: null, tripadvisor: null, expedia: null, booking: null, airbnb: null };

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
  }, [supabase, dateFrom, dateTo]);

  useEffect(() => {
    loadHotels();
  }, [loadHotels]);

  async function handleCSVImport(csvHotels: { name: string; city: string; website_url: string; tripadvisor_url: string; expedia_url: string; booking_url: string }[]) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const rows = csvHotels.map((h) => ({
      user_id: user.id,
      name: h.name ? toTitleCase(h.name) : h.name,
      city: h.city ? toTitleCase(h.city) : null,
      website_url: h.website_url || null,
      tripadvisor_url: h.tripadvisor_url || null,
      expedia_url: h.expedia_url || null,
      booking_url: h.booking_url || null,
    }));

    // Insert in batches of 50
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await supabase.from('hotels').insert(batch);
      if (error) {
        toast.error(`Error importing batch: ${error.message}`);
        return;
      }
    }

    toast.success(`Successfully imported ${rows.length} hotels`);
    loadHotels();
  }

  async function handleAddHotel(data: { name: string; city: string; website_url: string; tripadvisor_url: string; expedia_url: string; booking_url: string }) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('hotels').insert({
      user_id: user.id,
      name: data.name ? toTitleCase(data.name) : data.name,
      city: data.city ? toTitleCase(data.city) : null,
      website_url: data.website_url || null,
      tripadvisor_url: data.tripadvisor_url || null,
      expedia_url: data.expedia_url || null,
      booking_url: data.booking_url || null,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Hotel added successfully');
      loadHotels();
    }
  }

  async function handleDeleteHotel(hotelId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this hotel and all its data?')) return;

    const { error } = await supabase.from('hotels').delete().eq('id', hotelId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Hotel deleted');
      setHotels((prev) => prev.filter((h) => h.id !== hotelId));
    }
  }

  async function handleFetchAllReviews() {
    // Pre-flight check: warn if API keys are missing
    if (apiKeyStatus && !apiKeyStatus.configured) {
      const missing = apiKeyStatus.missingKeys.join(', ');
      toast.error(`Missing API keys: ${missing}. Add them to .env.local and restart the server.`);
      return;
    }

    setFetchingReviews(true);
    setFetchProgress('Starting review collection...');
    setFetchErrors([]);

    const errors: string[] = [];
    let successCount = 0;
    let errorCount = 0;

    try {
      const batchSize = 5;
      for (let i = 0; i < hotels.length; i += batchSize) {
        const batch = hotels.slice(i, i + batchSize);
        setFetchProgress(`Processing hotels ${i + 1}-${Math.min(i + batchSize, hotels.length)} of ${hotels.length}...`);

        const results = await Promise.allSettled(
          batch.map(async (hotel) => {
            const res = await fetch('/api/reviews', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ hotel_id: hotel.id, force: true }),
            });

            const data = await res.json();

            // Check for API-level errors
            if (!res.ok) {
              const errorMsg = `${hotel.name}: ${data.error || `HTTP ${res.status}`}`;
              errors.push(errorMsg);
              errorCount++;
              return;
            }

            // Check per-channel results for errors
            if (data.results) {
              const channelErrors = data.results
                .filter((r: { error?: string }) => r.error)
                .map((r: { channel: string; error: string }) => `${r.channel}: ${r.error}`);

              const channelSuccesses = data.results
                .filter((r: { average_score: number | null }) => r.average_score !== null);

              if (channelSuccesses.length > 0) {
                successCount++;
              }

              if (channelErrors.length > 0 && channelSuccesses.length === 0) {
                errors.push(`${hotel.name}: All channels failed - ${channelErrors[0]}`);
                errorCount++;
              }
            }
          })
        );

        // Small delay between batches to avoid rate limits
        if (i + batchSize < hotels.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // Show summary
      if (errors.length > 0) {
        setFetchErrors(errors);
      }

      if (successCount > 0) {
        toast.success(`Fetched reviews for ${successCount} hotel${successCount > 1 ? 's' : ''}`);
      } else if (errorCount > 0) {
        toast.error(`Review fetching failed. Check the error details below.`);
      }

      loadHotels();
    } catch (error) {
      toast.error('Error fetching reviews');
    } finally {
      setFetchingReviews(false);
      setFetchProgress('');
    }
  }

  // Sort and filter
  const cities = [...new Set(hotels.map((h) => h.city).filter(Boolean))] as string[];

  let filteredHotels = hotels.filter((h) => {
    const matchesSearch = h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (h.city || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCity = cityFilter === 'all' || h.city === cityFilter;
    return matchesSearch && matchesCity;
  });

  filteredHotels.sort((a, b) => {
    let aVal: number | string | null;
    let bVal: number | string | null;

    if (sortField === 'name') {
      aVal = a.name.toLowerCase();
      bVal = b.name.toLowerCase();
    } else if (sortField === 'city') {
      aVal = (a.city || '').toLowerCase();
      bVal = (b.city || '').toLowerCase();
    } else if (sortField === 'weighted_average') {
      aVal = a.weighted_average;
      bVal = b.weighted_average;
    } else {
      aVal = a.scores[sortField as Channel]?.normalized_score ?? null;
      bVal = b.scores[sortField as Channel]?.normalized_score ?? null;
    }

    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }

    return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer hover:bg-muted/50 select-none"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
      </div>
    </TableHead>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Hotels</h1>
        </div>
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* API Key Warning Banner */}
        {apiKeyStatus && !apiKeyStatus.configured && (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-amber-800">API Keys Not Configured</h3>
                <p className="text-sm text-amber-700 mt-1">
                  Review fetching requires API keys. The following keys are missing from your <code className="bg-amber-100 px-1 rounded">.env.local</code> file:
                </p>
                <ul className="mt-2 space-y-1">
                  {!apiKeyStatus.keys.google && (
                    <li className="text-sm text-amber-700 flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-500" />
                      <strong>GOOGLE_PLACES_API_KEY</strong> — needed for Google Reviews
                    </li>
                  )}
                  {!apiKeyStatus.keys.rapidapi && (
                    <li className="text-sm text-amber-700 flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-500" />
                      <strong>RAPIDAPI_KEY</strong> — needed for TripAdvisor, Booking.com, and Expedia
                    </li>
                  )}
                  {!apiKeyStatus.keys.anthropic && (
                    <li className="text-sm text-amber-700 flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-amber-500" />
                      <strong>ANTHROPIC_API_KEY</strong> — needed for AI Theme Analysis (optional)
                    </li>
                  )}
                </ul>
                {apiKeyStatus.keys.google && apiKeyStatus.keys.rapidapi && (
                  <div className="mt-2 text-sm text-amber-700 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Review fetching keys are configured! Only AI analysis key is missing.
                  </div>
                )}
                <p className="text-xs text-amber-600 mt-3">
                  After adding the keys, restart the dev server (<code className="bg-amber-100 px-1 rounded">npm run dev</code>) for changes to take effect.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* API Keys All Good Banner (show briefly) */}
        {apiKeyStatus && apiKeyStatus.configured && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-700">All API keys configured. Ready to fetch reviews!</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Hotels</h1>
          <div className="flex gap-2">
            {hotels.length > 0 && (
              <Button
                variant="outline"
                onClick={handleFetchAllReviews}
                disabled={fetchingReviews}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${fetchingReviews ? 'animate-spin' : ''}`} />
                {fetchingReviews ? 'Fetching...' : 'Fetch All Reviews'}
              </Button>
            )}
            <HotelForm onSubmit={handleAddHotel} />
          </div>
        </div>

        {fetchProgress && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700">
            {fetchProgress}
          </div>
        )}

        {/* Fetch Error Details */}
        {fetchErrors.length > 0 && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-800">Some reviews could not be fetched</h3>
                <ul className="mt-2 space-y-1">
                  {fetchErrors.map((err, i) => (
                    <li key={i} className="text-sm text-red-700">{err}</li>
                  ))}
                </ul>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-red-600 hover:text-red-800"
                  onClick={() => setFetchErrors([])}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        )}

        <Tabs defaultValue="table">
          <TabsList>
            <TabsTrigger value="table">Table View</TabsTrigger>
            <TabsTrigger value="import">CSV Import</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="mt-4">
            <CSVUpload onImport={handleCSVImport} />
          </TabsContent>

          <TabsContent value="table" className="mt-4">
            {hotels.length === 0 ? (
              <Card className="p-12">
                <div className="text-center space-y-4">
                  <Hotel className="h-16 w-16 mx-auto text-muted-foreground" />
                  <h2 className="text-xl font-semibold">No hotels yet</h2>
                  <p className="text-muted-foreground">
                    Upload a CSV or add hotels manually to get started.
                  </p>
                </div>
              </Card>
            ) : (
              <>
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search hotels..."
                      className="pl-9"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  {cities.length > 0 && (
                    <Select value={cityFilter} onValueChange={setCityFilter}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Filter by city" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Cities</SelectItem>
                        {cities.sort().map((city) => (
                          <SelectItem key={city} value={city}>
                            {city}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Badge variant="secondary" className="h-9 px-3 flex items-center">
                    {filteredHotels.length} of {hotels.length} hotels
                  </Badge>
                </div>

                {/* Date Range Filter */}
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3 mb-4 p-3 bg-muted/30 rounded-lg border">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Date Range:
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

                {/* Table */}
                <Card>
                  <ScrollArea className="w-full">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableHeader field="name">Hotel Name</SortableHeader>
                          <SortableHeader field="city">City</SortableHeader>
                          <SortableHeader field="google">Google</SortableHeader>
                          <SortableHeader field="tripadvisor">TripAdvisor</SortableHeader>
                          <SortableHeader field="expedia">Expedia</SortableHeader>
                          <SortableHeader field="booking">Booking</SortableHeader>
                          <SortableHeader field="airbnb">Airbnb</SortableHeader>
                          <SortableHeader field="weighted_average">Weighted Avg</SortableHeader>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredHotels.map((hotel) => (
                          <TableRow
                            key={hotel.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => router.push(`/hotels/${hotel.id}`)}
                          >
                            <TableCell className="font-medium">{hotel.name}</TableCell>
                            <TableCell className="text-muted-foreground">{hotel.city || '—'}</TableCell>
                            <TableCell>
                              <ScoreBadge channel="google" score={hotel.scores.google} />
                            </TableCell>
                            <TableCell>
                              <ScoreBadge channel="tripadvisor" score={hotel.scores.tripadvisor} />
                            </TableCell>
                            <TableCell>
                              <ScoreBadge channel="expedia" score={hotel.scores.expedia} />
                            </TableCell>
                            <TableCell>
                              <ScoreBadge channel="booking" score={hotel.scores.booking} />
                            </TableCell>
                            <TableCell>
                              <ScoreBadge channel="airbnb" score={hotel.scores.airbnb} />
                            </TableCell>
                            <TableCell>
                              <div className={`text-center font-bold ${getScoreColor(hotel.weighted_average)}`}>
                                {formatScore(hotel.weighted_average)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={(e) => handleDeleteHotel(hotel.id, e)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
