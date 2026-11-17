'use client';

import { FormEvent, InputHTMLAttributes, useState } from 'react';
import {
  apiFetch,
  formatRupiah,
  setAuthSession,
  getStoredTenantBranding,
  type AuthUser,
  type OrderDetail,
  type PaymentMethod,
} from '../lib/api';
import { processImageFileToAvatar } from '../lib/face-utils';

/** Reusable Password Input dengan Icon Eye (Show / Hide Password) */
export function PasswordInput({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative w-full">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${className} pr-11`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Sembunyikan password' : 'Lihat password'}
        title={visible ? 'Sembunyikan password' : 'Lihat password'}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6a6c6a] hover:text-[#163300] p-1 cursor-pointer transition-colors"
      >
        {visible ? (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
            />
          </svg>
        ) : (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

/** Modal Lupa Password di Login Portal */
export function ForgotPasswordModal({
  onClose,
  onResetSuccess,
}: {
  onClose: () => void;
  onResetSuccess: (email: string, msg: string) => void;
}) {
  const [step, setStep] = useState<'REQUEST' | 'CONFIRM'>('REQUEST');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);

  // Email verification state
  const [emailConfirmationInfo, setEmailConfirmationInfo] = useState<{
    email: string;
    senderEmail?: string;
    message: string;
  } | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function handleRequestReset(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setAlertError(null);
    try {
      const res = await apiFetch<{
        sent: boolean;
        email: string;
        senderEmail?: string;
        message: string;
      }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setEmailConfirmationInfo(res);
      setStep('CONFIRM');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Email tersebut tidak terdaftar di database pegawai atau owner.';
      setAlertError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmReset(e: FormEvent) {
    e.preventDefault();
    setAlertError(null);
    if (newPassword.length < 8) {
      setAlertError('Password baru minimal 8 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setAlertError('Konfirmasi password baru tidak cocok.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ success: boolean; message: string }>(
        '/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify({
            email: email.trim(),
            token: tokenInput.trim(),
            newPassword,
            confirmPassword,
          }),
        },
      );
      onResetSuccess(email.trim(), res.message);
    } catch (err) {
      setAlertError(err instanceof Error ? err.message : 'Gagal mereset password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0e0f0c]/60 flex items-center justify-center p-4">
      <div className="bg-[#ffffff] rounded-[28px] max-w-md w-full p-6 sm:p-8 space-y-4 border border-[#e8ebe6] max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#e8ebe6] pb-3">
          <div>
            <span className="inline-block bg-[#e2f6d5] text-[#163300] text-[11px] font-semibold px-3 py-0.5 rounded-full mb-1">
              Pemulihan Akun
            </span>
            <h3 className="font-black text-[20px] text-[#0e0f0c] uppercase tracking-[-0.02em]">
              Lupa Password Portal
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#6a6c6a] hover:text-[#0e0f0c] font-bold text-lg cursor-pointer"
          >
            ✕
          </button>
        </div>

        {alertError && (
          <div className="bg-[#cb272f] text-[#ffffff] text-[13px] font-medium rounded-[10px] p-3.5">
            {alertError}
          </div>
        )}

        {step === 'REQUEST' ? (
          <form onSubmit={handleRequestReset} className="space-y-4">
            <p className="text-[13px] text-[#454745] leading-relaxed">
              Masukkan alamat email Gmail asli akun pegawai atau owner Anda. Sistem akan mengirimkan{' '}
              <strong>6 digit Nomor Verifikasi</strong> langsung dari email resmi{' '}
              <strong className="text-[#163300]">naufalikrom01@gmail.com</strong> ke kotak masuk email Anda.
            </p>
            <div>
              <label className="block text-[13px] font-semibold text-[#0e0f0c] mb-1.5">
                Alamat Email Gmail Terdaftar *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contoh: namaanda@gmail.com"
                className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-4 py-3 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="text-[13px] font-medium px-5 py-2.5 rounded-full border border-[#163300] text-[#163300] hover:bg-[#e2f6d5] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={loading}
                className="text-[13px] font-semibold bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] px-6 py-2.5 rounded-full cursor-pointer disabled:opacity-60"
              >
                {loading ? 'Mengirim Nomor Verifikasi...' : 'Kirim Nomor Verifikasi'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleConfirmReset} className="space-y-4">
            <div className="bg-[#e2f6d5] border border-[#163300]/20 rounded-[10px] p-3.5 text-[12px] text-[#163300] space-y-1.5">
              <div className="font-bold">
                ✓ Nomor Verifikasi Telah Dikirim ke Email Anda!
              </div>
              <p>
                Kami telah mengirimkan 6 digit nomor verifikasi dari{' '}
                <strong>{emailConfirmationInfo?.senderEmail || 'naufalikrom01@gmail.com'}</strong>{' '}
                ke alamat email <strong>{emailConfirmationInfo?.email}</strong> (jika terdaftar).
              </p>
              <p className="text-[11px] text-[#054d28]">
                Silakan buka kotak masuk (Inbox) atau folder Spam di Gmail Anda, lalu masukkan nomor verifikasi tersebut di bawah ini.
              </p>
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-[#0e0f0c] mb-1">
                Nomor Verifikasi (6 Digit dari Gmail) *
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Masukkan 6 digit nomor verifikasi"
                className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-[16px] tracking-widest font-mono font-bold text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-[#0e0f0c] mb-1">
                Password Baru (Min. 8 Karakter) *
              </label>
              <PasswordInput
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Masukkan password baru"
                className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-[#0e0f0c] mb-1">
                Konfirmasi Password Baru *
              </label>
              <PasswordInput
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi password baru"
                className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep('REQUEST')}
                className="text-[12px] font-medium text-[#6a6c6a] hover:text-[#0e0f0c] underline cursor-pointer"
              >
                ← Ganti Email
              </button>
              <button
                type="submit"
                disabled={loading}
                className="text-[13px] font-semibold bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] px-6 py-2.5 rounded-full cursor-pointer disabled:opacity-60"
              >
                {loading ? 'Menyimpan...' : 'Reset Password Sekarang'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * Modal Pop Up Profil Akun (Pegawai, Owner Cabang, Super Owner):
 * - Ganti Foto Profile
 * - Mengetahui Emailnya & Informasi Akun
 * - Ganti Password (Password Lama -> Password Baru -> Konfirmasi Password Baru)
 */
export function UserProfileModal({
  user,
  onClose,
  onUserUpdated,
}: {
  user: AuthUser;
  onClose: () => void;
  onUserUpdated: (updated: AuthUser) => void;
}) {
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatarUrl || null);
  const [faceDescriptor, setFaceDescriptor] = useState<string | null>(
    user.faceDescriptor || null,
  );
  const [savingProfile, setSavingProfile] = useState(false);

  // Change password states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleFileChange(file: File | undefined) {
    if (!file) return;
    setErr(null);
    try {
      const processed = await processImageFileToAvatar(file, 320);
      if ((user.role === 'CASHIER' || user.role === 'WASHING') && !processed.faceDescriptor) {
        setErr(
          'Wajah tidak terdeteksi pada foto ini. Gunakan foto wajah asli yang jelas dan menghadap kamera agar sistem absen Face Recognition dapat mengenali Anda.',
        );
        return;
      }
      setAvatarUrl(processed.dataUrl);
      setFaceDescriptor(processed.faceDescriptor);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal memproses foto profil');
    }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setErr(null);
    setMsg(null);
    try {
      const updated = await apiFetch<AuthUser>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || undefined,
          avatarUrl,
          faceDescriptor,
        }),
      });
      setAuthSession(updated);
      onUserUpdated(updated);
      setMsg('Foto profil dan informasi akun berhasil diperbarui.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal memperbarui profil');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (newPassword.length < 8) {
      setErr('Password baru minimal harus 8 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErr('Konfirmasi password baru tidak sama dengan password baru.');
      return;
    }
    setSavingPass(true);
    try {
      await apiFetch('/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMsg('Password akun Anda berhasil diganti!');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal mengganti password');
    } finally {
      setSavingPass(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0e0f0c]/60 flex items-center justify-center p-4">
      <div className="bg-[#ffffff] rounded-[28px] max-w-xl w-full p-6 sm:p-8 space-y-6 border border-[#e8ebe6] max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#e8ebe6] pb-3">
          <div>
            <span className="inline-block bg-[#e2f6d5] text-[#163300] text-[11px] font-semibold px-3 py-0.5 rounded-full mb-1">
              Pengaturan Akun ({user.role})
            </span>
            <h3 className="font-black text-[22px] text-[#0e0f0c] uppercase tracking-[-0.02em]">
              Profil Saya &amp; Keamanan
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#6a6c6a] hover:text-[#0e0f0c] font-bold text-lg cursor-pointer"
          >
            ✕
          </button>
        </div>

        {err && (
          <div className="bg-[#cb272f] text-[#ffffff] text-[13px] font-medium rounded-[10px] p-3.5">
            {err}
          </div>
        )}
        {msg && (
          <div className="bg-[#e2f6d5] border border-[#163300]/20 text-[#163300] text-[13px] font-semibold rounded-[10px] p-3.5">
            {msg}
          </div>
        )}

        {/* Bagian 1: Foto Profil & Info Email */}
        <form onSubmit={handleSaveProfile} className="bg-[#e8ebe6] rounded-[16px] p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-[#163300] text-[#9fe870] flex items-center justify-center overflow-hidden shrink-0 border-2 border-[#163300]">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={user.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-black text-2xl uppercase">
                  {user.name.slice(0, 2)}
                </span>
              )}
            </div>
            <div className="flex-1 text-center sm:text-left space-y-1.5">
              <div className="font-bold text-[16px] text-[#0e0f0c]">{user.name}</div>
              <div className="text-[12px] text-[#454745]">
                Email Terdaftar:{' '}
                <strong className="text-[#163300] font-mono bg-[#ffffff] px-2 py-0.5 rounded">
                  {user.email || 'Belum diatur'}
                </strong>
              </div>
              <div className="text-[12px] text-[#6a6c6a]">
                No. HP: <strong>{user.phone || '-'}</strong> • Cabang:{' '}
                <strong>{user.branch?.name || 'Global (Pusat)'}</strong>
              </div>
              <div className="pt-1">
                <label className="inline-block bg-[#ffffff] border border-[#163300] text-[#163300] hover:bg-[#e2f6d5] text-[12px] font-semibold px-4 py-1.5 rounded-full cursor-pointer transition-colors">
                  📷 Pilih / Ganti Foto Profil
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handleFileChange(e.target.files?.[0])}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#868685]/20">
            <div>
              <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">
                Nama Lengkap
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-[13px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">
                Alamat Email Akun
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@laundry.local"
                className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-[13px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingProfile}
              className="bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] font-semibold text-[13px] px-5 py-2 rounded-full cursor-pointer transition-colors disabled:opacity-60"
            >
              {savingProfile ? 'Menyimpan...' : 'Simpan Foto & Profil'}
            </button>
          </div>
        </form>

        {/* Bagian 2: Ganti Password (Password Lama, Password Baru, Konfirmasi Password Baru) */}
        <form onSubmit={handleChangePassword} className="bg-[#e8ebe6] rounded-[16px] p-5 space-y-3.5">
          <h4 className="font-black text-[15px] text-[#0e0f0c] uppercase">
            Ganti Password Akun
          </h4>
          <div>
            <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">
              Password Lama *
            </label>
            <PasswordInput
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Masukkan password saat ini"
              className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[13px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">
                Password Baru (Min. 8 Karakter) *
              </label>
              <PasswordInput
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Password baru"
                className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[13px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">
                Konfirmasi Password Baru *
              </label>
              <PasswordInput
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi password baru"
                className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[13px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
              />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={savingPass}
              className="bg-[#163300] hover:bg-[#054d28] text-[#ffffff] font-semibold text-[13px] px-5 py-2 rounded-full cursor-pointer transition-colors disabled:opacity-60"
            >
              {savingPass ? 'Memproses...' : 'Perbarui Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Modal Pelunasan Tagihan Saat Pengambilan (Bayar Nanti Waktu Ambil) */
export function PayLaterSettlementModal({
  order,
  canPickUpNow,
  onClose,
  onSuccess,
}: {
  order: OrderDetail;
  canPickUpNow: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const remaining = Math.max(0, (order.total || 0) - (order.paidAmount || 0));
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [cashGiven, setCashGiven] = useState(String(remaining));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const changeAmt = Math.max(0, Number(cashGiven || 0) - remaining);

  async function handlePay(alsoPickUp: boolean) {
    setErr(null);
    if (method === 'CASH' && Number(cashGiven || 0) < remaining) {
      setErr(
        `Uang tunai kurang! Sisa tagihan ${formatRupiah(remaining)}, diterima ${formatRupiah(Number(cashGiven || 0))}.`,
      );
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/payments', {
        method: 'POST',
        body: JSON.stringify({
          orderId: order.id,
          amount: remaining,
          method,
          status: 'SUCCESS',
          notes: 'Pelunasan saat pengambilan pakaian',
        }),
      });
      if (alsoPickUp) {
        await apiFetch(`/orders/${order.id}/pickup`, { method: 'POST' });
        onSuccess(`Nota ${order.orderNumber} berhasil dilunasi (${method}) dan pakaian telah diserahkan ke pelanggan!`);
      } else {
        onSuccess(`Tagihan nota ${order.orderNumber} sebesar ${formatRupiah(remaining)} berhasil dilunasi (${method})!`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal memproses pelunasan');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0e0f0c]/60 flex items-center justify-center p-4">
      <div className="bg-[#ffffff] rounded-[28px] max-w-md w-full p-6 sm:p-8 space-y-4 border border-[#e8ebe6]">
        <div className="flex items-center justify-between border-b border-[#e8ebe6] pb-3">
          <div>
            <span className="inline-block bg-[#e2f6d5] text-[#163300] text-[11px] font-semibold px-3 py-0.5 rounded-full mb-1">
              Pelunasan Tagihan (Bayar Waktu Ambil)
            </span>
            <h3 className="font-black text-[20px] text-[#0e0f0c] uppercase">
              Nota {order.orderNumber}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#6a6c6a] font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {err && (
          <div className="bg-[#cb272f] text-[#ffffff] text-[13px] font-medium rounded-[10px] p-3">
            {err}
          </div>
        )}

        <div className="bg-[#e8ebe6] rounded-[12px] p-4 space-y-2 text-[13px]">
          <div className="flex justify-between">
            <span className="text-[#6a6c6a]">Pelanggan:</span>
            <strong className="text-[#0e0f0c]">{order.customer?.name}</strong>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6a6c6a]">Subtotal Layanan:</span>
            <span className="text-[#0e0f0c]">{formatRupiah(order.subtotal)}</span>
          </div>
          {Boolean(order.payLaterFee && order.payLaterFee > 0) && (
            <div className="flex justify-between text-[#163300]">
              <span>Charge Bayar Saat Ambil:</span>
              <span className="font-semibold">+{formatRupiah(order.payLaterFee || 0)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-[#868685]/30 pt-2">
            <span className="font-bold text-[#0e0f0c]">Sisa Tagihan Harus Dibayar:</span>
            <strong className="text-[17px] text-[#cb272f]">{formatRupiah(remaining)}</strong>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-[#e8ebe6] p-1 rounded-full">
            <button
              type="button"
              onClick={() => setMethod('CASH')}
              className={`flex-1 text-[13px] font-semibold py-2 rounded-full cursor-pointer transition-colors ${
                method === 'CASH'
                  ? 'bg-[#163300] text-[#9fe870]'
                  : 'text-[#454745] hover:text-[#163300]'
              }`}
            >
              Tunai (CASH)
            </button>
            <button
              type="button"
              onClick={() => setMethod('QRIS')}
              className={`flex-1 text-[13px] font-semibold py-2 rounded-full cursor-pointer transition-colors ${
                method === 'QRIS'
                  ? 'bg-[#163300] text-[#9fe870]'
                  : 'text-[#454745] hover:text-[#163300]'
              }`}
            >
              QRIS
            </button>
          </div>

          {method === 'CASH' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">
                  Uang Diterima (Rp) *
                </label>
                <input
                  type="number"
                  min={remaining}
                  value={cashGiven}
                  onChange={(e) => setCashGiven(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-[14px] font-bold text-[#0e0f0c]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">
                  Kembalian
                </label>
                <div className="bg-[#e2f6d5] text-[#163300] rounded-[10px] px-3 py-2 text-[14px] font-black">
                  {formatRupiah(changeAmt)}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void handlePay(false)}
            className="text-[12px] font-semibold bg-[#ffffff] border border-[#163300] text-[#163300] hover:bg-[#e2f6d5] px-4 py-2.5 rounded-full cursor-pointer"
          >
            {loading ? 'Memproses...' : 'Lunasi Saja'}
          </button>
          {canPickUpNow && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void handlePay(true)}
              className="text-[12px] font-semibold bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] px-5 py-2.5 rounded-full cursor-pointer"
            >
              {loading ? 'Memproses...' : '✓ Lunasi & Serahkan Pakaian'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

