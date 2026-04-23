const NAV = [
  { id: 'home',      icon: '🏠', label: 'Home' },
  { id: 'analyze',   icon: '🔍', label: 'Analyze' },
  { id: 'portfolio', icon: '💼', label: 'Portfolio' },
  { id: 'dcf',       icon: '📐', label: 'DCF Calculator' },
  { id: 'compare',   icon: '📊', label: 'Compare' },
  { id: 'watchlist', icon: '⭐', label: 'Watchlist' },
  { id: 'screener',  icon: '📉', label: 'Screener' },
  { id: 'earnings',  icon: '📅', label: 'Earnings' },
  { id: 'alerts',    icon: '🔔', label: 'Alerts' },
]

export default function Sidebar({ active, onChange }) {
  return (
    <aside style={{
      width: 'var(--sidebar-width)',
      minHeight: '100vh',
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 50,
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 20px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        height: 'var(--header-height)',
      }}>
        <span style={{ fontSize: '22px' }}>📈</span>
        <span style={{
          fontWeight: 800, fontSize: '17px',
          background: 'linear-gradient(135deg, #818cf8, #6366f1)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          FinSight AI
        </span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {NAV.map(item => {
          const isActive = active === item.id
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: '10px',
                border: 'none',
                background: isActive ? 'var(--accent-dim)' : 'transparent',
                color: isActive ? 'var(--accent-light)' : 'var(--text-muted)',
                fontSize: '14px',
                fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                transition: 'all 0.15s',
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-card-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = isActive ? 'var(--accent-light)' : 'var(--text-muted)' }}
            >
              <span style={{ fontSize: '16px' }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          For educational purposes only.<br />Not financial advice.
        </p>
      </div>
    </aside>
  )
}
