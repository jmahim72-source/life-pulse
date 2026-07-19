/**
 * Today screen — highest-frequency screen, must be instant.
 * No charts, no heavy deps — just habits and fast-tap interactions.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getLocalDateString, formatDateDisplay, getNextDay, getPrevDay, isDateToday } from '../lib/dates';
import { getActiveHabits, getHabitLogsForDate, incrementHabitLog, setHabitLog, seedDefaultHabits, getHabitStreak } from '../db';
import { useUserId } from '../contexts/AuthContext';
import { syncNow } from '../sync/engine';
import type { Habit, HabitLog } from '../types';
import HabitCard from '../components/HabitCard';

export default function Today() {
  const userId = useUserId();
  const [date, setDate] = useState(getLocalDateString());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<Map<string, HabitLog>>(new Map());
  const [streaks, setStreaks] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    // Seed defaults on first launch
    await seedDefaultHabits(userId);

    const activeHabits = await getActiveHabits();
    const dayLogs = await getHabitLogsForDate(date);

    const logMap = new Map<string, HabitLog>();
    for (const log of dayLogs) {
      logMap.set(log.habitId, log);
    }

    const streakMap = new Map<string, number>();
    for (const h of activeHabits) {
      const streak = await getHabitStreak(h);
      streakMap.set(h.id, streak);
    }

    setHabits(activeHabits);
    setLogs(logMap);
    setStreaks(streakMap);
    setLoading(false);
  }, [date, userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggle = useCallback(async (habit: Habit) => {
    const current = logs.get(habit.id);
    const newValue = current?.value ? 0 : 1;
    await setHabitLog(habit.id, date, newValue, userId);
    await loadData();
    syncNow(); // fire-and-forget
  }, [logs, date, userId, loadData]);

  const handleIncrement = useCallback(async (habit: Habit) => {
    await incrementHabitLog(habit.id, date, userId);
    await loadData();
    syncNow();
  }, [date, userId, loadData]);

  const handleSetValue = useCallback(async (habit: Habit, value: number) => {
    await setHabitLog(habit.id, date, value, userId);
    await loadData();
    syncNow();
  }, [date, userId, loadData]);

  return (
    <div className="page animate-fade-in">
      {/* Date Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '10px',
        padding: '0 8px',
      }}>
        <button
          onClick={() => setDate(getPrevDay(date))}
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            color: 'var(--color-text-secondary)',
            fontSize: '22px',
            cursor: 'pointer',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
          aria-label="Previous day"
        >
          ‹
        </button>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.3px' }}>
            {isDateToday(date) ? 'Today' : formatDateDisplay(date)}
          </div>
          {!isDateToday(date) && (
            <button
              onClick={() => setDate(getLocalDateString())}
              style={{
                background: 'var(--color-habit-soft)',
                border: 'none',
                color: 'var(--color-habit)',
                fontSize: '11px',
                cursor: 'pointer',
                marginTop: '6px',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: '99px',
                transition: 'transform 0.2s ease',
              }}
            >
              Back to today
            </button>
          )}
        </div>

        <button
          onClick={() => {
            if (!isDateToday(date)) setDate(getNextDay(date));
          }}
          disabled={isDateToday(date)}
          style={{
            background: isDateToday(date) ? 'transparent' : 'rgba(255, 255, 255, 0.03)',
            border: isDateToday(date) ? '1px solid transparent' : '1px solid rgba(255, 255, 255, 0.05)',
            color: isDateToday(date) ? 'rgba(255, 255, 255, 0.1)' : 'var(--color-text-secondary)',
            fontSize: '22px',
            cursor: isDateToday(date) ? 'default' : 'pointer',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            if (!isDateToday(date)) {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.color = 'var(--color-text-primary)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isDateToday(date)) {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.color = 'var(--color-text-secondary)';
            }
          }}
          aria-label="Next day"
        >
          ›
        </button>
      </div>

      {/* Habit List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-text-muted)', fontSize: '14px' }}>
          Loading your day…
        </div>
      ) : habits.length === 0 ? (
        <div className="glass-card animate-float" style={{
          textAlign: 'center',
          padding: '48px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}>
          <div style={{ fontSize: '48px' }}>🌱</div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>All clear for today</h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
            You haven't set up any habits yet. Start tracking your routines to build a better version of yourself.
          </p>
          <Link
            to="/manage-habits"
            className="btn-premium btn-premium-habit"
            style={{
              textDecoration: 'none',
              marginTop: '8px',
            }}
          >
            Create first habit
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {habits.map((habit, i) => (
            <div key={habit.id} className="stagger-item" style={{ animationDelay: `${i * 60}ms` }}>
              <HabitCard
                habit={habit}
                log={logs.get(habit.id)}
                streak={streaks.get(habit.id)}
                onToggle={() => handleToggle(habit)}
                onIncrement={() => handleIncrement(habit)}
                onSetValue={(v) => handleSetValue(habit, v)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Manage link */}
      {habits.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <Link
            to="/manage-habits"
            style={{
              color: 'var(--color-text-muted)',
              fontSize: '13px',
              textDecoration: 'none',
              fontWeight: 600,
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.04)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-text-secondary)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-muted)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
            }}
          >
            Manage routines →
          </Link>
        </div>
      )}
    </div>
  );
}
