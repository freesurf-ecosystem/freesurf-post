# Bundle.social API — Functionality Archive

Internal reference dump of what Bundle.social's API does — per platform and endpoint — so we can cross-reference while building our own direct adapters and keep Bundle as a fallback.

Source: `https://info.bundle.social/llms.txt` + the api-reference pages.
Companion docs: `BUNDLE_INTEGRATION.md` (strategy), `SOCIAL_API_REFERENCE.md`
(auth + endpoints per platform), `X_API_COSTS.md`.

---

## Core concepts

- **Auth**: `x-api-key` header (`pk_live_...`). One key = whole org. `401` = no key, `403` = bad key.
- **Hierarchy**:
  ```
  Organization (billing, API keys, webhooks)
    └── Team (social accounts, posts, uploads, bots, bio/link-in-bio)
  ```
  `teamId` is required on most endpoints (posts, uploads, connect). Create a team per customer/brand.
- **Rate limits**: per-**team** daily posting caps (per platform); org-level monthly caps; `429` on burst. See `BUNDLE_INTEGRATION.md` for the tier table.
- **Webhooks**: org-level, real-time `post.published` / `post.failed` + comment events, signature-verified, auto-disable.
- **Base URL**: `https://api.bundle.social`, paths under `/api/v1`.

---

## Endpoint groups (functional map)

### Organization (org-level)
- get org (plan + teams)
- usage: posts / comments / uploads / imports (consumed vs plan limit)
- daily limits per social account (vs platform's own daily cap)

### Teams
- get / create / update / delete / list (paginated)

### Social accounts (connection)
- connect (OAuth URL), disconnect, **portal link** (hosted flow), custom UI flow
- channel management: `set-channel` / `unset-channel` / `refresh-channels`
  (channels needed for YouTube, Instagram, Facebook, LinkedIn, Reddit, Discord, Slack, Pinterest)
- copy accounts across teams, get account by team+type
- connection/disconnect health check, profile info refresh

### Posts
- create / get / list (filter+paginate) / update / delete / retry
- get by **reference key** (store your own id), reconnect orphaned posts after a disconnect

### Uploads (media)
- create (multipart/form-data), create **from URL**
- get / list / delete / delete-many
- large upload: init (>90 MB) + finalize
- multipart upload: init / re-sign parts / complete / abort (>5 GiB)

### Analytics
- profile + post metrics, **normalized** (unified names) and **raw** (platform-native)
- bulk post analytics (max 60 posts, 20/page)
- force-refresh profile/post analytics (consumes platform rate limits)
- retention: 30 days

### Comments
- import (async pull of existing comments), list fetched comments
- create / reply / get / update / delete / retry
- moderate actions: reply / hide / like / delete

### Import / backfill
- post history import (backfill past posts + analytics), retry, bulk-delete
- reviews/recommendations import: Facebook + Google Business (async jobs, reply/delete owner reply)

### Bulk CSV posting
- create CSV import (async), history / details / status / per-row results

### Misc (per-platform deep ops)
- **YouTube**: playlists CRUD, custom thumbnail, edit video metadata, edit/delete comments, categories, regions
- **Google Business**: full profile — location, hours, attributes, categories, services, food menus, action links, media, reviews
- **LinkedIn**: @mentionable people/orgs lookup, build mention text, reshare, edit/delete post/comment
- **Reddit**: subreddit post requirements (flair/title rules), flairs list, edit/delete post/comment
- **Instagram**: business/creator user search, location IDs, audio/music search, delete comment
- **TikTok**: commercial music library (popular tracks), delete comment
- **Facebook**: token debug, recommendations (reviews) import/reply, edit/delete post/comment
- **delete/edit** (where supported): Pinterest, Mastodon, Slack, Bluesky, X, Discord

---

## Per-platform posting parameters (`data.<PLATFORM>`)

Bold = required. `uploadIds` reference prior uploads; `thumbnail` = a public URL
of an image already in the library (video cover).

### X / Twitter — `data.TWITTER`
- `text` (~280 chars, more if X Premium), `uploadIds` (up to 4 images **or** 1 video/GIF)
- `replySettings` (`EVERYONE`|`FOLLOWING`|`MENTIONED_USERS`|`SUBSCRIBERS`|`VERIFIED`)
- `isAiGenerated` (AI label)
- Threads = first tweet + replies via the comments API. **No analytics surface for X.**

### Bluesky — `data.BLUESKY`
- `text` (~300), `uploadIds` (4 images or 1 video), `tags` (≤8, no `#`)
- `labels` (self-label/content warning), `quoteUri`, `externalUrl`/`externalTitle`/`externalDescription` + `thumbnail` (link card), `videoAlt`

### Mastodon — `data.MASTODON`
- `text` (~500, instance-dependent), `uploadIds` (4 images or 1 video)
- `privacy` (`PUBLIC`|`UNLISTED`|`PRIVATE`|`DIRECT`), `spoiler` (CW text), `thumbnail`

### Threads — `data.THREADS`
- `text` (~500), `uploadIds` (≤10 images or 1 video), `mediaItems` (per-image alt)
- `topicTag`, `replyControl`, `linkAttachment`, `poll` (2–4 options), `gif` (GIPHY)
- `allowlistedCountryCodes`, `crosspostToInstagramStory` (+ dark mode)
- Polls/GIFs/links only on text-only posts.

### LinkedIn — `data.LINKEDIN`
- **`text`** (~3000), `uploadIds` (images / 1 video / document-PDF)
- `link`, `thumbnail`, `mediaTitle`, `privacy` (`CONNECTIONS`|`PUBLIC`|`LOGGED_IN`|`CONTAINER`)
- `hideFromFeed`, `disableReshare`; mentions via URN lookup

### Facebook (Page) — `data.FACEBOOK`
- `type` (`POST`|`REEL`|`STORY`), `text`, `uploadIds`, `mediaItems` (alt text)
- `link` (POST only), `mediaTitle`, `thumbnail`, `nativeScheduleTime` (≤30 days out)

### Instagram — `data.INSTAGRAM`
- `type` (`POST`|`REEL`|`STORY`), `text`, `uploadIds`
- **Aspect ratios**: square ≥1080×1080 or portrait 4:5; Reels 9:16, ≤90s
- `altText`, `carouselItems` (with tags), `thumbnailOffset`/`thumbnail`
- `shareToFeed` (Reels), `collaborators`, `tagged`, `locationId`
- `autoFitImage`/`autoCropImage`, `trialParams` (trial reels), `isPaidPartnership`, `brandedContentSponsors` (≤2, FB Login only), `musicSoundInfo`, `isAiGenerated`
- Business discovery + branded content only via Facebook Login connection.

### TikTok — `data.TIKTOK`
- `type` (`VIDEO`|`IMAGE`), **`privacy`** (`PUBLIC_TO_EVERYONE`|`MUTUAL_FOLLOW_FRIENDS`|`FOLLOWER_OF_CREATOR`|`SELF_ONLY`)
- `text`, `uploadIds` (MP4/MOV/WEBM ≥540p, 9:16, ≤10 min; or photos for `IMAGE`)
- `photoCoverIndex`, `thumbnailOffset`/`thumbnail`
- `isBrandContent`/`isOrganicBrandContent`, `disableComments`/`disableDuet`/`disableStitch`
- `isAiGenerated`, `autoAddMusic`, `autoScale`, `uploadToDraft`, `musicSoundInfo` (commercial music)

### YouTube — `data.YOUTUBE`
- `type` (`VIDEO`|`SHORT` — SHORT = vertical ≤60s), `uploadIds` (1 video)
- `text` = **title**, `description`, `thumbnail` (VIDEO only), `privacy` (`PUBLIC`|`UNLISTED`|`PRIVATE`)
- `defaultLanguage`/`defaultAudioLanguage` (BCP-47), `madeForKids` (**required-ish**), `containsSyntheticMedia`, `hasPaidProductPlacement`

### Reddit — `data.REDDIT`
- **`sr`** (subreddit), **`text`** (post title), `description` (self-post body)
- `uploadIds`, `link`, `nsfw`, `flairId` (required if subreddit requires flair)
- Pre-flight: check subreddit requirements (title length, allowed types, flair) first.

### Discord — `data.DISCORD`
- **`channelId`** (connected server channel), `text` (≤2000), `uploadIds`
- `username`/`avatarUrl` (webhook overrides). Webhook-based, not OAuth.

### Slack — `data.SLACK`
- **`channelId`**, `text`, `uploadIds`, `username`/`avatarUrl`. Admin connect required.

### Google Business Profile — `data.GOOGLE_BUSINESS`
- `text`, `uploadIds`, `topicType` (`STANDARD`|`EVENT`|`OFFER`|`ALERT`), `languageCode`
- `callToActionType` (`BOOK`|`ORDER`|`SHOP`|`LEARN_MORE`|`SIGN_UP`|`CALL`) + `callToActionUrl`
- `eventTitle`/`eventStartDate`/`eventEndDate` (EVENT), `offerCouponCode`/`offerRedeemOnlineUrl`/`offerTermsConditions` (OFFER), `alertType` (ALERT)
- Location setup + details/hours/categories via `misc.googleBusiness*` SDK methods.

### Pinterest — `data.PINTEREST`
- **`boardName`**, `uploadIds` (1 image/video), `text` (Pin title), `description`, `link`, `altText`, `note`, `thumbnail`, `dominantColor`, `isAiGenerated`

### Snapchat (Public Profile) — `data.SNAPCHAT`
- `type` (`STORY`|`SPOTLIGHT`), `uploadIds` (1 image/video; video 5–180s, ≥540×960, ≤100 MB)
- `text`/`description` (≤160), `locale` (`en_US`), `skipSaveToProfile` (Spotlight)
- No comments API; profile + content analytics available.

---

## Media

- Images: JPG / PNG / WEBP / GIF. Video: MP4 / MOV / WEBM, up to 5 GB (large flow).
- Multipart flow above 5 GiB. Large videos process server-side — posts can sit in
  `PROCESSING` before `POSTED`.

---

## Platform quirks (from their platform docs)

- **Instagram**: rejects Reels that aren't 9:16; feed posts 4:5–1.91:1.
- **YouTube**: "Made for Kids" mandatory declaration; title always required; 4 h / 5 GB.
- **TikTok**: music copyright; privacy + image-format rules for photo mode.
- **Facebook**: token expiry is the recurring pain.
- **LinkedIn**: URNs; personal profiles have limited powers vs company pages.
- **Reddit**: subreddit rules + flair; minimal analytics.
- **Pinterest**: `boardName` required; saves > likes.
- **Discord**: `channelId` required (webhook, not OAuth).
- **X**: no analytics surface.
- **Analytics availability**: TikTok = rich, Reddit = crumbs; Bundle returns `0` when data is missing.

---

## To-do (fill in later)

- [ ] Fetch the individual platform pages (Instagram/TikTok/YouTube/LinkedIn) for full constraint detail.
- [ ] Map each endpoint group → our equivalent (schema tables + Worker endpoints).
- [ ] Capture webhook event payloads + signature verification.
- [ ] Capture the exact `misc.*` operation list per platform (YouTube playlists, Google Business, etc.).
