import { useQuery } from '@tanstack/react-query'
import type { NextPage } from 'next'
import Link from 'next/link'

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

const fetchOrderAges = async (): Promise<PairAgeData[]> => {
  const response = await fetch('/api/order-ages')
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }
  
  return response.json()
}

const Histogram: NextPage = () => {
  const { data: pairData = [], isLoading, error, refetch } = useQuery<PairAgeData[]>({
    queryKey: ['order-ages'],
    queryFn: fetchOrderAges,
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const getMaxCount = (buckets: AgeBucket[]) => {
    return Math.max(...buckets.map(b => b.count), 1)
  }

  const formatSymbol = (symbol: string) => {
    return symbol.replace('_', '/').toUpperCase()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-5">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8 bg-white rounded-xl p-6 shadow-lg">
          <div className="flex items-center gap-4">
            <Link 
              href="/"
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-800">Order Age Histogram</h1>
          </div>
          <button 
            onClick={() => refetch()} 
            disabled={isLoading} 
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </header>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-6">
            <p className="font-medium">Error: {error instanceof Error ? error.message : 'Failed to load order ages'}</p>
          </div>
        )}

        {isLoading && pairData.length === 0 ? (
          <div className="bg-white rounded-xl p-8 shadow-lg text-center">
            <p className="text-gray-600">Loading order age data...</p>
          </div>
        ) : pairData.length === 0 ? (
          <div className="bg-white rounded-xl p-8 shadow-lg text-center">
            <p className="text-gray-600">No orders found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pairData.map((pair) => {
              const maxCount = getMaxCount(pair.buckets)
              
              return (
                <div key={pair.symbol} className="bg-white rounded-xl p-6 shadow-lg">
                  <h2 className="text-xl font-bold text-gray-800 mb-2">
                    {formatSymbol(pair.symbol)}
                  </h2>
                  <p className="text-sm text-gray-500 mb-4">
                    Total Orders: {pair.totalOrders}
                  </p>
                  
                  <div className="space-y-3">
                    {pair.buckets.map((bucket, index) => {
                      const percentage = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0
                      
                      return (
                        <div key={index} className="flex items-center gap-3">
                          <div className="w-20 text-xs font-medium text-gray-600 flex-shrink-0">
                            {bucket.label}
                          </div>
                          <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300 flex items-center justify-end pr-2"
                              style={{ width: `${percentage}%` }}
                            >
                              {bucket.count > 0 && (
                                <span className="text-xs font-semibold text-white">
                                  {bucket.count}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="w-12 text-xs text-gray-500 text-right flex-shrink-0">
                            {bucket.count}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default Histogram

