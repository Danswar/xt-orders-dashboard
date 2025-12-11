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
  createTime?: number
  time?: number
  updateTime?: number
  [key: string]: any
}

interface AgeBucket {
  min: number
  max: number
  count: number
  label: string
}

interface PairAgeData {
  symbol: string
  buckets: AgeBucket[]
  totalOrders: number
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PairAgeData[] | { error: string }>
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
    
    const now = Date.now()
    const pairMap = new Map<string, number[]>()
    
    // Group orders by symbol and calculate ages
    for (const order of orders) {
      if (!order.symbol) continue
      
      const symbol = order.symbol.toUpperCase()
      
      // Try different timestamp field names
      const timestamp = order.createTime || order.time || order.updateTime
      if (!timestamp) continue
      
      // Calculate age in seconds
      const timestampMs = typeof timestamp === 'string' ? parseInt(timestamp) : timestamp
      // Handle both millisecond and second timestamps
      const orderTime = timestampMs < 1e12 ? timestampMs * 1000 : timestampMs
      const ageSeconds = Math.max(0, (now - orderTime) / 1000)
      
      if (!pairMap.has(symbol)) {
        pairMap.set(symbol, [])
      }
      
      pairMap.get(symbol)!.push(ageSeconds)
    }
    
    // Define age buckets (in seconds)
    const bucketRanges = [
      { min: 0, max: 60, label: '0-1m' },
      { min: 60, max: 300, label: '1-5m' },
      { min: 300, max: 900, label: '5-15m' },
      { min: 900, max: 3600, label: '15m-1h' },
      { min: 3600, max: 7200, label: '1-2h' },
      { min: 7200, max: 14400, label: '2-4h' },
      { min: 14400, max: 86400, label: '4-24h' },
      { min: 86400, max: Infinity, label: '24h+' }
    ]
    
    // Create histogram data for each pair
    const result: PairAgeData[] = []
    
    for (const [symbol, ages] of pairMap.entries()) {
      const buckets: AgeBucket[] = bucketRanges.map(range => ({
        min: range.min,
        max: range.max,
        label: range.label,
        count: 0
      }))
      
      // Count orders in each bucket
      for (const age of ages) {
        for (const bucket of buckets) {
          if (age >= bucket.min && age < bucket.max) {
            bucket.count++
            break
          }
        }
      }
      
      result.push({
        symbol,
        buckets,
        totalOrders: ages.length
      })
    }
    
    // Sort by symbol
    result.sort((a, b) => a.symbol.localeCompare(b.symbol))
    
    res.json(result)
  } catch (error) {
    console.error('Error in /api/order-ages:', error)
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    })
  }
}

