/**
 * Sync engine — pushes local changes to Supabase, pulls remote changes.
 *
 * Push: FK-ordered tiers, records with _pendingSync=true
 * Pull: skips records with local pending edits (LWW by updated_at)
 * Triggers: visibility change, online event, post-push — NOT polling
 */

import { supabase } from '../lib/supabase';
import { SYNC_EPOCH } from '../lib/dates';
import {
  getPendingRecords,
  clearPendingFlag,
  putRecordFromServer,
  getSyncMeta,
  setSyncMeta,
} from '../db';
import {
  toSupabaseRow,
  fromSupabaseRow,
  STORE_TO_TABLE,
  PUSH_TIERS,
  ALL_SYNCABLE_STORES,
} from './mappers';
import { setSyncStatus } from './status';

let isSyncing = false;

// ─── Push ──────────────────────────────────────────────────────────

async function pushTier(storeNames: string[]): Promise<void> {
  if (!supabase) return;

  for (const storeName of storeNames) {
    const pending = await getPendingRecords(storeName);
    if (pending.length === 0) continue;

    const tableName = STORE_TO_TABLE[storeName];

    for (const record of pending) {
      try {
        const row = toSupabaseRow(storeName, record as Record<string, any>);
        const { error } = await supabase.from(tableName).upsert(row);

        if (error) {
          console.error(`Sync push error [${tableName}]:`, error.message);
          // Don't clear flag — will retry next cycle
          continue;
        }

        // Success — get the key for this record to clear its pending flag
        const key = getRecordKey(storeName, record as Record<string, any>);
        await clearPendingFlag(storeName, key);
      } catch (err) {
        console.error(`Sync push exception [${tableName}]:`, err);
      }
    }
  }
}

function getRecordKey(storeName: string, record: Record<string, any>): IDBValidKey {
  // Match the keyPath defined in db/index.ts
  switch (storeName) {
    case 'habitLogs':
      return [record.habitId, record.date];
    case 'journal':
      return record.date;
    default:
      return record.id;
  }
}

async function pushAll(): Promise<void> {
  // Push tiers in order to respect FK dependencies
  for (const tier of PUSH_TIERS) {
    await pushTier(tier);
  }
}

// ─── Pull ──────────────────────────────────────────────────────────

async function pullAll(): Promise<void> {
  if (!supabase) return;

  // Default to epoch if no previous sync — ensures fresh-device pull
  // fetches everything instead of returning zero rows (updated_at > NULL = NULL)
  const lastSync = (await getSyncMeta('lastSyncTimestamp')) ?? SYNC_EPOCH;
  let latestTimestamp = lastSync;

  for (const storeName of ALL_SYNCABLE_STORES) {
    const tableName = STORE_TO_TABLE[storeName];

    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .gt('updated_at', lastSync)
        .order('updated_at', { ascending: true });

      if (error) {
        console.error(`Sync pull error [${tableName}]:`, error.message);
        continue;
      }

      if (!data || data.length === 0) continue;

      for (const serverRow of data) {
        const localRecord = fromSupabaseRow(storeName, serverRow);
        // putRecordFromServer handles the _pendingSync check internally:
        // if local has _pendingSync=true and local updated_at >= server updated_at,
        // it skips the overwrite (local edit wins)
        await putRecordFromServer(storeName, localRecord);

        // Track latest timestamp for next pull
        if (serverRow.updated_at > latestTimestamp) {
          latestTimestamp = serverRow.updated_at;
        }
      }
    } catch (err) {
      console.error(`Sync pull exception [${tableName}]:`, err);
    }
  }

  // Only update lastSyncTimestamp if we actually got data
  if (latestTimestamp !== lastSync) {
    await setSyncMeta('lastSyncTimestamp', latestTimestamp);
  }
}

// ─── Full sync cycle ───────────────────────────────────────────────

export async function syncNow(): Promise<void> {
  if (isSyncing || !supabase || !navigator.onLine) {
    if (!navigator.onLine) setSyncStatus('offline');
    return;
  }

  isSyncing = true;
  setSyncStatus('syncing');

  try {
    await pushAll();
    await pullAll();
    setSyncStatus('synced');
  } catch (err) {
    console.error('Sync cycle failed:', err);
    setSyncStatus('error');
  } finally {
    isSyncing = false;
  }
}

// ─── Event-driven triggers ─────────────────────────────────────────

let initialized = false;

export function initSyncListeners(): void {
  if (initialized || !supabase) return;
  initialized = true;

  // Sync when app becomes visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncNow();
    }
  });

  // Sync when connectivity is restored
  window.addEventListener('online', () => {
    syncNow();
  });

  // Track offline status
  window.addEventListener('offline', () => {
    setSyncStatus('offline');
  });

  // Initial sync on startup
  syncNow();
}
