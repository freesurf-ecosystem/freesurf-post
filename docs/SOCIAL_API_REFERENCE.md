[ ] If email confirmation is disabled, anyone could claim that address — either enable confirmation for it or add its Supabase user ID to REVIEWER_USER_IDS.

reviewer@freesurf.tools

## Migrating map

| Snapchat | 1 – 2 Weeks | Human review of app functionality |
| TikTok | 1 – 4 Weeks | Company paperwork & full flow video |
| LinkedIn |  1 – 2 Weeks (Profile) / Months (Company) | Restricted product application |
| Pinterest | 3 – 7 Days | Video submission of functional app |
| Google Business | 7 – 14 Days | Account age check (60+ days verified) |
| YouTube | Instant (Restricted Quotas) | Manual audit only if requesting quota lift |
| Instagram / Facebook | 14 – 20 Days | Strict screencast audit & business details |
| Threads | Instant | Instant | Completely automated developer onboarding |
| X | Credentials Ready | [Needs wiring] Instant | Completely automated developer onboarding |
| Bluesky | Instant | Open network / Instance-level generation |
| Reddit | Instant | Instant | Completely automated developer onboarding |
| Slack | Instant | Self-service bot token generation |
| Discord | Instant | Self-service bot token generation |
| Mastodon | Instant | Open network / Instance-level generation |



# Social API Quick Reference — Post, Metrics, Login

template for every venue

Platform:
App name: FreeSurf Post

FreeSurf Post is an open-source, free social media scheduler and cross-poster for creators and small businesses.

What the app does:
Compose once, schedule/publish to the user's own connected accounts, and show analytics.

How we use [Platform]:
1. User connects their account via [Platform] OAuth/Login.
2. User composes or schedules content in FreeSurf Post.
3. FreeSurf Post publishes only at the user's direction/schedule using [API].
4. FreeSurf Post reads profile/post metrics using [API] to show analytics.

Permissions/scopes and why:
- [scope] — [user-facing reason]

Data we store and retention:
Encrypted OAuth tokens, post text/media references, scheduling metadata, post status, and metrics. Users can disconnect or delete their account.

What we do not do:
No posting without user action, no scraping, no automated engagement, no data resale, no private data from other users.

## Demo

Demo video flow:
Connect → consent → compose/upload → publish → verify on platform → show analytics.

Do a capability pass first
Before recording, map each platform as: connect / publish / analytics / comments, and mark what works now in sandbox/trial vs. what needs approval. That tells you what you can actually show today:
- TikTok sandbox: publish works, posts are private, no comments.
- Pinterest trial: pins are private until Standard.
- LinkedIn personal: posting self-serve; analytics is the weak spot.
- YouTube: upload + basic stats.
- Meta: publish + insights + comments, but permission-by-permission.
- Snapchat/GBP: later.

One master demo, chapters per capability
1. Sign in as the reviewer account.
2. Connect a platform (OAuth consent).
3. Compose one post, schedule/publish it.
4. Show it live on the platform.
5. Open analytics.
6. Read/reply to a comment where supported.
That's the same UI for every platform. For Meta, you add a permission→timestamp table. For TikTok/Pinterest/LinkedIn/Google, the form is more open-ended, so the same video works with a short platform-specific intro.

### Tiktok video instructions:
Accepted formats: mp4, mov
Maximum 5 files, up to 50MB each
For example, it should demonstrate how you use TikTok for Developers' capabilities, such as Login Kit, Share Kit, Display API, Content Posting API, and the relevant scopes.
If your app has not been approved before, you are required to use a sandbox environment on the Developer Portal to demonstrate the integration.
The demo video should showcase the website or app where the features will actually be integrated.
All selected products and scopes must be clearly demonstrated in the video. If you don't need certain products or scopes, make sure to remove them before review. Otherwise, it will delay the review result.
The video should clearly show the user interface and user interactions.
If you intend to integrate with a web app, make sure the domain of the website shown in the demo video matches the website URL you provide.
If you intend to integrate with a mobile app, the demo video should start by showing the app being opened.

## Review credentials for meta

Perhaps don't need them: 
https://www.trismsolutions.in/blog/meta-instagram-api-approval

Meta Test Users (App Dashboard → Roles → Test Users) — those are app-scoped accounts you can hand credentials for without real verification, though they're limited for Page/IG management. In that case, a test Page + test IG and a reviewer-added account is still more reliable.

No dummy email needed. When you create a Meta Test User (App Dashboard → Roles → Test Users → Create), Meta generates the fake email and password for you. There's no inbox to manage — the email is just the login identifier. You can view/copy the credentials and log in to your app as that user.

---

## Scope → demo checklist (review prep)

Record one common flow first: **connect → consent → publish → show the live post → open analytics → read/reply to a comment**. Then map each scope to its segment. Only show scopes you are requesting.

### Facebook Page
| Scope | Show in demo |
|---|---|
| `pages_show_list` | Page picker / list of managed Pages |
| `pages_read_engagement` | Load the Page's posts/engagement |
| `pages_manage_posts` | Publish a Page post and show it live |
| `read_insights` | Open Page insights |
| `pages_read_user_content` | Show comments/user content on the post |
| `pages_manage_engagement` | Reply to a comment |
| `business_management` | Select a Page owned by the Business Manager |

### Instagram
| Scope | Show in demo |
|---|---|
| `instagram_basic` | Show the connected IG profile |
| `instagram_content_publish` | Publish a feed post or Reel and show it live |
| `instagram_manage_insights` | Open IG post insights |
| `instagram_manage_comments` | List and reply to a comment |

Requires an IG Business/Creator account linked to a Facebook Page.

### Threads
| Scope | Show in demo |
|---|---|
| `threads_basic` | Show the connected Threads profile |
| `threads_content_publish` | Publish a Thread and show it live |
| `threads_manage_insights` | Open Threads insights |
| `threads_read_replies` | Load replies on the Thread |
| `threads_manage_replies` | Reply to a Thread |

### YouTube
| Scope | Show in demo |
|---|---|
| `youtube.upload` | Upload a video and show it on the channel |
| `youtube.readonly` | List the channel/videos and show view/like/comment counts |
| `youtube.force-ssl` | Only if doing comment replies — add later; restricted scope |

### TikTok
| Scope | Show in demo |
|---|---|
| `user.info.basic` | Show the connected TikTok profile |
| `video.publish` | Publish a video directly |
| `video.upload` | Upload to the inbox (only if that mode is used) |
| `video.list` | List videos and show like/comment/share/view counts |

Sandbox posts are forced private; there is no general comment/reply API. Do not promise commenting on TikTok.

### Pinterest
| Scope | Show in demo |
|---|---|
| `pins:read` | Read existing Pins |
| `pins:write` | Create a Pin |
| `boards:read` | List boards |
| `boards:write` | Create/select a board |
| `user_accounts:read` | Show the connected account |
| `pins:write_secret` / `boards:write_secret` | Only for secret Pins/boards |

Trial-access Pins are private; Standard access needs a demo video. `ads:*` / `catalogs:*` are not needed for a scheduler.

### LinkedIn
| Scope | Show in demo |
|---|---|
| `openid profile email` | Connect and show the member identity |
| `w_member_social` | Publish/comment as the member (self-serve; no app review) |
| `w_organization_social` | Publish a company-page post |
| `r_organization_social` | Read org posts/comments/reactions |
| `rw_organization_admin` | List admin organizations/roles |
| `r_organization_admin` | Read org page/analytics data |

Personal posting uses the self-serve **Share on LinkedIn** product, so it does not need a review presentation. **Community Management API** (company pages) does: show listing admin orgs, publishing an org post, reading comments/reactions, and opening page analytics. `r_member_social` is closed by LinkedIn, so do not plan member post analytics around it.



## Credential checklist

> **App credentials vs. per-user connections:** client ID, client secret, and redirect URI are app-level credentials. Access/refresh tokens, author URNs, open IDs, channel IDs, and app passwords are per-user connection artifacts — normally obtained through OAuth and stored encrypted in `post_accounts`. The `*_ACCESS_TOKEN` / `*_AUTHOR` / `*_OPEN_ID` env fields below are optional single-user/legacy fallbacks, not credentials to collect for the normal OAuth flow.

| Platform | App credentials to collect | Where | Review / status |
|---|---|---|---|
| **Meta — Facebook Page + Instagram** | `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`, `META_CONFIG_ID`, `FACEBOOK_REDIRECT_URI` | Meta App Dashboard | Done |
| **Meta — Threads** | `THREADS_CLIENT_ID`, `THREADS_CLIENT_SECRET`, `THREADS_REDIRECT_URI` | Threads API use case settings | Done |
| **X** | OAuth 1.0a: `X_CONSUMER_KEY`, `X_CONSUMER_KEY_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`, `X_BEARER_TOKEN`. OAuth 2.0: `X_OAUTH2_CLIENT_ID`, `X_OAUTH2_CLIENT_SECRET`, `X_OAUTH2_REDIRECT_URI` | X Developer Portal | Paid API tier; OAuth 2.0 needed for Articles/user-context endpoints |
| **Bluesky** | None (app password is per-user) | Bluesky Settings → App Passwords | Instant, no review |
| **LinkedIn — personal** | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI` | LinkedIn Developer Portal | Share on LinkedIn is self-serve; no app review. Per-user token + person URN stored in `post_accounts` (optional `LINKEDIN_ACCESS_TOKEN` / `LINKEDIN_AUTHOR` fallback). |
| **LinkedIn — company pages** | `LINKEDIN_BUSINESS_CLIENT_ID`, `LINKEDIN_BUSINESS_CLIENT_SECRET`, `LINKEDIN_BUSINESS_REDIRECT_URI` | LinkedIn Developer Portal | Community Management API + app review (screencast). Per-user token + org URN stored in `post_accounts`. |
| **TikTok** | `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI` | TikTok Developer Portal | Content Posting API + app review. Per-user token + `open_id` stored in `post_accounts` (optional `TIKTOK_ACCESS_TOKEN` / `TIKTOK_OPEN_ID` fallback). |
| **YouTube** | Google OAuth client ID/secret + redirect URI | Google Cloud Console → YouTube Data API v3 | OAuth verification; per-user access/refresh token + channel ID come from OAuth; no direct adapter yet |
| **Snapchat** | Snap client ID/secret + redirect URI | Snap Developer / Marketing API | Public Profile API allowlist pending; per-user token comes from OAuth; no direct adapter yet |


### Google (YouTube + Google Business Profile)

- https://support.google.com/cloud/answer/13463073?authuser=2&visit_id=639286362634592072-3381773022&rd=1
- https://support.google.com/cloud/answer/13461325?sjid=1732777300772068794-NA&authuser=2
- https://support.google.com/cloud/answer/13464321?sjid=1732777300772068794-NA
- https://developers.google.com/youtube


Google Business Profile



*Google My Business API (v4.9) approval*
[ ] The Cloud project can stay under your main account. The approval is tied to the project number, not the GBP account.
The application email just needs to be listed as an owner/manager on that GBP, so use the email/account that manages the contractor profile.
[ ] The GBP still needs to be verified, active 60+ days, and have a business website on it. A service-area/contractor profile is fine if it meets those.
[ ] For the demo/OAuth, you'll need to log in as the account that manages the GBP (or add your main account as a manager/owner of that profile). Add that account as a test user on the consent screen

Google Business Profile (GBP). They took the legacy, monolithic API and split it into several independent backend services.
While you only request the single business.manage OAuth scope in your code, you must explicitly search for and enable multiple distinct APIs inside your centralized Google Cloud Console for the Disc project:
• My Business Account Management API: To pull the user's account IDs.
• My Business Business Information API: To map out their physical locations and storefront names.
• 

- [ ] Create/confirm the Google Cloud project and OAuth consent screen.
- [ ] Add the exact scopes we need (YouTube upload/read, comments if we move that later, Google Business Profile if applicable).
- [ ] Have the public app homepage, privacy policy, terms, authorized domains, logo, support email, and app name set in the consent screen.
- [ ] **Record the OAuth verification demo in staging / a hidden test route, or in a separate test project.** for both the youtube and google business profile connections; Do not trigger unverified scopes in production — that disrupts users and consumes the unverified-user quota.
- [ ] The demo video must show:
  - [ ] sign into the app
  - [ ] the **“unverified app” warning** for the test account (expected; it must appear in the video),
  - [ ] the full Google consent/authorize flow,
  - [ ] the app using *each requested scope end-to-end (connect account, upload/publish, read back)*,
  - [ ] the app name and/or client ID so the reviewer can match it to the submission.
  - [ ] explanation for why a scope is needed
- [ ] Upload the video to a public link (e.g. YouTube) and provide written reproduction steps.
- [ ] Submit OAuth verification. Separately request the YouTube Data API quota increase and Google Business Profile API access if needed.

### Snapchat

The public profile api is what is needed
https://developers.snap.com/marketing-api/Public-Profile-API/GetStarted
https://developers.snap.com/marketing-api/home

Looks like we need to wait on a service rep to contact us.



### Meta (Facebook / Instagram / Threads)

- [ ] Complete Meta Business verification for the app.
- [ ] Record the permission-review screencast showing the login/connect flow and each permission being used.

https://developers.facebook.com/docs/graph-api/guides/explorer/

Threads	threads_basic, threads_content_publish; add threads_manage_insights if you show analytics	

Instagram	instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement; add instagram_manage_insights for metrics	

Facebook Page	pages_show_list, pages_read_engagement, pages_manage_posts; add read_insights for Page metrics	

Scopes: 
threads_read_replies
threads_manage_replies
instagram_manage_comments
pages_read_user_content
pages_manage_engagement
read_insights
pages_manage_posts
instagram_content_publish
instagram_manage_insights
pages_read_engagement
instagram_basic
threads_manage_insights
threads_content_publish
pages_show_list
threads_basic
business_management
public_profile




### Pinterest
https://developers.pinterest.com/apps/


- Request Standard access (trial is sandbox-only and can’t publish to real boards)
- Standard access needs a video demo of the OAuth flow + pin creation; typically 3–7 days
Scopes:
user_accounts:read, boards:read, boards:write, pins:read, pins:write (add boards:read_secret for secret boards).
API flow:
1. OAuth 2.0 authorization code → token at https://api.pinterest.com/v5/oauth/token
2. GET /v5/boards → resolve the UI’s board name to a board_id
3. POST /v5/pins with board_id, title, description, link, and media_source
4. Analytics: GET /v5/pins/{pin_id}/analytics

### LinkedIn

1. A LinkedIn app at developer.linkedin.com
2. The app associated with that company page (you must be a page admin)
3. The Community Management API product approved
4. Scopes: w_organization_social, r_organization_social, and usually rw_organization_admin for admin actions
For personal-profile posting the path is different (w_member_social), but for company pages it’s Community Management API. That review can take weeks, so apply as soon as the app/page association is verified.
Credentials to collect for FreeSurf Post:
- LINKEDIN_CLIENT_ID
- LINKEDIN_CLIENT_SECRET
- LINKEDIN_REDIRECT_URI = https://post.freesurf.tools/api/oauth/linkedin/callback
- For testing: LINKEDIN_ACCESS_TOKEN and LINKEDIN_AUTHOR (the organization URN, urn:li:organization:<id>)
The direct adapter (src/platforms/linkedin.ts) and Env fields already exist, and the app already has the page/channel target UI. Once the app is approved, we can wire the OAuth flow with the rest. Want me to add the LinkedIn app/review steps to the credential doc?

Community Management API Development Tier 
is only requestable on apps that have no other API products. Once you added Share on LinkedIn, that app became ineligible, so the button is greyed out. I was wrong earlier when I said it wouldn’t block it — Microsoft’s FAQ confirms it does.
For FreeSurf Post, the simplest path is:
1. Create a new LinkedIn app associated with the same company page.
2. Add the redirect URI: https://post.freesurf.tools/api/oauth/linkedin/callback.
3. Do not add Share on LinkedIn or any other product to this app.
4. Request Community Management API Development Tier.
5. After approval, submit the Standard Tier request with a screen recording of the OAuth connect + company-page post flow.
6. Use this new app’s Client ID/Secret for LinkedIn company-page posting. LINKEDIN_AUTHOR will be urn:li:organization:<page-id>.

Product	What it posts to	Scopes
Share on LinkedIn	Personal member profile	
w_member_social
Community Management API	
Company pages	w_organization_social, r_organization_social, rw_organization_admin

### TikTok

- [ ] Create the TikTok app and request **Content Posting API** + **Login Kit** access.
- [ ] Record the audit demo showing the OAuth connect and a real publish flow.
Yes — create an organization and use it as the app owner. TikTok says it’s “highly recommended but not required,” but for a real integration you want the app owned by the organization (Planting Moon/FreeSurf), not your individual developer account.
Simple setup path:
1. Create organization
- developers.tiktok.com → organization/profile area → create organization.
- Use the legal/business details and website https://freesurf.tools or https://post.freesurf.tools.
2. Create the app
- Manage apps → Connect an app → select your organization.
- App name: FreeSurf Post.
- Icon: use the existing 1024×1024 PNG (TikTok accepts PNG/JPEG up to 5 MB).
- Category, description, website: https://post.freesurf.tools.
- Platform: Web. Add Android/iOS only if you want mobile-app attribution later.
3. Add products
- Login Kit — for TikTok OAuth.
- Content Posting API — enable Direct Post.
- Display API — only if you want TikTok metrics/analytics.
- Skip Research API and ad products.
4. Redirect URI
https://post.freesurf.tools/api/oauth/tiktok/callback
5. Scopes
- user.info.basic — identify the authorized user.
- video.publish — Direct Post.
- video.upload — only if you use inbox/upload mode instead of direct post.
- video.list — Display API metrics.
6. Verify URL ownership
- TikTok requires verification for the website, privacy policy, terms, and Content Posting API URLs.
- Add the verification file/meta tag/DNS record TikTok gives you for post.freesurf.tools and freesurf.tools. We can add a signature file to the site later if needed.
7. Test in Sandbox
- Use Sandbox mode to test Login Kit + Content Posting API without waiting for review.
- Add test users and get their access tokens/open IDs.
8. Submit for review
- Explain the use case: connect a TikTok account, compose/schedule a post, publish it.
- Upload a demo video showing: TikTok login/authorize → post a video → show it on TikTok.
- TikTok review is usually 1–4 weeks.
9. Content Posting API audit
- Unaudited apps can post, but content is restricted to private/self-only visibility.
- After testing, request the Content Posting API audit to lift that restriction.
Credentials to collect when ready: TIKTOK_CLIENT_ID (Client key), TIKTOK_CLIENT_SECRET (Client secret), TIKTOK_REDIRECT_URI, and for testing TIKTOK_ACCESS_TOKEN / TIKTOK_OPEN_ID.


For TikTok, the credentials you need are:
- Client key → TIKTOK_CLIENT_ID
- Client secret → TIKTOK_CLIENT_SECRET
- Redirect URI → TIKTOK_REDIRECT_URI
- For sandbox testing: access token + open ID → TIKTOK_ACCESS_TOKEN, TIKTOK_OPEN_ID
Get them from developers.tiktok.com → Manage apps → your app → Credentials. Store the client secret as a Worker secret (wrangler secret put TIKTOK_CLIENT_SECRET) or in local .dev.vars; don’t put it in wrangler.toml.
Use FreeSurf Post for the app setup, not the old subdomain:
- Website: https://post.freesurf.tools
- Privacy: https://post.freesurf.tools/privacy or the existing FreeSurf policy if it explicitly covers FreeSurf Post
- Terms: https://post.freesurf.tools/terms
- Redirect URI: https://post.freesurf.tools/api/oauth/tiktok/callback

### Bluesky

- [ ] app password / OAuth client setup (no formal app review expected).

### Other providers

- [ ] Reddit: create the app and confirm OAuth scopes/rate limits.
- [ ] Discord / Slack: create the app/bot or webhook and confirm channel permissions.
- [ ] Mastodon: app password / OAuth client setup (no formal app review expected).

### Cross-provider cleanup

- [ ] Central scope list and redirect URIs documented per platform.
- [ ] Token storage/encryption and refresh flow verified for each adapter.
- [ ] Test accounts available for every platform during review.
- [ ] Rate-limit/error handling checked against each provider's current limits.
- [ ] Privacy policy and terms mention the direct platform integrations, not just Bundle.

## Platform API docs

| Platform | API docs | Developer portal (get keys) |
|---|---|---|
| X (Twitter) | [docs.x.com](https://docs.x.com/x-api/tweets/manage-tweets) | [developer.x.com](https://developer.x.com/en/portal/dashboard) |
| LinkedIn | [learn.microsoft.com](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) | [linkedin.com/developers](https://www.linkedin.com/developers/apps) |
| Instagram | [developers.facebook.com](https://developers.facebook.com/docs/instagram-platform/content-publishing) | [developers.facebook.com/apps](https://developers.facebook.com/apps) |
| Facebook | [developers.facebook.com](https://developers.facebook.com/docs/graph-api/reference/page/feed) | [developers.facebook.com/apps](https://developers.facebook.com/apps) |
| Threads | [developers.facebook.com](https://developers.facebook.com/docs/threads) | [developers.facebook.com/apps](https://developers.facebook.com/apps) |
| TikTok | [developers.tiktok.com](https://developers.tiktok.com/products/content-posting-api) | [developers.tiktok.com/apps](https://developers.tiktok.com/apps) |
| YouTube | https://developers.google.com/youtube
| Bluesky | [docs.bsky.app](https://docs.bsky.app/docs/get-started) | [bsky.app/settings](https://bsky.app/settings/app-passwords) |
| Pinterest | [developers.pinterest.com](https://developers.pinterest.com/docs/api/overview/) | [developers.pinterest.com](https://developers.pinterest.com) |
| Reddit | [reddit.com/dev/api](https://www.reddit.com/dev/api/) | [reddit.com/dev](https://www.reddit.com/dev/) |
| Mastodon | [docs.joinmastodon.org](https://docs.joinmastodon.org/api/) | — |
| Discord | [discord.com/developers](https://discord.com/developers/docs/resources/webhook) | [discord.com/developers/applications](https://discord.com/developers/applications) |
| Slack | [api.slack.com](https://api.slack.com/messaging/webhooks) | [api.slack.com](https://api.slack.com) |
| Google Business | [developers.google.com](https://developers.google.com/my-business/reference/rest) | [developers.google.com](https://developers.google.com/my-business) |
| Snapchat | [developers.snap.com](https://developers.snap.com/api/marketing/) | [developers.snap.com](https://developers.snap.com) |

## Docs by feature — links to each platform's canonical API pages

Verify endpoints against these before wiring an adapter. A few (TikTok comments,
Threads) still need a human to confirm the exact page after the doc site's structure changes.

| Platform | Posting | Comment / Reply | Analytics |
|---|---|---|---|
| X | [manage-tweets](https://docs.x.com/x-api/tweets/manage-tweets) | [manage-tweets (reply)](https://docs.x.com/x-api/tweets/manage-tweets) | [tweet lookup](https://docs.x.com/x-api/tweets/lookup) |
| LinkedIn | [posts-api](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) | [comments-api](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/comments-api) | [social-metadata-api](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/social-metadata-api) |
| Instagram | [content-publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing) | [ig-comment](https://developers.facebook.com/docs/graph-api/reference/ig-comment/) | [ig-media/insights](https://developers.facebook.com/docs/instagram-api/reference/ig-media/insights) |
| Facebook | [page/feed](https://developers.facebook.com/docs/graph-api/reference/page/feed) | [object/comments](https://developers.facebook.com/docs/graph-api/reference/object/comments) | [post/insights](https://developers.facebook.com/docs/graph-api/reference/post/insights) |
| TikTok | [content-posting-api](https://developers.tiktok.com/doc/content-posting-api-get-started) | [comment-api](https://developers.tiktok.com/doc/comment-api-get-started) | [display-api](https://developers.tiktok.com/doc/display-api-get-started) |
| Threads | [threads](https://developers.facebook.com/docs/threads) | [threads (replies)](https://developers.facebook.com/docs/threads) | [threads (insights)](https://developers.facebook.com/docs/threads) |
| Bluesky | [get-started](https://docs.bsky.app/docs/get-started) | [get-post-thread](https://docs.bsky.app/docs/api/app.bsky.feed.get_post_thread) | [get-posts](https://docs.bsky.app/docs/api/app.bsky.feed.get_posts) |
| YouTube | [videos/insert](https://developers.google.com/youtube/v3/docs/videos/insert) | [comments/insert](https://developers.google.com/youtube/v3/docs/comments/insert) | [videos/list](https://developers.google.com/youtube/v3/docs/videos/list) |

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

Products:
- **Share on LinkedIn** — member/personal posting (`w_member_social`). Does **not** post to company pages.
- **Community Management API** — company pages (`w_organization_social`, `r_organization_social`, plus `rw_organization_admin` for admin actions). Request this for FreeSurf Post's company-page connections.
- **Sign In with LinkedIn using OpenID Connect** — login/identity only (`openid profile email`).

LinkedIn only allows the **Community Management API Development Tier** request on apps that have **no other API products**. If you already added Share on LinkedIn, the request is greyed out. Create a new app with the same company page for Community Management; once approved, you can either use that app directly or use its client ID to request Standard Tier on the original app.

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

Auth: Google OAuth 2.0. Scopes: `https://www.googleapis.com/auth/youtube.upload` (upload), `https://www.googleapis.com/auth/youtube.readonly` (metrics). Default quota: 10,000 units/day; since the 2026 update, `videos.insert` is 1 unit against its own ~100/day bucket (not 1,600 units). Quota increase: request via Google API Console at no cost.

⚠️ **Architecture note:** Video files cannot be uploaded from a URL — they must be sent as a file body. In a Cloudflare Worker, either:
- Have users upload directly from their browser to YouTube (bypass the Worker), or
- Use Workers Paid ($5/mo) for up to 500 MB file bodies, or
- Offload to a separate upload handler for files >100 MB





