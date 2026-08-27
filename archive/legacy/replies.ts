/**
 * Reply functionality for all social platforms
 * Supports reading replies and posting replies to existing posts
 */

import { logPlatformError, ErrorType, ErrorSeverity } from "./logging";

export interface Reply {
  id: string;
  text: string;
  author: {
    id: string;
    handle: string;
    displayName?: string;
    avatarUrl?: string;
  };
  createdAt: string;
  likes?: number;
  metrics?: {
    likes: number;
    replies: number;
  };
}

export interface ReplyRequest {
  text: string;
  inReplyTo: string;
  mediaUrls?: string[];
}

export interface ReplyResult {
  success: boolean;
  replyId?: string;
  replyUrl?: string;
  error?: string;
}

// ============================================================================
// BLUESKY REPLIES
// ============================================================================

/**
 * Get replies to a Bluesky post
 */
export async function getBlueskyReplies(
  postUri: string,
  handle: string,
  appPassword: string,
  limit: number = 50,
  cursor?: string
): Promise<{ replies: Reply[]; nextCursor?: string }> {
  try {
    const { createSession } = await import("./platforms/bluesky");
    const session = await createSession(handle, appPassword);

    let url = `https://bsky.social/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(postUri)}&depth=0&limit=${limit}`;
    if (cursor) {
      url += `&cursor=${encodeURIComponent(cursor)}`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Bluesky API error: ${response.status}`);
    }

    const data = await response.json();
    const thread = data.thread;

    const replies: Reply[] = (thread.replies || []).map((reply: any) => ({
      id: reply.post.uri.split("/").pop() || "",
      text: reply.post.record.text,
      author: {
        id: reply.post.author.did,
        handle: reply.post.author.handle,
        displayName: reply.post.author.displayName,
        avatarUrl: reply.post.author.avatar,
      },
      createdAt: reply.post.record.createdAt,
      likes: reply.post.likeCount || 0,
      metrics: {
        likes: reply.post.likeCount || 0,
        replies: reply.post.replyCount || 0,
      },
    }));

    return {
      replies,
      nextCursor: data.cursor,
    };
  } catch (error) {
    await logPlatformError(
      "bluesky",
      ErrorType.PLATFORM_BLUESKY_ERROR,
      `Failed to get Bluesky replies: ${error instanceof Error ? error.message : "Unknown error"}`,
      {},
      error instanceof Error ? error : undefined
    );
    return { replies: [] };
  }
}

/**
 * Post a reply to a Bluesky post
 */
export async function replyToBluesky(
  text: string,
  inReplyTo: string,
  handle: string,
  appPassword: string,
  mediaUrls?: string[]
): Promise<ReplyResult> {
  try {
    const { createSession } = await import("./platforms/bluesky");
    const session = await createSession(handle, appPassword);

    const now = new Date().toISOString();
    const replyRecord: Record<string, unknown> = {
      $type: "app.bsky.feed.post",
      text,
      createdAt: now,
      reply: {
        root: {
          uri: inReplyTo,
          cid: inReplyTo.split("/").pop() || "",
        },
        parent: {
          uri: inReplyTo,
          cid: inReplyTo.split("/").pop() || "",
        },
      },
    };

    // TODO: Handle media uploads for replies
    if (mediaUrls && mediaUrls.length > 0) {
      // Future: implement media upload for replies
    }

    const response = await fetch("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.accessJwt}`,
      },
      body: JSON.stringify({
        repo: session.did,
        collection: "app.bsky.feed.post",
        record: replyRecord,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bluesky reply failed: ${errorText}`);
    }

    const data = await response.json();
    const replyId = data.uri.split("/").pop() || data.cid;

    return {
      success: true,
      replyId,
      replyUrl: `https://bsky.app/profile/${handle}/post/${replyId}`,
    };
  } catch (error) {
    await logPlatformError(
      "bluesky",
      ErrorType.PLATFORM_BLUESKY_ERROR,
      `Failed to reply to Bluesky post: ${error instanceof Error ? error.message : "Unknown error"}`,
      {},
      error instanceof Error ? error : undefined
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// X (TWITTER) REPLIES
// ============================================================================

/**
 * Get replies to an X tweet
 */
export async function getXReplies(
  tweetId: string,
  consumerKey: string,
  consumerSecret: string,
  accessToken: string,
  accessTokenSecret: string,
  limit: number = 50
): Promise<{ replies: Reply[]; nextToken?: string }> {
  try {
    // X API v2 doesn't have a direct "get replies" endpoint
    // We need to search for tweets that reply to this one
    const searchUrl = `https://api.x.com/2/tweets/search/recent?query=to:me&in_reply_to_tweet_id=${tweetId}&max_results=${limit}&tweet.fields=created_at,author_id,public_metrics,conversation_id&expansions=author_id&user.fields=id,username,name,profile_image_url`;

    const { generateOAuth1Header } = await import("./platforms/x");
    const oauthHeader = await generateOAuth1Header(
      "GET",
      searchUrl,
      consumerKey,
      consumerSecret,
      accessToken,
      accessTokenSecret
    );

    const response = await fetch(searchUrl, {
      headers: {
        Authorization: oauthHeader,
      },
    });

    if (!response.ok) {
      throw new Error(`X API error: ${response.status}`);
    }

    const data = await response.json();

    const replies: Reply[] = (data.data || []).map((tweet: any) => {
      const author = data.includes?.users?.find((u: any) => u.id === tweet.author_id);
      return {
        id: tweet.id,
        text: tweet.text,
        author: {
          id: tweet.author_id,
          handle: author?.username || "",
          displayName: author?.name,
          avatarUrl: author?.profile_image_url,
        },
        createdAt: tweet.created_at,
        likes: tweet.public_metrics?.like_count || 0,
        metrics: {
          likes: tweet.public_metrics?.like_count || 0,
          replies: tweet.public_metrics?.reply_count || 0,
        },
      };
    });

    return {
      replies,
      nextToken: data.next_token,
    };
  } catch (error) {
    await logPlatformError(
      "x",
      ErrorType.PLATFORM_X_ERROR,
      `Failed to get X replies: ${error instanceof Error ? error.message : "Unknown error"}`,
      {},
      error instanceof Error ? error : undefined
    );
    return { replies: [] };
  }
}

/**
 * Post a reply to an X tweet
 */
export async function replyToX(
  text: string,
  inReplyTo: string,
  consumerKey: string,
  consumerSecret: string,
  accessToken: string,
  accessTokenSecret: string,
  mediaUrls?: string[]
): Promise<ReplyResult> {
  try {
    const { generateOAuth1Header } = await import("./platforms/x");
    
    const body: Record<string, unknown> = {
      text,
      reply: {
        in_reply_to_tweet_id: inReplyTo,
      },
    };

    // X doesn't support media in replies via API v2, so we ignore mediaUrls
    // Future: could use v1.1 media upload and then reply

    const url = "https://api.x.com/2/tweets";
    const oauthHeader = await generateOAuth1Header(
      "POST",
      url,
      consumerKey,
      consumerSecret,
      accessToken,
      accessTokenSecret
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: oauthHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(`X reply failed: ${data.errors?.[0]?.message || "Unknown error"}`);
    }

    const data = await response.json();
    const replyId = data.data.id;

    return {
      success: true,
      replyId,
      replyUrl: `https://x.com/i/status/${replyId}`,
    };
  } catch (error) {
    await logPlatformError(
      "x",
      ErrorType.PLATFORM_X_ERROR,
      `Failed to reply to X post: ${error instanceof Error ? error.message : "Unknown error"}`,
      {},
      error instanceof Error ? error : undefined
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// LINKEDIN REPLIES
// ============================================================================

/**
 * Get replies to a LinkedIn post
 */
export async function getLinkedInReplies(
  postUrn: string,
  accessToken: string,
  limit: number = 50
): Promise<{ replies: Reply[] }> {
  try {
    const encodedUrn = encodeURIComponent(postUrn);
    const url = `https://api.linkedin.com/rest/socialActions/${encodedUrn}/comments?count=${limit}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Linkedin-Version": "202607",
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });

    if (!response.ok) {
      throw new Error(`LinkedIn API error: ${response.status}`);
    }

    const data = await response.json();

    const replies: Reply[] = (data.elements || []).map((comment: any) => ({
      id: comment.id,
      text: comment.message?.text || "",
      author: {
        id: comment.actor,
        handle: comment.actor, // LinkedIn uses URNs
        displayName: comment.firstName + " " + comment.lastName,
      },
      createdAt: comment.created?.time || "",
      likes: comment.socialTotalLikes || 0,
      metrics: {
        likes: comment.socialTotalLikes || 0,
        replies: comment.commentsTotal || 0,
      },
    }));

    return { replies };
  } catch (error) {
    await logPlatformError(
      "linkedin",
      ErrorType.PLATFORM_LINKEDIN_ERROR,
      `Failed to get LinkedIn replies: ${error instanceof Error ? error.message : "Unknown error"}`,
      {},
      error instanceof Error ? error : undefined
    );
    return { replies: [] };
  }
}

/**
 * Post a reply to a LinkedIn post
 */
export async function replyToLinkedIn(
  text: string,
  postUrn: string,
  accessToken: string
): Promise<ReplyResult> {
  try {
    const encodedUrn = encodeURIComponent(postUrn);
    const url = `https://api.linkedin.com/rest/socialActions/${encodedUrn}/comments`;

    const body = {
      actor: "urn:li:person:REPLACE_WITH_ACTUAL_PERSON_URN",
      message: {
        text,
      },
      object: postUrn,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Linkedin-Version": "202607",
        "X-Restli-Protocol-Version": "2.0.0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LinkedIn reply failed: ${errorText}`);
    }

    const data = await response.json();
    const replyId = data.id;

    return {
      success: true,
      replyId,
      replyUrl: `https://www.linkedin.com/feed/update/${postUrn}?commentUrn=${replyId}`,
    };
  } catch (error) {
    await logPlatformError(
      "linkedin",
      ErrorType.PLATFORM_LINKEDIN_ERROR,
      `Failed to reply to LinkedIn post: ${error instanceof Error ? error.message : "Unknown error"}`,
      {},
      error instanceof Error ? error : undefined
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// FACEBOOK REPLIES
// ============================================================================

/**
 * Get replies to a Facebook post
 */
export async function getFacebookReplies(
  postId: string,
  accessToken: string,
  limit: number = 50
): Promise<{ replies: Reply[]; nextCursor?: string }> {
  try {
    const url = `https://graph.facebook.com/v25.0/${postId}/comments?fields=id,message,created_time,from,likes.summary(true),comments.summary(true)&limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Facebook API error: ${response.status}`);
    }

    const data = await response.json();

    const replies: Reply[] = (data.data || []).map((comment: any) => ({
      id: comment.id,
      text: comment.message || "",
      author: {
        id: comment.from?.id || "",
        handle: comment.from?.id || "",
        displayName: comment.from?.name,
        avatarUrl: comment.from?.picture?.data?.url,
      },
      createdAt: comment.created_time,
      likes: comment.likes?.summary?.total_count || 0,
      metrics: {
        likes: comment.likes?.summary?.total_count || 0,
        replies: comment.comments?.summary?.total_count || 0,
      },
    }));

    return {
      replies,
      nextCursor: data.paging?.after,
    };
  } catch (error) {
    await logPlatformError(
      "facebook",
      ErrorType.PLATFORM_FACEBOOK_ERROR,
      `Failed to get Facebook replies: ${error instanceof Error ? error.message : "Unknown error"}`,
      {},
      error instanceof Error ? error : undefined
    );
    return { replies: [] };
  }
}

/**
 * Post a reply to a Facebook post
 */
export async function replyToFacebook(
  text: string,
  postId: string,
  accessToken: string
): Promise<ReplyResult> {
  try {
    const url = `https://graph.facebook.com/v25.0/${postId}/comments`;

    const body = new URLSearchParams();
    body.set("message", text);
    body.set("access_token", accessToken);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Facebook reply failed: ${errorText}`);
    }

    const data = await response.json();

    return {
      success: true,
      replyId: data.id,
      replyUrl: `https://facebook.com/${postId}?comment_id=${data.id}`,
    };
  } catch (error) {
    await logPlatformError(
      "facebook",
      ErrorType.PLATFORM_FACEBOOK_ERROR,
      `Failed to reply to Facebook post: ${error instanceof Error ? error.message : "Unknown error"}`,
      {},
      error instanceof Error ? error : undefined
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// INSTAGRAM REPLIES
// ============================================================================

/**
 * Get replies to an Instagram post
 */
export async function getInstagramReplies(
  mediaId: string,
  accessToken: string,
  limit: number = 50
): Promise<{ replies: Reply[]; nextCursor?: string }> {
  try {
    const url = `https://graph.facebook.com/v25.0/${mediaId}/comments?fields=id,text,timestamp,from,like_count&limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Instagram API error: ${response.status}`);
    }

    const data = await response.json();

    const replies: Reply[] = (data.data || []).map((comment: any) => ({
      id: comment.id,
      text: comment.text || "",
      author: {
        id: comment.from?.id || "",
        handle: comment.from?.username || "",
        displayName: comment.from?.username,
        avatarUrl: comment.from?.profile_pic_url,
      },
      createdAt: comment.timestamp,
      likes: comment.like_count || 0,
      metrics: {
        likes: comment.like_count || 0,
        replies: 0, // Instagram doesn't provide nested comment counts easily
      },
    }));

    return {
      replies,
      nextCursor: data.paging?.after,
    };
  } catch (error) {
    await logPlatformError(
      "instagram",
      ErrorType.PLATFORM_INSTAGRAM_ERROR,
      `Failed to get Instagram replies: ${error instanceof Error ? error.message : "Unknown error"}`,
      {},
      error instanceof Error ? error : undefined
    );
    return { replies: [] };
  }
}

/**
 * Post a reply to an Instagram post
 */
export async function replyToInstagram(
  text: string,
  mediaId: string,
  accessToken: string
): Promise<ReplyResult> {
  try {
    const url = `https://graph.facebook.com/v25.0/${mediaId}/comments`;

    const body = new URLSearchParams();
    body.set("message", text);
    body.set("access_token", accessToken);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Instagram reply failed: ${errorText}`);
    }

    const data = await response.json();

    return {
      success: true,
      replyId: data.id,
      replyUrl: `https://instagram.com/p/${mediaId}/?comment=${data.id}`,
    };
  } catch (error) {
    await logPlatformError(
      "instagram",
      ErrorType.PLATFORM_INSTAGRAM_ERROR,
      `Failed to reply to Instagram post: ${error instanceof Error ? error.message : "Unknown error"}`,
      {},
      error instanceof Error ? error : undefined
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// THREADS REPLIES
// ============================================================================

/**
 * Get replies to a Threads post
 */
export async function getThreadsReplies(
  postId: string,
  accessToken: string,
  limit: number = 50
): Promise<{ replies: Reply[]; nextCursor?: string }> {
  try {
    const url = `https://graph.facebook.com/v25.0/${postId}/replies?fields=id,text,timestamp,from,like_count&limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Threads API error: ${response.status}`);
    }

    const data = await response.json();

    const replies: Reply[] = (data.data || []).map((reply: any) => ({
      id: reply.id,
      text: reply.text || "",
      author: {
        id: reply.from?.id || "",
        handle: reply.from?.username || "",
        displayName: reply.from?.username,
        avatarUrl: reply.from?.profile_pic_url,
      },
      createdAt: reply.timestamp,
      likes: reply.like_count || 0,
      metrics: {
        likes: reply.like_count || 0,
        replies: 0, // Threads doesn't provide nested reply counts easily
      },
    }));

    return {
      replies,
      nextCursor: data.paging?.after,
    };
  } catch (error) {
    await logPlatformError(
      "threads",
      ErrorType.PLATFORM_THREADS_ERROR,
      `Failed to get Threads replies: ${error instanceof Error ? error.message : "Unknown error"}`,
      {},
      error instanceof Error ? error : undefined
    );
    return { replies: [] };
  }
}

/**
 * Post a reply to a Threads post
 */
export async function replyToThreads(
  text: string,
  postId: string,
  accessToken: string
): Promise<ReplyResult> {
  try {
    const url = `https://graph.facebook.com/v25.0/${postId}/replies`;

    const body = new URLSearchParams();
    body.set("text", text);
    body.set("media_type", "TEXT");
    body.set("access_token", accessToken);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Threads reply failed: ${errorText}`);
    }

    const data = await response.json();

    return {
      success: true,
      replyId: data.id,
      replyUrl: `https://threads.net/post/${postId}/reply/${data.id}`,
    };
  } catch (error) {
    await logPlatformError(
      "threads",
      ErrorType.PLATFORM_THREADS_ERROR,
      `Failed to reply to Threads post: ${error instanceof Error ? error.message : "Unknown error"}`,
      {},
      error instanceof Error ? error : undefined
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// TIKTOK REPLIES
// ============================================================================

/**
 * Get replies to a TikTok video
 */
export async function getTikTokReplies(
  videoId: string,
  accessToken: string,
  limit: number = 50,
  cursor?: number
): Promise<{ replies: Reply[]; nextCursor?: number }> {
  try {
    const url = `https://open.tiktokapis.com/v2/video/comment/list/?video_id=${videoId}&max_count=${limit}${cursor ? `&cursor=${cursor}` : ""}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`TikTok API error: ${response.status}`);
    }

    const data = await response.json();

    const replies: Reply[] = (data.data?.comments || []).map((comment: any) => ({
      id: comment.id,
      text: comment.text,
      author: {
        id: comment.user?.id,
        handle: comment.user?.unique_id,
        displayName: comment.user?.display_name,
        avatarUrl: comment.user?.avatar_url,
      },
      createdAt: new Date(comment.create_time * 1000).toISOString(),
      likes: comment.like_count || 0,
      metrics: {
        likes: comment.like_count || 0,
        replies: comment.reply_count || 0,
      },
    }));

    return {
      replies,
      nextCursor: data.data?.cursor,
    };
  } catch (error) {
    await logPlatformError(
      "tiktok",
      ErrorType.PLATFORM_TIKTOK_ERROR,
      `Failed to get TikTok replies: ${error instanceof Error ? error.message : "Unknown error"}`,
      {},
      error instanceof Error ? error : undefined
    );
    return { replies: [] };
  }
}

/**
 * Post a reply to a TikTok video
 */
export async function replyToTikTok(
  text: string,
  videoId: string,
  accessToken: string
): Promise<ReplyResult> {
  try {
    const url = `https://open.tiktokapis.com/v2/video/comment/create/`;

    const body = {
      video_id: videoId,
      text: text,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TikTok reply failed: ${errorText}`);
    }

    const data = await response.json();

    return {
      success: true,
      replyId: data.data?.comment_id,
      replyUrl: `https://tiktok.com/@user/video/${videoId}?reply=${data.data?.comment_id}`,
    };
  } catch (error) {
    await logPlatformError(
      "tiktok",
      ErrorType.PLATFORM_TIKTOK_ERROR,
      `Failed to reply to TikTok post: ${error instanceof Error ? error.message : "Unknown error"}`,
      {},
      error instanceof Error ? error : undefined
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// UNIFIED REPLY FUNCTIONS
// ============================================================================

/**
 * Get replies for any supported platform
 */
export async function getReplies(
  platform: string,
  postId: string,
  credentials: Record<string, string>,
  limit: number = 50,
  cursor?: string | number
): Promise<{ replies: Reply[]; nextCursor?: string | number }> {
  switch (platform) {
    case "bluesky":
      return getBlueskyReplies(postId, credentials.handle, credentials.password, limit, cursor as string);
    case "x":
      return getXReplies(postId, credentials.consumerKey, credentials.consumerSecret, credentials.accessToken, credentials.accessTokenSecret, limit);
    case "linkedin":
      return getLinkedInReplies(postId, credentials.accessToken, limit);
    case "facebook":
      return getFacebookReplies(postId, credentials.accessToken, limit);
    case "instagram":
      return getInstagramReplies(postId, credentials.accessToken, limit);
    case "threads":
      return getThreadsReplies(postId, credentials.accessToken, limit);
    case "tiktok":
      return getTikTokReplies(postId, credentials.accessToken, limit, cursor as number);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Post a reply on any supported platform
 */
export async function replyToPost(
  platform: string,
  text: string,
  inReplyTo: string,
  credentials: Record<string, string>,
  mediaUrls?: string[]
): Promise<ReplyResult> {
  switch (platform) {
    case "bluesky":
      return replyToBluesky(text, inReplyTo, credentials.handle, credentials.password, mediaUrls);
    case "x":
      return replyToX(text, inReplyTo, credentials.consumerKey, credentials.consumerSecret, credentials.accessToken, credentials.accessTokenSecret, mediaUrls);
    case "linkedin":
      return replyToLinkedIn(text, inReplyTo, credentials.accessToken);
    case "facebook":
      return replyToFacebook(text, inReplyTo, credentials.accessToken);
    case "instagram":
      return replyToInstagram(text, inReplyTo, credentials.accessToken);
    case "threads":
      return replyToThreads(text, inReplyTo, credentials.accessToken);
    case "tiktok":
      return replyToTikTok(text, inReplyTo, credentials.accessToken);
    default:
      return {
        success: false,
        error: `Unsupported platform: ${platform}`,
      };
  }
}