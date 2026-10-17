# Workers Free and Paid plans

The hard and master search is pure computation, so the Worker's CPU limit decides how far it can look. Set `WORKERS_PLAN` in `wrangler.jsonc` to the plan of the account you deploy to:

```jsonc
"vars": {
  "WORKERS_PLAN": "free"   // or "paid"
}
```

Any value other than `"paid"`, including a missing variable, counts as `"free"`. A Worker that searches too long fails the move with Cloudflare error 1102 (*Worker exceeded resource limits*), so the switch defaults to the plan that cannot fail.

## What changes

Only the node budgets for hard and master change. Easy and medium are the same on both plans, and so are the rules, shortlist, band, and model calls.

| Plan | CPU per request | Hard/master search | Runoff search | Typical depth |
|------|-----------------|--------------------|---------------|---------------|
| `free` | 10 ms | 3 000 nodes | 1 500 nodes | 2–4 plies |
| `paid` | 30 s (default) | 220 000 nodes | 160 000 nodes | 6–10 plies |

The budgets are in `PLAN_BUDGETS` in [`src/lib/jev/move.js`](../src/lib/jev/move.js). A node costs about 1.7 µs, so the paid search takes roughly 300–450 ms per move. The free budgets leave room for request parsing and rendering within 10 ms.

Waiting for Clef or Jev is I/O and does not count as CPU time, so model calls are unaffected by the plan.

The browser's offline fallback (`FALLBACK_LIMITS` in `src/scripts/main.js`) runs on the visitor's device and is the same on both plans.

## Switching

1. Set `WORKERS_PLAN` in `wrangler.jsonc`.
2. Deploy with `pnpm run deploy`.

To check a free-plan deployment, play a few hard moves. If any move returns 503 with error 1102, lower `PLAN_BUDGETS.free`.

## Deploying to another account

`account_id` in `wrangler.jsonc` picks the account. Each account has its own plan, so update `WORKERS_PLAN` too when you change it. Jev is billed through AI Gateway credits, so an account without credits gets `2021: Insufficient AI Gateway credits` and falls back to the search on every Jev move. In that case add credits or set `AI_JEV_ENABLED` to `"false"`.
