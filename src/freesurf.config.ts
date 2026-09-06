/**
 * FreeSurf — Shared Brand & Domain Configuration (TypeScript for Workers)
 * =====================================================================
 * Single source of truth. Change ROOT_DOMAIN to migrate domains.
 */

const ROOT_DOMAIN = "freesurf.tools" as const;

export const FREESURF = {
  ROOT_DOMAIN,
  COOKIE_DOMAIN: `.${ROOT_DOMAIN}` as const,
  BRAND_NAME: "FreeSurf" as const,
  BRAND_TAGLINE: "Free tools for freelancers & small businesses" as const,
  URLS: {
    home: `https://${ROOT_DOMAIN}`,
    auth: `https://auth.${ROOT_DOMAIN}`,
    invoices: `https://invoices.${ROOT_DOMAIN}`,
    links: `https://links.${ROOT_DOMAIN}`,
    post: `https://post.${ROOT_DOMAIN}`,
    hire: `https://hire.${ROOT_DOMAIN}`,
    pdf: `https://pdf.${ROOT_DOMAIN}`,
    scanner: `https://scanner.${ROOT_DOMAIN}`,
    contact: `mailto:hello@${ROOT_DOMAIN}`,
  } as const,
  AUTH: {
    COOKIE_NAME: "freesurf_session",
    COOKIE_MAX_AGE: 60 * 60 * 24 * 30,
    SUPABASE_URL: "https://jstojewashwoswsskwjk.supabase.co",
    SUPABASE_ANON_KEY:
      "sb_publishable_-nyuPas2pnqOcHMNJUCHog_xUlJbtuU",
  } as const,
  CORS_ORIGINS: {
    post: [
      `https://post.${ROOT_DOMAIN}`,
      `https://${ROOT_DOMAIN}`,
      "http://localhost:5173",
      "http://localhost:3000",
    ],
  } as const,
} as const;
