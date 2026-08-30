# Bundle.social Integration Strategy

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

To add later:
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
GMB	10	20	40
SNAPCHAT	5	20	40


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




