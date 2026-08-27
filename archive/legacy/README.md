# Legacy code — Archived

Dead / unused modules moved out of `src/` so the Worker type-checks clean.

## replies.ts

`src/replies.ts` was never imported by `src/index.ts` (which implements Bluesky
replies inline), referenced exports that no longer exist (`createSession`,
`generateOAuth1Header`), and failed to type-check. Comment handling for
non-Bluesky platforms goes through Bundle.social (`/api/comments`,
`/api/comments/import`), not this file.

## oauth.ts

`src/oauth.ts` held the direct platform-OAuth infrastructure (OAuth 2.0 state +
token exchange, per-platform configs, the X OAuth 1.0a flow, and encrypted token
storage). It was never wired into the router and its storage model
(`post_platform_tokens` with `*_encrypted` columns) no longer matches the
consolidated `accounts` table.

Kept for the eventual "migrate off Bundle" phase. When resurrected it should be
rewritten against the `accounts` table (plain tokens) and routed from
`src/index.ts`.
