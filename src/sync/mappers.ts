/**
 * camelCase ↔ snake_case mapping for sync.
 *
 * IndexedDB uses JS conventions (habitId, amountOwedToYou).
 * Postgres uses SQL conventions (habit_id, amount_owed_to_you).
 * Without this, supabase.from('table').upsert(record) will either reject
 * with "unknown column" or insert nulls.
 *
 * Per-table, explicit, testable — not a generic key-converter that could mismap.
 */

// ─── Fields to strip before push (local-only) ─────────────────────

const LOCAL_ONLY_FIELDS = ['_pendingSync'];

function stripLocalFields(obj: Record<string, any>): Record<string, any> {
  const result = { ...obj };
  for (const field of LOCAL_ONLY_FIELDS) {
    delete result[field];
  }
  return result;
}

// ─── Per-table mapping ─────────────────────────────────────────────
// Explicit per table so we catch mismatches early.
// Each table lists its IDB field names → Supabase column names.

const TABLE_MAPPINGS: Record<string, Record<string, string>> = {
  habits: {
    id: 'id',
    user_id: 'user_id',
    name: 'name',
    type: 'type',
    target: 'target',
    unit: 'unit',
    archived: 'archived',
    createdAt: 'created_at',
    updated_at: 'updated_at',
    deleted_at: 'deleted_at',
  },
  habitLogs: {
    habitId: 'habit_id',
    date: 'date',
    user_id: 'user_id',
    value: 'value',
    updated_at: 'updated_at',
    deleted_at: 'deleted_at',
  },
  journal: {
    date: 'date',
    user_id: 'user_id',
    text: 'text',
    mood: 'mood',
    updated_at: 'updated_at',
    deleted_at: 'deleted_at',
  },
  transactions: {
    id: 'id',
    user_id: 'user_id',
    date: 'date',
    amount: 'amount',
    type: 'type',
    category: 'category',
    note: 'note',
    updated_at: 'updated_at',
    deleted_at: 'deleted_at',
  },
  people: {
    id: 'id',
    user_id: 'user_id',
    name: 'name',
    archived: 'archived',
    updated_at: 'updated_at',
    deleted_at: 'deleted_at',
  },
  splitShares: {
    id: 'id',
    user_id: 'user_id',
    transactionId: 'transaction_id',
    personId: 'person_id',
    amountOwedToYou: 'amount_owed_to_you',
    settled: 'settled',
    updated_at: 'updated_at',
    deleted_at: 'deleted_at',
  },
  ledgerEntries: {
    id: 'id',
    user_id: 'user_id',
    personId: 'person_id',
    amount: 'amount',
    direction: 'direction',
    date: 'date',
    note: 'note',
    settled: 'settled',
    updated_at: 'updated_at',
    deleted_at: 'deleted_at',
  },
};

// Build reverse mappings (snake_case → camelCase)
const REVERSE_MAPPINGS: Record<string, Record<string, string>> = {};
for (const [table, mapping] of Object.entries(TABLE_MAPPINGS)) {
  REVERSE_MAPPINGS[table] = {};
  for (const [camel, snake] of Object.entries(mapping)) {
    REVERSE_MAPPINGS[table][snake] = camel;
  }
}

// ─── IDB store name → Supabase table name ─────────────────────────

export const STORE_TO_TABLE: Record<string, string> = {
  habits: 'habits',
  habitLogs: 'habit_logs',
  journal: 'journal_entries',
  transactions: 'transactions',
  people: 'people',
  splitShares: 'split_shares',
  ledgerEntries: 'ledger_entries',
};

export const TABLE_TO_STORE: Record<string, string> = {};
for (const [store, table] of Object.entries(STORE_TO_TABLE)) {
  TABLE_TO_STORE[table] = store;
}

// ─── Public API ────────────────────────────────────────────────────

/** Convert a local IDB record to a Supabase row (camelCase → snake_case) */
export function toSupabaseRow(storeName: string, localRecord: Record<string, any>): Record<string, any> {
  const mapping = TABLE_MAPPINGS[storeName];
  if (!mapping) {
    throw new Error(`No mapping defined for store: ${storeName}`);
  }

  const cleaned = stripLocalFields(localRecord);
  const result: Record<string, any> = {};

  for (const [camelKey, value] of Object.entries(cleaned)) {
    const snakeKey = mapping[camelKey];
    if (snakeKey !== undefined) {
      result[snakeKey] = value;
    }
    // Fields not in the mapping are silently dropped (e.g. any future local-only fields)
  }

  return result;
}

/** Convert a Supabase row to a local IDB record (snake_case → camelCase) */
export function fromSupabaseRow(storeName: string, serverRow: Record<string, any>): Record<string, any> {
  const mapping = REVERSE_MAPPINGS[storeName];
  if (!mapping) {
    throw new Error(`No reverse mapping defined for store: ${storeName}`);
  }

  const result: Record<string, any> = {};

  for (const [snakeKey, value] of Object.entries(serverRow)) {
    const camelKey = mapping[snakeKey];
    if (camelKey !== undefined) {
      result[camelKey] = value;
    }
  }

  return result;
}

/**
 * FK dependency tiers for push ordering.
 * Tier 1 pushed first, then tier 2, then tier 3.
 * This prevents FK violations when syncing records created offline.
 */
export const PUSH_TIERS: string[][] = [
  ['people', 'habits'],                    // Tier 1: no FK deps
  ['transactions', 'habitLogs', 'journal'], // Tier 2: depends on Tier 1
  ['splitShares', 'ledgerEntries'],         // Tier 3: depends on Tier 1 + 2
];

/** All syncable store names (excludes syncMeta which is local-only) */
export const ALL_SYNCABLE_STORES = PUSH_TIERS.flat();
