import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export default function MethodologyPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Methodology & Documentation</h1>

      {/* Architecture Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Architecture Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This dashboard aggregates hotel review data from 5 major channels
            (Google, TripAdvisor, Expedia, Booking.com, and Airbnb), normalizes scores to a common
            0-10 scale, and calculates a weighted average for cross-platform comparison.
          </p>
          <div className="p-4 bg-muted/50 rounded-lg text-sm space-y-1 font-mono">
            <p>User uploads CSV &rarr; Hotels stored in Supabase</p>
            <p>&rarr; For each hotel, search each channel API by name + city</p>
            <p>&rarr; Resolve to platform-specific hotel ID</p>
            <p>&rarr; Fetch review score + count from each platform</p>
            <p>&rarr; Normalize to 0-10 &rarr; Calculate weighted average</p>
            <p>&rarr; Store snapshots for historical tracking</p>
          </div>
        </CardContent>
      </Card>

      {/* Score Normalization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Score Normalization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Different review platforms use different scoring scales. We normalize all scores
            to a 0-10 scale for consistent comparison.
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <span className="font-medium">Google Reviews</span>
                <p className="text-sm text-muted-foreground">Native scale: 1-5 stars</p>
              </div>
              <Badge variant="secondary">Score &times; 2.0</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <span className="font-medium">TripAdvisor</span>
                <p className="text-sm text-muted-foreground">Native scale: 1-5 stars</p>
              </div>
              <Badge variant="secondary">Score &times; 2.0</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <span className="font-medium">Expedia / Hotels.com</span>
                <p className="text-sm text-muted-foreground">Native scale: 0-10</p>
              </div>
              <Badge variant="secondary">Score &times; 1.0 (already normalized)</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <span className="font-medium">Booking.com</span>
                <p className="text-sm text-muted-foreground">Native scale: 1-10 (via 0-4 conversion)</p>
              </div>
              <Badge variant="secondary">Score &times; 1.0 (already normalized)</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <span className="font-medium">Airbnb</span>
                <p className="text-sm text-muted-foreground">Native scale: 1-5 stars</p>
              </div>
              <Badge variant="secondary">Score &times; 2.0</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weighted Average */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weighted Average Formula</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The weighted average score gives more influence to channels with more reviews.
            This prevents a channel with only 5 reviews from having equal weight to a channel with 500 reviews.
          </p>

          <div className="p-4 bg-muted/50 rounded-lg font-mono text-sm">
            weighted_score = &Sigma;(normalized_score_i &times; review_count_i) / &Sigma;(review_count_i)
          </div>

          <p className="text-sm text-muted-foreground">
            Where <code className="text-xs bg-muted px-1 rounded">i</code> iterates over all channels
            that have data for that hotel. Channels with no data are excluded from the calculation.
          </p>

          <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
            <strong>Example:</strong> If a hotel has Google (4.2/5 = 8.4/10, 500 reviews), TripAdvisor (4.0/5 = 8.0/10, 300 reviews),
            and Booking.com (8.5/10, 200 reviews), the weighted average =
            (8.4&times;500 + 8.0&times;300 + 8.5&times;200) / (500 + 300 + 200) = 8.3/10.
          </div>
        </CardContent>
      </Card>

      {/* Score Color Coding */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Score Color Coding</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-emerald-500" />
              <span className="text-sm"><strong>Green</strong> (8.0 - 10.0): Excellent reputation</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-amber-500" />
              <span className="text-sm"><strong>Yellow</strong> (6.0 - 7.9): Good, room for improvement</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-red-500" />
              <span className="text-sm"><strong>Red</strong> (below 6.0): Needs attention</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hotel Resolution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hotel Resolution Strategy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            One of the key challenges is matching hotel names to the correct listings on each platform.
            Here&apos;s how we approach this:
          </p>

          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-sm">Google Places</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Uses the Google Places API <code className="text-xs bg-muted px-1 rounded">findplacefromtext</code> endpoint
                to search &quot;Hotel Name, City&quot; and resolve to a Place ID, then fetches the aggregate
                rating (1-5 stars) and total review count from Place Details. Confidence is determined
                by name similarity matching. The resolved Place ID is cached for future lookups.
              </p>
            </div>
            <Separator />
            <div>
              <h4 className="font-medium text-sm">TripAdvisor</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Uses the Travel Advisor RapidAPI to search by hotel name + city via the auto-complete
                endpoint, filtering for ACCOMMODATION type results. Resolves to a location ID, then
                fetches individual reviews from <code className="text-xs bg-muted px-1 rounded">reviews/list</code> and
                calculates the average rating (1-5 stars) from the returned sample. Total review count
                comes from the API&apos;s pagination metadata.
              </p>
            </div>
            <Separator />
            <div>
              <h4 className="font-medium text-sm">Booking.com</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Uses the Booking.com RapidAPI (booking-com15). Searches via <code className="text-xs bg-muted px-1 rounded">searchDestination</code> to
                find the hotel&apos;s destination ID. The <code className="text-xs bg-muted px-1 rounded">getHotelReviews</code> endpoint
                returns an internal score on a 0-4 scale, which is converted to Booking.com&apos;s
                public-facing 0-10 scale (×2.5). Total review count comes
                from <code className="text-xs bg-muted px-1 rounded">getHotelDetails</code>. Both API calls run in parallel
                for speed. No additional normalization is needed since the converted score is already on the 0-10 scale.
              </p>
            </div>
            <Separator />
            <div>
              <h4 className="font-medium text-sm">Expedia / Hotels.com</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Uses the Hotels.com Provider RapidAPI. Searches via <code className="text-xs bg-muted px-1 rounded">v2/regions</code> to
                find the hotel&apos;s property ID, then fetches the aggregate review summary
                from <code className="text-xs bg-muted px-1 rounded">v2/hotels/reviews/summary</code>. The score is
                natively on a 0-10 scale, so no conversion is needed. The summary also includes
                sub-category ratings (cleanliness, hotel condition, room comfort, service &amp; staff).
              </p>
            </div>
          </div>

            <Separator />
            <div>
              <h4 className="font-medium text-sm">Airbnb</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Uses the Airbnb RapidAPI (airbnb13). Searches via <code className="text-xs bg-muted px-1 rounded">searchPlaces</code> with
                the hotel name and city, filtering for hotel/apartment results. Resolves to a listing ID,
                then fetches the review score (1-5 stars) and total review count. The score is normalized
                to 0-10 by multiplying by 2.
              </p>
            </div>

          <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-800">
            <strong>Confidence Scoring:</strong> Each match is assigned a confidence level (high, medium, low)
            based on name similarity between the search query and the returned result. Low-confidence
            matches may indicate the wrong hotel was identified. We recommend verifying low-confidence
            results by checking the OTA links.
          </div>
        </CardContent>
      </Card>

      {/* APIs Used */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">APIs Used</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2 p-2 bg-muted/50 rounded-lg font-medium">
              <span>Channel</span>
              <span>API / Service</span>
              <span>Score Scale</span>
            </div>
            <div className="grid grid-cols-3 gap-2 p-2">
              <span>Google</span>
              <span className="text-muted-foreground">Google Places API (official)</span>
              <span className="text-muted-foreground">1-5 &rarr; &times;2 = 0-10</span>
            </div>
            <div className="grid grid-cols-3 gap-2 p-2">
              <span>TripAdvisor</span>
              <span className="text-muted-foreground">Travel Advisor (RapidAPI)</span>
              <span className="text-muted-foreground">1-5 &rarr; &times;2 = 0-10</span>
            </div>
            <div className="grid grid-cols-3 gap-2 p-2">
              <span>Expedia</span>
              <span className="text-muted-foreground">Hotels.com Provider (RapidAPI)</span>
              <span className="text-muted-foreground">0-10 (native)</span>
            </div>
            <div className="grid grid-cols-3 gap-2 p-2">
              <span>Booking.com</span>
              <span className="text-muted-foreground">Booking.com (RapidAPI)</span>
              <span className="text-muted-foreground">0-10 (converted from 0-4)</span>
            </div>
            <div className="grid grid-cols-3 gap-2 p-2">
              <span>Airbnb</span>
              <span className="text-muted-foreground">Airbnb (RapidAPI)</span>
              <span className="text-muted-foreground">1-5 &rarr; &times;2 = 0-10</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Caching & Rate Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Caching & Rate Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-2">
            <li>Review data is cached for 24 hours. Re-fetching within this window returns cached data unless &quot;force refresh&quot; is used.</li>
            <li>Hotels are processed in batches of 5 with 1-second delays between batches to avoid rate limiting.</li>
            <li>Within each hotel, Google is fetched first (to resolve the official name), then TripAdvisor, Booking.com, Expedia, and Airbnb are fetched in parallel for speed.</li>
            <li>Raw API responses are stored in the database for debugging and audit purposes.</li>
            <li>Each snapshot is timestamped, allowing historical trend tracking over time.</li>
          </ul>
        </CardContent>
      </Card>

      {/* AI Theme Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Theme Analysis (Stretch Goal)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The AI analysis feature uses Anthropic&apos;s Claude (claude-sonnet-4-5-20250929) to extract
            positive and negative themes from review data. This works at both the individual hotel
            level and the portfolio/group level.
          </p>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-2">
            <li>When individual review text is available (e.g., from TripAdvisor reviews or Google Places reviews), it analyzes actual review content.</li>
            <li>When only aggregate scores are available, it generates inferred themes based on score patterns and hospitality industry knowledge, clearly marked as &quot;inferred.&quot;</li>
            <li>Analysis is on-demand only (not automatic) to manage API costs.</li>
            <li>Results are stored in the database and displayed as positive/negative theme cards with mention counts.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Key Assumptions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Key Assumptions & Shortcuts</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-2">
            <li><strong>Name Matching:</strong> We rely on each platform&apos;s search to resolve hotel names. Hotels with common names or those in areas with similarly-named properties may match incorrectly. Low-confidence matches are flagged.</li>
            <li><strong>TripAdvisor Average:</strong> TripAdvisor&apos;s API returns individual reviews (up to 25). We calculate the average from these, which may differ slightly from the platform&apos;s displayed overall rating.</li>
            <li><strong>Booking.com Score Conversion:</strong> Booking.com&apos;s review API returns scores on a 0-4 scale. We multiply by 2.5 to normalize to 0-10. This is a linear conversion that preserves relative rankings.</li>
            <li><strong>Review Count Source:</strong> Total review counts come from different API endpoints per channel and may not perfectly match the counts displayed on each platform&apos;s website.</li>
            <li><strong>Batch Size:</strong> Designed for batches of ~100 hotels. Larger sets would benefit from background job processing and webhook-based status updates.</li>
            <li><strong>Snapshot-Based History:</strong> Historical data depends on periodic re-fetching. The system records a snapshot each time reviews are fetched, but does not automatically poll.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Production Evolution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Production Evolution</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            What we would do differently in a production system:
          </p>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-2">
            <li><strong>Background Jobs:</strong> Move review fetching to a background job queue (e.g., Inngest, BullMQ) to handle large portfolios without HTTP timeouts.</li>
            <li><strong>Scheduled Re-fetching:</strong> Cron-based automatic review updates (weekly or daily) instead of manual triggers.</li>
            <li><strong>Official APIs:</strong> Where possible, migrate from RapidAPI proxies to direct/official APIs (TripAdvisor Content API, Booking.com Connectivity API) for better reliability and rate limits.</li>
            <li><strong>Better Resolution:</strong> Implement multi-signal hotel matching (name + address + coordinates) to improve match accuracy.</li>
            <li><strong>Review Text Storage:</strong> Store individual review texts for deeper NLP analysis and date-range filtering.</li>
            <li><strong>Alerting:</strong> Score change notifications when a hotel&apos;s rating drops below a threshold.</li>
            <li><strong>Role-Based Access:</strong> Team roles (admin, viewer) for enterprise use cases.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Known Limitations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Known Limitations</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside text-sm text-muted-foreground space-y-2">
            <li>Google Places API returns at most 5 individual reviews per request, limiting the depth of AI analysis for Google-only data.</li>
            <li>TripAdvisor average is calculated from a sample of 25 reviews, not the platform&apos;s total. This may differ slightly from the displayed rating.</li>
            <li>Date-range filtering for review snapshots is supported via the date picker on the Hotels and Hotel Detail pages.</li>
            <li>Airbnb reviews are included via the Airbnb RapidAPI integration.</li>
            <li>RapidAPI rate limits may cause temporary failures during bulk fetching. The system handles this gracefully with retry-friendly error messages.</li>
          </ul>
        </CardContent>
      </Card>

      {/* Tech Stack */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tech Stack</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge>Next.js 16 (App Router)</Badge>
            <Badge>TypeScript</Badge>
            <Badge>Supabase (PostgreSQL + RLS + Auth)</Badge>
            <Badge>Tailwind CSS</Badge>
            <Badge>shadcn/ui</Badge>
            <Badge>Recharts</Badge>
            <Badge>Google Places API</Badge>
            <Badge>RapidAPI (TripAdvisor, Booking.com, Hotels.com, Airbnb)</Badge>
            <Badge>Anthropic Claude (AI Theme Analysis)</Badge>
            <Badge>Vercel (Deployment)</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
