/** Supported social platforms */
export type Platform = "bluesky" | "facebook" | "instagram" | "linkedin" | "threads" | "tiktok" | "x" | "youtube" | "reddit" | "pinterest" | "slack" | "discord" | "google_business";

/** A post request from the client */
export interface PostRequest {
  /** Platforms to post to */
  platforms: Platform[];
  /** Post text content */
  text: string;
  /** Optional media URLs (images, videos) */
  mediaUrls?: string[];
  /** For X: reply to tweet ID */
  replyTo?: string;
  /** Which team (post_bundle_teams.id) to post to — defaults to the active team */
  teamId?: string;
  /** Alternative: post to a team by its label (e.g. "Personal"). teamId wins if both set. */
  team?: string;
  /** Instagram feed image handling: "fit" (adds padding, default) or "crop" (center-crops). */
  instagramImageFit?: "fit" | "crop";
  /** Per-platform targets for platforms that need one, e.g. { discord: "channelId", pinterest: "boardName", reddit: "r/example", slack: "channelId" }. */
  platformTargets?: Record<string, string>;
  /** Optional per-platform titles (e.g. { youtube: "My video title" }). */
  titles?: Record<string, string>;
}

/** Result of posting to a single platform */
export interface PlatformPostResult {
  platform: Platform;
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
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
