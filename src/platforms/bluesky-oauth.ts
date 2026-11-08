/**
 * Bluesky / AT Protocol OAuth — standalone implementation.
 * =======================================================
 * NOT WIRED INTO THE WORKER YET. This module is self-contained so it can be
 * folded into src/index.ts once direct platform connections are approved.
 *
 * It implements the atproto OAuth profile:
 *   - public client identified by a hosted client metadata document
 *   - identity resolution (handle/DID -> DID document -> PDS -> auth server)
 *   - PKCE (S256) + Pushed Authorization Requests (PAR)
 *   - DPoP (ES256) with mandatory server nonces
 *   - authorization-code exchange, refresh-token rotation, authorized XRPC calls
 *
 * Wiring sketch:
 *
 *   const config: BlueskyOAuthConfig = {
 *     clientId: "https://post.freesurf.tools/oauth/bluesky/client-metadata.json",
 *     clientName: "FreeSurf Post",
 *     clientUri: "https://post.freesurf.tools",
 *     redirectUri: "https://post.freesurf.tools/api/oauth/bluesky/callback",
 *     logoUri: "https://post.freesurf.tools/freesurf-post-icon-400.png",
 *     tosUri: "https://post.freesurf.tools/terms/",
 *     policyUri: "https://post.freesurf.tools/privacy/",
 *   };
 *
 *   // 1. Serve clientMetadataResponse(config) at config.clientId (200, JSON).
 *   // 2. GET /api/connect/bluesky:
 *   //      const start = await startBlueskyOAuth(config, { identifier: handle });
 *   //      persist { state, codeVerifier, dpopKey, issuer, tokenEndpoint, did }
 *   //      redirect to start.authorizationUrl
 *   // 3. GET /api/oauth/bluesky/callback?code&state&iss:
 *   //      const session = await completeBlueskyOAuth(config, { ... });
 *   //      encrypt + store the session (including dpopKey) per user
 *   // 4. Before XRPC calls: session = await ensureFreshBlueskySession(config, session)
 *   //      const res = await blueskyFetch(session, "https://bsky.social/xrpc/...")
 *
 * The DPoP private key is part of the session secret: store it encrypted and
 * never expose it to the browser. Refresh tokens rotate, so persist the new
 * session after every refresh.
 */

export const BLUESKY_ENTRYWAY = "https://bsky.social";

/**
 * The bsky.social auth server currently advertises only the transitional
 * scopes (`atproto`, `transition:generic`, `transition:email`,
 * `transition:chat.bsky`). `transition:generic` is the app-password-equivalent
 * level: create/update/delete records, upload blobs, and read/write prefs.
 *
 * Narrow this to granular scopes once the auth server supports/advertises them:
 *   repo:app.bsky.feed.post?action=create
 *   repo:app.bsky.feed.like?action=create
 *   repo:app.bsky.graph.follow?action=create
 *   blob:image/*
 */
export const BLUESKY_DEFAULT_SCOPE = "atproto transition:generic";

export interface BlueskyOAuthConfig {
  /** Public HTTPS URL that serves the client metadata document. */
  clientId: string;
  clientName: string;
  clientUri: string;
  /** Registered callback. HTTPS is required for web clients. */
  redirectUri: string;
  scope?: string;
  logoUri?: string;
  tosUri?: string;
  policyUri?: string;
  applicationType?: "web" | "native";
  /** Entryway used for handle resolution and as a metadata fallback. */
  entryway?: string;
}

export interface BlueskyClientMetadata {
  client_id: string;
  client_name: string;
  client_uri: string;
  logo_uri?: string;
  tos_uri?: string;
  policy_uri?: string;
  application_type: "web" | "native";
  grant_types: string[];
  response_types: string[];
  scope: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none";
  dpop_bound_access_tokens: true;
}

export interface BlueskyAuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  pushed_authorization_request_endpoint: string;
  scopes_supported?: string[];
  dpop_signing_alg_values_supported?: string[];
  client_id_metadata_document_supported?: boolean;
  require_pushed_authorization_requests?: boolean;
}

export interface DpopKeyPair {
  /** Private JWK. Encrypt at rest; required for refresh and API calls. */
  privateJwk: JsonWebKey;
  /** Public JWK, embedded in the DPoP proof header. */
  publicJwk: JsonWebKey;
}

export interface BlueskyOAuthStart {
  authorizationUrl: string;
  state: string;
  codeVerifier: string;
  dpopKey: DpopKeyPair;
  issuer: string;
  tokenEndpoint: string;
  did?: string;
  handle?: string;
  pdsUrl?: string;
}

export interface BlueskyOAuthSession {
  did: string;
  scope: string;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  issuer: string;
  tokenEndpoint: string;
  dpopKey: DpopKeyPair;
}

interface BlueskyTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  sub: string;
}

export interface StartBlueskyOAuthOptions {
  /** Handle or DID supplied by the user. Omit to let the entryway ask. */
  identifier?: string;
  state?: string;
  codeVerifier?: string;
  dpopKey?: DpopKeyPair;
}

export interface CompleteBlueskyOAuthOptions {
  code: string;
  state: string;
  expectedState: string;
  codeVerifier: string;
  dpopKey: DpopKeyPair;
  tokenEndpoint: string;
  /** The `iss` query parameter from the callback, if present. */
  issuer?: string;
  expectedIssuer?: string;
  /** When the flow started with a handle/DID, bind the result to that DID. */
  expectedDid?: string;
}

/** The JSON document to serve at `config.clientId`. */
export function buildClientMetadata(config: BlueskyOAuthConfig): BlueskyClientMetadata {
  return {
    client_id: config.clientId,
    client_name: config.clientName,
    client_uri: config.clientUri,
    ...(config.logoUri ? { logo_uri: config.logoUri } : {}),
    ...(config.tosUri ? { tos_uri: config.tosUri } : {}),
    ...(config.policyUri ? { policy_uri: config.policyUri } : {}),
    application_type: config.applicationType ?? "web",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: config.scope ?? BLUESKY_DEFAULT_SCOPE,
    redirect_uris: [config.redirectUri],
    token_endpoint_auth_method: "none",
    dpop_bound_access_tokens: true,
  };
}

/** Ready-to-return response for the client metadata route. */
export function clientMetadataResponse(config: BlueskyOAuthConfig): Response {
  return new Response(JSON.stringify(buildClientMetadata(config), null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
}

/** Generate the per-session ES256 key used for DPoP. */
export async function createDpopKeyPair(): Promise<DpopKeyPair> {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;
  return {
    privateJwk: (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey,
    publicJwk: (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey,
  };
}

/** Build a DPoP proof JWT for one request. */
export async function createDpopProof(
  keyPair: DpopKeyPair,
  method: string,
  url: string,
  options: { nonce?: string; accessToken?: string } = {}
): Promise<string> {
  const header = {
    typ: "dpop+jwt",
    alg: "ES256",
    jwk: publicJwk(keyPair.publicJwk),
  };
  const payload: Record<string, unknown> = {
    jti: randomToken(16),
    htm: method.toUpperCase(),
    htu: stripQueryAndHash(url),
    iat: Math.floor(Date.now() / 1000),
  };
  if (options.nonce) payload.nonce = options.nonce;
  if (options.accessToken) payload.ath = await sha256B64url(options.accessToken);
  return signJwt(keyPair.privateJwk, header, payload);
}

/**
 * Resolve a handle/DID to its PDS and the authoritative authorization server.
 * Falls back to the entryway when the PDS metadata can't be read.
 */
export async function discoverAuthorizationServer(
  config: BlueskyOAuthConfig,
  identifier?: string
): Promise<{
  metadata: BlueskyAuthServerMetadata;
  did?: string;
  handle?: string;
  pdsUrl?: string;
}> {
  const entryway = (config.entryway ?? BLUESKY_ENTRYWAY).replace(/\/+$/, "");
  let did: string | undefined;
  let handle: string | undefined;
  let pdsUrl: string | undefined;

  if (identifier) {
    if (identifier.startsWith("did:")) {
      did = identifier;
    } else {
      handle = identifier;
      const resolved = await getJson<{ did: string }>(
        `${entryway}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(identifier)}`
      );
      did = resolved.did;
    }
    const didDoc = await resolveDidDocument(did);
    pdsUrl = pdsFromDidDocument(didDoc);
  }

  let asOrigin = entryway;
  if (pdsUrl) {
    try {
      const resource = await getJson<{ authorization_servers?: string[] }>(
        `${pdsUrl}/.well-known/oauth-protected-resource`
      );
      if (resource.authorization_servers?.[0]) asOrigin = resource.authorization_servers[0];
    } catch {
      asOrigin = entryway;
    }
  }

  const metadata = await getJson<BlueskyAuthServerMetadata>(
    `${asOrigin.replace(/\/+$/, "")}/.well-known/oauth-authorization-server`
  );
  if (originOf(metadata.issuer) !== originOf(asOrigin)) {
    throw new Error(`Authorization server issuer mismatch: ${metadata.issuer} != ${asOrigin}`);
  }

  return { metadata, did, handle, pdsUrl };
}

/**
 * Start the flow: resolve the account, push the authorization request (PAR),
 * and return the URL to send the user's browser to.
 */
export async function startBlueskyOAuth(
  config: BlueskyOAuthConfig,
  options: StartBlueskyOAuthOptions = {}
): Promise<BlueskyOAuthStart> {
  const { metadata, did, handle, pdsUrl } = await discoverAuthorizationServer(
    config,
    options.identifier
  );

  const state = options.state ?? randomToken(32);
  const codeVerifier = options.codeVerifier ?? randomToken(48);
  const codeChallenge = await sha256B64url(codeVerifier);
  const dpopKey = options.dpopKey ?? (await createDpopKeyPair());
  const scope = config.scope ?? BLUESKY_DEFAULT_SCOPE;

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  if (options.identifier) params.set("login_hint", options.identifier);

  const parUrl = metadata.pushed_authorization_request_endpoint;
  const parRes = await fetchWithDpop(
    parUrl,
    "POST",
    params.toString(),
    { "Content-Type": "application/x-www-form-urlencoded" },
    dpopKey
  );
  if (!parRes.ok) {
    throw new Error(`PAR failed (${parRes.status}): ${await parRes.text()}`);
  }
  const par = (await parRes.json()) as { request_uri: string };

  const authorizationUrl = new URL(metadata.authorization_endpoint);
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("request_uri", par.request_uri);

  return {
    authorizationUrl: authorizationUrl.toString(),
    state,
    codeVerifier,
    dpopKey,
    issuer: metadata.issuer,
    tokenEndpoint: metadata.token_endpoint,
    did,
    handle,
    pdsUrl,
  };
}

/** Exchange the callback code for tokens and verify the account binding. */
export async function completeBlueskyOAuth(
  config: BlueskyOAuthConfig,
  options: CompleteBlueskyOAuthOptions
): Promise<BlueskyOAuthSession> {
  if (options.state !== options.expectedState) {
    throw new Error("OAuth state mismatch");
  }
  if (
    options.issuer &&
    options.expectedIssuer &&
    originOf(options.issuer) !== originOf(options.expectedIssuer)
  ) {
    throw new Error("OAuth issuer mismatch");
  }

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    code_verifier: options.codeVerifier,
  });
  const res = await fetchWithDpop(
    options.tokenEndpoint,
    "POST",
    form.toString(),
    { "Content-Type": "application/x-www-form-urlencoded" },
    options.dpopKey
  );
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  }

  const token = (await res.json()) as BlueskyTokenResponse;
  assertAtprotoScope(token.scope);
  if (options.expectedDid && token.sub !== options.expectedDid) {
    throw new Error("Authenticated DID does not match the expected account");
  }

  return {
    did: token.sub,
    scope: token.scope,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenType: token.token_type,
    expiresAt: Date.now() + (token.expires_in || 300) * 1000,
    issuer: options.expectedIssuer ?? options.issuer ?? "",
    tokenEndpoint: options.tokenEndpoint,
    dpopKey: options.dpopKey,
  };
}

/**
 * Rotate the refresh token. AT Protocol refresh tokens are single-use, so the
 * returned session replaces the old one (persist it immediately).
 */
export async function refreshBlueskyTokens(
  config: BlueskyOAuthConfig,
  session: BlueskyOAuthSession,
  options: { nonce?: string } = {}
): Promise<BlueskyOAuthSession> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
    client_id: config.clientId,
  });
  const res = await fetchWithDpop(
    session.tokenEndpoint,
    "POST",
    form.toString(),
    { "Content-Type": "application/x-www-form-urlencoded" },
    session.dpopKey,
    { nonce: options.nonce }
  );
  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);
  }

  const token = (await res.json()) as BlueskyTokenResponse;
  assertAtprotoScope(token.scope);
  return {
    ...session,
    scope: token.scope,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || session.refreshToken,
    tokenType: token.token_type,
    expiresAt: Date.now() + (token.expires_in || 300) * 1000,
  };
}

/** Refresh only when the access token is close to expiring. */
export async function ensureFreshBlueskySession(
  config: BlueskyOAuthConfig,
  session: BlueskyOAuthSession
): Promise<BlueskyOAuthSession> {
  if (session.expiresAt - Date.now() > 60_000) return session;
  return refreshBlueskyTokens(config, session);
}

/**
 * Authorized XRPC request with a DPoP proof bound to the access token.
 * Call `ensureFreshBlueskySession` first; this does not refresh tokens.
 */
export async function blueskyFetch(
  session: BlueskyOAuthSession,
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, key) => {
    headers[key] = value;
  });
  const method = (init.method ?? "GET").toUpperCase();
  return fetchWithDpop(
    url,
    method,
    init.body ?? null,
    headers,
    session.dpopKey,
    { accessToken: session.accessToken }
  );
}

// ── internals ──────────────────────────────────────────────────────────────

async function fetchWithDpop(
  url: string,
  method: string,
  body: BodyInit | null,
  headers: Record<string, string>,
  dpopKey: DpopKeyPair,
  options: { accessToken?: string; nonce?: string } = {}
): Promise<Response> {
  const send = async (nonce?: string): Promise<Response> => {
    const proof = await createDpopProof(dpopKey, method, url, {
      nonce,
      accessToken: options.accessToken,
    });
    const requestHeaders: Record<string, string> = { ...headers, DPoP: proof };
    if (options.accessToken) requestHeaders.Authorization = `DPoP ${options.accessToken}`;
    return fetch(url, { method, headers: requestHeaders, body });
  };

  let res = await send(options.nonce);
  if (!res.ok) {
    const text = await res.clone().text();
    const nonce = res.headers.get("DPoP-Nonce");
    if (nonce && /use_dpop_nonce/i.test(text)) {
      res = await send(nonce);
    }
  }
  return res;
}

async function signJwt(
  privateJwk: JsonWebKey,
  header: Record<string, unknown>,
  payload: Record<string, unknown>
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const input = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(input)
  );
  return `${input}.${b64url(new Uint8Array(signature))}`;
}

function publicJwk(jwk: JsonWebKey): JsonWebKey {
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}

async function resolveDidDocument(did: string): Promise<unknown> {
  if (did.startsWith("did:plc:")) {
    return getJson(`https://plc.directory/${encodeURIComponent(did)}`);
  }
  if (did.startsWith("did:web:")) {
    return getJson(didWebToUrl(did));
  }
  throw new Error(`Unsupported DID method for ${did}`);
}

function didWebToUrl(did: string): string {
  const rest = did.slice("did:web:".length);
  const parts = rest.split(":");
  const host = decodeURIComponent(parts[0]);
  const path = parts
    .slice(1)
    .map((part) => decodeURIComponent(part))
    .join("/");
  return path ? `https://${host}/${path}/did.json` : `https://${host}/.well-known/did.json`;
}

function pdsFromDidDocument(document: unknown): string {
  const services = Array.isArray((document as { service?: unknown[] })?.service)
    ? ((document as { service: Array<Record<string, unknown>> }).service)
    : [];
  const pds = services.find((service) => {
    const id = String(service?.id ?? "");
    return id.endsWith("#atproto_pds") || service?.type === "AtprotoPersonalDataServer";
  });
  const endpoint = pds?.serviceEndpoint;
  if (!endpoint) throw new Error("DID document has no atproto_pds service");
  return String(endpoint).replace(/\/+$/, "");
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GET ${url} failed (${res.status})`);
  return (await res.json()) as T;
}

function assertAtprotoScope(scope: string): void {
  const values = String(scope || "").split(/\s+/);
  if (!values.includes("atproto")) {
    throw new Error("Token response is missing the required atproto scope");
  }
}

function originOf(url: string): string {
  return new URL(url).origin;
}

function stripQueryAndHash(url: string): string {
  const parsed = new URL(url);
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function randomToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlJson(value: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(value)));
}

async function sha256B64url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return b64url(new Uint8Array(digest));
}
