import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import React from 'react'
import type { NextPage } from 'next'
import Link from 'next/link'

interface Pair {
  symbol: string
  display: string
}

interface Order {
  orderId?: string
  side?: string
  price?: string | number
  quantity?: string | number
  origQty?: string | number
  executedQty?: string | number
}

interface OrdersData {
  [key: string]: Order[]
}

interface BalanceData {
  [currency: string]: {
    available: number
    frozen: number
    total: number
  }
}

const PAIRS: Pair[] = [
  { symbol: 'deuro_usdt', display: 'DEURO/USDT' },
  { symbol: 'deuro_btc', display: 'DEURO/BTC' },
  { symbol: 'deps_usdt', display: 'DEPS/USDT' },
  { symbol: 'deps_btc', display: 'DEPS/BTC' },
]

const fetchOrders = async (): Promise<OrdersData> => {
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols: PAIRS.map(p => p.symbol) })
  })
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }
  
  return response.json()
}

const fetchBalances = async (): Promise<BalanceData> => {
  const response = await fetch('/api/balance')
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }
  
  return response.json()
}


const Home: NextPage = () => {
  const queryClient = useQueryClient()
  const [ordersToKeep, setOrdersToKeep] = useState(100)
  
  const { data: orders = {}, isLoading: loading, error, refetch } = useQuery<OrdersData>({
    queryKey: ['orders'],
    queryFn: fetchOrders,
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const { data: balances = {} } = useQuery<BalanceData>({
    queryKey: ['balances'],
    queryFn: fetchBalances,
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const cancelOrdersMutation = useMutation({
    mutationFn: async ({ symbol, orderIds }: { symbol: string; orderIds: string[] }) => {
      const response = await fetch('/api/cancel-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, orderIds })
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    }
  })

  const calculateLiquidity = (orderList: Order[]) => {
    if (!orderList || orderList.length === 0) {
      return { buy: { count: 0, liquidity: 0 }, sell: { count: 0, liquidity: 0 } }
    }
    
    return orderList.reduce((acc, order) => {
      const quantity = parseFloat(String(order.quantity || order.origQty || 0))
      const price = parseFloat(String(order.price || 0))
      const executedQty = parseFloat(String(order.executedQty || 0))
      const remainingQty = quantity - executedQty
      
      if (order.side?.toUpperCase() === 'BUY') {
        acc.buy.count++
        // For buy orders, quote currency is locked (liquidity in quote currency)
        acc.buy.liquidity += remainingQty * price
      } else if (order.side?.toUpperCase() === 'SELL') {
        acc.sell.count++
        // For sell orders, base currency is locked (liquidity in base currency)
        acc.sell.liquidity += remainingQty
      }
      
      return acc
    }, { buy: { count: 0, liquidity: 0 }, sell: { count: 0, liquidity: 0 } })
  }

  const cutTails = async (pair: Pair) => {
    const orderList = orders[pair.symbol] || []
    if (orderList.length === 0) return

    const allOrderIds: string[] = []

    // Process BUY orders
    const buyOrders = orderList.filter(o => o.side?.toUpperCase() === 'BUY')
    if (buyOrders.length > ordersToKeep) {
      // Sort BUY orders by price descending (highest first), keep first N, cancel the tail
      const sortedBuy = [...buyOrders].sort((a, b) => {
        const priceA = parseFloat(String(a.price || 0))
        const priceB = parseFloat(String(b.price || 0))
        return priceB - priceA
      })
      const tailBuy = sortedBuy.slice(ordersToKeep)
      const buyOrderIds = tailBuy.map(o => o.orderId).filter((id): id is string => !!id)
      allOrderIds.push(...buyOrderIds)
    }

    // Process SELL orders
    const sellOrders = orderList.filter(o => o.side?.toUpperCase() === 'SELL')
    if (sellOrders.length > ordersToKeep) {
      // Sort SELL orders by price ascending (lowest first), keep first N, cancel the tail
      const sortedSell = [...sellOrders].sort((a, b) => {
        const priceA = parseFloat(String(a.price || 0))
        const priceB = parseFloat(String(b.price || 0))
        return priceA - priceB
      })
      const tailSell = sortedSell.slice(ordersToKeep)
      const sellOrderIds = tailSell.map(o => o.orderId).filter((id): id is string => !!id)
      allOrderIds.push(...sellOrderIds)
    }

    if (allOrderIds.length > 0) {
      try {
        await cancelOrdersMutation.mutateAsync({ symbol: pair.symbol, orderIds: allOrderIds })
      } catch (error) {
        console.error('Error cutting tails:', error)
      }
    }
  }


  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-5">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8 bg-white rounded-xl p-6 shadow-lg">
          <h1 className="text-3xl font-bold text-gray-800">XT API Orders Dashboard</h1>
          <div className="flex items-center gap-4">
            <Link 
              href="/bot"
              className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
            >
              Trading Bot
            </Link>
            <Link 
              href="/histogram"
              className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
            >
              Order Age Histogram
            </Link>
            <Link 
              href="/orderbook"
              className="bg-cyan-600 hover:bg-cyan-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
            >
              Order Book
            </Link>
            <button 
              onClick={() => refetch()} 
              disabled={loading} 
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </header>

        <div className="mb-8 bg-white rounded-xl p-6 shadow-lg">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Account Balances</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['DEURO', 'DEPS', 'USDT', 'BTC'].map((currency) => {
              const balance = balances[currency] || { available: 0, frozen: 0, total: 0 }
              const utilization = balance.total > 0 ? (balance.frozen / balance.total) * 100 : 0
              return (
                <div key={currency} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="text-sm font-semibold text-gray-600 mb-2">{currency}</div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Available:</span>
                      <span className="font-semibold text-gray-800">{balance.available.toFixed(8)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Frozen:</span>
                      <span className="font-semibold text-gray-800">{balance.frozen.toFixed(8)}</span>
                    </div>
                    <div className="flex justify-between text-xs pt-1 border-t border-gray-200">
                      <span className="text-gray-600 font-medium">Total:</span>
                      <span className="font-bold text-gray-900">{balance.total.toFixed(8)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs pt-1 border-t border-gray-200">
                      <span className="text-gray-500">Utilization:</span>
                      <span className={`font-semibold ${
                        utilization >= 80 ? 'text-red-600' : 
                        utilization >= 50 ? 'text-orange-600' : 
                        'text-green-600'
                      }`}>
                        {utilization.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-6">
            <p className="font-medium">Error: {error instanceof Error ? error.message : 'Failed to load orders'}</p>
            <p className="text-sm mt-2 opacity-80">Make sure you have a .config.json file with accessKey and secretKey</p>
          </div>
        )}

        <div className="bg-white rounded-xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800">
              Trading Pairs Overview
            </h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 whitespace-nowrap">Keep per side:</label>
              <input
                type="number"
                min="0"
                value={ordersToKeep}
                onChange={(e) => setOrdersToKeep(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-20 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="space-y-2">
            {PAIRS.map((pair) => {
              const orderList = orders[pair.symbol] || []
              const liquidity = calculateLiquidity(orderList)
              const [base, quote] = pair.display.split('/')
              const quoteBalance = balances[quote]?.total || 0
              const baseBalance = balances[base]?.total || 0
              const buyPercentage = quoteBalance > 0 ? (liquidity.buy.liquidity / quoteBalance) * 100 : 0
              const sellPercentage = baseBalance > 0 ? (liquidity.sell.liquidity / baseBalance) * 100 : 0
              
              const buyOrders = orderList.filter(o => o.side?.toUpperCase() === 'BUY')
              const sellOrders = orderList.filter(o => o.side?.toUpperCase() === 'SELL')
              const hasTailToCut = buyOrders.length > ordersToKeep || sellOrders.length > ordersToKeep

              return (
                <div key={pair.symbol} className="bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-shrink-0 w-32">
                      <h3 className="text-sm font-bold text-gray-800">
                        {pair.display}
                        <span className="ml-1.5 text-xs font-normal text-gray-500">({orderList.length})</span>
                      </h3>
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div className="bg-green-50 rounded p-2 border border-green-200">
                        <div className="text-xs text-gray-600 mb-0.5">BUY</div>
                        <div className="text-sm font-bold text-green-700 mb-0.5">{liquidity.buy.count}</div>
                        <div className="text-xs font-semibold text-gray-800">
                          {liquidity.buy.liquidity.toFixed(8)} {quote}
                          {buyPercentage > 0 && (
                            <span className="ml-1 text-xs text-gray-500">({buyPercentage.toFixed(1)}%)</span>
                          )}
                        </div>
                      </div>
                      <div className="bg-red-50 rounded p-2 border border-red-200">
                        <div className="text-xs text-gray-600 mb-0.5">SELL</div>
                        <div className="text-sm font-bold text-red-700 mb-0.5">{liquidity.sell.count}</div>
                        <div className="text-xs font-semibold text-gray-800">
                          {liquidity.sell.liquidity.toFixed(8)} {base}
                          {sellPercentage > 0 && (
                            <span className="ml-1 text-xs text-gray-500">({sellPercentage.toFixed(1)}%)</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <button
                        onClick={() => cutTails(pair)}
                        disabled={!hasTailToCut || cancelOrdersMutation.isPending}
                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition-colors whitespace-nowrap"
                      >
                        {cancelOrdersMutation.isPending ? 'Cutting...' : 'Cut Tails'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}


export default Home

