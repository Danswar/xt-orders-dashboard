import type { NextApiRequest, NextApiResponse } from 'next'

const xtApi = require('xt-open-api')

interface OrderBookData {
  bids: Array<[string, string]>
  asks: Array<[string, string]>
}

interface AggregatedOrderBook {
  midPrice: number
  spread: number
  cumulativeQty2Percent: {
    bids: number
    asks: number
  }
  maxGapPercent: {
    bids: number
    asks: number
  }
  cumulativeQtyLevel20: {
    bids: number
    asks: number
  }
  totalOrders: {
    bids: number
    asks: number
  }
}

interface OrderBookResponse {
  success: boolean
  orderbook?: {
    bids: Array<[string, string]>
    asks: Array<[string, string]>
  }
  aggregated?: AggregatedOrderBook
  error?: string
  raw?: any
}

function aggregateOrderBook(orderbook: OrderBookData): AggregatedOrderBook {
  if (!orderbook.bids.length || !orderbook.asks.length) {
    throw new Error('Empty orderbook')
  }

  // Parse prices and quantities
  const bidPrices = orderbook.bids.map(([price]) => parseFloat(price))
  const bidQuantities = orderbook.bids.map(([, qty]) => parseFloat(qty))
  const askPrices = orderbook.asks.map(([price]) => parseFloat(price))
  const askQuantities = orderbook.asks.map(([, qty]) => parseFloat(qty))

  // Best bid (highest) and best ask (lowest)
  const bestBid = bidPrices[0]
  const bestAsk = askPrices[0]

  // 1. Mid-price: (Sell 1 + Buy 1) / 2
  const midPrice = (bestAsk + bestBid) / 2

  // 2. Spread: (Sell 1 - Buy 1) / Mid-Price × 100%
  const spread = ((bestAsk - bestBid) / midPrice) * 100

  // 3. Cumulative qty up to 2% of mid-price on each side
  const twoPercentThreshold = midPrice * 0.02
  const bidPriceThreshold = midPrice - twoPercentThreshold // bids must be >= this
  const askPriceThreshold = midPrice + twoPercentThreshold // asks must be <= this

  let cumulativeQtyBids2Percent = 0
  for (let i = 0; i < bidPrices.length; i++) {
    if (bidPrices[i] >= bidPriceThreshold) {
      cumulativeQtyBids2Percent += bidQuantities[i]
    } else {
      break
    }
  }

  let cumulativeQtyAsks2Percent = 0
  for (let i = 0; i < askPrices.length; i++) {
    if (askPrices[i] <= askPriceThreshold) {
      cumulativeQtyAsks2Percent += askQuantities[i]
    } else {
      break
    }
  }

  // 4. Max gap % per side up to level 20
  let maxGapBids = 0
  const bidsToCheck = Math.min(20, bidPrices.length - 1)
  for (let i = 0; i < bidsToCheck; i++) {
    if (bidPrices[i] > 0) {
      const gap = (bidPrices[i] - bidPrices[i + 1]) / bidPrices[i]
      maxGapBids = Math.max(maxGapBids, gap)
    }
  }

  let maxGapAsks = 0
  const asksToCheck = Math.min(20, askPrices.length - 1)
  for (let i = 0; i < asksToCheck; i++) {
    if (askPrices[i] > 0) {
      const gap = (askPrices[i + 1] - askPrices[i]) / askPrices[i]
      maxGapAsks = Math.max(maxGapAsks, gap)
    }
  }

  // 5. Cumulative qty up to level 20 on each side
  const cumulativeQtyBids20 = bidQuantities.slice(0, 20).reduce((sum, qty) => sum + qty, 0)
  const cumulativeQtyAsks20 = askQuantities.slice(0, 20).reduce((sum, qty) => sum + qty, 0)

  // 6. Total number of orders ingested per side
  const totalOrdersBids = orderbook.bids.length
  const totalOrdersAsks = orderbook.asks.length

  return {
    midPrice,
    spread,
    cumulativeQty2Percent: {
      bids: cumulativeQtyBids2Percent,
      asks: cumulativeQtyAsks2Percent,
    },
    maxGapPercent: {
      bids: maxGapBids * 100, // Convert to percentage
      asks: maxGapAsks * 100, // Convert to percentage
    },
    cumulativeQtyLevel20: {
      bids: cumulativeQtyBids20,
      asks: cumulativeQtyAsks20,
    },
    totalOrders: {
      bids: totalOrdersBids,
      asks: totalOrdersAsks,
    },
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OrderBookResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  try {
    const { symbol } = req.body
    
    if (!symbol) {
      return res.status(400).json({ 
        success: false, 
        error: 'Symbol is required' 
      })
    }

    const response = await xtApi.spot.getSymbolDepthInfo({ 
      symbol: symbol.toLowerCase()
    })

    if (!response || !response.result || !response.result.bids || !response.result.asks) {
      return res.status(500).json({ 
        success: false,
        error: 'Invalid orderbook response format'
      })
    }

    const bids = response.result.bids
    const asks = response.result.asks

    const orderbookData: OrderBookData = { bids, asks }
    const aggregated = aggregateOrderBook(orderbookData)

    return res.json({ 
      success: true, 
      orderbook: {
        bids,
        asks
      },
      aggregated,
      raw: response.result
    })
  } catch (error) {
    console.error('Error in /api/orderbook:', error)
    return res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    })
  }
}

