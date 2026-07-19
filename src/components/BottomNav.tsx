
import { NavLink } from 'react-router-dom';

const tabs = [
  {
    to: '/',
    label: 'Today',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
    color: 'var(--color-habit)',
  },
  {
    to: '/journal',
    label: 'Journal',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
    ),
    color: 'var(--color-journal)',
  },
  {
    to: '/finance',
    label: 'Finance',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
        <line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
    ),
    color: 'var(--color-finance)',
  },
  {
    to: '/people',
    label: 'People',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    color: 'var(--color-people)',
  },
  {
    to: '/stats',
    label: 'Stats',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
    color: 'var(--color-stats)',
  },
];

export default function BottomNav() {
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        maxWidth: '400px',
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '20px',
        paddingBottom: '0',
        zIndex: 50,
        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          height: '68px',
          padding: '0 8px',
        }}
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            style={({ isActive }) => ({
              display: 'flex',
              flexDirection: 'column' as const,
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              textDecoration: 'none',
              color: isActive ? tab.color : 'var(--color-text-secondary)',
              fontSize: '11px',
              fontWeight: isActive ? 600 : 500,
              transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              minWidth: '56px',
              padding: '6px 4px',
              borderRadius: '12px',
              backgroundColor: isActive ? 'rgba(255, 255, 255, 0.03)' : 'transparent',
              transform: isActive ? 'scale(1.05)' : 'none',
              filter: isActive ? `drop-shadow(0 0 4px ${tab.color}33)` : 'none',
            })}
          >
            {tab.icon}
            <span style={{ fontSize: '10px', letterSpacing: '0.2px' }}>{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
