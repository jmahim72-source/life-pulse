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

// ─── Milestone Tiers & Gamification ───────────────────────────────

export interface MilestoneTier {
  id: 'bronze' | 'silver' | 'gold' | 'diamond' | 'legendary';
  name: string;
  minDays: number;
  icon: string;
  color: string;
  bgGlow: string;
}

export const MILESTONE_TIERS: MilestoneTier[] = [
  { id: 'legendary', name: 'Legendary Master', minDays: 100, icon: '👑', color: '#f59e0b', bgGlow: 'rgba(245, 158, 11, 0.25)' },
  { id: 'diamond', name: 'Diamond Titan', minDays: 30, icon: '💎', color: '#06b6d4', bgGlow: 'rgba(6, 182, 212, 0.25)' },
  { id: 'gold', name: 'Gold Vanguard', minDays: 14, icon: '🥇', color: '#eab308', bgGlow: 'rgba(234, 179, 8, 0.25)' },
  { id: 'silver', name: 'Silver Flame', minDays: 7, icon: '🥈', color: '#94a3b8', bgGlow: 'rgba(148, 163, 184, 0.25)' },
  { id: 'bronze', name: 'Bronze Spark', minDays: 3, icon: '🥉', color: '#d97706', bgGlow: 'rgba(217, 119, 6, 0.25)' },
];

// ─── Budget & Financial Insights ───────────────────────────────────

export interface CategoryBudget {
  category: string;
  limit: number;
}

export interface MonthlyBudgetConfig {
  month: string;              // YYYY-MM
  totalBudget: number;
  categoryBudgets: Record<string, number>;
}

export interface AISpendingInsight {
  summary: string;
  tips: string[];
  analyzedAt: string;
}

