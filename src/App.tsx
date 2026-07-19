/**
 * App root — auth gate, lazy routes, sync init.
 * Today is eagerly loaded (highest-frequency screen).
 * All other routes are React.lazy (code-split to keep Today fast).
 */

import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SyncProvider } from './sync/status';
import { initSyncListeners } from './sync/engine';
import { supabase } from './lib/supabase';
import BottomNav from './components/BottomNav';
import SyncIndicator from './components/SyncIndicator';
import Today from './pages/Today';

// Lazy-loaded routes — Today doesn't pay for Recharts' d3 bundle
const Journal = React.lazy(() => import('./pages/Journal'));
const Finance = React.lazy(() => import('./pages/Finance'));
const People = React.lazy(() => import('./pages/People'));
const Stats = React.lazy(() => import('./pages/Stats'));
const Settings = React.lazy(() => import('./pages/Settings'));
const ManageHabits = React.lazy(() => import('./pages/ManageHabits'));
const Auth = React.lazy(() => import('./pages/Auth'));

function LoadingSpinner() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: '16px',
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        border: '3px solid rgba(255, 255, 255, 0.05)',
        borderTopColor: 'var(--color-finance)',
        animation: 'pulse-once 1.2s linear infinite',
      }} />
      <div style={{
        color: 'var(--color-text-secondary)',
        fontSize: '14px',
        fontWeight: 500,
        letterSpacing: '0.5px',
      }}>
        Loading LifePulse...
      </div>
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (user || !supabase) {
      initSyncListeners();
    }
  }, [user]);

  if (loading) {
    return <LoadingSpinner />;
  }

  // Auth gate — only when Supabase is configured and no session
  if (supabase && !user) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <Auth />
      </Suspense>
    );
  }

  return (
    <>
      {/* Premium Glass Header */}
      <header className="glass-header" style={{ width: '100%' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          maxWidth: '440px',
          margin: '0 auto',
          width: '100%',
        }}>
          <h1 style={{
            fontSize: '20px',
            fontWeight: 800,
            margin: 0,
            background: 'linear-gradient(135deg, var(--color-habit) 0%, var(--color-finance) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.5px',
          }}>
            LifePulse
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <SyncIndicator />
            <a 
              href="/settings" 
              onClick={(e) => { e.preventDefault(); window.location.href = '/settings'; }} 
              style={{ 
                color: 'var(--color-text-secondary)', 
                textDecoration: 'none', 
                fontSize: '18px',
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.color = 'var(--color-text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                e.currentTarget.style.color = 'var(--color-text-secondary)';
              }}
            >
              ⚙
            </a>
          </div>
        </div>
      </header>

      {/* Main content */}
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/people" element={<People />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/manage-habits" element={<ManageHabits />} />
        </Routes>
      </Suspense>

      <BottomNav />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SyncProvider>
          <AppContent />
        </SyncProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
