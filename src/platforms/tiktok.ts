import type { PlatformPostResult, PlatformMetrics } from "../types";

/**
 * Post a video to TikTok via Content Posting API.
 *
 * ⚠️ Requires TikTok Content Posting API approval (app review).
 * Until approved, posting is limited to mobile Share Kit.
 *
 * Requires TIKTOK_ACCESS_TOKEN and TIKTOK_OPEN_ID.
 */
export async function postToTikTok(
  caption: string,
  accessToken: string,
  openId: string,
  mediaUrls?: string[]
): Promise<PlatformPostResult> {
  try {
    const videoUrl = mediaUrls?.[0];
    if (!videoUrl) {
      return {
        platform: "tiktok",
        success: false,
        error: "TikTok requires a video URL (mediaUrls[0])",
      };
    }

    // Direct Post: POST /v2/post/publish/video/init/
    const initBody = {
      post_info: {
        title: caption || "TikTok post",
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: videoUrl,
      },
    };

    const res = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(initBody),
    });

    const data = (await res.json()) as {
      data?: { publish_id?: string };
      error?: { code: string; message: string };
    };

    if (!res.ok) {
      return {
        platform: "tiktok",
        success: false,
        error: `TikTok error ${res.status}: ${data.error?.message ?? JSON.stringify(data)}`,
      };
    }

    return {
      platform: "tiktok",
      success: true,
      postId: data.data?.publish_id,
      postUrl: undefined, // TikTok doesn't return a direct URL immediately
    };
  } catch (e) {
    return {
      platform: "tiktok",
      success: false,
      error: e instanceof Error ? e.message : "Unknown TikTok error",
    };
  }
}

/**
 * Read metrics for a TikTok video.
 * Uses the Display API to query video data.
 */
export async function getTikTokMetrics(
  videoId: string,
  accessToken: string
): Promise<PlatformMetrics> {
  try {
    const body = { filters: { video_ids: [videoId] } };

    const res = await fetch("https://open.tiktokapis.com/v2/video/query/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`TikTok metrics failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      data?: {
        videos?: Array<{
          like_count?: number;
          share_count?: number;
          comment_count?: number;
          view_count?: number;
        }>;
      };
    };

    const video = data.data?.videos?.[0];
    return {
      platform: "tiktok",
      likes: video?.like_count ?? 0,
      shares: video?.share_count ?? 0,
      comments: video?.comment_count ?? 0,
      impressions: video?.view_count ?? 0,
      views: video?.view_count ?? 0,
      clicks: 0,
    };
  } catch {
    return { platform: "tiktok", likes: 0, shares: 0, comments: 0 };
  }
}
