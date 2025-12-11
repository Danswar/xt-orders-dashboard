# XT API Orders Dashboard

A Next.js app to view open orders and locked liquidity for specific trading pairs on XT exchange.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.config.json` file in the root directory with your XT API credentials:
```json
{
  "accessKey": "your-access-key",
  "secretKey": "your-secret-key"
}
```

3. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Features

- View open orders for DEURO/USDT, DEURO/BTC, DEPS/USDT, DEPS/BTC
- See the number of open orders per pair
- Calculate and display locked liquidity (base and quote currency)
- Auto-refresh every 30 seconds
- Manual refresh button

