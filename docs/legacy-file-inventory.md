# Inventarisasi File Legacy (`mnilab-laundry`)

Dokumen ini mencatat seluruh file yang disalin atau dijadikan referensi dari project lama (`d:\PROJECT\TMILab`) ke repository `mnilab-laundry` dan folder bersama `shared-docs`. Project lama diperlakukan sebagai **READ-ONLY** dan tidak pernah diubah atau dipindahkan.

## 1. File yang Disalin ke `mnilab-laundry`

| Sumber (`d:\PROJECT\TMILab\...`) | Tujuan (`mnilab-laundry\...`) | Status | Alasan |
|---|---|---|---|
| `TMILab_FE/public/Assets/logoLaundry.webp` | `apps/web/public/assets/logoLaundry.webp` | `COPY` | Aset logo default layanan laundry |
| `TMILab_FE/public/models/face_landmark_68_model-weights_manifest.json` | `apps/web/public/models/face_landmark_68_model-weights_manifest.json` | `COPY` | Model AI landmark wajah (68 titik) untuk absensi biometrik |
| `TMILab_FE/public/models/face_landmark_68_model.bin` | `apps/web/public/models/face_landmark_68_model.bin` | `COPY` | Bobot biner model landmark wajah |
| `TMILab_FE/public/models/face_recognition_model-weights_manifest.json` | `apps/web/public/models/face_recognition_model-weights_manifest.json` | `COPY` | Model AI pengenalan descriptor wajah 128-D |
| `TMILab_FE/public/models/face_recognition_model.bin` | `apps/web/public/models/face_recognition_model.bin` | `COPY` | Bobot biner model pengenalan wajah |
| `TMILab_FE/public/models/ssd_mobilenetv1_model-weights_manifest.json` | `apps/web/public/models/ssd_mobilenetv1_model-weights_manifest.json` | `COPY` | Model deteksi wajah SSD MobileNetV1 |
| `TMILab_FE/public/models/ssd_mobilenetv1_model.bin` | `apps/web/public/models/ssd_mobilenetv1_model.bin` | `COPY` | Bobot biner deteksi wajah SSD MobileNetV1 |
| `TMILab_FE/public/models/tiny_face_detector_model-weights_manifest.json` | `apps/web/public/models/tiny_face_detector_model-weights_manifest.json` | `COPY` | Model deteksi wajah ringan (Tiny Face Detector) |
| `TMILab_FE/public/models/tiny_face_detector_model.bin` | `apps/web/public/models/tiny_face_detector_model.bin` | `COPY` | Bobot biner Tiny Face Detector |

## 2. File Referensi Lintas Produk (Disalin ke `../shared-docs`)

| Sumber (`d:\PROJECT\TMILab\...`) | Tujuan (`shared-docs\...`) | Status | Alasan |
|---|---|---|---|
| `README.md` | `architecture/legacy-tmilab-overview.md` | `REFERENCE ONLY` | Arsip daftar fitur Laundry OS & arsitektur lama |
| `DEPLOY_VPS_NAT_GUIDE.md` | `deployment/legacy-deploy-vps-nat-guide.md` | `UPDATE REQUIRED` | Panduan deploy VPS NAT, Cloudflare Tunnel, PM2, & restore |
| `docker-compose.yml` | `deployment/legacy-docker-compose.yml` | `UPDATE REQUIRED` | Referensi containerization |
| `ecosystem.config.cjs` | `deployment/legacy-ecosystem.config.cjs` | `UPDATE REQUIRED` | Referensi PM2 |
| `TMILab_BE/Dockerfile` | `deployment/legacy-backend.Dockerfile` | `UPDATE REQUIRED` | Referensi Dockerfile NestJS |
| `TMILab_FE/Dockerfile` | `deployment/legacy-frontend.Dockerfile` | `UPDATE REQUIRED` | Referensi Dockerfile Next.js |
| `scripts/backup-db.sh` | `database/legacy-backup-db.sh` | `UPDATE REQUIRED` | Referensi auto-backup PostgreSQL terenkripsi ke Telegram |
| `scripts/.backup.env.example` | `database/backup.env.example` | `UPDATE REQUIRED` | Template konfigurasi backup aman |

## 3. Modul & Kode Legacy yang Dijadikan Referensi Reimplementasi (`REFERENCE ONLY`)

Seluruh business logic operasional Laundry lama dipertahankan dan direimplementasikan ulang secara bersih untuk mendukung isolasi `tenant_id` di database `mnilab_laundry`:

- `TMILab_BE/src/orders/` (`pricing.ts`, `orders.service.ts`, entity snapshot item)
- `TMILab_BE/src/workflow/` (`workflow.config.ts`, `workflow.policy.ts`, `workflow.service.ts`, `ironing-payout.entity.ts`, `laundry-business.spec.ts`)
- `TMILab_BE/src/branches/`, `users/`, `customers/`, `laundry-services/`, `payments/`, `expenses/`, `cash-settlements/`, `attendances/`, `leaves/`, `reports/`, `public-tracking/`
- `TMILab_BE/src/common/` (`enums.ts`, `security/*`, `utils/*`, `security.spec.ts`)
- `TMILab_FE/app/portal/` (`page.tsx`, `AttendanceSection.tsx`, `IroningPayoutSection.tsx`, `LeaveSection.tsx`, `PortalModals.tsx`) — dipecah per modul/role agar tidak menjadi file tunggal 6.061 baris
- `TMILab_FE/app/[branchSlug]/page.tsx`, `app/page.tsx`, `app/components/DemoSandboxBar.tsx`, `TenantSubscriptionLockedScreen.tsx`, `app/lib/face-utils.ts`, `app/lib/theme-utils.ts`

## 4. File yang Sengaja Tidak Disalin (`DO NOT COPY`)

- `TMILab_BE/.env`, `TMILab_FE/.env.local`, `scripts/.backup.env`, `SUPER_ADMIN_CREDENTIALS.md` (berisi secret/kredensial)
- `node_modules/`, `dist/`, `.next/`, `*.tsbuildinfo` (dependency & artifact build)
