import type { NextApiRequest, NextApiResponse } from 'next'

const xtApi = require('xt-open-api')

interface CancelResponse {
  success: boolean
  cancelled: number
  errors?: string[]
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CancelResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { symbol, orderIds } = req.body
    
    if (!symbol || !orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'Symbol and orderIds array are required' })
    }

    // Use batch cancel endpoint
    try {
      const response = await xtApi.spot.cancelOrderBatch({
        orderIds: orderIds
      })
      
      // Handle different response formats
      let cancelled = 0
      if (response && response.result) {
        cancelled = Array.isArray(response.result) ? response.result.length : orderIds.length
      } else if (response && response.code === 0) {
        cancelled = orderIds.length
      } else if (response && Array.isArray(response)) {
        cancelled = response.length
      } else {
        cancelled = orderIds.length
      }

      res.json({
        success: true,
        cancelled
      })
    } catch (error) {
      console.error('Error in batch cancel:', error)
      // Fallback: try individual cancels if batch fails
      const cancelPromises = orderIds.map(async (orderId) => {
        try {
          const response = await xtApi.spot.cancelOrder({
            orderId: orderId
          })
          if (response && (response.result || response.code === 0 || response.success)) {
            return { success: true, orderId }
          }
          return { success: false, orderId }
        } catch (err) {
          console.error(`Error cancelling order ${orderId}:`, err)
          return { success: false, orderId }
        }
      })

      const results = await Promise.all(cancelPromises)
      const cancelled = results.filter(r => r.success).length

      res.json({
        success: cancelled > 0,
        cancelled
      })
    }
  } catch (error) {
    console.error('Error in /api/cancel-orders:', error)
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    })
  }
}

