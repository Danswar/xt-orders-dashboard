import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import React from 'react'
import type { NextPage } from 'next'
import Link from 'next/link'

interface Pair {
  symbol: string
  display: string
}

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
  orderbook: OrderBookData
  aggregated: AggregatedOrderBook
}

const PAIRS: Pair[] = [
  { symbol: 'deuro_usdt', display: 'DEURO/USDT' },
  { symbol: 'deuro_btc', display: 'DEURO/BTC' },
  { symbol: 'deps_usdt', display: 'DEPS/USDT' },
  { symbol: 'deps_btc', display: 'DEPS/BTC' },
]

const fetchOrderBook = async (symbol: string): Promise<OrderBookResponse> => {
  const response = await fetch('/api/orderbook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol })
  })
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }
  
  const data = await response.json()
  if (!data.success || !data.orderbook || !data.aggregated) {
    throw new Error(data.error || 'Failed to fetch orderbook')
  }
  
  return {
    orderbook: data.orderbook,
    aggregated: data.aggregated
  }
}

const OrderBook: NextPage = () => {
  const [selectedPair, setSelectedPair] = useState<Pair>(PAIRS[0])

  const { data: orderbookData, isLoading, error, refetch } = useQuery<OrderBookResponse>({
    queryKey: ['orderbook', selectedPair.symbol],
    queryFn: () => fetchOrderBook(selectedPair.symbol),
    refetchInterval: 5000, // Refresh every 5 seconds
  })

  const formatNumber = (num: string | number, decimals: number = 8): string => {
    return parseFloat(String(num)).toFixed(decimals)
  }

  const formatPercent = (num: number, decimals: number = 4): string => {
    return `${parseFloat(String(num)).toFixed(decimals)}%`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-5">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8 bg-white rounded-xl p-6 shadow-lg">
          <h1 className="text-3xl font-bold text-gray-800">Order Book</h1>
          <div className="flex items-center gap-4">
            <Link 
              href="/"
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
            >
              Orders Dashboard
            </Link>
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
            <button 
              onClick={() => refetch()} 
              disabled={isLoading} 
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
            >
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </header>

        <div className="mb-6 bg-white rounded-xl p-6 shadow-lg">
          <div className="flex items-center gap-4">
            <label className="text-sm font-semibold text-gray-700">Trading Pair:</label>
            <select
              value={selectedPair.symbol}
              onChange={(e) => {
                const pair = PAIRS.find(p => p.symbol === e.target.value)
                if (pair) setSelectedPair(pair)
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {PAIRS.map(pair => (
                <option key={pair.symbol} value={pair.symbol}>
                  {pair.display}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-6">
            <p className="font-medium">Error: {error instanceof Error ? error.message : 'Failed to load orderbook'}</p>
          </div>
        )}

        {isLoading && !orderbookData && (
          <div className="bg-white rounded-xl p-8 shadow-lg text-center">
            <p className="text-gray-600">Loading orderbook...</p>
          </div>
        )}

        {orderbookData && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <h2 className="text-xl font-bold text-gray-800 mb-4">{selectedPair.display} Order Book Metrics</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="text-sm font-semibold text-gray-600 mb-1">Mid Price</div>
                  <div className="text-2xl font-bold text-blue-700">{formatNumber(orderbookData.aggregated.midPrice)}</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                  <div className="text-sm font-semibold text-gray-600 mb-1">Spread</div>
                  <div className="text-2xl font-bold text-orange-700">{formatPercent(orderbookData.aggregated.spread)}</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <div className="text-sm font-semibold text-gray-600 mb-1">Max Gap (Bids)</div>
                  <div className="text-2xl font-bold text-purple-700">{formatPercent(orderbookData.aggregated.maxGapPercent.bids)}</div>
                </div>
                <div className="bg-pink-50 rounded-lg p-4 border border-pink-200">
                  <div className="text-sm font-semibold text-gray-600 mb-1">Max Gap (Asks)</div>
                  <div className="text-2xl font-bold text-pink-700">{formatPercent(orderbookData.aggregated.maxGapPercent.asks)}</div>
                </div>
              </div>
            </div>

            {/* Detailed Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Bids Metrics */}
              <div className="bg-white rounded-xl p-6 shadow-lg">
                <h3 className="text-lg font-bold text-green-700 mb-4">Bids (Buy) Metrics</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                    <span className="text-sm font-semibold text-gray-700">Cumulative Qty (2% of mid-price):</span>
                    <span className="text-lg font-bold text-green-700">{formatNumber(orderbookData.aggregated.cumulativeQty2Percent.bids)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                    <span className="text-sm font-semibold text-gray-700">Cumulative Qty (Level 20):</span>
                    <span className="text-lg font-bold text-green-700">{formatNumber(orderbookData.aggregated.cumulativeQtyLevel20.bids)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                    <span className="text-sm font-semibold text-gray-700">Total Orders (All Levels):</span>
                    <span className="text-lg font-bold text-green-700">{orderbookData.aggregated.totalOrders.bids}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                    <span className="text-sm font-semibold text-gray-700">Max Gap % (up to L20):</span>
                    <span className="text-lg font-bold text-green-700">{formatPercent(orderbookData.aggregated.maxGapPercent.bids)}</span>
                  </div>
                </div>
              </div>

              {/* Asks Metrics */}
              <div className="bg-white rounded-xl p-6 shadow-lg">
                <h3 className="text-lg font-bold text-red-700 mb-4">Asks (Sell) Metrics</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg border border-red-200">
                    <span className="text-sm font-semibold text-gray-700">Cumulative Qty (2% of mid-price):</span>
                    <span className="text-lg font-bold text-red-700">{formatNumber(orderbookData.aggregated.cumulativeQty2Percent.asks)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg border border-red-200">
                    <span className="text-sm font-semibold text-gray-700">Cumulative Qty (Level 20):</span>
                    <span className="text-lg font-bold text-red-700">{formatNumber(orderbookData.aggregated.cumulativeQtyLevel20.asks)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg border border-red-200">
                    <span className="text-sm font-semibold text-gray-700">Total Orders (All Levels):</span>
                    <span className="text-lg font-bold text-red-700">{orderbookData.aggregated.totalOrders.asks}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg border border-red-200">
                    <span className="text-sm font-semibold text-gray-700">Max Gap % (up to L20):</span>
                    <span className="text-lg font-bold text-red-700">{formatPercent(orderbookData.aggregated.maxGapPercent.asks)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default OrderBook

