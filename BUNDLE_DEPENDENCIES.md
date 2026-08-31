# Bundle.social Dependencies

> Status: **Proxy Bundle for now; rebuild these pieces ourselves over the next
> couple of months.** This document is the source of truth for everything we
> currently rely on Bundle.social for. Each item notes the Bundle endpoint(s) we
> call, our wrapper, and what replacing it will require.

All calls authenticate with `x-api-key: $SOCIAL_API_PROVIDER_KEY` against
`https://api.bundle.social/api/v1`. Our organization id:
`efa77093-6a09-4865-ba9e-2ff5a2887cea`.

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
