/** Supported social platforms */
export type Platform = "bluesky" | "facebook" | "instagram" | "linkedin" | "threads" | "tiktok" | "x" | "youtube" | "reddit" | "pinterest" | "slack" | "discord" | "google_business";

/** A media upload reference (Bundle upload id + enough info to pick photo/video mode). */
export interface MediaRef {
  /** Bundle upload id (the value returned by /api/media/upload). */
  uploadId: string;
  /** Whether this upload is an image or a video. Inferred from mime when omitted. */
  kind?: "image" | "video";
  /** Original MIME type, e.g. image/jpeg or video/mp4. */
  mime?: string;
  /** Optional alt text (Instagram carousel items, Facebook media items). */
  altText?: string;
}

/** A post request from the client */
export interface PostRequest {
  /** Platforms to post to */
  platforms: Platform[];
  /** Post text content */
  text: string;
  /** Optional media URLs (images, videos) */
  mediaUrls?: string[];
  /** Optional media metadata, parallel to mediaUrls. Prefer this when available. */
  media?: MediaRef[];
  /** For X: reply to tweet ID */
  replyTo?: string;
  /** Which team (post_bundle_teams.id) to post to — defaults to the active team */
  teamId?: string;
  /** Alternative: post to a team by its label (e.g. "Personal"). teamId wins if both set. */
  team?: string;
  /** Instagram feed image handling: "fit" (adds padding, default) or "crop" (center-crops). */
  instagramImageFit?: "fit" | "crop";
  /** Optional "first comment" to post immediately after publishing (seeds engagement).
   *  Applied to every posted platform that supports comments (skips Pinterest/Google Business). */
  firstComment?: string;
  /** Per-platform targets for platforms that need one, e.g. { discord: "channelId", pinterest: "boardName", reddit: "r/example", slack: "channelId" }. */
  platformTargets?: Record<string, string>;
  /** Optional per-platform titles (e.g. { youtube: "My video title" }). */
  titles?: Record<string, string>;
  /** Optional per-platform extra flags forwarded to the provider, e.g.
   *  { tiktok: { isOrganicBrandContent: true }, x: { isAiGenerated: true } }. */
  platformOptions?: Record<string, Record<string, unknown>>;
}

/** Result of posting to a single platform */
export interface PlatformPostResult {
  platform: Platform;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
  /** Which path published this post — "direct" (our own platform adapter) or
   *  "bundle" (proxied). Determines how analytics are read: Bundle can't read
   *  a post it didn't publish, so direct posts are read from the platform. */
  via?: "direct" | "bundle";
}

/** Combined post response */
export interface PostResponse {
  id: string;
  results: PlatformPostResult[];
  postedAt: string;
}

/** Metrics for a post on one platform */
export interface PlatformMetrics {
  platform: Platform;
  likes: number;
  shares: number;
  comments: number;
  impressions?: number;
  clicks?: number;
}

/** Authenticated user info from JWT */
export interface AuthUser {
  sub: string;
  email: string;
}
