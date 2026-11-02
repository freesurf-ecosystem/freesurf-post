import type { PlatformPostResult, PlatformMetrics } from "../types";

const API_BASE = "https://graph.facebook.com/v25.0";

/**
 * Post to a Facebook Page.
 * Requires FACEBOOK_ACCESS_TOKEN (Page access token) and FACEBOOK_PAGE_ID.
 */
export async function postToFacebook(
  text: string,
  accessToken: string,
  pageId: string,
  mediaUrl?: string,
  link?: string
): Promise<PlatformPostResult> {
  try {
    const isVideo = Boolean(mediaUrl && /\.(mp4|mov|m4v)(\?|#|$)/i.test(mediaUrl));
    const endpoint = mediaUrl
      ? isVideo
        ? `/${pageId}/videos`
        : `/${pageId}/photos`
      : `/${pageId}/feed`;

    const body = new URLSearchParams();
    body.set("access_token", accessToken);
    if (mediaUrl) {
      if (isVideo) {
        body.set("file_url", mediaUrl);
        body.set("description", text);
      } else {
        body.set("url", mediaUrl);
        body.set("caption", text);
      }
    } else {
      body.set("message", text);
      if (link) body.set("link", link);
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = (await res.json()) as { id?: string; error?: { message: string } };

    if (!res.ok) {
      return {
        platform: "facebook",
        success: false,
        error: `Facebook error ${res.status}: ${data.error?.message ?? JSON.stringify(data)}`,
      };
    }

    const id = data.id ?? "";
    const [pageIdPart, postIdPart] = id.split("_");

    return {
      platform: "facebook",
      success: true,
      postId: id,
      postUrl: postIdPart
        ? `https://facebook.com/${pageIdPart}/posts/${postIdPart}`
        : `https://facebook.com/${id}`,
    };
  } catch (e) {
    return {
      platform: "facebook",
      success: false,
      error: e instanceof Error ? e.message : "Unknown Facebook error",
    };
  }
}

/**
 * Read metrics for a Facebook post.
 */
export async function getFacebookMetrics(
  postId: string,
  accessToken: string
): Promise<PlatformMetrics> {
  try {
    const res = await fetch(
      `${API_BASE}/${postId}/insights?metric=post_impressions,post_reactions_like_total,post_clicks&access_token=${accessToken}`
    );

    if (!res.ok) {
      throw new Error(`Facebook metrics failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      data?: Array<{ name: string; values?: Array<{ value: number }> }>;
    };

    const metrics: Record<string, number> = {};
    for (const item of data.data ?? []) {
      metrics[item.name] = item.values?.[0]?.value ?? 0;
    }

    // Also get shares/comments count
    const detailRes = await fetch(
      `${API_BASE}/${postId}?fields=shares,comments.summary(true)&access_token=${accessToken}`
    );
    const detail = (await detailRes.json()) as {
      shares?: { count?: number };
      comments?: { summary?: { total_count?: number } };
    };

    return {
      platform: "facebook",
      likes: metrics["post_reactions_like_total"] ?? 0,
      shares: detail.shares?.count ?? 0,
      comments: detail.comments?.summary?.total_count ?? 0,
      impressions: metrics["post_impressions"] ?? 0,
      clicks: metrics["post_clicks"] ?? 0,
    };
  } catch {
    return { platform: "facebook", likes: 0, shares: 0, comments: 0 };
  }
}
