'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  formatRupiah,
  laundryFetch,
  type BranchItem,
  type LaundryUserProfile,
} from '../../lib/laundry-api';

export function BranchesTab({
  user,
  onBranchesChanged,
}: {
  user: LaundryUserProfile;
  onBranchesChanged?: () => void;
}) {
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [ironingRate, setIroningRate] = useState(1100);
  const [payLaterFee, setPayLaterFee] = useState(1000);
  const [minWeight, setMinWeight] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await laundryFetch<BranchItem[]>('/branches');
      setBranches(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat cabang');
    }
  }, []);

  useEffect(() => {
    let active = true;
    laundryFetch<BranchItem[]>('/branches')
      .then((list) => {
        if (active) setBranches(list);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Gagal memuat cabang');
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await laundryFetch('/branches', {
        method: 'POST',
        body: JSON.stringify({
          name,
          code: code.toUpperCase(),
          address: address || undefined,
          ironingRate: Number(ironingRate),
          payLaterFee: Number(payLaterFee),
          defaultMinWeightKg: Number(minWeight),
        }),
      });
      setName('');
      setCode('');
      setAddress('');
      setNotice('Cabang berhasil dibuat.');
      await load();
      onBranchesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat cabang');
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">
          {notice}
        </div>
      )}

      {user.role === 'SUPER_OWNER' && (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3"
        >
          <h2 className="text-sm font-bold text-[var(--brand-dark)]">
            Tambah Cabang Baru
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              required
              placeholder="Nama Cabang (mis. Cabang Pusat)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl border border-zinc-300 px-3 py-2 text-xs"
            />
            <input
              required
              placeholder="Kode (mis. PST01)"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="rounded-xl border border-zinc-300 px-3 py-2 text-xs font-mono"
            />
            <input
              placeholder="Alamat Cabang"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="rounded-xl border border-zinc-300 px-3 py-2 text-xs"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-zinc-600">
              Upah Setrika (Rp)
              <input
                type="number"
                value={ironingRate}
                onChange={(e) => setIroningRate(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs"
              />
            </label>
            <label className="text-xs text-zinc-600">
              Biaya Pay Later (Rp)
              <input
                type="number"
                value={payLaterFee}
                onChange={(e) => setPayLaterFee(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs"
              />
            </label>
            <label className="text-xs text-zinc-600">
              Min. Berat Default (kg)
              <input
                type="number"
                step="0.5"
                value={minWeight}
                onChange={(e) => setMinWeight(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs"
              />
            </label>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-[var(--brand-dark)] px-4 py-2 text-xs font-semibold text-white"
          >
            Simpan Cabang
          </button>
        </form>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {branches.map((b) => (
          <div
            key={b.id}
            className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="font-bold text-[var(--brand-dark)]">{b.name}</div>
              <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-mono">
                {b.code}
              </span>
            </div>
            <p className="text-xs text-zinc-500">{b.address || 'Belum ada alamat'}</p>
            <div className="text-xs text-zinc-600">
              Upah Setrika: {formatRupiah(b.ironingRate)} • Pay Later:{' '}
              {formatRupiah(b.payLaterFee)} • Radius GPS: {b.attendanceRadiusMeters}m
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
