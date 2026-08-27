/**
 * Fetch per-user platform tokens from Supabase.
 * The Worker uses the service_role key so it can bypass RLS
 * and read tokens for any user (server-side).
 */

export interface PlatformToken {
  id: string;
  platform: string;
  profile_label: string;
  access_token: string;
  refresh_token?: string;
  platform_user_id?: string;
  platform_handle?: string;
  metadata?: Record<string, unknown>;
}

const SUPABASE_URL = "https://jstojewashwoswsskwjk.supabase.co";

/**
 * Fetch all platform tokens for a given user from Supabase.
 * Uses the service_role key (set as Worker secret SUPABASE_SERVICE_ROLE_KEY).
 */
export async function fetchUserTokens(
  userId: string,
  serviceRoleKey: string
): Promise<PlatformToken[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/post_accounts?user_id=eq.${userId}&select=*`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    }
  );

  if (!res.ok) {
    console.error(`Failed to fetch tokens for ${userId}: ${res.status}`);
    return [];
  }

  return (await res.json()) as PlatformToken[];
}

/**
 * Find the best token for a user on a given platform.
 * If a specific profileLabel is requested, use that.
 * Otherwise, return the first available token.
 */
export function findToken(
  tokens: PlatformToken[],
  platform: string,
  profileLabel?: string
): PlatformToken | null {
  const matches = tokens.filter((t) => t.platform === platform);
  if (!matches.length) return null;

  if (profileLabel) {
    return matches.find((t) => t.profile_label === profileLabel) ?? matches[0];
  }

  return matches[0];
}

/**
 * Build the list of connected profiles for a user (for dashboard display).
 */
export function listConnectedProfiles(tokens: PlatformToken[]) {
  return tokens.map((t) => ({
    platform: t.platform,
    label: t.profile_label,
    handle: t.platform_handle ?? "",
    id: t.id,
  }));
}
