/**
 * Direct media pipeline — reviewer/sandbox scaffold.
 * ==================================================
 * Disabled by default (`MEDIA_DIRECT_ENABLED=0`). The existing Bundle upload
 * path in src/index.ts is unchanged.
 *
 * Scope:
 *   - validate an uploaded image/video
 *   - store the original in R2 under a random key
 *   - expose a public URL for platforms that fetch media themselves
 *   - delete the object after publishing (caller/cleanup responsibility)
 *
 * No transcoding, no playback, no long-term library. See docs/MEDIA_PIPELINE.md.
 */

import { FREESURF } from "../freesurf.config";

export const MEDIA_MAX_BYTES = 100 * 1024 * 1024;

export interface MediaEnv {
  MEDIA_BUCKET?: R2Bucket;
  MEDIA_PUBLIC_BASE?: string;
}

export interface UploadedMedia {
  key: string;
  url: string;
  contentType: string;
  size: number;
  expiresAt: string;
}

export type MediaValidation =
  | { ok: true; contentType: string; extension: string }
  | { ok: false; error: string };

interface DetectedType {
  mime: string;
  extension: string;
  aliases: string[];
}

const DEFAULT_PUBLIC_BASE = `${FREESURF.APP.URL}/api/media/direct/file`;

/**
 * Validate an uploaded file. The declared MIME type is only a hint; the magic
 * bytes are authoritative. Keeps the door closed to renamed/HTML/SVG payloads.
 */
export async function validateMediaFile(file: File): Promise<MediaValidation> {
  if (!file || typeof file.size !== "number" || file.size <= 0) {
    return { ok: false, error: "File is empty." };
  }
  if (file.size > MEDIA_MAX_BYTES) {
    return {
      ok: false,
      error: `File is too large. Max ${Math.round(MEDIA_MAX_BYTES / (1024 * 1024))} MB.`,
    };
  }

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detected = detectMediaType(head);
  if (!detected) {
    return {
      ok: false,
      error: "Unsupported file type. Use JPEG, PNG, GIF, WebP, MP4, or MOV.",
    };
  }

  const declared = (file.type || "").toLowerCase();
  if (declared && declared !== "application/octet-stream" && !detected.aliases.includes(declared)) {
    return {
      ok: false,
      error: `File type mismatch: declared ${declared}, detected ${detected.mime}.`,
    };
  }

  return { ok: true, contentType: detected.mime, extension: detected.extension };
}

export async function storeMedia(
  env: MediaEnv,
  file: File,
  validation: Extract<MediaValidation, { ok: true }>
): Promise<UploadedMedia> {
  if (!env.MEDIA_BUCKET) throw new Error("Media storage is not configured.");
  const key = `${randomHex(16)}.${validation.extension}`;
  await env.MEDIA_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: validation.contentType },
  });

  const base = (env.MEDIA_PUBLIC_BASE || DEFAULT_PUBLIC_BASE).replace(/\/+$/, "");
  return {
    key,
    url: `${base}/${key}`,
    contentType: validation.contentType,
    size: file.size,
    // Caller may publish immediately or hold until a scheduled time. This is a
    // safety window, not a promise that the object lives forever.
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function isMediaKey(key: string): boolean {
  return /^[a-f0-9]{32}\.(jpg|jpeg|png|gif|webp|mp4|mov)$/.test(key);
}

export async function getMedia(env: MediaEnv, key: string): Promise<R2ObjectBody | null> {
  if (!env.MEDIA_BUCKET || !isMediaKey(key)) return null;
  return env.MEDIA_BUCKET.get(key);
}

export async function deleteMedia(env: MediaEnv, key: string): Promise<void> {
  if (!env.MEDIA_BUCKET || !isMediaKey(key)) return;
  await env.MEDIA_BUCKET.delete(key);
}

/** Public response for platform media fetch (no auth by design). */
export function mediaResponse(object: R2ObjectBody): Response {
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      "Content-Length": String(object.size),
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function detectMediaType(bytes: Uint8Array): DetectedType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg", aliases: ["image/jpeg", "image/jpg"] };
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: "image/png", extension: "png", aliases: ["image/png"] };
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { mime: "image/gif", extension: "gif", aliases: ["image/gif"] };
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    return { mime: "image/webp", extension: "webp", aliases: ["image/webp"] };
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12).toLowerCase();
    if (brand.startsWith("qt")) {
      return { mime: "video/quicktime", extension: "mov", aliases: ["video/quicktime"] };
    }
    return {
      mime: "video/mp4",
      extension: "mp4",
      aliases: ["video/mp4", "video/quicktime"],
    };
  }
  return null;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
