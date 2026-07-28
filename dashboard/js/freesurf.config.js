/**
 * FreeSurf — Shared Brand & Domain Configuration
 * ==============================================
 * Single source of truth. Change ROOT_DOMAIN to migrate domains.
 */

const ROOT_DOMAIN = "freesurf.tools";

const config = {
  ROOT_DOMAIN,
  COOKIE_DOMAIN: `.${ROOT_DOMAIN}`,
  BRAND_NAME: "FreeSurf",
  BRAND_TAGLINE: "Free tools for freelancers & small businesses",
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
  },
  AUTH: {
    COOKIE_NAME: "freesurf_session",
    COOKIE_MAX_AGE: 60 * 60 * 24 * 30,
    SUPABASE_URL: "https://jstojewashwoswsskwjk.supabase.co",
    SUPABASE_ANON_KEY:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzdG9qZXdhc2h3b3N3c3Nrd2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNTg2OTAsImV4cCI6MjA5MzkzNDY5MH0.o3hYxYr1ZbmEShPfZebx1vchjmIrN7uYZMX1C5fhoac",
  },
  TOOLS: [
    { name: "Invoices", url_subdomain: "invoices", status: "live", description: "Free invoice generator — no account required" },
    { name: "Links", url_subdomain: "links", status: "live", description: "Free link-in-bio pages" },
    { name: "Post", url_subdomain: "post", status: "beta", description: "Cross-post to social platforms" },
    { name: "Hire", url_subdomain: "hire", status: "coming-soon", description: "Contractor hiring hub" },
    { name: "PDF", url_subdomain: "pdf", status: "planned", description: "PDF reader, viewer, editor & e-sign" },
    { name: "Scanner", url_subdomain: "scanner", status: "planned", description: "PDF, QR & OCR scanner" },
  ],
};

Object.freeze(config);
Object.freeze(config.URLS);
Object.freeze(config.AUTH);
Object.freeze(config.TOOLS);

export default config;
