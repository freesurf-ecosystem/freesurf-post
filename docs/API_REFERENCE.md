# cnxt to post — API Reference

Base URL: `https://post.cnxt.to`

Authenticate with a Supabase JWT in the `Authorization` header. Get a token by signing in through `auth.cnxt.to` (or any cnxt tool with shared auth).

```
Authorization: Bearer <supabase-access-token>
```

---

## Endpoints

### POST /api/post

Publish to one or more platforms simultaneously.

```json
{
  "platforms": ["bluesky", "linkedin", "x"],
  "text": "Hello world!",
  "mediaUrls": ["https://example.com/photo.jpg"],
  "replyTo": "tweet-id-here"
}
```

| Field | Required | Description |
|---|---|---|
| `platforms` | Yes | Array of: `bluesky`, `x`, `linkedin`, `facebook`, `instagram`, `threads`, `tiktok`, `youtube` |
| `text` | Yes | Post content |
| `mediaUrls` | No | Public image/video URLs |
| `replyTo` | No | X tweet ID to reply to |

**Response:**
```json
{
  "id": "uuid",
  "postedAt": "2026-07-18T12:00:00Z",
  "results": [
    { "platform": "bluesky", "success": true, "postId": "abc", "postUrl": "https://..." },
    { "platform": "linkedin", "success": false, "error": "LinkedIn not connected" }
  ]
}
```

---

### POST /api/schedule

Queue a post for future publishing via cron.

```json
{
  "platforms": ["bluesky"],
  "text": "Scheduled post",
  "scheduledAt": "2026-07-20T09:00:00Z"
}
```

---

### GET /api/scheduled

List pending scheduled posts.

---

### DELETE /api/scheduled/:id

Cancel a scheduled post.

---

### GET /api/metrics/:platform/:postId

Get engagement metrics for a post.

```
GET /api/metrics/bluesky/abc123
```

**Response:**
```json
{
  "platform": "bluesky",
  "likes": 42,
  "shares": 7,
  "comments": 12,
  "impressions": 1520,
  "clicks": 89
}
```

---

### GET /api/profiles

List connected platform profiles for the current user.

---

### GET /api/connect/:platform

Get a Bundle.social portal URL to connect a social account.

```
GET /api/connect/linkedin
→ { "url": "https://bundle.social/portal/..." }
```

---

### GET /api/bundle-accounts

List social accounts connected through Bundle.

---

### GET /api/analytics/:platform

Proxy Bundle analytics (profile or post). Supports JWTs and API keys
(`FSP-API-KEY` header).

| Param | Description |
|---|---|
| `type` | `profile` (default) or `post` |
| `postId` | Required when `type=post` |

```
GET /api/analytics/instagram?type=profile
GET /api/analytics/facebook?type=post&postId=xxx
```

---

### POST /api/analytics/refresh

Pull post analytics from Bundle for all of the caller's posted posts and cache
them into `post_posts.metrics`, so the aggregate `GET /api/analytics` reflects
real numbers. Uses the per-platform `postId` stored in each post's `results`.
Returns `{ refreshed, posts }`.

```
POST /api/analytics/refresh
```

---

### POST /api/comments/import

Start an async Bundle comment import for a published post.

```json
{
  "postId": "96b89a1c-...",
  "platform": "instagram"
}
```

Returns the import job (`status: PENDING/COMPLETED`, `commentsImported`).

---

### GET /api/comments

List the comments pulled in by an import for a post.

```
GET /api/comments?postId=xxx
```

---

### GET /api/replies/:platform/:postId

Fetch replies to a post. Bluesky uses the direct adapter; all other platforms
proxy Bundle's fetched comments for the post.

---

### POST /api/reply

Create a comment on a post, or reply to an existing comment, via Bundle's
`POST /api/v1/comment/` endpoint.

```json
{
  "platform": "x",
  "postId": "96b89a1c-...",
  "text": "Thanks for sharing!"
}
```

Reply to an imported comment (`commentId` → `fetchedParentCommentId`) or to a
comment created through this API (`internalCommentId` → `internalParentCommentId`):

```json
{
  "platform": "instagram",
  "postId": "96b89a1c-...",
  "commentId": "imported-comment-id",
  "text": "Glad you liked it!"
}
```

`internalPostId` is always required by Bundle and is set from `postId`.

> The web UI tabs (Comments / Analytics) stay hidden as "in development" until
> these features are wired into the interface — the endpoints above are ready
> for programmatic use.

---

### POST /api/media

Upload media via Bundle from a URL.

```json
{ "url": "https://example.com/photo.jpg" }
```

---

### POST /api/import

Start Bundle post history import for a platform.

```json
{ "platform": "linkedin" }
```

---

### GET /health

Health check. No auth required. Returns `ok`.

---

## Client examples

### Browser

```js
const res = await fetch("https://post.cnxt.to/api/post", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({ platforms: ["bluesky"], text: "Hello!" }),
});
```

### Node.js

```js
const res = await fetch("https://post.cnxt.to/api/post", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.CNXT_TOKEN}`,
  },
  body: JSON.stringify({ platforms: ["bluesky", "linkedin"], text }),
});
```

### Cloudflare Worker

```ts
const res = await fetch("https://post.cnxt.to/api/post", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${userJwt}`,
  },
  body: JSON.stringify({ platforms: ["bluesky"], text }),
});
```

---

## Platform support

| Platform | Post | Metrics | Replies | Notes |
|---|---|---|---|---|
| Bluesky | ✅ | ✅ | ✅ | App Password or Bundle |
| X (Twitter) | ✅ | ✅ | Via Bundle | OAuth 1.0a or Bundle |
| LinkedIn | ✅ | Via Bundle | Via Bundle | Bundle preferred |
| Facebook | ✅ | Via Bundle | Via Bundle | Bundle preferred |
| Instagram | ✅ | Via Bundle | Via Bundle | Media required |
| Threads | ✅ | Via Bundle | Via Bundle | Text supported |
| TikTok | ✅ | Via Bundle | Via Bundle | Video required |
| YouTube | Via Bundle | Via Bundle | Via Bundle | Channel selection needed |

---

## Rate limits

| Limit | Value |
|---|---|
| Posts per minute per user | 30 |
| All other endpoints | 60/min |
