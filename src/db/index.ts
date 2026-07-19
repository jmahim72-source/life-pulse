/**
 * IndexedDB wrapper — the local data engine.
 *
 * Architecture: UI reads/writes to IndexedDB always. Supabase syncs in the background.
 * Every write sets updated_at and _pendingSync: true.
 * Deletes are soft (set deleted_at, never remove the record).
 *
 * Key design decisions:
 * - habitLogs keyPath: [habitId, date] — natural compound key, one log per habit per day
 * - journal keyPath: date — natural key, one entry per day
 * - DB_VERSION + versioned onupgradeneeded — migration-ready from day one
 * - incrementHabitLog uses a single IDB transaction (read+write atomic) to prevent
 *   race conditions on rapid taps
 */

import { openDB, type IDBPDatabase } from 'idb';
import { getNowISO, getLocalDateString, getPrevDay } from '../lib/dates';
import type {
  Habit, HabitLog, JournalEntry, Transaction,
  Person, SplitShare, LedgerEntry
} from '../types';

// ─── DB Config ─────────────────────────────────────────────────────

const DB_NAME = 'lifepulse-db';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase | null = null;

function upgrade(db: IDBPDatabase, oldVersion: number) {
  if (oldVersion < 1) {
    // Habits — synthetic ID (referenced by habitLogs)
    db.createObjectStore('habits', { keyPath: 'id' });

    // HabitLogs — compound natural key [habitId, date]
    const logStore = db.createObjectStore('habitLogs', { keyPath: ['habitId', 'date'] });
    logStore.createIndex('by-date', 'date');

    // Journal — date as natural key
    db.createObjectStore('journal', { keyPath: 'date' });

    // Transactions — synthetic ID (multiple per day)
    const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
    txStore.createIndex('by-date', 'date');
    txStore.createIndex('by-category', 'category');

    // People
    db.createObjectStore('people', { keyPath: 'id' });

    // Split Shares
    const splitStore = db.createObjectStore('splitShares', { keyPath: 'id' });
    splitStore.createIndex('by-transaction', 'transactionId');
    splitStore.createIndex('by-person', 'personId');

    // Ledger Entries
    const ledgerStore = db.createObjectStore('ledgerEntries', { keyPath: 'id' });
    ledgerStore.createIndex('by-person', 'personId');

    // Sync metadata (local only)
    db.createObjectStore('syncMeta', { keyPath: 'key' });
  }
  // if (oldVersion < 2) { /* future migrations go here */ }
}

export async function getDB(): Promise<IDBPDatabase> {
  if (!dbInstance) {
    dbInstance = await openDB(DB_NAME, DB_VERSION, { upgrade });
  }
  return dbInstance;
}

// ─── Habits ────────────────────────────────────────────────────────

export async function getAllHabits(): Promise<Habit[]> {
  const db = await getDB();
  const all = await db.getAll('habits');
  return all.filter((h: Habit) => !h.deleted_at);
}

export async function getActiveHabits(): Promise<Habit[]> {
  const all = await getAllHabits();
  return all.filter(h => !h.archived);
}

export async function putHabit(habit: Habit): Promise<void> {
  const db = await getDB();
  await db.put('habits', {
    ...habit,
    updated_at: getNowISO(),
    _pendingSync: true,
  });
}

export async function createHabit(
  data: Pick<Habit, 'name' | 'type' | 'target' | 'unit'>,
  userId: string
): Promise<Habit> {
  const habit: Habit = {
    id: crypto.randomUUID(),
    name: data.name,
    type: data.type,
    target: data.target,
    unit: data.unit,
    archived: false,
    createdAt: getNowISO(),
    user_id: userId,
    updated_at: getNowISO(),
    deleted_at: null,
    _pendingSync: true,
  };
  const db = await getDB();
  await db.put('habits', habit);
  return habit;
}

export async function archiveHabit(id: string): Promise<void> {
  const db = await getDB();
  const habit = await db.get('habits', id);
  if (habit) {
    await db.put('habits', {
      ...habit,
      archived: true,
      updated_at: getNowISO(),
      _pendingSync: true,
    });
  }
}

export async function deleteHabit(id: string): Promise<void> {
  const db = await getDB();
  const habit = await db.get('habits', id);
  if (habit) {
    await db.put('habits', {
      ...habit,
      deleted_at: getNowISO(),
      updated_at: getNowISO(),
      _pendingSync: true,
    });
  }
}

// ─── Habit Logs ────────────────────────────────────────────────────

export async function getHabitLog(habitId: string, date: string): Promise<HabitLog | undefined> {
  const db = await getDB();
  return db.get('habitLogs', [habitId, date]);
}

export async function getHabitLogsForDate(date: string): Promise<HabitLog[]> {
  const db = await getDB();
  return db.getAllFromIndex('habitLogs', 'by-date', date);
}

export async function getHabitLogsForRange(
  habitId: string,
  dates: string[]
): Promise<HabitLog[]> {
  const db = await getDB();
  const logs: HabitLog[] = [];
  for (const date of dates) {
    const log = await db.get('habitLogs', [habitId, date]);
    if (log && !log.deleted_at) logs.push(log);
  }
  return logs;
}

/**
 * Race-safe increment for count-type habits.
 * Read + write in a SINGLE IDB transaction — atomic, so rapid taps
 * each get their own serial transaction and no increments are lost.
 */
export async function incrementHabitLog(
  habitId: string,
  date: string,
  userId: string
): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('habitLogs', 'readwrite');
  const store = tx.objectStore('habitLogs');
  const existing = await store.get([habitId, date]);
  const newValue = (existing?.value ?? 0) + 1;
  await store.put({
    habitId,
    date,
    value: newValue,
    user_id: userId,
    updated_at: getNowISO(),
    deleted_at: null,
    _pendingSync: true,
  });
  await tx.done;
  return newValue;
}

/**
 * Set a habit log to a specific value (for direct-set UI or toggle)
 */
export async function setHabitLog(
  habitId: string,
  date: string,
  value: number,
  userId: string
): Promise<void> {
  const db = await getDB();
  await db.put('habitLogs', {
    habitId,
    date,
    value,
    user_id: userId,
    updated_at: getNowISO(),
    deleted_at: null,
    _pendingSync: true,
  });
}

// ─── Journal ───────────────────────────────────────────────────────

export async function getJournalEntry(date: string): Promise<JournalEntry | undefined> {
  const db = await getDB();
  const entry = await db.get('journal', date);
  return entry && !entry.deleted_at ? entry : undefined;
}

export async function getAllJournalEntries(): Promise<JournalEntry[]> {
  const db = await getDB();
  const all = await db.getAll('journal');
  return all.filter((e: JournalEntry) => !e.deleted_at).sort((a, b) => b.date.localeCompare(a.date));
}

export async function putJournalEntry(
  date: string,
  text: string,
  mood: 1 | 2 | 3 | 4 | 5 | undefined,
  userId: string
): Promise<void> {
  const db = await getDB();
  await db.put('journal', {
    date,
    text,
    mood,
    user_id: userId,
    updated_at: getNowISO(),
    deleted_at: null,
    _pendingSync: true,
  });
}

// ─── Transactions ──────────────────────────────────────────────────

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await getDB();
  const all = await db.getAll('transactions');
  return all.filter((t: Transaction) => !t.deleted_at).sort((a, b) => b.date.localeCompare(a.date));
}

export async function getTransactionsForMonth(yearMonth: string): Promise<Transaction[]> {
  // yearMonth = 'YYYY-MM'
  const all = await getAllTransactions();
  return all.filter(t => t.date.startsWith(yearMonth));
}

export async function putTransaction(tx: Transaction): Promise<void> {
  const db = await getDB();
  await db.put('transactions', {
    ...tx,
    updated_at: getNowISO(),
    _pendingSync: true,
  });
}

export async function createTransaction(
  data: Pick<Transaction, 'date' | 'amount' | 'type' | 'category' | 'note'>,
  userId: string
): Promise<Transaction> {
  const transaction: Transaction = {
    id: crypto.randomUUID(),
    ...data,
    user_id: userId,
    updated_at: getNowISO(),
    deleted_at: null,
    _pendingSync: true,
  };
  const db = await getDB();
  await db.put('transactions', transaction);
  return transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await getDB();
  const tx = await db.get('transactions', id);
  if (tx) {
    await db.put('transactions', {
      ...tx,
      deleted_at: getNowISO(),
      updated_at: getNowISO(),
      _pendingSync: true,
    });
  }
}

// ─── People ────────────────────────────────────────────────────────

export async function getAllPeople(): Promise<Person[]> {
  const db = await getDB();
  const all = await db.getAll('people');
  return all.filter((p: Person) => !p.deleted_at);
}

export async function createPerson(name: string, userId: string): Promise<Person> {
  const person: Person = {
    id: crypto.randomUUID(),
    name,
    archived: false,
    user_id: userId,
    updated_at: getNowISO(),
    deleted_at: null,
    _pendingSync: true,
  };
  const db = await getDB();
  await db.put('people', person);
  return person;
}

// ─── Split Shares ──────────────────────────────────────────────────

export async function getSplitSharesForTransaction(transactionId: string): Promise<SplitShare[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('splitShares', 'by-transaction', transactionId);
  return all.filter((s: SplitShare) => !s.deleted_at);
}

export async function getSplitSharesForPerson(personId: string): Promise<SplitShare[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('splitShares', 'by-person', personId);
  return all.filter((s: SplitShare) => !s.deleted_at);
}

export async function createSplitShare(
  data: Pick<SplitShare, 'transactionId' | 'personId' | 'amountOwedToYou'>,
  userId: string
): Promise<SplitShare> {
  const share: SplitShare = {
    id: crypto.randomUUID(),
    ...data,
    settled: false,
    user_id: userId,
    updated_at: getNowISO(),
    deleted_at: null,
    _pendingSync: true,
  };
  const db = await getDB();
  await db.put('splitShares', share);
  return share;
}

export async function settleSplitShare(id: string): Promise<void> {
  const db = await getDB();
  const share = await db.get('splitShares', id);
  if (share) {
    await db.put('splitShares', {
      ...share,
      settled: true,
      updated_at: getNowISO(),
      _pendingSync: true,
    });
  }
}

// ─── Ledger Entries ────────────────────────────────────────────────

export async function getLedgerEntriesForPerson(personId: string): Promise<LedgerEntry[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('ledgerEntries', 'by-person', personId);
  return all.filter((e: LedgerEntry) => !e.deleted_at);
}

export async function getAllLedgerEntries(): Promise<LedgerEntry[]> {
  const db = await getDB();
  const all = await db.getAll('ledgerEntries');
  return all.filter((e: LedgerEntry) => !e.deleted_at);
}

export async function createLedgerEntry(
  data: Pick<LedgerEntry, 'personId' | 'amount' | 'direction' | 'date' | 'note'>,
  userId: string
): Promise<LedgerEntry> {
  const entry: LedgerEntry = {
    id: crypto.randomUUID(),
    ...data,
    settled: false,
    user_id: userId,
    updated_at: getNowISO(),
    deleted_at: null,
    _pendingSync: true,
  };
  const db = await getDB();
  await db.put('ledgerEntries', entry);
  return entry;
}

export async function settleLedgerEntry(id: string): Promise<void> {
  const db = await getDB();
  const entry = await db.get('ledgerEntries', id);
  if (entry) {
    await db.put('ledgerEntries', {
      ...entry,
      settled: true,
      updated_at: getNowISO(),
      _pendingSync: true,
    });
  }
}

// ─── Sync Meta ─────────────────────────────────────────────────────

export async function getSyncMeta(key: string): Promise<string | null> {
  const db = await getDB();
  const meta = await db.get('syncMeta', key);
  return meta?.value ?? null;
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.put('syncMeta', { key, value });
}

// ─── Seed Defaults ─────────────────────────────────────────────────

export async function seedDefaultHabits(userId: string): Promise<void> {
  const existing = await getAllHabits();
  if (existing.length > 0) return; // already seeded

  const defaults: Pick<Habit, 'name' | 'type' | 'target' | 'unit'>[] = [
    { name: 'Water', type: 'count', target: 8, unit: 'glasses' },
    { name: 'Workout', type: 'boolean', target: undefined, unit: undefined },
    { name: 'Sleep 7+ hrs', type: 'boolean', target: undefined, unit: undefined },
  ];

  for (const d of defaults) {
    await createHabit(d, userId);
  }
}

// ─── Clear all stores (on sign-out) ────────────────────────────────

export async function clearAllStores(): Promise<void> {
  const db = await getDB();
  const storeNames = [
    'habits', 'habitLogs', 'journal', 'transactions',
    'people', 'splitShares', 'ledgerEntries', 'syncMeta'
  ];
  const tx = db.transaction(storeNames, 'readwrite');
  await Promise.all(storeNames.map(name => tx.objectStore(name).clear()));
  await tx.done;
}

// ─── Export / Import ───────────────────────────────────────────────

export async function exportAllData(): Promise<string> {
  const db = await getDB();
  const storeNames = [
    'habits', 'habitLogs', 'journal', 'transactions',
    'people', 'splitShares', 'ledgerEntries'
  ];
  const data: Record<string, unknown[]> = {};
  for (const name of storeNames) {
    data[name] = await db.getAll(name);
  }
  return JSON.stringify({
    schemaVersion: DB_VERSION,
    exportedAt: getNowISO(),
    data,
  }, null, 2);
}

export async function importAllData(jsonStr: string): Promise<void> {
  const parsed = JSON.parse(jsonStr);
  if (!parsed.schemaVersion || !parsed.data) {
    throw new Error('Invalid backup file format');
  }
  if (parsed.schemaVersion > DB_VERSION) {
    throw new Error(
      `Backup is from a newer version (v${parsed.schemaVersion}). ` +
      `Update the app first (current: v${DB_VERSION}).`
    );
  }

  const db = await getDB();
  const storeNames = Object.keys(parsed.data);
  const tx = db.transaction(storeNames, 'readwrite');

  for (const name of storeNames) {
    const store = tx.objectStore(name);
    await store.clear();
    for (const record of parsed.data[name]) {
      await store.put(record);
    }
  }

  await tx.done;
}

// ─── Helpers for sync engine ───────────────────────────────────────

export async function getPendingRecords(storeName: string): Promise<unknown[]> {
  const db = await getDB();
  const all = await db.getAll(storeName);
  return all.filter((r: any) => r._pendingSync === true);
}

export async function clearPendingFlag(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await getDB();
  const record = await db.get(storeName, key);
  if (record) {
    delete record._pendingSync;
    await db.put(storeName, record);
  }
}

export async function putRecordFromServer(storeName: string, record: any): Promise<void> {
  const db = await getDB();
  const keyPath = db.transaction(storeName).store.keyPath;
  let key: IDBValidKey;

  if (Array.isArray(keyPath)) {
    key = keyPath.map(k => record[k]) as IDBValidKey;
  } else {
    key = record[keyPath as string];
  }

  const existing = await db.get(storeName, key);

  // Bug fix #1: don't overwrite records with pending local edits
  // unless the server version is genuinely newer
  if (existing && existing._pendingSync) {
    const serverTime = new Date(record.updated_at).getTime();
    const localTime = new Date(existing.updated_at).getTime();
    if (serverTime <= localTime) {
      return; // local edit wins — it's newer and will be pushed
    }
  }

  // Write server record (without _pendingSync flag)
  const { _pendingSync, ...cleanRecord } = record;
  await db.put(storeName, cleanRecord);
}

// ─── Streaks calculation ───────────────────────────────────────────

export async function getHabitStreak(habit: Habit): Promise<number> {
  const db = await getDB();
  const range = IDBKeyRange.bound([habit.id, ''], [habit.id, '\uffff']);
  const allLogs = await db.getAll('habitLogs', range);
  
  // Filter out deleted and sort by date descending
  const logs = allLogs
    .filter((l: HabitLog) => !l.deleted_at)
    .sort((a, b) => b.date.localeCompare(a.date));
    
  const isCompleted = (value: number) => {
    if (habit.type === 'boolean') return value === 1;
    return habit.target ? value >= habit.target : value > 0;
  };
  
  const todayStr = getLocalDateString();
  const yesterdayStr = getPrevDay(todayStr);
  
  // Find logs map for quick check
  const logMap = new Map<string, number>();
  for (const log of logs) {
    logMap.set(log.date, log.value);
  }
  
  let currentStreak = 0;
  let checkDate = todayStr;
  
  // If not completed today and not completed yesterday, streak is 0
  const completedToday = isCompleted(logMap.get(todayStr) || 0);
  const completedYesterday = isCompleted(logMap.get(yesterdayStr) || 0);
  
  if (!completedToday && !completedYesterday) {
    return 0;
  }
  
  // Start from today if completed today, else start from yesterday
  if (completedToday) {
    checkDate = todayStr;
  } else {
    checkDate = yesterdayStr;
  }
  
  while (true) {
    const val = logMap.get(checkDate) || 0;
    if (isCompleted(val)) {
      currentStreak++;
      checkDate = getPrevDay(checkDate);
    } else {
      break;
    }
  }
  
  return currentStreak;
}

