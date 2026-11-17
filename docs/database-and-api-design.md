# Desain Database & Kontrak API — `mnilab-laundry` (`mnilab_laundry`)

Dokumen teknis **Fase 3** untuk repository `mnilab-laundry` dengan database PostgreSQL operasional terpisah: **`mnilab_laundry`**.

---

## 1. Prinsip Isolasi Multi-Tenant & Cabang

1. **Tenant Isolation (`tenant_id`)**:
   - Seluruh tabel operasional memiliki kolom `tenant_id UUID NOT NULL` yang terindeks.
   - `tenant_id` **TIDAK PERNAH** diambil/dipercaya dari request body atau query frontend sebagai sumber otorisasi; backend mengambil `tenant_id` hanya dari sesi/JWT terverifikasi atau resolusi subdomain/slug terverifikasi dari `mnilab-platform`.
   - Tidak ada foreign key ke database `mnilab_main`.
2. **Branch Access Control (`branch_id`)**:
   - **`SUPER_OWNER`**: Dapat melihat dan mengelola **seluruh cabang** di dalam `tenant_id` miliknya (bisa filter per cabang atau melihat konsolidasi semua cabang).
   - **`BRANCH_OWNER`, `CASHIER`, `WASHING`, `IRONING`**: Wajib terikat pada `branch_id` masing-masing; backend memaksa filter `branch_id = actor.branchId` dan menolak akses silang ke cabang lain (`403 Forbidden`).
3. **Entitlement Enforcement**:
   - Jika status subscription dari Platform adalah `EXPIRED`/`SUSPENDED`, seluruh endpoint operasional terkunci (`402/403`) dan UI menampilkan layar perpanjangan langganan.
   - Pembuatan cabang baru (`POST /branches`) wajib memvalidasi `activeBranchCount < entitlement.limits.maxBranches`.
   - Jika `isDemo = true`, mutasi operasional (`POST`/`PATCH`/`PUT`/`DELETE` selain `/auth/*`) ditolak di level guard backend (`403 Forbidden`).

---

## 2. Rancangan Skema Database (`mnilab_laundry`)

Seluruh tabel menggunakan `UUID` (`gen_random_uuid()`), nilai uang menggunakan `numeric(12,2)` (dengan kalkulasi integer/presisi di backend), dan timestamp `timestamptz`.

### 2.1. Tenant Snapshot & Organisasi
1. **`tenant_profiles`** (sinkronisasi cache ringan branding & status dari Platform)
   - `tenant_id` (PK, uuid), `slug` (varchar 80, unique), `brand_name`, `tagline`, `logo_url`, `theme_config_json` (jsonb), `whatsapp_phone`, `is_demo` (boolean), `subscription_status` (varchar 30), `max_branches` (int), `synced_at` (timestamptz)

2. **`branches`**
   - `id` (PK, uuid), `tenant_id` (uuid, indexed)
   - `name` (varchar 100), `code` (varchar 20), `UNIQUE (tenant_id, code)`
   - `address`, `phone`, `whatsapp_number`
   - `ironing_rate` (numeric 10,2, default `1100`)
   - `open_time` (varchar 10), `close_time` (varchar 10)
   - `default_min_weight_kg` (numeric 8,2, nullable)
   - `pay_later_fee` (numeric 10,2, default `1000`)
   - `latitude` (numeric 10,7, nullable), `longitude` (numeric 10,7, nullable), `attendance_radius_meters` (int, default `10`)
   - `is_main` (boolean), `is_active` (boolean)
   - `created_at`, `updated_at`

3. **`laundry_staff`** (mapping staf produk Laundry ke `platform_user_id` di `mnilab_main`)
   - `id` (PK, uuid), `tenant_id` (uuid, indexed)
   - `platform_user_id` (uuid — referensi logis ke `mnilab_main.platform_users.id`)
   - `branch_id` (FK -> `branches.id` ON DELETE SET NULL, nullable — `null` untuk `SUPER_OWNER`)
   - `name` (varchar 100), `email` (varchar 150, nullable), `phone` (varchar 20, nullable)
   - `role` (enum: `SUPER_OWNER`, `BRANCH_OWNER`, `CASHIER`, `WASHING`, `IRONING`)
   - `avatar_url` (text, nullable), `face_descriptor` (text, nullable — format `faceapi-v1`)
   - `is_active` (boolean, default `true`)
   - `UNIQUE (tenant_id, platform_user_id)`
   - `created_at`, `updated_at`

### 2.2. Master Pelanggan & Layanan
4. **`customers`**
   - `id` (PK, uuid), `tenant_id` (uuid, indexed)
   - `name` (varchar 100), `phone` (varchar 25 — dinormalisasi `08...` / `62...`), `address` (text, nullable), `notes` (text, nullable)
   - `UNIQUE (tenant_id, phone)`
   - `created_at`, `updated_at`

5. **`laundry_services`**
   - `id` (PK, uuid), `tenant_id` (uuid, indexed), `branch_id` (FK -> `branches.id` ON DELETE CASCADE, nullable)
   - `name` (varchar 100), `description` (text, nullable)
   - `workflow` (enum: `WASH_IRON`, `WASH_DRY`, `WASH_WET`, `IRON_ONLY`, `WASH_IRON_ITEM`)
   - `price_unit` (enum: `KG`, `ITEM`, `FLAT`)
   - `price` (numeric 12,2, `CHECK price >= 0`)
   - `min_weight_kg` (numeric 8,2, nullable), `estimated_duration_hours` (int, nullable)
   - `discount_type` (`NONE` | `PERCENTAGE` | `FIXED`), `discount_value` (numeric 12,2), `discount_active` (boolean)
   - `is_third_party` (boolean), `third_party_partner` (varchar 150, nullable)
   - `is_active` (boolean)
   - `UNIQUE (tenant_id, branch_id, name)` (partial unique index juga untuk `branch_id IS NULL`)
   - `created_at`, `updated_at`

6. **`service_price_history`**
   - `id` (PK, uuid), `tenant_id` (uuid, indexed), `service_id` (FK -> `laundry_services.id` ON DELETE CASCADE), `old_price`, `new_price`, `changed_by_staff_id` (uuid), `reason` (text, nullable), `created_at`

### 2.3. Transaksi Order, Workflow, & Pembayaran Order
7. **`laundry_orders`**
   - `id` (PK, uuid), `tenant_id` (uuid, indexed)
   - `order_number` (varchar 30), `UNIQUE (tenant_id, order_number)`
   - `branch_id` (FK -> `branches.id` ON DELETE RESTRICT)
   - `customer_id` (FK -> `customers.id` ON DELETE RESTRICT)
   - `cashier_staff_id` (FK -> `laundry_staff.id` ON DELETE RESTRICT)
   - `received_at`, `estimated_completion_at`
   - `subtotal`, `discount`, `is_pay_later` (boolean), `pay_later_fee`, `total`, `paid_amount`
   - `payment_status` (enum: `UNPAID`, `PARTIAL`, `PAID`)
   - `notes`, `picked_up_at`, `picked_up_by_staff_id` (FK -> `laundry_staff.id`, nullable)
   - `CHECK (subtotal >= 0 AND discount >= 0 AND discount <= subtotal)`
   - `CHECK (total = subtotal - discount + pay_later_fee)`
   - `CHECK (paid_amount >= 0 AND paid_amount <= total)`
   - `INDEX (tenant_id, branch_id, received_at)`

8. **`laundry_order_items`**
   - `id` (PK, uuid), `tenant_id` (uuid, indexed), `order_id` (FK -> `laundry_orders.id` ON DELETE RESTRICT), `service_id` (FK -> `laundry_services.id` ON DELETE RESTRICT)
   - Snapshot layanan: `service_name`, `workflow`, `price_unit`, `unit_price`, `weight_kg`, `garment_count`, `quantity`, `item_total`, `discount_amount`
   - Status & tracking: `status` (enum: `MENUNGGU_SETRIKA`, `PROSES_CUCI`, `PROSES_SETRIKA`, `SETRIKA_SELESAI`, `SELESAI`), `notes`
   - Upah setrika: `ironing_staff_id` (FK -> `laundry_staff.id`, nullable), `ironing_started_at`, `ironing_completed_at`, `ironing_rate`, `ironing_wage`, `ironing_payout_id` (FK -> `ironing_payouts.id`, nullable), `ironing_paid_at`
   - Rak & selesai: `rack_number` (varchar 20, nullable), `rack_assigned_by_staff_id` (nullable), `rack_assigned_at`, `completed_at`
   - `CHECK (status <> 'SELESAI' OR rack_number IS NOT NULL)`

9. **`order_status_history`**
   - `id` (PK, uuid), `tenant_id` (uuid, indexed), `order_item_id` (FK -> `laundry_order_items.id` ON DELETE CASCADE), `from_status`, `to_status`, `changed_by_staff_id` (FK -> `laundry_staff.id`), `notes`, `created_at`

10. **`payments`** (khusus pembayaran order customer laundry)
    - `id` (PK, uuid), `tenant_id` (uuid, indexed), `order_id` (FK -> `laundry_orders.id` ON DELETE RESTRICT), `branch_id` (FK -> `branches.id`), `cashier_staff_id` (FK -> `laundry_staff.id`)
    - `amount` (numeric 12,2), `method` (`CASH` | `QRIS` | `TRANSFER` | `OTHER`), `status` (`PENDING` | `SUCCESS` | `FAILED` | `CANCELLED`), `reference`, `paid_at`, `notes`, `created_at`

### 2.4. Upah Setrika, Pengeluaran, Setoran Kas, Absensi, & Cuti
11. **`ironing_payouts`**
    - `id` (PK, uuid), `tenant_id` (uuid, indexed), `branch_id` (FK -> `branches.id`), `employee_staff_id` (FK -> `laundry_staff.id`), `period_month`, `period_year`, `amount`, `total_items`, `status` (`PENDING` | `APPROVED` | `REJECTED`), `employee_notes`, `transfer_proof`, `payment_notes`, `paid_by_staff_id`, `paid_at`, `rejected_by_staff_id`, `rejected_at`, `rejection_reason`, `created_at`, `updated_at`
12. **`expense_categories`** & **`expenses`**
    - Kategori pengeluaran (`UNIQUE (tenant_id, name)`) dan catatan pengeluaran cabang (`branch_id`, `category_id`, `recorded_by_staff_id`, `amount`, `expense_date`, `payment_method`, `receipt_url`, `approval_status`, `approved_by_staff_id`, `approved_at`)
13. **`cash_settlements`**
    - Rekonsiliasi kas harian (`UNIQUE (tenant_id, branch_id, settlement_date)`): `cashier_staff_id`, `total_cash_in`, `total_qris_in`, `total_approved_expense`, `expected_cash`, `actual_cash`, `difference`, `status`, `reviewed_by_staff_id`, `reviewed_at`
14. **`attendances`**
    - Absensi harian (`UNIQUE (tenant_id, staff_id, attendance_date)`): `branch_id`, `check_in_at`, `check_out_at`, koordinat GPS & jarak meter (`check_in_lat`, `check_in_lng`, `check_in_distance_meters`, dll.), `face_distance`, `recorded_by_staff_id`
15. **`leave_requests`**
    - Pengajuan cuti/izin/sakit (`CUTI` | `IZIN` | `SAKIT`): `tenant_id`, `branch_id`, `staff_id`, `start_date`, `end_date`, `total_days`, `reason`, `status`, `reviewed_by_staff_id`, `reviewed_at`, `review_notes`

---

## 3. Pipeline Guard & Kontrak API (`mnilab-laundry/apps/api`)

Setiap request melewati urutan middleware/guard berikut:
1. **`TenantContextMiddleware`**: Resolusi `tenantSlug` dari subdomain / header / JWT -> validasi `tenant_id` aktif (jika tidak valid: `404`/`401`).
2. **`JwtAuthGuard` (kecuali `@Public()`)**: Verifikasi token sesi Laundry -> injeksi `actor: { platformUserId, staffId, tenantId, branchId, role }`.
3. **`EntitlementAndDemoGuard`**:
   - Pastikan langganan tenant untuk `LAUNDRY` masih aktif (`403` jika expired/suspended).
   - Tolak semua mutasi non-auth jika `tenant.isDemo === true`.
4. **`RolesGuard` & `BranchScope`**: Verifikasi role endpoint dan pastikan `BRANCH_OWNER`/`CASHIER`/`WASHING`/`IRONING` hanya bisa mengakses `branch_id` miliknya sendiri.

### Kelompok Endpoint Utama
- **Public & Tracking**: `GET /public/branding`, `GET /public/branches`, `GET /public/services`, `GET /public/tracking/search` & `/public/tracking/:orderNumber` (dengan masking + escape wildcard `ILIKE`)
- **Auth**: `POST /auth/login`, `POST /auth/sso/exchange`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/profile`, `PATCH /auth/password`
- **Branches & Staff**: `/branches/*` (cek kuota `maxBranches` dari entitlement), `/staff/*` (sinkronisasi pembuatan akun ke Platform internal API)
- **Catalog & Customers**: `/services/*`, `/customers/*`
- **Orders & Payments**: `/orders/*` (`POST /orders` hitung harga di backend, `GET /orders/:id/receipt`, `POST /orders/:id/pickup`), `/payments/*`
- **Workflow & Ironing Payout**: `/workflow/washing-queue`, `/workflow/ironing-queue`, `/workflow/items/:id/status`, `/workflow/items/:id/rack`, `/workflow/ironing-earnings`, `/workflow/ironing-history`, `/workflow/ironing-payouts/*`
- **Finance & HR**: `/expenses/*`, `/cash-settlements/*`, `/reports/summary`, `/attendances/*` (`branch-candidates`, `clock`, `monthly-summary`), `/leaves/*`
