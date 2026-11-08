import type { PlatformPostResult } from "../types";

/**
 * Upload a video to YouTube from a public media URL using the resumable upload
 * endpoint. Requires `youtube.upload`; the channel id comes from the OAuth
 * connection.
 */
export async function postToYouTube(
  text: string,
  accessToken: string,
  channelId: string,
  mediaUrl?: string
): Promise<PlatformPostResult> {
  if (!mediaUrl) {
    return {
      platform: "youtube",
      success: false,
      error: "YouTube requires a video URL.",
    };
  }

  try {
    const mediaRes = await fetch(mediaUrl);
    if (!mediaRes.ok) {
      return {
        platform: "youtube",
        success: false,
        error: `Could not fetch video (${mediaRes.status}).`,
      };
    }
    const contentType = mediaRes.headers.get("content-type") || "video/mp4";
    const bytes = await mediaRes.arrayBuffer();

    const initRes = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": contentType,
          "X-Upload-Content-Length": String(bytes.byteLength),
        },
        body: JSON.stringify({
          snippet: {
            title: (text || "FreeSurf Post upload").slice(0, 100),
            description: text,
          },
          status: { privacyStatus: "public" },
        }),
      }
    );

    const uploadUrl = initRes.headers.get("location");
    if (!initRes.ok || !uploadUrl) {
      return {
        platform: "youtube",
        success: false,
        error: `YouTube upload init failed (${initRes.status}): ${await initRes.text()}`,
      };
    }

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
      },
      body: bytes,
    });
    const data = (await putRes.json()) as { id?: string; error?: { message?: string } };
    if (!putRes.ok || !data.id) {
      return {
        platform: "youtube",
        success: false,
        error: `YouTube upload failed (${putRes.status}): ${
          data.error?.message ?? JSON.stringify(data)
        }`,
      };
    }

    return {
      platform: "youtube",
      success: true,
      postId: data.id,
      postUrl: `https://youtu.be/${data.id}`,
    };
  } catch (e) {
    return {
      platform: "youtube",
      success: false,
      error: e instanceof Error ? e.message : "Unknown YouTube error",
    };
  }
}
