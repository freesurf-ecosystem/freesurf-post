/**
 * LinkedIn OAuth 2.0 — member and organization posting.
 * =====================================================
 * NOT WIRED INTO THE WORKER YET. Standalone module for the direct-connection
 * work, covering both:
 *   - personal profile posting (`w_member_social`)
 *   - company page posting via the Community Management API
 *     (`w_organization_social`, `r_organization_social`, `rw_organization_admin`)
 *
 * Personal posting only needs the self-serve "Share on LinkedIn" product.
 * Organization posting requires the Marketing Developer Platform / Community
 * Management API application and a Page role of ADMINISTRATOR (or CONTENT_ADMIN
 * for posting).
 *
 * Wiring sketch:
 *
 *   const config: LinkedInOAuthConfig = {
 *     clientId: env.LINKEDIN_CLIENT_ID,
 *     clientSecret: env.LINKEDIN_CLIENT_SECRET,
 *     redirectUri: "https://catvideo.app/api/oauth/linkedin/callback",
 *     scope: LINKEDIN_ORGANIZATION_SCOPE, // or LINKEDIN_MEMBER_SCOPE
 *   };
 *
 *   const state = randomToken();
 *   // persist state, then redirect to buildAuthorizeUrl(config, state)
 *   const session = await completeLinkedInOAuth(config, code);
 *   // store accessToken / refreshToken encrypted per user
 *   const orgs = await listAdminOrganizations(session.accessToken, config);
 *   await createMemberPost(session.accessToken, config, session.personUrn, "Hello");
 *   await createOrganizationPost(session.accessToken, config, orgs[0].urn, "Hello");
 *
 * Access tokens last ~60 days. Refresh tokens are only issued to approved
 * Marketing Developer Platform partners; otherwise the user re-authorizes.
 */

export const LINKEDIN_AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const LINKEDIN_API_BASE = "https://api.linkedin.com";

/** Latest Marketing API version at the time of writing (YYYYMM). */
export const LINKEDIN_API_VERSION = "202610";

/** OpenID identity + personal profile posting. */
export const LINKEDIN_MEMBER_SCOPE = "openid profile email w_member_social";

/** OpenID identity + personal posting + company page management/posting. */
export const LINKEDIN_ORGANIZATION_SCOPE =
  "openid profile email w_member_social w_organization_social r_organization_social rw_organization_admin";

export interface LinkedInOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope?: string;
  /** Marketing API version header. Defaults to LINKEDIN_API_VERSION. */
  version?: string;
}

export interface LinkedInTokenSet {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
  refreshTokenExpiresAt?: number;
  scope: string;
}

export interface LinkedInSession extends LinkedInTokenSet {
  personId: string;
  /** `urn:li:person:{id}` */
  personUrn: string;
  name?: string;
  email?: string;
  picture?: string;
}

export interface LinkedInUserInfo {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
  locale?: string;
}

export interface LinkedInOrganization {
  /** `urn:li:organization:{id}` */
  urn: string;
  id: string;
  role: string;
  state: string;
}

export interface CreateLinkedInPostOptions {
  authorUrn: string;
  commentary: string;
  visibility?: "PUBLIC" | "CONNECTIONS";
  /** Optional media/article content block, e.g. { media: { id: "urn:li:image:..." } }. */
  content?: Record<string, unknown>;
}

export interface CreatedLinkedInPost {
  id: string;
  url: string;
}

export function buildAuthorizeUrl(
  config: LinkedInOAuthConfig,
  state: string,
  scope?: string
): string {
  const url = new URL(LINKEDIN_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", scope ?? config.scope ?? LINKEDIN_MEMBER_SCOPE);
  return url.toString();
}

export async function exchangeCode(
  config: LinkedInOAuthConfig,
  code: string,
  redirectUri?: string
): Promise<LinkedInTokenSet> {
  return tokenRequest(
    config,
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri ?? config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    })
  );
}

export async function refreshAccessToken(
  config: LinkedInOAuthConfig,
  refreshToken: string
): Promise<LinkedInTokenSet> {
  return tokenRequest(
    config,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    })
  );
}

/** Exchange a code and resolve the member identity in one step. */
export async function completeLinkedInOAuth(
  config: LinkedInOAuthConfig,
  code: string,
  redirectUri?: string
): Promise<LinkedInSession> {
  const tokens = await exchangeCode(config, code, redirectUri);
  const user = await getUserInfo(tokens.accessToken);
  return {
    ...tokens,
    personId: user.sub,
    personUrn: `urn:li:person:${user.sub}`,
    name: user.name,
    email: user.email,
    picture: user.picture,
  };
}

/** OIDC userinfo (`openid profile email`). */
export async function getUserInfo(accessToken: string): Promise<LinkedInUserInfo> {
  const res = await fetch(`${LINKEDIN_API_BASE}/v2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`LinkedIn userinfo failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as LinkedInUserInfo;
}

/**
 * List organizations where the authorized member is an APPROVED ADMINISTRATOR.
 * Requires `rw_organization_admin` (or `r_organization_admin`).
 */
export async function listAdminOrganizations(
  accessToken: string,
  config: LinkedInOAuthConfig
): Promise<LinkedInOrganization[]> {
  const out: LinkedInOrganization[] = [];
  let start = 0;
  const count = 100;

  for (;;) {
    const url = new URL(`${LINKEDIN_API_BASE}/rest/organizationAcls`);
    url.searchParams.set("q", "roleAssignee");
    url.searchParams.set("role", "ADMINISTRATOR");
    url.searchParams.set("state", "APPROVED");
    url.searchParams.set("count", String(count));
    url.searchParams.set("start", String(start));

    const res = await restFetch(url.toString(), accessToken, config, { method: "GET" });
    if (!res.ok) {
      throw new Error(`LinkedIn organizationAcls failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as {
      elements?: Array<Record<string, unknown>>;
      paging?: { links?: unknown[] };
    };
    const elements = data.elements ?? [];
    for (const element of elements) {
      const urn = String(element.organization ?? element.organizationTarget ?? "");
      if (!urn.startsWith("urn:li:organization:")) continue;
      out.push({
        urn,
        id: urn.split(":").pop() ?? "",
        role: String(element.role ?? ""),
        state: String(element.state ?? ""),
      });
    }
    if (elements.length < count) break;
    start += count;
  }

  return out;
}

/** Create a text-only post authored by a member or organization. */
export async function createPost(
  accessToken: string,
  config: LinkedInOAuthConfig,
  options: CreateLinkedInPostOptions
): Promise<CreatedLinkedInPost> {
  const body: Record<string, unknown> = {
    author: options.authorUrn,
    commentary: options.commentary,
    visibility: options.visibility ?? "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (options.content) body.content = options.content;

  const res = await restFetch(`${LINKEDIN_API_BASE}/rest/posts`, accessToken, config, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`LinkedIn create post failed (${res.status}): ${await res.text()}`);
  }
  const id = res.headers.get("x-restli-id") ?? "";
  return {
    id,
    url: id ? `https://www.linkedin.com/feed/update/${id}/` : "https://www.linkedin.com/feed/",
  };
}

export function createMemberPost(
  accessToken: string,
  config: LinkedInOAuthConfig,
  personUrn: string,
  commentary: string,
  content?: Record<string, unknown>
): Promise<CreatedLinkedInPost> {
  return createPost(accessToken, config, { authorUrn: personUrn, commentary, content });
}

export function createOrganizationPost(
  accessToken: string,
  config: LinkedInOAuthConfig,
  organizationUrn: string,
  commentary: string,
  content?: Record<string, unknown>
): Promise<CreatedLinkedInPost> {
  return createPost(accessToken, config, { authorUrn: organizationUrn, commentary, content });
}

// ── internals ──────────────────────────────────────────────────────────────

async function tokenRequest(
  config: LinkedInOAuthConfig,
  body: URLSearchParams
): Promise<LinkedInTokenSet> {
  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`LinkedIn token request failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    scope?: string;
  };
  if (!data.access_token) throw new Error("LinkedIn token response is missing access_token");
  const now = Date.now();
  return {
    accessToken: data.access_token,
    expiresAt: now + (data.expires_in ?? 0) * 1000,
    refreshToken: data.refresh_token,
    refreshTokenExpiresAt:
      data.refresh_token && data.refresh_token_expires_in
        ? now + data.refresh_token_expires_in * 1000
        : undefined,
    scope: data.scope ?? "",
  };
}

function restFetch(
  url: string,
  accessToken: string,
  config: LinkedInOAuthConfig,
  init: RequestInit
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "Linkedin-Version": config.version ?? LINKEDIN_API_VERSION,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}
