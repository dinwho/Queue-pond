# Queue-pond

Queue-pond is a fault-tolerant, queue-driven product price tracker. A publisher sends price-check jobs to NATS JetStream, workers scrape the product page through Browserless, and a LangGraph state machine decides whether to alert, stop, or retry.

The project is intentionally built as a worker system rather than a cron script: price checks can be distributed across workers, retried safely, and extended with store-specific scraping rules or an optional vision fallback.

## Architecture

```text
Publisher ── price.check ──> NATS JetStream ──> Worker
                                                   │
                                                   ▼
                                            LangGraph workflow
                                                   │
                         ┌─────────────────────────┼─────────────────────────┐
                         ▼                         ▼                         ▼
                 DOM price found          Screenshot + vision          Retry / terminal
                 alert or stop             fallback when enabled        failure handling
                         │
                         ▼
                    ACK message
```

## What it does

- Publishes typed `PriceCheckTask` messages to the `price.check` subject.
- Creates and uses a durable JetStream consumer named `price-checker-worker`.
- Starts safely whether the worker or publisher comes up first.
- Scrapes a product page using a remote Chromium instance from Browserless.
- Extracts prices in a deliberate order: JSON-LD product offers, product price meta tags, then visible price-oriented HTML selectors.
- Uses a LangGraph state machine to route checks through DOM extraction, optional screenshot/vision extraction, alerting, stopping, or retrying.
- Caps retries with JetStream `max_deliver` and terminates messages that exhaust the limit.
- Rejects malformed URLs as terminal failures instead of retrying them forever.

## Project structure

```text
src/
├── index.ts       # Shared PriceCheckTask type
├── publisher.ts   # Creates/publishes JetStream jobs
├── worker.ts      # Durable consumer, ACK/NAK/TERM handling
├── graph.ts       # LangGraph price-check workflow
├── processor.ts   # Browserless + Playwright DOM extraction
└── vision.ts      # Optional OpenAI screenshot fallback
```

## Prerequisites

- Node.js 20+
- Docker and Docker Compose
- An internet connection for product pages
- Optional: an OpenAI API key for screenshot-based price extraction

## Run locally

Install dependencies:

```bash
npm install
```

Start NATS, Browserless, and the worker:

```bash
docker compose up --build
```

In another terminal, publish the sample task:

```bash
npm run publish
```

The publisher connects to `localhost:4222`; the Docker worker connects to the internal `nats:4222` service.

To run several workers:

```bash
docker compose up --build --scale worker=3
```

Compile-check the project:

```bash
npm run build
```

## Task format

```ts
interface PriceCheckTask {
  taskId: string;
  productUrl: string;
  targetPrice: number;
  userEmail: string;
  createdAt: string;
}
```

`productUrl` must be a plain, absolute `http` or `https` URL. Do not pass Markdown such as `[product](https://example.com/product)`.

## Workflow and outcomes

`graph.ts` manages state for one delivery of a price-check job.

| Outcome | Worker action |
| --- | --- |
| Current price is at or below target | Log alert and ACK |
| Current price is above target | Stop this check and ACK |
| Invalid URL or disabled vision fallback | Stop and ACK |
| Browser/page/API failure | NAK for retry |
| Retries exhausted | `TERM` the message; no more redeliveries |

The number of total deliveries includes the original delivery. With `MAX_DELIVERIES=3`, a task gets one initial attempt and at most two retries.

## Configuration

The worker uses these environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NATS_URL` | `localhost:4222` | NATS server address |
| `BROWSERLESS_URL` | `ws://localhost:3000?token=secrettoken123` | Chromium CDP endpoint |
| `MAX_DELIVERIES` | `3` | Maximum total JetStream deliveries per job |
| `OPENAI_API_KEY` | unset | Enables screenshot/vision fallback |
| `OPENAI_VISION_MODEL` | `gpt-5.6-luna` | Model used by the optional vision fallback |

For Docker, the Compose file sets the internal NATS and Browserless service addresses plus `MAX_DELIVERIES=3`.

## Optional vision fallback

If a page loads but DOM extraction cannot find a supported price field, the worker captures an in-memory screenshot and sends it to `vision.ts` only when `OPENAI_API_KEY` is configured.

The model is asked for JSON containing a price, currency, and confidence. Results below `0.9` confidence are rejected. Screenshots are not logged or saved by the application.

```bash
export OPENAI_API_KEY="your_api_key"
export OPENAI_VISION_MODEL="gpt-5.6-luna" # optional
docker compose up --build
```

Without an API key, vision is disabled and a DOM miss is treated as a terminal job outcome rather than an infinite retry loop.

## Store-specific selectors

Generic selectors are useful as a fallback, but production scrapers should use store-specific rules. For example, Amazon pages may contain both the current sale price and a struck-through MRP. The current purchasable price should be preferred, while `.a-text-price` (usually the crossed-out MRP) should be excluded.

Typical Amazon current-price selectors include:

```ts
"#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen"
"#corePrice_feature_div .priceToPay .a-offscreen"
".a-price:not(.a-text-price) .a-offscreen"
```

Always inspect the page’s actual HTML and add rules before generic selectors. Store markup changes often, so scraper rules need maintenance.

## Current limitations and next steps

- Alerts are logged; email delivery is not implemented yet.
- A completed “above target” task is ACKed. A future scheduler can publish the next check based on distance from target and price movement.
- Browserless failure cannot produce a screenshot. A fully independent fallback would require another browser/capture provider.
- Product sites may block automation or change markup. Add per-store extractors and observability before relying on the tracker in production.
- Replace the development Browserless token with a secret-managed value before deployment.

## Useful commands

```bash
npm run worker   # Run the worker on the host
npm run publish  # Publish the sample task
npm run build    # TypeScript build
```
