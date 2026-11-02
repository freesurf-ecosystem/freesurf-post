import type { PlatformPostResult } from "../types";

const API_BASE = "https://api.pinterest.com/v5";

/**
 * Create an image Pin from a public media URL.
 * Requires a connected account with a board id in token metadata.
 */
export async function postToPinterest(
  text: string,
  accessToken: string,
  boardId: string,
  mediaUrl?: string
): Promise<PlatformPostResult> {
  if (!mediaUrl) {
    return {
      platform: "pinterest",
      success: false,
      error: "Pinterest requires an image URL.",
    };
  }

  try {
    const res = await fetch(`${API_BASE}/pins`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        board_id: boardId,
        title: text.slice(0, 100),
        description: text,
        media_source: {
          source_type: "image_url",
          url: mediaUrl,
        },
      }),
    });

    const data = (await res.json()) as { id?: string; message?: string };
    if (!res.ok || !data.id) {
      return {
        platform: "pinterest",
        success: false,
        error: `Pinterest error ${res.status}: ${data.message ?? JSON.stringify(data)}`,
      };
    }

    return {
      platform: "pinterest",
      success: true,
      postId: data.id,
      postUrl: `https://www.pinterest.com/pin/${data.id}/`,
    };
  } catch (e) {
    return {
      platform: "pinterest",
      success: false,
      error: e instanceof Error ? e.message : "Unknown Pinterest error",
    };
  }
}
