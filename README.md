# Queue-pond

A queue-based product price tracker built with NATS JetStream, Browserless, Playwright, and LangGraph.

## Run it

Install dependencies:

```bash
npm install
```

Start NATS, Browserless, and the worker:

```bash
docker compose up --build
```

In another terminal, publish the sample price-check task:

```bash
npm run publish
```

To run multiple workers:

```bash
docker compose up --build --scale worker=3
```

## Commands

```bash
npm run worker   # Run the worker on your host machine
npm run publish  # Publish the sample task
npm run build    # Check TypeScript compilation
```

## Configuration

| Variable | Default |
| --- | --- |
| `NATS_URL` | `localhost:4222` |
| `BROWSERLESS_URL` | `ws://localhost:3000?token=secrettoken123` |
| `MAX_DELIVERIES` | `3` |



- A task is retried up to `MAX_DELIVERIES` times for temporary failures.
