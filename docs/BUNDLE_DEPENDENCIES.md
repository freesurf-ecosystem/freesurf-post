# Bundle.social Dependencies

## Platform credentials (biggest one — Bundle holds all OAuth tokens)
Teams
Connect/OAuth flows
Channel/page selection
Media uploads
Posting on all 8 platforms
Instagram auto-fit/crop
Scheduling/deferred publishing
Analytics
Comments
Post history import
X metered pricing + quotas
The org x-api-key everything hinges on


> Status: **Proxy Bundle for now; rebuild these pieces ourselves over the next
> couple of months.** This document is the source of truth for everything we
> currently rely on Bundle.social for. Each item notes the Bundle endpoint(s) we
> call, our wrapper, and what replacing it will require.

All calls authenticate with `x-api-key: $SOCIAL_API_PROVIDER_KEY` against
`https://api.bundle.social/api/v1`. Our organization id:
`efa77093-6a09-4865-ba9e-2ff5a2887cea`.

## Migrating map

| Platform | Sandbox/Staging Access | Production Posting Access | Key Review Hurdle |
|---|---|---|---|
| Instagram / Facebook | Instant | 14 – 20 Days | Strict screencast audit & business details |
| TikTok | Instant | 1 – 4 Weeks | Company paperwork & full flow video |
| LinkedIn | Instant | 1 – 2 Weeks (Profile) / Months (Company) | Restricted product application |
| Google Business | None | 7 – 14 Days | Account age check (60+ days verified) |
| Pinterest | Instant | 3 – 7 Days | Video submission of functional app |
| YouTube | Instant | Instant (Restricted Quotas) | Manual audit only if requesting quota lift |
| Twitter/X | Instant | Instant | Paid tier selection dictates volume capabilities |
| Snapchat | Instant | 1 – 2 Weeks | Human review of app functionality |
| Threads, Reddit | Instant | Instant | Completely automated developer onboarding |
| Slack, Discord | Instant | Instant | Self-service bot token generation |
| Mastodon, Bluesky | Instant | Instant | Open network / Instance-level generation |

## Current listed
- bluesky
- X
- Linkedin
- Facebook
- Instagram
- Threads
- Tiktok
- Youtube

## Other bundle.socials
- Reddit
- Pinterest
- Slack
- Discord
- Google Business
- Snapchat
- Mastodon


## Outside of bundle.social
wordpress
medium
dev.to
hashnode
skool
whop

decentralized
Nostr
Lemmy
warpcast
dribble
mewe

live stream
twitch
kick

messaging
telegram
what's app?

## URLs

* Instagram & Facebook (Meta Graph API): Meta for Developers Portal. [Meta App Review Dashboard](https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review/submission-guide).
* TikTok: the TikTok for Developers Portal (https://developers.tiktok.com/)
* LinkedIn: LinkedIn Developer Portal (https://developer.linkedin.com/).
* Pinterest: Pinterest Developer Platform.
* Google Business Profile: inside the Google Cloud Console, the Google Business Profile API.
* Twitter/X: X Developer Portal.
* YouTube: Google Cloud Console YouTube Data API page.
* Threads: inside the Meta Developer Dashboard.
* Snapchat: Snap Kit Developer Portal.
* Reddit: Reddit App Preferences (https://www.reddit.com/prefs/apps)
* Slack: Slack API Portal.
* Discord: Discord Developer Portal (https://discord.com/developers/applications).
* Mastodon: Because it is decentralized, applications are built directly on whichever instance you host your account on. Navigate to your server's settings page: https://[your-instance-domain]/settings/applications.
* Bluesky: No specific portal developer sign-up is required. You can generate immediate code-based security credentials directly inside your standard profile account settings under the Bluesky App Passwords Management Panel.

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


## Dependency map: graduating off Bundle

What Bundle.social absorbs for us today, and what we'd own to go direct
(Postiz-style: our own platform apps + OAuth), so Bundle becomes a pure fallback.

### Bundle vs. own-apps (Postiz-style)

| Concern | Bundle.social (now) | Own app |
|---|---|---|
| Credentials | They own the approved platform apps; we hold one API key (`SOCIAL_API_PROVIDER_KEY`) | We register our own TikTok/Meta/etc. apps; we hold client_id/secret per platform |
| OAuth flow | Hosted portal ("Connect") | We build authorize/authenticate/callback per platform |
| Token storage + refresh | They handle it | We store per-user tokens (encrypted) + run a refresh worker |
| App review | Already passed for us | We pass each platform (TikTok: unaudited app → private-account-only posting; Meta: business verification + permission review) |
| Re-auth / revoked tokens | Their problem | Ours (surface a "reconnect" action) |
| Rate limits / caps | Their tier + platform quotas | Direct platform limits (e.g., TikTok daily active-user cap) |
| Analytics / comments | Their normalized API | We aggregate from each platform's API |


### Key api difficulties

- Access tokens expire (~24h TikTok) but auto-refresh via a background task — not the scary part.
- App credentials (client_id/secret) don't expire; they're static until rotated.
- The real frictions are: **one-time app review** (days–weeks) and **occasional re-auth**.


---

## 1. Platform credentials (biggest dependency)

Bundle stores the OAuth/API tokens for every connected social account. **We never
see or store platform tokens** — we only hold a mapping to a Bundle team.

- Bundle: internal (per social account, per platform)
- Our wrapper: `post_bundle_teams` (team ↔ user mapping), `/api/bundle-accounts`
- To replace: implement + store our own OAuth flows and refresh tokens per
  platform (X OAuth 1.0a/2.0, LinkedIn, Meta/FB+IG, Threads, TikTok, YouTube,
  Bluesky).

## 2. Teams

- Bundle: `POST /api/v1/team`, `GET /api/v1/team/{id}`, `DELETE /api/v1/team/{id}`
- Our wrapper: `getOrCreateBundleTeam()`, `GET/POST /api/teams`,
  `PATCH/DELETE /api/teams/:id`, `POST /api/teams/:id/activate`
- Note: free tier caps at 3 teams.
- To replace: teams are just our own table (`post_bundle_teams`) — drop the
  Bundle team and key posting off a plain `user_id` → platform-accounts mapping.

## 3. Connecting social accounts (OAuth)

- Bundle: `POST /api/v1/social-account/connect` (returns a redirect URL we send
  the user to; Bundle hosts the OAuth UI)
- Our wrapper: connect redirect + `/api/connect/:platform` callback handling,
  Instagram direct method, Facebook `withBusinessScope`
- To replace: host our own OAuth flows (the connect URL + callback per platform).

## 4. Channel / page selection (LinkedIn, Facebook, YouTube, Instagram)

- Bundle: `POST /api/v1/social-account/set-channel`,
  `POST /api/v1/social-account/refresh-channels`,
  `POST /api/v1/social-account/unset-channel`
- Our wrapper: `POST /api/channel/:platform` (set/refresh/unset), select dropdowns
  in the Accounts tab, compose-page reminder
- To replace: native page/channel APIs (LinkedIn company pages, Meta pages,
  YouTube channels).

## 5. Media uploads

- Bundle: `POST /api/v1/upload/` (multipart), `POST /api/v1/upload/from-url`
- Our wrapper: `POST /api/media/upload` (multipart), `POST /api/media` (by URL)
- Note: uploads are scoped to a Bundle team; Bundle returns `uploadId`.
- To replace: our own object storage + image/video processing + CDN URLs.

## 6. Posting / publishing (all platforms)

- Bundle: `POST /api/v1/post` (we send `status: SCHEDULED` + `postDate: now`)
- Our wrapper: `postViaProvider()` used by `POST /api/post`, `POST /api/schedule`,
  and the cron
- Bundle: `GET /api/v1/post/{id}`, `GET /api/v1/post?teamId=` for permalinks and
  history
- Our wrapper: `GET /api/bundle-posts`, `GET /api/bundle-posts/:id`,
  `extractBundlePostUrl()`
- To replace: per-platform publishing adapters (X, LinkedIn, Meta, Threads,
  TikTok, YouTube, Bluesky) + our own media attachment logic.

## 7. Instagram image auto-fit / auto-crop

- Bundle: `data.INSTAGRAM.autoFitImage` / `data.INSTAGRAM.autoCropImage`
  (mutually exclusive, feed `type: POST` only)
- Our wrapper: `instagramImageFit` param on `POST /api/post` (default `"fit"`)
- To replace: our own image transform (pad-to-ratio or center-crop) on upload.

## 8. Scheduling / deferred publishing

- Our cron (`*/5 * * * *`) finds due `post_posts` and calls Bundle's
  `POST /api/v1/post` at that time; Bundle actually delivers to platforms.
- To replace: our own publish workers + per-platform scheduling once adapters
  exist (item 6).

## 9. Analytics

- Bundle: `GET /api/v1/analytics/post?postId=`,
  `GET /api/v1/analytics/social-account?teamId=`
- Our wrapper: `/api/analytics`
- To replace: native per-platform metrics APIs or third-party analytics.

## 10. Comments / engagement

- Bundle: `POST /api/v1/comment/import`, `GET /api/v1/comment/import/comments`
  (import existing comments, reply flow)
- Our wrapper: comment endpoints (stubs), Comments tab
- To replace: native comment APIs per platform (notably Instagram, TikTok, X).

## 11. Post history import

- Bundle: `POST /api/v1/post-import` (async backfill)
- Our wrapper: `POST /api/import`
- To replace: per-platform history APIs + a backfill worker.

## 12. X metered pricing & quotas

- Bundle: X is billed per action ($0.015 plain/media, $0.20 with a link) against
  Bundle credits; our `has_link` detection mirrors this for UX.
- Bundle free-tier caps: 3 teams, ~20 posts/month (blocked the Instagram test).
- Our wrapper: `has_link` flag, KV-backed rate limits (30/min, 50/day, 300/mo),
  link warning in compose.
- To replace: direct X API billing via our own X keys, plus our own billing
  (Stripe top-ups, pass-through fees + Stripe fees/taxes).
- Note: Bundle's quote endpoint prices the action you request — it does not scan
  text for links — so we classify links ourselves (liberal `word.word` regex).
  When we post X directly, X's `/2/tweets` response returns the actual metered
  cost, removing the guesswork entirely.

## 13. API key for all of the above

- We authenticate every Bundle call with the single org `x-api-key`
  (`SOCIAL_API_PROVIDER_KEY`). Losing/rotating it breaks everything.

---

## Rebuild priority (suggested)

1. **Our own X adapter** (already partially planned — `postToX` + BYOK exists).
2. **Bluesky** (simple API, app passwords).
3. **Threads / Meta (FB + IG)**, **LinkedIn**, **TikTok**, **YouTube**.
4. **Media storage + transform** (replace upload + Instagram fit/crop).
5. **Billing** (Stripe) replacing Bundle credits/quota.
