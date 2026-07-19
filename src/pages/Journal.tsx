/**
 * Journal screen — one entry per day, optional mood, calendar browse.
 * No AI features, no prompts — just capture.
 */

import { useState, useEffect, useCallback } from 'react';
import { getLocalDateString, formatDateDisplay, isDateToday, getNextDay, getPrevDay } from '../lib/dates';
import { getJournalEntry, putJournalEntry, getAllJournalEntries } from '../db';
import { useUserId } from '../contexts/AuthContext';
import { syncNow } from '../sync/engine';
import type { JournalEntry } from '../types';

const MOODS = [
  { value: 1 as const, emoji: '😞', label: 'Rough' },
  { value: 2 as const, emoji: '😐', label: 'Meh' },
  { value: 3 as const, emoji: '🙂', label: 'Okay' },
  { value: 4 as const, emoji: '😊', label: 'Good' },
  { value: 5 as const, emoji: '🤩', label: 'Great' },
];

export default function Journal() {
  const userId = useUserId();
  const [date, setDate] = useState(getLocalDateString());
  const [text, setText] = useState('');
  const [mood, setMood] = useState<1 | 2 | 3 | 4 | 5 | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [showList, setShowList] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [hasExisting, setHasExisting] = useState(false);

  const loadEntry = useCallback(async () => {
    const entry = await getJournalEntry(date);
    if (entry) {
      setText(entry.text);
      setMood(entry.mood);
      setHasExisting(true);
    } else {
      setText('');
      setMood(undefined);
      setHasExisting(false);
    }
    setSaved(false);
  }, [date]);

  useEffect(() => { loadEntry(); }, [loadEntry]);

  const handleSave = async () => {
    await putJournalEntry(date, text, mood, userId);
    setSaved(true);
    setHasExisting(true);
    syncNow();
    setTimeout(() => setSaved(false), 2000);
  };

  const loadAllEntries = async () => {
    setEntries(await getAllJournalEntries());
    setShowList(true);
  };

  return (
    <div className="page animate-fade-in">
      {showList ? (
        /* Past entries list */
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Past Entries</h1>
            <button
              onClick={() => setShowList(false)}
              className="btn-premium btn-premium-secondary"
              style={{ padding: '8px 16px', fontSize: '13px', minHeight: '36px' }}
            >
              Write today →
            </button>
          </div>
          {entries.length === 0 ? (
            <div className="glass-card animate-float" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📝</div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 8px' }}>No reflections yet</h3>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 }}>
                Write your first journal entry to start reflecting on your journey.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {entries.map((entry, i) => (
                <button
                  key={entry.date}
                  onClick={() => { setDate(entry.date); setShowList(false); }}
                  className="glass-card glass-card-journal stagger-item"
                  style={{
                    animationDelay: `${i * 50}ms`,
                    padding: '16px 20px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    width: '100%',
                    display: 'block',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-journal)' }}>
                      {formatDateDisplay(entry.date)}
                    </span>
                    {entry.mood && (
                      <span style={{ fontSize: '20px', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}>
                        {MOODS.find(m => m.value === entry.mood)?.emoji}
                      </span>
                    )}
                  </div>
                  <p style={{
                    fontSize: '14px',
                    color: 'var(--color-text-secondary)',
                    margin: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.5,
                  }}>
                    {entry.text || <em style={{ color: 'var(--color-text-muted)' }}>(empty entry)</em>}
                  </p>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Editor view */
        <>
          {/* Date nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
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
            >
              ‹
            </button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.3px' }}>
                {isDateToday(date) ? 'Today' : formatDateDisplay(date)}
              </div>
            </div>
            <button
              onClick={() => { if (!isDateToday(date)) setDate(getNextDay(date)); }}
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
            >
              ›
            </button>
          </div>

          {/* Mood selector */}
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px', fontWeight: 500, paddingLeft: '4px' }}>
              How is your day going?
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              {MOODS.map(m => (
                <button
                  key={m.value}
                  onClick={() => setMood(mood === m.value ? undefined : m.value)}
                  className={`mood-btn ${mood === m.value ? 'selected' : ''}`}
                  title={m.label}
                >
                  {m.emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Text area */}
          <div className="glass-card glass-card-journal" style={{ padding: '4px', overflow: 'hidden' }}>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setSaved(false); }}
              placeholder="What is on your mind today? Write down thoughts, events, reflections..."
              style={{
                width: '100%',
                minHeight: '260px',
                padding: '18px',
                border: 'none',
                backgroundColor: 'transparent',
                color: 'var(--color-text-primary)',
                fontSize: '15px',
                lineHeight: 1.7,
                resize: 'none',
                outline: 'none',
                fontFamily: 'var(--font-sans)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={handleSave}
              className="btn-premium btn-premium-journal"
              style={{
                flex: 1,
                background: saved ? 'var(--color-habit-soft)' : undefined,
                color: saved ? 'var(--color-habit)' : undefined,
                borderColor: saved ? 'var(--color-habit)' : undefined,
                border: saved ? '1px solid' : undefined,
              }}
            >
              {saved ? '✓ Saved' : hasExisting ? 'Update reflection' : 'Save entry'}
            </button>
            <button
              onClick={loadAllEntries}
              className="btn-premium btn-premium-secondary"
              style={{ padding: '12px 20px' }}
            >
              Browse entries
            </button>
          </div>
        </>
      )}
    </div>
  );
}
