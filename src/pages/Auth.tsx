/**
 * Auth screen — magic link only, no password.
 * Shown once, then never again unless user signs out.
 */

import React, { useState } from 'react';
import { signInWithMagicLink } from '../lib/supabase';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError('');

    try {
      await signInWithMagicLink(email.trim());
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send magic link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '24px',
        background: 'var(--color-bg-primary)',
        backgroundImage: 
          'radial-gradient(circle at 10% 20%, rgba(139, 92, 246, 0.08) 0%, transparent 45%), ' +
          'radial-gradient(circle at 90% 80%, rgba(6, 182, 212, 0.08) 0%, transparent 45%)',
      }}
    >
      <div className="animate-fade-in" style={{ width: '100%', maxWidth: '380px' }}>
        {/* Logo / Title */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div
            style={{
              width: '68px',
              height: '68px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, var(--color-habit) 0%, var(--color-finance) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '30px',
              margin: '0 auto 16px',
              boxShadow: '0 8px 24px rgba(16, 185, 129, 0.25)',
              animation: 'pulseGlow 2.5s ease-in-out infinite',
            }}
          >
            ⚡
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.5px' }}>
            LifePulse
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', margin: 0, fontWeight: 500 }}>
            Your premium self-tracking companion
          </p>
        </div>

        {sent ? (
          /* Success state */
          <div className="glass-card" style={{ padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'floatElement 3s ease-in-out infinite' }}>✉</div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.3px' }}>
              Check your inbox
            </h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', margin: '0 0 20px', lineHeight: 1.6, fontWeight: 500 }}>
              We've sent a secure magic link to <strong style={{ color: 'var(--color-text-primary)' }}>{email}</strong>. 
              Click the link to sign in.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '10px',
                padding: '8px 16px',
                color: 'var(--color-finance)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            >
              Use another email
            </button>
          </div>
        ) : (
          /* Login form */
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="glass-card" style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label
                  htmlFor="auth-email"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--color-text-secondary)',
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    paddingLeft: '2px',
                  }}
                >
                  Email Address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  autoFocus
                  className="glass-input"
                />
              </div>

              {error && (
                <div style={{ 
                  color: 'var(--color-people)', 
                  fontSize: '13px', 
                  padding: '8px 12px', 
                  borderRadius: '8px',
                  backgroundColor: 'rgba(244, 63, 94, 0.05)',
                  border: '1px solid rgba(244, 63, 94, 0.1)',
                  fontWeight: 500,
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-premium btn-premium-finance"
                style={{
                  width: '100%',
                  marginTop: '8px',
                  background: loading ? 'var(--color-bg-elevated)' : undefined,
                  boxShadow: loading ? 'none' : undefined,
                }}
              >
                {loading ? 'Sending link…' : 'Send Magic Link'}
              </button>
            </div>

            <p style={{
              textAlign: 'center',
              color: 'var(--color-text-muted)',
              fontSize: '12px',
              margin: 0,
              lineHeight: 1.5,
              fontWeight: 500,
              padding: '0 12px',
            }}>
              No passwords required. A link will be sent to your email to authenticate instantly and securely.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
