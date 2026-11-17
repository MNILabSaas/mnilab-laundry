'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import {
  apiFetch,
  EXPENSE_APPROVAL_LABELS,
  formatRupiah,
  type AuthUser,
  type Branch,
  type ExpenseApprovalStatus,
  type IroningEarningsResponse,
  type IroningPayoutItem,
} from '../lib/api';

export const MONTH_NAMES = [
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

/**
 * Kompresi dan validasi file bukti transfer agar siap diunggah sebagai Safe Data URI JPEG.
 */
export function processTransferProofFile(file: File, maxDim = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File harus berupa gambar (JPG, PNG, atau WebP)'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.85);
        resolve(compressed);
      };
      img.onerror = () => reject(new Error('Format file gambar tidak valid'));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Download rekapan bulanan setrika pegawai ke file Excel (.xls) dengan tabel lengkap dan baris total di bagian bawah.
 */
export function exportIroningRecapToExcel(
  earnings: IroningEarningsResponse,
  branchName?: string,
) {
  const empName = earnings.employee?.name || 'Pegawai Setrika';
  const monthName = MONTH_NAMES[earnings.month - 1] || `Bulan ${earnings.month}`;
  const year = earnings.year;
  const fileName = `Rekap_Setrika_${empName.replace(/[^a-zA-Z0-9]/g, '_')}_${monthName}_${year}.xls`;

  const totalItems = earnings.items?.length || 0;
  const totalWeight = earnings.items?.reduce((sum, it) => sum + (it.weightKg || it.quantity || 0), 0) || 0;
  const totalWage = earnings.items?.reduce((sum, it) => sum + it.ironingWage, 0) || 0;
  const paidWage = earnings.items?.filter((it) => it.isPaid).reduce((sum, it) => sum + it.ironingWage, 0) || 0;
  const unpaidWage = totalWage - paidWage;

  const rowsHtml = (earnings.items || [])
    .map((it, idx) => {
      const dateStr = it.completedAt
        ? new Date(it.completedAt).toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '-';
      const weightDisplay = it.weightKg && it.weightKg > 0 ? `${it.weightKg} kg` : `${it.quantity} item`;
      const statusWage = it.isPaid ? 'Lunas Ditransfer' : it.isPending ? 'Menunggu Transfer' : 'Belum Dicairkan';
      const statusBg = it.isPaid ? '#e2f6d5' : it.isPending ? '#fef9c3' : '#f3f4f6';

      return `
        <tr>
          <td style="text-align: center; border: 1px solid #ccc; padding: 6px;">${idx + 1}</td>
          <td style="border: 1px solid #ccc; padding: 6px;">${dateStr}</td>
          <td style="border: 1px solid #ccc; padding: 6px; font-weight: bold;">${it.orderNumber || '-'}</td>
          <td style="border: 1px solid #ccc; padding: 6px;">${it.customerName || '-'}</td>
          <td style="border: 1px solid #ccc; padding: 6px; mso-number-format:'\\@';">${it.customerPhone || '-'}</td>
          <td style="border: 1px solid #ccc; padding: 6px;">${it.serviceName || '-'}</td>
          <td style="text-align: right; border: 1px solid #ccc; padding: 6px;">${weightDisplay}</td>
          <td style="text-align: right; border: 1px solid #ccc; padding: 6px;">Rp ${(it.ironingRate || 0).toLocaleString('id-ID')}</td>
          <td style="text-align: right; border: 1px solid #ccc; padding: 6px; font-weight: bold;">Rp ${(it.ironingWage || 0).toLocaleString('id-ID')}</td>
          <td style="text-align: center; border: 1px solid #ccc; padding: 6px; background-color: ${statusBg};">${statusWage}</td>
        </tr>
      `;
    })
    .join('');

  const htmlContent = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <!--[if gte mso 9]>
      <xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>Rekap Setrika</x:Name>
              <x:WorksheetOptions>
                <x:DisplayGridlines/>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml>
      <![endif]-->
      <style>
        body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; }
        table { border-collapse: collapse; width: 100%; font-size: 11pt; }
        th { background-color: #163300; color: #ffffff; font-weight: bold; text-align: center; border: 1px solid #444; padding: 8px; }
        td { border: 1px solid #ccc; padding: 6px; }
        .title { font-size: 16pt; font-weight: bold; color: #163300; margin-bottom: 4px; }
        .meta { font-size: 10pt; color: #454745; margin-bottom: 12px; }
        .summary-box { background-color: #e2f6d5; border: 1px solid #9fe870; padding: 10px; margin-bottom: 16px; }
        .total-row { background-color: #f7f9f5; font-weight: bold; border-top: 2px solid #163300; font-size: 11pt; }
      </style>
    </head>
    <body>
      <div class="title">REKAPAN UPAT SETRIKA BULANAN</div>
      <div class="meta">
        <strong>Pegawai:</strong> ${empName} | 
        <strong>Cabang:</strong> ${branchName || earnings.employee?.branchName || '-'} | 
        <strong>Periode:</strong> ${monthName} ${year} | 
        <strong>Diunduh pada:</strong> ${new Date().toLocaleString('id-ID')}
      </div>

      <table style="margin-bottom: 16px; width: 60%;">
        <tr style="background-color: #e2f6d5;">
          <td style="padding: 6px; font-weight: bold;">Total Cucian Selesai:</td>
          <td style="padding: 6px; text-align: right; font-weight: bold;">${totalItems} cucian</td>
        </tr>
        <tr style="background-color: #e2f6d5;">
          <td style="padding: 6px; font-weight: bold;">Total Berat Disetrika:</td>
          <td style="padding: 6px; text-align: right; font-weight: bold;">${totalWeight.toFixed(2)} kg</td>
        </tr>
        <tr style="background-color: #e2f6d5;">
          <td style="padding: 6px; font-weight: bold;">Total Upah Bulan Ini:</td>
          <td style="padding: 6px; text-align: right; font-weight: bold; color: #163300;">Rp ${totalWage.toLocaleString('id-ID')}</td>
        </tr>
        <tr>
          <td style="padding: 6px; color: #163300;">Sudah Ditransfer / Lunas:</td>
          <td style="padding: 6px; text-align: right; font-weight: bold; color: #163300;">Rp ${paidWage.toLocaleString('id-ID')}</td>
        </tr>
        <tr>
          <td style="padding: 6px; color: #854d0e;">Sisa Belum Dicairkan:</td>
          <td style="padding: 6px; text-align: right; font-weight: bold; color: #854d0e;">Rp ${unpaidWage.toLocaleString('id-ID')}</td>
        </tr>
      </table>

      <table>
        <thead>
          <tr>
            <th style="width: 40px;">No</th>
            <th style="width: 140px;">Waktu Selesai</th>
            <th style="width: 130px;">No. Pesanan</th>
            <th style="width: 160px;">Nama Customer</th>
            <th style="width: 130px;">WhatsApp</th>
            <th style="width: 160px;">Layanan</th>
            <th style="width: 90px;">Berat / Qty</th>
            <th style="width: 100px;">Tarif / Kg</th>
            <th style="width: 120px;">Upah Setrika</th>
            <th style="width: 130px;">Status Upah</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="10" style="text-align: center; padding: 12px;">Tidak ada data cucian disetrika pada periode ini.</td></tr>'}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="6" style="text-align: right; font-weight: bold; padding: 8px; border: 1px solid #444; background-color: #dce7d5;">
              TOTAL AKUMULASI:
            </td>
            <td style="text-align: right; font-weight: bold; padding: 8px; border: 1px solid #444; background-color: #dce7d5;">
              ${totalWeight.toFixed(2)} kg
            </td>
            <td style="border: 1px solid #444; background-color: #dce7d5;"></td>
            <td style="text-align: right; font-weight: bold; padding: 8px; border: 1px solid #444; color: #163300; background-color: #dce7d5;">
              Rp ${totalWage.toLocaleString('id-ID')}
            </td>
            <td style="text-align: center; font-weight: bold; padding: 8px; border: 1px solid #444; background-color: #dce7d5;">
              Lunas: Rp ${paidWage.toLocaleString('id-ID')} | Sisa: Rp ${unpaidWage.toLocaleString('id-ID')}
            </td>
          </tr>
        </tfoot>
      </table>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Download rekapan bulanan setrika pegawai ke CSV dengan UTF-8 BOM.
 */
export function exportIroningRecapToCsv(
  earnings: IroningEarningsResponse,
  branchName?: string,
) {
  const empName = earnings.employee?.name || 'Pegawai Setrika';
  const monthName = MONTH_NAMES[earnings.month - 1] || `Bulan ${earnings.month}`;
  const year = earnings.year;
  const fileName = `Rekap_Setrika_${empName.replace(/[^a-zA-Z0-9]/g, '_')}_${monthName}_${year}.csv`;

  const totalItems = earnings.items?.length || 0;
  const totalWeight = earnings.items?.reduce((sum, it) => sum + (it.weightKg || it.quantity || 0), 0) || 0;
  const totalWage = earnings.items?.reduce((sum, it) => sum + it.ironingWage, 0) || 0;
  const paidWage = earnings.items?.filter((it) => it.isPaid).reduce((sum, it) => sum + it.ironingWage, 0) || 0;
  const unpaidWage = totalWage - paidWage;

  const escapeCsv = (val: string | number | null | undefined) => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const lines: string[] = [];
  lines.push(`REKAPAN UPAT SETRIKA BULANAN`);
  lines.push(`Pegawai,${escapeCsv(empName)},Cabang,${escapeCsv(branchName || earnings.employee?.branchName || '-')}`);
  lines.push(`Periode,${escapeCsv(`${monthName} ${year}`)},Tanggal Unduh,${escapeCsv(new Date().toLocaleString('id-ID'))}`);
  lines.push(``);
  lines.push(`RINGKASAN`);
  lines.push(`Total Cucian,${totalItems}`);
  lines.push(`Total Berat (Kg),${totalWeight.toFixed(2)}`);
  lines.push(`Total Upah Bulan Ini,${totalWage}`);
  lines.push(`Sudah Ditransfer / Lunas,${paidWage}`);
  lines.push(`Sisa Belum Dicairkan,${unpaidWage}`);
  lines.push(``);

  lines.push(
    [
      'No',
      'Waktu Selesai',
      'No. Pesanan',
      'Nama Customer',
      'No WhatsApp',
      'Layanan',
      'Berat (Kg) / Qty',
      'Tarif / Kg',
      'Upah Setrika (Rp)',
      'Status Upah',
    ].join(','),
  );

  (earnings.items || []).forEach((it, idx) => {
    const dateStr = it.completedAt ? new Date(it.completedAt).toLocaleString('id-ID') : '-';
    const weightDisplay = it.weightKg && it.weightKg > 0 ? it.weightKg : it.quantity;
    const statusWage = it.isPaid ? 'Lunas Ditransfer' : it.isPending ? 'Menunggu Transfer' : 'Belum Dicairkan';
    lines.push(
      [
        idx + 1,
        escapeCsv(dateStr),
        escapeCsv(it.orderNumber),
        escapeCsv(it.customerName),
        escapeCsv(it.customerPhone || '-'),
        escapeCsv(it.serviceName),
        weightDisplay,
        it.ironingRate || 0,
        it.ironingWage || 0,
        escapeCsv(statusWage),
      ].join(','),
    );
  });

  // Footer baris total
  lines.push(``);
  lines.push(
    [
      'TOTAL',
      '""',
      '""',
      '""',
      '""',
      '""',
      totalWeight.toFixed(2),
      '""',
      totalWage,
      escapeCsv(`Lunas: Rp ${paidWage.toLocaleString('id-ID')} | Sisa: Rp ${unpaidWage.toLocaleString('id-ID')}`),
    ].join(','),
  );

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Modal untuk menampilkan bukti transfer resmi yang telah diunggah oleh owner.
 */
export function ProofTransferModal({
  payout,
  onClose,
}: {
  payout: IroningPayoutItem;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#ffffff] rounded-[24px] max-w-lg w-full p-6 sm:p-8 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e8ebe6] pb-3">
          <div>
            <h3 className="text-lg font-black text-[#0e0f0c]">Bukti Transfer Upah Setrika</h3>
            <p className="text-xs text-[#6a6c6a]">
              Periode {MONTH_NAMES[payout.periodMonth - 1]} {payout.periodYear} • {payout.employee?.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#6a6c6a] hover:text-[#0e0f0c] hover:bg-[#e8ebe6] rounded-full transition-colors cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center bg-[#e2f6d5] p-3 rounded-[12px]">
            <div>
              <span className="text-xs text-[#163300] block">Nominal Ditransfer:</span>
              <span className="text-xl font-black text-[#163300]">{formatRupiah(payout.amount)}</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-[#163300] block">Dibayar Pada:</span>
              <span className="text-xs font-semibold text-[#163300]">
                {payout.paidAt ? new Date(payout.paidAt).toLocaleDateString('id-ID') : '-'}
              </span>
            </div>
          </div>

          {payout.paidBy && (
            <div className="text-xs text-[#454745]">
              Diproses oleh: <strong>{payout.paidBy.name}</strong>
            </div>
          )}

          {payout.paymentNotes && (
            <div className="bg-[#f7f9f5] border border-[#d8dcd5] rounded-[10px] p-2.5 text-xs">
              <span className="font-semibold text-[#0e0f0c] block">Catatan Pembayaran:</span>
              <span className="text-[#454745]">{payout.paymentNotes}</span>
            </div>
          )}

          {payout.transferProof ? (
            <div className="border border-[#163300]/20 rounded-[16px] overflow-hidden bg-[#000000]/5 p-2 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={payout.transferProof}
                alt="Bukti Transfer"
                className="max-h-[380px] w-auto object-contain rounded-[8px]"
              />
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#6a6c6a] bg-[#f7f9f5] rounded-[12px]">
              Belum ada foto bukti transfer yang dilampirkan.
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-[#163300] text-[#ffffff] text-xs font-bold hover:bg-[#204702] transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal untuk Pegawai Setrika mengajukan pencairan upah ke owner.
 */
export function RequestPayoutModal({
  month,
  year,
  amount,
  totalItems,
  onClose,
  onSubmit,
}: {
  month: number;
  year: number;
  amount: number;
  totalItems: number;
  onClose: () => void;
  onSubmit: (employeeNotes: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!notes.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(notes.trim());
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#ffffff] rounded-[24px] max-w-md w-full p-6 sm:p-8 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e8ebe6] pb-3">
          <div>
            <h3 className="text-lg font-black text-[#0e0f0c]">Ajukan Pencairan Upah</h3>
            <p className="text-xs text-[#6a6c6a]">Periode {MONTH_NAMES[month - 1]} {year}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#6a6c6a] hover:text-[#0e0f0c] hover:bg-[#e8ebe6] rounded-full transition-colors cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>

        <div className="bg-[#e2f6d5] border border-[#9fe870] rounded-[16px] p-4 text-center">
          <div className="text-xs text-[#163300] font-medium">Total Upah yang Diajukan</div>
          <div className="text-3xl font-black text-[#163300] mt-1">{formatRupiah(amount)}</div>
          <div className="text-[11px] text-[#454745] mt-1">Dari {totalItems} cucian yang selesai disetrika</div>
        </div>

        <form onSubmit={(e) => void handleSend(e)} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#0e0f0c] mb-1">
              Nomor Rekening / E-Wallet Tujuan Transfer <span className="text-[#cb272f]">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: BCA 8830123456 a/n Siti Rahmawati atau DANA 08123456789"
              className="w-full bg-[#fbfdf9] border border-[#868685] rounded-[12px] p-3 text-xs text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
            />
            <p className="text-[11px] text-[#6a6c6a] mt-1">
              Tuliskan nama bank/e-wallet, nomor rekening, dan nama pemilik rekening dengan jelas agar owner dapat mentransfer upah Anda.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2 rounded-full border border-[#868685] text-xs font-semibold text-[#454745] hover:bg-[#e8ebe6] cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting || !notes.trim()}
              className="px-6 py-2 rounded-full bg-[#163300] text-[#ffffff] text-xs font-bold hover:bg-[#204702] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Mengirim...' : 'Kirim Pengajuan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Section Pemilik / Owner: Monitoring & Persetujuan Pengajuan Upah Setrika + Rekapan Bulanan Per Pegawai.
 */
export function OwnerIroningPayoutSection({
  selectedBranchId,
  branches,
  isSuperOwner,
  onSuccessMsg,
  onErrorMsg,
  onUpdate,
}: {
  selectedBranchId: string;
  branches: Branch[];
  isSuperOwner: boolean;
  onSuccessMsg: (msg: string) => void;
  onErrorMsg: (msg: string) => void;
  onUpdate: () => void;
}) {
  // Sub-tab: 'APPROVALS' (Persetujuan Transfer) atau 'RECAP' (Rekapan Bulanan Pegawai)
  const [subTab, setSubTab] = useState<'APPROVALS' | 'RECAP'>('APPROVALS');

  // State Pengajuan & Persetujuan
  const [payouts, setPayouts] = useState<IroningPayoutItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | ExpenseApprovalStatus>('ALL');

  // Modal states
  const [payTarget, setPayTarget] = useState<IroningPayoutItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<IroningPayoutItem | null>(null);
  const [proofTarget, setProofTarget] = useState<IroningPayoutItem | null>(null);

  // Pay Modal Form
  const [proofDataUrl, setProofDataUrl] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [paySubmitting, setPaySubmitting] = useState(false);

  // Reject Modal Form
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  // State Rekapan Bulanan Pegawai
  const [recapBranchId, setRecapBranchId] = useState(selectedBranchId || '');
  const [ironers, setIroners] = useState<AuthUser[]>([]);
  const [selectedIronerId, setSelectedIronerId] = useState<string>('');
  const [recapMonth, setRecapMonth] = useState<number>(new Date().getMonth() + 1);
  const [recapYear, setRecapYear] = useState<number>(new Date().getFullYear());
  const [recapEarnings, setRecapEarnings] = useState<IroningEarningsResponse | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);

  useEffect(() => {
    if (selectedBranchId && !recapBranchId) {
      setRecapBranchId(selectedBranchId);
    }
  }, [selectedBranchId, recapBranchId]);

  const loadPayouts = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/workflow/ironing-payouts?limit=100';
      if (selectedBranchId) {
        url += `&branchId=${selectedBranchId}`;
      }
      if (statusFilter !== 'ALL') {
        url += `&status=${statusFilter}`;
      }
      const res = await apiFetch<{ data: IroningPayoutItem[] }>(url);
      setPayouts(res.data);
    } catch (err) {
      onErrorMsg(err instanceof Error ? err.message : 'Gagal memuat data pengajuan upah setrika');
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId, statusFilter, onErrorMsg]);

  useEffect(() => {
    void loadPayouts();
  }, [loadPayouts]);

  // Load daftar pegawai setrika untuk dropdown rekapan
  const loadIroners = useCallback(async () => {
    try {
      let url = '/users?role=IRONING';
      if (recapBranchId) {
        url += `&branchId=${recapBranchId}`;
      }
      const res = await apiFetch<{ data: AuthUser[] }>(url);
      setIroners(res.data);
      if (res.data.length > 0 && !selectedIronerId) {
        setSelectedIronerId(res.data[0].id);
      }
    } catch {
      // ignore
    }
  }, [recapBranchId, selectedIronerId]);

  useEffect(() => {
    void loadIroners();
  }, [loadIroners]);

  // Load data detail rekapan bulanan dari pegawai setrika terpilih
  const loadRecapData = useCallback(async () => {
    if (!selectedIronerId) {
      setRecapEarnings(null);
      return;
    }
    setRecapLoading(true);
    try {
      let url = `/workflow/ironing/earnings?employeeId=${selectedIronerId}&month=${recapMonth}&year=${recapYear}`;
      if (recapBranchId) {
        url += `&branchId=${recapBranchId}`;
      }
      const res = await apiFetch<IroningEarningsResponse>(url);
      setRecapEarnings(res);
    } catch (err) {
      onErrorMsg(err instanceof Error ? err.message : 'Gagal memuat rekapan upah pegawai');
    } finally {
      setRecapLoading(false);
    }
  }, [selectedIronerId, recapMonth, recapYear, recapBranchId, onErrorMsg]);

  useEffect(() => {
    if (subTab === 'RECAP' && selectedIronerId) {
      void loadRecapData();
    }
  }, [subTab, selectedIronerId, recapMonth, recapYear, recapBranchId, loadRecapData]);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await processTransferProofFile(file);
      setProofDataUrl(dataUrl);
    } catch (err) {
      onErrorMsg(err instanceof Error ? err.message : 'Gagal memproses file bukti transfer');
    }
  }

  async function handleConfirmPay(e: FormEvent) {
    e.preventDefault();
    if (!payTarget) return;
    if (!proofDataUrl) {
      onErrorMsg('Foto / bukti transfer wajib diunggah sebelum menerima pengajuan');
      return;
    }
    setPaySubmitting(true);
    try {
      await apiFetch(`/workflow/ironing-payouts/${payTarget.id}/pay`, {
        method: 'PATCH',
        body: JSON.stringify({
          transferProof: proofDataUrl,
          paymentNotes: payNotes.trim() || undefined,
        }),
      });
      onSuccessMsg(
        `Pengajuan upah ${payTarget.employee?.name || ''} sebesar ${formatRupiah(payTarget.amount)} berhasil diterima dan bukti transfer telah tersimpan. Saldo upah pegawai otomatis ter-reset.`,
      );
      setPayTarget(null);
      setProofDataUrl('');
      setPayNotes('');
      await loadPayouts();
      if (subTab === 'RECAP') {
        await loadRecapData();
      }
      onUpdate();
    } catch (err) {
      onErrorMsg(err instanceof Error ? err.message : 'Gagal memproses pembayaran upah');
    } finally {
      setPaySubmitting(false);
    }
  }

  async function handleConfirmReject(e: FormEvent) {
    e.preventDefault();
    if (!rejectTarget) return;
    if (!rejectionReason.trim()) {
      onErrorMsg('Alasan penolakan wajib diisi');
      return;
    }
    setRejectSubmitting(true);
    try {
      await apiFetch(`/workflow/ironing-payouts/${rejectTarget.id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({
          rejectionReason: rejectionReason.trim(),
        }),
      });
      onSuccessMsg(`Pengajuan upah ${rejectTarget.employee?.name || ''} telah ditolak.`);
      setRejectTarget(null);
      setRejectionReason('');
      await loadPayouts();
      if (subTab === 'RECAP') {
        await loadRecapData();
      }
      onUpdate();
    } catch (err) {
      onErrorMsg(err instanceof Error ? err.message : 'Gagal menolak pengajuan upah');
    } finally {
      setRejectSubmitting(false);
    }
  }

  const pendingCount = payouts.filter((p) => p.status === 'PENDING').length;
  const currentBranchName = branches.find((b) => b.id === (recapBranchId || selectedBranchId))?.name || 'Semua Cabang';

  return (
    <section className="space-y-6">
      {/* Header dengan Sub-tab Switching */}
      <div className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">
                Upah &amp; Rekapan Setrika Pegawai
              </h2>
              {pendingCount > 0 && (
                <span className="bg-[#cb272f] text-[#ffffff] text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {pendingCount} Menunggu
                </span>
              )}
            </div>
            <p className="text-xs text-[#6a6c6a] mt-1">
              Setujui transfer pengajuan upah mingguan/harian pegawai setrika serta pantau rekapan bulanan per pegawai beserta ekspor Excel.
            </p>
          </div>

          {/* Sub-tab navigation pill */}
          <div className="inline-flex rounded-full bg-[#ffffff] p-1 border border-[#868685]/30">
            <button
              type="button"
              onClick={() => setSubTab('APPROVALS')}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
                subTab === 'APPROVALS'
                  ? 'bg-[#163300] text-[#ffffff] shadow-sm'
                  : 'text-[#454745] hover:text-[#0e0f0c]'
              }`}
            >
              Persetujuan &amp; Transfer ({payouts.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('RECAP')}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                subTab === 'RECAP'
                  ? 'bg-[#163300] text-[#ffffff] shadow-sm'
                  : 'text-[#454745] hover:text-[#0e0f0c]'
              }`}
            >
              <span>📊 Rekapan Bulanan &amp; Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* ===================== TAB 1: PERSETUJUAN TRANSFER ===================== */}
      {subTab === 'APPROVALS' && (
        <div className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#0e0f0c]">Daftar Pengajuan Pencairan Upah</h3>
              <p className="text-xs text-[#6a6c6a]">
                Upload foto/screenshot bukti transfer untuk menyetujui pengajuan. Saldo pegawai akan otomatis direset.
              </p>
            </div>

            {/* Filter Status */}
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'ALL' | ExpenseApprovalStatus)}
                className="bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs font-semibold text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
              >
                <option value="ALL">Semua Status</option>
                <option value="PENDING">Menunggu Transfer (PENDING)</option>
                <option value="APPROVED">Lunas Ditransfer (APPROVED)</option>
                <option value="REJECTED">Ditolak (REJECTED)</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto bg-[#ffffff] rounded-[12px] p-3">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#e8ebe6] text-[#163300] font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3 rounded-l-[8px]">Tgl Pengajuan</th>
                  <th className="py-3 px-3">Pegawai Setrika</th>
                  {isSuperOwner && <th className="py-3 px-3">Cabang</th>}
                  <th className="py-3 px-3">Periode</th>
                  <th className="py-3 px-3">Jumlah Cucian</th>
                  <th className="py-3 px-3">Nominal Upah</th>
                  <th className="py-3 px-3">Rekening Pegawai</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right rounded-r-[8px]">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8ebe6]">
                {payouts.map((p) => {
                  const isPending = p.status === 'PENDING';
                  const isApproved = p.status === 'APPROVED';
                  return (
                    <tr key={p.id} className="hover:bg-[#e2f6d5]/40 transition-colors">
                      <td className="py-3 px-3 text-[#6a6c6a]">
                        {new Date(p.createdAt).toLocaleDateString('id-ID')}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-[#0e0f0c]">{p.employee?.name || '-'}</div>
                        <div className="text-[11px] text-[#6a6c6a]">{p.employee?.phone || p.employee?.email}</div>
                      </td>
                      {isSuperOwner && (
                        <td className="py-3 px-3 text-[#454745]">
                          {p.branch?.name || '-'}
                        </td>
                      )}
                      <td className="py-3 px-3 font-semibold text-[#0e0f0c]">
                        {MONTH_NAMES[p.periodMonth - 1]} {p.periodYear}
                      </td>
                      <td className="py-3 px-3 text-[#454745] font-semibold">{p.totalItems} cucian</td>
                      <td className="py-3 px-3 font-black text-[#163300] text-sm">
                        {formatRupiah(p.amount)}
                      </td>
                      <td className="py-3 px-3 text-[#454745] max-w-[200px]" title={p.employeeNotes || ''}>
                        <div className="line-clamp-2 font-mono text-[11px] bg-[#f7f9f5] p-1.5 rounded-[6px] border border-[#e8ebe6]">
                          {p.employeeNotes || '-'}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isApproved
                              ? 'bg-[#e2f6d5] text-[#163300]'
                              : isPending
                                ? 'bg-[#fef9c3] text-[#854d0e]'
                                : 'bg-[#fee2e2] text-[#991b1b]'
                          }`}
                        >
                          {EXPENSE_APPROVAL_LABELS[p.status] || p.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setPayTarget(p);
                                setProofDataUrl('');
                                setPayNotes('');
                              }}
                              className="bg-[#163300] text-[#ffffff] hover:bg-[#204702] px-3 py-1.5 rounded-full font-bold text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1 shadow-sm"
                            >
                              <span>Bayar &amp; ACC</span>
                              <span>✓</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectTarget(p);
                                setRejectionReason('');
                              }}
                              className="bg-[#ffffff] text-[#991b1b] border border-[#991b1b]/30 hover:bg-[#fee2e2] px-2.5 py-1.5 rounded-full font-semibold text-[11px] transition-colors cursor-pointer"
                            >
                              Tolak
                            </button>
                          </div>
                        ) : isApproved && p.transferProof ? (
                          <button
                            type="button"
                            onClick={() => setProofTarget(p)}
                            className="bg-[#e2f6d5] text-[#163300] hover:bg-[#d0edbe] border border-[#9fe870] px-3 py-1.5 rounded-full font-bold text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>Lihat Bukti</span>
                            <span>📎</span>
                          </button>
                        ) : isApproved ? (
                          <span className="text-[#163300] font-semibold text-[11px]">Lunas</span>
                        ) : (
                          <span className="text-[#991b1b] text-[11px]" title={p.rejectionReason || ''}>
                            Ditolak
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {payouts.length === 0 && !loading && (
                  <tr>
                    <td colSpan={isSuperOwner ? 9 : 8} className="py-8 text-center text-[#6a6c6a]">
                      Tidak ada data pengajuan upah setrika untuk filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================== TAB 2: REKAPAN BULANAN PEGAWAI ===================== */}
      {subTab === 'RECAP' && (
        <div className="space-y-6">
          {/* Filter Bar: Branch, Pegawai, Bulan & Tahun, Tombol Download */}
          <div className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-[#0e0f0c]">
                  Monitoring Bulanan Pegawai Setrika
                </h3>
                <p className="text-xs text-[#6a6c6a]">
                  Pantau seluruh data cucian customer yang disetrika per pegawai sepanjang bulan, beserta total dan status pembayarannya.
                </p>
              </div>

              {/* Action Buttons: Download Excel & CSV */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!recapEarnings || recapEarnings.items.length === 0}
                  onClick={() => {
                    if (recapEarnings) {
                      exportIroningRecapToExcel(recapEarnings, currentBranchName);
                    }
                  }}
                  className="bg-[#163300] text-[#ffffff] hover:bg-[#204702] px-4 py-2 rounded-full font-bold text-xs transition-colors cursor-pointer inline-flex items-center gap-2 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>📊 Unduh Excel (.xls)</span>
                </button>
                <button
                  type="button"
                  disabled={!recapEarnings || recapEarnings.items.length === 0}
                  onClick={() => {
                    if (recapEarnings) {
                      exportIroningRecapToCsv(recapEarnings, currentBranchName);
                    }
                  }}
                  className="bg-[#ffffff] text-[#163300] border border-[#163300] hover:bg-[#e2f6d5] px-4 py-2 rounded-full font-semibold text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>Unduh CSV</span>
                </button>
              </div>
            </div>

            {/* Filter controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              {/* Branch Filter (Super Owner) */}
              {isSuperOwner && (
                <div>
                  <label className="block text-[11px] font-bold text-[#454745] mb-1">Pilih Cabang</label>
                  <select
                    value={recapBranchId}
                    onChange={(e) => {
                      setRecapBranchId(e.target.value);
                      setSelectedIronerId('');
                    }}
                    className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs font-semibold text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                  >
                    <option value="">Semua Cabang</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Pegawai Setrika Selector */}
              <div>
                <label className="block text-[11px] font-bold text-[#454745] mb-1">
                  Pilih Pegawai Setrika <span className="text-[#cb272f]">*</span>
                </label>
                <select
                  value={selectedIronerId}
                  onChange={(e) => setSelectedIronerId(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs font-semibold text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                >
                  <option value="" disabled>-- Pilih Pegawai Setrika --</option>
                  {ironers.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} {emp.phone ? `(${emp.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Bulan */}
              <div>
                <label className="block text-[11px] font-bold text-[#454745] mb-1">Bulan</label>
                <select
                  value={recapMonth}
                  onChange={(e) => setRecapMonth(Number(e.target.value))}
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs font-semibold text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                >
                  {MONTH_NAMES.map((name, i) => (
                    <option key={i + 1} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tahun */}
              <div>
                <label className="block text-[11px] font-bold text-[#454745] mb-1">Tahun</label>
                <select
                  value={recapYear}
                  onChange={(e) => setRecapYear(Number(e.target.value))}
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs font-semibold text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                >
                  {[recapYear - 1, recapYear, recapYear + 1].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Cards Ringkasan Akumulasi */}
          {recapEarnings && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#ffffff] border border-[#e8ebe6] rounded-[20px] p-5 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#6a6c6a]">
                  Total Upah Bulan Ini
                </div>
                <div className="text-2xl font-black text-[#163300] mt-1">
                  {formatRupiah(recapEarnings.monthTotalEarnings ?? recapEarnings.totalEarnings)}
                </div>
                <div className="text-[11px] text-[#454745] mt-1">
                  Akumulasi sepanjang {MONTH_NAMES[recapMonth - 1]} {recapYear}
                </div>
              </div>

              <div className="bg-[#ffffff] border border-[#e8ebe6] rounded-[20px] p-5 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#6a6c6a]">
                  Sudah Ditransfer / Lunas
                </div>
                <div className="text-2xl font-black text-[#163300] mt-1">
                  {formatRupiah(recapEarnings.paidEarnings || 0)}
                </div>
                <div className="text-[11px] text-[#163300] font-semibold mt-1">
                  {recapEarnings.paidItemsCount || 0} cucian lunas
                </div>
              </div>

              <div className="bg-[#ffffff] border border-[#e8ebe6] rounded-[20px] p-5 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#6a6c6a]">
                  Sisa Belum Dicairkan
                </div>
                <div className="text-2xl font-black text-[#854d0e] mt-1">
                  {formatRupiah(recapEarnings.unpaidEarnings || 0)}
                </div>
                <div className="text-[11px] text-[#854d0e] font-semibold mt-1">
                  {recapEarnings.unpaidItemsCount || 0} cucian siap diajukan
                </div>
              </div>

              <div className="bg-[#ffffff] border border-[#e8ebe6] rounded-[20px] p-5 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#6a6c6a]">
                  Total Cucian &amp; Berat
                </div>
                <div className="text-2xl font-black text-[#0e0f0c] mt-1">
                  {recapEarnings.totalItems} cucian
                </div>
                <div className="text-[11px] text-[#454745] mt-1">
                  Total {recapEarnings.totalWeightKg ?? 0} kg pakaian
                </div>
              </div>
            </div>
          )}

          {/* Tabel Detail Seluruh Pesanan Customer + Baris Total di Bagian Bawah */}
          <div className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-[#0e0f0c]">
                  Rincian Cucian Customer yang Disetrika ({MONTH_NAMES[recapMonth - 1]} {recapYear})
                </h4>
                <p className="text-xs text-[#6a6c6a]">
                  Semua transaksi laundry customer yang dikerjakan oleh pegawai ini.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto bg-[#ffffff] rounded-[16px] p-3 shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#e8ebe6] text-[#163300] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-3 rounded-l-[8px] text-center w-10">No</th>
                    <th className="py-3 px-3">Waktu Selesai</th>
                    <th className="py-3 px-3">No. Pesanan</th>
                    <th className="py-3 px-3">Nama Customer</th>
                    <th className="py-3 px-3">WhatsApp</th>
                    <th className="py-3 px-3">Layanan</th>
                    <th className="py-3 px-3 text-right">Berat / Qty</th>
                    <th className="py-3 px-3 text-right">Tarif / Kg</th>
                    <th className="py-3 px-3 text-right">Upah Setrika</th>
                    <th className="py-3 px-3 text-center rounded-r-[8px]">Status Upah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8ebe6]">
                  {recapEarnings?.items?.map((it, idx) => {
                    const weightDisplay = it.weightKg && it.weightKg > 0 ? `${it.weightKg} kg` : `${it.quantity} item`;
                    return (
                      <tr key={it.id} className="hover:bg-[#e2f6d5]/30 transition-colors">
                        <td className="py-3 px-3 text-center text-[#6a6c6a] font-medium">{idx + 1}</td>
                        <td className="py-3 px-3 text-[#6a6c6a]">
                          {it.completedAt
                            ? new Date(it.completedAt).toLocaleDateString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '-'}
                        </td>
                        <td className="py-3 px-3 font-bold text-[#0e0f0c]">{it.orderNumber}</td>
                        <td className="py-3 px-3 font-semibold text-[#0e0f0c]">{it.customerName}</td>
                        <td className="py-3 px-3 text-[#454745] font-mono text-[11px]">{it.customerPhone || '-'}</td>
                        <td className="py-3 px-3 text-[#454745]">{it.serviceName}</td>
                        <td className="py-3 px-3 text-right font-medium text-[#0e0f0c]">{weightDisplay}</td>
                        <td className="py-3 px-3 text-right text-[#6a6c6a]">
                          {formatRupiah(it.ironingRate)}
                        </td>
                        <td className="py-3 px-3 text-right font-black text-[#163300]">
                          {formatRupiah(it.ironingWage)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              it.isPaid
                                ? 'bg-[#e2f6d5] text-[#163300]'
                                : it.isPending
                                  ? 'bg-[#fef9c3] text-[#854d0e]'
                                  : 'bg-[#f3f4f6] text-[#454745]'
                            }`}
                          >
                            {it.isPaid ? 'Lunas' : it.isPending ? 'Diajukan' : 'Belum Dicairkan'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {(!recapEarnings || recapEarnings.items.length === 0) && !recapLoading && (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-[#6a6c6a]">
                        {selectedIronerId
                          ? 'Tidak ada data pengerjaan setrika oleh pegawai ini pada periode yang dipilih.'
                          : 'Pilih pegawai setrika di atas untuk menampilkan rekapan bulanan.'}
                      </td>
                    </tr>
                  )}
                  {recapLoading && (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-[#163300] font-semibold">
                        Memuat data rekapan bulanan...
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* BARIS TOTAL DI BAGIAN BAWAH TABEL */}
                {recapEarnings && recapEarnings.items.length > 0 && (
                  <tfoot className="border-t-2 border-[#163300] bg-[#f7f9f5] font-bold text-xs text-[#0e0f0c]">
                    <tr>
                      <td colSpan={6} className="py-3.5 px-3 text-right uppercase tracking-wider text-[#163300]">
                        TOTAL KESELURUHAN ({recapEarnings.items.length} CUCIAN):
                      </td>
                      <td className="py-3.5 px-3 text-right text-[#163300]">
                        {recapEarnings.totalWeightKg ?? 0} kg
                      </td>
                      <td className="py-3.5 px-3"></td>
                      <td className="py-3.5 px-3 text-right font-black text-[#163300] text-sm">
                        {formatRupiah(recapEarnings.monthTotalEarnings ?? recapEarnings.totalEarnings)}
                      </td>
                      <td className="py-3.5 px-3 text-center text-[11px] text-[#454745]">
                        <span className="text-[#163300]">Lunas: {formatRupiah(recapEarnings.paidEarnings || 0)}</span>
                        <br />
                        <span className="text-[#854d0e]">Sisa: {formatRupiah(recapEarnings.unpaidEarnings || 0)}</span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Bayar & Upload Bukti Transfer */}
      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#ffffff] rounded-[24px] max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e8ebe6] pb-3">
              <div>
                <h3 className="text-lg font-black text-[#0e0f0c]">Persetujuan Pembayaran Upah</h3>
                <p className="text-xs text-[#6a6c6a]">
                  Pegawai: <strong>{payTarget.employee?.name}</strong> • {payTarget.employee?.phone || ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayTarget(null)}
                className="p-1.5 text-[#6a6c6a] hover:text-[#0e0f0c] hover:bg-[#e8ebe6] rounded-full transition-colors cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <div className="bg-[#e2f6d5] border border-[#9fe870] rounded-[16px] p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-[#454745]">Nominal yang Harus Ditransfer</div>
                <div className="text-2xl font-black text-[#163300] mt-0.5">
                  {formatRupiah(payTarget.amount)}
                </div>
              </div>
              <div className="text-right text-xs">
                <div className="text-[#6a6c6a]">Periode</div>
                <div className="font-bold text-[#0e0f0c]">
                  {MONTH_NAMES[payTarget.periodMonth - 1]} {payTarget.periodYear}
                </div>
              </div>
            </div>

            {/* Info Rekening Pegawai */}
            <div className="bg-[#f7f9f5] border border-[#d8dcd5] rounded-[12px] p-3 text-xs">
              <span className="text-[#6a6c6a] font-semibold block mb-0.5">Rekening Tujuan Transfer:</span>
              <span className="font-mono font-bold text-[#0e0f0c] text-[13px]">
                {payTarget.employeeNotes || 'Tidak ada catatan rekening'}
              </span>
            </div>

            <form onSubmit={(e) => void handleConfirmPay(e)} className="space-y-4">
              {/* Upload Bukti Transfer */}
              <div>
                <label className="block text-xs font-bold text-[#0e0f0c] mb-1">
                  Upload Bukti Transfer (Foto / Screenshot m-Banking) <span className="text-[#cb272f]">*</span>
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  onChange={(e) => void handleFileChange(e)}
                  className="w-full text-xs text-[#454745] file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-[#163300] file:text-[#ffffff] hover:file:bg-[#204702] cursor-pointer"
                />
                <p className="text-[11px] text-[#6a6c6a] mt-1">
                  Format gambar JPG, PNG, atau WebP. Gambar akan otomatis dioptimasi dan ditampilkan kepada pegawai setrika.
                </p>
              </div>

              {/* Preview Gambar */}
              {proofDataUrl && (
                <div className="border border-[#163300] rounded-[12px] p-2 bg-[#f7f9f5] flex flex-col items-center">
                  <span className="text-[10px] uppercase font-bold text-[#163300] mb-1">
                    Preview Bukti Transfer
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proofDataUrl}
                    alt="Preview Bukti Transfer"
                    className="max-h-48 w-auto object-contain rounded-[8px]"
                  />
                </div>
              )}

              {/* Catatan Pembayaran / No Ref */}
              <div>
                <label className="block text-xs font-bold text-[#0e0f0c] mb-1">
                  Catatan Pembayaran / No. Referensi Transfer (Opsional)
                </label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Contoh: No Ref 819234 via BCA m-Banking"
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e8ebe6]">
                <button
                  type="button"
                  disabled={paySubmitting}
                  onClick={() => setPayTarget(null)}
                  className="px-4 py-2 rounded-full border border-[#868685] text-xs font-semibold text-[#454745] hover:bg-[#e8ebe6] cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={paySubmitting || !proofDataUrl}
                  className="px-6 py-2 rounded-full bg-[#163300] text-[#ffffff] text-xs font-bold hover:bg-[#204702] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {paySubmitting ? 'Menyimpan & Membayar...' : 'Konfirmasi & Simpan Bukti'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tolak Pengajuan */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#ffffff] rounded-[24px] max-w-md w-full p-6 sm:p-8 space-y-4 shadow-2xl">
            <h3 className="text-lg font-black text-[#991b1b]">Tolak Pengajuan Upah</h3>
            <p className="text-xs text-[#6a6c6a]">
              Berikan alasan penolakan untuk pegawai <strong>{rejectTarget.employee?.name}</strong>:
            </p>
            <form onSubmit={(e) => void handleConfirmReject(e)} className="space-y-4">
              <textarea
                required
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Contoh: Nomor rekening tidak cocok dengan nama akun / terdapat data pesanan yang perlu diverifikasi ulang."
                className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] p-3 text-xs text-[#0e0f0c] focus:outline-none focus:border-[#991b1b]"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={rejectSubmitting}
                  onClick={() => setRejectTarget(null)}
                  className="px-4 py-2 rounded-full border border-[#868685] text-xs font-semibold text-[#454745] hover:bg-[#e8ebe6] cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={rejectSubmitting || !rejectionReason.trim()}
                  className="px-5 py-2 rounded-full bg-[#cb272f] text-[#ffffff] text-xs font-bold hover:bg-[#b01e25] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {rejectSubmitting ? 'Memproses...' : 'Tolak Pengajuan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Lihat Bukti Transfer */}
      {proofTarget && (
        <ProofTransferModal payout={proofTarget} onClose={() => setProofTarget(null)} />
      )}
    </section>
  );
}

/**
 * Komponen Riwayat Pengajuan Pencairan Upah Pegawai Setrika.
 */
export function StaffIroningPayoutHistorySection({
  onViewProof,
}: {
  onViewProof: (payout: IroningPayoutItem) => void;
}) {
  const [payouts, setPayouts] = useState<IroningPayoutItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: IroningPayoutItem[] }>('/workflow/ironing-payouts?limit=50');
      setPayouts(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  if (payouts.length === 0 && !loading) {
    return null;
  }

  return (
    <div className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base text-[#0e0f0c]">Riwayat Pengajuan Pencairan Upah</h3>
          <p className="text-xs text-[#6a6c6a]">
            Status pencairan upah setrika dan bukti transfer resmi dari owner.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto bg-[#ffffff] rounded-[12px] p-3">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#e8ebe6] text-[#163300] font-semibold uppercase tracking-wider">
            <tr>
              <th className="py-3 px-3 rounded-l-[8px]">Tgl Pengajuan</th>
              <th className="py-3 px-3">Periode</th>
              <th className="py-3 px-3">Jumlah Cucian</th>
              <th className="py-3 px-3">Nominal Upah</th>
              <th className="py-3 px-3">Info Rekening</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3 text-right rounded-r-[8px]">Bukti Transfer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e8ebe6]">
            {payouts.map((p) => {
              const isApproved = p.status === 'APPROVED';
              const isPending = p.status === 'PENDING';
              return (
                <tr key={p.id} className="hover:bg-[#e2f6d5]/40 transition-colors">
                  <td className="py-3 px-3 text-[#6a6c6a]">
                    {new Date(p.createdAt).toLocaleDateString('id-ID')}
                  </td>
                  <td className="py-3 px-3 font-semibold text-[#0e0f0c]">
                    {MONTH_NAMES[p.periodMonth - 1]} {p.periodYear}
                  </td>
                  <td className="py-3 px-3 text-[#454745] font-semibold">{p.totalItems} cucian</td>
                  <td className="py-3 px-3 font-black text-[#163300] text-sm">
                    {formatRupiah(p.amount)}
                  </td>
                  <td className="py-3 px-3 text-[#454745] max-w-[180px] truncate" title={p.employeeNotes || ''}>
                    {p.employeeNotes || '-'}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        isApproved
                          ? 'bg-[#e2f6d5] text-[#163300]'
                          : isPending
                            ? 'bg-[#fef9c3] text-[#854d0e]'
                            : 'bg-[#fee2e2] text-[#991b1b]'
                      }`}
                    >
                      {EXPENSE_APPROVAL_LABELS[p.status] || p.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    {isApproved && p.transferProof ? (
                      <button
                        type="button"
                        onClick={() => onViewProof(p)}
                        className="bg-[#163300] text-[#ffffff] hover:bg-[#204702] px-3 py-1.5 rounded-full font-bold text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1"
                      >
                        <span>Lihat Bukti</span>
                        <span>📎</span>
                      </button>
                    ) : isApproved ? (
                      <span className="text-[#163300] font-semibold text-[11px]">Lunas</span>
                    ) : isPending ? (
                      <span className="text-[#854d0e] text-[11px]">Menunggu Owner</span>
                    ) : (
                      <span className="text-[#991b1b] text-[11px]" title={p.rejectionReason || ''}>
                        Ditolak
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
