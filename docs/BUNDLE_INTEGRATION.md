# Bundle.social Integration Strategy

## All 15 Bundle platforms

| Bundle platform | cnxt-to-post name | Posting | Analytics | Comments | Reels/Stories |
|---|---|---|---|---|---|
| BLUESKY | bluesky | ✅ | ✅ | ✅ | — |
| TWITTER | x | ✅ | ❌ (X doesn't provide) | ❌ | — |
| LINKEDIN | linkedin | ✅ | ✅ | ✅ | — |
| FACEBOOK | facebook | ✅ | ✅ | ✅ | ✅ |
| INSTAGRAM | instagram | ✅ | ✅ | ✅ | ✅ |
| THREADS | threads | ✅ | ✅ | ✅ | — |
| TIKTOK | tiktok | ✅ | ✅ | ✅ | — |
| YOUTUBE | youtube | ✅ | ✅ | ✅ | Shorts ✅ |
| PINTEREST | pinterest | ✅ | ✅ | — | — |
| REDDIT | reddit | ✅ | Limited | ✅ | — |
| MASTODON | mastodon | ✅ | Limited | ✅ | — |
| DISCORD | discord | ✅ | ❌ | ✅ | — |
| SLACK | slack | ✅ | ❌ | ✅ | — |
| GOOGLE_BUSINESS | google_business | ✅ | ✅ | — | — |
| SNAPCHAT | snapchat | ✅ | ✅ | — | ✅ |

## What Bundle.social provides

Every feature below is accessible through their REST API. We proxy calls through our Worker so the dashboard never touches Bundle directly.

| Category | What Bundle does | Our status |
|---|---|---|
| **Posting** | Text, images, video, carousel, Reels, Stories, Shorts, polls, threads, link previews, alt text, first comment, platform-specific formatting | ✅ Proxied via postViaProvider() |
| **Scheduling** | postDate field, status SCHEDULED/DRAFT | ✅ Calendar UI calls Bundle |
| **Account connect** | Hosted OAuth portal, custom UI flow, channel selection (Pages, channels, locations) | ✅ Portal link via /api/connect/:platform |
| **Analytics** | Normalized across platforms, 30-day retention, force refresh, raw data, profile + post metrics | Need to wire |
| **Comments** | Import, thread, reply, moderate (hide/delete/like), text limits per platform | Need to wire |
| **Media upload** | Up to 5GB, transcoding, validation, URL upload | Need to wire |
| **Post history import** | Pull past posts + analytics, 100 posts per import | Need to wire |
| **Bulk CSV posting** | Async processing with per-row results | Optional |
| **Webhooks** | post.published, post.failed events | Optional |
| **Rate limit tracking** | Daily per-platform caps, monthly org caps, usage queries | ✅ Bundle handles |
| **Link-in-bio** | Built in | We have cnxt-to-links |

## Pricing

| Tier | Posts/mo | Cost | Good for |
|---|---|---|---|
| Free | 20 | $0 | Testing, personal use |
| Pro | 10,000 | $100/mo | Launch MVP |
| Business | 100,000 | $400/mo | Scaling |

No per-account, per-seat, or per-user fees.

## Bundle Social Rate Limits

External Platform Rate Limits
These are daily limits per connected social account, counted per UTC calendar day by the post’s scheduled date. The quota is keyed by the platform account itself (platform + account id), not by the connection or the team — so the same real account connected more than once (reconnected, or added to multiple teams) shares a single quota.
​
Posting daily limits per platform per tier
Platform	FREE	PRO	BUSINESS
TWITTER	5	15	15
FACEBOOK	10	50	100
INSTAGRAM	10	50	100
LINKEDIN	10	18	24
YOUTUBE	10	10	15
TIKTOK	5	10	15
THREADS	10	200	250
PINTEREST	10	24	36
REDDIT	10	24	36
DISCORD	10	100	200
SLACK	10	100	200
MASTODON	10	50	100
BLUESKY	10	50	100
GOOGLE_BUSINESS	10	20	40
SNAPCHAT	5	20	40

## What we've already built

| Feature | Status | Notes |
|---|---|---|
| Cross-posting API (7 platforms) | ✅ | Direct adapters for Bluesky, X, LinkedIn, Facebook, Instagram, Threads, TikTok |
| Schedule + calendar | ✅ | API + UI |
| Dashboard | ✅ | Compose, schedule, history, accounts, API docs |
| Mobile app | ✅ | React Native scaffold |
| Cross-domain auth | ✅ | Shared Supabase cookie |
| Metrics API | ✅ | Per-platform endpoints |
| Replies API | ✅ | Bluesky done, others stubbed |
| Multi-profile | ✅ | Schema + UI supports it |
| OAuth scripts | ✅ | Node.js scripts for all platforms |

## Strategy: three phases

### Phase 1 — MVP (now, using Bundle)

**Goal:** Get the app working end-to-end as fast as possible.

Use Bundle.social for:
- Posting to all 15 platforms (including Reddit, Pinterest, Mastodon, Discord, Slack, Snapchat, Google Business)
- Analytics dashboard
- Comment import and replies
- Media uploads
- OAuth account connection (hosted flow — user clicks "Connect", Bundle handles the OAuth)

What we keep from our own code:
- Dashboard UI (already built, just point it at Bundle via our Worker)
- Scheduling calendar (Bundle accepts postDate for scheduling)
- Cross-domain auth (already working)
- Our direct platform adapters as fallback

**Estimated time to MVP:** Today. Worker already calls Bundle. Just need to connect accounts in Bundle dashboard and wire the UI.

### Phase 2 — Gradual replacement (next weeks)

Replace Bundle features one at a time with our own implementations:

1. **Bluesky** — already fully built, no Bundle needed
2. **X/Twitter** — already have OAuth 1.0a implementation
3. **LinkedIn + Facebook + Instagram + Threads** — build OAuth flow, use direct adapters
4. **Analytics** — build our own aggregation from per-platform metrics endpoints
5. **Comments** — extend replies API to more platforms
6. **Media** — simple Supabase Storage upload

### Phase 3 — Bundle as fallback only (long term)

Bundle becomes a safety net. If our direct adapter fails for any platform, fall back to Bundle. New platforms we haven't built yet route through Bundle until we build them.

## Implementation plan for today

```
User connects accounts in Bundle.social dashboard (one-time)
       ↓
Posts created through cnxt-to-post dashboard → Worker → Bundle.social API
       ↓
Bundle publishes to all platforms, handles retries, returns results
       ↓
Analytics fetched through Bundle and displayed in our dashboard
```

### What we need to do

1. ✅ Worker already calls Bundle with SOCIAL_API_PROVIDER_KEY + BUNDLE_TEAM_ID
2. ✅ postViaProvider() maps our platform names to Bundle's format
3. Need: Dashboard "Connect" buttons → Bundle hosted OAuth flow
4. Need: Dashboard analytics tab → Bundle analytics endpoints
5. Need: Dashboard comments view → Bundle comment API
6. Need: Worker metrics + replies endpoints → proxy to Bundle

### For today: minimal wiring

- Post flow: ✅ Already works through provider fallback
- Account connection: Give users a link to Bundle dashboard to connect accounts (until we build OAuth UI)
- Analytics: Add GET /api/analytics/proxy endpoint that calls Bundle
- Comments: Add GET /api/replies proxy + POST /api/reply proxy for Bundle
