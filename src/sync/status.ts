/**
 * Sync status — React context for UI consumption.
 * Simple state machine: synced | syncing | offline | error
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';

// Global setter — called by sync engine (non-React code)
let globalSetStatus: ((status: SyncStatus) => void) | null = null;

export function setSyncStatus(status: SyncStatus) {
  globalSetStatus?.(status);
}

// ─── React Context ─────────────────────────────────────────────────

interface SyncContextValue {
  status: SyncStatus;
}

const SyncContext = createContext<SyncContextValue>({ status: 'offline' });

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>(
    navigator.onLine ? 'synced' : 'offline'
  );

  useEffect(() => {
    globalSetStatus = setStatus;
    return () => {
      globalSetStatus = null;
    };
  }, []);

  return React.createElement(
    SyncContext.Provider,
    { value: { status } },
    children
  );
}

export function useSyncStatus(): SyncStatus {
  return useContext(SyncContext).status;
}
