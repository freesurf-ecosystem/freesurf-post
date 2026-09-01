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

Proxy Bundle analytics. Query params:

| Param | Description |
|---|---|
| `type` | `profile` (default) or `post` |
| `postId` | Required when `type=post` |

```
GET /api/analytics/instagram?type=profile
GET /api/analytics/facebook?type=post&postId=xxx
```

---

### GET /api/replies/:platform/:postId

Fetch replies to a post (Bluesky direct; other platforms via Bundle comments).

---

### POST /api/reply

Reply to a post (Bluesky direct; other platforms proxy Bundle's comment create).

```json
{
  "platform": "instagram",
  "postId": "post_123",
  "text": "Thanks for sharing!",
  "commentId": "comment_456"
}
```

`commentId` is optional — include it to reply to a specific comment.

---

### POST /api/analytics/refresh

Pull post analytics from Bundle for all of the user's posted posts and cache
them into `post_posts.metrics`, so the aggregate `GET /api/analytics` reflects
real numbers.

```
POST /api/analytics/refresh
```

---

### POST /api/comments/import

Start Bundle comment import for a post.

```json
{
  "postId": "post_123",
  "platform": "instagram"
}
```

---

### GET /api/comments

Get imported comments. Query: `?postId=xxx`

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
