/**
 * ManageHabits — add, edit, archive habits.
 * Archive = soft delete (keeps historical data).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllHabits, createHabit, putHabit, archiveHabit } from '../db';
import { useUserId } from '../contexts/AuthContext';
import { syncNow } from '../sync/engine';
import type { Habit } from '../types';

export default function ManageHabits() {
  const userId = useUserId();
  const navigate = useNavigate();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'boolean' | 'count'>('boolean');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');

  const loadHabits = useCallback(async () => {
    setHabits(await getAllHabits());
  }, []);

  useEffect(() => { loadHabits(); }, [loadHabits]);

  const resetForm = () => {
    setName(''); setType('boolean'); setTarget(''); setUnit('');
    setEditingId(null); setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingId) {
      const habit = habits.find(h => h.id === editingId);
      if (habit) {
        await putHabit({
          ...habit,
          name: name.trim(),
          type,
          target: type === 'count' ? parseInt(target) || undefined : undefined,
          unit: type === 'count' ? unit.trim() || undefined : undefined,
        });
      }
    } else {
      await createHabit({
        name: name.trim(),
        type,
        target: type === 'count' ? parseInt(target) || undefined : undefined,
        unit: type === 'count' ? unit.trim() || undefined : undefined,
      }, userId);
    }

    resetForm();
    await loadHabits();
    syncNow();
  };

  const startEdit = (habit: Habit) => {
    setEditingId(habit.id);
    setName(habit.name);
    setType(habit.type);
    setTarget(habit.target?.toString() || '');
    setUnit(habit.unit || '');
    setShowForm(true);
  };

  const handleArchive = async (id: string) => {
    await archiveHabit(id);
    await loadHabits();
    syncNow();
  };



  return (
    <div className="page animate-fade-in">
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '10px',
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            color: 'var(--color-text-secondary)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '8px 16px',
            borderRadius: '10px',
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
          ← Back
        </button>
        <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>Manage Habits</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className={`btn-premium ${showForm ? 'btn-premium-secondary' : 'btn-premium-habit'}`}
          style={{ padding: '8px 16px', fontSize: '13px', minHeight: '36px', borderRadius: '10px' }}
        >
          {showForm ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="glass-card glass-card-habit animate-fade-in" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '13px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '8px', fontWeight: 600, paddingLeft: '2px' }}>
              Habit name
            </label>
            <input 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="e.g. Drink water, Workout, Meditate" 
              className="glass-input" 
              autoFocus 
            />
          </div>

          <div>
            <label style={{ fontSize: '13px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '8px', fontWeight: 600, paddingLeft: '2px' }}>
              Goal Type
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['boolean', 'count'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  style={{
                    flex: 1, 
                    padding: '12px', 
                    borderRadius: '12px',
                    border: `1.5px solid ${type === t ? 'var(--color-habit)' : 'rgba(255, 255, 255, 0.06)'}`,
                    backgroundColor: type === t ? 'var(--color-habit-soft)' : 'rgba(255, 255, 255, 0.02)',
                    color: type === t ? 'var(--color-habit)' : 'var(--color-text-secondary)',
                    cursor: 'pointer', 
                    fontSize: '14px', 
                    fontWeight: 600,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {t === 'boolean' ? 'Yes / No' : 'Count / Target'}
                </button>
              ))}
            </div>
          </div>

          {type === 'count' && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '13px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '8px', fontWeight: 600, paddingLeft: '2px' }}>
                  Target
                </label>
                <input 
                  type="number" 
                  min="1" 
                  value={target} 
                  onChange={e => setTarget(e.target.value)} 
                  placeholder="e.g. 8" 
                  className="glass-input" 
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '13px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '8px', fontWeight: 600, paddingLeft: '2px' }}>
                  Unit
                </label>
                <input 
                  value={unit} 
                  onChange={e => setUnit(e.target.value)} 
                  placeholder="e.g. glasses, mins" 
                  className="glass-input" 
                />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button 
              type="button" 
              onClick={resetForm} 
              className="btn-premium btn-premium-secondary"
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-premium btn-premium-habit" 
              style={{ flex: 1 }}
            >
              {editingId ? 'Save changes' : 'Create habit'}
            </button>
          </div>
        </form>
      )}

      {/* Habit list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {habits.map(habit => (
          <div 
            key={habit.id} 
            className="glass-card glass-card-habit" 
            style={{
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              opacity: habit.archived ? 0.5 : 1,
            }}
          >
            <div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.1px' }}>{habit.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px', fontWeight: 500 }}>
                {habit.type === 'boolean' ? 'Yes/No' : `Count · Target: ${habit.target || '—'} ${habit.unit || ''}`}
                {habit.archived && ' · Archived'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {!habit.archived && (
                <>
                  <button 
                    onClick={() => startEdit(habit)} 
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)', 
                      border: '1px solid rgba(255, 255, 255, 0.05)', 
                      borderRadius: '8px',
                      color: 'var(--color-text-secondary)',
                      cursor: 'pointer', 
                      fontSize: '12px', 
                      fontWeight: 600,
                      padding: '6px 12px',
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
                    Edit
                  </button>
                  <button 
                    onClick={() => handleArchive(habit.id)} 
                    style={{
                      background: 'rgba(244, 63, 94, 0.05)', 
                      border: '1px solid rgba(244, 63, 94, 0.1)', 
                      borderRadius: '8px',
                      color: 'var(--color-people)',
                      cursor: 'pointer', 
                      fontSize: '12px', 
                      fontWeight: 600,
                      padding: '6px 12px',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(244, 63, 94, 0.12)';
                      e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(244, 63, 94, 0.05)';
                      e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.1)';
                    }}
                  >
                    Archive
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
