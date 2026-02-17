# Reputation Monitor

A full-stack dashboard that aggregates, analyzes, and visualizes hotel review data across Google, TripAdvisor, Expedia, and Booking.com.

Built as a take-home project for the Chief of Staff role at Kasa.

## Architecture

```
Next.js 16 (App Router) + TypeScript
├── Frontend: React + Tailwind CSS + shadcn/ui + Recharts
├── Backend: Next.js API Routes
├── Database: Supabase (PostgreSQL + Row Level Security)
├── Auth: Supabase Auth (email/password + Google OAuth)
├── Review APIs: Google Places API + RapidAPI (TripAdvisor, Booking.com, Expedia)
├── AI: Anthropic Claude (review theme analysis)
└── Deployment: Vercel
```

### Project Structure

```
src/
├── app/
│   ├── (auth)/login, signup     — Authentication pages
│   ├── (dashboard)/             — Protected dashboard layout
│   │   ├── dashboard/           — Summary stats, charts, top hotels
│   │   ├── hotels/              — Hotel list, CSV upload, detail view
│   │   ├── groups/              — Group management, comparison
│   │   ├── export/              — CSV export
│   │   └── methodology/         — Documentation of approach
│   ├── api/
│   │   ├── reviews/             — Fetch reviews from all channels
│   │   ├── themes/              — AI theme analysis via Claude
│   │   └── export/              — CSV generation
│   └── auth/callback/           — OAuth callback handler
├── components/                  — Shared UI components
│   ├── ui/                      — shadcn/ui components
│   ├── sidebar.tsx              — Navigation sidebar
│   ├── csv-upload.tsx           — CSV parser with preview
│   ├── hotel-form.tsx           — Manual hotel entry dialog
│   └── score-badge.tsx          — Score display with tooltips
└── lib/
    ├── supabase.ts              — Browser Supabase client
    ├── supabase-server.ts       — Server Supabase client
    ├── supabase-middleware.ts   — Auth middleware
    ├── scoring.ts               — Normalization + weighted average
    ├── types.ts                 — TypeScript type definitions
    └── api-clients/             — Review platform API wrappers
        ├── google-places.ts
        ├── tripadvisor.ts
        ├── booking.ts
        └── expedia.ts
```

## APIs Used

| Channel | API | Notes |
|---------|-----|-------|
| Google | Google Places API (findplacefromtext + details) | Resolves hotel name → Place ID → rating + reviews |
| TripAdvisor | RapidAPI - TripAdvisor16 | Hotel search + details |
| Booking.com | RapidAPI - Booking.com15 | Destination search + hotel details |
| Expedia | RapidAPI - Hotels.com Provider | Region search; limited coverage |
| AI Analysis | Anthropic Claude (claude-sonnet-4-5-20250929) | Review theme extraction |

## Key Features

- **Hotel Management**: CSV upload (bulk) + manual add; supports ~100+ hotels
- **Multi-Channel Review Aggregation**: Google, TripAdvisor, Booking.com, Expedia
- **Score Normalization**: All scores normalized to 0–10 scale
- **Weighted Average**: `Σ(normalized_score × review_count) / Σ(review_count)`
- **Groups**: Create groups of hotels, compare aggregated scores
- **Historical Tracking**: Each fetch creates a timestamped snapshot for trend charts
- **AI Theme Analysis**: Claude-powered extraction of positive/negative review themes
- **CSV Export**: Download all data with scores, review counts, and group memberships
- **Auth**: Email/password + Google OAuth, all data scoped per user via RLS

## Assumptions & Design Decisions

### Score Normalization
- Google, TripAdvisor, Expedia: 1–5 scale × 2 → 0–10
- Booking.com: Already 1–10 scale → no multiplication needed

### Hotel Resolution
- Hotels are matched by name + city text search on each platform
- Confidence levels (high/medium/low) are tracked based on name similarity
- Multiple results → best match selected, with lower confidence flagged
- Google Place IDs and OTA URLs are cached after first resolution

### Caching
- Review data cached for 24 hours; re-fetch skipped unless force=true
- Raw API responses stored in `raw_response` JSONB column for debugging
- Batch processing: 5 hotels at a time with 500ms–1s delays between API calls

### Known Limitations
- **Expedia**: API coverage is inconsistent; many hotels return "Not Found"
- **Google Places**: Returns max 5 review texts per request
- **Name matching**: Hotels with common names may match incorrectly
- **Historical data**: Requires manual re-fetch; no automatic polling
- **Date filtering**: Limited to channels that expose individual review dates

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd reputation-monitor
npm install
```

### 2. Set up Supabase

1. Create a Supabase project at https://supabase.com
2. Run the SQL in `supabase-schema.sql` in the Supabase SQL Editor
3. Enable Google OAuth in Authentication → Providers (optional)

### 3. Configure environment variables

Copy `.env.local` and fill in the values:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

RAPIDAPI_KEY=your-rapidapi-key
GOOGLE_PLACES_API_KEY=your-google-places-key
ANTHROPIC_API_KEY=your-anthropic-key
```

### 4. Run locally

```bash
npm run dev
```

### 5. Deploy to Vercel

```bash
npx vercel
```

Set the same environment variables in Vercel's project settings.

## Shortcuts Taken

- **No automated polling**: Review data is fetched on-demand rather than on a cron schedule
- **No WebSocket/SSE for progress**: Batch review fetching uses sequential requests with client-side progress tracking rather than real-time server push
- **Expedia coverage**: Limited by available RapidAPI endpoints; documented as a known limitation
- **No drag-and-drop for groups**: Uses checkbox-based multi-select instead

## Future Improvements

- Automated daily/weekly review fetching via Supabase Edge Functions or Vercel Cron
- Real-time progress updates via Server-Sent Events during batch fetching
- More sophisticated hotel name matching (fuzzy search, address verification)
- Review-level date filtering where APIs expose individual review dates
- Competitor benchmarking (compare your hotels against market averages)
- Email alerts when scores drop below thresholds
- Dark mode support
