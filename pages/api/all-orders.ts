import type { NextApiRequest, NextApiResponse } from 'next'

const xtApi = require('xt-open-api')

interface Order {
  orderId?: string
  symbol?: string
  side?: string
  price?: string | number
  quantity?: string | number
  origQty?: string | number
  executedQty?: string | number
}

interface PairLiquidity {
  symbol: string
  buyLiquidity: number
  sellLiquidity: number
  buyCount: number
  sellCount: number
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PairLiquidity[] | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Fetch all open orders
    const response = await xtApi.spot.getOpenOrders({
      bizType: 'SPOT'
    })
    
    // Handle different response formats
    let orders: Order[] = []
    if (response && response.result) {
      orders = response.result.list || (Array.isArray(response.result) ? response.result : [])
    } else if (Array.isArray(response)) {
      orders = response
    } else if (response && response.list) {
      orders = response.list
    }
    
    // Group orders by symbol and calculate liquidity
    const pairMap = new Map<string, PairLiquidity>()
    
    for (const order of orders) {
      if (!order.symbol) continue
      
      const symbol = order.symbol.toUpperCase()
      const quantity = parseFloat(String(order.quantity || order.origQty || 0))
      const price = parseFloat(String(order.price || 0))
      const executedQty = parseFloat(String(order.executedQty || 0))
      const remainingQty = quantity - executedQty
      
      if (!pairMap.has(symbol)) {
        pairMap.set(symbol, {
          symbol,
          buyLiquidity: 0,
          sellLiquidity: 0,
          buyCount: 0,
          sellCount: 0
        })
      }
      
      const pair = pairMap.get(symbol)!
      
      if (order.side?.toUpperCase() === 'BUY') {
        pair.buyCount++
        // For buy orders, quote currency is locked
        pair.buyLiquidity += remainingQty * price
      } else if (order.side?.toUpperCase() === 'SELL') {
        pair.sellCount++
        // For sell orders, base currency is locked
        pair.sellLiquidity += remainingQty
      }
    }
    
    // Convert to array and sort by symbol
    const result = Array.from(pairMap.values()).sort((a, b) => a.symbol.localeCompare(b.symbol))
    
    res.json(result)
  } catch (error) {
    console.error('Error in /api/all-orders:', error)
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    })
  }
}

