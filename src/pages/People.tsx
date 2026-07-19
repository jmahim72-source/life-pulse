/**
 * People screen — splits & ledger.
 * Net running balance per person, settle up, quick-add IOU.
 * Private, one-sided record — no visibility to the other person.
 */

import { useState, useEffect, useCallback } from 'react';
import { getLocalDateString } from '../lib/dates';
import { getAllPeople, createPerson, getSplitSharesForPerson, getLedgerEntriesForPerson, createLedgerEntry, settleSplitShare, settleLedgerEntry } from '../db';
import { useUserId } from '../contexts/AuthContext';
import { syncNow } from '../sync/engine';
import type { Person, SplitShare, LedgerEntry } from '../types';

function calcBalance(splits: SplitShare[], ledger: LedgerEntry[]): number {
  const splitOwed = splits.filter(s => !s.settled).reduce((s, e) => s + e.amountOwedToYou, 0);
  const theyOwe = ledger.filter(e => !e.settled && e.direction === 'they_owe_me').reduce((s, e) => s + e.amount, 0);
  const iOwe = ledger.filter(e => !e.settled && e.direction === 'i_owe_them').reduce((s, e) => s + e.amount, 0);
  return splitOwed + theyOwe - iOwe;
}

export default function People() {
  const userId = useUserId();
  const [people, setPeople] = useState<Person[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [selected, setSelected] = useState<Person | null>(null);
  const [splits, setSplits] = useState<SplitShare[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newName, setNewName] = useState('');
  const [showIOU, setShowIOU] = useState(false);
  const [iouAmount, setIouAmount] = useState('');
  const [iouDir, setIouDir] = useState<'they_owe_me' | 'i_owe_them'>('they_owe_me');
  const [iouNote, setIouNote] = useState('');

  const loadPeople = useCallback(async () => {
    const all = await getAllPeople();
    const bals = new Map<string, number>();
    for (const p of all) {
      const s = await getSplitSharesForPerson(p.id);
      const l = await getLedgerEntriesForPerson(p.id);
      bals.set(p.id, calcBalance(s, l));
    }
    setPeople(all.filter(p => !p.archived));
    setBalances(bals);
  }, []);

  const loadPersonDetail = useCallback(async (person: Person) => {
    setSplits(await getSplitSharesForPerson(person.id));
    setLedger(await getLedgerEntriesForPerson(person.id));
  }, []);

  useEffect(() => { loadPeople(); }, [loadPeople]);
  useEffect(() => { if (selected) loadPersonDetail(selected); }, [selected, loadPersonDetail]);

  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await createPerson(newName.trim(), userId);
    setNewName('');
    setShowAddPerson(false);
    await loadPeople();
    syncNow();
  };

  const handleAddIOU = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !iouAmount) return;
    const amt = parseFloat(iouAmount);
    if (isNaN(amt) || amt <= 0) return;
    await createLedgerEntry({
      personId: selected.id,
      amount: amt,
      direction: iouDir,
      date: getLocalDateString(),
      note: iouNote.trim() || undefined,
    }, userId);
    setIouAmount('');
    setIouNote('');
    setShowIOU(false);
    await loadPersonDetail(selected);
    await loadPeople();
    syncNow();
  };

  const handleSettle = async (type: 'split' | 'ledger', id: string) => {
    if (type === 'split') await settleSplitShare(id);
    else await settleLedgerEntry(id);
    if (selected) await loadPersonDetail(selected);
    await loadPeople();
    syncNow();
  };



  // ─── Person detail view ──────────────────────────────────────────

  if (selected) {
    const balance = balances.get(selected.id) || 0;
    const allEntries = [
      ...splits.map(s => ({ type: 'split' as const, id: s.id, amount: s.amountOwedToYou, settled: s.settled, date: '', label: 'Split share' })),
      ...ledger.map(e => ({
        type: 'ledger' as const, id: e.id,
        amount: e.direction === 'they_owe_me' ? e.amount : -e.amount,
        settled: e.settled, date: e.date,
        label: e.note || (e.direction === 'they_owe_me' ? 'They owe you' : 'You owe them'),
      })),
    ];

    return (
      <div className="page animate-fade-in">
        <button 
          onClick={() => setSelected(null)} 
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            color: 'var(--color-text-secondary)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '8px 16px',
            borderRadius: '10px',
            alignSelf: 'flex-start',
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

        <div className="glass-card glass-card-people" style={{ padding: '24px', textAlign: 'center' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            background: 'var(--color-people-soft)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
            fontSize: '24px', fontWeight: 800, color: 'var(--color-people)',
            boxShadow: '0 0 15px var(--color-people-soft)',
          }}>
            {selected.name.charAt(0).toUpperCase()}
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.3px' }}>{selected.name}</h2>
          <div style={{
            fontSize: '22px', fontWeight: 800,
            color: balance >= 0 ? 'var(--color-habit)' : 'var(--color-people)',
            letterSpacing: '-0.3px',
          }}>
            {balance >= 0 ? `Owes you ₹${balance.toFixed(2)}` : `You owe ₹${Math.abs(balance).toFixed(2)}`}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={() => setShowIOU(!showIOU)} 
            className={`btn-premium ${showIOU ? 'btn-premium-secondary' : 'btn-premium-people'}`} 
            style={{ flex: 1 }}
          >
            {showIOU ? 'Cancel' : '+ Add IOU / Standalone'}
          </button>
        </div>

        {showIOU && (
          <form onSubmit={handleAddIOU} className="glass-card glass-card-people animate-fade-in" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <input 
              type="number" 
              step="0.01" 
              min="0" 
              value={iouAmount} 
              onChange={e => setIouAmount(e.target.value)}
              placeholder="Amount (₹)" 
              className="glass-input" 
              style={{ fontWeight: 700, fontSize: '18px', textAlign: 'center' }}
              autoFocus 
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['they_owe_me', 'i_owe_them'] as const).map(d => (
                <button 
                  key={d} 
                  type="button" 
                  onClick={() => setIouDir(d)} 
                  style={{
                    flex: 1, 
                    padding: '11px', 
                    borderRadius: '12px', 
                    fontSize: '13px',
                    fontWeight: 600,
                    border: `1.5px solid ${iouDir === d ? 'var(--color-people)' : 'rgba(255, 255, 255, 0.06)'}`,
                    backgroundColor: iouDir === d ? 'var(--color-people-soft)' : 'rgba(255, 255, 255, 0.02)',
                    color: iouDir === d ? 'var(--color-people)' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {d === 'they_owe_me' ? 'I lent' : 'I borrowed'}
                </button>
              ))}
            </div>
            <input 
              value={iouNote} 
              onChange={e => setIouNote(e.target.value)}
              placeholder="Note (optional, e.g. Lunch, cab)" 
              className="glass-input" 
            />
            <button type="submit" className="btn-premium btn-premium-people" style={{ width: '100%' }}>
              Save IOU
            </button>
          </form>
        )}

        {/* History */}
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px', paddingLeft: '4px' }}>History</h3>
          {allEntries.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-muted)', fontSize: '14px' }}>
              No transactions with {selected.name} yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {allEntries.map(entry => (
                <div 
                  key={entry.id} 
                  className="glass-card" 
                  style={{
                    padding: '14px 18px', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    opacity: entry.settled ? 0.55 : 1,
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{entry.label}</div>
                    {entry.date && <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px', fontWeight: 500 }}>{entry.date}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                      fontSize: '15px', 
                      fontWeight: 750,
                      color: entry.amount >= 0 ? 'var(--color-habit)' : 'var(--color-people)',
                    }}>
                      {entry.amount >= 0 ? '+' : ''}₹{Math.abs(entry.amount).toFixed(2)}
                    </span>
                    {!entry.settled && (
                      <button 
                        onClick={() => handleSettle(entry.type, entry.id)} 
                        style={{
                          padding: '6px 12px', 
                          borderRadius: '8px', 
                          fontSize: '12px', 
                          fontWeight: 650,
                          border: '1px solid rgba(16, 185, 129, 0.2)', 
                          background: 'rgba(16, 185, 129, 0.1)',
                          color: 'var(--color-habit)', 
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)'}
                      >
                        Settle
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── People list view ────────────────────────────────────────────

  return (
    <div className="page animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>People</h1>
        <button 
          onClick={() => setShowAddPerson(!showAddPerson)} 
          className={`btn-premium ${showAddPerson ? 'btn-premium-secondary' : 'btn-premium-people'}`}
          style={{ padding: '8px 16px', fontSize: '13px', minHeight: '36px', borderRadius: '10px' }}
        >
          {showAddPerson ? 'Cancel' : '+ Add Person'}
        </button>
      </div>

      {showAddPerson && (
        <form onSubmit={handleAddPerson} className="glass-card glass-card-people animate-fade-in" style={{
          padding: '16px', display: 'flex', gap: '8px',
        }}>
          <input 
            value={newName} 
            onChange={e => setNewName(e.target.value)}
            placeholder="Person's name" 
            className="glass-input"
            style={{ flex: 1 }} 
            autoFocus 
          />
          <button 
            type="submit" 
            className="btn-premium btn-premium-people" 
            style={{ padding: '12px 20px', minHeight: '44px' }}
          >
            Add
          </button>
        </form>
      )}

      {people.length === 0 ? (
        <div className="glass-card animate-float" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 8px' }}>No people yet</h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Add friends, family, or roommates to start tracking shared expenses, split bills, and IOUs.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {people.map((person, i) => {
            const balance = balances.get(person.id) || 0;
            return (
              <button
                key={person.id}
                onClick={() => setSelected(person)}
                className="glass-card glass-card-people stagger-item"
                style={{
                  animationDelay: `${i * 50}ms`,
                  padding: '18px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  cursor: 'pointer',
                  border: 'none',
                  borderLeft: '4px solid var(--color-people)',
                  width: '100%',
                  textAlign: 'left',
                  boxShadow: '0 8px 30px -10px rgba(0, 0, 0, 0.3)',
                }}
              >
                <div style={{
                  width: '42px', height: '42px', borderRadius: '12px',
                  background: 'var(--color-people-soft)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: '18px', fontWeight: 800, color: 'var(--color-people)',
                  flexShrink: 0,
                }}>
                  {person.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.1px' }}>{person.name}</div>
                  <div style={{
                    fontSize: '13px', marginTop: '4px',
                    fontWeight: 600,
                    color: balance === 0 ? 'var(--color-text-muted)' : balance > 0 ? 'var(--color-habit)' : 'var(--color-people)',
                  }}>
                    {balance === 0 ? 'Settled up' :
                     balance > 0 ? `Owes you ₹${balance.toFixed(2)}` :
                     `You owe ₹${Math.abs(balance).toFixed(2)}`}
                  </div>
                </div>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: '20px', paddingLeft: '4px' }}>›</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
