# FreeSurf Post

**Write once, publish everywhere.** A free cross-posting tool for freelancers and small
businesses — compose a post once and send it to X, Bluesky, LinkedIn, Facebook, Instagram,
Threads, TikTok, and YouTube from a single dashboard or API.

Built by [FreeSurf](https://freesurf.tools), for people who post the same update to many
platforms and don't want to pay $6–$99/month for tools like Buffer or Hootsuite.

## What it does

- **One dashboard** — compose, add media, pick platforms and teams, and post or schedule.
- **One API** — `POST /api/post` and `POST /api/schedule` from your own apps with a simple
  API key.
- **Multi-team** — keep accounts separate (e.g. personal vs. a client/brand) and always post
  to the right team.
- **Scheduling** — pick a time and timezone; posts go out automatically.
- **X fees** — prepaid credits cover X's per-post API cost ($0.015 plain, $0.20 with a link).

## Try it

Visit [post.freesurf.tools](https://post.freesurf.tools), sign in, connect your accounts, and
start posting. The full API reference lives at
[post.freesurf.tools/llms.txt](https://post.freesurf.tools/llms.txt).

## Supported platforms

X (Twitter), Bluesky, LinkedIn, Facebook, Instagram, Threads, TikTok, YouTube — all wired up.
Reddit, Pinterest, Slack, Discord, and Google Business are connectable but not yet enabled for
posting.

## Project structure

```
freesurf-post/
├── src/                  # Cloudflare Worker (TypeScript)
│   ├── index.ts          # Router, auth, posting, scheduling, teams, credits
│   ├── auth.ts           # Supabase JWT validation
│   ├── types.ts          # Shared types
│   └── platforms/        # Direct adapters (used as we move off Bundle)
├── dashboard/            # Web UI (landing + app)
├── supabase/             # Database schema (setup, api_keys, credits)
├── docs/                 # Architecture + Bundle dependency notes
└── wrangler.toml         # Cloudflare Worker config
```

## Architecture (short version)

The dashboard is a static site; the Cloudflare Worker is the API. It talks to Supabase for
storage and to [bundle.social](https://bundle.social) to actually publish to the platforms
(they hold the platform OAuth tokens today). We're gradually building our own platform
adapters so we can move off bundle.social over time — see `docs/BUNDLE_DEPENDENCIES.md` for
that roadmap.

## Local development

```bash
npm install
npx wrangler dev        # serve the Worker + dashboard locally
npx wrangler deploy     # deploy to Cloudflare
```

## License

GNU General Public License v3.0 — see [LICENSE](./LICENSE).

---

Part of the [FreeSurf](https://freesurf.tools) ecosystem — free, open-source tools for
independent workers.
