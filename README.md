# Catpix

**Schedule once, publish everywhere.** A free, open-source social media scheduler for
freelancers, creators, and small businesses — compose a post once and send it to X, Bluesky,
LinkedIn, Facebook, Instagram, Threads, TikTok, YouTube, and more from one dashboard or API.

Catpix is built by [FreeSurf](https://freesurf.tools) for people who post the same update to
many platforms and don't want to pay $6–$99/month for tools like Buffer or Hootsuite.

- Web app: [catpix.app](https://catpix.app)
- API base: [post.freesurf.tools](https://post.freesurf.tools)
- Android: [Google Play](https://play.google.com/store/apps/details?id=tools.freesurf.post)
- License: MIT

> **Open source — with a note on self-hosting.** Catpix is MIT-licensed and the code is public,
> so you can read it, modify it, contribute, or deploy it to your own Cloudflare and Supabase
> accounts. It isn't yet a turnkey self-hosted package: publishing depends on hosted
> integrations — [bundle.social](https://bundle.social) holds the platform tokens today, and
> the platform/API calls are paid services — so a fully independent self-host needs those same
> accounts and keys. We're open-sourcing the stack first and plan to add self-host packaging as
> the integrations become self-contained.

## What it does

- **Schedule and cross-post** — compose once, choose platforms, then publish now or schedule.
- **One API** — `POST /api/post` and `POST /api/schedule` from your own apps with a simple API key.
- **Multi-team** — keep accounts separate (e.g. personal vs. a client/brand) and post to the right team.
- **Drafts, queues, hashtags, saved replies** — reusable content workflows in the dashboard.
- **Analytics and replies** — post metrics, per-platform trends, comment import and replies.
- **X fees** — prepaid credits cover X's per-post API cost ($0.015 plain, $0.20 with a link).
- **Mobile** — the Android app is live; iOS is in progress.

## Try it

Visit [catpix.app](https://catpix.app), sign in, connect your accounts, and start posting.

The API reference lives at [post.freesurf.tools/llms.txt](https://post.freesurf.tools/llms.txt).
The old `post.freesurf.tools` UI redirects to Catpix; the API stays on that host for existing
integrations and the mobile app.

## Supported platforms

Bluesky, X (Twitter), LinkedIn, Facebook, Instagram, Threads, TikTok, YouTube, Reddit,
Pinterest, Slack, Discord, and Google Business — 13 integrations via Bundle.social, with
direct platform adapters being built over time. Some platforms require a selected
page/channel or provider approval before publishing.

## Project structure

```
catpix/
├── src/                  # Cloudflare Worker (TypeScript)
│   ├── index.ts          # Router, auth, posting, scheduling, teams, credits
│   ├── auth.ts           # Supabase JWT validation
│   ├── types.ts          # Shared types
│   └── platforms/        # Direct adapters (used as we move off Bundle)
├── dashboard/            # Web UI (landing + app)
├── mobile/               # React Native / Expo app
├── supabase/             # Database schema (setup, api_keys, credits)
├── docs/                 # Local research / architecture notes (not published)
└── wrangler.toml         # Cloudflare Worker config
```

## Architecture (short version)

The dashboard is a static site served by Cloudflare Workers Assets; the Worker is the API. It
talks to Supabase for storage and to [bundle.social](https://bundle.social) to publish to the
platforms (Bundle holds the platform OAuth tokens today). We're gradually building our own
platform adapters so we can move off Bundle over time — see `docs/BUNDLE_DEPENDENCIES.md` for
that roadmap.

## Local development

```bash
npm install
npx wrangler dev        # serve the Worker + dashboard locally
npx wrangler deploy     # deploy to Cloudflare
```

## License

MIT — see [LICENSE](./LICENSE).

---

Part of the [FreeSurf](https://freesurf.tools) ecosystem — free, open-source tools for
independent workers.
