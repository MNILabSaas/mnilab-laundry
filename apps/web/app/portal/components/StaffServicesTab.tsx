'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  formatRupiah,
  laundryFetch,
  WORKFLOW_LABELS,
  type BranchItem,
  type LaundryServiceItem,
  type LaundryUserProfile,
  type PriceUnit,
  type UserRole,
  type WorkflowCode,
} from '../../lib/laundry-api';

export function StaffServicesTab({
  user,
  selectedBranchId,
}: {
  user: LaundryUserProfile;
  selectedBranchId: string;
}) {
  const [staff, setStaff] = useState<LaundryUserProfile[]>([]);
  const [services, setServices] = useState<LaundryServiceItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);

  const [sName, setSName] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [sPassword, setSPassword] = useState('');
  const [sRole, setSRole] = useState<UserRole>('CASHIER');
  const [sBranchId, setSBranchId] = useState(user.branchId || selectedBranchId);

  const [svcName, setSvcName] = useState('');
  const [svcWorkflow, setSvcWorkflow] = useState<WorkflowCode>('WASH_IRON');
  const [svcUnit, setSvcUnit] = useState<PriceUnit>('KG');
  const [svcPrice, setSvcPrice] = useState(7000);

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const qs = selectedBranchId ? `?branchId=${selectedBranchId}` : '';
    const [st, sv, br] = await Promise.all([
      laundryFetch<LaundryUserProfile[]>(`/staff${qs}`),
      laundryFetch<LaundryServiceItem[]>(`/services${qs}`),
      laundryFetch<BranchItem[]>('/branches'),
    ]);
    setStaff(st);
    setServices(sv);
    setBranches(br);
  }, [selectedBranchId]);

  useEffect(() => {
    let active = true;
    const qs = selectedBranchId ? `?branchId=${selectedBranchId}` : '';
    Promise.all([
      laundryFetch<LaundryUserProfile[]>(`/staff${qs}`),
      laundryFetch<LaundryServiceItem[]>(`/services${qs}`),
      laundryFetch<BranchItem[]>('/branches'),
    ])
      .then(([st, sv, br]) => {
        if (!active) return;
        setStaff(st);
        setServices(sv);
        setBranches(br);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [selectedBranchId]);

  async function handleAddStaff(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      await laundryFetch('/staff', {
        method: 'POST',
        body: JSON.stringify({
          name: sName,
          email: sEmail,
          password: sPassword,
          role: sRole,
          branchId: sRole === 'SUPER_OWNER' ? undefined : sBranchId || branches[0]?.id,
        }),
      });
      setSName('');
      setSEmail('');
      setSPassword('');
      setMsg('Pegawai berhasil ditambahkan.');
      await reload();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Gagal menambah pegawai');
    }
  }

  async function handleAddService(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      await laundryFetch('/services', {
        method: 'POST',
        body: JSON.stringify({
          branchId: selectedBranchId || undefined,
          name: svcName,
          workflow: svcWorkflow,
          priceUnit: svcUnit,
          price: Number(svcPrice),
        }),
      });
      setSvcName('');
      setMsg('Layanan berhasil ditambahkan.');
      await reload();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Gagal menambah layanan');
    }
  }

  return (
    <div className="space-y-8">
      {err && <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{err}</div>}
      {msg && (
        <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">
          {msg}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleAddStaff}
          className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3"
        >
          <h3 className="text-sm font-bold text-[var(--brand-dark)]">
            Tambah Pegawai Operasional
          </h3>
          <input
            required
            placeholder="Nama Pegawai"
            value={sName}
            onChange={(e) => setSName(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs"
          />
          <input
            required
            type="email"
            placeholder="Email Login"
            value={sEmail}
            onChange={(e) => setSEmail(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs"
          />
          <input
            required
            type="password"
            minLength={8}
            placeholder="Password Awal (min. 8 karakter)"
            value={sPassword}
            onChange={(e) => setSPassword(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs"
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              value={sRole}
              onChange={(e) => setSRole(e.target.value as UserRole)}
              className="rounded-xl border border-zinc-300 px-3 py-2 text-xs"
            >
              <option value="CASHIER">CASHIER (Kasir)</option>
              <option value="WASHING">WASHING (Cuci)</option>
              <option value="IRONING">IRONING (Setrika)</option>
              {user.role === 'SUPER_OWNER' && (
                <option value="BRANCH_OWNER">BRANCH_OWNER</option>
              )}
            </select>
            <select
              value={sBranchId}
              onChange={(e) => setSBranchId(e.target.value)}
              className="rounded-xl border border-zinc-300 px-3 py-2 text-xs"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-[var(--brand-dark)] px-4 py-2 text-xs font-semibold text-white"
          >
            Simpan Pegawai
          </button>
        </form>

        <form
          onSubmit={handleAddService}
          className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3"
        >
          <h3 className="text-sm font-bold text-[var(--brand-dark)]">
            Tambah Jenis Layanan
          </h3>
          <input
            required
            placeholder="Nama Layanan (mis. Cuci Kering Setrika)"
            value={svcName}
            onChange={(e) => setSvcName(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-xs"
          />
          <div className="grid grid-cols-3 gap-2">
            <select
              value={svcWorkflow}
              onChange={(e) => setSvcWorkflow(e.target.value as WorkflowCode)}
              className="rounded-xl border border-zinc-300 px-3 py-2 text-xs"
            >
              {Object.entries(WORKFLOW_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={svcUnit}
              onChange={(e) => setSvcUnit(e.target.value as PriceUnit)}
              className="rounded-xl border border-zinc-300 px-3 py-2 text-xs"
            >
              <option value="KG">KG</option>
              <option value="ITEM">ITEM</option>
              <option value="FLAT">FLAT</option>
            </select>
            <input
              type="number"
              min={0}
              value={svcPrice}
              onChange={(e) => setSvcPrice(Number(e.target.value))}
              className="rounded-xl border border-zinc-300 px-3 py-2 text-xs"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-[var(--brand-dark)] px-4 py-2 text-xs font-semibold text-white"
          >
            Simpan Layanan
          </button>
        </form>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h4 className="text-xs font-bold uppercase text-zinc-500">
            Daftar Pegawai ({staff.length})
          </h4>
          <div className="mt-3 space-y-2 text-xs">
            {staff.map((st) => (
              <div
                key={st.id}
                className="flex items-center justify-between rounded-xl border border-zinc-100 px-3 py-2"
              >
                <div>
                  <div className="font-semibold">{st.name}</div>
                  <div className="text-zinc-500">{st.email || st.phone}</div>
                </div>
                <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-[11px]">
                  {st.role}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h4 className="text-xs font-bold uppercase text-zinc-500">
            Katalog Layanan ({services.length})
          </h4>
          <div className="mt-3 space-y-2 text-xs">
            {services.map((sv) => (
              <div
                key={sv.id}
                className="flex items-center justify-between rounded-xl border border-zinc-100 px-3 py-2"
              >
                <div>
                  <div className="font-semibold">{sv.name}</div>
                  <div className="text-zinc-500">
                    {WORKFLOW_LABELS[sv.workflow]}
                  </div>
                </div>
                <span className="font-semibold text-[var(--brand-dark)]">
                  {formatRupiah(sv.price)}/{sv.priceUnit}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
