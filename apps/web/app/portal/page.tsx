'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyTenantThemeToDom,
  laundryFetch,
  type BranchItem,
  type EntitlementInfo,
  type LaundryUserProfile,
  type TenantBrandingInfo,
} from '../lib/laundry-api';
import { AttendanceLeavesTab } from './components/AttendanceLeavesTab';
import { BranchesTab } from './components/BranchesTab';
import { CashierPosTab } from './components/CashierPosTab';
import { FinanceReportsTab } from './components/FinanceReportsTab';
import { OrdersRackTab } from './components/OrdersRackTab';
import { StaffServicesTab } from './components/StaffServicesTab';
import { WorkflowQueuesTab } from './components/WorkflowQueuesTab';

interface MeResponse {
  user: LaundryUserProfile;
  tenant: TenantBrandingInfo | null;
  entitlement: EntitlementInfo | null;
}

type TabKey =
  | 'POS'
  | 'ORDERS'
  | 'WORKFLOW'
  | 'FINANCE'
  | 'ATTENDANCE'
  | 'BRANCHES'
  | 'STAFF_SERVICES';

export default function LaundryPortalPage() {
  const router = useRouter();
  const [session, setSession] = useState<MeResponse | null>(null);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [tab, setTab] = useState<TabKey>('ORDERS');
  const [loading, setLoading] = useState(true);

  const loadBranches = useCallback(async () => {
    const list = await laundryFetch<BranchItem[]>('/branches').catch(() => []);
    setBranches(list);
    if (list.length > 0) {
      setSelectedBranchId((prev) => prev || list[0].id);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      laundryFetch<MeResponse>('/auth/me'),
      laundryFetch<BranchItem[]>('/branches').catch(() => []),
    ])
      .then(([me, br]) => {
        if (!active) return;
        setSession(me);
        setBranches(br);
        applyTenantThemeToDom(me.tenant?.theme);
        if (me.user.branchId) {
          setSelectedBranchId(me.user.branchId);
        } else if (br.length > 0) {
          setSelectedBranchId(br[0].id);
        }

        if (me.user.role === 'CASHIER') setTab('POS');
        else if (me.user.role === 'IRONING' || me.user.role === 'WASHING') {
          setTab('WORKFLOW');
        } else {
          setTab('FINANCE');
        }
      })
      .catch(() => {
        if (active) router.replace('/login');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  const availableTabs = useMemo(() => {
    const role = session?.user.role;
    if (!role) return [];
    const items: Array<{ key: TabKey; label: string }> = [];
    if (['SUPER_OWNER', 'CASHIER'].includes(role)) {
      items.push({ key: 'POS', label: 'Kasir POS' });
    }
    items.push({ key: 'ORDERS', label: 'Daftar Pesanan' });
    items.push({ key: 'WORKFLOW', label: 'Cuci, Setrika & Rak' });
    if (['SUPER_OWNER', 'BRANCH_OWNER', 'CASHIER'].includes(role)) {
      items.push({ key: 'FINANCE', label: 'Keuangan & Laporan' });
    }
    items.push({ key: 'ATTENDANCE', label: 'Absensi & Cuti' });
    if (['SUPER_OWNER', 'BRANCH_OWNER'].includes(role)) {
      items.push({ key: 'STAFF_SERVICES', label: 'Pegawai & Layanan' });
      items.push({ key: 'BRANCHES', label: 'Cabang' });
    }
    return items;
  }, [session?.user.role]);

  async function handleLogout() {
    await laundryFetch('/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
  }

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-zinc-500">
        Memuat portal operasional MNILab Laundry...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f9f4] text-[#454745]">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-bold text-[var(--brand-dark)]">
              {session.tenant?.brandName || 'MNILab Laundry'}
            </Link>
            <span className="rounded-full bg-[var(--brand-surface)] px-2.5 py-0.5 text-xs font-semibold text-[var(--brand-dark)]">
              {session.user.role}
            </span>
            {session.tenant?.isDemo && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                DEMO READ-ONLY
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs">
            {session.user.role === 'SUPER_OWNER' && branches.length > 0 && (
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="rounded-lg border border-zinc-300 px-2.5 py-1.5"
              >
                <option value="">Semua Cabang (Konsolidasi)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            <span className="font-medium">{session.user.name}</span>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100"
            >
              Keluar
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-6 pb-3 text-xs">
          {availableTabs.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`rounded-xl px-3.5 py-2 font-semibold whitespace-nowrap transition ${
                tab === item.key
                  ? 'bg-[var(--brand-dark)] text-white'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {tab === 'POS' && <CashierPosTab selectedBranchId={selectedBranchId} />}
        {tab === 'ORDERS' && (
          <OrdersRackTab selectedBranchId={selectedBranchId} />
        )}
        {tab === 'WORKFLOW' && (
          <WorkflowQueuesTab
            user={session.user}
            selectedBranchId={selectedBranchId}
          />
        )}
        {tab === 'FINANCE' && (
          <FinanceReportsTab
            user={session.user}
            selectedBranchId={selectedBranchId}
          />
        )}
        {tab === 'ATTENDANCE' && (
          <AttendanceLeavesTab
            user={session.user}
            selectedBranchId={selectedBranchId}
          />
        )}
        {tab === 'STAFF_SERVICES' && (
          <StaffServicesTab
            user={session.user}
            selectedBranchId={selectedBranchId}
          />
        )}
        {tab === 'BRANCHES' && (
          <BranchesTab user={session.user} onBranchesChanged={loadBranches} />
        )}
      </main>
    </div>
  );
}
