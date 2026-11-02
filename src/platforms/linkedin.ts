import type { PlatformPostResult, PlatformMetrics } from "../types";

const API_BASE = "https://api.linkedin.com/rest";

/**
 * Post to LinkedIn.
 * Requires LINKEDIN_ACCESS_TOKEN (OAuth 2.0 Bearer) and LINKEDIN_AUTHOR (person or organization URN).
 */
export async function postToLinkedIn(
  text: string,
  accessToken: string,
  author: string,
  mediaUrl?: string
): Promise<PlatformPostResult> {
  try {
    let mediaUrn = "";
    if (mediaUrl) {
      if (/\.(mp4|mov|m4v)(\?|#|$)/i.test(mediaUrl)) {
        return {
          platform: "linkedin",
          success: false,
          error: "LinkedIn direct media currently supports images only.",
        };
      }

      const initRes = await fetch(`${API_BASE}/images?action=initializeUpload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Linkedin-Version": "202607",
          "X-Restli-Protocol-Version": "2.0.0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
      });
      const init = (await initRes.json()) as {
        value?: { uploadUrl?: string; image?: string };
        message?: string;
      };
      if (!initRes.ok || !init.value?.uploadUrl || !init.value?.image) {
        return {
          platform: "linkedin",
          success: false,
          error: `LinkedIn image init failed ${initRes.status}: ${JSON.stringify(init)}`,
        };
      }

      const mediaRes = await fetch(mediaUrl);
      if (!mediaRes.ok) {
        return {
          platform: "linkedin",
          success: false,
          error: `LinkedIn media fetch failed (${mediaRes.status}).`,
        };
      }
      const putRes = await fetch(init.value.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": mediaRes.headers.get("content-type") || "image/jpeg",
        },
        body: await mediaRes.arrayBuffer(),
      });
      if (!putRes.ok) {
        return {
          platform: "linkedin",
          success: false,
          error: `LinkedIn image upload failed (${putRes.status}).`,
        };
      }
      mediaUrn = init.value.image;
    }

    const body: Record<string, unknown> = {
      author,
      commentary: text,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
    if (mediaUrn) body.content = { media: { id: mediaUrn } };

    const res = await fetch(`${API_BASE}/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Linkedin-Version": "202607",
        "X-Restli-Protocol-Version": "2.0.0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };

    if (!res.ok) {
      return {
        platform: "linkedin",
        success: false,
        error: `LinkedIn error ${res.status}: ${JSON.stringify(data)}`,
      };
    }

    // /rest/posts returns the URN in the x-restli-id header, not the body.
    const urn = res.headers.get("x-restli-id") || data.id || "";

    return {
      platform: "linkedin",
      success: true,
      postId: urn,
      postUrl: urn ? `https://www.linkedin.com/feed/update/${urn}/` : undefined,
    };
  } catch (e) {
    return {
      platform: "linkedin",
      success: false,
      error: e instanceof Error ? e.message : "Unknown LinkedIn error",
    };
  }
}

/**
 * Read metrics for a LinkedIn post.
 */
export async function getLinkedInMetrics(
  postUrn: string,
  accessToken: string
): Promise<PlatformMetrics> {
  try {
    // LinkedIn social metadata API
    const encodedUrn = encodeURIComponent(postUrn);
    const res = await fetch(
      `${API_BASE}/socialMetadata/${encodedUrn}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Linkedin-Version": "202607",
          "X-Restli-Protocol-Version": "2.0.0",
        },
      }
    );

    if (!res.ok) {
      throw new Error(`LinkedIn metrics failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      likesSummary?: { totalLikes?: number };
      commentsSummary?: { totalComments?: number };
      sharesSummary?: { totalShares?: number };
      impressions?: number;
    };

    return {
      platform: "linkedin",
      likes: data.likesSummary?.totalLikes ?? 0,
      shares: data.sharesSummary?.totalShares ?? 0,
      comments: data.commentsSummary?.totalComments ?? 0,
      impressions: data.impressions ?? 0,
      clicks: 0,
    };
  } catch {
    return { platform: "linkedin", likes: 0, shares: 0, comments: 0 };
  }
}
