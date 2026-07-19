/**
 * LifePulse data types.
 * 
 * Sync columns (user_id, updated_at, deleted_at) are on every record.
 * _pendingSync is local-only — never sent to Supabase.
 */

// ─── Base sync fields ──────────────────────────────────────────────

export interface SyncFields {
  user_id: string;
  updated_at: string;      // ISO timestamptz — LWW arbiter
  deleted_at: string | null; // soft delete
  _pendingSync?: boolean;  // local-only
}

// ─── Habits ────────────────────────────────────────────────────────

export interface Habit extends SyncFields {
  id: string;
  name: string;
  type: 'boolean' | 'count';
  target?: number;           // only for 'count' type
  unit?: string;             // e.g. "glasses", "min"
  archived: boolean;
  createdAt: string;         // ISO date
}

/** keyPath: [habitId, date] — one log per habit per day, enforced at DB level */
export interface HabitLog extends SyncFields {
  habitId: string;
  date: string;              // YYYY-MM-DD
  value: number;             // 1/0 for boolean, actual count for count
}

// ─── Journal ───────────────────────────────────────────────────────

/** keyPath: date — one entry per day, enforced at DB level */
export interface JournalEntry extends SyncFields {
  date: string;              // YYYY-MM-DD
  text: string;
  mood?: 1 | 2 | 3 | 4 | 5;
}

// ─── Finance ───────────────────────────────────────────────────────

export interface Transaction extends SyncFields {
  id: string;
  date: string;              // YYYY-MM-DD
  amount: number;            // always positive; sign implied by type
  type: 'income' | 'expense';
  category: string;
  note?: string;
}

// ─── People & Splits ───────────────────────────────────────────────

export interface Person extends SyncFields {
  id: string;
  name: string;
  archived: boolean;
}

/** Generated when a transaction is split with others */
export interface SplitShare extends SyncFields {
  id: string;
  transactionId: string;     // FK → transactions
  personId: string;          // FK → people
  amountOwedToYou: number;   // their share
  settled: boolean;
}

/** Standalone IOU — not tied to a transaction */
export interface LedgerEntry extends SyncFields {
  id: string;
  personId: string;          // FK → people
  amount: number;
  direction: 'they_owe_me' | 'i_owe_them';
  date: string;              // YYYY-MM-DD
  note?: string;
  settled: boolean;
}

// ─── Sync Meta (local only) ────────────────────────────────────────

export interface SyncMeta {
  key: string;               // e.g. 'lastSyncTimestamp', 'userId'
  value: string;
}

// ─── Finance categories ────────────────────────────────────────────

export const DEFAULT_CATEGORIES = [
  'Food',
  'Transport',
  'Bills',
  'Shopping',
  'Health',
  'Income',
  'Other',
] as const;
