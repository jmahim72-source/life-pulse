-- LifePulse — Initial Schema
-- Applied via: supabase db push
-- Version: 1

-- ─── habits ─────────────────────────────────────────────────────────
create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  name text not null,
  type text not null check (type in ('boolean', 'count')),
  target integer,
  unit text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table habits enable row level security;
create policy "owner" on habits for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── habit_logs (compound natural PK) ──────────────────────────────
create table habit_logs (
  habit_id uuid not null references habits(id),
  date date not null,
  user_id uuid references auth.users not null default auth.uid(),
  value integer not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (habit_id, date)
);
alter table habit_logs enable row level security;
create policy "owner" on habit_logs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── journal_entries (date as natural PK per user) ─────────────────
create table journal_entries (
  date date not null,
  user_id uuid references auth.users not null default auth.uid(),
  text text not null default '',
  mood smallint check (mood between 1 and 5),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, date)
);
alter table journal_entries enable row level security;
create policy "owner" on journal_entries for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── transactions ──────────────────────────────────────────────────
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  date date not null,
  amount numeric(12,2) not null,
  type text not null check (type in ('income', 'expense')),
  category text not null,
  note text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table transactions enable row level security;
create policy "owner" on transactions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Index for date-range queries in monthly views
create index idx_transactions_date on transactions(user_id, date);

-- ─── people ────────────────────────────────────────────────────────
create table people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  name text not null,
  archived boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table people enable row level security;
create policy "owner" on people for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── split_shares ──────────────────────────────────────────────────
create table split_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  transaction_id uuid not null references transactions(id),
  person_id uuid not null references people(id),
  amount_owed_to_you numeric(12,2) not null,
  settled boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table split_shares enable row level security;
create policy "owner" on split_shares for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── ledger_entries ────────────────────────────────────────────────
create table ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null default auth.uid(),
  person_id uuid not null references people(id),
  amount numeric(12,2) not null,
  direction text not null check (direction in ('they_owe_me', 'i_owe_them')),
  date date not null,
  note text,
  settled boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table ledger_entries enable row level security;
create policy "owner" on ledger_entries for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
