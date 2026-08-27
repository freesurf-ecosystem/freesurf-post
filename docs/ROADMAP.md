# Post by FreeSurf

[ ] Set up resend for confirmation email handling/ confirmation page
[ ] oauth set up with apple/ google
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

---

## X / Twitter Cost Strategy

Owned Reads (ie reads related to your own profile) = $0.001
Post w/o url = $0.015
Posts w/ URL = $0.20 


---

## Architecture

```

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
