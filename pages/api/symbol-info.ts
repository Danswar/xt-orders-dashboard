import type { NextApiRequest, NextApiResponse } from 'next'

const xtApi = require('xt-open-api')

interface SymbolInfoResponse {
  success: boolean
  info?: any
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SymbolInfoResponse>
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

    const response = await xtApi.spot.getSymbolTradeInfo({ 
      symbol: symbol.toLowerCase()
    })

    if (response && response.result) {
      return res.json({ 
        success: true, 
        info: response.result
      })
    } else {
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to get symbol info'
      })
    }
  } catch (error) {
    console.error('Error in /api/symbol-info:', error)
    return res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    })
  }
}

