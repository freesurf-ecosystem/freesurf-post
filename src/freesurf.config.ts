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
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzdG9qZXdhc2h3b3N3c3Nrd2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNTg2OTAsImV4cCI6MjA5MzkzNDY5MH0.o3hYxYr1ZbmEShPfZebx1vchjmIrN7uYZMX1C5fhoac",
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
