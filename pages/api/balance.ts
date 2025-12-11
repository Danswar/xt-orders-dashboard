import type { NextApiRequest, NextApiResponse } from 'next'

const xtApi = require('xt-open-api')

interface BalanceResponse {
  [currency: string]: {
    available: number
    frozen: number
    total: number
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<BalanceResponse | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const currencies = ['DEURO', 'DEPS', 'USDT', 'BTC']
    const balances: BalanceResponse = {}
    
    // Try batch first, then fallback to individual calls
    try {
      const response = await xtApi.spot.getCurrenciesBalance({
        currencies: currencies
      })
      
      // Handle response format: response.result.assets[]
      let balanceList: any[] = []
      if (response && response.result && response.result.assets) {
        balanceList = response.result.assets
      } else if (response && response.result) {
        balanceList = Array.isArray(response.result) ? response.result : [response.result]
      } else if (Array.isArray(response)) {
        balanceList = response
      } else if (response && response.list) {
        balanceList = response.list
      } else if (response && response.data) {
        balanceList = Array.isArray(response.data) ? response.data : [response.data]
      }
      
      // Process balances - currency is lowercase in response
      for (const currency of currencies) {
        const balance = balanceList.find((b: any) => 
          b.currency?.toUpperCase() === currency.toUpperCase() ||
          b.asset?.toUpperCase() === currency.toUpperCase() ||
          b.coin?.toUpperCase() === currency.toUpperCase()
        )
        
        if (balance) {
          balances[currency] = {
            available: parseFloat(balance.availableAmount || balance.available || balance.free || balance.avail || 0),
            frozen: parseFloat(balance.frozenAmount || balance.frozen || balance.locked || balance.freeze || 0),
            total: parseFloat(balance.totalAmount || balance.total || balance.balance || balance.amount || 0)
          }
        } else {
          balances[currency] = {
            available: 0,
            frozen: 0,
            total: 0
          }
        }
      }
    } catch (batchError) {
      console.error('Batch balance fetch failed, trying individual calls:', batchError)
      // Fallback to individual currency calls
      for (const currency of currencies) {
        try {
          const response = await xtApi.spot.getCurrencyBalance({ currency })
          console.log(`Balance for ${currency}:`, JSON.stringify(response, null, 2))
          
          let balance: any = null
          if (response && response.result) {
            balance = response.result
          } else if (response && response.data) {
            balance = response.data
          } else {
            balance = response
          }
          
          if (balance) {
            balances[currency] = {
              available: parseFloat(balance.availableAmount || balance.available || balance.free || balance.avail || 0),
              frozen: parseFloat(balance.frozenAmount || balance.frozen || balance.locked || balance.freeze || 0),
              total: parseFloat(balance.totalAmount || balance.total || balance.balance || balance.amount || 0)
            }
          } else {
            balances[currency] = {
              available: 0,
              frozen: 0,
              total: 0
            }
          }
        } catch (error) {
          console.error(`Error fetching balance for ${currency}:`, error)
          balances[currency] = {
            available: 0,
            frozen: 0,
            total: 0
          }
        }
      }
    }

    res.json(balances)
  } catch (error) {
    console.error('Error in /api/balance:', error)
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    })
  }
}

