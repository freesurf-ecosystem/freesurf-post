/**
 * Cryptographic utilities for secure token storage
 * Uses Web Crypto API available in Cloudflare Workers and modern browsers
 */

/**
 * Derive an encryption key from a master secret using PBKDF2
 * The master secret is stored as a Cloudflare Worker secret
 */
export async function deriveEncryptionKey(
  masterSecret: string,
  salt: string = "freesurf-to-post-default-salt"
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(masterSecret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt sensitive data (tokens, secrets)
 * Returns base64-encoded ciphertext with IV
 */
export async function encryptData(
  data: string,
  key: CryptoKey
): Promise<string> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(data)
  );

  // Combine IV and ciphertext, then encode as base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt sensitive data
 * Takes base64-encoded ciphertext with IV
 */
export async function decryptData(
  encryptedData: string,
  key: CryptoKey
): Promise<string> {
  // Decode base64
  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

  // Extract IV (first 12 bytes) and ciphertext
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Hash sensitive identifiers for logging/storage
 * Don't log actual tokens, use hashes instead
 */
export async function hashSensitiveValue(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a secure random token for OAuth state parameters
 */
export function generateRandomState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a correlation ID for error tracking
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const random = generateRandomState().slice(0, 8);
  return `${timestamp}-${random}`;
}

/**
 * Safe token redaction for logging
 * Returns only first 8 and last 4 characters with ellipsis
 */
export function redactToken(token: string): string {
  if (!token || token.length < 12) return "[REDACTED]";
  return `${token.substring(0, 8)}...${token.substring(token.length - 4)}`;
}

/**
 * Validate token format and return if safe for storage
 */
export function validateTokenForStorage(token: string): { valid: boolean; error?: string } {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Token must be a non-empty string" };
  }

  // Basic length check (most tokens are at least 20 characters)
  if (token.length < 20) {
    return { valid: false, error: "Token appears too short" };
  }

  // Check for common whitespace or newline issues
  if (/\s/.test(token)) {
    return { valid: false, error: "Token contains whitespace" };
  }

  return { valid: true };
}

/**
 * Encryption key cache to avoid re-deriving keys repeatedly
 */
const keyCache = new Map<string, CryptoKey>();

/**
 * Get or create encryption key with caching
 */
export async function getEncryptionKey(
  masterSecret: string,
  salt: string = "freesurf-to-post-default-salt"
): Promise<CryptoKey> {
  const cacheKey = `${salt.substring(0, 16)}`; // Use first 16 chars of salt as cache key

  if (keyCache.has(cacheKey)) {
    return keyCache.get(cacheKey)!;
  }

  const key = await deriveEncryptionKey(masterSecret, salt);
  keyCache.set(cacheKey, key);
  return key;
}

/**
 * Clear encryption key cache (useful for testing or key rotation)
 */
export function clearKeyCache(): void {
  keyCache.clear();
}

/**
 * Token metadata for tracking encryption state
 */
export interface EncryptedTokenMetadata {
  version: number; // Encryption version for future migration
  algorithm: string; // Algorithm used (e.g., "AES-GCM-256")
  keyId: string; // Identifier for the key used
  createdAt: string; // ISO timestamp
}

/**
 * Encrypt token with metadata
 */
export async function encryptToken(
  token: string,
  key: CryptoKey,
  keyId: string = "default"
): Promise<{ encrypted: string; metadata: EncryptedTokenMetadata }> {
  const validation = validateTokenForStorage(token);
  if (!validation.valid) {
    throw new Error(`Invalid token for encryption: ${validation.error}`);
  }

  const encrypted = await encryptData(token, key);
  const metadata: EncryptedTokenMetadata = {
    version: 1,
    algorithm: "AES-GCM-256",
    keyId,
    createdAt: new Date().toISOString(),
  };

  return { encrypted, metadata };
}

/**
 * Decrypt token with metadata validation
 */
export async function decryptToken(
  encrypted: string,
  key: CryptoKey,
  expectedVersion: number = 1
): Promise<string> {
  const decrypted = await decryptData(encrypted, key);
  
  // Future: validate metadata here if we store it separately
  // For now, we assume tokens are always version 1
  
  return decrypted;
}