# Reputation Monitor — Project Overview & Presentation Notes

## 1. How We Built This App — The Full Journey

The Reputation Monitor was built over the course of several iterative sessions using AI-assisted development. Here's how it came together:

**Phase 1: Foundation (Claude Opus 4 on claude.ai)**
I started by uploading the Kasa challenge PDF to Claude Opus 4 on claude.ai and asked it to generate the initial codebase. Claude produced the foundational structure — the Next.js project setup, database schema, authentication flow, and basic page layouts. This gave me a working skeleton to build on top of.

**Phase 2: Refinement & Debugging (Claude Code — CLI tool)**
I then moved the generated code into Claude Code (Anthropic's command-line AI coding tool) to iteratively fix build errors, connect real APIs, and refine the user experience. This is where the majority of the hands-on development happened:

- Connected to Supabase for the database and authentication
- Integrated Google Places API for Google Reviews (the only official API)
- Found and connected RapidAPI services for TripAdvisor, Booking.com, Expedia, and Airbnb
- Built the CSV upload flow with column auto-detection
- Added score normalization and weighted average calculations
- Created the dashboard with charts and visualizations
- Implemented hotel groups for portfolio comparison
- Added AI-powered review theme analysis via Anthropic's Claude API
- Applied Kasa branding (colors, logo placement, styling)
- Deployed to Vercel and connected to GitHub

**Phase 3: Polish & UX Improvements**
Final round of improvements included:
- Auto-resolving full hotel names via Google Places (e.g., "Hyatt" becomes "Hyatt Centric Delfina Santa Monica")
- Parallel API fetching for speed (all 4 non-Google channels fetch simultaneously)
- Bulk delete with checkboxes and Select All
- Date range filtering on both the hotel list and detail pages
- Excel export alongside CSV
- Improved CSV import button visibility
- Airbnb as a 5th review channel (stretch goal)

**Total Development Approach:** AI-assisted, iterative, and test-as-you-go. Each feature was built, tested in the browser, and refined before moving to the next.

---

## 2. Tools Used & What They Do

### Development & AI Tools

| Tool | What It Does | Why I Used It |
|------|-------------|---------------|
| **Claude Opus 4** (claude.ai) | Anthropic's most capable AI model, accessed via the web interface | Generated the initial codebase from the Kasa PDF spec. Great for large-scale code generation from a detailed prompt. |
| **Claude Code** (CLI) | Anthropic's command-line AI coding tool that can read, write, and edit files directly on your computer | Used for all iterative development — fixing bugs, connecting APIs, adding features. It can see your entire project and make targeted edits. |
| **Git & GitHub** | Version control and code hosting | Tracks all code changes and provides the public repository that Kasa can review. |
| **VS Code / Code Editor** | Code editor | For reviewing changes and occasional manual edits. |
| **Windows PowerShell** | Command-line terminal | For running Git commands, npm commands, and builds. |

### Tech Stack

| Technology | What It Does | Why I Chose It |
|------------|-------------|----------------|
| **Next.js 16** (App Router) | Full-stack React framework — handles both the frontend (what users see) and backend (API routes that talk to external services) | Industry standard, handles both frontend and backend in one project. The App Router is the latest architecture pattern from Next.js. |
| **TypeScript** | Adds type safety to JavaScript — catches errors before they happen | Prevents bugs, makes the code self-documenting, and is expected in professional projects. |
| **React** | UI library for building interactive user interfaces | The most widely used frontend library. Kasa likely uses it or something similar. |
| **Tailwind CSS** | Utility-based CSS framework for styling | Fast to develop with, consistent styling, no separate CSS files to manage. |
| **shadcn/ui** | Pre-built, beautiful UI components (buttons, tables, dialogs, etc.) | Production-quality components that look professional out of the box. Not a dependency — the code is copied into your project so you own it. |
| **Recharts** | React charting library for data visualization | Clean, responsive charts. Used for the dashboard bar charts and hotel detail trend lines. |
| **Supabase** | Cloud-hosted PostgreSQL database + authentication + Row Level Security | Free tier is generous, built-in auth (email/password + Google OAuth), and Row Level Security means each user can only see their own data. No custom backend needed. |
| **Vercel** | Cloud hosting platform (made by the creators of Next.js) | One-click deploy from GitHub, automatic HTTPS, automatic rebuilds on every git push. Perfect for demos. |
| **xlsx (npm package)** | Library for generating Excel spreadsheets | Enables the Excel export feature alongside CSV. |

### External APIs

| API | What It Provides | How We Use It |
|-----|-----------------|---------------|
| **Google Places API** | Official Google API for business information — ratings, review counts, place details | The only truly official API we use. Searches by hotel name + city, returns the Google rating (1-5 stars) and total review count. Also resolves the full official hotel name. |
| **RapidAPI — Travel Advisor** | Third-party wrapper for TripAdvisor data | Searches for hotels by name, returns TripAdvisor rating (1-5 stars) and review count. |
| **RapidAPI — Booking-com15** | Third-party wrapper for Booking.com data | Searches for hotels, returns Booking.com rating (internally 0-4, converted to 0-10) and review count. |
| **RapidAPI — Hotels.com Provider** | Third-party wrapper for Expedia/Hotels.com data | Searches for hotels, returns the Hotels.com rating (0-10) and review count. This IS the Expedia data source. |
| **RapidAPI — Airbnb13** | Third-party wrapper for Airbnb data | Searches for properties, returns Airbnb rating (1-5 stars) and review count. Stretch goal. |
| **Anthropic Claude API** | AI language model for text analysis | Analyzes review text and extracts positive/negative themes (e.g., "Guests love the rooftop pool" or "Complaints about slow check-in"). |

**Important note on RapidAPI:** Google is the only channel with an official, public API. TripAdvisor, Booking.com, Expedia, and Airbnb do not offer open APIs. The RapidAPI services are third-party wrappers — this is standard industry practice and exactly what the Kasa assignment suggested ("Don't reinvent the wheel... look for unofficial APIs on marketplaces like RapidAPI").

---

## 3. Architecture Decisions & Why

### Decision 1: Next.js Full-Stack (not separate frontend + backend)
**What:** Both the user interface and the API logic live in one Next.js project.
**Why:** Simplifies deployment (one project, one hosting service), reduces complexity, and is the modern standard for React applications. For a tool of this scope, a separate backend server would be overkill.

### Decision 2: Supabase (not a custom database)
**What:** Used Supabase's managed PostgreSQL instead of setting up my own database.
**Why:** Supabase provides the database, authentication, and row-level security all in one package. This means I didn't need to write login/signup logic from scratch or worry about database security — it's handled automatically. Each user's data is isolated by default.

### Decision 3: Row Level Security (RLS)
**What:** Database rules that ensure users can only see and modify their own hotels and reviews.
**Why:** If Kasa team member A adds hotels, team member B cannot see or delete them. This is critical for multi-user support and was mentioned as a requirement.

### Decision 4: Score Normalization to 0-10
**What:** All review scores are converted to a common 0-10 scale.
**Why:** Different platforms use different scales — Google uses 1-5 stars, Booking.com uses 0-10, etc. To calculate a fair weighted average and allow side-by-side comparison, everything needs to be on the same scale. The 0-10 scale was chosen because it's the most granular common denominator.

### Decision 5: Weighted Average by Review Count
**What:** The "Weighted Average Score" gives more weight to channels with more reviews.
**Why:** A Google rating based on 2,000 reviews is more statistically reliable than an Expedia rating based on 15 reviews. Weighting by review count ensures the aggregate score reflects reality. Formula: `Σ(normalized_score × review_count) / Σ(review_count)`.

### Decision 6: Google Places First, Then Parallel
**What:** When fetching reviews, Google runs first (to resolve the hotel's official name), then TripAdvisor, Booking, Expedia, and Airbnb all run simultaneously.
**Why:** Speed. Running 5 APIs one after another would take 15+ seconds per hotel. Running 4 in parallel after Google cuts it to ~5-6 seconds. Google goes first because it resolves the full official hotel name, which improves search accuracy on other platforms.

### Decision 7: Snapshot-Based History
**What:** Every time reviews are fetched, a new "snapshot" row is created in the database (rather than overwriting the previous data).
**Why:** This enables historical trend tracking. You can see how a hotel's scores change over time. The date range filter lets you view scores from specific time periods.

---

## 4. Finding Your GitHub Repository

To find your GitHub repository link:

1. Go to https://github.com
2. Click your profile icon (top right)
3. Click "Your repositories"
4. Click on "reputation-monitor"
5. The URL in your browser bar is your public repository link — it will look like:
   `https://github.com/YOUR_USERNAME/reputation-monitor`

This is what you'll share with Kasa as Deliverable #2.

---

## 5. Presentation Script — Explaining the App to a Non-Technical Manager

### Opening

"I built a web-based Reputation Monitor dashboard that lets hotel operators track and compare guest review scores across all major booking platforms — Google, TripAdvisor, Expedia, Booking.com, and Airbnb — all in one place.

The core problem this solves: today, if you want to know how a hotel is performing across channels, you'd need to manually visit 4-5 different websites, write down each score, and do the math yourself. This tool automates all of that."

### How It Works

"Here's the workflow from a user's perspective:

1. **Sign in** — The app has secure login via email/password or Google sign-in. Each user's data is private to them.

2. **Add hotels** — You can either upload a spreadsheet (CSV) with a list of hotel names and cities, or add hotels one at a time. I designed it to handle the sample hotel list Kasa provided.

3. **Fetch reviews** — With one click ('Fetch All Reviews'), the system reaches out to Google, TripAdvisor, Booking.com, Expedia, and Airbnb for each hotel. It automatically finds the right listing on each platform using the hotel name and city, then pulls the average rating and total review count.

4. **View results** — The dashboard shows a table with each hotel's score on every channel, plus a calculated Weighted Average that accounts for how many reviews each channel has. You can click into any hotel to see a detailed breakdown.

5. **Organize** — Hotels can be saved into named groups (like 'Kasa Portfolio' or 'NYC Competitive Set') for portfolio-level analysis.

6. **Analyze themes** — An AI feature powered by Anthropic's Claude analyzes review text and extracts the top positive themes (what guests love) and negative themes (what guests complain about).

7. **Export** — All data can be downloaded as a CSV or Excel file for offline analysis or sharing."

### Technical Highlights (Keep Simple)

"On the technical side, a few things I'm particularly proud of:

- **Speed**: The system fetches all 5 channels in parallel, so it takes about 5-6 seconds per hotel instead of 20+.
- **Smart name matching**: When you type 'Hyatt, Santa Monica', Google resolves it to the full name 'Hyatt Centric Delfina Santa Monica', and that official name is used to search the other platforms. This dramatically improves accuracy.
- **History tracking**: Every time you fetch reviews, the data is saved as a point-in-time snapshot. Over time, you can see trends — is this hotel's score going up or down?
- **Security**: Every user's data is completely isolated. Built-in row-level security means there's no risk of data leaking between accounts."

### Stretch Goals

"I completed all three stretch goals from the assignment:

1. **AI Theme Analysis** — Uses Claude (Anthropic's AI) to extract what guests are saying — positive and negative themes from review text.
2. **Date Range Filtering** — You can filter review data by any date range to analyze performance during specific periods.
3. **Airbnb Integration** — Added Airbnb as a 5th review channel, which is particularly relevant since all Kasa properties are listed on Airbnb."

---

## 6. Why LLM-Powered Review Theme Analysis (Anthropic Claude)

### What the feature does:
When you click "AI Analysis" on a hotel's detail page, the system sends all available review text to Claude (Anthropic's AI model) and asks it to identify the most common positive and negative themes guests mention.

**Example output:**
- Positive: "Rooftop pool and views" (mentioned 45 times) — "Guests consistently praise the rooftop pool area and panoramic city views"
- Negative: "Slow check-in process" (mentioned 23 times) — "Multiple guests report long wait times during check-in, especially during peak hours"

### Why LLM-powered (not rule-based)?

**Option 1: Rule-based approach** — You'd write code like: "if review contains 'clean' or 'spotless', count it as a positive cleanliness mention."
- Problem: You'd need to manually write hundreds of rules. What about "immaculate"? "Pristine"? "The room was so fresh"? You'd never catch everything.
- Problem: Can't understand context. "The pool was NOT clean" contains the word "clean" but is negative.

**Option 2: LLM-powered (what we chose)** — Send the reviews to Claude and say "identify the key themes."
- Claude understands natural language, sarcasm, context, and nuance
- No manual rules needed — it figures out the themes from the actual text
- It can summarize thousands of reviews into actionable insights
- It adapts automatically — if guests start complaining about something new (like a renovation), Claude picks it up without any code changes

**Why Anthropic's Claude specifically?**
- High-quality analysis with strong instruction-following
- The model (claude-sonnet-4-5-20250929) strikes a good balance between quality and cost
- Anthropic is the company behind Claude Code, which I used to build this app — so there's consistency in the AI tooling

### The business value:
A hotel manager doesn't have time to read thousands of reviews. This feature distills all that feedback into actionable themes in seconds. "Your guests love the location but are frustrated by parking" — now you know exactly where to invest to improve your scores.

---

## 7. Development Process — Claude Opus 4 → Claude Code

Here's exactly how the development worked:

**Step 1: Claude Opus 4 on claude.ai**
I uploaded the Kasa challenge PDF to Claude Opus 4 (Anthropic's most capable AI model, accessed through the claude.ai web interface). I gave it the full assignment and asked it to generate a complete Next.js application. Claude produced:
- The project structure and configuration files
- Database schema (SQL)
- All React pages and components
- API route handlers
- TypeScript type definitions
- Authentication setup

This was the "first draft" — a large body of code generated in one conversation.

**Step 2: Claude Code (CLI tool)**
I then copied that generated code into a local project folder and opened it in Claude Code — Anthropic's command-line coding tool that runs in the terminal. Unlike the web interface, Claude Code can:
- Read and edit files directly on your computer
- Run build commands and see errors
- Make surgical, targeted edits to specific files
- Test changes incrementally

This is where the real iterative work happened:
- Fixed build errors (the initial generated code had type mismatches and import issues)
- Connected to real API keys and tested against live data
- Debugged API responses that didn't match expected formats
- Refined the UI/UX based on how things actually looked in the browser
- Added features incrementally (Airbnb, Excel export, bulk delete, etc.)
- Applied Kasa's brand colors and styling

**Why this two-step approach works:**
Claude Opus 4 is excellent at generating large amounts of code from a specification. Claude Code is excellent at iterating, debugging, and refining existing code. Using both together gave me the speed of AI generation plus the precision of hands-on debugging.

---

## 8. Short Note for Submission

### Architecture
- **Frontend & Backend**: Next.js 16 (App Router) with TypeScript, React, Tailwind CSS, and shadcn/ui components
- **Database**: Supabase (managed PostgreSQL with Row Level Security for multi-user data isolation)
- **Authentication**: Supabase Auth supporting email/password and Google OAuth
- **Data Visualization**: Recharts for interactive charts and trend lines
- **Hosting**: Vercel (automatic deployments from GitHub)

### APIs & Data Sources
- **Google Places API** (official) — hotel name resolution, Google review scores and counts
- **RapidAPI — Travel Advisor** — TripAdvisor review data
- **RapidAPI — Booking-com15** — Booking.com review data
- **RapidAPI — Hotels.com Provider** — Expedia/Hotels.com review data
- **RapidAPI — Airbnb13** — Airbnb review data (stretch goal)
- **Anthropic Claude API** — AI-powered review theme extraction (stretch goal)

### Tools Used
- **Claude Opus 4** (claude.ai) for initial code generation from the assignment spec
- **Claude Code** (CLI) for iterative development, debugging, and feature additions
- **Git/GitHub** for version control and code hosting
- **PowerShell** for terminal commands

### Key Assumptions & Shortcuts
- **Score Normalization**: Google, TripAdvisor, and Airbnb use 1-5 star scales (multiplied by 2 to normalize to 0-10). Booking.com's API returns an internal 0-4 score (multiplied by 2.5 to match their public 0-10 scale). Expedia/Hotels.com already uses 0-10 natively.
- **Weighted Average**: Calculated as `Σ(normalized_score × review_count) / Σ(review_count)`, giving more statistical weight to channels with more reviews.
- **Hotel Matching**: Hotels are matched to OTA listings via text search (name + city). Confidence levels (high/medium/low) are tracked. Google Places resolves official names for better accuracy on other platforms.
- **No Official OTA APIs**: Only Google has a public API. TripAdvisor, Booking.com, Expedia, and Airbnb data comes from third-party RapidAPI services, as suggested in the assignment hints.
- **On-Demand Fetching**: Reviews are fetched when the user clicks "Fetch Reviews" rather than on an automated schedule. Data is cached with timestamps for historical tracking.
- **Batch Processing**: Hotels are processed in batches of 5 with delays between batches to avoid API rate limits.

### What I'd Do Differently in Production

**1. More Reliable Data Sources**
The current RapidAPI integrations are third-party wrappers that could break if the underlying websites change their structure. In production, I would:
- Pursue official API partnerships where available (Booking.com Connectivity API, TripAdvisor Content API)
- Build redundant data pipelines with fallback providers
- Implement monitoring and alerts when an API starts returning errors

**2. Robust Cloud Hosting (AWS or Google Cloud)**
Vercel is excellent for demos but has limitations for production workloads:
- Move to AWS (ECS/EKS) or Google Cloud (Cloud Run) for more control over scaling, networking, and costs
- Use a managed database like AWS RDS or Google Cloud SQL instead of Supabase for enterprise-grade reliability and backup policies
- Implement a CDN (CloudFront or Cloud CDN) for global performance

**3. Queue System for Background Processing**
Currently, review fetching happens synchronously when the user clicks a button. In production:
- Implement a job queue (AWS SQS, Redis/BullMQ, or Google Cloud Tasks) so review fetching happens in the background
- Users would see a "processing" status and get notified when results are ready
- This prevents timeouts on large portfolios and allows retry logic for failed API calls

**4. Multiple Servers & Auto-Scaling**
The current single-server setup wouldn't handle heavy concurrent usage:
- Deploy behind a load balancer with multiple server instances
- Auto-scale based on demand (more users = more servers automatically)
- Separate the API workers (that fetch reviews) from the web servers (that serve the dashboard) so heavy API fetching doesn't slow down the user interface

**5. Automated Scheduling**
- Set up cron jobs or scheduled tasks to automatically re-fetch reviews daily or weekly
- Track score changes over time and send email/Slack alerts when a property's score drops below a threshold

**6. Enhanced Data Accuracy**
- Implement fuzzy name matching with address verification to improve hotel-to-listing matching
- Cross-reference results across platforms (if Google says it's "Hyatt Centric Delfina", verify the TripAdvisor match is the same physical property)
- Store and analyze individual review text, not just aggregate scores

---

## 9. Why Kasa Would Want This App

Kasa is a tech-enabled hospitality company that manages hotels and short-term rentals. Understanding why they'd want a Reputation Monitor reveals what they're really testing with this challenge:

### Use Case 1: Source Underperforming Properties to Acquire/Manage
Kasa's business model involves taking over management of hotel properties. A reputation monitoring tool lets them:
- **Identify hotels with declining review scores** — these are properties where the current management is struggling
- **Pitch to property owners**: "Your Google score dropped from 4.2 to 3.8 over the past year. Here's how Kasa can turn that around."
- **Quantify the opportunity**: Properties with poor reviews often have lower occupancy and revenue — Kasa can calculate the upside of improving scores

### Use Case 2: Prove Their Tech-Enabled Management Improves Ratings
Once Kasa takes over a property, they need to demonstrate results:
- **Before/after tracking**: Show property owners that scores improved after Kasa took over management
- **Historical trend lines**: "Since Kasa began managing this property 6 months ago, the Google rating went from 3.6 to 4.3"
- **Portfolio-wide reporting**: Aggregate data across all Kasa-managed properties to show consistent improvement

### Use Case 3: Competitive Benchmarking
Kasa needs to know how their properties stack up against nearby competitors:
- **Create a "Competitive Set" group**: Add Kasa properties alongside neighboring hotels
- **Side-by-side comparison**: "Our property scores 8.4 weighted average vs. the competitive set average of 7.1"
- **Channel-specific insights**: Maybe a Kasa property excels on Google but underperforms on Booking.com — that tells the operations team where to focus

### Use Case 4: Operational Intelligence
The AI theme analysis provides actionable insights:
- **Spot recurring issues**: If multiple properties show "slow WiFi" as a negative theme, that's a company-wide infrastructure investment decision
- **Identify what guests value most**: If "self check-in" is a top positive theme across Kasa properties, that validates their tech-enabled approach
- **Prioritize improvements**: Focus resources on the themes that appear most frequently in negative reviews

### Use Case 5: Investor & Partner Reporting
Kasa likely reports to investors and property owners:
- **Export polished data**: The CSV/Excel export provides clean data for board presentations
- **Demonstrate portfolio health**: A dashboard showing strong scores across 100+ properties is compelling evidence of operational excellence
- **Track KPIs over time**: Historical snapshots show whether the portfolio is trending up or down

### The Bigger Picture
This challenge isn't just about building a dashboard — it's about demonstrating the mindset Kasa values:
- **AI-native thinking**: Using AI tools (Claude) to build software quickly
- **Resourcefulness**: Finding creative solutions to data access challenges (RapidAPI, etc.)
- **Business acumen**: Understanding why reputation data matters in hospitality
- **Speed**: Building a production-quality tool in a short timeframe using modern tools
