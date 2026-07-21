/**
 * Finance screen — manual transaction tracker with monthly summary.
 * Supports split-with flow (generates SplitShare records).
 * Receipt parsing via Supabase Edge Function → pre-fills form (never auto-saves).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getLocalDateString, formatDateDisplay, formatMonthYear, getNextMonth, getPrevMonth } from '../lib/dates';
import { createTransaction, getTransactionsForMonth, deleteTransaction, getAllPeople, createSplitShare, getMonthlyBudgetConfig, saveMonthlyBudgetConfig } from '../db';
import { useUserId } from '../contexts/AuthContext';
import { useAuth } from '../contexts/AuthContext';
import { syncNow } from '../sync/engine';
import { supabase } from '../lib/supabase';
import { DEFAULT_CATEGORIES } from '../types';
import type { Transaction, Person, MonthlyBudgetConfig, AISpendingInsight } from '../types';

interface ParsedReceipt {
  amount?: number;
  date?: string;
  payeeName?: string;
  upiRef?: string;
  confidence?: number;
}

export default function Finance() {
  const userId = useUserId();
  const { session } = useAuth();
  const [month, setMonth] = useState(getLocalDateString().slice(0, 7)); // 'YYYY-MM'
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  // Form state
  const [amount, setAmount] = useState('');
  const [txType, setTxType] = useState<'expense' | 'income'>('expense');
  const [category, setCategory] = useState('Food');
  const [newCategory, setNewCategory] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(getLocalDateString());
  const [showSplit, setShowSplit] = useState(false);
  const [splitPeople, setSplitPeople] = useState<Set<string>>(new Set());

  // Receipt parsing state
  // Budget & AI state
  const [budgetConfig, setBudgetConfig] = useState<MonthlyBudgetConfig | null>(null);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [tempTotalBudget, setTempTotalBudget] = useState('');
  const [tempCategoryBudgets, setTempCategoryBudgets] = useState<Record<string, string>>({});
  
  const [aiInsight, setAiInsight] = useState<AISpendingInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Receipt parsing state
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState('');
  const [parsedReceipt, setParsedReceipt] = useState<ParsedReceipt | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const allCategories = [...DEFAULT_CATEGORIES, ...customCategories.filter(c => !(DEFAULT_CATEGORIES as readonly string[]).includes(c))];

  const loadData = useCallback(async () => {
    const txs = await getTransactionsForMonth(month);
    const bConfig = await getMonthlyBudgetConfig(month);
    setTransactions(txs);
    setPeople(await getAllPeople());
    setBudgetConfig(bConfig);
  }, [month]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleOpenBudgetModal = () => {
    if (budgetConfig) {
      setTempTotalBudget(String(budgetConfig.totalBudget));
      const strMap: Record<string, string> = {};
      for (const [cat, val] of Object.entries(budgetConfig.categoryBudgets)) {
        strMap[cat] = String(val);
      }
      setTempCategoryBudgets(strMap);
    }
    setShowBudgetModal(true);
  };

  const handleSaveBudgetConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const tot = parseFloat(tempTotalBudget);
    if (isNaN(tot) || tot <= 0) return;

    const catBudgets: Record<string, number> = {};
    for (const [cat, strVal] of Object.entries(tempCategoryBudgets)) {
      const num = parseFloat(strVal);
      if (!isNaN(num) && num >= 0) {
        catBudgets[cat] = num;
      }
    }

    const updated: MonthlyBudgetConfig = {
      month,
      totalBudget: tot,
      categoryBudgets: catBudgets,
    };

    await saveMonthlyBudgetConfig(updated);
    setBudgetConfig(updated);
    setShowBudgetModal(false);
    syncNow();
  };

  const handleAnalyzeSpendingWithAI = async () => {
    const localGeminiKey = localStorage.getItem('lifepulse-gemini-api-key') || '';
    if (!localGeminiKey && !supabase) {
      setAiError('Please configure your Gemini API Key in Settings to enable AI spending analysis.');
      return;
    }

    setAiLoading(true);
    setAiError('');

    const expenses = transactions.filter(t => t.type === 'expense');
    const income = transactions.filter(t => t.type === 'income');
    const totalExp = expenses.reduce((s, t) => s + t.amount, 0);
    const totalInc = income.reduce((s, t) => s + t.amount, 0);

    const catMap: Record<string, number> = {};
    for (const t of expenses) {
      catMap[t.category] = (catMap[t.category] || 0) + t.amount;
    }

    try {
      if (localGeminiKey) {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${localGeminiKey}`;
        const promptText = `Analyze this monthly expense summary for ${month}:
- Total Budget: ₹${budgetConfig?.totalBudget || 15000}
- Total Income: ₹${totalInc}
- Total Expenses: ₹${totalExp}
- Category Breakdown: ${JSON.stringify(catMap)}

Provide personalized financial advice. Output JSON ONLY matching this schema:
{
  "summary": "1-2 sentence overall assessment of monthly spending habits.",
  "tips": [
    "Tip 1: specific actionable advice",
    "Tip 2: specific actionable advice",
    "Tip 3: specific actionable advice"
  ]
}`;

        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });

        if (!response.ok) {
          throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(rawText);
        setAiInsight({
          summary: parsed.summary || 'Spending analysis complete.',
          tips: parsed.tips || ['Keep tracking daily expenses to maintain budget control.'],
          analyzedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      } else {
        setAiInsight({
          summary: `You have spent ₹${totalExp} out of your ₹${budgetConfig?.totalBudget || 15000} budget this month.`,
          tips: [
            'Monitor top category spending regularly.',
            'Aim to save at least 20% of monthly income.',
            'Set up category limits to avoid overspending.'
          ],
          analyzedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }
    } catch (err: any) {
      setAiError(err.message || 'Failed to analyze spending.');
    } finally {
      setAiLoading(false);
    }
  };

  const resetForm = () => {
    setAmount(''); setTxType('expense'); setCategory('Food');
    setNote(''); setDate(getLocalDateString()); setShowForm(false);
    setShowSplit(false); setSplitPeople(new Set()); setNewCategory('');
    setParsedReceipt(null); setReceiptError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;

    const finalCategory = newCategory.trim() || category;
    if (newCategory.trim() && !allCategories.includes(newCategory.trim())) {
      setCustomCategories(prev => [...prev, newCategory.trim()]);
    }

    const tx = await createTransaction({
      date,
      amount: amt,
      type: txType,
      category: finalCategory,
      note: note.trim() || undefined,
    }, userId);

    // Handle splits
    if (showSplit && splitPeople.size > 0) {
      const shareAmount = amt / (splitPeople.size + 1); // equal split including you
      for (const personId of splitPeople) {
        await createSplitShare({
          transactionId: tx.id,
          personId,
          amountOwedToYou: parseFloat(shareAmount.toFixed(2)),
        }, userId);
      }
    }

    resetForm();
    await loadData();
    syncNow();
  };

  const handleDelete = async (id: string) => {
    await deleteTransaction(id);
    await loadData();
    syncNow();
  };

  // ─── Receipt Parsing ─────────────────────────────────────────────

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input immediately so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';

    const localGeminiKey = localStorage.getItem('lifepulse-gemini-api-key') || '';

    if (!localGeminiKey && !supabase) {
      setReceiptError('Please configure your Gemini API Key in Settings or set up Supabase to enable receipt scanning.');
      return;
    }

    setReceiptLoading(true);
    setReceiptError('');
    setParsedReceipt(null);

    try {
      // Read file as base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      let parsed: ParsedReceipt;

      if (localGeminiKey) {
        // Direct local call to Gemini API
        let mimeType = 'image/png';
        let base64Data = base64;
        if (base64.startsWith('data:')) {
          const match = base64.match(/^data:([^;]+);base64,(.*)$/);
          if (match) {
            mimeType = match[1];
            base64Data = match[2];
          }
        }

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${localGeminiKey}`;
        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: "Extract details from this UPI payment receipt / screenshot. Output JSON ONLY matching the schema: { \"amount\": number, \"date\": \"YYYY-MM-DD\", \"payeeName\": string, \"upiRef\": string, \"confidence\": number (0-1) }"
                  },
                  {
                    inlineData: {
                      mimeType: mimeType,
                      data: base64Data
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Gemini API error: ${response.status} ${errText}`);
        }

        const resJson = await response.json();
        const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        parsed = JSON.parse(rawText) as ParsedReceipt;
      } else {
        // Call Supabase Edge Function
        if (!session?.access_token) {
          setReceiptError('Please sign in to use receipt parsing via Supabase.');
          setReceiptLoading(false);
          return;
        }

        const { data, error } = await supabase!.functions.invoke('parse-receipt', {
          body: { image: base64 },
        });

        if (error) throw new Error(error.message || 'Edge Function error');
        parsed = data as ParsedReceipt;
      }

      setParsedReceipt(parsed);

      // Pre-fill form (never auto-save — user must review and confirm)
      if (parsed.amount) setAmount(String(parsed.amount));
      if (parsed.date) setDate(parsed.date);
      if (parsed.payeeName) {
        setNote(parsed.payeeName + (parsed.upiRef ? ` (Ref: ${parsed.upiRef})` : ''));
      }
      setTxType('expense');
      setShowForm(true);
    } catch (err: any) {
      setReceiptError(err.message || 'Failed to parse receipt');
    } finally {
      setReceiptLoading(false);
    }
  };

  // Monthly summary
  const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const net = income - expense;

  // Category breakdown
  const byCategory = transactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);



  const getFieldStyle = (fieldName: keyof ParsedReceipt): React.CSSProperties => {
    if (!parsedReceipt || !parsedReceipt[fieldName]) return {};
    const confidence = parsedReceipt.confidence ?? 1;
    if (confidence < 0.7) {
      return {
        border: '1.5px solid var(--color-journal)',
        backgroundColor: 'rgba(245, 158, 11, 0.06)',
      };
    }
    return {};
  };

  return (
    <div className="page animate-fade-in">
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', padding: '0 4px' }}>
        <button 
          onClick={() => setMonth(getPrevMonth(month + '-01').slice(0, 7))} 
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
        <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0, letterSpacing: '-0.3px' }}>
          {formatMonthYear(month + '-01')}
        </h1>
        <button 
          onClick={() => setMonth(getNextMonth(month + '-01').slice(0, 7))} 
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
          ›
        </button>
      </div>

      {/* Summary card */}
      <div className="glass-card glass-card-finance" style={{ padding: '22px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Income</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--color-habit)', letterSpacing: '-0.3px' }}>
              ₹{income.toLocaleString()}
            </div>
          </div>
          <div style={{ borderLeft: '1px solid rgba(255, 255, 255, 0.05)', borderRight: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Expense</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--color-people)', letterSpacing: '-0.3px' }}>
              ₹{expense.toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Net</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: net >= 0 ? 'var(--color-habit)' : 'var(--color-people)', letterSpacing: '-0.3px' }}>
              {net >= 0 ? '+' : ''}₹{net.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Category breakdown */}
        {Object.keys(byCategory).length > 0 && (
          <div style={{ marginTop: '18px', borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>Category Breakdown</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Object.entries(byCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, amt]) => {
                  const limit = budgetConfig?.categoryBudgets[cat] || 3000;
                  const catPercent = Math.min(Math.round((amt / limit) * 100), 100);
                  const catColor = catPercent < 70 ? 'var(--color-habit)' : catPercent <= 90 ? 'var(--color-journal)' : 'var(--color-people)';
                  return (
                    <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                        <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{cat}</span>
                        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          ₹{amt.toLocaleString()} <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>/ ₹{limit.toLocaleString()}</span>
                        </span>
                      </div>
                      <div style={{ height: '4px', borderRadius: '10px', backgroundColor: 'var(--color-bg-secondary)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${catPercent}%`, backgroundColor: catColor, borderRadius: '10px', transition: 'width 0.3s ease' }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Monthly Budget Dashboard Card */}
      {(() => {
        const totBudget = budgetConfig?.totalBudget || 15000;
        const spentPercent = Math.min(Math.round((expense / totBudget) * 100), 100);
        const statusColor = spentPercent < 70 ? 'var(--color-habit)' : spentPercent <= 90 ? 'var(--color-journal)' : 'var(--color-people)';
        const todayDate = new Date();
        const daysInMonth = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).getDate();
        const daysLeft = Math.max(1, daysInMonth - todayDate.getDate());
        const remainingBudget = Math.max(0, totBudget - expense);
        const dailySafeAllowance = Math.round(remainingBudget / daysLeft);

        return (
          <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Monthly Budget & Allowance
                </h2>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-text-primary)', marginTop: '2px' }}>
                  ₹{expense.toLocaleString()} <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>/ ₹{totBudget.toLocaleString()}</span>
                </div>
              </div>
              <button
                onClick={handleOpenBudgetModal}
                style={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  fontSize: '12px',
                  fontWeight: 650,
                  padding: '6px 12px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                }}
              >
                ⚙ Set Budget
              </button>
            </div>

            {/* Budget Bar */}
            <div>
              <div style={{ height: '8px', borderRadius: '99px', backgroundColor: 'var(--color-bg-secondary)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${spentPercent}%`, backgroundColor: statusColor, borderRadius: '99px', transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                <span>{spentPercent}% spent</span>
                <span>Safe Daily Allowance: <strong style={{ color: 'var(--color-text-primary)' }}>₹{dailySafeAllowance}/day</strong> ({daysLeft}d left)</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Gemini AI Spending Advisor */}
      <div className="glass-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-journal)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              ✨ Gemini AI Spending Insights
            </h2>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              Private AI analysis of your monthly expense patterns
            </div>
          </div>
          <button
            onClick={handleAnalyzeSpendingWithAI}
            disabled={aiLoading}
            className="btn-premium btn-premium-journal"
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              minHeight: '34px',
              borderRadius: '10px',
            }}
          >
            {aiLoading ? 'Analyzing...' : 'Analyze Now'}
          </button>
        </div>

        {aiError && (
          <div style={{ fontSize: '12px', color: 'var(--color-people)', background: 'rgba(189, 83, 102, 0.1)', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--color-border)' }}>
            ⚠️ {aiError}
          </div>
        )}

        {aiInsight && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px', borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
            <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: 600, lineHeight: 1.4 }}>
              💡 {aiInsight.summary}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {aiInsight.tips.map((tip, idx) => (
                <div key={idx} style={{ fontSize: '12px', color: 'var(--color-text-secondary)', background: 'var(--color-bg-secondary)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                  • {tip}
                </div>
              ))}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textAlign: 'right' }}>
              Analyzed at {aiInsight.analyzedAt}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={() => setShowForm(!showForm)}
          className={`btn-premium ${showForm ? 'btn-premium-secondary' : 'btn-premium-finance'}`}
          style={{ flex: 1 }}
        >
          {showForm ? 'Cancel' : '+ Add Transaction'}
        </button>

        {/* Receipt scan button */}
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 20px',
            borderRadius: '14px',
            fontWeight: 600,
            fontSize: '14px',
            cursor: receiptLoading ? 'wait' : 'pointer',
            border: '1px solid rgba(6, 182, 212, 0.25)',
            backgroundColor: receiptLoading ? 'var(--color-bg-elevated)' : 'var(--color-finance-soft)',
            color: 'var(--color-finance)',
            minHeight: '46px',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            opacity: receiptLoading ? 0.6 : 1,
            boxShadow: '0 4px 12px rgba(6, 182, 212, 0.1)',
          }}
          onMouseEnter={(e) => {
            if (!receiptLoading) {
              e.currentTarget.style.backgroundColor = 'rgba(6, 182, 212, 0.25)';
              e.currentTarget.style.boxShadow = '0 0 15px var(--color-finance-glow)';
            }
          }}
          onMouseLeave={(e) => {
            if (!receiptLoading) {
              e.currentTarget.style.backgroundColor = 'var(--color-finance-soft)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(6, 182, 212, 0.1)';
            }
          }}
        >
          {receiptLoading ? (
            <>
              <span style={{ animation: 'pulse-once 1s ease-in-out infinite' }}>⏳</span>
              Scanning…
            </>
          ) : (
            <>📷 Scan</>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleReceiptUpload}
            disabled={receiptLoading}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {/* Receipt error */}
      {receiptError && (
        <div className="glass-card" style={{
          padding: '12px 16px',
          borderColor: 'rgba(244, 63, 94, 0.2)',
          background: 'rgba(244, 63, 94, 0.06)',
          color: 'var(--color-people)', 
          fontSize: '13px',
          fontWeight: 500,
        }}>
          {receiptError}
        </div>
      )}

      {/* Parsed receipt confidence warning */}
      {parsedReceipt && parsedReceipt.confidence !== undefined && parsedReceipt.confidence < 0.7 && (
        <div className="glass-card" style={{
          padding: '12px 16px',
          borderColor: 'rgba(245, 158, 11, 0.2)',
          background: 'rgba(245, 158, 11, 0.06)',
          color: 'var(--color-journal)', 
          fontSize: '13px',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ fontSize: '16px' }}>⚠</span>
          <span>Low confidence ({Math.round(parsedReceipt.confidence * 100)}%) — verify highlighted fields.</span>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="glass-card glass-card-finance animate-fade-in" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Amount */}
          <div style={{ position: 'relative' }}>
            <input 
              type="number" 
              step="0.01" 
              min="0" 
              value={amount} 
              onChange={e => setAmount(e.target.value)}
              placeholder="Amount (₹)" 
              className="glass-input"
              style={{ 
                ...getFieldStyle('amount'), 
                fontSize: '24px', 
                fontWeight: 700, 
                textAlign: 'center', 
                padding: '16px',
              }} 
              autoFocus 
            />
            {parsedReceipt?.amount && parsedReceipt.confidence !== undefined && parsedReceipt.confidence < 0.7 && (
              <span style={{
                position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)',
                fontSize: '11px', color: 'var(--color-journal)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>verify</span>
            )}
          </div>

          {/* Type toggle */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['expense', 'income'] as const).map(t => (
              <button 
                key={t} 
                type="button" 
                onClick={() => setTxType(t)} 
                style={{
                  flex: 1, 
                  padding: '12px', 
                  borderRadius: '12px',
                  border: `1.5px solid ${txType === t ? (t === 'expense' ? 'var(--color-people)' : 'var(--color-habit)') : 'rgba(255, 255, 255, 0.06)'}`,
                  backgroundColor: txType === t ? (t === 'expense' ? 'var(--color-people-soft)' : 'var(--color-habit-soft)') : 'rgba(255, 255, 255, 0.02)',
                  color: txType === t ? (t === 'expense' ? 'var(--color-people)' : 'var(--color-habit)') : 'var(--color-text-secondary)',
                  cursor: 'pointer', 
                  fontSize: '14px', 
                  fontWeight: 600, 
                  textTransform: 'capitalize',
                  transition: 'all 0.2s ease',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Category */}
          <div>
            <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '8px', fontWeight: 600, paddingLeft: '2px' }}>
              Category
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
              {allCategories.map(c => (
                <button 
                  key={c} 
                  type="button" 
                  onClick={() => { setCategory(c); setNewCategory(''); }} 
                  style={{
                    padding: '8px 14px', 
                    borderRadius: '20px', 
                    fontSize: '13px',
                    fontWeight: 550,
                    border: `1.5px solid ${category === c && !newCategory ? 'var(--color-finance)' : 'rgba(255, 255, 255, 0.06)'}`,
                    backgroundColor: category === c && !newCategory ? 'var(--color-finance-soft)' : 'rgba(255, 255, 255, 0.01)',
                    color: category === c && !newCategory ? 'var(--color-finance)' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
            <input 
              value={newCategory} 
              onChange={e => setNewCategory(e.target.value)}
              placeholder="Or type a custom category" 
              className="glass-input" 
              style={{ fontSize: '13px', padding: '10px 14px' }} 
            />
          </div>

          {/* Note */}
          <div style={{ position: 'relative' }}>
            <input 
              value={note} 
              onChange={e => setNote(e.target.value)}
              placeholder="Note (optional)" 
              className="glass-input"
              style={getFieldStyle('payeeName')} 
            />
            {parsedReceipt?.payeeName && parsedReceipt.confidence !== undefined && parsedReceipt.confidence < 0.7 && (
              <span style={{
                position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)',
                fontSize: '11px', color: 'var(--color-journal)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>verify</span>
            )}
          </div>

          {/* Date */}
          <div style={{ position: 'relative' }}>
            <input 
              type="date" 
              value={date} 
              onChange={e => setDate(e.target.value)}
              className="glass-input"
              style={getFieldStyle('date')} 
            />
            {parsedReceipt?.date && parsedReceipt.confidence !== undefined && parsedReceipt.confidence < 0.7 && (
              <span style={{
                position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)',
                fontSize: '11px', color: 'var(--color-journal)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>verify</span>
            )}
          </div>

          {/* Split option */}
          {people.length > 0 && txType === 'expense' && (
            <div>
              <button 
                type="button" 
                onClick={() => setShowSplit(!showSplit)} 
                style={{
                  background: 'rgba(255, 255, 255, 0.03)', 
                  border: '1px solid rgba(255, 255, 255, 0.05)', 
                  color: 'var(--color-finance)',
                  cursor: 'pointer', 
                  fontSize: '12px', 
                  fontWeight: 600, 
                  padding: '6px 12px',
                  borderRadius: '8px',
                  transition: 'all 0.2s ease',
                }}
              >
                {showSplit ? '× Cancel split' : '÷ Split with…'}
              </button>
              {showSplit && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                  {people.filter(p => !p.archived).map(p => (
                    <button 
                      key={p.id} 
                      type="button"
                      onClick={() => {
                        const next = new Set(splitPeople);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        setSplitPeople(next);
                      }}
                      style={{
                        padding: '8px 14px', 
                        borderRadius: '20px', 
                        fontSize: '13px',
                        fontWeight: 550,
                        border: `1.5px solid ${splitPeople.has(p.id) ? 'var(--color-people)' : 'rgba(255, 255, 255, 0.06)'}`,
                        backgroundColor: splitPeople.has(p.id) ? 'var(--color-people-soft)' : 'rgba(255, 255, 255, 0.01)',
                        color: splitPeople.has(p.id) ? 'var(--color-people)' : 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              {showSplit && splitPeople.size > 0 && amount && (
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '8px', fontWeight: 500, paddingLeft: '2px' }}>
                  Each person owes: <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>₹{(parseFloat(amount) / (splitPeople.size + 1)).toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          <button 
            type="submit" 
            className="btn-premium btn-premium-finance" 
            style={{ width: '100%', marginTop: '4px' }}
          >
            Save Transaction
          </button>
        </form>
      )}

      {/* Transaction list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {transactions.length === 0 && !showForm && (
          <div className="glass-card animate-float" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>💰</div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 8px' }}>No transactions</h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 }}>
              No transactions recorded for this month.
            </p>
          </div>
        )}
        {transactions.map((tx, i) => (
          <div 
            key={tx.id} 
            className="glass-card glass-card-finance stagger-item" 
            style={{
              animationDelay: `${i * 45}ms`,
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '11px', 
                  padding: '3px 8px', 
                  borderRadius: '6px',
                  backgroundColor: tx.type === 'income' ? 'var(--color-habit-soft)' : 'var(--color-people-soft)',
                  color: tx.type === 'income' ? 'var(--color-habit)' : 'var(--color-people)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  {tx.category}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                  {formatDateDisplay(tx.date).split(',')[0]}
                </span>
              </div>
              {tx.note && (
                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '6px', fontWeight: 450, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tx.note}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
              <span style={{
                fontSize: '16px', 
                fontWeight: 750,
                color: tx.type === 'income' ? 'var(--color-habit)' : 'var(--color-text-primary)',
                letterSpacing: '-0.2px',
              }}>
                {tx.type === 'income' ? '+' : '-'}₹{tx.amount.toLocaleString()}
              </span>
              <button 
                onClick={() => handleDelete(tx.id)} 
                style={{
                  background: 'rgba(255, 255, 255, 0.03)', 
                  border: '1px solid rgba(255, 255, 255, 0.05)', 
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer', 
                  fontSize: '14px', 
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(244, 63, 94, 0.1)';
                  e.currentTarget.style.color = 'var(--color-people)';
                  e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                }}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Budget Config Modal */}
      {showBudgetModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }}>
          <div className="glass-card animate-scale-up" style={{
            maxWidth: '400px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>Configure Monthly Budget</h2>
              <button onClick={() => setShowBudgetModal(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '20px', cursor: 'pointer' }}>×</button>
            </div>

            <form onSubmit={handleSaveBudgetConfig} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Total Monthly Budget (₹)
                </label>
                <input
                  type="number"
                  min="1"
                  value={tempTotalBudget}
                  onChange={(e) => setTempTotalBudget(e.target.value)}
                  className="glass-input"
                  style={{ marginTop: '6px' }}
                  required
                />
              </div>

              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                  Category Target Limits (₹)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {DEFAULT_CATEGORIES.filter(c => c !== 'Income').map(cat => (
                    <div key={cat} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: 500 }}>{cat}</span>
                      <input
                        type="number"
                        min="0"
                        value={tempCategoryBudgets[cat] || ''}
                        onChange={(e) => setTempCategoryBudgets({ ...tempCategoryBudgets, [cat]: e.target.value })}
                        className="glass-input"
                        placeholder="Limit (e.g. 5000)"
                        style={{ width: '130px', padding: '8px 12px', fontSize: '13px' }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowBudgetModal(false)}
                  className="btn-premium btn-premium-secondary"
                  style={{ flex: 1, minHeight: '40px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-premium btn-premium-finance"
                  style={{ flex: 1, minHeight: '40px' }}
                >
                  Save Budget
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
