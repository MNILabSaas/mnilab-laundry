'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  euclideanDistance,
  extractFaceDescriptorFromVideo,
  FACE_MATCH_MAX_DISTANCE,
  loadFaceModels,
  parseFaceDescriptor,
} from '../../lib/face-utils';
import {
  laundryFetch,
  type LaundryUserProfile,
  type LeaveRequestItem,
} from '../../lib/laundry-api';

interface CandidateStaff {
  id: string;
  name: string;
  role: string;
  faceDescriptor: string | null;
}

export function AttendanceLeavesTab({
  user,
  selectedBranchId,
}: {
  user: LaundryUserProfile;
  selectedBranchId: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [candidates, setCandidates] = useState<CandidateStaff[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequestItem[]>([]);
  const [leaveType, setLeaveType] = useState<'CUTI' | 'IZIN' | 'SAKIT'>('CUTI');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const qs = selectedBranchId ? `?branchId=${selectedBranchId}` : '';
    const [cand, lv] = await Promise.all([
      user.role !== 'IRONING'
        ? laundryFetch<CandidateStaff[]>(`/attendances/branch-candidates${qs}`).catch(
            () => [],
          )
        : Promise.resolve([]),
      laundryFetch<LeaveRequestItem[]>(`/leaves${qs}`),
    ]);
    setCandidates(cand);
    setLeaves(lv);
  }, [selectedBranchId, user.role]);

  useEffect(() => {
    let active = true;
    const qs = selectedBranchId ? `?branchId=${selectedBranchId}` : '';
    Promise.all([
      user.role !== 'IRONING'
        ? laundryFetch<CandidateStaff[]>(`/attendances/branch-candidates${qs}`).catch(
            () => [],
          )
        : Promise.resolve([]),
      laundryFetch<LeaveRequestItem[]>(`/leaves${qs}`),
    ])
      .then(([cand, lv]) => {
        if (!active) return;
        setCandidates(cand);
        setLeaves(lv);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [selectedBranchId, user.role]);

  async function startCamera() {
    setErr(null);
    await loadFaceModels();
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraActive(true);
    }
  }

  async function clockWithFaceAndGps() {
    setErr(null);
    setMsg(null);
    try {
      let matchedStaffId = user.id;
      let faceDistance: number | undefined;

      if (cameraActive && videoRef.current) {
        const liveVec = await extractFaceDescriptorFromVideo(videoRef.current);
        if (!liveVec) {
          throw new Error('Wajah tidak terdeteksi di kamera');
        }
        let bestDist = Infinity;
        for (const c of candidates) {
          const refVec = parseFaceDescriptor(c.faceDescriptor);
          if (!refVec) continue;
          const dist = euclideanDistance(liveVec, refVec);
          if (dist < bestDist) {
            bestDist = dist;
            matchedStaffId = c.id;
          }
        }
        if (bestDist <= FACE_MATCH_MAX_DISTANCE) {
          faceDistance = Math.round(bestDist * 10000) / 10000;
        } else if (candidates.some((c) => parseFaceDescriptor(c.faceDescriptor))) {
          throw new Error('Wajah tidak cocok dengan pegawai terdaftar di cabang ini');
        }
      }

      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
        }),
      ).catch(() => null);

      const res = await laundryFetch<{ action: string }>('/attendances/clock', {
        method: 'POST',
        body: JSON.stringify({
          branchId: selectedBranchId || undefined,
          staffId: matchedStaffId,
          latitude: pos?.coords.latitude,
          longitude: pos?.coords.longitude,
          faceDistance,
        }),
      });
      setMsg(`Absensi ${res.action} berhasil tercatat.`);
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Gagal mencatat absensi');
    }
  }

  async function handleSubmitLeave(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      await laundryFetch('/leaves', {
        method: 'POST',
        body: JSON.stringify({ leaveType, startDate, endDate, reason }),
      });
      setReason('');
      setMsg('Pengajuan cuti/izin terkirim.');
      await reload();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Gagal mengirim pengajuan cuti');
    }
  }

  async function decideLeave(id: string, status: 'APPROVED' | 'REJECTED') {
    await laundryFetch(`/leaves/${id}/decide`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await reload();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
        <h3 className="text-sm font-bold text-[var(--brand-dark)]">
          Absensi Biometrik Wajah & GPS
        </h3>
        {err && <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{err}</div>}
        {msg && <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{msg}</div>}
        <video
          ref={videoRef}
          muted
          playsInline
          className="w-full rounded-xl bg-zinc-900 aspect-video object-cover"
        />
        <div className="flex gap-2 text-xs">
          {!cameraActive && (
            <button
              type="button"
              onClick={() => void startCamera()}
              className="rounded-xl border border-zinc-300 px-4 py-2 font-semibold"
            >
              Aktifkan Kamera AI
            </button>
          )}
          <button
            type="button"
            onClick={() => void clockWithFaceAndGps()}
            className="rounded-xl bg-[var(--brand-dark)] px-4 py-2 font-semibold text-white"
          >
            Check-In / Check-Out
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
        <h3 className="text-sm font-bold text-[var(--brand-dark)]">
          Pengajuan Cuti / Izin / Sakit
        </h3>
        <form onSubmit={handleSubmitLeave} className="space-y-2 text-xs">
          <div className="grid grid-cols-3 gap-2">
            <select
              value={leaveType}
              onChange={(e) =>
                setLeaveType(e.target.value as 'CUTI' | 'IZIN' | 'SAKIT')
              }
              className="rounded-xl border border-zinc-300 px-2.5 py-2"
            >
              <option value="CUTI">CUTI</option>
              <option value="IZIN">IZIN</option>
              <option value="SAKIT">SAKIT</option>
            </select>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-xl border border-zinc-300 px-2.5 py-2"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-xl border border-zinc-300 px-2.5 py-2"
            />
          </div>
          <input
            required
            placeholder="Alasan cuti/izin"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-xl bg-[var(--brand-dark)] px-4 py-2 font-semibold text-white"
          >
            Ajukan Cuti
          </button>
        </form>

        <div className="space-y-2 text-xs">
          {leaves.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between rounded-xl border border-zinc-100 px-3 py-2"
            >
              <div>
                <div className="font-semibold">
                  {l.staff?.name} • {l.leaveType} ({l.totalDays} hari)
                </div>
                <div className="text-zinc-500">
                  {l.startDate} s/d {l.endDate} — {l.reason}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-zinc-100 px-2 py-0.5">{l.status}</span>
                {['SUPER_OWNER', 'BRANCH_OWNER'].includes(user.role) &&
                  l.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => void decideLeave(l.id, 'APPROVED')}
                        className="text-emerald-700 hover:underline"
                      >
                        Setujui
                      </button>
                      <button
                        onClick={() => void decideLeave(l.id, 'REJECTED')}
                        className="text-red-700 hover:underline"
                      >
                        Tolak
                      </button>
                    </>
                  )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
