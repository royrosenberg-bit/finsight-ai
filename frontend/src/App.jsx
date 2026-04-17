import { useState } from 'react'
import Sidebar from './components/Sidebar'
import SearchBar from './components/SearchBar'
import MarketBar from './components/MarketBar'
import StockHeader from './components/StockHeader'
import StockChart from './components/StockChart'
import CompanyInfo from './components/CompanyInfo'
import AIRecommendation from './components/AIRecommendation'
import NewsSection from './components/NewsSection'
import Watchlist, { useWatchlist } from './components/Watchlist'
import Portfolio from './components/Portfolio'
import CompareStocks from './components/CompareStocks'
import AnalystRatings from './components/AnalystRatings'
import WhyDidThisMove from './components/WhyDidThisMove'
import AIDebate from './components/AIDebate'
import Dashboard from './pages/Dashboard'
import Screener from './pages/Screener'
import Earnings from './pages/Earnings'
import Alerts from './pages/Alerts'
import DCF from './pages/DCF'
import axios from 'axios'

const API = 'https://finsight-ai-backend-imxn.onrender.com/api'

export default function App() {
  const [page, setPage] = useState('home')
  const [symbol, setSymbol] = useState(null)
  const [stockData, setStockData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { list: watchlist, add: addToWatchlist, remove: removeFromWatchlist } = useWatchlist()

  async function handleSearch(sym) {
    setLoading(true)
    setError(null)
    setStockData(null)
    setSymbol(sym)
    setPage('analyze')
    try {
      const { data } = await axios.get(`${API}/stock/${sym}`)
      setStockData(data)
    } catch (e) {
      setError(e.response?.data?.detail || `Could not find symbol "${sym}"`)
    } finally {
      setLoading(false)
    }
  }

  const isWatched = symbol && watchlist.includes(symbol)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Sidebar active={page} onChange={setPage} />

      {/* Main area */}
      <div style={{ marginLeft: 'var(--sidebar-width)', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* Top header */}
        <header style={{
          height: 'var(--header-height)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          gap: 12,
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}>
          <SearchBar onSearch={handleSearch} loading={loading} />
          {symbol && stockData && (
            <button
              onClick={() => isWatched ? removeFromWatchlist(symbol) : addToWatchlist(symbol)}
              title={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
              style={{
                padding: '10px 14px', borderRadius: '10px', border: `1px solid ${isWatched ? '#f59e0b' : 'var(--border)'}`,
                background: isWatched ? 'rgba(245,158,11,0.08)' : 'var(--bg-card)',
                color: isWatched ? '#f59e0b' : 'var(--text-muted)',
                fontSize: '18px', cursor: 'pointer', lineHeight: 1, transition: 'all 0.15s',
              }}
            >
              {isWatched ? '⭐' : '☆'}
            </button>
          )}
        </header>

        {/* Market bar */}
        <MarketBar />

        {/* Page content */}
        <main style={{ flex: 1, padding: '28px 28px 40px', maxWidth: 1140, width: '100%', margin: '0 auto', alignSelf: 'stretch' }}>

          {/* HOME */}
          {page === 'home' && <Dashboard onSelectStock={handleSearch} />}

          {/* ANALYZE */}
          {page === 'analyze' && (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {!symbol && !loading && (
                <div style={{ textAlign: 'center', marginTop: 80, color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 52, marginBottom: 16 }}>🔍</div>
                  <p style={{ fontSize: 18, color: 'var(--text-secondary)', marginBottom: 8 }}>Search for any stock above</p>
                  <p style={{ fontSize: 14 }}>Try AAPL, TSLA, MSFT, NVDA…</p>
                </div>
              )}
              {loading && (
                <div style={{ textAlign: 'center', marginTop: 80, color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 36, marginBottom: 16 }}>⏳</div>
                  <p>Loading {symbol}…</p>
                </div>
              )}
              {error && (
                <div style={{ background: '#2d1a1a', border: '1px solid #7f1d1d', borderRadius: 12, padding: 20, color: '#fca5a5', textAlign: 'center' }}>
                  {error}
                </div>
              )}
              {stockData && !loading && (
                <>
                  <StockHeader data={stockData} />
                  <WhyDidThisMove symbol={stockData.symbol} />
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
                    <StockChart symbol={stockData.symbol} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                      <CompanyInfo data={stockData} />
                      <AnalystRatings symbol={stockData.symbol} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <AIRecommendation symbol={stockData.symbol} stockData={stockData} />
                    <NewsSection symbol={stockData.symbol} />
                  </div>
                  <AIDebate symbol={stockData.symbol} />
                </>
              )}
            </div>
          )}

          {/* COMPARE */}
          {page === 'compare' && <CompareStocks />}

          {/* SCREENER */}
          {page === 'screener' && <Screener onSelectStock={handleSearch} />}

          {/* EARNINGS */}
          {page === 'earnings' && <Earnings onSelectStock={handleSearch} />}

          {/* PORTFOLIO */}
          {page === 'portfolio' && <Portfolio onSelectStock={handleSearch} />}

          {/* WATCHLIST */}
          {page === 'watchlist' && <Watchlist onSelectStock={handleSearch} />}

          {/* ALERTS */}
          {page === 'alerts' && <Alerts />}

          {/* DCF */}
          {page === 'dcf' && <DCF />}

        </main>
      </div>
    </div>
  )
}
