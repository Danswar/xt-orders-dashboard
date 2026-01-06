import type { NextApiRequest, NextApiResponse } from 'next'

const xtApi = require('xt-open-api')

interface TickerPriceResponse {
  success: boolean
  price?: number
  symbol?: string
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TickerPriceResponse>
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

    const response = await xtApi.spot.getSymbolTickerPrice({ 
      symbol: symbol.toLowerCase()
    })

    // Handle different response formats
    let price = null
    if (response && response.result && response.result.length > 0) {
      price = parseFloat(response.result[0].p || response.result[0].price || 0)
    } else if (response && response.p) {
      price = parseFloat(response.p)
    } else if (response && response.price) {
      price = parseFloat(response.price)
    }

    if (price) {
      return res.json({ 
        success: true, 
        price,
        symbol 
      })
    } else {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to get ticker price'
      })
    }
  } catch (error) {
    console.error('Error in /api/ticker-price:', error)
    return res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    })
  }
}

