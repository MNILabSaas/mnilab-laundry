# MNILab Laundry (`mnilab-laundry`)

Aplikasi operasional bisnis laundry multi-cabang dan multi-tenant di dalam ekosistem **MNILab**. Beroperasi secara mandiri dari sisi operasional laundry dan terintegrasi ke **MNILab Platform** untuk validasi identitas, keanggotaan tenant, dan entitlement langganan.

## Tanggung Jawab Domain
- **Multi-Cabang & White-Label**: Pengaturan cabang (`isMain`, jam buka/tutup, `ironingRate`, `defaultMinWeightKg`, `payLaterFee`, GPS & radius absensi), kustomisasi branding per tenant.
- **Katalog Layanan & Riwayat Harga**: Layanan `KG`, `ITEM`, `FLAT`, minimum berat, diskon layanan, layanan pihak ketiga, dan audit riwayat harga.
- **Kasir POS & Pelanggan**: Pembuatan transaksi dengan kalkulasi total di backend, cetak struk thermal 58mm/80mm, kirim nota WhatsApp, opsi Pay Later, dan status pengambilan (`markPickedUp`).
- **5 Workflow Operasional & Rak**: `WASH_IRON`, `WASH_DRY`, `WASH_WET`, `IRON_ONLY`, `WASH_IRON_ITEM` dengan transisi berbasis role, penugasan rak wajib sebelum `SELESAI`, dan riwayat status.
- **Upah Setrika & Pencairan (Ironing Payout)**: Kalkulasi komisi setrika, pengajuan pencairan oleh pegawai setrika, persetujuan/penolakan owner dengan bukti transfer, dan rekapan bulanan Excel.
- **Keuangan Cabang**: Multi-pembayaran order (`CASH`/`QRIS`/`TRANSFER`/`OTHER`), pengajuan & approval pengeluaran, setoran kas harian (`cash_settlements`), serta laporan keuangan konsolidasi.
- **Absensi Biometrik & Cuti**: Absensi wajah (`@vladmandic/face-api`) + geofencing GPS cabang, ringkasan absensi bulanan, dan pengajuan cuti/izin/sakit.
- **Cek Nota Publik & Mode Demo**: Pelacakan order publik tanpa login (dengan masking privasi) dan sandbox demo read-only.

## Struktur Direktori
```text
mnilab-laundry/
├── apps/
│   ├── web/        # Next.js (Landing Tenant, Cek Nota Publik, Portal Operasional)
│   └── api/        # NestJS (Operasional Laundry API, Database mnilab_laundry)
├── database/       # TypeORM migrations & seeds untuk database mnilab_laundry
├── docs/           # Dokumentasi domain laundry, workflow, & inventaris legacy
├── scripts/        # Script operasional & deployment produk Laundry
├── .env.example    # Template variabel environment (tanpa nilai rahasia)
└── README.md
```

## Database & Isolasi Tenant
- Menggunakan database PostgreSQL operasional tersendiri: **`mnilab_laundry`**.
- Tidak mengakses tabel internal `mnilab_main` secara langsung.
- Seluruh data operasional diisolasi menggunakan `tenant_id` yang divalidasi di backend berdasarkan konteks autentikasi & entitlement dari `mnilab-platform`.

## Panduan Awal Environment
Salin `.env.example` menjadi `.env` (untuk API) / `.env.local` (untuk Web) saat masuk fase implementasi, lalu isi nilai rahasia secara lokal. **Jangan pernah commit file `.env*` atau kredensial ke Git.**
