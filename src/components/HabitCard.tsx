/**
 * HabitCard — renders a single habit with tap interactions.
 * Boolean: single tap toggles.
 * Count: tap "+1" increments, tap number to set directly.
 */

import React, { useState } from 'react';
import type { Habit, HabitLog } from '../types';

interface Props {
  habit: Habit;
  log?: HabitLog;
  streak?: number;
  onToggle: () => void;
  onIncrement: () => void;
  onSetValue: (value: number) => void;
}

export default function HabitCard({ habit, log, streak, onToggle, onIncrement, onSetValue }: Props) {
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const value = log?.value ?? 0;
  const isBoolean = habit.type === 'boolean';
  const isDone = isBoolean ? value === 1 : (habit.target ? value >= habit.target : false);
  const progress = habit.target ? Math.min(value / habit.target, 1) : 0;

  const handleDirectSet = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(inputValue, 10);
    if (!isNaN(num) && num >= 0) {
      onSetValue(num);
      setShowInput(false);
      setInputValue('');
    }
  };

  return (
    <div
      className="glass-card glass-card-habit"
      style={{
        padding: '18px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        cursor: isBoolean ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: isDone 
          ? '0 8px 24px -8px rgba(16, 185, 129, 0.2), 0 4px 12px -4px rgba(0, 0, 0, 0.2)' 
          : '0 8px 30px -10px rgba(0, 0, 0, 0.3)',
      }}
      onClick={isBoolean ? onToggle : undefined}
    >
      {/* Background glow when done */}
      {isDone && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.05) 0%, transparent 100%)',
          zIndex: 0,
          pointerEvents: 'none',
        }} />
      )}

      {/* Completion indicator */}
      {isBoolean ? (
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            border: `2px solid ${isDone ? 'var(--color-habit)' : 'rgba(255, 255, 255, 0.15)'}`,
            backgroundColor: isDone ? 'var(--color-habit)' : 'rgba(255, 255, 255, 0.02)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            flexShrink: 0,
            zIndex: 1,
            boxShadow: isDone ? '0 0 12px var(--color-habit-glow)' : 'none',
          }}
        >
          {isDone && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </div>
      ) : (
        /* Count-type progress ring */
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: isDone 
              ? 'linear-gradient(135deg, var(--color-habit-soft), rgba(16, 185, 129, 0.05))' 
              : 'linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.01))',
            border: `1px solid ${isDone ? 'var(--color-habit)' : 'rgba(255, 255, 255, 0.08)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            position: 'relative',
            zIndex: 1,
            boxShadow: isDone ? '0 0 10px rgba(16, 185, 129, 0.15)' : 'none',
          }}
        >
          <span style={{ fontSize: '15px', fontWeight: 800, color: isDone ? 'var(--color-habit)' : 'var(--color-text-primary)' }}>
            {value}
          </span>
        </div>
      )}

      {/* Name + info */}
      <div style={{ flex: 1, minWidth: 0, zIndex: 1 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}>
          <span style={{
            fontSize: '16px',
            fontWeight: 600,
            color: isDone ? 'var(--color-habit)' : 'var(--color-text-primary)',
            transition: 'color 0.25s ease',
            letterSpacing: '-0.1px',
          }}>
            {habit.name}
          </span>
          {streak !== undefined && streak > 0 && (
            <span style={{
              fontSize: '11px',
              fontWeight: 750,
              color: '#f59e0b',
              background: 'rgba(245, 158, 11, 0.1)',
              padding: '2px 8px',
              borderRadius: '99px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
            }}>
              🔥 {streak} {streak === 1 ? 'day' : 'days'}
            </span>
          )}
        </div>
        {!isBoolean && habit.target && (
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px', fontWeight: 500 }}>
            {value} <span style={{ color: 'var(--color-text-muted)' }}>/ {habit.target} {habit.unit || ''}</span>
          </div>
        )}
        {/* Progress bar for count type */}
        {!isBoolean && habit.target && (
          <div style={{
            height: '4px',
            borderRadius: '10px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            marginTop: '10px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${progress * 100}%`,
              background: 'linear-gradient(90deg, var(--color-habit) 0%, var(--color-finance) 100%)',
              borderRadius: '10px',
              transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            }} />
          </div>
        )}
      </div>

      {/* Count controls */}
      {!isBoolean && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, zIndex: 1 }}>
          {showInput ? (
            <form onSubmit={handleDirectSet} style={{ display: 'flex', gap: '6px' }}>
              <input
                type="number"
                min="0"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                autoFocus
                className="glass-input"
                style={{
                  width: '60px',
                  padding: '8px',
                  borderRadius: '10px',
                  textAlign: 'center',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
                onBlur={() => setShowInput(false)}
              />
            </form>
          ) : (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setShowInput(true); setInputValue(String(value)); }}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  borderRadius: '10px',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
                aria-label="Set value directly"
              >
                ✎
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onIncrement(); }}
                className="btn-premium btn-premium-habit"
                style={{
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: 700,
                  minHeight: '36px',
                  borderRadius: '10px',
                }}
                aria-label={`Add 1 ${habit.unit || ''}`}
              >
                +1
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
