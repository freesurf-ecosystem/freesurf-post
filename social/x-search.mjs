#!/usr/bin/env node
/**
 * X Recent Search - FreeSurf Post
 *
 * Queries the X API v2 recent-search endpoint for posts about a topic, prints
 * a compact summary, and optionally saves the raw JSON for downstream work.
 * This is the research counterpart to the posting API: it uses app-only auth
 * (X_BEARER_TOKEN) and does not touch any connected account.
 *
 * Usage:
 *   npm run x:search -- "keyword1 OR keyword2 -is:retweet lang:en"
 *   npm run x:search -- --query-file path/to/query.txt --max 100
 *   npm run x:search -- --query-file path/to/query.txt --raw --out out/search.json
 *
 * Env (reads freesurf-post/.env automatically):
 *   X_BEARER_TOKEN   Required. App-only bearer token from the X developer portal.
 *   X_SEARCH_QUERY   Optional fallback query when no query is passed.
 *   X_MAX_RESULTS    Optional default max results (10-300).
 *   X_TWEET_FIELDS   Optional override for tweet.fields.
 *   X_EXPANSIONS     Optional override for expansions.
 *   X_USER_FIELDS    Optional override for user.fields.
 *   X_SORT_ORDER     Optional default sort_order (recency or relevancy).
 *   X_START_TIME     Optional default ISO 8601 lower bound.
 *   X_END_TIME       Optional default ISO 8601 upper bound.
 */

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEFAULT_MAX_RESULTS = 25;
const DEFAULT_TWEET_FIELDS = 'created_at,text,public_metrics,lang,author_id,note_tweet';
const DEFAULT_EXPANSIONS = 'author_id';
const DEFAULT_USER_FIELDS = 'username,name,verified';

const RANK_METRICS = {
  likes: (post) => Number(post.public_metrics?.like_count ?? 0),
  impressions: (post) => Number(post.public_metrics?.impression_count ?? 0),
  bookmarks: (post) => Number(post.public_metrics?.bookmark_count ?? 0),
  engagement: (post) => {
    const metrics = post.public_metrics ?? {};
    return (
      Number(metrics.like_count ?? 0) +
      Number(metrics.retweet_count ?? 0) +
      Number(metrics.reply_count ?? 0) +
      Number(metrics.quote_count ?? 0) +
      Number(metrics.bookmark_count ?? 0)
    );
  },
};

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function requireValue(argv, index, flag) {
  const value = argv[index]?.trim();
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}

function parseArgs(argv) {
  const options = {
    queryParts: [],
    queryFile: '',
    maxResults: null,
    outFile: '',
    startTime: '',
    endTime: '',
    sortOrder: '',
    rank: '',
    raw: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--raw') {
      options.raw = true;
    } else if (arg === '--out') {
      options.outFile = requireValue(argv, ++index, '--out');
    } else if (arg === '--query-file') {
      options.queryFile = requireValue(argv, ++index, '--query-file');
    } else if (arg === '--max') {
      options.maxResults = requireValue(argv, ++index, '--max');
    } else if (arg === '--start') {
      options.startTime = requireValue(argv, ++index, '--start');
    } else if (arg === '--end') {
      options.endTime = requireValue(argv, ++index, '--end');
    } else if (arg === '--sort') {
      options.sortOrder = requireValue(argv, ++index, '--sort').toLowerCase();
    } else if (arg === '--rank') {
      options.rank = requireValue(argv, ++index, '--rank').toLowerCase();
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      options.queryParts.push(arg);
    }
  }

  return options;
}

function printHelp() {
  console.log([
    'X Recent Search - FreeSurf Post',
    '',
    'Usage:',
    '  npm run x:search -- "<query>" [options]',
    '  npm run x:search -- --query-file <path> [options]',
    '',
    'Options:',
    '  --query-file <path>  Read a query from a file (one query per file).',
    '  --max <n>            Total results to fetch (10-300, default 25).',
    '  --start <iso>        ISO 8601 lower bound, e.g. 2026-07-06T00:00:00Z.',
    '  --end <iso>          ISO 8601 upper bound, e.g. 2026-07-07T00:00:00Z.',
    '  --sort <order>       X-side order: recency (default) or relevancy.',
    '  --rank <metric>      Locally sort the fetched set: likes, impressions,',
    '                       bookmarks, or engagement.',
    '  --out <path>         Save the raw JSON response to a file.',
    '  --raw                Print raw JSON instead of the summary.',
    '  --help, -h           Show this help.',
    '',
    'Environment:',
    '  X_BEARER_TOKEN       Required. App-only bearer token.',
    '  X_SEARCH_QUERY       Fallback query when no query is passed.',
    '  X_MAX_RESULTS        Default max results (10-300).',
    '  X_TWEET_FIELDS       Override tweet.fields.',
    '  X_EXPANSIONS         Override expansions.',
    '  X_USER_FIELDS        Override user.fields.',
    '  X_SORT_ORDER         recency (default) or relevancy.',
    '  X_START_TIME         Default ISO 8601 lower bound.',
    '  X_END_TIME           Default ISO 8601 upper bound.',
    '',
    'Examples:',
    '  npm run x:search -- "keyword1 OR keyword2 -is:retweet lang:en" --max 50',
    '  npm run x:search -- --query-file path/to/query.txt --sort relevancy --rank engagement',
    '  npm run x:search -- --query-file path/to/query.txt --raw --out out/search.json',
  ].join('\n'));
}

function rankPosts(posts, metric) {
  const score = RANK_METRICS[metric];
  if (!score) {
    throw new Error(`--rank must be one of: ${Object.keys(RANK_METRICS).join(', ')}.`);
  }

  return [...posts].sort((left, right) => {
    const diff = score(right) - score(left);
    if (diff !== 0) return diff;
    return String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''));
  });
}

function getQuery(options) {
  if (options.queryParts.length > 0 && options.queryFile) {
    throw new Error('Provide either a query or --query-file, not both.');
  }

  if (options.queryParts.length > 0) {
    return options.queryParts.join(' ').trim();
  }

  if (options.queryFile) {
    const path = resolve(process.cwd(), options.queryFile);
    if (!existsSync(path)) throw new Error(`Query file not found: ${options.queryFile}`);
    const query = readFileSync(path, 'utf8').trim();
    if (!query) throw new Error(`Query file is empty: ${options.queryFile}`);
    return query;
  }

  const envQuery = process.env.X_SEARCH_QUERY?.trim();
  if (envQuery) return envQuery;

  throw new Error('No query provided. Pass a query, --query-file <path>, or set X_SEARCH_QUERY.');
}

function getMaxResults(options) {
  const raw = options.maxResults ?? process.env.X_MAX_RESULTS?.trim() ?? String(DEFAULT_MAX_RESULTS);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 10 || parsed > 300) {
    throw new Error('Max results must be an integer between 10 and 300.');
  }
  return parsed;
}

function getOptional(name) {
  return process.env[name]?.trim() || '';
}

function toIso(name, value) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`${name} must be a valid ISO 8601 datetime.`);
  }
  return new Date(parsed).toISOString().replace('.000Z', 'Z');
}

function buildParams(query, pageSize, nextToken, options) {
  const sortOrder = options.sortOrder || getOptional('X_SORT_ORDER') || 'recency';
  if (sortOrder !== 'recency' && sortOrder !== 'relevancy') {
    throw new Error('--sort must be recency or relevancy.');
  }

  const params = new URLSearchParams({
    query,
    'tweet.fields': getOptional('X_TWEET_FIELDS') || DEFAULT_TWEET_FIELDS,
    expansions: getOptional('X_EXPANSIONS') || DEFAULT_EXPANSIONS,
    'user.fields': getOptional('X_USER_FIELDS') || DEFAULT_USER_FIELDS,
    max_results: String(pageSize),
    sort_order: sortOrder,
  });

  const start = options.startTime || getOptional('X_START_TIME');
  if (start) params.set('start_time', toIso('--start', start));

  const end = options.endTime || getOptional('X_END_TIME');
  if (end) params.set('end_time', toIso('--end', end));

  if (nextToken) params.set('next_token', nextToken);

  return params;
}

function mergeIncludes(includesList) {
  const users = [];
  const seen = new Set();

  for (const includes of includesList) {
    for (const user of includes?.users ?? []) {
      if (!user?.id || seen.has(user.id)) continue;
      seen.add(user.id);
      users.push(user);
    }
  }

  return users.length ? { users } : undefined;
}

function getPostUrl(post) {
  return post?.id ? `https://x.com/i/web/status/${post.id}` : '';
}

function getDisplayText(post) {
  return post?.note_tweet?.text ?? post?.text ?? '';
}

async function fetchPage(url, bearerToken) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });

  if (!response.ok) {
    const body = await response.text();
    const retryAfter = response.headers.get('retry-after');
    const suffix = retryAfter ? ` (retry after ${retryAfter}s)` : '';
    throw new Error(
      `X API request failed: ${response.status} ${response.statusText}${suffix}\n${body}`,
    );
  }

  return response.json();
}

async function writeOutputFile(outFile, body) {
  const absolute = resolve(process.cwd(), outFile);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, JSON.stringify(body, null, 2), 'utf8');
  return absolute;
}

function printSummary(query, body) {
  const authorMap = new Map((body.includes?.users ?? []).map((user) => [user.id, user]));

  console.log(`Query: ${query}`);
  console.log(`Returned ${body.data.length} posts across ${body.meta.pages_fetched} page(s).`);

  if (!body.data.length) {
    console.log('No posts matched.');
    return;
  }

  for (const post of body.data) {
    const author = authorMap.get(post.author_id);
    const handle = author?.username ? `@${author.username}` : post.author_id ?? 'unknown';
    const name = author?.name ? ` (${author.name})` : '';
    const metrics = post.public_metrics;

    console.log('\n' + '-'.repeat(72));
    console.log(
      `${handle}${name} | ${post.created_at ?? 'unknown date'}${post.lang ? ` | ${post.lang}` : ''}`,
    );
    console.log(getPostUrl(post));
    if (metrics) {
      console.log(
        `likes=${metrics.like_count ?? 0} reposts=${metrics.retweet_count ?? 0} ` +
          `replies=${metrics.reply_count ?? 0} quotes=${metrics.quote_count ?? 0}` +
          (metrics.impression_count !== undefined
            ? ` impressions=${metrics.impression_count}`
            : ''),
      );
    }
    console.log(getDisplayText(post));
  }
}

async function main() {
  loadEnv();

  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const bearerToken = process.env.X_BEARER_TOKEN?.trim();
  if (!bearerToken) {
    throw new Error(
      'Missing X_BEARER_TOKEN. Add it to freesurf-post/.env or export it before running.',
    );
  }

  const query = getQuery(options);
  const maxResults = getMaxResults(options);

  const posts = [];
  const includesList = [];
  const pageMeta = [];
  const requestUrls = [];
  let nextToken = '';

  while (posts.length < maxResults) {
    const remaining = maxResults - posts.length;
    const pageSize = Math.min(Math.max(remaining, 10), 100);
    const params = buildParams(query, pageSize, nextToken, options);
    const url = `https://api.x.com/2/tweets/search/recent?${params.toString()}`;
    const page = await fetchPage(url, bearerToken);

    requestUrls.push(url);
    posts.push(...((page.data ?? []).slice(0, remaining)));
    includesList.push(page.includes);
    pageMeta.push(page.meta ?? {});

    nextToken = page.meta?.next_token ?? '';
    if (!nextToken || !(page.data?.length)) break;
  }

  const rankedPosts = options.rank ? rankPosts(posts, options.rank) : posts;

  const body = {
    data: rankedPosts,
    includes: mergeIncludes(includesList),
    meta: {
      result_count: rankedPosts.length,
      pages_fetched: pageMeta.length,
      next_token: nextToken || undefined,
      ranked_by: options.rank || undefined,
    },
    request_urls: requestUrls,
    page_meta: pageMeta,
  };

  if (options.outFile) {
    const saved = await writeOutputFile(options.outFile, body);
    console.log(`Raw response saved to ${saved}`);
  }

  if (options.raw) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }

  printSummary(query, body);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
