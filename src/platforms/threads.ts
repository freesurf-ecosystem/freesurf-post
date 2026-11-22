import type { PlatformPostResult, PlatformMetrics } from "../types";

const API_BASE = "https://graph.threads.net/v1.0";

/**
 * Post to Threads (text, image, or video).
 * Unlike Instagram, Threads supports text-only posts.
 * Requires THREADS_ACCESS_TOKEN and THREADS_USER_ID.
 */
export async function postToThreads(
  text: string,
  accessToken: string,
  userId: string,
  mediaUrls?: string[]
): Promise<PlatformPostResult> {
  try {
    // Step 1: Create media container
    const params = new URLSearchParams();
    params.set("access_token", accessToken);

    const imageUrl = mediaUrls?.[0];
    const videoUrl = mediaUrls?.[0];

    if (imageUrl) {
      params.set("media_type", "IMAGE");
      params.set("image_url", imageUrl);
    } else if (videoUrl) {
      params.set("media_type", "VIDEO");
      params.set("video_url", videoUrl);
    } else {
      params.set("media_type", "TEXT");
    }

    if (text) params.set("text", text);

    const containerRes = await fetch(`${API_BASE}/${userId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const container = (await containerRes.json()) as { id?: string; error?: { message: string } };

    if (!containerRes.ok) {
      return {
        platform: "threads",
        success: false,
        error: `Threads container error: ${container.error?.message ?? JSON.stringify(container)}`,
      };
    }

    // Step 2: Publish
    const publishRes = await fetch(`${API_BASE}/${userId}/threads_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: accessToken, creation_id: container.id! }).toString(),
    });

    const published = (await publishRes.json()) as { id?: string; error?: { message: string } };

    if (!publishRes.ok) {
      return {
        platform: "threads",
        success: false,
        error: `Threads publish error: ${published.error?.message ?? JSON.stringify(published)}`,
      };
    }

    return {
      platform: "threads",
      success: true,
      postId: published.id,
      postUrl: `https://www.threads.net/t/${published.id}`,
    };
  } catch (e) {
    return {
      platform: "threads",
      success: false,
      error: e instanceof Error ? e.message : "Unknown Threads error",
    };
  }
}

/**
 * Read metrics for a Threads post.
 */
export async function getThreadsMetrics(
  mediaId: string,
  accessToken: string
): Promise<PlatformMetrics> {
  try {
    const res = await fetch(
      `${API_BASE}/${mediaId}?fields=insights.metric(likes,reposts,replies,quotes,views)&access_token=${accessToken}`
    );

    if (!res.ok) {
      throw new Error(`Threads metrics failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      insights?: { data?: Array<{ name: string; values?: Array<{ value: number }> }> };
    };

    const metrics: Record<string, number> = {};
    for (const item of data.insights?.data ?? []) {
      metrics[item.name] = item.values?.[0]?.value ?? 0;
    }

    return {
      platform: "threads",
      likes: metrics["likes"] ?? 0,
      shares: metrics["reposts"] ?? 0,
      comments: metrics["replies"] ?? 0,
      impressions: metrics["views"] ?? 0,
      views: metrics["views"] ?? 0,
      clicks: 0,
    };
  } catch {
    return { platform: "threads", likes: 0, shares: 0, comments: 0 };
  }
}
