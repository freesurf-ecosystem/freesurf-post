# X Search (research CLI)

`social/x-search.mjs` queries the X API v2 **recent search** endpoint. It is a
generic research tool: separate from posting, app-only auth (`X_BEARER_TOKEN`),
and it never touches a connected account.

Recent search only covers roughly the last 7 days. Topic-specific query sets
are maintained outside this repo (for example in the marketing workspace).

## Setup

`X_BEARER_TOKEN` is read from `freesurf-post/.env` automatically. It is the
**App-Only** bearer token from the X developer portal, not a user access token.

## Usage

Pass a query directly for a quick one-off:

```powershell
npm run x:search -- "keyword1 OR keyword2 -is:retweet lang:en"
```

PowerShell mangles complex quoting, so for real work put the query in a file:

```powershell
npm run x:search -- --query-file path/to/query.txt --max 100
```

`query.txt` is one line, for example:

```
(keyword1 OR "keyword two") (context1 OR context2) -is:reply -is:retweet lang:en
```

Save the raw response for downstream scripts:

```powershell
npm run x:search -- --query-file path/to/query.txt --max 100 --out out/search.json
```

## Options

| Option | Notes |
|---|---|
| `--query-file <path>` | Read a query from a file (one query per file) |
| `--max <n>` | Total results, 10-300 (default 25) |
| `--start <iso>` / `--end <iso>` | Time window, e.g. `2026-07-12T00:00:00Z` |
| `--sort recency\|relevancy` | X-side order; defaults to `recency` |
| `--rank likes\|impressions\|bookmarks\|engagement` | Locally sort the fetched set |
| `--out <path>` | Save raw JSON (creates directories) |
| `--raw` | Print raw JSON instead of the summary |
| `--help, -h` | Show usage |

Environment overrides: `X_SEARCH_QUERY`, `X_MAX_RESULTS`, `X_TWEET_FIELDS`,
`X_EXPANSIONS`, `X_USER_FIELDS`, `X_SORT_ORDER`, `X_START_TIME`, `X_END_TIME`.

## Output

The default output is a readable summary per post:

```
@handle (Display Name) | 2026-07-12T14:03:00.000Z | en
https://x.com/i/web/status/1234567890
likes=42 reposts=7 replies=5 quotes=1
Post text...
```

`--out` saves the normalized response (`data`, `includes.users`, `meta`,
`request_urls`, `page_meta`).

## Notes

- `--sort` controls X's server-side order (`recency` or `relevancy`).
  `--rank` sorts only the posts fetched in this run, so it ranks the capped set
  rather than every matching post.
- For higher-engagement candidates, use `--sort relevancy --rank engagement`.
- X recent search is capped at 100 results per request; this script paginates
  up to `--max` (max 300 total).
- Search queries are limited to 512 characters.
- The endpoint is rate-limited per app. On a 429 the script prints the
  `Retry-After` value from X.
