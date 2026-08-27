# cnxt to post — Development Roadmap

Free, open cross-posting tool. Compose once, publish everywhere. Read metrics across platforms from a single dashboard.

---

## North Star

A user connects their social accounts once, then posts to any combination of platforms from a single interface — with unified metrics and no per-platform subscription fees. X/Twitter is the only platform that charges for API access, so it gets a hybrid model (see below). Everything else is free.

---

## Platform Support Matrix

| Platform | Post | Read Metrics | Login | API Cost |
|---|---|---|---|---|
| Bluesky | ✅ scripted | ✅ scripted | ✅ scripted | Free |
| Facebook Pages | ✅ scripted | ✅ scripted | ✅ scripted | Free |
| Instagram (Pro) | ✅ scripted | ✅ scripted | ✅ scripted | Free |
| LinkedIn | ✅ scripted | ✅ scripted | ✅ scripted | Free |
| TikTok | ✅ scripted | ✅ scripted | ✅ scripted | Free |
| X (Twitter) | ✅ scripted | ✅ scripted | ✅ scripted | **Paid** (see below) |

Existing scripts live in `social/`:
- `*-post.mjs` — posting per platform
- `*-metrics.mjs` — reading engagement metrics
- `*-auth.mjs` — OAuth flows per platform
- `auth/auth-utils.mjs` — shared auth helpers

---

## X / Twitter Cost Strategy

Owned Reads (ie reads related to your own profile) = $0.001
Post w/o url = $0.015
Posts w/ URL = $0.20 


**Two paths for users:**

### Path A: Bring Your Own Keys (BYOK) — Free
- User provides their own X API keys from developer.x.com
- Keys are encrypted at rest, never shared
- User gets whatever tier they've paid X for directly
- cnxt doesn't intermediate — your keys, your rate limits, your bill
- Works even on X's free tier for light usage

### Path B: Prepaid Credits — Convenience
- User buys credits (e.g., $5 for 500 posts)
- cnxt pools API access through a shared X API subscription
- No developer portal setup required — just connect your X account via OAuth
- Credit pricing transparently reflects X's API costs plus a small platform fee
- Unused credits don't expire (or have generous timeframes)
- Ideal for users who post occasionally and don't want to manage API keys

Both paths coexist. BYOK is always available as the zero-cost option. Credits are for convenience.

---

## Architecture

```
┌──────────────────────────────────────────────┐
│                 Dashboard UI                  │
│         (Cloudflare Pages, like links)        │
├──────────────────────────────────────────────┤
│              Cloudflare Worker API            │
│   Wraps social/*.mjs scripts as HTTP endpoints│
├──────────────────────────────────────────────┤
│              Supabase (shared)                │
│   Auth · User profiles · Platform tokens      │
│   Credit balances · Post history              │
├──────────────────────────────────────────────┤
│         Platform APIs (external)              │
│   X · Bluesky · LinkedIn · Meta · TikTok      │
└──────────────────────────────────────────────┘
```

---

## Phases

### Can obtain api credentials from providers

https://zernio.com/pricing
https://bundle.social/pricing

### Phase 1 — Core API (current → next)

**Goal:** Turn the existing `.mjs` scripts into a deployable API.

- [ ] Cloudflare Worker that wraps `social/*.mjs` as HTTP endpoints
- [ ] `POST /api/post` — post to one or more platforms
- [ ] `GET /api/metrics/:platform/:id` — read metrics for a post
- [ ] Platform token storage in Supabase (encrypted at rest)
- [ ] Rate limiting per user per platform
- [ ] `wrangler.toml` with routes, secrets, and KV bindings

### Phase 2 — Auth & Account Linking

**Goal:** Users connect their social accounts through the shared cnxt auth system.

- [ ] Centralized login via shared Supabase auth (auth.cnxt.to)
- [ ] OAuth flow per platform surfaced through the API
- [ ] Token refresh handling (Meta tokens expire every 60 days, etc.)
- [ ] Platform connection status in user profile
- [ ] BYOK key entry and validation for X

### Phase 3 — Dashboard UI

**Goal:** A web interface to compose, schedule, and review posts.

- [ ] Compose view — write once, select target platforms
- [ ] Platform preview — see how the post will look on each platform
- [ ] Post history — list of past posts with per-platform status
- [ ] Metrics dashboard — aggregated engagement across platforms
- [ ] Credit balance display (for X credit users)
- [ ] Mobile-responsive, similar design language to links dashboard

### Phase 4 — Credits & Monetization

**Goal:** Optional prepaid credits for X posting.

- [ ] Credit purchase flow (Stripe payment link or similar)
- [ ] Credit balance tracking in Supabase
- [ ] Per-post credit deduction for X
- [ ] Low-balance warnings
- [ ] Usage history and receipts

### Phase 5 — Advanced Features

**Goal:** Differentiators that make cnxt-to-post better than alternatives.

- [ ] Post scheduling (queue posts for future date/time)
- [ ] Thread support — auto-split long posts into X threads
- [ ] Cross-platform thread mapping (X thread → LinkedIn carousel, etc.)
- [ ] Hashtag suggestions per platform
- [ ] Best-time-to-post analytics
- [ ] RSS/Atom feed → auto-post (connect a blog, post when new content)
- [ ] Recurring posts (e.g., weekly promo tweet)

---

## Pricing Philosophy

| Feature | Cost |
|---|---|
| All platforms except X | Free |
| X via BYOK | Free |
| X via credits | Pay-as-you-go (~$0.01/post, subject to X API pricing) |
| Post scheduling | Free |
| Metrics dashboard | Free |
| API access (for devs) | Free with rate limits |

The only thing that costs money is X API access — and you can avoid that entirely by bringing your own keys. Display ads on the dashboard may help cover infrastructure costs for free-tier users.

---

## Current Status

| Component | Status |
|---|---|
| Per-platform post scripts | ✅ Done (`social/*-post.mjs`) |
| Per-platform metrics scripts | ✅ Done (`social/*-metrics.mjs`) |
| Per-platform auth scripts | ✅ Done (`social/*-auth.mjs`, `social/auth/*.mjs`) |
| API reference docs | ✅ Done (`SOCIAL_API_REFERENCE.md`) |
| Cloudflare Worker API | ✅ Done (`src/index.ts`) |
| Database schema | ✅ Done (`supabase/setup.sql`) |
| Dashboard UI (redesigned) | ✅ Done (`dashboard/`) |
| Central auth integration | ✅ Done (Supabase auth) |
| Token encryption | ✅ Done (AES-256-GCM) |
| Credit system | ⏳ Not started |
| Post scheduling (queue) | ✅ Backend done, UI pending |
| Drafts feature | ✅ Backend done, UI pending |
| Hashtag Manager | ✅ Backend done, UI pending |
| Saved Replies | ✅ Backend done, UI pending |
| Unified Inbox | ⏳ Backend & UI pending |
| Analytics Dashboard | ✅ Backend done, UI pending |

---

## Recent Implementation Notes

### ✅ Completed (January 2026)
- **Infrastructure**: Complete API backend in Cloudflare Workers with TypeScript
- **Database**: Full PostgreSQL schema with RLS policies, 10+ tables for production
- **Security**: AES-256-GCM token encryption with PBKDF2 key derivation
- **Auth**: OAuth flows for all 7 platforms (Bluesky, X, LinkedIn, Facebook, Instagram, Threads, TikTok)
- **Logging**: Structured error logging with correlation IDs
- **Health**: Enhanced health monitoring and status endpoints
- **UI**: Redesigned dashboard with sidebar navigation, modern design system

### ✅ Backend API Endpoints Completed
All 6 high-priority features have complete API implementations:
- **Drafts**: `GET/POST/DELETE /api/drafts` — Content library for saving and reusing posts
- **Hashtag Manager**: `GET/POST/DELETE /api/hashtags` — Organize hashtag groups by platform
- **Saved Replies**: `GET/POST/DELETE /api/replies/templates` — Quick reply templates
- **Queue**: `GET/POST/DELETE /api/queue` + `POST /api/queue/refill` + Cron job — Post scheduling with auto-refill
- **Analytics**: `GET /api/analytics` + `GET /api/analytics/trends` — Cross-platform performance tracking
- **Inbox**: Database schema ready, endpoint handlers planned

### ⏳ UI Components (January 2026)
- **HTML Structure**: All view sections added (Drafts, Hashtags, Replies, Queue, Inbox, Analytics)
- **CSS Styles**: Complete styling for all new features with modal support
- **JavaScript**: Feature handlers implemented for Drafts, Hashtags, Replies, Queue, Analytics
- **Navigation**: Sidebar navigation updated with all new feature links

### ⏳ Still Needs Work

#### Unified Inbox (High Effort)
- **Backend**: Need to implement comment fetching from all platform APIs
- **UI**: Inbox list exists in HTML, needs comment rendering logic
- **Reply functionality**: Handlers for posting replies to each platform
- **Real-time updates**: WebSocket or polling for new comments

#### Queue Scheduling
- **Cron job**: Needs Cloudflare Cron Triggers configuration in wrangler.toml
- **Timezone handling**: User timezone preferences for scheduling
- **Calendar UI**: Visual calendar for managing scheduled posts

#### Analytics Enhancements
- **Charts/graphs**: Visual data visualization (Chart.js or similar)
- **Trend lines**: Better trend analysis over time
- **Platform comparison**: Side-by-side performance metrics

#### Mobile Responsiveness
- **Compose interface**: Better mobile experience for media upload
- **Feature views**: Optimize new features for mobile screens
- **Touch interactions**: Gesture support for swiping between views

#### Testing & Deployment
- **Integration tests**: API endpoint testing
- **E2E tests**: Full user flows (compose → post → analytics)
- **CI/CD**: GitHub Actions workflow refinement
- **Monitoring**: Production error tracking and performance monitoring

---

## Tech Stack

- **API:** Cloudflare Workers (TypeScript)
- **Auth:** Supabase (shared across cnxt ecosystem)
- **Dashboard:** Cloudflare Pages, vanilla JS/TS or lightweight framework
- **Storage:** Supabase (user data, tokens, post history)
- **Secrets:** Cloudflare Worker secrets (platform API keys, encryption keys)
- **Credits/Payments:** Stripe Payment Links or Stripe Checkout
