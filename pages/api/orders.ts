import type { NextApiRequest, NextApiResponse } from 'next'

const xtApi = require('xt-open-api')

interface OrdersResponse {
  [key: string]: any[]
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OrdersResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { symbols } = req.body
    
    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ error: 'Symbols array is required' })
    }

    const results: OrdersResponse = {}
    
    // Fetch orders for each symbol
    for (const symbol of symbols) {
      try {
        const response = await xtApi.spot.getOpenOrders({ 
          symbol: symbol.toLowerCase(),
          bizType: 'SPOT'
        })
        
        // Handle different response formats
        if (response && response.result) {
          results[symbol] = response.result.list || response.result || []
        } else if (Array.isArray(response)) {
          results[symbol] = response
        } else if (response && response.list) {
          results[symbol] = response.list
        } else {
          results[symbol] = []
        }
      } catch (error) {
        console.error(`Error fetching orders for ${symbol}:`, error)
        results[symbol] = []
      }
    }

    res.json(results)
  } catch (error) {
    console.error('Error in /api/orders:', error)
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    })
  }
}

