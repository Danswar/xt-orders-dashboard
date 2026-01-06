import { useState, useEffect, useRef } from 'react'
import type { NextPage } from 'next'
import Link from 'next/link'

interface Pair {
  symbol: string
  display: string
}

const PAIRS: Pair[] = [
  { symbol: 'deuro_usdt', display: 'DEURO/USDT' },
  { symbol: 'deuro_btc', display: 'DEURO/BTC' },
  { symbol: 'deps_usdt', display: 'DEPS/USDT' },
  { symbol: 'deps_btc', display: 'DEPS/BTC' },
]

interface OrderLog {
  timestamp: string
  side: 'BUY' | 'SELL'
  quantity: number
  status: 'success' | 'error'
  message?: string
  orderId?: string
}

const Bot: NextPage = () => {
  const [selectedPair, setSelectedPair] = useState<Pair>(
    PAIRS.find(p => p.symbol === 'deps_btc') || PAIRS[0]
  )
  const [intervalSeconds, setIntervalSeconds] = useState<number>(25)
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [startingSide, setStartingSide] = useState<'BUY' | 'SELL'>('SELL') // Initial side selection
  const [orderLogs, setOrderLogs] = useState<OrderLog[]>([])
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [buyAmount, setBuyAmount] = useState<number>(0.0000475440) // Amount in quote currency (BTC)
  const [sellAmount, setSellAmount] = useState<number>(10) // Amount in base currency (DEPS)
  const [cycleCount, setCycleCount] = useState<number>(0)
  const [countdown, setCountdown] = useState<number>(0)
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const isExecutingRef = useRef<boolean>(false) // Prevent concurrent executions
  const currentSideRef = useRef<'BUY' | 'SELL'>('SELL') // Track current side without causing re-renders

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
      }
    }
  }, [])

  // Fetch current price periodically when bot is running
  useEffect(() => {
    if (isRunning) {
      fetchCurrentPrice()
      const priceInterval = setInterval(() => fetchCurrentPrice(), 5000) // Update price every 5 seconds
      return () => clearInterval(priceInterval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, selectedPair.symbol])

  const fetchCurrentPrice = async () => {
    try {
      const response = await fetch('/api/ticker-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedPair.symbol })
      })
      const data = await response.json()
      if (data.success && data.price) {
        setCurrentPrice(data.price)
      }
    } catch (error) {
      console.error('Error fetching current price:', error)
    }
  }

  // Helper function to round to appropriate precision
  const roundToPrecision = (value: number, decimals: number): number => {
    const multiplier = Math.pow(10, decimals)
    return Math.floor(value * multiplier) / multiplier
  }

  const placeOrder = async (side: 'BUY' | 'SELL', buyQty: number, sellQty: number) => {
    try {
      const orderPayload: any = {
        symbol: selectedPair.symbol,
        side,
      }
      
      // Market orders work differently for BUY vs SELL:
      // BUY: use quoteQty (spend this much quote currency - BTC)
      // SELL: use quantity (sell this much base currency - DEPS)
      
      if (side === 'BUY') {
        const roundedQty = roundToPrecision(buyQty, 8)
        orderPayload.quoteQty = roundedQty
      } else {
        const roundedQty = roundToPrecision(sellQty, 8)
        orderPayload.quantity = roundedQty
      }
      
      const response = await fetch('/api/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      })
      
      const data = await response.json()
      
      const logEntry: OrderLog = {
        timestamp: new Date().toLocaleTimeString(),
        side,
        quantity: side === 'BUY' ? buyQty : sellQty,
        status: data.success ? 'success' : 'error',
        message: data.error || 'Market order placed successfully',
        orderId: data.orderId
      }
      
      setOrderLogs(prev => [logEntry, ...prev].slice(0, 50)) // Keep last 50 logs
      
      return data.success
    } catch (error) {
      const logEntry: OrderLog = {
        timestamp: new Date().toLocaleTimeString(),
        side,
        quantity: side === 'BUY' ? buyQty : sellQty,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
      setOrderLogs(prev => [logEntry, ...prev].slice(0, 50))
      return false
    }
  }

  const executeCycle = async (sideToUse?: 'BUY' | 'SELL') => {
    // Prevent concurrent executions
    if (isExecutingRef.current) {
      console.log('Skipping cycle - already executing')
      return false
    }
    
    isExecutingRef.current = true
    console.log('Executing cycle with side:', sideToUse || currentSideRef.current)
    
    try {
      // Use the provided side or fall back to currentSideRef
      const side = sideToUse || currentSideRef.current
      const success = await placeOrder(side, buyAmount, sellAmount)
      
      if (success) {
        // Alternate to the other side for next cycle
        const nextSide = side === 'BUY' ? 'SELL' : 'BUY'
        console.log('Order placed successfully, next side will be:', nextSide)
        currentSideRef.current = nextSide
        setCycleCount(prev => prev + 1)
      } else {
        console.log('Order failed, keeping same side for retry')
      }
      
      return success
    } finally {
      isExecutingRef.current = false
    }
  }

  const startCountdown = (seconds: number) => {
    setCountdown(seconds)
    
    // Clear any existing countdown
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
    }
    
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const startBot = async () => {
    if (!currentPrice) {
      await fetchCurrentPrice()
    }
    
    setIsRunning(true)
    setCycleCount(0)
    currentSideRef.current = startingSide // Initialize ref with starting side
    
    // Start countdown for next cycle
    startCountdown(intervalSeconds)

    intervalRef.current = setInterval(() => {
      console.log('Interval firing, executing cycle')
      executeCycle()
      startCountdown(intervalSeconds)
    }, intervalSeconds * 1000)
  }

  const stopBot = () => {
    setIsRunning(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    setCountdown(0)
    isExecutingRef.current = false // Reset execution flag
  }

  const clearLogs = () => {
    setOrderLogs([])
    setCycleCount(0)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 p-5">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8 bg-white rounded-xl p-6 shadow-lg">
          <h1 className="text-3xl font-bold text-gray-800">Trading Bot</h1>
          <Link 
            href="/"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
          >
            Back to Dashboard
          </Link>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Configuration Panel */}
          <div className="lg:col-span-1 bg-white rounded-xl p-6 shadow-lg">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Bot Configuration</h2>
            
            <div className="space-y-4">
              {/* Pair Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Trading Pair
                </label>
                <select
                  value={selectedPair.symbol}
                  onChange={(e) => {
                    const pair = PAIRS.find(p => p.symbol === e.target.value)
                    if (pair) setSelectedPair(pair)
                  }}
                  disabled={isRunning}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {PAIRS.map(pair => (
                    <option key={pair.symbol} value={pair.symbol}>
                      {pair.display}
                    </option>
                  ))}
                </select>
              </div>

              {/* Interval */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Interval (seconds)
                </label>
                <input
                  type="number"
                  min="1"
                  value={intervalSeconds}
                  onChange={(e) => setIntervalSeconds(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={isRunning}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {/* Starting Side */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Starting Side
                </label>
                <select
                  value={startingSide}
                  onChange={(e) => setStartingSide(e.target.value as 'BUY' | 'SELL')}
                  disabled={isRunning}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Choose whether to start with a BUY or SELL order
                </p>
              </div>

              {/* BUY Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  BUY Amount ({selectedPair.display.split('/')[1]})
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0.00000001"
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(parseFloat(e.target.value) || 0.0001)}
                  disabled={isRunning}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Amount of {selectedPair.display.split('/')[1]} to spend per BUY order
                </p>
              </div>

              {/* SELL Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SELL Amount ({selectedPair.display.split('/')[0]})
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.00000001"
                  value={sellAmount}
                  onChange={(e) => setSellAmount(parseFloat(e.target.value) || 10)}
                  disabled={isRunning}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Amount of {selectedPair.display.split('/')[0]} to sell per SELL order
                </p>
              </div>

              {/* Start/Stop Button */}
              <div className="pt-4">
                {!isRunning ? (
                  <button
                    onClick={startBot}
                    className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors"
                  >
                    Start Bot
                  </button>
                ) : (
                  <button
                    onClick={stopBot}
                    className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg font-medium transition-colors"
                  >
                    Stop Bot
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Status Panel */}
          <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Bot Status</h2>
              <button
                onClick={clearLogs}
                className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                Clear Logs
              </button>
            </div>

            {/* Status Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="text-xs text-gray-600 mb-1">Status</div>
                <div className={`text-lg font-bold ${isRunning ? 'text-green-600' : 'text-gray-400'}`}>
                  {isRunning ? 'RUNNING' : 'STOPPED'}
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="text-xs text-gray-600 mb-1">Next Order</div>
                <div className={`text-lg font-bold ${startingSide === 'BUY' ? 'text-green-600' : 'text-red-600'}`}>
                  {isRunning ? (currentSideRef.current || startingSide) : startingSide}
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="text-xs text-gray-600 mb-1">Cycles</div>
                <div className="text-lg font-bold text-gray-800">
                  {cycleCount}
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="text-xs text-gray-600 mb-1">Next in</div>
                <div className={`text-lg font-bold ${countdown <= 5 && countdown > 0 ? 'text-orange-600' : 'text-gray-800'}`}>
                  {isRunning ? `${countdown}s` : '—'}
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="text-xs text-gray-600 mb-1">Current Price</div>
                <div className="text-lg font-bold text-gray-800">
                  {currentPrice ? currentPrice.toFixed(8) : '—'}
                </div>
              </div>
            </div>

            {/* Order Logs */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Order History</h3>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {orderLogs.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">
                    No orders placed yet
                  </div>
                ) : (
                  orderLogs.map((log, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        log.status === 'success'
                          ? 'bg-green-50 border-green-200'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{log.timestamp}</span>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded ${
                              log.side === 'BUY'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {log.side}
                          </span>
                        </div>
                        <span
                          className={`text-xs font-medium ${
                            log.status === 'success' ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {log.status === 'success' ? '✓ Success' : '✗ Failed'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">Qty:</span> {log.quantity}
                      </div>
                      {log.orderId && (
                        <div className="text-xs text-gray-500 mt-1">
                          Order ID: {log.orderId}
                        </div>
                      )}
                      {log.message && log.status === 'error' && (
                        <div className="text-xs text-red-600 mt-1">
                          {log.message}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Information Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">How it works</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• The bot alternates between BUY and SELL market orders every cycle</li>
            <li>• Market orders execute immediately at the best available price</li>
            <li>• Orders are placed at the specified interval</li>
            <li>• Choose your starting side (BUY or SELL) before starting the bot</li>
            <li>• <strong>Separate amounts:</strong> Set different values for BUY and SELL orders</li>
            <li className="ml-4">→ BUY Amount: In {selectedPair.display.split('/')[1]} (quote currency)</li>
            <li className="ml-4">→ SELL Amount: In {selectedPair.display.split('/')[0]} (base currency)</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default Bot

