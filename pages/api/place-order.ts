import type { NextApiRequest, NextApiResponse } from 'next'

const xtApi = require('xt-open-api')

interface PlaceOrderRequest {
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  quoteQty?: number // For market orders, can specify quote quantity instead
}

interface PlaceOrderResponse {
  success: boolean
  orderId?: string
  error?: string
  details?: any
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PlaceOrderResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  try {
    const { symbol, side, quantity, quoteQty }: PlaceOrderRequest = req.body
    
    if (!symbol || !side || (!quantity && !quoteQty)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters: symbol, side, and either quantity or quoteQty' 
      })
    }

    // Validate side
    if (side !== 'BUY' && side !== 'SELL') {
      return res.status(400).json({ 
        success: false, 
        error: 'Side must be either BUY or SELL' 
      })
    }

    // Place market order using XT API
    // IMPORTANT: Per XT API docs:
    // - BUY orders: quantity must be null, quoteQty required
    // - SELL orders: quoteQty must be null, quantity required
    const orderParams: any = {
      symbol: symbol.toLowerCase(),
      side: side,
      type: 'MARKET',
      timeInForce: 'IOC', // Immediate or Cancel - standard for market orders
      bizType: 'SPOT',
    }

    if (side === 'BUY') {
      // BUY: use quoteQty only, do NOT send quantity
      if (quoteQty) {
        orderParams.quoteQty = quoteQty.toString()
      } else if (quantity) {
        orderParams.quoteQty = quantity.toString()
      }
      // Explicitly set quantity to null for BUY orders
      orderParams.quantity = null
    } else { // SELL
      // SELL: use quantity only, do NOT send quoteQty
      if (quantity) {
        orderParams.quantity = quantity.toString()
      } else if (quoteQty) {
        orderParams.quantity = quoteQty.toString()
      }
      // Explicitly set quoteQty to null for SELL orders
      orderParams.quoteQty = null
    }

    const response = await xtApi.spot.createOrder(orderParams)

    if (response && response.result && response.result.orderId) {
      return res.json({ 
        success: true, 
        orderId: response.result.orderId,
        details: response.result
      })
    } else if (response && response.orderId) {
      return res.json({ 
        success: true, 
        orderId: response.orderId,
        details: response
      })
    } else {
      // Try to provide more helpful error message
      let errorMessage = 'Failed to create order'
      if (response && response.mc === 'ORDER_008') {
        errorMessage = 'Order precision error: The quantity may have too many decimal places or be below minimum. Try adjusting the amount.'
      } else if (response && response.mc) {
        errorMessage = `Order failed: ${response.mc}`
      }
      
      return res.status(500).json({ 
        success: false, 
        error: errorMessage,
        details: response
      })
    }
  } catch (error) {
    console.error('Error in /api/place-order:', error)
    return res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      details: error
    })
  }
}

