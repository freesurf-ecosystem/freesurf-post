# X (Twitter) API Costs

Costs to pass through to users. These numbers came from a Google/LLM response —
**verify against X's official docs before billing on them.**

Official pricing: https://developer.x.com/en/portal/products

## Posting costs (write operations)

Charged per request when creating content.

| Operation | Cost |
|---|---|
| Plain text or media post | $0.015 / request |
| Post containing a URL (link) | $0.200 / request ⚠️ heavy surcharge for link automation |
| Summoned reply | $0.010 / request |
| Post deletion | $0.010 / request |

## Reading costs (read operations)

Charged **per resource returned** — one call fetching 100 posts multiplies the
base cost by 100.

| Operation | Cost |
|---|---|
| Third-party post read | $0.005 / post resource |
| Owned read (own posts, bookmarks, followers, likes) | $0.001 / resource |
| User profile read | $0.010 / user resource |

## Pass-through to users

We already track this in `post_credit_balance` + `post_credit_transactions`
(see `supabase/setup.sql`). Mapping:

## To verify against X's docs

- Confirm the per-request rates (especially $0.015 and $0.200) — these are the
  "usage-based" model and may have changed.
- Confirm whether the account tier (Free / Basic / Pro) still carries a monthly
  operation cap *on top of* the per-request pricing.
- Confirm whether "owned read" vs "third-party read" billing matches our
  metrics/replies code paths.
