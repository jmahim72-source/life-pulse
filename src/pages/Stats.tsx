/**
 * Stats screen — habit trends, finance trends, split-aware.
 * Lazy-loaded — Recharts bundle only fetched on navigate.
 */

import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getLastNDays } from '../lib/dates';
import { getActiveHabits, getHabitLogsForRange, getAllTransactions, getSplitSharesForTransaction } from '../db';

type Period = 7 | 30 | 90;

export default function Stats() {
  const [period, setPeriod] = useState<Period>(7);
  const [habitData, setHabitData] = useState<{ name: string; data: { date: string; value: number; target: number }[] }[]>([]);
  const [financeData, setFinanceData] = useState<{ month: string; income: number; expense: number; netExpense: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);

    // Habit data
    const habits = await getActiveHabits();
    const dates = getLastNDays(period);
    const hData = [];

    for (const habit of habits) {
      const logs = await getHabitLogsForRange(habit.id, dates);
      const logMap = new Map(logs.map(l => [l.date, l.value]));
      const data = dates.map(d => ({
        date: d.slice(5), // 'MM-DD'
        value: logMap.get(d) ?? 0,
        target: habit.type === 'boolean' ? 1 : (habit.target || 1),
      }));
      hData.push({ name: habit.name, data });
    }
    setHabitData(hData);

    // Finance data — last 6 months
    const allTx = await getAllTransactions();
    const monthMap = new Map<string, { income: number; expense: number; netExpense: number }>();

    for (const tx of allTx) {
      const m = tx.date.slice(0, 7);
      if (!monthMap.has(m)) monthMap.set(m, { income: 0, expense: 0, netExpense: 0 });
      const entry = monthMap.get(m)!;
      if (tx.type === 'income') {
        entry.income += tx.amount;
      } else {
        entry.expense += tx.amount;
        // Net expense = expense minus splits owed to you
        const splits = await getSplitSharesForTransaction(tx.id);
        const owedBack = splits.filter(s => !s.settled).reduce((s, e) => s + e.amountOwedToYou, 0);
        entry.netExpense += (tx.amount - owedBack);
      }
    }

    const months = Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([month, data]) => ({
        month: month.slice(2), // 'YY-MM'
        ...data,
      }));
    setFinanceData(months);
    setLoading(false);
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  const [showNetCost, setShowNetCost] = useState(true);

  if (loading) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ color: 'var(--color-text-muted)' }}>Loading stats…</div>
      </div>
    );
  }

  return (
    <div className="page animate-fade-in">
      <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.3px' }}>Stats</h1>

      {/* Period toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {([7, 30, 90] as Period[]).map(p => (
          <button 
            key={p} 
            onClick={() => setPeriod(p)} 
            style={{
              flex: 1, 
              padding: '11px', 
              borderRadius: '12px', 
              fontSize: '13px', 
              fontWeight: 600,
              border: `1.5px solid ${period === p ? 'var(--color-stats)' : 'rgba(255, 255, 255, 0.06)'}`,
              backgroundColor: period === p ? 'var(--color-stats-soft)' : 'rgba(255, 255, 255, 0.02)',
              color: period === p ? 'var(--color-stats)' : 'var(--color-text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              boxShadow: period === p ? '0 0 12px var(--color-stats-glow)' : 'none',
            }}
          >
            {p} days
          </button>
        ))}
      </div>

      {/* Habit trends */}
      <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-habit)', margin: '12px 0 12px', textTransform: 'uppercase', letterSpacing: '0.5px', paddingLeft: '4px' }}>
        Habit Trends
      </h2>
      {habitData.length === 0 ? (
        <div className="glass-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)', marginBottom: '24px' }}>
          No habit data logged yet.
        </div>
      ) : (
        habitData.map(habit => (
          <div key={habit.name} className="glass-card glass-card-habit" style={{ padding: '18px 20px', marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: 650, marginBottom: '14px', color: 'var(--color-text-primary)' }}>{habit.name}</div>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={habit.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--color-text-secondary)' }} interval={period > 7 ? Math.floor(period / 7) : 0} />
                <YAxis hide domain={[0, 'auto']} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', fontSize: '11px' }}
                  labelStyle={{ color: 'var(--color-text-secondary)' }}
                />
                <Bar dataKey="value" fill="var(--color-habit)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {/* Completion rate */}
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'right', marginTop: '8px' }}>
              {Math.round((habit.data.filter(d => d.value >= d.target).length / habit.data.length) * 100)}% completion rate
            </div>
          </div>
        ))
      )}

      {/* Finance trends */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '24px 0 12px', paddingLeft: '4px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-finance)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Finance Trends
        </h2>
        <button 
          onClick={() => setShowNetCost(!showNetCost)} 
          style={{
            background: 'rgba(255, 255, 255, 0.03)', 
            border: '1px solid rgba(255, 255, 255, 0.05)', 
            borderRadius: '8px',
            padding: '4px 10px', 
            fontSize: '11px', 
            fontWeight: 600,
            color: 'var(--color-text-secondary)', 
            cursor: 'pointer',
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
          {showNetCost ? 'Net cost' : 'Cash flow'}
        </button>
      </div>
      {financeData.length === 0 ? (
        <div className="glass-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          No financial logs yet.
        </div>
      ) : (
        <div className="glass-card glass-card-finance" style={{ padding: '18px 20px' }}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={financeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--color-text-secondary)' }} width={38} />
              <Tooltip
                contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', fontSize: '11px' }}
                formatter={(value: any) => [`₹${Number(value).toLocaleString()}`, '']}
              />
              <Bar dataKey="income" fill="var(--color-habit)" radius={[4, 4, 0, 0]} name="Income" />
              <Bar dataKey={showNetCost ? 'netExpense' : 'expense'} fill="var(--color-people)" radius={[4, 4, 0, 0]} name={showNetCost ? 'Net Expense' : 'Expense'} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
