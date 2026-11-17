'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  formatRupiah,
  laundryFetch,
  type CashSettlementItem,
  type ExpenseCategoryItem,
  type ExpenseItem,
  type LaundryUserProfile,
  type ReportSummary,
} from '../../lib/laundry-api';

export function FinanceReportsTab({
  user,
  selectedBranchId,
}: {
  user: LaundryUserProfile;
  selectedBranchId: string;
}) {
  const [categories, setCategories] = useState<ExpenseCategoryItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [settlements, setSettlements] = useState<CashSettlementItem[]>([]);
  const [report, setReport] = useState<ReportSummary | null>(null);

  const [catName, setCatName] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [expAmt, setExpAmt] = useState(0);
  const [expCatId, setExpCatId] = useState('');
  const [actualCash, setActualCash] = useState(0);

  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const isOwner = ['SUPER_OWNER', 'BRANCH_OWNER'].includes(user.role);

  const reload = useCallback(async () => {
    const qs = selectedBranchId ? `?branchId=${selectedBranchId}` : '';
    const [cats, exps, sets, rep] = await Promise.all([
      laundryFetch<ExpenseCategoryItem[]>('/expenses/categories'),
      laundryFetch<ExpenseItem[]>(`/expenses${qs}`),
      laundryFetch<CashSettlementItem[]>(`/cash-settlements${qs}`),
      isOwner
        ? laundryFetch<ReportSummary>(`/reports/summary${qs}`)
        : Promise.resolve(null),
    ]);
    setCategories(cats);
    if (cats.length > 0 && !expCatId) setExpCatId(cats[0].id);
    setExpenses(exps);
    setSettlements(sets);
    setReport(rep);
  }, [selectedBranchId, isOwner, expCatId]);

  useEffect(() => {
    let active = true;
    const qs = selectedBranchId ? `?branchId=${selectedBranchId}` : '';
    Promise.all([
      laundryFetch<ExpenseCategoryItem[]>('/expenses/categories'),
      laundryFetch<ExpenseItem[]>(`/expenses${qs}`),
      laundryFetch<CashSettlementItem[]>(`/cash-settlements${qs}`),
      isOwner
        ? laundryFetch<ReportSummary>(`/reports/summary${qs}`)
        : Promise.resolve(null),
    ])
      .then(([cats, exps, sets, rep]) => {
        if (!active) return;
        setCategories(cats);
        if (cats.length > 0) setExpCatId((prev) => prev || cats[0].id);
        setExpenses(exps);
        setSettlements(sets);
        setReport(rep);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [selectedBranchId, isOwner]);

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    await laundryFetch('/expenses/categories', {
      method: 'POST',
      body: JSON.stringify({ name: catName }),
    });
    setCatName('');
    await reload();
  }

  async function handleAddExpense(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      await laundryFetch('/expenses', {
        method: 'POST',
        body: JSON.stringify({
          branchId: selectedBranchId || undefined,
          categoryId: expCatId,
          description: expDesc,
          amount: Number(expAmt),
          expenseDate: new Date().toISOString().slice(0, 10),
          paymentMethod: 'CASH',
        }),
      });
      setExpDesc('');
      setExpAmt(0);
      setMsg('Pengeluaran dicatat.');
      await reload();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Gagal mencatat pengeluaran');
    }
  }

  async function handleSubmitSettlement(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      await laundryFetch('/cash-settlements', {
        method: 'POST',
        body: JSON.stringify({
          branchId: selectedBranchId || undefined,
          settlementDate: new Date().toISOString().slice(0, 10),
          actualCash: Number(actualCash),
        }),
      });
      setMsg('Setoran kas harian dikirim.');
      await reload();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Gagal mengirim setoran kas');
    }
  }

  return (
    <div className="space-y-6">
      {err && <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{err}</div>}
      {msg && <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{msg}</div>}

      {report && (
        <section className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-xs text-zinc-500">Total Omzet</div>
            <div className="mt-1 text-lg font-bold text-[var(--brand-dark)]">
              {formatRupiah(report.financials.totalRevenueBilled)}
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-xs text-zinc-500">Pembayaran Masuk</div>
            <div className="mt-1 text-lg font-bold text-emerald-700">
              {formatRupiah(report.financials.totalPaymentsCollected)}
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-xs text-zinc-500">Pengeluaran Disetujui</div>
            <div className="mt-1 text-lg font-bold text-red-700">
              {formatRupiah(report.financials.totalExpenses)}
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-xs text-zinc-500">Net Cashflow</div>
            <div className="mt-1 text-lg font-bold text-[var(--brand-dark)]">
              {formatRupiah(report.financials.netCashflow)}
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-bold text-[var(--brand-dark)]">
            Catat Pengeluaran Operasional
          </h3>
          {isOwner && (
            <form onSubmit={handleAddCategory} className="flex gap-2 text-xs">
              <input
                required
                placeholder="Kategori baru (mis. Deterjen)"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                className="flex-1 rounded-xl border border-zinc-300 px-3 py-1.5"
              />
              <button
                type="submit"
                className="rounded-xl border border-zinc-300 px-3 py-1.5 font-semibold"
              >
                + Kategori
              </button>
            </form>
          )}
          <form onSubmit={handleAddExpense} className="space-y-2 text-xs">
            <select
              value={expCatId}
              onChange={(e) => setExpCatId(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              required
              placeholder="Deskripsi pengeluaran"
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2"
            />
            <input
              type="number"
              min={1}
              required
              placeholder="Nominal (Rp)"
              value={expAmt}
              onChange={(e) => setExpAmt(Number(e.target.value))}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2"
            />
            <button
              type="submit"
              disabled={!expCatId}
              className="rounded-xl bg-[var(--brand-dark)] px-4 py-2 font-semibold text-white"
            >
              Simpan Pengeluaran
            </button>
          </form>

          <div className="space-y-2 text-xs">
            {expenses.map((ex) => (
              <div
                key={ex.id}
                className="flex items-center justify-between rounded-xl border border-zinc-100 px-3 py-2"
              >
                <div>
                  <div className="font-semibold">{ex.description}</div>
                  <div className="text-zinc-500">
                    {ex.category?.name} • {formatRupiah(ex.amount)}
                  </div>
                </div>
                <span className="rounded bg-zinc-100 px-2 py-0.5">
                  {ex.approvalStatus}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-bold text-[var(--brand-dark)]">
            Setoran Kas Harian
          </h3>
          <form onSubmit={handleSubmitSettlement} className="flex gap-2 text-xs">
            <input
              type="number"
              min={0}
              required
              placeholder="Kas Fisik Aktual (Rp)"
              value={actualCash}
              onChange={(e) => setActualCash(Number(e.target.value))}
              className="flex-1 rounded-xl border border-zinc-300 px-3 py-2"
            />
            <button
              type="submit"
              className="rounded-xl bg-[var(--brand-dark)] px-4 py-2 font-semibold text-white"
            >
              Kirim Setoran
            </button>
          </form>

          <div className="space-y-2 text-xs">
            {settlements.map((st) => (
              <div
                key={st.id}
                className="rounded-xl border border-zinc-100 px-3 py-2 space-y-1"
              >
                <div className="flex items-center justify-between font-semibold">
                  <span>{st.settlementDate}</span>
                  <span>{st.status}</span>
                </div>
                <div className="text-zinc-500">
                  Expected: {formatRupiah(st.expectedCash)} • Aktual:{' '}
                  {formatRupiah(st.actualCash)} • Selisih:{' '}
                  {formatRupiah(st.difference)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
