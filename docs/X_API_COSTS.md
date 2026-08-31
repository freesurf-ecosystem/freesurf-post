# X (Twitter) API Costs

Costs to pass through to users. These numbers came from a Google/LLM response —
**verify against X's official docs before billing on them.**

From bundle:

"X usage billing (prepaid credits)

X moved its API to pay-per-call billing in 2025. X usage is billed per use from a prepaid credit balance you top up in your dashboard. Each billable X action draws down your balance at the prices below.
Action	Cost
Post	$0.015
Post with a link	$0.20
Comment / reply	$0.015
Comment / reply with a link	$0.20
Delete	$0.01
Post analytics (per result)	$0.005
Comment import (per result)	$0.005
Post history import (per result)	$0.005

The composer estimates the charge before publishing, and your balance and usage are visible on your billing page. If your balance runs out, X posts fail with instructions to add funds while other platforms continue to publish normally."


## To verify against X's docs

- Confirm the per-request rates (especially $0.015 and $0.200) — these are the
  "usage-based" model and may have changed.
- Confirm whether the account tier (Free / Basic / Pro) still carries a monthly
  operation cap *on top of* the per-request pricing.
- Confirm whether "owned read" vs "third-party read" billing matches our
  metrics/replies code paths.
