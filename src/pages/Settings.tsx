/**
 * Settings — account, sync status, export/import, manage habits.
 * Import safety: auto-exports current data before overwriting.
 */

import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSyncStatus } from '../sync/status';
import { syncNow } from '../sync/engine';
import { getSyncMeta, exportAllData, importAllData } from '../db';

export default function Settings() {
  const { user, signOut } = useAuth();
  const syncStatus = useSyncStatus();
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('lifepulse-gemini-api-key') || '');

  const handleSaveGeminiKey = (key: string) => {
    setGeminiKey(key);
    localStorage.setItem('lifepulse-gemini-api-key', key.trim());
  };

  React.useEffect(() => {
    getSyncMeta('lastSyncTimestamp').then(setLastSync);
  }, [syncStatus]);

  const handleExport = async () => {
    try {
      const json = await exportAllData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lifepulse-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage('Data exported successfully');
    } catch (err: any) {
      setMessage(`Export failed: ${err.message}`);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Safety: auto-export current data first
    const proceed = window.confirm(
      'This will replace all existing data. A backup of your current data will be downloaded first. Continue?'
    );
    if (!proceed) {
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setImporting(true);
    try {
      // Auto-export safety net
      await handleExport();

      // Read and import
      const text = await file.text();
      await importAllData(text);
      setMessage('Data imported successfully. Refreshing…');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      setMessage(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSync = async () => {
    await syncNow();
    const ts = await getSyncMeta('lastSyncTimestamp');
    setLastSync(ts);
    setMessage('Sync completed');
  };

  const handleSignOut = async () => {
    const confirm = window.confirm('Sign out? All local data will be cleared.');
    if (confirm) {
      await signOut();
      window.location.reload();
    }
  };



  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 0',
    borderBottom: '1px solid var(--color-border-light)',
  };

  return (
    <div className="page animate-fade-in">
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.3px' }}>Settings</h1>

      {/* Account */}
      <div className="glass-card" style={{ padding: '18px 20px' }}>
        <h2 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Account
        </h2>
        <div style={rowStyle}>
          <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Email</span>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>{user?.email || 'Offline Mode'}</span>
        </div>
        {user && (
          <div style={{ ...rowStyle, borderBottom: 'none', paddingBottom: 0 }}>
            <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Session</span>
            <button 
              onClick={handleSignOut} 
              className="btn-premium btn-premium-people"
              style={{
                padding: '6px 14px', 
                fontSize: '12px',
                minHeight: '32px',
                borderRadius: '8px',
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      {/* Sync */}
      <div className="glass-card" style={{ padding: '18px 20px' }}>
        <h2 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Sync
        </h2>
        <div style={rowStyle}>
          <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Status</span>
          <span style={{
            fontSize: '13px', 
            fontWeight: 700,
            textTransform: 'capitalize',
            color: syncStatus === 'synced' ? 'var(--color-habit)' :
                   syncStatus === 'error' ? 'var(--color-people)' : 'var(--color-text-secondary)',
          }}>
            {syncStatus}
          </span>
        </div>
        <div style={rowStyle}>
          <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Last synced</span>
          <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
            {lastSync ? new Date(lastSync).toLocaleString() : 'Never'}
          </span>
        </div>
        <div style={{ ...rowStyle, borderBottom: 'none', paddingBottom: 0 }}>
          <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Manual sync</span>
          <button 
            onClick={handleSync} 
            className="btn-premium btn-premium-finance" 
            style={{
              padding: '6px 14px', 
              fontSize: '12px',
              minHeight: '32px',
              borderRadius: '8px',
            }}
          >
            Sync now
          </button>
        </div>
      </div>

      {/* Gemini Integration */}
      <div className="glass-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h2 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Gemini Integration
        </h2>
        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          Enter your Gemini API key to enable UPI receipt & photo parsing locally on this device.
        </div>
        <input
          type="password"
          value={geminiKey}
          onChange={(e) => handleSaveGeminiKey(e.target.value)}
          placeholder="API Key (AIzaSy...)"
          className="glass-input"
          style={{ fontSize: '14px', fontFamily: 'monospace' }}
        />
        {geminiKey ? (
          <div style={{ fontSize: '11px', color: 'var(--color-habit)', fontWeight: 650, display: 'flex', alignItems: 'center', gap: '4px' }}>
            ✓ Key configured (stored locally)
          </div>
        ) : (
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
            No key configured. Scanning will use server endpoint if active.
          </div>
        )}
      </div>

      {/* Data */}
      <div className="glass-card" style={{ padding: '18px 20px' }}>
        <h2 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Data
        </h2>
        <div style={rowStyle}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Export Data</div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>Download all logs as a JSON backup</div>
          </div>
          <button 
            onClick={handleExport} 
            className="btn-premium btn-premium-secondary" 
            style={{
              padding: '6px 14px', 
              fontSize: '12px',
              minHeight: '32px',
              borderRadius: '8px',
            }}
          >
            Export
          </button>
        </div>
        <div style={{ ...rowStyle, borderBottom: 'none', paddingBottom: 0 }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Import Data</div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>Restore from a backup JSON file</div>
          </div>
          <label 
            className="btn-premium btn-premium-secondary" 
            style={{
              padding: '6px 14px', 
              fontSize: '12px',
              minHeight: '32px',
              borderRadius: '8px',
              cursor: importing ? 'wait' : 'pointer',
            }}
          >
            {importing ? 'Importing…' : 'Import'}
            <input ref={fileRef} type="file" accept=".json" onChange={handleImport}
              style={{ display: 'none' }} disabled={importing} />
          </label>
        </div>
      </div>

      {/* Habits Link */}
      <div className="glass-card" style={{ padding: '16px 20px' }}>
        <Link to="/manage-habits" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          textDecoration: 'none', color: 'var(--color-text-primary)',
        }}>
          <span style={{ fontSize: '15px', fontWeight: 600 }}>Manage habits</span>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '16px' }}>→</span>
        </Link>
      </div>

      {/* Message */}
      {message && (
        <div className="glass-card animate-fade-in" style={{
          padding: '12px 16px',
          borderColor: 'rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          fontSize: '13px',
          color: 'var(--color-text-secondary)', 
          textAlign: 'center',
        }}>
          {message}
        </div>
      )}

      {/* Version */}
      <div style={{ textAlign: 'center', marginTop: '16px', color: 'var(--color-text-muted)', fontSize: '11px', fontWeight: 500 }}>
        LifePulse PWA v1.0.0
      </div>
    </div>
  );
}
