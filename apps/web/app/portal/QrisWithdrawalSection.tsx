'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  apiFetch,
  formatRupiah,
  type Branch,
  type QrisBranchReconciliationSummary,
  type QrisReconciliationResponse,
  type QrisWithdrawalItem,
  type TenantBankAccountItem,
} from '../lib/api';

const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function OwnerQrisWithdrawalSection({
  isSuperOwner,
  selectedBranchId,
  branches,
  onSelectBranch,
  onSuccessMsg,
  onErrorMsg,
}: {
  isSuperOwner: boolean;
  selectedBranchId: string;
  branches: Branch[];
  onSelectBranch: (branchId: string) => void;
  onSuccessMsg: (msg: string) => void;
  onErrorMsg: (msg: string) => void;
}) {
  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [data, setData] = useState<QrisReconciliationResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [expandedBranchId, setExpandedBranchId] = useState<string | null>(null);

  // Modal Tarik Hasil QRIS Cabang ke Super Admin
  const [requestModalBranch, setRequestModalBranch] =
    useState<QrisBranchReconciliationSummary | null>(null);
  const [selectedBankIndex, setSelectedBankIndex] = useState<number>(0);
  const [useCustomBank, setUseCustomBank] = useState<boolean>(false);
  const [customBankName, setCustomBankName] = useState<string>('BCA');
  const [customAccountNumber, setCustomAccountNumber] = useState<string>('');
  const [customAccountHolder, setCustomAccountHolder] = useState<string>('');
  const [ownerNotes, setOwnerNotes] = useState<string>('');

  // Modal Lihat Foto Bukti Transfer dari Super Admin
  const [proofModalItem, setProofModalItem] =
    useState<QrisWithdrawalItem | null>(null);

  // State Kelola Nomor Rekening Bank Super Owner (Bisa Lebih dari 1 Rekening)
  const [ownerBanks, setOwnerBanks] = useState<TenantBankAccountItem[]>([]);
  const [newBankName, setNewBankName] = useState<string>('BCA');
  const [newAccountNumber, setNewAccountNumber] = useState<string>('');
  const [newAccountHolder, setNewAccountHolder] = useState<string>('');
  const [savingBanks, setSavingBanks] = useState<boolean>(false);

  const loadReconciliation = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('month', String(month));
      params.set('year', String(year));
      if (selectedBranchId) {
        params.set('branchId', selectedBranchId);
      }
      const res = await apiFetch<QrisReconciliationResponse>(
        `/payments/qris-reconciliation?${params.toString()}`,
      );
      setData(res);
      setOwnerBanks(Array.isArray(res.bankAccounts) ? res.bankAccounts : []);
    } catch (err) {
      onErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal memuat data rekonsiliasi & pencairan QRIS cabang',
      );
    } finally {
      setLoading(false);
    }
  }, [month, year, selectedBranchId, onErrorMsg]);

  async function handleSaveOwnerBankAccounts(nextList?: TenantBankAccountItem[]) {
    const listToSave = nextList ?? ownerBanks;
    setSavingBanks(true);
    try {
      const res = await apiFetch<{
        bankAccounts: TenantBankAccountItem[];
        message: string;
      }>('/payments/qris-bank-accounts', {
        method: 'PUT',
        body: JSON.stringify({ bankAccounts: listToSave }),
      });
      setOwnerBanks(res.bankAccounts);
      onSuccessMsg(res.message);
      await loadReconciliation();
    } catch (err) {
      onErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan daftar nomor rekening bank Super Owner',
      );
    } finally {
      setSavingBanks(false);
    }
  }

  useEffect(() => {
    void loadReconciliation();
  }, [loadReconciliation]);

  function openRequestWithdrawalModal(branchSummary: QrisBranchReconciliationSummary) {
    setRequestModalBranch(branchSummary);
    const banks = data?.bankAccounts || [];
    if (banks.length > 0) {
      setUseCustomBank(false);
      setSelectedBankIndex(0);
    } else {
      setUseCustomBank(true);
    }
    setOwnerNotes('');
  }

  async function handleRequestWithdrawal(e: FormEvent) {
    e.preventDefault();
    if (!requestModalBranch) return;

    const banks = data?.bankAccounts || [];
    let targetBankAccount: TenantBankAccountItem | undefined;
    if (!useCustomBank && banks[selectedBankIndex]) {
      targetBankAccount = banks[selectedBankIndex];
    } else if (customBankName.trim() && customAccountNumber.trim()) {
      targetBankAccount = {
        bankName: customBankName.trim().toUpperCase(),
        accountNumber: customAccountNumber.trim(),
        accountHolder: customAccountHolder.trim() || '-',
      };
    }

    setSubmitting(true);
    try {
      await apiFetch('/payments/qris-withdrawals/request', {
        method: 'POST',
        body: JSON.stringify({
          branchId: requestModalBranch.branchId,
          month,
          year,
          ownerNotes: ownerNotes.trim() || undefined,
          targetBankAccount,
        }),
      });
      onSuccessMsg(
        `Pengajuan penarikan hasil QRIS cabang "${requestModalBranch.branchName}" periode ${MONTH_NAMES[month - 1]} ${year} sebesar ${formatRupiah(requestModalBranch.availableToWithdrawAmount)} berhasil dikirim ke Super Admin!`,
      );
      setRequestModalBranch(null);
      await loadReconciliation();
    } catch (err) {
      onErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal mengajukan penarikan hasil QRIS cabang',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const summary = data?.summary ?? {
    totalQrisCollected: 0,
    withdrawnApprovedAmount: 0,
    pendingWithdrawalAmount: 0,
    availableToWithdrawAmount: 0,
    totalTransactions: 0,
  };
  const registeredBanks = data?.bankAccounts ?? [];
  const branchSummaries = data?.branchSummaries ?? [];
  const withdrawals = data?.withdrawals ?? [];

  return (
    <section className="space-y-6">
      {/* Header & Filter Periode Bulan / Cabang */}
      <div className="bg-[#ffffff] border border-[#e8ebe6] rounded-[24px] p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <span className="inline-block bg-[#e2f6d5] text-[#163300] text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            Pencairan Hasil QRIS Per Cabang ke Super Admin
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-[#0e0f0c] tracking-[-0.02em] mt-1.5">
            Rekonsiliasi &amp; Tarik Hasil QRIS Bulanan Cabang
          </h2>
          <p className="text-xs text-[#6a6c6a] mt-0.5">
            Pantau hasil pembayaran QRIS tiap cabang per bulan, pisahkan saldo yang{' '}
            <strong>Sudah Ditarik</strong> vs <strong>Belum Ditarik</strong>, ajukan pencairan ke Super Admin, dan lihat{' '}
            <strong>Foto Bukti Transfer</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSuperOwner && (
            <select
              value={selectedBranchId}
              onChange={(e) => onSelectBranch(e.target.value)}
              className="bg-[#ffffff] border border-[#868685] rounded-full px-3.5 py-2 text-xs font-semibold text-[#0e0f0c]"
            >
              <option value="">Semua Cabang ({branches.length})</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          )}

          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="bg-[#ffffff] border border-[#868685] rounded-full px-3.5 py-2 text-xs font-semibold text-[#0e0f0c]"
          >
            {MONTH_NAMES.map((mName, idx) => (
              <option key={mName} value={idx + 1}>
                {mName}
              </option>
            ))}
          </select>

          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="bg-[#ffffff] border border-[#868685] rounded-full px-3.5 py-2 text-xs font-semibold text-[#0e0f0c]"
          >
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(
              (yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ),
            )}
          </select>

          <button
            type="button"
            disabled={loading}
            onClick={() => void loadReconciliation()}
            className="bg-[#163300] hover:bg-[#054d28] text-[#ffffff] text-xs font-semibold px-4 py-2 rounded-full cursor-pointer transition-colors"
          >
            {loading ? 'Memuat...' : '↻ Segarkan'}
          </button>
        </div>
      </div>

      {/* Banner Status Integrasi Dynamic QRIS Bank Nobu */}
      {!data?.qrisPaymentEnabled && (
        <div className="bg-amber-50 border border-amber-300 rounded-[20px] p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-amber-200 text-amber-950 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase">
                🔧 FITUR QRIS KASIR: UNDER MAINTENANCE (BANK NOBU)
              </span>
              <span className="text-xs font-bold text-amber-950">
                Integrasi API Dynamic QRIS Bank Nobu Sedang Diproses
              </span>
            </div>
            <p className="text-xs text-amber-900 leading-relaxed">
              Pembayaran metode QRIS di kasir saat ini dinonaktifkan sementara (Under Maintenance) hingga kredensial API Dynamic QRIS <strong>Bank Nobu</strong> selesai diaktifkan. Silakan <strong>daftarkan nomor rekening bank Anda di bawah ini sekarang</strong> agar begitu Dynamic QRIS Bank Nobu aktif, Anda dapat langsung mengajukan penarikan tiap bulan dan Super Admin dapat mencocokkan mutasi Bank Nobu lalu mentransfer ke rekening Anda.
            </p>
          </div>
        </div>
      )}

      {/* 4 Kartu Ringkasan Pemisahan Dana QRIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#ffffff] border border-[#e8ebe6] rounded-[20px] p-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#6a6c6a]">
            Total Hasil QRIS ({MONTH_NAMES[month - 1]} {year})
          </div>
          <div className="text-2xl font-black text-[#0e0f0c] mt-1">
            {formatRupiah(summary.totalQrisCollected)}
          </div>
          <div className="text-[11px] text-[#6a6c6a] mt-1">
            {summary.totalTransactions} transaksi nota QRIS lunas
          </div>
        </div>

        <div className="bg-[#e2f6d5]/70 border border-[#9fe870] rounded-[20px] p-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#163300]">
            Sudah Ditarik &amp; Ditransfer (ACC)
          </div>
          <div className="text-2xl font-black text-[#163300] mt-1">
            {formatRupiah(summary.withdrawnApprovedAmount)}
          </div>
          <div className="text-[11px] text-[#054d28] mt-1">
            Sudah ditransfer Super Admin beserta foto bukti
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-300 rounded-[20px] p-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-900">
            Sedang Diajukan (Menunggu ACC)
          </div>
          <div className="text-2xl font-black text-amber-800 mt-1">
            {formatRupiah(summary.pendingWithdrawalAmount)}
          </div>
          <div className="text-[11px] text-amber-800 mt-1">
            Menunggu verifikasi &amp; bukti transfer Super Admin
          </div>
        </div>

        <div className="bg-sky-50 border border-sky-300 rounded-[20px] p-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-sky-900">
            Belum Ditarik (Siap Dicairkan)
          </div>
          <div className="text-2xl font-black text-sky-900 mt-1">
            {formatRupiah(summary.availableToWithdrawAmount)}
          </div>
          <div className="text-[11px] text-sky-800 mt-1">
            Dapat ditarik per cabang ke Super Admin sekarang
          </div>
        </div>
      </div>

      {/* Panel Input & Kelola Nomor Rekening Bank Super Owner (Tujuan Transfer dari Bank Nobu Super Admin) */}
      <div className="bg-[#ffffff] border border-[#e8ebe6] rounded-[24px] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e8ebe6] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black text-[#0e0f0c]">
                🏦 Nomor Rekening Bank Super Owner (Tujuan Transfer Pencairan QRIS Bank Nobu)
              </h3>
              <span className="bg-[#e2f6d5] text-[#163300] text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                {ownerBanks.length} Rekening Terdaftar
              </span>
            </div>
            <p className="text-xs text-[#6a6c6a] mt-0.5">
              Cantumkan 1 atau lebih nomor rekening bank Anda di sini. Saat Anda mengajukan penarikan hasil QRIS bulanan, Super Admin akan mengecek mutasi di <strong>Bank Nobu</strong> lalu mentransfer ke nomor rekening Anda beserta foto bukti transfernya.
            </p>
          </div>
        </div>

        {ownerBanks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {ownerBanks.map((b, idx) => (
              <div
                key={`${b.bankName}-${b.accountNumber}-${idx}`}
                className="flex items-center justify-between gap-2 bg-[#e2f6d5]/50 border border-[#9fe870] rounded-[14px] px-4 py-2.5 text-xs"
              >
                <div>
                  <div className="font-mono font-black text-[#163300] text-sm">
                    <span className="bg-[#163300] text-[#ffffff] text-[10px] px-2 py-0.5 rounded-full mr-2">
                      #{idx + 1} {b.bankName}
                    </span>
                    {b.accountNumber}
                  </div>
                  <div className="text-[11px] text-[#054d28] mt-0.5">
                    Atas Nama: <strong>{b.accountHolder}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={savingBanks}
                  onClick={() => {
                    const next = ownerBanks.filter((_, i) => i !== idx);
                    setOwnerBanks(next);
                    void handleSaveOwnerBankAccounts(next);
                  }}
                  className="text-xs font-bold text-[#cb272f] hover:underline cursor-pointer"
                >
                  Hapus
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-300 text-amber-950 rounded-[14px] p-3.5 text-xs font-semibold">
            ⚠ Anda belum mencantumkan nomor rekening bank. Silakan tambahkan minimal 1 nomor rekening bank Anda di bawah ini agar Super Admin mengetahui rekening tujuan transfer pencairan QRIS Anda.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 bg-[#fafbf9] border border-[#e8ebe6] rounded-[16px] p-3.5 text-xs">
          <div className="sm:col-span-3">
            <label className="block text-[11px] font-bold text-[#0e0f0c] mb-1">
              Nama Bank *
            </label>
            <input
              type="text"
              value={newBankName}
              onChange={(e) => setNewBankName(e.target.value)}
              placeholder="BCA / Mandiri / BRI / BNI / Nobu"
              className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs text-[#0e0f0c] uppercase"
            />
          </div>
          <div className="sm:col-span-4">
            <label className="block text-[11px] font-bold text-[#0e0f0c] mb-1">
              Nomor Rekening *
            </label>
            <input
              type="text"
              value={newAccountNumber}
              onChange={(e) => setNewAccountNumber(e.target.value)}
              placeholder="Contoh: 1234567890"
              className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs font-mono text-[#0e0f0c]"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-[11px] font-bold text-[#0e0f0c] mb-1">
              Atas Nama Pemilik Rekening *
            </label>
            <input
              type="text"
              value={newAccountHolder}
              onChange={(e) => setNewAccountHolder(e.target.value)}
              placeholder="Nama sesuai buku tabungan"
              className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs text-[#0e0f0c]"
            />
          </div>
          <div className="sm:col-span-2 flex items-end">
            <button
              type="button"
              disabled={savingBanks}
              onClick={() => {
                if (!newBankName.trim() || !newAccountNumber.trim()) {
                  onErrorMsg('Isi Nama Bank dan Nomor Rekening terlebih dahulu.');
                  return;
                }
                const next: TenantBankAccountItem[] = [
                  ...ownerBanks,
                  {
                    bankName: newBankName.trim().toUpperCase(),
                    accountNumber: newAccountNumber.trim(),
                    accountHolder: newAccountHolder.trim() || 'Super Owner',
                  },
                ];
                setOwnerBanks(next);
                setNewAccountNumber('');
                setNewAccountHolder('');
                void handleSaveOwnerBankAccounts(next);
              }}
              className="w-full bg-[#163300] hover:bg-[#054d28] text-[#ffffff] font-bold text-xs py-2 px-3 rounded-full cursor-pointer transition-colors disabled:opacity-50"
            >
              {savingBanks ? 'Menyimpan...' : '+ Simpan Rekening'}
            </button>
          </div>
        </div>
      </div>

      {/* Daftar Hasil QRIS Per Cabang & Tombol Tarik per Cabang */}
      <div className="bg-[#ffffff] border border-[#e8ebe6] rounded-[24px] p-5 sm:p-6 space-y-4">
        <div>
          <h3 className="text-lg font-black text-[#0e0f0c] tracking-[-0.02em]">
            1. Hasil QRIS Per Cabang — Periode {MONTH_NAMES[month - 1]} {year}
          </h3>
          <p className="text-xs text-[#6a6c6a]">
            Klik <strong>&ldquo;Tarik Hasil QRIS Cabang Ini ke Super Admin&rdquo;</strong> pada masing-masing cabang untuk mencairkan seluruh transaksi QRIS yang belum ditarik pada bulan tersebut.
          </p>
        </div>

        {branchSummaries.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#6a6c6a] border border-dashed border-[#868685]/40 rounded-[16px]">
            Belum ada cabang yang ditampilkan.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {branchSummaries.map((br) => {
              const isExpanded = expandedBranchId === br.branchId;
              return (
                <div
                  key={br.branchId}
                  className="border border-[#e8ebe6] rounded-[20px] p-5 flex flex-col justify-between gap-4 bg-[#fafbf9]"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-black text-base text-[#0e0f0c]">
                            {br.branchName}
                          </h4>
                          <span className="text-[10px] font-mono bg-[#e8ebe6] text-[#163300] px-2.5 py-0.5 rounded-full font-bold">
                            {br.branchCode}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#6a6c6a] mt-0.5">
                          Periode {MONTH_NAMES[br.periodMonth - 1]} {br.periodYear} •{' '}
                          {br.totalTransactions} transaksi QRIS
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] uppercase font-bold text-[#6a6c6a]">
                          Total QRIS Cabang
                        </div>
                        <div className="font-mono font-black text-base text-[#0e0f0c]">
                          {formatRupiah(br.totalQrisCollected)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-[#ffffff] border border-[#e8ebe6] rounded-[14px] p-3 text-xs">
                      <div>
                        <div className="text-[10px] text-[#163300] font-bold">
                          Sudah Ditarik
                        </div>
                        <div className="font-mono font-black text-[#163300] mt-0.5">
                          {formatRupiah(br.withdrawnApprovedAmount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-amber-800 font-bold">
                          Sedang Diajukan
                        </div>
                        <div className="font-mono font-black text-amber-800 mt-0.5">
                          {formatRupiah(br.pendingWithdrawalAmount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-sky-900 font-bold">
                          Belum Ditarik
                        </div>
                        <div className="font-mono font-black text-sky-900 mt-0.5">
                          {formatRupiah(br.availableToWithdrawAmount)}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="bg-[#ffffff] border border-[#e8ebe6] rounded-[14px] p-3 space-y-2 max-h-56 overflow-y-auto">
                        <div className="text-[11px] font-bold text-[#0e0f0c]">
                          Rincian Transaksi Nota QRIS ({br.transactions.length}):
                        </div>
                        {br.transactions.length === 0 ? (
                          <div className="text-[11px] text-[#6a6c6a] italic">
                            Belum ada pembayaran QRIS di cabang ini pada periode{' '}
                            {MONTH_NAMES[br.periodMonth - 1]} {br.periodYear}.
                          </div>
                        ) : (
                          <div className="divide-y divide-[#e8ebe6] text-[11px]">
                            {br.transactions.map((trx) => (
                              <div
                                key={trx.id}
                                className="py-1.5 flex items-center justify-between gap-2"
                              >
                                <div>
                                  <span className="font-mono font-bold text-[#0e0f0c]">
                                    {trx.orderNumber}
                                  </span>{' '}
                                  — {trx.customerName}
                                  <div className="text-[10px] text-[#6a6c6a]">
                                    {trx.paidAt
                                      ? new Date(trx.paidAt).toLocaleString('id-ID')
                                      : '-'}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-mono font-bold text-[#0e0f0c]">
                                    {formatRupiah(trx.amount)}
                                  </div>
                                  <span
                                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                      trx.withdrawalStatus === 'APPROVED'
                                        ? 'bg-[#e2f6d5] text-[#163300]'
                                        : trx.withdrawalStatus === 'PENDING'
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-sky-100 text-sky-900'
                                    }`}
                                  >
                                    {trx.withdrawalStatus === 'APPROVED'
                                      ? 'SUDAH DITARIK'
                                      : trx.withdrawalStatus === 'PENDING'
                                        ? 'MENUNGGU ACC'
                                        : 'BELUM DITARIK'}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#e8ebe6]">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedBranchId(isExpanded ? null : br.branchId)
                      }
                      className="text-xs font-semibold text-[#163300] hover:underline cursor-pointer"
                    >
                      {isExpanded
                        ? '▲ Sembunyikan Rincian Nota'
                        : `▼ Lihat ${br.transactions.length} Nota QRIS`}
                    </button>

                    <button
                      type="button"
                      disabled={!br.canRequestWithdrawal || submitting}
                      onClick={() => openRequestWithdrawalModal(br)}
                      className="bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] text-xs font-bold px-4 py-2 rounded-full cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      {br.canRequestWithdrawal
                        ? `💸 Tarik Hasil QRIS (${formatRupiah(br.availableToWithdrawAmount)})`
                        : 'Tidak Ada Saldo Belum Ditarik'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Riwayat Pengajuan Penarikan QRIS & Foto Bukti Transfer Super Admin */}
      <div className="bg-[#ffffff] border border-[#e8ebe6] rounded-[24px] p-5 sm:p-6 space-y-4">
        <div>
          <h3 className="text-lg font-black text-[#0e0f0c] tracking-[-0.02em]">
            2. Riwayat Penarikan QRIS &amp; Foto Bukti Transfer dari Super Admin
          </h3>
          <p className="text-xs text-[#6a6c6a]">
            Setelah Super Admin meng-ACC penarikan dan mengunggah foto bukti transfer bank, klik tombol{' '}
            <strong>&ldquo;🖼 Lihat Foto Bukti Transfer&rdquo;</strong> untuk melihat bukti pembayarannya.
          </p>
        </div>

        {withdrawals.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#6a6c6a] border border-dashed border-[#868685]/40 rounded-[16px]">
            Belum ada riwayat pengajuan penarikan hasil QRIS cabang.
          </div>
        ) : (
          <div className="space-y-3">
            {withdrawals.map((w) => (
              <div
                key={w.id}
                className={`border rounded-[18px] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                  w.status === 'APPROVED'
                    ? 'border-[#9fe870] bg-[#e2f6d5]/30'
                    : w.status === 'PENDING'
                      ? 'border-amber-300 bg-amber-50/40'
                      : 'border-[#e8ebe6] bg-[#fafbf9]'
                }`}
              >
                <div className="space-y-1 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                        w.status === 'APPROVED'
                          ? 'bg-[#163300] text-[#ffffff]'
                          : w.status === 'PENDING'
                            ? 'bg-amber-200 text-amber-950'
                            : 'bg-[#cb272f] text-[#ffffff]'
                      }`}
                    >
                      {w.status === 'APPROVED'
                        ? '✓ SUDAH DI-ACC & DITRANSFER SUPER ADMIN'
                        : w.status === 'PENDING'
                          ? '⏳ MENUNGGU ACC SUPER ADMIN'
                          : '✕ DITOLAK'}
                    </span>
                    <span className="font-black text-sm text-[#0e0f0c]">
                      Cabang {w.branchName} ({w.branchCode}) — Periode{' '}
                      {MONTH_NAMES[(w.periodMonth || 1) - 1]} {w.periodYear}
                    </span>
                  </div>

                  <div className="text-[#454745]">
                    Nominal Pencairan:{' '}
                    <strong className="font-mono text-sm text-[#0e0f0c]">
                      {formatRupiah(w.amount)}
                    </strong>{' '}
                    ({w.totalTransactions} transaksi QRIS) • Diajukan pada{' '}
                    {new Date(w.createdAt).toLocaleString('id-ID')}
                  </div>

                  {w.targetBankAccount && (
                    <div className="font-mono text-[11px] bg-[#ffffff] border border-[#e8ebe6] rounded-lg px-2.5 py-1 inline-block text-[#0e0f0c]">
                      🏦 Rekening Tujuan Transfer:{' '}
                      <strong>
                        {w.targetBankAccount.bankName} •{' '}
                        {w.targetBankAccount.accountNumber}
                      </strong>{' '}
                      (a.n. {w.targetBankAccount.accountHolder})
                    </div>
                  )}

                  {w.adminNotes && (
                    <div className="text-[#163300] font-semibold">
                      Catatan Super Admin: &ldquo;{w.adminNotes}&rdquo;
                    </div>
                  )}

                  {w.rejectionReason && (
                    <div className="text-[#cb272f] font-semibold">
                      Alasan Penolakan: {w.rejectionReason}
                    </div>
                  )}
                </div>

                <div className="shrink-0">
                  {w.status === 'APPROVED' && w.transferProof ? (
                    <button
                      type="button"
                      onClick={() => setProofModalItem(w)}
                      className="bg-[#163300] hover:bg-[#054d28] text-[#ffffff] text-xs font-bold px-4 py-2.5 rounded-full cursor-pointer transition-colors"
                    >
                      🖼 Lihat Foto Bukti Transfer
                    </button>
                  ) : w.status === 'PENDING' ? (
                    <span className="text-[11px] font-semibold text-amber-900 bg-amber-100 px-3 py-1.5 rounded-full">
                      Sedang Diproses Super Admin
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL 1: KONFIRMASI AJUKAN PENARIKAN HASIL QRIS CABANG */}
      {requestModalBranch && (
        <div className="fixed inset-0 z-50 bg-[#0e0f0c]/60 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-[#e8ebe6] rounded-[24px] max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#e8ebe6] pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase bg-[#e2f6d5] text-[#163300] px-2.5 py-0.5 rounded-full">
                  Tarik Hasil QRIS Cabang
                </span>
                <h3 className="font-black text-lg text-[#0e0f0c] mt-1">
                  {requestModalBranch.branchName} ({requestModalBranch.branchCode})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRequestModalBranch(null)}
                className="font-bold text-lg text-[#6a6c6a] hover:text-[#0e0f0c] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRequestWithdrawal} className="space-y-4 text-xs">
              <div className="bg-[#fafbf9] border border-[#e8ebe6] rounded-[14px] p-3.5 space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#6a6c6a]">Periode Bulan:</span>
                  <strong className="text-[#0e0f0c]">
                    {MONTH_NAMES[requestModalBranch.periodMonth - 1]}{' '}
                    {requestModalBranch.periodYear}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6a6c6a]">Jumlah Transaksi QRIS:</span>
                  <strong className="text-[#0e0f0c]">
                    {requestModalBranch.unwithdrawnTransactionsCount} Nota Belum Ditarik
                  </strong>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-[#e8ebe6] text-sm">
                  <span className="font-bold text-[#0e0f0c]">Total Ditarik:</span>
                  <strong className="font-mono font-black text-[#163300]">
                    {formatRupiah(requestModalBranch.availableToWithdrawAmount)}
                  </strong>
                </div>
              </div>

              {/* Pilihan Rekening Tujuan */}
              <div className="space-y-2">
                <label className="block font-bold text-[#0e0f0c]">
                  Rekening Bank Penerima Transfer:
                </label>

                {registeredBanks.length > 0 && (
                  <div className="space-y-1.5">
                    {registeredBanks.map((b, idx) => (
                      <label
                        key={`${b.bankName}-${b.accountNumber}-${idx}`}
                        onClick={() => {
                          setUseCustomBank(false);
                          setSelectedBankIndex(idx);
                        }}
                        className={`flex items-center justify-between p-2.5 rounded-[12px] border cursor-pointer ${
                          !useCustomBank && selectedBankIndex === idx
                            ? 'border-[#163300] bg-[#e2f6d5]/60'
                            : 'border-[#e8ebe6] bg-[#ffffff]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={!useCustomBank && selectedBankIndex === idx}
                            onChange={() => {
                              setUseCustomBank(false);
                              setSelectedBankIndex(idx);
                            }}
                          />
                          <div>
                            <div className="font-mono font-bold text-[#0e0f0c]">
                              {b.bankName} • {b.accountNumber}
                            </div>
                            <div className="text-[11px] text-[#6a6c6a]">
                              a.n. {b.accountHolder}
                            </div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                <label className="flex items-center gap-2 font-semibold text-[#163300] cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={useCustomBank}
                    onChange={(e) => setUseCustomBank(e.target.checked)}
                  />
                  <span>Gunakan Rekening Bank Lainnya</span>
                </label>

                {useCustomBank && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-[#fafbf9] border border-[#e8ebe6] rounded-[12px] p-3">
                    <div>
                      <label className="block text-[11px] font-bold mb-1">
                        Bank *
                      </label>
                      <input
                        type="text"
                        required={useCustomBank}
                        value={customBankName}
                        onChange={(e) => setCustomBankName(e.target.value)}
                        placeholder="BCA / Mandiri"
                        className="w-full bg-[#ffffff] border border-[#868685] rounded-lg px-2.5 py-1.5 uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold mb-1">
                        No. Rekening *
                      </label>
                      <input
                        type="text"
                        required={useCustomBank}
                        value={customAccountNumber}
                        onChange={(e) => setCustomAccountNumber(e.target.value)}
                        placeholder="1234567890"
                        className="w-full bg-[#ffffff] border border-[#868685] rounded-lg px-2.5 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold mb-1">
                        Atas Nama *
                      </label>
                      <input
                        type="text"
                        required={useCustomBank}
                        value={customAccountHolder}
                        onChange={(e) => setCustomAccountHolder(e.target.value)}
                        placeholder="Nama Pemilik"
                        className="w-full bg-[#ffffff] border border-[#868685] rounded-lg px-2.5 py-1.5"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-[#0e0f0c] mb-1">
                  Catatan untuk Super Admin (Opsional)
                </label>
                <input
                  type="text"
                  value={ownerNotes}
                  onChange={(e) => setOwnerNotes(e.target.value)}
                  placeholder="Contoh: Mohon ditransfer ke rekening BCA Cabang Utama"
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#e8ebe6]">
                <button
                  type="button"
                  onClick={() => setRequestModalBranch(null)}
                  className="px-4 py-2 rounded-full border border-[#163300] text-[#163300] font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] font-bold px-5 py-2 rounded-full cursor-pointer disabled:opacity-50"
                >
                  {submitting
                    ? 'Mengirim Pengajuan...'
                    : '💸 Kirim Pengajuan ke Super Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: LIHAT FOTO BUKTI TRANSFER DARI SUPER ADMIN */}
      {proofModalItem && (
        <div className="fixed inset-0 z-50 bg-[#0e0f0c]/60 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] border border-[#e8ebe6] rounded-[24px] max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#e8ebe6] pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase bg-[#e2f6d5] text-[#163300] px-2.5 py-0.5 rounded-full">
                  Bukti Transfer Resmi Super Admin
                </span>
                <h3 className="font-black text-lg text-[#0e0f0c] mt-1">
                  Cabang {proofModalItem.branchName} —{' '}
                  {MONTH_NAMES[(proofModalItem.periodMonth || 1) - 1]}{' '}
                  {proofModalItem.periodYear}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setProofModalItem(null)}
                className="font-bold text-lg text-[#6a6c6a] hover:text-[#0e0f0c] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-[#fafbf9] border border-[#e8ebe6] rounded-[14px] p-3.5 text-xs space-y-1">
              <div>
                Nominal Ditransfer:{' '}
                <strong className="font-mono text-sm text-[#163300]">
                  {formatRupiah(proofModalItem.amount)}
                </strong>
              </div>
              {proofModalItem.targetBankAccount && (
                <div>
                  Rekening Tujuan:{' '}
                  <strong className="font-mono">
                    {proofModalItem.targetBankAccount.bankName} •{' '}
                    {proofModalItem.targetBankAccount.accountNumber} (a.n.{' '}
                    {proofModalItem.targetBankAccount.accountHolder})
                  </strong>
                </div>
              )}
              {proofModalItem.reviewedAt && (
                <div>
                  Waktu ACC Super Admin:{' '}
                  {new Date(proofModalItem.reviewedAt).toLocaleString('id-ID')}
                </div>
              )}
              {proofModalItem.adminNotes && (
                <div>Catatan Super Admin: {proofModalItem.adminNotes}</div>
              )}
            </div>

            {proofModalItem.transferProof && (
              <div className="bg-[#fafbf9] border border-[#e8ebe6] rounded-[14px] p-3 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proofModalItem.transferProof}
                  alt="Foto Bukti Transfer Pencairan QRIS"
                  className="max-h-[58vh] w-auto rounded-lg object-contain"
                />
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setProofModalItem(null)}
                className="bg-[#163300] hover:bg-[#054d28] text-[#ffffff] text-xs font-bold px-5 py-2 rounded-full cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
