# personal-bitbank

Personal, local dashboard for your [bitbank](https://bitbank.cc/) spot holdings: **quantity** and **weighted average cost in JPY**.

Average cost is not returned by the assets API. This app rebuilds it from spot trade history:

- Buys raise quantity and JPY cost (quote fees included).
- Sells reduce quantity at the current average (the average does not change).
- BTC-quoted pairs transfer JPY cost from the spent coin to the received one.
- Margin fills are skipped (planned for later).

## Setup

1. Create a **read-only** API key in bitbank (no order or withdraw permission).
2. Copy env and fill in the key:

```bash
cp .env.example .env.local
```

```bash
BITBANK_API_KEY=...
BITBANK_API_SECRET=...
```

3. Install and run locally:

```bash
npm install
npm run dev
```

Or with Docker (keys and `.data/` stay on this machine):

```bash
npm run up
```

Stop with `npm run down`. The image is built on first `up` if it does not exist yet.

Open [http://localhost:3000](http://localhost:3000). Keys never leave this machine; they are read only on the server.

## Long history

Trade history is paged (1000 per request) and cached in `.data/trades.json` (gitignored). Later refreshes only fetch fills newer than the cache.

If you have been trading for years and quantities do not match, import bitbank’s **約定履歴** CSV:

bitbank → profile menu → **データ** → **約定履歴** → extract / download.

## Scripts

```bash
npm run dev
npm test
npm run build
npm run up
npm run down
```
