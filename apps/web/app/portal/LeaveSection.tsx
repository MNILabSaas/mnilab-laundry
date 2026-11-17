'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  apiFetch,
  EXPENSE_APPROVAL_LABELS,
  LEAVE_TYPE_LABELS,
  type ExpenseApprovalStatus,
  type LeaveRequestItem,
  type LeaveType,
} from '../lib/api';

/**
 * Halaman Pengajuan Cuti / Minta Libur untuk Setiap Pegawai (Kasir, Cuci, Setrika)
 */
export function StaffLeaveSection({
  todayStr,
  onSuccessMsg,
  onErrorMsg,
}: {
  todayStr: string;
  onSuccessMsg: (msg: string) => void;
  onErrorMsg: (msg: string) => void;
}) {
  const [leaves, setLeaves] = useState<LeaveRequestItem[]>([]);
  const [leaveType, setLeaveType] = useState<LeaveType>('CUTI');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadLeaves = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: LeaveRequestItem[] }>('/leaves?limit=100');
      setLeaves(res.data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadLeaves();
  }, [loadLeaves]);

  async function handleSubmitLeave(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/leaves', {
        method: 'POST',
        body: JSON.stringify({
          leaveType,
          startDate,
          endDate,
          reason: reason.trim(),
        }),
      });
      setReason('');
      onSuccessMsg(
        'Pengajuan cuti / izin libur berhasil dikirim dan menunggu persetujuan (ACC) Owner Cabang / Super Owner.',
      );
      await loadLeaves();
    } catch (err) {
      onErrorMsg(err instanceof Error ? err.message : 'Gagal mengirim pengajuan cuti');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-5">
        <div>
          <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">
            RIWAYAT PENGAJUAN CUTI &amp; LIBUR SAYA
          </h2>
          <p className="text-[13px] text-[#454745] mt-1">
            Pantau status persetujuan (ACC) pengajuan cuti atau izin libur Anda dari Owner Cabang maupun Super Owner.
          </p>
        </div>

        <div className="space-y-3">
          {leaves.map((lv) => (
            <div
              key={lv.id}
              className="bg-[#ffffff] rounded-[12px] p-5 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[15px] text-[#0e0f0c]">
                    {LEAVE_TYPE_LABELS[lv.leaveType] || lv.leaveType}
                  </span>
                  <span className="text-[12px] bg-[#e8ebe6] text-[#163300] font-semibold px-3 py-0.5 rounded-full">
                    {lv.totalDays} Hari ({lv.startDate} s/d {lv.endDate})
                  </span>
                </div>
                <div className="text-[13px] text-[#454745]">
                  Alasan: <strong className="text-[#0e0f0c]">{lv.reason}</strong>
                </div>
                {lv.reviewedBy && (
                  <div className="text-[12px] text-[#6a6c6a]">
                    Diproses oleh: <strong>{lv.reviewedBy.name}</strong>
                    {lv.reviewNotes ? ` — Catatan: "${lv.reviewNotes}"` : ''}
                  </div>
                )}
              </div>

              <div>
                <span
                  className={`text-[12px] font-semibold px-3.5 py-1 rounded-full ${
                    lv.status === 'APPROVED'
                      ? 'bg-[#9fe870] text-[#163300]'
                      : lv.status === 'REJECTED'
                        ? 'bg-[#cb272f] text-[#ffffff]'
                        : 'bg-[#163300] text-[#9fe870]'
                  }`}
                >
                  {EXPENSE_APPROVAL_LABELS[lv.status]}
                </span>
              </div>
            </div>
          ))}

          {leaves.length === 0 && (
            <div className="bg-[#ffffff] rounded-[12px] p-10 text-center text-[13px] text-[#6a6c6a]">
              Anda belum pernah mengajukan permohonan cuti atau izin libur.
            </div>
          )}
        </div>
      </div>

      {/* Form Pengajuan Cuti / Minta Libur */}
      <form
        onSubmit={handleSubmitLeave}
        className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-4 h-fit"
      >
        <h3 className="font-black text-[20px] text-[#0e0f0c] uppercase">
          AJUKAN CUTI / MINTA LIBUR
        </h3>

        <div>
          <label className="block text-[13px] font-semibold text-[#0e0f0c] mb-1">
            Jenis Pengajuan *
          </label>
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value as LeaveType)}
            className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-[14px] text-[#0e0f0c]"
          >
            <option value="CUTI">Cuti Tahunan / Resmi</option>
            <option value="IZIN">Minta Libur / Izin Pribadi</option>
            <option value="SAKIT">Izin Sakit</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[13px] font-semibold text-[#0e0f0c] mb-1">
              Tanggal Mulai *
            </label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }}
              className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-[13px] text-[#0e0f0c]"
            />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#0e0f0c] mb-1">
              Tanggal Selesai *
            </label>
            <input
              type="date"
              required
              min={startDate}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-[13px] text-[#0e0f0c]"
            />
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-semibold text-[#0e0f0c] mb-1">
            Alasan Cuti / Minta Libur *
          </label>
          <textarea
            rows={3}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Jelaskan keperluan cuti atau izin libur Anda..."
            className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] p-3 text-[13px] text-[#0e0f0c]"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] font-semibold text-[15px] py-3 rounded-full cursor-pointer transition-colors disabled:opacity-50"
        >
          {submitting ? 'Mengirim...' : 'Kirim Pengajuan Cuti / Libur'}
        </button>
      </form>
    </section>
  );
}

/**
 * Halaman Persetujuan (ACC) Cuti / Minta Libur Pegawai untuk Owner Cabang & Super Owner
 */
export function OwnerLeaveApprovalSection({
  selectedBranchId,
  onSuccessMsg,
  onErrorMsg,
  onDecisionDone,
}: {
  selectedBranchId: string;
  onSuccessMsg: (msg: string) => void;
  onErrorMsg: (msg: string) => void;
  onDecisionDone: () => void;
}) {
  const [leaves, setLeaves] = useState<LeaveRequestItem[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const loadLeaves = useCallback(async () => {
    try {
      const branchParam = selectedBranchId ? `&branchId=${selectedBranchId}` : '';
      const statusParam = filterStatus !== 'ALL' ? `&status=${filterStatus}` : '';
      const res = await apiFetch<{ data: LeaveRequestItem[] }>(
        `/leaves?limit=100${branchParam}${statusParam}`,
      );
      setLeaves(res.data);
    } catch {
      // ignore
    }
  }, [selectedBranchId, filterStatus]);

  useEffect(() => {
    void loadLeaves();
  }, [loadLeaves]);

  async function handleDecide(
    id: string,
    status: ExpenseApprovalStatus,
    reviewNotes?: string,
  ) {
    try {
      await apiFetch(`/leaves/${id}/decide`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reviewNotes }),
      });
      setRejectModalId(null);
      setRejectNote('');
      onSuccessMsg(
        `Pengajuan cuti/libur pegawai berhasil ${status === 'APPROVED' ? 'di-ACC (Disetujui)' : 'ditolak'}.`,
      );
      await loadLeaves();
      onDecisionDone();
    } catch (err) {
      onErrorMsg(err instanceof Error ? err.message : 'Gagal memproses pengajuan cuti');
    }
  }

  return (
    <section className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">
            PERSETUJUAN (ACC) CUTI &amp; LIBUR PEGAWAI
          </h2>
          <p className="text-[13px] text-[#454745] mt-1">
            Owner Cabang dan Super Owner dapat menyetujui (ACC) atau menolak permohonan cuti maupun izin libur pegawai.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#454745]">Filter Status:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-xs font-semibold text-[#0e0f0c]"
          >
            <option value="ALL">Semua Pengajuan</option>
            <option value="PENDING">Menunggu ACC (Pending)</option>
            <option value="APPROVED">Disetujui (ACC)</option>
            <option value="REJECTED">Ditolak</option>
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {leaves.map((lv) => (
          <div
            key={lv.id}
            className="bg-[#ffffff] rounded-[14px] p-5 flex flex-wrap items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-[15px] text-[#0e0f0c]">
                  {lv.user?.name || 'Pegawai'}
                </span>
                <span className="text-[11px] font-semibold bg-[#163300] text-[#9fe870] px-2.5 py-0.5 rounded-full">
                  {lv.user?.role}
                </span>
                {lv.branch && (
                  <span className="text-[11px] font-semibold bg-[#e2f6d5] text-[#163300] px-2.5 py-0.5 rounded-full">
                    {lv.branch.name}
                  </span>
                )}
                <span
                  className={`text-[11px] font-bold px-3 py-0.5 rounded-full ${
                    lv.status === 'APPROVED'
                      ? 'bg-[#9fe870] text-[#163300]'
                      : lv.status === 'REJECTED'
                        ? 'bg-[#cb272f] text-[#ffffff]'
                        : 'bg-[#e8ebe6] text-[#163300]'
                  }`}
                >
                  {EXPENSE_APPROVAL_LABELS[lv.status]}
                </span>
              </div>

              <div className="text-[13px] text-[#0e0f0c] font-semibold pt-1">
                {LEAVE_TYPE_LABELS[lv.leaveType]} • {lv.totalDays} Hari ({lv.startDate} s/d{' '}
                {lv.endDate})
              </div>
              <div className="text-[13px] text-[#454745]">
                Alasan: <strong>{lv.reason}</strong>
              </div>
              {lv.reviewedBy && (
                <div className="text-[11px] text-[#6a6c6a]">
                  Keputusan oleh: <strong>{lv.reviewedBy.name}</strong>
                  {lv.reviewNotes ? ` — Catatan: "${lv.reviewNotes}"` : ''}
                </div>
              )}
            </div>

            {lv.status === 'PENDING' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRejectModalId(lv.id);
                    setRejectNote('');
                  }}
                  className="bg-[#cb272f] text-[#ffffff] hover:opacity-90 text-xs font-semibold px-4 py-2 rounded-full cursor-pointer"
                >
                  Tolak
                </button>
                <button
                  type="button"
                  onClick={() => void handleDecide(lv.id, 'APPROVED')}
                  className="bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] text-xs font-semibold px-5 py-2 rounded-full cursor-pointer"
                >
                  ACC / Setujui Cuti
                </button>
              </div>
            )}
          </div>
        ))}

        {leaves.length === 0 && (
          <div className="bg-[#ffffff] rounded-[12px] p-10 text-center text-[13px] text-[#6a6c6a]">
            Belum ada data pengajuan cuti atau izin libur untuk filter ini.
          </div>
        )}
      </div>

      {rejectModalId && (
        <div className="fixed inset-0 z-50 bg-[#0e0f0c]/60 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] rounded-[24px] max-w-sm w-full p-6 space-y-4">
            <h3 className="font-black text-[16px] text-[#0e0f0c] uppercase">
              Tolak Pengajuan Cuti / Libur
            </h3>
            <textarea
              rows={3}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Masukkan alasan penolakan (contoh: Jadwal operasional cabang sedang penuh)..."
              className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] p-3 text-xs text-[#0e0f0c]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModalId(null)}
                className="text-xs font-medium px-4 py-2 rounded-full border border-[#163300] text-[#163300]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void handleDecide(rejectModalId, 'REJECTED', rejectNote)}
                className="text-xs font-semibold bg-[#cb272f] text-[#ffffff] px-5 py-2 rounded-full cursor-pointer"
              >
                Konfirmasi Tolak
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

