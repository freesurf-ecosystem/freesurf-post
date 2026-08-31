# Social API Quick Reference — Post, Metrics, Login

Bare essentials per platform for building cross-platform posting/reading scripts.

> **Transition scope:** we're moving **posting** off bundle.social first — each platform
> below has its own direct adapter (`src/platforms/*`). **Comments/replies and analytics
> intentionally stay on bundle.social for now** (their endpoints are in `BUNDLE_DEPENDENCIES.md`);
> they're the next layer to rebuild only after posting is solid. This doc is the map for
> when we get there.

## Platform API docs

| Platform | API docs | Developer portal (get keys) |
|---|---|---|
| X (Twitter) | [docs.x.com](https://docs.x.com/x-api/tweets/manage-tweets) | [developer.x.com](https://developer.x.com/en/portal/dashboard) |
| LinkedIn | [learn.microsoft.com](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) | [linkedin.com/developers](https://www.linkedin.com/developers/apps) |
| Instagram | [developers.facebook.com](https://developers.facebook.com/docs/instagram-platform/content-publishing) | [developers.facebook.com/apps](https://developers.facebook.com/apps) |
| Facebook | [developers.facebook.com](https://developers.facebook.com/docs/graph-api/reference/page/feed) | [developers.facebook.com/apps](https://developers.facebook.com/apps) |
| Threads | [developers.facebook.com](https://developers.facebook.com/docs/threads) | [developers.facebook.com/apps](https://developers.facebook.com/apps) |
| TikTok | [developers.tiktok.com](https://developers.tiktok.com/products/content-posting-api) | [developers.tiktok.com/apps](https://developers.tiktok.com/apps) |
| YouTube | [developers.google.com](https://developers.google.com/youtube/v3/docs/videos/insert) | [console.cloud.google.com](https://console.cloud.google.com/apis/credentials) |
| Bluesky | [docs.bsky.app](https://docs.bsky.app/docs/get-started) | [bsky.app/settings](https://bsky.app/settings/app-passwords) |
| Pinterest | [developers.pinterest.com](https://developers.pinterest.com/docs/api/overview/) | [developers.pinterest.com](https://developers.pinterest.com) |
| Reddit | [reddit.com/dev/api](https://www.reddit.com/dev/api/) | [reddit.com/dev](https://www.reddit.com/dev/) |
| Mastodon | [docs.joinmastodon.org](https://docs.joinmastodon.org/api/) | — |
| Discord | [discord.com/developers](https://discord.com/developers/docs/resources/webhook) | [discord.com/developers/applications](https://discord.com/developers/applications) |
| Slack | [api.slack.com](https://api.slack.com/messaging/webhooks) | [api.slack.com](https://api.slack.com) |
| Google Business | [developers.google.com](https://developers.google.com/my-business/reference/rest) | [developers.google.com](https://developers.google.com/my-business) |
| Snapchat | [developers.snap.com](https://developers.snap.com/api/marketing/) | [developers.snap.com](https://developers.snap.com) |

## Auth cheat sheet

| Platform | Auth | Complexity | Get Keys |
|---|---|---|---|
| X | OAuth 1.0a | Medium | [developer.x.com](https://developer.x.com/en/portal/dashboard) |
| LinkedIn | OAuth 2.0 Bearer | Low | [linkedin.com/developers](https://www.linkedin.com/developers/apps) |
| Instagram | Facebook OAuth | Medium | [developers.facebook.com](https://developers.facebook.com/apps) |
| Facebook | Facebook OAuth | Medium | [developers.facebook.com](https://developers.facebook.com/apps) |
| TikTok | OAuth 2.0 (Login Kit) | Medium | [developers.tiktok.com](https://developers.tiktok.com/apps) |
| Threads | Facebook OAuth 2.0 | Low | [developers.facebook.com](https://developers.facebook.com/apps) |
| Bluesky | App Password or OAuth 2.0 + DPoP | Low / High | [bsky.app/settings](https://bsky.app/settings/app-passwords) |
| YouTube | Google OAuth 2.0 | Low | [console.cloud.google.com](https://console.cloud.google.com/apis/credentials) |

## X (Twitter)

| | URL |
|---|---|
| **🔑 Get API keys** | [developer.x.com/en/portal/dashboard](https://developer.x.com/en/portal/dashboard) — create a Project & App, then Keys & Tokens |
| **Post / Reply** | `POST https://api.x.com/2/tweets` → [docs](https://docs.x.com/x-api/tweets/manage-tweets) |
| **Delete** | `DELETE https://api.x.com/2/tweets/:id` → [docs](https://docs.x.com/x-api/tweets/manage-tweets) |
| **Read tweet** | `GET https://api.x.com/2/tweets/:id` → [docs](https://docs.x.com/x-api/tweets/lookup) |
| **Read metrics** | `GET https://api.x.com/2/tweets/:id?tweet.fields=public_metrics` → [docs](https://docs.x.com/x-api/tweets/lookup) |
| **Read replies** | `GET https://api.x.com/2/tweets/search/recent?query=conversation_id::tweet_id` → [docs](https://docs.x.com/x-api/tweets/search) |
| **Reply / reply to a reply** | `POST https://api.x.com/2/tweets` with `reply:{in_reply_to_tweet_id:<id>}` → [docs](https://docs.x.com/x-api/tweets/manage-tweets) |
| **Analytics (post)** | `public_metrics` on the tweet lookup: `like_count,retweet_count,reply_count,quote_count,impression_count` |
| **Login** | OAuth 1.0a 3-legged flow → [docs](https://docs.x.com/resources/fundamentals/authentication/obtaining-user-access-tokens) |

Auth: OAuth 1.0a (4 keys) for posting/deleting, Bearer token for reading. ⚠️ Already implemented in `scripts/x-*.mjs`.

---

## LinkedIn

| | URL |
|---|---|
| **🔑 Get API keys** | [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps) — create an app, request `Community Management API` product |
| **Post** (text, image, video, article, poll) | `POST https://api.linkedin.com/rest/posts` → [docs](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) |
| **Get post** | `GET https://api.linkedin.com/rest/posts/{urn}` → [docs](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api#get-posts-by-urn) |
| **Find posts by author** | `GET https://api.linkedin.com/rest/posts?author={urn}&q=author` → [docs](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api#find-posts-by-authors) |
| **Delete** | `DELETE https://api.linkedin.com/rest/posts/{urn}` → [docs](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api#delete-posts) |
| **Read metrics** | Use post URN + [social metadata API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/social-metadata-api) for likes/comments/shares |
| **Comment on a post** | `POST https://api.linkedin.com/rest/posts/{postUrn}/comments` → [docs](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/comments-api) |
| **Read comments** | `GET https://api.linkedin.com/rest/posts/{postUrn}/comments` |
| **Login** | OAuth 2.0 Authorization Code Flow → [docs](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow) |

Auth: OAuth 2.0 Bearer. Headers: `Linkedin-Version: YYYYMM`, `X-Restli-Protocol-Version: 2.0.0`

---

## Instagram (via Facebook Graph API)

Note: Requires Professional account (Business/Creator) connected to a Facebook Page.

| | URL |
|---|---|
| **🔑 Get API keys** | [developers.facebook.com/apps](https://developers.facebook.com/apps) — create a Meta app, add Instagram Graph API product |
| **Post** (image, video, carousel, reel, story) | `POST https://graph.facebook.com/v25.0/{IG_USER_ID}/media` → `POST …/media_publish` → [docs](https://developers.facebook.com/docs/instagram-platform/content-publishing) |
| **Get media** | `GET https://graph.facebook.com/v25.0/{IG_USER_ID}/media` → [docs](https://developers.facebook.com/docs/instagram-api/reference/ig-user/media) |
| **Read metrics** | `GET https://graph.facebook.com/v25.0/{IG_MEDIA_ID}/insights?metric=impressions,reach,likes` → [docs](https://developers.facebook.com/docs/instagram-api/reference/ig-media/insights) |
| **Read comments** | `GET https://graph.facebook.com/v25.0/{IG_MEDIA_ID}/comments` |
| **Reply to a comment** | `POST https://graph.facebook.com/v25.0/{IG_COMMENT_ID}/replies` (`message`) |
| **Login** | Facebook Login for Business → exchange for Page token → [docs](https://developers.facebook.com/docs/facebook-login) |

Auth: Facebook OAuth. Permissions: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`. Rate limit: 100 posts/24h.

---

## Facebook Pages

| | URL |
|---|---|
| **🔑 Get API keys** | [developers.facebook.com/apps](https://developers.facebook.com/apps) — same Meta app as Instagram, add Facebook Login product |
| **Post** | `POST https://graph.facebook.com/v25.0/{page-id}/feed` → [docs](https://developers.facebook.com/docs/graph-api/reference/page/feed) |
| **Read posts** | `GET https://graph.facebook.com/v25.0/{page-id}/feed` → [docs](https://developers.facebook.com/docs/graph-api/reference/page/feed) |
| **Read metrics** | `GET https://graph.facebook.com/v25.0/{post-id}/insights` → [docs](https://developers.facebook.com/docs/graph-api/reference/post/insights) |
| **Read comments** | `GET https://graph.facebook.com/v25.0/{post-id}/comments` |
| **Comment on a post** | `POST https://graph.facebook.com/v25.0/{post-id}/comments` (`message`) |
| **Login** | Facebook Login → [docs](https://developers.facebook.com/docs/facebook-login) (same as Instagram) |

Auth: Facebook OAuth. Permissions: `pages_manage_posts`, `pages_read_engagement`. Latest Graph API: v25.0.

---

## TikTok

| | URL |
|---|---|
| **🔑 Get API keys** | [developers.tiktok.com/apps](https://developers.tiktok.com/apps) — create an app, request Content Posting API access |
| **Post** | Content Posting API → [docs](https://developers.tiktok.com/products/content-posting-api) |
| **Read videos** | Display API: `GET /v2/video/list/` + `GET /v2/video/query/` → [docs](https://developers.tiktok.com/doc/display-api-get-started) |
| **Read metrics** | Included in Display API video query responses |
| **List comments** | `GET https://open.tiktokapis.com/v2/comment/list/?video_id={id}` → [docs](https://developers.tiktok.com/doc/comment-api-get-started) |
| **Reply to a comment** | `POST https://open.tiktokapis.com/v2/comment/reply/` (`comment_id`, `reply_text`) |
| **Login** | Login Kit (OAuth 2.0) → [docs](https://developers.tiktok.com/products/login-kit) |

Auth: OAuth 2.0 via Login Kit. Content Posting API requires separate app review.

---

## Threads (via Meta Graph API)

Note: Requires the Threads API product added to your Meta app. Same OAuth flow as Instagram/Facebook.

| | URL |
|---|---|
| **🔑 Get API keys** | [developers.facebook.com/apps](https://developers.facebook.com/apps) — same Meta app as Instagram/Facebook, add Threads API product |
| **Post** (text, image, video, carousel) | Two-step: `POST https://graph.threads.net/v1.0/{threads-user-id}/threads` → `POST …/threads_publish` → [docs](https://developers.facebook.com/docs/threads) |
| **Read post / metrics** | `GET https://graph.threads.net/v1.0/{media-id}?fields=id,text,permalink,media_url,insights` → [docs](https://developers.facebook.com/docs/threads) |
| **Read replies** | `GET https://graph.threads.net/v1.0/{media-id}/replies` → [docs](https://developers.facebook.com/docs/threads) |
| **Reply to a thread** | `POST https://graph.threads.net/v1.0/{threads-user-id}/threads` with `reply_to_media_id` → then `…/threads_publish` |
| **Analytics** | `GET https://graph.threads.net/v1.0/{media-id}/insights` (limited metrics) |
| **Login** | Facebook Login for Business → same as Instagram → [docs](https://developers.facebook.com/docs/facebook-login) |

Auth: Facebook OAuth 2.0. Permissions: `threads_basic`, `threads_content_publish`, `threads_manage_replies`. Rate limit: 250 posts/24h per user. Graph API v25.0.

Text-only posts are supported (unlike Instagram which requires media).

---

## Bluesky (AT Protocol)

| | URL |
|---|---|
| **🔑 Get API keys** | [bsky.app/settings/app-passwords](https://bsky.app/settings/app-passwords) — create an App Password (no developer app needed!) |
| **Post** | `POST https://bsky.social/xrpc/com.atproto.repo.createRecord` → [docs](https://docs.bsky.app/docs/get-started) |
| **Read post / metrics** | `GET https://bsky.social/xrpc/app.bsky.feed.getPosts?uris=...` → [docs](https://docs.bsky.app/docs/get-started) |
| **Delete** | `POST https://bsky.social/xrpc/com.atproto.repo.deleteRecord` |
| **Reply** | `POST https://bsky.social/xrpc/com.atproto.repo.createRecord` — record `app.bsky.feed.post` with `reply:{root,parent}` |
| **Read thread / replies** | `GET https://bsky.social/xrpc/app.bsky.feed.getPostThread?uri=...&depth=1` |
| **Analytics (post)** | `postView.likeCount / repostCount / replyCount` from `getPosts`/`getPostThread` |
| **Login** | App Password → `POST /xrpc/com.atproto.server.createSession` → [docs](https://docs.bsky.app/docs/get-started) |
| **OAuth (complex)** | OAuth 2.0 + DPoP + PKCE + PAR → [docs](https://docs.bsky.app/docs/advanced-guides/oauth-client) |

Auth: App Password (simplest), or full OAuth 2.0 with DPoP for "Login with Bluesky" (complex, needs `@atproto/api` SDK).

---

## YouTube (Google Data API v3)

Note: Video uploads use resumable upload, not simple REST. Best for short-form video cross-posting.

| | URL |
|---|---|
| **🔑 Get API keys** | [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) — create a Google Cloud project, enable YouTube Data API v3, create OAuth 2.0 credentials |
| **Upload video** | `POST /upload/youtube/v3/videos?part=snippet,status` (resumable upload) → [docs](https://developers.google.com/youtube/v3/docs/videos/insert) |
| **Read metrics** | `GET https://www.googleapis.com/youtube/v3/videos?part=statistics&id={videoId}` → [docs](https://developers.google.com/youtube/v3/docs/videos/list) |
| **List comments** | `GET https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId={id}` → [docs](https://developers.google.com/youtube/v3/docs/commentThreads/list) |
| **Comment on a video** | `POST https://www.googleapis.com/youtube/v3/comments?part=snippet` → [docs](https://developers.google.com/youtube/v3/docs/comments/insert) |
| **Update metadata** | `PUT https://www.googleapis.com/youtube/v3/videos?part=snippet,status` → [docs](https://developers.google.com/youtube/v3/docs/videos/update) |
| **Delete** | `DELETE https://www.googleapis.com/youtube/v3/videos?id={videoId}` → [docs](https://developers.google.com/youtube/v3/docs/videos/delete) |
| **Login** | Google OAuth 2.0 Authorization Code Flow → [docs](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps) |

Auth: Google OAuth 2.0. Scopes: `https://www.googleapis.com/auth/youtube.upload` (upload), `https://www.googleapis.com/auth/youtube.readonly` (metrics). Default quota: 10,000 units/day (~6 uploads). Quota increase: request via Google API Console at no cost.

⚠️ **Architecture note:** Video files cannot be uploaded from a URL — they must be sent as a file body. In a Cloudflare Worker, either:
- Have users upload directly from their browser to YouTube (bypass the Worker), or
- Use Workers Paid ($5/mo) for up to 500 MB file bodies, or
- Offload to a separate upload handler for files >100 MB



