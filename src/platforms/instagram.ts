import type { PlatformPostResult, PlatformMetrics } from "../types";

const API_BASE = "https://graph.facebook.com/v25.0";

/**
 * Post to Instagram (Professional account required).
 * Two-step process: create media container → publish.
 * Requires INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID.
 */
export async function postToInstagram(
  caption: string,
  accessToken: string,
  igUserId: string,
  mediaUrls?: string[]
): Promise<PlatformPostResult> {
  try {
    const imageUrl = mediaUrls?.[0];
    const videoUrl = mediaUrls?.[0];

    if (!imageUrl && !videoUrl) {
      return {
        platform: "instagram",
        success: false,
        error: "Instagram requires an image or video URL (mediaUrls[0])",
      };
    }

    // Step 1: Create media container
    const mediaParams = new URLSearchParams();
    mediaParams.set("access_token", accessToken);
    if (caption) mediaParams.set("caption", caption);

    if (imageUrl) {
      mediaParams.set("image_url", imageUrl);
    } else if (videoUrl) {
      mediaParams.set("video_url", videoUrl);
      mediaParams.set("media_type", "VIDEO");
    }

    const containerRes = await fetch(`${API_BASE}/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: mediaParams.toString(),
    });

    const container = (await containerRes.json()) as { id?: string; error?: { message: string } };

    if (!containerRes.ok) {
      return {
        platform: "instagram",
        success: false,
        error: `Instagram container error: ${container.error?.message ?? JSON.stringify(container)}`,
      };
    }

    // Step 2: Publish
    const publishParams = new URLSearchParams();
    publishParams.set("access_token", accessToken);
    publishParams.set("creation_id", container.id!);

    const publishRes = await fetch(`${API_BASE}/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: publishParams.toString(),
    });

    const published = (await publishRes.json()) as { id?: string; error?: { message: string } };

    if (!publishRes.ok) {
      return {
        platform: "instagram",
        success: false,
        error: `Instagram publish error: ${published.error?.message ?? JSON.stringify(published)}`,
      };
    }

    return {
      platform: "instagram",
      success: true,
      postId: published.id,
      postUrl: `https://www.instagram.com/p/${published.id}/`,
    };
  } catch (e) {
    return {
      platform: "instagram",
      success: false,
      error: e instanceof Error ? e.message : "Unknown Instagram error",
    };
  }
}

/**
 * Read metrics for an Instagram media post.
 */
export async function getInstagramMetrics(
  mediaId: string,
  accessToken: string
): Promise<PlatformMetrics> {
  try {
    const res = await fetch(
      `${API_BASE}/${mediaId}/insights?metric=impressions,reach,likes,comments,shares,plays,views&access_token=${accessToken}`
    );

    if (!res.ok) {
      throw new Error(`Instagram metrics failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      data?: Array<{ name: string; values?: Array<{ value: number }> }>;
    };

    const metrics: Record<string, number> = {};
    for (const item of data.data ?? []) {
      metrics[item.name] = item.values?.[0]?.value ?? 0;
    }

    return {
      platform: "instagram",
      likes: metrics["likes"] ?? 0,
      shares: metrics["shares"] ?? 0,
      comments: metrics["comments"] ?? 0,
      impressions: metrics["impressions"] ?? 0,
      views: metrics["views"] ?? metrics["plays"] ?? 0,
      clicks: 0,
    };
  } catch {
    return { platform: "instagram", likes: 0, shares: 0, comments: 0 };
  }
}
