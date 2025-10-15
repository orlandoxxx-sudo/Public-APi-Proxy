# Cost-Capped Public API Proxy

A production-ready MVP that fetches FX rates from a public source on a schedule, stores a compact history in DynamoDB, exposes a GraphQL API via AppSync with aggressive caching, and renders a Vue 3 dashboard. Guardrails enforce a daily external API budget to prevent runaway cost.


## Monorepo layout

- `infra/` – AWS CDK app that provisions DynamoDB, AppSync, EventBridge, Lambdas, CloudWatch, and SSM parameters.
- `services/`
  - `shared/` – Typed utilities (env/config, DynamoDB helper, HTTP client, cost guard, logging).
  - `ingest/` – EventBridge-triggered Lambda. Fetches FX rates, enforces budget, writes DynamoDB, emits metrics.
  - `api/` – AppSync Lambda resolver. Serves latest and historical FX data with an LRU cache.
- `web/` – Vue 3 + Vite SPA with Apollo Client, Pinia store, and Chart.js sparkline cards.
- `scripts/` – Developer utilities including DynamoDB seeding.

## Data flow

1. **EventBridge rule** triggers the ingest Lambda hourly.
2. **Cost guard** (`services/shared/src/costGuard.ts`) increments a DynamoDB counter (`PK=BUDGET#DAILY`) before external calls. If the daily budget (SSM `/fxproxy/DAILY_API_CALL_BUDGET`) is exhausted, the Lambda exits early or throws when `HARD_STOP_ON_BUDGET=true`.
3. **Ingest Lambda** fetches rates once per run, records the `FxProxy/ExternalCalls` CloudWatch metric, and upserts a single DynamoDB row per day (`PK=RATES#<BASE>`, `SK=DATE#YYYY-MM-DD`).
4. **AppSync** uses a single Lambda data source to resolve `getLatest` and `getHistory`, with AppSync response caching (300s) plus an in-process LRU cache keyed on operation + args.
5. **Vue dashboard** polls `getLatest` at most every 60s, caches data locally via Pinia for 5 minutes, and renders a sparkline of the last 30 days.

## Cost guard and hard stop

- Budget tracking lives in `services/shared/src/costGuard.ts`. The ingest Lambda calls `incrementExternalCallAndCheckBudget` before issuing HTTP requests. 
- When the stored counter meets or exceeds `/fxproxy/DAILY_API_CALL_BUDGET`, the Lambda logs `BUDGET_HIT` and returns. If the env/SSM flag `HARD_STOP_ON_BUDGET` is true, the Lambda throws to surface the breach to CloudWatch alarms.
- The CDK stack provisions a `FxProxy/ExternalCalls` metric and a 24-hour alarm that pushes to SNS (`BudgetAlarmTopic`).

## Caching strategy

- AppSync full-request caching (300 seconds) reduces Lambda invocations when parameters repeat.
- The resolver Lambda holds an LRU cache keyed on query args using the same TTL to guard DynamoDB when AppSync cache is cold.
- The Vue client caches responses in Pinia for five minutes, ensuring the UI never hammers the API.

## Deploy

```bash
pnpm install
pnpm cdk:synth   # optional dry run
pnpm deploy      # deploys CDK stack (requires AWS credentials)
```

Set `FX_PROXY_ALARM_EMAIL` in your shell before `pnpm deploy` to subscribe an email endpoint to budget alerts.

CDK outputs include the AppSync endpoint and API key. Populate the web app with:

```bash
cp web/.env.example web/.env.local
# edit .env.local with GraphQL URL + API key from CDK outputs
pnpm dev:web
```

To seed local DynamoDB (when using AWS-managed or LocalStack), run:

```bash
TABLE_NAME=FxRates AWS_REGION=us-east-1 pnpm ts-node scripts/seed.ts
```

## Tests

```bash
pnpm test        # runs vitest suites across all packages
pnpm lint        # eslint across workspaces
pnpm -r build    # type-checks and bundles services + web + infra
```

## Tuning knobs

| Parameter | Description | Default |
|-----------|-------------|---------|
| `/fxproxy/DAILY_API_CALL_BUDGET` | Max external calls per day before guard stops ingest | `200` |
| `/fxproxy/CACHE_TTL_SECONDS` | Shared TTL for resolver cache + AppSync cache | `300` |
| `/fxproxy/SYMBOLS` | CSV of quote currencies | `USD,EUR,GBP,NGN,GHS` |
| EventBridge schedule | Adjust `events.Schedule.cron` in `infra/src/fx-proxy-stack.ts` to change cadence | Hourly |

## Monthly cost estimate (10k requests)

- **AppSync (API key auth)**: ~\$4/month for 10k requests assuming caching hit rate >50%.
- **Lambda**: <\$1/month given sub-second executions.
- **DynamoDB on-demand**: ~\$2/month for light write/read volume.
- **CloudWatch metrics & logs**: \$1-2/month.
- **EventBridge**: negligible at hourly schedule.

Total: ≈ **\$8–9/month**, plus egress if applicable.

## Security notes

- API key auth is for demo purposes only. Use Cognito, IAM, or Lambda authorizers in production.
- DynamoDB table enforces server-side encryption and point-in-time recovery.
- Correlation IDs from the `x-corr-id` header flow through AppSync into Lambda logs for traceability.
- Set `HARD_STOP_ON_BUDGET=true` (env or SSM) for an immediate ingest failure when the budget is exceeded.

## Cleanup

```bash
pnpm deploy -- --method destroy
```

> Note: CDK retains the DynamoDB table by default. Update `RemovalPolicy` in `infra/src/fx-proxy-stack.ts` if you prefer automatic deletion.
