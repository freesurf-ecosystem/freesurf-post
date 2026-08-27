/** Decode a base64url string to a Uint8Array */
function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

const SUPABASE_URL = "https://jstojewashwoswsskwjk.supabase.co";
const JWKS_URL = `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`;

// Cache the JWKS for 1 hour to avoid fetching it on every request.
let jwksCache: { keys?: Jwk[] } | null = null;
let jwksFetchedAt = 0;

interface Jwk {
  kid?: string;
  kty?: string;
  crv?: string;
  x?: string;
  y?: string;
  n?: string;
  e?: string;
}

async function getJwks(): Promise<{ keys?: Jwk[] } | null> {
  if (jwksCache && Date.now() - jwksFetchedAt < 3600_000) return jwksCache;
  try {
    const res = await fetch(JWKS_URL);
    if (!res.ok) return jwksCache;
    jwksCache = (await res.json()) as { keys?: Jwk[] };
    jwksFetchedAt = Date.now();
    return jwksCache;
  } catch {
    return jwksCache;
  }
}

/**
 * Validate a Supabase-issued JWT.
 * Supports both HS256 (legacy symmetric) and ES256 (asymmetric — the current
 * Supabase default for user access tokens) signatures.
 * Returns { sub, email } on success, null on failure.
 */
export async function validateSupabaseJWT(
  jwtSecret: string,
  authHeader: string | null
): Promise<{ sub: string; email: string } | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[0]))) as {
      alg?: string;
      kid?: string;
    };
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = base64urlDecode(parts[2]);

    let valid = false;

    if (header.alg === "ES256") {
      const jwks = await getJwks();
      const jwk = jwks?.keys?.find((k) => k.kid === header.kid);
      if (!jwk || !jwk.x || !jwk.y) return null;

      const publicKey = await crypto.subtle.importKey(
        "jwk",
        { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y },
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"]
      );
      valid = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        signature,
        data
      );
    } else {
      // HS256 (legacy symmetric signing)
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(jwtSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );
      valid = await crypto.subtle.verify("HMAC", key, signature, data);
    }

    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64urlDecode(parts[1]))
    ) as { sub?: string; email?: string; exp?: number };

    if (!payload.sub) return null;
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;

    return { sub: payload.sub, email: payload.email || "" };
  } catch {
    return null;
  }
}
