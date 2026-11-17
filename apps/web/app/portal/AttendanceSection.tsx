'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  apiFetch,
  type AuthUser,
  type Branch,
  type BranchAttendanceCandidatesResponse,
  type BranchMonthlyAttendanceSummary,
  type MonthlyAttendanceSummaryResponse,
} from '../lib/api';
import {
  calculateGpsDistanceMeters,
  captureVideoSnapshot,
  extractDescriptorFromDataUrl,
  loadFaceModels,
  matchFaceFromVideo,
  parseStoredFaceDescriptor,
  type FaceMatchResult,
} from '../lib/face-utils';

/** Jumlah frame berturut-turut dengan hasil sama sebelum pegawai dianggap terkunci. */
const STABLE_FRAMES_REQUIRED = 2;

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

function formatMinutesToHoursText(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '0 jam';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const decHours = (minutes / 60).toFixed(1).replace(/\.0$/, '');
  if (hrs === 0) return `${mins} menit (${decHours} jam)`;
  if (mins === 0) return `${hrs} jam`;
  return `${hrs} jam ${mins} menit (${decHours} jam)`;
}

/**
 * Terminal Absensi Wajah (Face Recognition + Geolocation Radius Outlet)
 * Khusus untuk Kasir (CASHIER) dan Bagian Cuci (WASHING).
 * Pegawai Cuci dapat absen di portal Kasir dan sebaliknya selama masih satu cabang outlet yang sama.
 */
export function AttendanceTerminalSection({
  currentUser,
  onSuccessMsg,
  onErrorMsg,
}: {
  currentUser: AuthUser;
  onSuccessMsg: (msg: string) => void;
  onErrorMsg: (msg: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [candidatesData, setCandidatesData] =
    useState<BranchAttendanceCandidatesResponse | null>(null);
  const [employeeDescriptors, setEmployeeDescriptors] = useState<
    Record<string, number[]>
  >({});
  const [modelsReady, setModelsReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [preparingFaces, setPreparingFaces] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [scanStatus, setScanStatus] = useState<FaceMatchResult['status'] | 'IDLE'>('IDLE');
  const [detectedEmployeeId, setDetectedEmployeeId] = useState<string>('');
  const [matchScore, setMatchScore] = useState<number>(0);
  const stableRef = useRef<{ id: string; count: number }>({ id: '', count: 0 });
  const descriptorCacheRef = useRef<Record<string, { sig: string; desc: number[] | null }>>(
    {},
  );
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // GPS state
  const [gpsLoading, setGpsLoading] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [gpsError, setGpsError] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    try {
      const res = await apiFetch<BranchAttendanceCandidatesResponse>(
        '/attendances/branch-candidates',
      );
      setCandidatesData(res);

      // Siapkan descriptor wajah (face-api 128-D) untuk tiap pegawai di cabang ini
      setPreparingFaces(true);
      try {
        await loadFaceModels();
        setModelsReady(true);
        setModelError(null);
      } catch {
        setModelError('Gagal memuat model Face Recognition. Muat ulang halaman.');
        return;
      }
      const descMap: Record<string, number[]> = {};
      for (const emp of res.employees) {
        const stored = parseStoredFaceDescriptor(emp.faceDescriptor);
        if (stored) {
          descMap[emp.id] = stored;
          continue;
        }
        // Data lama / descriptor format lama: hitung ulang dari foto referensi (dengan cache)
        if (emp.avatarUrl) {
          const sig = `${emp.avatarUrl.length}:${emp.avatarUrl.slice(0, 64)}:${emp.avatarUrl.slice(-32)}`;
          const cached = descriptorCacheRef.current[emp.id];
          if (cached && cached.sig === sig) {
            if (cached.desc) descMap[emp.id] = cached.desc;
            continue;
          }
          const extracted = await extractDescriptorFromDataUrl(emp.avatarUrl);
          descriptorCacheRef.current[emp.id] = { sig, desc: extracted };
          if (extracted) descMap[emp.id] = extracted;
        }
      }
      setEmployeeDescriptors(descMap);
    } catch (err) {
      onErrorMsg(
        err instanceof Error ? err.message : 'Gagal memuat daftar pegawai absensi cabang',
      );
    } finally {
      setPreparingFaces(false);
    }
  }, [onErrorMsg]);

  const refreshGps = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGpsError('Browser ini tidak mendukung Geolocation GPS.');
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(
          `Gagal membaca lokasi GPS (${err.message}). Pastikan izin lokasi (Location) diaktifkan pada browser Anda.`,
        );
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    void loadCandidates();
    refreshGps();
  }, [loadCandidates, refreshGps]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setScanStatus('IDLE');
    setDetectedEmployeeId('');
    setMatchScore(0);
    stableRef.current = { id: '', count: 0 };
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  async function startCamera() {
    onErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 100);
    } catch {
      onErrorMsg(
        'Gagal mengakses kamera untuk Face Recognition. Pastikan izin kamera (Camera) diizinkan di browser.',
      );
    }
  }

  // Loop pengenalan wajah otomatis saat kamera menyala (tanpa pilih pegawai manual)
  useEffect(() => {
    if (!cameraActive || !modelsReady || !candidatesData) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        try {
          const result = await matchFaceFromVideo(video, employeeDescriptors);
          if (cancelled) return;
          setScanStatus(result.status);
          if (result.status === 'MATCH') {
            const prev = stableRef.current;
            const count = prev.id === result.employeeId ? prev.count + 1 : 1;
            stableRef.current = { id: result.employeeId, count };
            if (count >= STABLE_FRAMES_REQUIRED) {
              setDetectedEmployeeId(result.employeeId);
              setMatchScore(result.percent);
            }
          } else {
            stableRef.current = { id: '', count: 0 };
            setDetectedEmployeeId('');
            setMatchScore(0);
          }
        } catch {
          // frame gagal diproses, coba lagi di tick berikutnya
        }
      }
      if (!cancelled) timer = setTimeout(() => void tick(), 400);
    };
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [cameraActive, modelsReady, candidatesData, employeeDescriptors]);

  const branchInfo = candidatesData?.branch;
  const maxRadius = branchInfo?.attendanceRadiusMeters || 10;
  const hasBranchCoords =
    branchInfo?.latitude !== null &&
    branchInfo?.latitude !== undefined &&
    branchInfo?.longitude !== null &&
    branchInfo?.longitude !== undefined;

  const currentDistanceMeters =
    hasBranchCoords && userCoords
      ? calculateGpsDistanceMeters(
          userCoords.lat,
          userCoords.lng,
          Number(branchInfo!.latitude),
          Number(branchInfo!.longitude),
        )
      : null;

  const isWithinRadius =
    currentDistanceMeters !== null && currentDistanceMeters <= maxRadius;

  const activeEmployee =
    candidatesData?.employees.find((e) => e.id === detectedEmployeeId) || null;
  const faceRecognized = Boolean(activeEmployee) && scanStatus === 'MATCH';
  const employeesWithoutFace =
    candidatesData?.employees.filter((e) => !employeeDescriptors[e.id]) ?? [];

  async function handleClockAction(action: 'CHECK_IN' | 'CHECK_OUT') {
    if (!activeEmployee) {
      onErrorMsg('Belum ada pegawai yang terdeteksi oleh kamera.');
      return;
    }
    if (!activeEmployee.avatarUrl) {
      onErrorMsg(
        `Pegawai ${activeEmployee.name} belum memiliki foto referensi. Minta Owner Cabang/Super Owner mengunggah foto terlebih dahulu.`,
      );
      return;
    }
    if (!cameraActive || !videoRef.current) {
      onErrorMsg('Silakan aktifkan kamera Face Recognition terlebih dahulu.');
      return;
    }
    // Verifikasi ulang wajah tepat saat tombol ditekan agar tidak bisa ditukar orang lain
    const verify = await matchFaceFromVideo(videoRef.current, employeeDescriptors);
    if (verify.status !== 'MATCH' || verify.employeeId !== activeEmployee.id) {
      onErrorMsg(
        'Verifikasi wajah gagal. Pastikan hanya satu wajah terlihat jelas di depan kamera lalu coba lagi.',
      );
      return;
    }
    const snapshotDataUrl = captureVideoSnapshot(videoRef.current, 320);
    if (!snapshotDataUrl) {
      onErrorMsg('Gagal mengambil foto bukti absen dari kamera.');
      return;
    }
    if (!userCoords) {
      onErrorMsg('Titik lokasi GPS perangkat belum ditemukan. Klik tombol Perbarui GPS.');
      return;
    }
    if (!hasBranchCoords) {
      onErrorMsg(
        'Titik koordinat GPS outlet cabang ini belum diatur oleh Owner. Minta Owner mengatur koordinat outlet di menu Profil Cabang.',
      );
      return;
    }
    if (currentDistanceMeters !== null && currentDistanceMeters > maxRadius) {
      onErrorMsg(
        `Gagal Absen: Jarak Anda saat ini ${currentDistanceMeters.toFixed(1)} meter dari outlet ${branchInfo?.name} (Maksimal radius: ${maxRadius} meter). Absensi wajib dilakukan di lokasi outlet.`,
      );
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/attendances/clock', {
        method: 'POST',
        body: JSON.stringify({
          targetUserId: activeEmployee.id,
          action,
          latitude: userCoords.lat,
          longitude: userCoords.lng,
          photo: snapshotDataUrl,
          faceMatchScore: verify.percent,
          notes: notes.trim() || undefined,
        }),
      });
      setNotes('');
      onSuccessMsg(
        `Berhasil ${action === 'CHECK_IN' ? 'ABSEN MASUK' : 'ABSEN PULANG'} untuk ${activeEmployee.name} (${activeEmployee.role}) — Jarak: ${currentDistanceMeters?.toFixed(1)}m dari outlet. Data telah dikirim ke Owner Cabang & Super Owner!`,
      );
      await loadCandidates();
    } catch (err) {
      onErrorMsg(err instanceof Error ? err.message : 'Gagal mencatat absensi');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-block bg-[#163300] text-[#9fe870] text-[11px] font-semibold px-3 py-0.5 rounded-full mb-1.5">
              Face Recognition &amp; Radius Geolocation ({maxRadius} Meter)
            </span>
            <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">
              SISTEM ABSENSI MASUK &amp; PULANG ({branchInfo?.name || 'CABANG'})
            </h2>
            <p className="text-[13px] text-[#454745] mt-1">
              Pegawai <strong>Kasir</strong> dan <strong>Bagian Cuci</strong> pada cabang{' '}
              <strong>{branchInfo?.name}</strong> dapat melakukan absen masuk maupun pulang melalui perangkat ini.
            </p>
          </div>

          <button
            type="button"
            onClick={refreshGps}
            disabled={gpsLoading}
            className="text-[13px] font-semibold bg-[#ffffff] border border-[#163300] text-[#163300] hover:bg-[#e2f6d5] px-4 py-2 rounded-full cursor-pointer transition-colors"
          >
            {gpsLoading ? 'Mencari GPS...' : '📍 Perbarui Lokasi GPS'}
          </button>
        </div>

        {/* Status Jarak GPS dari Outlet */}
        <div
          className={`rounded-[14px] p-4 flex flex-wrap items-center justify-between gap-3 ${
            !hasBranchCoords
              ? 'bg-[#cb272f] text-[#ffffff]'
              : isWithinRadius
                ? 'bg-[#163300] text-[#ffffff]'
                : 'bg-[#cb272f] text-[#ffffff]'
          }`}
        >
          <div className="space-y-0.5">
            <div className="text-[12px] font-semibold uppercase tracking-wider opacity-90">
              Status Jarak Lokasi dari Outlet ({branchInfo?.name})
            </div>
            {!hasBranchCoords ? (
              <div className="text-[14px] font-bold">
                ⚠ Koordinat GPS Outlet belum diatur oleh Owner Cabang / Super Owner.
              </div>
            ) : gpsError ? (
              <div className="text-[13px] font-bold">{gpsError}</div>
            ) : currentDistanceMeters !== null ? (
              <div className="text-[18px] font-black">
                Jarak Anda: {currentDistanceMeters.toFixed(1)} Meter{' '}
                <span className="text-[13px] font-semibold">
                  (Batas Maksimal: {maxRadius} Meter)
                </span>
              </div>
            ) : (
              <div className="text-[14px] font-semibold">Memeriksa titik koordinat GPS...</div>
            )}
          </div>

          <div>
            {hasBranchCoords && currentDistanceMeters !== null && (
              <span
                className={`text-[12px] font-bold px-4 py-1.5 rounded-full ${
                  isWithinRadius
                    ? 'bg-[#9fe870] text-[#163300]'
                    : 'bg-[#ffffff] text-[#cb272f]'
                }`}
              >
                {isWithinRadius
                  ? '✓ Dalam Radius Outlet (Bisa Absen)'
                  : '✕ Di Luar Radius Outlet (Absen Ditolak)'}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Kolom Kiri: Kamera Face Recognition */}
          <div className="lg:col-span-6 bg-[#ffffff] rounded-[20px] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-bold text-[15px] text-[#0e0f0c]">
                Pemindai Wajah Otomatis (Kamera)
              </div>
              {cameraActive ? (
                <button
                  type="button"
                  onClick={stopCamera}
                  className="text-[12px] font-semibold text-[#cb272f] hover:underline cursor-pointer"
                >
                  Matikan Kamera
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="text-[12px] font-semibold bg-[#9fe870] text-[#163300] px-4 py-1.5 rounded-full cursor-pointer"
                >
                  📷 Aktifkan Kamera Absen
                </button>
              )}
            </div>

            <div className="relative aspect-[4/3] w-full bg-[#0e0f0c] rounded-[14px] overflow-hidden flex items-center justify-center">
              {cameraActive ? (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                  {/* Bingkai Panduan Deteksi Wajah */}
                  <div
                    className={`absolute w-48 h-56 rounded-[36px] border-2 transition-colors pointer-events-none ${
                      faceRecognized
                        ? 'border-[#9fe870] shadow-[0_0_25px_rgba(159,232,112,0.5)]'
                        : scanStatus === 'UNKNOWN' || scanStatus === 'MULTIPLE_FACES'
                          ? 'border-[#cb272f] shadow-[0_0_25px_rgba(203,39,47,0.5)]'
                          : 'border-[#ffffff]/50 border-dashed'
                    }`}
                  />
                  <div className="absolute bottom-3 left-3 right-3 bg-[#0e0f0c]/85 text-[#ffffff] rounded-[10px] px-3.5 py-2 text-[12px] flex items-center justify-between gap-2">
                    {preparingFaces ? (
                      <span className="text-[#9fe870]">
                        Memuat model biometrik Face Recognition...
                      </span>
                    ) : faceRecognized && activeEmployee ? (
                      <>
                        <span>
                          Terdeteksi:{' '}
                          <strong className="text-[#9fe870]">{activeEmployee.name}</strong> (
                          {activeEmployee.role === 'CASHIER' ? 'Kasir' : 'Bagian Cuci'})
                        </span>
                        <span className="bg-[#9fe870] text-[#163300] font-bold px-2.5 py-0.5 rounded-full text-[11px] shrink-0">
                          Cocok {matchScore.toFixed(1)}%
                        </span>
                      </>
                    ) : scanStatus === 'UNKNOWN' ? (
                      <span className="text-[#ffb4b8] font-semibold">
                        ✕ Wajah tidak cocok dengan data pegawai cabang ini
                      </span>
                    ) : scanStatus === 'MULTIPLE_FACES' ? (
                      <span className="text-[#ffb4b8] font-semibold">
                        ⚠ Terdeteksi lebih dari 1 wajah di depan kamera
                      </span>
                    ) : (
                      <span className="text-[#e8ebe6]">
                        Arahkan wajah ke dalam bingkai tengah kamera...
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center p-6 space-y-3">
                  <div className="text-[#9fe870] text-3xl">📷</div>
                  <p className="text-[13px] text-[#e8ebe6]">
                    Klik tombol di bawah untuk menyalakan kamera. Sistem Face Recognition akan mengenali wajah pegawai Kasir / Bagian Cuci secara otomatis tanpa pilih nama manual.
                  </p>
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    className="bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] font-semibold text-[14px] px-6 py-2.5 rounded-full cursor-pointer"
                  >
                    Mulai Scan Wajah Sekarang
                  </button>
                </div>
              )}
            </div>
            {modelError && (
              <div className="text-[12px] font-semibold text-[#cb272f] bg-[#cb272f]/10 rounded-[10px] px-3 py-2">
                {modelError}
              </div>
            )}
          </div>

          {/* Kolom Kanan: Identitas Pegawai Hasil Deteksi Wajah Otomatis & Tombol Absen */}
          <div className="lg:col-span-6 bg-[#ffffff] rounded-[20px] p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[12px] font-bold uppercase tracking-wider text-[#163300]">
                  Identifikasi Biometrik Wajah Otomatis ({branchInfo?.name})
                </div>
                <p className="text-[11px] text-[#6a6c6a] mt-0.5">
                  Tanpa pilih nama manual — sistem mencocokkan wajah di kamera dengan foto resmi pegawai cabang.
                </p>
              </div>
              <span
                className={`text-[11px] font-bold px-3 py-1 rounded-full shrink-0 ${
                  faceRecognized
                    ? 'bg-[#9fe870] text-[#163300]'
                    : 'bg-[#e8ebe6] text-[#454745]'
                }`}
              >
                {faceRecognized ? '✓ Wajah Cocok' : 'Menunggu Wajah'}
              </span>
            </div>

            {faceRecognized && activeEmployee ? (
              <div className="bg-[#e2f6d5] border border-[#163300]/20 rounded-[14px] p-4 flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-full bg-[#163300] text-[#9fe870] overflow-hidden flex items-center justify-center shrink-0 border-2 border-[#163300]">
                  {activeEmployee.avatarUrl ? (
                    <img
                      src={activeEmployee.avatarUrl}
                      alt={activeEmployee.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="font-bold text-lg">
                      {activeEmployee.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[15px] text-[#0e0f0c]">
                      {activeEmployee.name}
                    </span>
                    <span className="text-[11px] font-semibold bg-[#163300] text-[#9fe870] px-2.5 py-0.5 rounded-full">
                      {activeEmployee.role === 'CASHIER' ? 'KASIR' : 'BAGIAN CUCI'}
                    </span>
                    <span className="text-[11px] font-bold bg-[#ffffff] text-[#163300] px-2.5 py-0.5 rounded-full">
                      Akurasi {matchScore.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-[12px] text-[#163300] mt-1">
                    {activeEmployee.todayAttendance ? (
                      <>
                        Masuk:{' '}
                        <strong>
                          {new Date(activeEmployee.todayAttendance.checkInAt).toLocaleTimeString(
                            'id-ID',
                            { hour: '2-digit', minute: '2-digit' },
                          )}
                        </strong>
                        {activeEmployee.todayAttendance.checkOutAt ? (
                          <>
                            {' '}
                            • Pulang:{' '}
                            <strong>
                              {new Date(
                                activeEmployee.todayAttendance.checkOutAt,
                              ).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </strong>{' '}
                            (
                            {formatMinutesToHoursText(
                              activeEmployee.todayAttendance.workDurationMinutes,
                            )}
                            )
                          </>
                        ) : (
                          <span className="text-[#163300] font-semibold">
                            {' '}
                            • Sedang Bertugas (Siap Absen Pulang)
                          </span>
                        )}
                      </>
                    ) : (
                      <span>Status Hari Ini: Belum Absen Masuk (Siap Absen Masuk)</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={`rounded-[14px] p-4 text-[12px] space-y-1 ${
                  scanStatus === 'UNKNOWN' || scanStatus === 'MULTIPLE_FACES'
                    ? 'bg-[#cb272f]/10 border border-[#cb272f]/30 text-[#cb272f]'
                    : 'bg-[#e8ebe6] text-[#454745]'
                }`}
              >
                <div className="font-bold text-[13px] text-[#0e0f0c]">
                  {!cameraActive
                    ? 'Kamera Belum Aktif'
                    : scanStatus === 'UNKNOWN'
                      ? 'Wajah Tidak Cocok dengan Pegawai Cabang Ini'
                      : scanStatus === 'MULTIPLE_FACES'
                        ? 'Terdeteksi Lebih dari Satu Wajah'
                        : 'Menunggu Deteksi Wajah Pegawai...'}
                </div>
                <p>
                  {!cameraActive
                    ? 'Nyalakan kamera di sebelah kiri, lalu hadapkan wajah ke kamera. Tombol Absen Masuk / Pulang akan aktif otomatis saat wajah Anda dikenali.'
                    : scanStatus === 'UNKNOWN'
                      ? 'Wajah di depan kamera tidak sesuai dengan foto referensi pegawai Kasir / Bagian Cuci pada cabang ini. Pastikan pencahayaan cukup atau minta Owner memperbarui foto wajah asli Anda.'
                      : scanStatus === 'MULTIPLE_FACES'
                        ? 'Pastikan hanya 1 orang yang berada di depan kamera saat melakukan scan absensi.'
                        : 'Posisikan wajah lurus menghadap kamera dengan pencahayaan yang cukup.'}
                </p>
              </div>
            )}

            {employeesWithoutFace.length > 0 && (
              <div className="bg-[#e8ebe6] rounded-[12px] px-3.5 py-2.5 text-[11px] text-[#454745]">
                <strong className="text-[#0e0f0c]">Catatan Biometrik:</strong>{' '}
                {employeesWithoutFace.map((e) => e.name).join(', ')} belum memiliki foto wajah asli yang terdeteksi sistem. Minta Owner Cabang / Super Owner memperbarui foto profil dengan foto wajah asli yang jelas.
              </div>
            )}

            <div>
              <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">
                Catatan Absen (Opsional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contoh: Shift pagi / lembur"
                className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[13px] text-[#0e0f0c]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                disabled={
                  submitting ||
                  !cameraActive ||
                  !faceRecognized ||
                  !activeEmployee ||
                  Boolean(activeEmployee.todayAttendance)
                }
                onClick={() => void handleClockAction('CHECK_IN')}
                className="bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] font-bold text-[14px] py-3 px-4 rounded-full cursor-pointer transition-colors disabled:opacity-40"
              >
                {submitting ? 'Memproses...' : '🟢 Absen Masuk'}
              </button>
              <button
                type="button"
                disabled={
                  submitting ||
                  !cameraActive ||
                  !faceRecognized ||
                  !activeEmployee?.todayAttendance ||
                  Boolean(activeEmployee?.todayAttendance?.checkOutAt)
                }
                onClick={() => void handleClockAction('CHECK_OUT')}
                className="bg-[#163300] hover:bg-[#054d28] text-[#9fe870] font-bold text-[14px] py-3 px-4 rounded-full cursor-pointer transition-colors disabled:opacity-40"
              >
                {submitting ? 'Memproses...' : '🔴 Absen Pulang'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Ringkasan Status Absensi Pegawai Cabang Hari Ini */}
      {candidatesData && (
        <div className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-4">
          <h3 className="font-black text-[18px] text-[#0e0f0c] uppercase">
            Status Kehadiran Pegawai Cabang Hari Ini ({candidatesData.todayDate})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {candidatesData.employees.map((emp) => {
              const att = emp.todayAttendance;
              return (
                <div
                  key={emp.id}
                  className="bg-[#ffffff] rounded-[12px] p-4 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-[#e2f6d5] text-[#163300] overflow-hidden flex items-center justify-center font-bold">
                      {emp.avatarUrl ? (
                        <img
                          src={emp.avatarUrl}
                          alt={emp.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        emp.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-[14px] text-[#0e0f0c]">{emp.name}</div>
                      <div className="text-[11px] text-[#6a6c6a]">
                        {emp.role === 'CASHIER' ? 'Kasir' : 'Bagian Cuci'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-[12px]">
                    {att ? (
                      att.checkOutAt ? (
                        <span className="bg-[#9fe870] text-[#163300] font-semibold px-3 py-1 rounded-full inline-block">
                          Selesai ({formatMinutesToHoursText(att.workDurationMinutes)})
                        </span>
                      ) : (
                        <span className="bg-[#163300] text-[#9fe870] font-semibold px-3 py-1 rounded-full inline-block">
                          Hadir (Masuk{' '}
                          {new Date(att.checkInAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          )
                        </span>
                      )
                    ) : (
                      <span className="bg-[#e8ebe6] text-[#6a6c6a] font-medium px-3 py-1 rounded-full inline-block">
                        Belum Absen
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Laporan & Rekapitulasi Absensi Bulanan untuk Owner Cabang & Super Owner:
 * - Pengelompokan per bulan
 * - List per bulan: Pegawai A pada bulan tersebut sudah XX jam
 * - Tabel log lengkap absen masuk & pulang beserta foto bukti & jarak GPS
 */
export function OwnerAttendanceReportSection({
  isSuperOwner,
  selectedBranchId,
  branches = [],
  onSelectBranch,
}: {
  isSuperOwner: boolean;
  selectedBranchId: string;
  branches?: Branch[];
  onSelectBranch?: (branchId: string) => void;
}) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [activeBranchFilter, setActiveBranchFilter] = useState<string>(selectedBranchId || '');
  const [summary, setSummary] = useState<MonthlyAttendanceSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<{ title: string; url: string } | null>(
    null,
  );

  useEffect(() => {
    setActiveBranchFilter(selectedBranchId || '');
  }, [selectedBranchId]);

  const handleBranchFilterChange = (branchId: string) => {
    setActiveBranchFilter(branchId);
    if (onSelectBranch) onSelectBranch(branchId);
  };

  const loadMonthly = useCallback(async () => {
    setLoading(true);
    try {
      // Untuk Super Owner, ambil data seluruh cabang agar rekap per cabang selalu lengkap
      const branchParam =
        !isSuperOwner && selectedBranchId ? `&branchId=${selectedBranchId}` : '';
      const res = await apiFetch<MonthlyAttendanceSummaryResponse>(
        `/attendances/monthly-summary?month=${month}&year=${year}${branchParam}`,
      );
      setSummary(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [month, year, isSuperOwner, selectedBranchId]);

  useEffect(() => {
    void loadMonthly();
  }, [loadMonthly]);

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  // Susun grup per cabang untuk Super Owner (menggunakan branchSummaries dari API atau fallback pengelompokan)
  const allBranchGroups = useMemo<BranchMonthlyAttendanceSummary[]>(() => {
    if (!summary) return [];
    if (summary.branchSummaries && summary.branchSummaries.length > 0) {
      return summary.branchSummaries;
    }
    const branchMap = new Map<string, BranchMonthlyAttendanceSummary>();
    for (const b of branches) {
      branchMap.set(b.id, {
        branchId: b.id,
        branchName: b.name,
        branchCode: b.code,
        branchAddress: b.address || null,
        isMain: b.isMain,
        totalEmployees: 0,
        totalDaysPresent: 0,
        completedDays: 0,
        totalMinutes: 0,
        totalHours: 0,
        employeeSummaries: [],
        records: [],
      });
    }
    for (const emp of summary.employeeSummaries) {
      const bid = emp.branchId || 'unassigned';
      if (!branchMap.has(bid)) {
        branchMap.set(bid, {
          branchId: bid,
          branchName: emp.branchName || 'Cabang Lainnya',
          branchCode: '-',
          branchAddress: null,
          totalEmployees: 0,
          totalDaysPresent: 0,
          completedDays: 0,
          totalMinutes: 0,
          totalHours: 0,
          employeeSummaries: [],
          records: [],
        });
      }
      const grp = branchMap.get(bid)!;
      grp.employeeSummaries.push(emp);
      grp.totalEmployees += 1;
      grp.totalMinutes += emp.totalMinutes;
      grp.totalHours = Math.round((grp.totalMinutes / 60) * 100) / 100;
    }
    for (const rec of summary.records) {
      const bid = rec.branchId || 'unassigned';
      const grp = branchMap.get(bid);
      if (grp) {
        grp.records.push(rec);
        grp.totalDaysPresent += 1;
        if (rec.workDurationMinutes) grp.completedDays += 1;
      }
    }
    return Array.from(branchMap.values());
  }, [summary, branches]);

  const visibleBranchGroups = useMemo(() => {
    if (!activeBranchFilter) return allBranchGroups;
    return allBranchGroups.filter((b) => b.branchId === activeBranchFilter);
  }, [allBranchGroups, activeBranchFilter]);

  const superTotalStats = useMemo(() => {
    const totalBranches = allBranchGroups.length;
    const totalEmployees = allBranchGroups.reduce((s, b) => s + b.totalEmployees, 0);
    const totalCheckIns = allBranchGroups.reduce((s, b) => s + b.totalDaysPresent, 0);
    const totalMinutes = allBranchGroups.reduce((s, b) => s + b.totalMinutes, 0);
    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
    return { totalBranches, totalEmployees, totalCheckIns, totalMinutes, totalHours };
  }, [allBranchGroups]);

  return (
    <section className="space-y-6">
      {/* Header & Filter Bulan */}
      <div className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-block bg-[#163300] text-[#9fe870] text-[11px] font-semibold px-3 py-0.5 rounded-full mb-1">
              {isSuperOwner
                ? `Laporan Multi-Cabang Super Owner (${superTotalStats.totalBranches} Cabang Laundry)`
                : 'Rekapitulasi Kehadiran & Jam Kerja Bulanan Cabang'}
            </span>
            <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">
              {isSuperOwner
                ? `REKAP ABSENSI SELURUH CABANG LAUNDRY (${monthLabel})`
                : `DATA ABSENSI PEGAWAI (${monthLabel})`}
            </h2>
            <p className="text-[13px] text-[#454745] mt-0.5">
              {isSuperOwner
                ? 'Laporan kehadiran dan akumulasi jam kerja pegawai Kasir & Bagian Cuci yang dipisahkan secara terperinci untuk setiap cabang laundry Anda.'
                : 'Rekapitulasi otomatis absen masuk & pulang pegawai Kasir dan Bagian Cuci dengan verifikasi Face Recognition & radius lokasi outlet.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[13px] font-semibold text-[#0e0f0c]"
            >
              {MONTH_NAMES.map((m, idx) => (
                <option key={m} value={idx + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[13px] font-semibold text-[#0e0f0c]"
            >
              {[2025, 2026, 2027, 2028].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void loadMonthly()}
              className="bg-[#ffffff] border border-[#163300] text-[#163300] hover:bg-[#e2f6d5] text-[12px] font-semibold px-4 py-2 rounded-full cursor-pointer"
            >
              {loading ? '...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Filter & Statistik Global Khusus Super Owner */}
        {isSuperOwner && (
          <div className="space-y-4 pt-2 border-t border-[#868685]/30">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#163300] text-[#ffffff] rounded-[14px] p-4">
                <div className="text-[11px] text-[#9fe870] font-semibold uppercase">
                  Total Cabang Laundry
                </div>
                <div className="text-[22px] font-black mt-0.5">
                  {superTotalStats.totalBranches} Cabang
                </div>
              </div>
              <div className="bg-[#ffffff] rounded-[14px] p-4">
                <div className="text-[11px] text-[#6a6c6a] font-semibold uppercase">
                  Total Pegawai Absen
                </div>
                <div className="text-[22px] font-black text-[#0e0f0c] mt-0.5">
                  {superTotalStats.totalEmployees} Orang
                </div>
              </div>
              <div className="bg-[#ffffff] rounded-[14px] p-4">
                <div className="text-[11px] text-[#6a6c6a] font-semibold uppercase">
                  Total Kehadiran ({MONTH_NAMES[month - 1]})
                </div>
                <div className="text-[22px] font-black text-[#163300] mt-0.5">
                  {superTotalStats.totalCheckIns} Sesi
                </div>
              </div>
              <div className="bg-[#ffffff] rounded-[14px] p-4">
                <div className="text-[11px] text-[#6a6c6a] font-semibold uppercase">
                  Total Jam Kerja Semua Cabang
                </div>
                <div className="text-[22px] font-black text-[#163300] mt-0.5">
                  {superTotalStats.totalHours} Jam
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-bold text-[#0e0f0c] mr-1">
                Filter Cabang Laundry:
              </span>
              <button
                type="button"
                onClick={() => handleBranchFilterChange('')}
                className={`text-[12px] font-semibold px-3.5 py-1.5 rounded-full cursor-pointer transition-colors ${
                  activeBranchFilter === ''
                    ? 'bg-[#163300] text-[#9fe870]'
                    : 'bg-[#ffffff] text-[#0e0f0c] hover:bg-[#e2f6d5]'
                }`}
              >
                Semua Cabang ({allBranchGroups.length})
              </button>
              {allBranchGroups.map((b) => (
                <button
                  key={b.branchId}
                  type="button"
                  onClick={() => handleBranchFilterChange(b.branchId)}
                  className={`text-[12px] font-semibold px-3.5 py-1.5 rounded-full cursor-pointer transition-colors ${
                    activeBranchFilter === b.branchId
                      ? 'bg-[#163300] text-[#9fe870]'
                      : 'bg-[#ffffff] text-[#0e0f0c] hover:bg-[#e2f6d5]'
                  }`}
                >
                  {b.branchName} ({b.totalEmployees} Pegawai)
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {isSuperOwner ? (
        <>
          {/* Ringkasan Perbandingan Antar Cabang Laundry */}
          {activeBranchFilter === '' && allBranchGroups.length > 0 && (
            <div className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-black text-[18px] text-[#0e0f0c] uppercase">
                  Perbandingan Kinerja Kehadiran Antar Cabang — {monthLabel}
                </h3>
                <span className="text-[12px] text-[#454745]">
                  Klik kartu cabang untuk memfokuskan laporan pada cabang tersebut
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {allBranchGroups.map((br) => (
                  <div
                    key={br.branchId}
                    onClick={() => handleBranchFilterChange(br.branchId)}
                    className="bg-[#ffffff] hover:bg-[#e2f6d5]/60 border border-[#163300]/15 rounded-[18px] p-5 space-y-3 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="inline-block bg-[#163300] text-[#9fe870] text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                          {br.branchCode}
                        </span>
                        <div className="font-black text-[16px] text-[#0e0f0c] mt-1">
                          {br.branchName}
                        </div>
                        {br.branchAddress && (
                          <div className="text-[11px] text-[#6a6c6a] line-clamp-1">
                            {br.branchAddress}
                          </div>
                        )}
                      </div>
                      <div className="text-right bg-[#e2f6d5] text-[#163300] rounded-[10px] px-3 py-1.5 shrink-0">
                        <div className="text-[10px] font-bold uppercase">Total Jam</div>
                        <div className="text-[16px] font-black">{br.totalHours} Jam</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#e8ebe6] text-[12px]">
                      <div>
                        <span className="text-[#6a6c6a]">Pegawai Absen:</span>{' '}
                        <strong className="text-[#0e0f0c]">{br.totalEmployees} Orang</strong>
                      </div>
                      <div className="text-right">
                        <span className="text-[#6a6c6a]">Kehadiran:</span>{' '}
                        <strong className="text-[#163300]">{br.totalDaysPresent} Hari</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Laporan Terpisah Per Cabang Laundry untuk Super Owner */}
          {visibleBranchGroups.map((br) => (
            <div
              key={br.branchId}
              className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-6 border-2 border-[#163300]/15"
            >
              {/* Header Identitas Cabang */}
              <div className="bg-[#163300] text-[#ffffff] rounded-[20px] p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="bg-[#9fe870] text-[#163300] text-[11px] font-black px-3 py-0.5 rounded-full uppercase">
                      CABANG {br.branchCode}
                    </span>
                    {br.isMain && (
                      <span className="bg-[#ffffff]/15 text-[#e2f6d5] text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                        Cabang Utama
                      </span>
                    )}
                  </div>
                  <h3 className="text-[20px] font-black text-[#ffffff] mt-1 uppercase">
                    {br.branchName}
                  </h3>
                  {br.branchAddress && (
                    <p className="text-[12px] text-[#e2f6d5] mt-0.5">{br.branchAddress}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="bg-[#ffffff]/10 rounded-[12px] px-4 py-2 text-center">
                    <div className="text-[10px] text-[#9fe870] uppercase font-bold">
                      Pegawai Cabang
                    </div>
                    <div className="text-[17px] font-black text-[#ffffff]">
                      {br.totalEmployees} Orang
                    </div>
                  </div>
                  <div className="bg-[#ffffff]/10 rounded-[12px] px-4 py-2 text-center">
                    <div className="text-[10px] text-[#9fe870] uppercase font-bold">
                      Kehadiran ({MONTH_NAMES[month - 1]})
                    </div>
                    <div className="text-[17px] font-black text-[#ffffff]">
                      {br.totalDaysPresent} Hari
                    </div>
                  </div>
                  <div className="bg-[#9fe870] text-[#163300] rounded-[12px] px-4 py-2 text-center">
                    <div className="text-[10px] uppercase font-bold">
                      Akumulasi Jam Cabang
                    </div>
                    <div className="text-[17px] font-black">
                      {br.totalHours} Jam
                    </div>
                  </div>
                </div>
              </div>

              {/* Akumulasi Jam Kerja Pegawai pada Cabang Ini */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-[15px] text-[#0e0f0c] uppercase">
                    1. Akumulasi Jam Kerja Pegawai — {br.branchName} ({monthLabel})
                  </h4>
                  <span className="text-[11px] font-semibold bg-[#ffffff] text-[#163300] px-3 py-1 rounded-full">
                    {br.employeeSummaries.length} Pegawai
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {br.employeeSummaries.map((emp) => (
                    <div
                      key={emp.userId}
                      className="bg-[#ffffff] rounded-[14px] p-4 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-full bg-[#163300] text-[#9fe870] overflow-hidden flex items-center justify-center font-bold shrink-0">
                          {emp.avatarUrl ? (
                            <img
                              src={emp.avatarUrl}
                              alt={emp.userName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            emp.userName.slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-[14px] text-[#0e0f0c]">
                              {emp.userName}
                            </span>
                            <span className="text-[10px] font-semibold bg-[#e2f6d5] text-[#163300] px-2.5 py-0.5 rounded-full">
                              {emp.role === 'CASHIER' ? 'KASIR' : 'BAGIAN CUCI'}
                            </span>
                          </div>
                          <div className="text-[12px] text-[#454745] mt-1">
                            Total Jam Kerja:{' '}
                            <strong className="text-[#163300]">
                              {emp.totalHours} Jam ({formatMinutesToHoursText(emp.totalMinutes)})
                            </strong>
                          </div>
                        </div>
                      </div>

                      <div className="text-right bg-[#163300] text-[#ffffff] rounded-[12px] px-3.5 py-2 shrink-0">
                        <div className="text-[10px] text-[#9fe870] uppercase font-bold">
                          Bulan Ini
                        </div>
                        <div className="text-[18px] font-black text-[#ffffff]">
                          {emp.totalHours} Jam
                        </div>
                        <div className="text-[10px] text-[#e2f6d5]">
                          {emp.totalDaysPresent} Hari Hadir
                        </div>
                      </div>
                    </div>
                  ))}

                  {br.employeeSummaries.length === 0 && (
                    <div className="col-span-2 bg-[#ffffff] rounded-[12px] p-6 text-center text-[12px] text-[#6a6c6a]">
                      Belum ada pegawai Kasir atau Bagian Cuci yang terdaftar di cabang{' '}
                      <strong>{br.branchName}</strong>.
                    </div>
                  )}
                </div>
              </div>

              {/* Tabel Rincian Log Absen Masuk & Pulang khusus Cabang Ini */}
              <div className="space-y-3">
                <h4 className="font-black text-[15px] text-[#0e0f0c] uppercase">
                  2. Rincian Log Absen Masuk &amp; Pulang — {br.branchName} ({monthLabel})
                </h4>

                <div className="overflow-x-auto bg-[#ffffff] rounded-[14px] p-3">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-[#e8ebe6] text-[#163300] font-bold uppercase">
                      <tr>
                        <th className="py-3 px-3 rounded-l-[8px]">Tanggal</th>
                        <th className="py-3 px-3">Pegawai</th>
                        <th className="py-3 px-3">Absen Masuk</th>
                        <th className="py-3 px-3">Absen Pulang</th>
                        <th className="py-3 px-3">Total Durasi</th>
                        <th className="py-3 px-3">Jarak &amp; Wajah</th>
                        <th className="py-3 px-3 rounded-r-[8px]">Bukti Foto Wajah</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e8ebe6]">
                      {br.records.map((rec) => (
                        <tr key={rec.id} className="hover:bg-[#e2f6d5]/40">
                          <td className="py-3 px-3 font-semibold text-[#0e0f0c]">
                            {rec.attendanceDate}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-[#0e0f0c]">{rec.user?.name}</div>
                            <div className="text-[11px] text-[#6a6c6a]">
                              {rec.user?.role === 'CASHIER' ? 'Kasir' : 'Bagian Cuci'}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-semibold text-[#163300]">
                            {new Date(rec.checkInAt).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            WIB
                          </td>
                          <td className="py-3 px-3 font-semibold text-[#0e0f0c]">
                            {rec.checkOutAt ? (
                              `${new Date(rec.checkOutAt).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })} WIB`
                            ) : (
                              <span className="text-[#6a6c6a] italic">Belum Pulang</span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-bold text-[#163300]">
                            {rec.workDurationMinutes
                              ? formatMinutesToHoursText(rec.workDurationMinutes)
                              : 'Sedang bekerja'}
                          </td>
                          <td className="py-3 px-3 text-[#454745]">
                            {rec.checkInDistanceMeters !== null
                              ? `${Number(rec.checkInDistanceMeters).toFixed(1)} m`
                              : '-'}
                            {rec.faceMatchScore
                              ? ` • Wajah ${Number(rec.faceMatchScore).toFixed(0)}%`
                              : ''}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              {rec.checkInPhoto && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewPhoto({
                                      title: `Foto Absen Masuk - ${rec.user?.name} (${br.branchName} • ${rec.attendanceDate})`,
                                      url: rec.checkInPhoto!,
                                    })
                                  }
                                  className="text-[11px] font-semibold bg-[#e2f6d5] text-[#163300] px-2.5 py-1 rounded-full cursor-pointer hover:bg-[#9fe870]"
                                >
                                  Foto Masuk
                                </button>
                              )}
                              {rec.checkOutPhoto && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewPhoto({
                                      title: `Foto Absen Pulang - ${rec.user?.name} (${br.branchName} • ${rec.attendanceDate})`,
                                      url: rec.checkOutPhoto!,
                                    })
                                  }
                                  className="text-[11px] font-semibold bg-[#163300] text-[#9fe870] px-2.5 py-1 rounded-full cursor-pointer"
                                >
                                  Foto Pulang
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {br.records.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-6 text-[#6a6c6a]">
                            Belum ada riwayat absensi pada cabang{' '}
                            <strong>{br.branchName}</strong> di bulan {monthLabel}.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          {/* Tampilan Standar Satu Cabang untuk Branch Owner */}
          <div className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-[18px] text-[#0e0f0c] uppercase">
                Akumulasi Total Jam Kerja Pegawai — Bulan {monthLabel}
              </h3>
              <span className="text-[12px] font-semibold bg-[#163300] text-[#9fe870] px-3.5 py-1 rounded-full">
                {summary?.employeeSummaries.length || 0} Pegawai Wajib Absen
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {summary?.employeeSummaries.map((emp) => (
                <div
                  key={emp.userId}
                  className="bg-[#ffffff] rounded-[14px] p-5 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-14 h-14 rounded-full bg-[#163300] text-[#9fe870] overflow-hidden flex items-center justify-center font-bold shrink-0">
                      {emp.avatarUrl ? (
                        <img
                          src={emp.avatarUrl}
                          alt={emp.userName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        emp.userName.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-[15px] text-[#0e0f0c]">
                          {emp.userName}
                        </span>
                        <span className="text-[11px] font-semibold bg-[#e2f6d5] text-[#163300] px-2.5 py-0.5 rounded-full">
                          {emp.role === 'CASHIER' ? 'KASIR' : 'BAGIAN CUCI'}
                        </span>
                      </div>
                      <div className="text-[12px] text-[#454745] mt-1">
                        Bulan <strong>{monthLabel}</strong> sudah bekerja:{' '}
                        <strong className="text-[#163300]">
                          {emp.totalHours} Jam ({formatMinutesToHoursText(emp.totalMinutes)})
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="text-right bg-[#163300] text-[#ffffff] rounded-[12px] px-4 py-2.5 shrink-0">
                    <div className="text-[10px] text-[#9fe870] uppercase font-bold">
                      Total Bulan Ini
                    </div>
                    <div className="text-[20px] font-black text-[#ffffff]">
                      {emp.totalHours} Jam
                    </div>
                    <div className="text-[11px] text-[#e2f6d5]">
                      {emp.totalDaysPresent} Hari Hadir
                    </div>
                  </div>
                </div>
              ))}

              {(!summary || summary.employeeSummaries.length === 0) && (
                <div className="col-span-2 bg-[#ffffff] rounded-[12px] p-8 text-center text-[13px] text-[#6a6c6a]">
                  Belum ada pegawai Kasir atau Bagian Cuci pada cabang ini.
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-4">
            <h3 className="font-black text-[18px] text-[#0e0f0c] uppercase">
              Rincian Log Absen Masuk &amp; Pulang ({monthLabel})
            </h3>

            <div className="overflow-x-auto bg-[#ffffff] rounded-[14px] p-3">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-[#e8ebe6] text-[#163300] font-bold uppercase">
                  <tr>
                    <th className="py-3 px-3 rounded-l-[8px]">Tanggal</th>
                    <th className="py-3 px-3">Pegawai</th>
                    <th className="py-3 px-3">Cabang</th>
                    <th className="py-3 px-3">Absen Masuk</th>
                    <th className="py-3 px-3">Absen Pulang</th>
                    <th className="py-3 px-3">Total Durasi</th>
                    <th className="py-3 px-3">Jarak Outlet</th>
                    <th className="py-3 px-3 rounded-r-[8px]">Bukti Foto Wajah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8ebe6]">
                  {summary?.records.map((rec) => (
                    <tr key={rec.id} className="hover:bg-[#e2f6d5]/40">
                      <td className="py-3 px-3 font-semibold text-[#0e0f0c]">
                        {rec.attendanceDate}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-[#0e0f0c]">{rec.user?.name}</div>
                        <div className="text-[11px] text-[#6a6c6a]">{rec.user?.role}</div>
                      </td>
                      <td className="py-3 px-3 text-[#454745]">
                        {rec.branch?.name || '-'}
                      </td>
                      <td className="py-3 px-3 font-semibold text-[#163300]">
                        {new Date(rec.checkInAt).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        WIB
                      </td>
                      <td className="py-3 px-3 font-semibold text-[#0e0f0c]">
                        {rec.checkOutAt ? (
                          `${new Date(rec.checkOutAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })} WIB`
                        ) : (
                          <span className="text-[#6a6c6a] italic">Belum Pulang</span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-bold text-[#163300]">
                        {rec.workDurationMinutes
                          ? formatMinutesToHoursText(rec.workDurationMinutes)
                          : 'Sedang bekerja'}
                      </td>
                      <td className="py-3 px-3 text-[#454745]">
                        {rec.checkInDistanceMeters !== null
                          ? `${Number(rec.checkInDistanceMeters).toFixed(1)} m`
                          : '-'}
                        {rec.faceMatchScore
                          ? ` • Wajah ${Number(rec.faceMatchScore).toFixed(0)}%`
                          : ''}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          {rec.checkInPhoto && (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewPhoto({
                                  title: `Foto Absen Masuk - ${rec.user?.name} (${rec.attendanceDate})`,
                                  url: rec.checkInPhoto!,
                                })
                              }
                              className="text-[11px] font-semibold bg-[#e2f6d5] text-[#163300] px-2.5 py-1 rounded-full cursor-pointer hover:bg-[#9fe870]"
                            >
                              Foto Masuk
                            </button>
                          )}
                          {rec.checkOutPhoto && (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewPhoto({
                                  title: `Foto Absen Pulang - ${rec.user?.name} (${rec.attendanceDate})`,
                                  url: rec.checkOutPhoto!,
                                })
                              }
                              className="text-[11px] font-semibold bg-[#163300] text-[#9fe870] px-2.5 py-1 rounded-full cursor-pointer"
                            >
                              Foto Pulang
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!summary || summary.records.length === 0) && (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-[#6a6c6a]">
                        Belum ada riwayat absensi tercatat pada bulan {monthLabel}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal Preview Foto Bukti Absen */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 bg-[#0e0f0c]/70 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] rounded-[24px] max-w-sm w-full p-5 space-y-3 text-center">
            <div className="font-bold text-[14px] text-[#0e0f0c]">{previewPhoto.title}</div>
            <img
              src={previewPhoto.url}
              alt={previewPhoto.title}
              className="w-full rounded-[14px] object-cover mx-auto"
            />
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="w-full bg-[#163300] text-[#9fe870] font-semibold text-[13px] py-2.5 rounded-full cursor-pointer"
            >
              Tutup Foto
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

