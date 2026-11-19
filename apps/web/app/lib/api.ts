export type UserRole =
  | 'SUPER_OWNER'
  | 'BRANCH_OWNER'
  | 'OWNER'
  | 'CASHIER'
  | 'IRONING'
  | 'WASHING';
export type PriceUnit = 'KG' | 'ITEM' | 'FLAT';
export type WorkflowCode =
  | 'WASH_IRON'
  | 'WASH_DRY'
  | 'WASH_WET'
  | 'IRON_ONLY'
  | 'WASH_IRON_ITEM';
export type ItemStatus =
  | 'MENUNGGU_SETRIKA'
  | 'PROSES_CUCI'
  | 'PROSES_SETRIKA'
  | 'SETRIKA_SELESAI'
  | 'SELESAI';
export type PaymentMethod = 'CASH' | 'QRIS' | 'TRANSFER' | 'OTHER';
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
export type OrderPaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
export type ExpenseApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export const EXPENSE_APPROVAL_LABELS: Record<ExpenseApprovalStatus, string> = {
  PENDING: 'Menunggu Persetujuan',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
};

export const STATUS_LABELS: Record<ItemStatus, string> = {
  MENUNGGU_SETRIKA: 'Menunggu Setrika',
  PROSES_CUCI: 'Proses Cuci',
  PROSES_SETRIKA: 'Proses Setrika',
  SETRIKA_SELESAI: 'Setrika Selesai',
  SELESAI: 'Selesai (Siap Diambil)',
};

export const WORKFLOW_LABELS: Record<WorkflowCode, string> = {
  WASH_IRON: 'Cuci + Setrika',
  WASH_DRY: 'Cuci Kering',
  WASH_WET: 'Cuci Mamel (Basah)',
  IRON_ONLY: 'Setrika Saja',
  WASH_IRON_ITEM: 'Cuci Satuan + Setrika',
};

export interface FeatureHighlightItem {
  icon: string;
  title: string;
  description: string;
}

export interface TenantLandingConfig {
  heroSlogan?: string;
  heroDescription?: string;
  features?: FeatureHighlightItem[];
}

export const DEFAULT_LANDING_SLOGAN = 'CUCI BERSIH. SETRIKA RAPI. TANPA CAMPUR.';
export const DEFAULT_LANDING_HERO_DESC =
  'Setiap cucian diproses 1 mesin 1 pelanggan, disetrika uap, dan dilengkapi layanan antar-jemput gratis radius 3 km dari outlet kami.';

export const DEFAULT_LANDING_FEATURES: FeatureHighlightItem[] = [
  {
    icon: 'washing-machine',
    title: '1 mesin untuk 1 pelanggan',
    description:
      'Pakaian Anda tidak pernah digabung dengan cucian pelanggan lain. Higienis sejak pencucian hingga keluar mesin pengering.',
  },
  {
    icon: 'truck',
    title: 'Gratis antar-jemput 3 km',
    description:
      'Bebas biaya penjemputan dan pengantaran untuk wilayah Surabaya Timur dalam radius 3 km dari workshop.',
  },
  {
    icon: 'check-circle',
    title: 'Setrika uap & status transparan',
    description:
      'Setrika uap menjaga serat pakaian tetap rapi dengan parfum tahan lama. Pantau setiap tahapan pengerjaan langsung dari nomor nota.',
  },
];

export const AVAILABLE_LANDING_ICONS: Array<{ id: string; label: string }> = [
  { id: 'washing-machine', label: 'Mesin Cuci (Higienis / 1 Mesin)' },
  { id: 'truck', label: 'Kurir / Antar-Jemput (Delivery)' },
  { id: 'iron', label: 'Setrika Uap (Rapi)' },
  { id: 'check-circle', label: 'Centang Hijau (Terverifikasi)' },
  { id: 'clock', label: 'Jam Buka / Cepat Selesai' },
  { id: 'sparkles', label: 'Kinclong / Wangi Semerbak' },
  { id: 'shield-check', label: 'Perisai / Garansi Pakaian' },
  { id: 'tag', label: 'Tag Harga / Hemat' },
  { id: 'x-circle', label: 'Silang / Anti Campur Pakaian' },
  { id: 'heart', label: 'Hati / Perawatan Lembut' },
  { id: 'droplet', label: 'Tetesan Air / Deterjen Cair' },
  { id: 'star', label: 'Bintang Kualitas Utama' },
];

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  whatsappNumbersJson?: string[] | null;
  ironingRate: number;
  openTime?: string | null;
  closeTime?: string | null;
  defaultMinWeightKg?: number | null;
  payLaterFee?: number;
  latitude?: number | null;
  longitude?: number | null;
  attendanceRadiusMeters?: number;
  isMain: boolean;
  isActive: boolean;
  landingConfigJson?: TenantLandingConfig | null;
  createdAt?: string;
}

export function getBranchPhoneList(branch?: Branch | null): string[] {
  if (!branch) return [];
  const raw: string[] = [];
  if (Array.isArray(branch.whatsappNumbersJson)) {
    for (const item of branch.whatsappNumbersJson) {
      if (typeof item === 'string') raw.push(...item.split(/[,;\n]+/));
    }
  }
  if (branch.whatsappNumber) {
    raw.push(...branch.whatsappNumber.split(/[,;\n]+/));
  }
  if (branch.phone) {
    raw.push(...branch.phone.split(/[,;\n]+/));
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const r of raw) {
    const trimmed = r.trim();
    if (!trimmed) continue;
    const digits = trimmed.replace(/[^0-9]/g, '') || trimmed;
    if (!seen.has(digits)) {
      seen.add(digits);
      result.push(trimmed);
    }
  }
  return result;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  avatarUrl?: string | null;
  faceDescriptor?: string | null;
  branchId?: string | null;
  branch?: Branch | null;
}

export interface LaundryServiceItem {
  id: string;
  name: string;
  description: string | null;
  workflow: WorkflowCode;
  priceUnit: PriceUnit;
  price: number;
  minWeightKg: number | null;
  estimatedDurationHours: number | null;
  discountType?: 'NONE' | 'PERCENTAGE' | 'FIXED';
  discountValue?: number;
  discountActive?: boolean;
  isThirdParty?: boolean;
  thirdPartyPartner?: string | null;
  branchId?: string | null;
  branch?: Branch | null;
  isActive: boolean;
}

export interface PublicTrackedOrder {
  orderNumber: string;
  branchId?: string | null;
  branchName?: string | null;
  customerDisplayName: string;
  receivedAt: string;
  estimatedCompletionAt: string | null;
  isPickedUp: boolean;
  items: Array<{
    serviceName: string;
    status: ItemStatus;
    statusLabel: string;
    steps: Array<{
      code: string;
      label: string;
      done: boolean;
      active: boolean;
    }>;
    ironingEmployeeName: string | null;
    rackLocation?: string | null;
  }>;
}

export interface CustomerItem {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  notes: string | null;
}

export interface OrderItemDetail {
  id: string;
  serviceId: string;
  serviceName: string;
  workflow: WorkflowCode;
  priceUnit: PriceUnit;
  unitPrice: number;
  weightKg: number | null;
  garmentCount: number | null;
  quantity: number;
  itemTotal: number;
  discountAmount?: number;
  status: ItemStatus;
  notes: string | null;
  ironingEmployeeId: string | null;
  ironingEmployee?: { id: string; name: string } | null;
  ironingStartedAt: string | null;
  ironingCompletedAt: string | null;
  ironingRate?: number | null;
  ironingWage?: number | null;
  rackNumber: string | null;
  rackAssignedBy?: { id: string; name: string } | null;
  rackAssignedAt: string | null;
  completedAt: string | null;
  canCompleteNow?: boolean;
  order?: {
    id: string;
    orderNumber: string;
    receivedAt: string;
    customer: CustomerItem;
  };
}

export interface PaymentItem {
  id: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string | null;
  paidAt: string | null;
  notes: string | null;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  branchId?: string;
  branch?: Branch | null;
  customerId: string;
  customer: CustomerItem;
  cashier: { id: string; name: string };
  receivedAt: string;
  estimatedCompletionAt: string | null;
  subtotal: number;
  discount: number;
  isPayLater?: boolean;
  payLaterFee?: number;
  total: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: OrderPaymentStatus;
  notes: string | null;
  pickedUpAt: string | null;
  items: OrderItemDetail[];
  payments?: PaymentItem[];
}

export interface AttendanceItem {
  id: string;
  branchId: string;
  branch?: Branch | null;
  userId: string;
  user?: AuthUser | null;
  recordedById?: string | null;
  recordedBy?: { id: string; name: string } | null;
  attendanceDate: string;
  checkInAt: string;
  checkOutAt: string | null;
  checkInLat: number | null;
  checkInLng: number | null;
  checkInDistanceMeters: number | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  checkOutDistanceMeters: number | null;
  checkInPhoto: string | null;
  checkOutPhoto: string | null;
  faceMatchScore: number | null;
  workDurationMinutes: number | null;
  status: 'CHECKED_IN' | 'COMPLETED';
  notes: string | null;
}

export interface BranchAttendanceCandidatesResponse {
  branch: {
    id: string;
    name: string;
    code: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    attendanceRadiusMeters: number;
  };
  todayDate: string;
  employees: Array<{
    id: string;
    name: string;
    role: UserRole;
    email: string | null;
    phone: string | null;
    avatarUrl: string | null;
    faceDescriptor: string | null;
    todayAttendance: AttendanceItem | null;
  }>;
}

export interface EmployeeMonthlyAttendanceSummary {
  userId: string;
  userName: string;
  role: UserRole;
  avatarUrl: string | null;
  branchId: string | null;
  branchName: string;
  totalDaysPresent: number;
  completedDays: number;
  totalMinutes: number;
  totalHours: number;
}

export interface BranchMonthlyAttendanceSummary {
  branchId: string;
  branchName: string;
  branchCode: string;
  branchAddress: string | null;
  isMain?: boolean;
  totalEmployees: number;
  totalDaysPresent: number;
  completedDays: number;
  totalMinutes: number;
  totalHours: number;
  employeeSummaries: EmployeeMonthlyAttendanceSummary[];
  records: AttendanceItem[];
}

export interface MonthlyAttendanceSummaryResponse {
  month: number;
  year: number;
  branchId: string | null;
  employeeSummaries: EmployeeMonthlyAttendanceSummary[];
  branchSummaries?: BranchMonthlyAttendanceSummary[];
  records: AttendanceItem[];
}

export type LeaveType = 'CUTI' | 'IZIN' | 'SAKIT';

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  CUTI: 'Cuti Tahunan / Resmi',
  IZIN: 'Minta Libur / Izin Pribadi',
  SAKIT: 'Izin Sakit',
};

export interface LeaveRequestItem {
  id: string;
  branchId: string;
  branch?: Branch | null;
  userId: string;
  user?: AuthUser | null;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: ExpenseApprovalStatus;
  reviewedById: string | null;
  reviewedBy?: { id: string; name: string } | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
}

export interface ExpenseItem {
  id: string;
  description: string;
  amount: number;
  expenseDate: string;
  paymentMethod: PaymentMethod;
  notes: string | null;
  receiptUrl: string | null;
  approvalStatus: ExpenseApprovalStatus;
  approvedById: string | null;
  approvedBy?: { id: string; name: string } | null;
  approvedAt: string | null;
  rejectionNote: string | null;
  recordedBy?: { id: string; name: string } | null;
  branchId?: string | null;
  branch?: Branch | null;
  category: { id: string; name: string };
}

export interface CashSettlementItem {
  id: string;
  branchId: string;
  branch?: Branch | null;
  settlementDate: string;
  cashierId: string;
  cashier: { id: string; name: string };
  totalCashIn: number;
  totalQrisIn: number;
  totalApprovedExpense: number;
  expectedCash: number;
  actualCash: number;
  difference: number;
  status: ExpenseApprovalStatus;
  cashierNotes: string | null;
  reviewedById: string | null;
  reviewedBy?: { id: string; name: string } | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IroningPayoutItem {
  id: string;
  branchId: string;
  employeeId: string;
  periodMonth: number;
  periodYear: number;
  amount: number;
  totalItems: number;
  status: ExpenseApprovalStatus;
  employeeNotes: string | null;
  transferProof: string | null;
  paymentNotes: string | null;
  paidById: string | null;
  paidAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  employee?: { id: string; name: string; email: string; phone?: string | null };
  branch?: { id: string; name: string; code?: string };
  paidBy?: { id: string; name: string };
  items?: Array<{
    id: string;
    orderNumber?: string;
    customerName?: string;
    serviceName: string;
    completedAt?: string;
    weightKg?: number | null;
    quantity?: number;
    ironingRate?: number;
    ironingWage?: number;
  }>;
}

export interface IroningEarningsResponse {
  month: number;
  year: number;
  employee?: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    branchName?: string | null;
    branchCode?: string | null;
  } | null;
  totalEarnings: number;
  unpaidEarnings?: number;
  monthTotalEarnings?: number;
  paidEarnings?: number;
  pendingEarnings?: number;
  totalItems: number;
  totalWeightKg?: number;
  unpaidItemsCount?: number;
  paidItemsCount?: number;
  canRequestPayout?: boolean;
  payoutStatus?: 'UNPAID' | 'PENDING' | 'PAID';
  latestPayout?: {
    id: string;
    status: ExpenseApprovalStatus;
    amount: number;
    totalItems: number;
    periodMonth: number;
    periodYear: number;
    employeeNotes: string | null;
    transferProof: string | null;
    paymentNotes: string | null;
    paidAt: string | null;
    paidByName: string | null;
    rejectionReason: string | null;
    createdAt: string;
  } | null;
  items: Array<{
    id: string;
    orderId: string;
    orderNumber: string;
    customerName: string;
    customerPhone?: string | null;
    serviceName: string;
    completedAt: string;
    weightKg: number | null;
    quantity: number;
    ironingRate: number;
    ironingWage: number;
    ironingPayoutId?: string | null;
    ironingPaidAt?: string | null;
    isPaid?: boolean;
    isPending?: boolean;
    isUnpaid?: boolean;
  }>;
}

export interface IroningHistoryItem {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  serviceName: string;
  status: ItemStatus;
  startedAt: string | null;
  completedAt: string | null;
  weightKg: number | null;
  quantity: number;
  ironingRate: number;
  ironingWage: number;
  ironingEmployeeName: string | null;
}

export interface TenantBankAccountItem {
  id?: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  isPrimary?: boolean;
}

export interface QrisBranchTransactionItem {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  amount: number;
  paidAt: string | null;
  reference: string | null;
  qrisWithdrawalId: string | null;
  qrisSettledAt: string | null;
  withdrawalStatus: 'UNWITHDRAWN' | 'PENDING' | 'APPROVED';
}

export interface QrisBranchReconciliationSummary {
  branchId: string;
  branchName: string;
  branchCode: string;
  isMain: boolean;
  periodMonth: number;
  periodYear: number;
  totalQrisCollected: number;
  withdrawnApprovedAmount: number;
  pendingWithdrawalAmount: number;
  availableToWithdrawAmount: number;
  totalTransactions: number;
  unwithdrawnTransactionsCount: number;
  canRequestWithdrawal: boolean;
  transactions: QrisBranchTransactionItem[];
}

export interface QrisWithdrawalItem {
  id: string;
  tenantId: string;
  branchId: string;
  branchName: string;
  branchCode: string;
  periodMonth: number;
  periodYear: number;
  amount: number;
  totalTransactions: number;
  status: ExpenseApprovalStatus;
  requestedByName: string;
  ownerNotes: string | null;
  targetBankAccount: TenantBankAccountItem | null;
  transferProof: string | null;
  adminNotes: string | null;
  reviewedByEmail: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

export interface QrisReconciliationResponse {
  month: number;
  year: number;
  qrisPaymentEnabled?: boolean;
  qrisProvider?: string;
  qrisMaintenanceMessage?: string;
  bankAccounts: TenantBankAccountItem[];
  summary: {
    totalQrisCollected: number;
    withdrawnApprovedAmount: number;
    pendingWithdrawalAmount: number;
    availableToWithdrawAmount: number;
    totalTransactions: number;
  };
  branchSummaries: QrisBranchReconciliationSummary[];
  withdrawals: QrisWithdrawalItem[];
}

export interface TenantBranding {
  id: string;
  slug: string;
  customDomain?: string | null;
  brandName: string;
  tagline: string;
  logoUrl: string | null;
  primaryColor: string;
  primaryHoverColor: string;
  darkColor: string;
  secondaryColor: string;
  surfaceColor: string;
  cityOrRegion: string | null;
  defaultAddress: string | null;
  whatsappPhone: string | null;
  bankAccounts?: TenantBankAccountItem[];
  qrisPaymentEnabled?: boolean;
  isDefault: boolean;
  isDemo?: boolean;
  isActive?: boolean;
  isSubscriptionBlocked?: boolean;
  maxBranches?: number;
  subscriptionPlan?: string;
  tenantStatus?: string;
  subscriptionEndAt?: string | null;
  theme?: {
    primaryColor?: string;
    primaryHoverColor?: string;
    darkColor?: string;
    secondaryColor?: string;
    surfaceColor?: string;
    landingConfig?: TenantLandingConfig;
  };
  landingConfig?: TenantLandingConfig;
}

export function isTenantBrandingBlocked(branding?: TenantBranding | null): boolean {
  if (!branding) return false;
  if (branding.isDemo || branding.slug === 'demo-laundry') return false;
  if (branding.isSubscriptionBlocked === true || branding.isActive === false) {
    return true;
  }
  const st = (branding.tenantStatus || 'ACTIVE').toUpperCase();
  if (['STOPPED', 'SUSPENDED', 'EXPIRED', 'CANCELLED'].includes(st)) {
    return true;
  }
  if (
    branding.subscriptionEndAt &&
    new Date(branding.subscriptionEndAt).getTime() <= Date.now()
  ) {
    return true;
  }
  return false;
}

export interface SaasPlanItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  currency: string;
  billingInterval: string;
  maxBranches: number;
  featuresJson: string;
  features: string[];
  isPopular: boolean;
  isPublished: boolean;
  sortOrder: number;
}

export interface SaasSubscriptionItem {
  id: string;
  tenantId: string;
  tenantName: string;
  planCode: string;
  planName: string;
  priceAmount: number;
  maxBranches: number;
  status: string;
  startAt: string;
  endAt: string;
  notes: string | null;
  createdAt: string;
}

export interface SaasPaymentItem {
  id: string;
  invoiceNumber: string;
  tenantId: string;
  tenantName: string;
  planCode: string;
  amount: number;
  paymentMethod: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  referenceNote: string | null;
  reviewedByEmail: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
}

export interface SaasAuditLogItem {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: string | null;
  createdAt: string;
}

export interface SaasPlatformSettingsItem {
  id: string;
  platformName: string;
  platformTagline: string;
  logoUrl: string;
  loadingLogoUrl: string;
  whatsappNumber: string;
  whatsappGreeting: string;
  supportEmail: string;
  demoTenantSlug: string;
}

export interface PlatformPublicInfoResponse {
  settings: SaasPlatformSettingsItem;
  plans: SaasPlanItem[];
  demo: {
    slug: string;
    brandName: string;
    loginEmail: string;
    loginPassword: string;
    cashierEmail: string;
    ironerEmail: string;
    washerEmail: string;
    isReadOnly: boolean;
  };
}

export const BAGUS_LAUNDRY_DEFAULT_BRANDING: TenantBranding = {
  id: 'default-bagus-laundry',
  slug: 'bagus-laundry',
  brandName: 'Bagus Laundry',
  tagline: 'The Best Partner in Laundry Service',
  logoUrl: '/Assets/logoLaundry.webp',
  primaryColor: '#9fe870',
  primaryHoverColor: '#8ee05c',
  darkColor: '#163300',
  secondaryColor: '#054d28',
  surfaceColor: '#e2f6d5',
  cityOrRegion: 'Surabaya Timur',
  defaultAddress: 'Jl. Karang Menjangan 3F No. 2, Surabaya Timur',
  whatsappPhone: '0812-3456-7890',
  isDefault: true,
};

export const DEMO_LAUNDRY_DEFAULT_BRANDING: TenantBranding = {
  id: 'd4565d3c-d04d-463b-8a85-5df924d0b88a',
  slug: 'demo-laundry',
  brandName: 'Lumière Atelier Laundry (DEMO)',
  tagline: 'Premium Garment Care & Steam Ironing',
  logoUrl: '/Assets/logoDemoLaundry.webp',
  primaryColor: '#e0a96d',
  primaryHoverColor: '#cbaf80',
  darkColor: '#1a140e',
  secondaryColor: '#2b2118',
  surfaceColor: '#3d2e20',
  cityOrRegion: 'Jakarta Selatan',
  defaultAddress: 'Jl. Senopati Raya No. 88, Kebayoran Baru',
  whatsappPhone: '0812-1739-5849',
  isDefault: false,
  isDemo: true,
  isActive: true,
  isSubscriptionBlocked: false,
};

const API_BASE = (
  process.env.NEXT_PUBLIC_LAUNDRY_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:3003'
).replace(/\/$/, '');

export const PLATFORM_WEB_URL = (
  process.env.NEXT_PUBLIC_PLATFORM_URL || 'http://127.0.0.1:3000'
).replace(/\/$/, '');

export function formatRupiah(value: number): string {
  return `Rp${Number(value || 0).toLocaleString('id-ID')}`;
}

export const MAIN_PLATFORM_DOMAIN = (
  process.env.NEXT_PUBLIC_MAIN_DOMAIN?.trim() || 'mnilab.my.id'
).toLowerCase();

/** Subdomain tenant = slug tenant yang didaftarkan Super Admin (demo-laundry → demo). */
export function getTenantSubdomain(slug?: string, brandName?: string): string {
  const cleanSlug = (slug || '').trim().toLowerCase();
  if (cleanSlug === 'demo-laundry') return 'demo';
  if (cleanSlug && /^[a-z0-9-]+$/.test(cleanSlug)) return cleanSlug;
  const fromBrand = (brandName || '')
    .replace(/\(demo\)/gi, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  return fromBrand || 'mitralaundry';
}

export function formatTenantSubdomainHost(
  brandName: string,
  fallbackSlug?: string,
  customDomain?: string | null,
): string {
  if (customDomain && customDomain.trim()) {
    return customDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');
  }
  return `${getTenantSubdomain(fallbackSlug, brandName)}.${MAIN_PLATFORM_DOMAIN}`;
}

/** Link publik cek nota cabang, contoh: baguslaundry.mnilab.my.id/pusat atau baguslaundry.com/pusat */
export function formatBranchPublicUrl(
  branding: Pick<TenantBranding, 'brandName' | 'slug' | 'customDomain'>,
  branch: Branch,
): string {
  return `${formatTenantSubdomainHost(branding.brandName, branding.slug, branding.customDomain)}/${getBranchSlug(branch, branding.brandName)}`;
}

export function extractTenantSlugFromHost(hostname?: string): string | null {
  const raw = (
    hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')
  )
    .trim()
    .toLowerCase();
  if (
    !raw ||
    raw === 'localhost' ||
    raw === '127.0.0.1' ||
    raw.endsWith('.ngrok-free.dev') ||
    raw.endsWith('.ngrok-free.app') ||
    raw.endsWith('.ngrok.app')
  ) {
    return null;
  }

  const reserved = new Set(['www', 'tmilab', 'mnilab', 'api', 'admin', 'portal', 'laundry', 'app']);

  for (const suffix of [
    `.${MAIN_PLATFORM_DOMAIN}`,
    '.mnilab.my.id',
    '.mnilab.id',
    '.localhost',
  ]) {
    if (raw.endsWith(suffix)) {
      const sub = raw.slice(0, -suffix.length);
      if (sub && !sub.includes('.') && !reserved.has(sub)) {
        return sub === 'demo' ? 'demo-laundry' : sub;
      }
      return null;
    }
  }

  // Jika diakses melalui Custom Domain mandiri (mis. berkahlaundry.com atau www.berkahlaundry.id)
  if (
    raw.includes('.') &&
    raw !== MAIN_PLATFORM_DOMAIN &&
    raw !== 'mnilab.my.id' &&
    raw !== 'mnilab.id'
  ) {
    return raw.replace(/^www\./, '');
  }

  return null;
}

export function slugifyText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getBranchSlug(branch: Branch, brandName?: string): string {
  let cleanName = branch.name || branch.code || 'pusat';
  if (brandName) {
    const escapedBrand = brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleanName = cleanName.replace(new RegExp(`^${escapedBrand}\\s*[—\\-•:]?\\s*`, 'i'), '');
  }
  cleanName = cleanName.replace(/^lumi[eè]re\s+atelier\s*[—\-•:]?\s*/i, '');
  const slug = slugifyText(cleanName);
  if (!slug) return branch.isMain ? 'pusat' : slugifyText(branch.code || 'cabang');
  return slug;
}

export function findMatchingBranchBySlug(
  branches: Branch[],
  rawSlug: string,
  brandName?: string,
): Branch | null {
  if (!branches || branches.length === 0) return null;
  const target = slugifyText(decodeURIComponent(rawSlug || ''));
  if (!target) return null;

  // 1. Pencocokan eksak pada branch slug, full name slug, atau kode cabang
  for (const b of branches) {
    const bSlug = getBranchSlug(b, brandName);
    const fullSlug = slugifyText(b.name);
    const codeSlug = slugifyText(b.code);
    if (target === bSlug || target === fullSlug || target === codeSlug) {
      return b;
    }
  }

  // 2. Pencocokan kata kunci "pusat" / "tenant-pusat" / "cabang-pusat" ke cabang utama (isMain)
  if (
    target === 'pusat' ||
    target === 'tenant-pusat' ||
    target === 'cabang-pusat' ||
    target === 'utama'
  ) {
    const main =
      branches.find((b) => b.isMain) ||
      branches.find((b) => b.name.toLowerCase().includes('pusat'));
    if (main) return main;
  }

  // 3. Pencocokan parsial (misal /senopati atau /dharmawangsa)
  for (const b of branches) {
    const bSlug = getBranchSlug(b, brandName);
    if (bSlug.includes(target) || target.includes(bSlug)) {
      return b;
    }
  }

  return null;
}

export function buildBranchTrackingHref(
  branch: Branch,
  tenantSlug?: string,
  brandName?: string,
): string {
  const bSlug = getBranchSlug(branch, brandName);
  if (typeof window !== 'undefined') {
    const hostSlug = extractTenantSlugFromHost(window.location.hostname);
    if (hostSlug) {
      return `/${bSlug}`;
    }
  }
  const activeTenant = tenantSlug || getActiveTenantSlug();
  return `/${bSlug}?tenant=${encodeURIComponent(activeTenant)}`;
}

export function getActiveTenantSlug(): string {
  if (typeof window === 'undefined') return 'demo-laundry';
  try {
    const fromHost = extractTenantSlugFromHost(window.location.hostname);
    if (fromHost) {
      window.localStorage.setItem('laundry_tenant_slug', fromHost);
      return fromHost;
    }
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('tenant')?.trim().toLowerCase();
    if (fromUrl && /^[a-z0-9-]+$/.test(fromUrl)) {
      window.localStorage.setItem('laundry_tenant_slug', fromUrl);
      return fromUrl;
    }
  } catch {
    // ignore
  }
  return window.localStorage.getItem('laundry_tenant_slug') || 'demo-laundry';
}

export function setActiveTenantSlug(slug: string): void {
  if (typeof window === 'undefined') return;
  const clean = slug.trim().toLowerCase() || 'bagus-laundry';
  window.localStorage.setItem('laundry_tenant_slug', clean);
}

export function getStoredTenantBranding(): TenantBranding {
  const activeSlug = getActiveTenantSlug();
  const defaultBranding =
    activeSlug === 'demo-laundry'
      ? DEMO_LAUNDRY_DEFAULT_BRANDING
      : BAGUS_LAUNDRY_DEFAULT_BRANDING;
  if (typeof window === 'undefined') return defaultBranding;
  const raw = window.localStorage.getItem(`laundry_branding_${activeSlug}`);
  if (!raw) return defaultBranding;
  try {
    return JSON.parse(raw) as TenantBranding;
  } catch {
    return defaultBranding;
  }
}

export function setStoredTenantBranding(branding: TenantBranding): void {
  if (typeof window === 'undefined') return;
  setActiveTenantSlug(branding.slug);
  window.localStorage.setItem(
    `laundry_branding_${branding.slug}`,
    JSON.stringify(branding),
  );
  applyTenantThemeToDom(branding);
}

export function applyTenantThemeToDom(branding: TenantBranding): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--brand-dark', branding.darkColor || '#163300');
  root.style.setProperty('--brand-primary', branding.primaryColor || '#9fe870');
  root.style.setProperty(
    '--brand-primary-hover',
    branding.primaryHoverColor || '#8ee05c',
  );
  root.style.setProperty('--brand-surface', branding.surfaceColor || '#e2f6d5');
  root.style.setProperty(
    '--brand-secondary',
    branding.secondaryColor || '#054d28',
  );
  document.title = `${branding.brandName} — ${branding.tagline || 'Layanan Laundry Profesional'}`;
}

export function setAuthSession(
  user: AuthUser,
  tenant?: TenantBranding,
): void {
  // Token JWT disimpan di HttpOnly cookie oleh backend, tidak pernah di localStorage.
  window.localStorage.removeItem('laundry_token');
  window.sessionStorage.removeItem('laundry_token');
  window.localStorage.setItem('laundry_user', JSON.stringify(user));
  if (tenant) {
    setStoredTenantBranding(tenant);
  }
}

export function clearAuthSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('laundry_token');
  window.localStorage.removeItem('laundry_user');
  window.sessionStorage.removeItem('laundry_token');
  window.sessionStorage.removeItem('laundry_user');
}

export async function logoutAuthSession(): Promise<void> {
  clearAuthSession();
  if (typeof window === 'undefined') return;
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {});
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw =
    window.localStorage.getItem('laundry_user') ||
    window.sessionStorage.getItem('laundry_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setSuperAdminSession(admin: {
  id: string;
  name: string;
  email: string;
}): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem('laundry_super_admin_user', JSON.stringify(admin));
  window.sessionStorage.removeItem('laundry_super_admin_token');
  window.localStorage.removeItem('laundry_super_admin_token');
  window.localStorage.removeItem('laundry_super_admin_user');
}

export function clearSuperAdminSession(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem('laundry_super_admin_token');
  window.sessionStorage.removeItem('laundry_super_admin_user');
  window.localStorage.removeItem('laundry_super_admin_token');
  window.localStorage.removeItem('laundry_super_admin_user');
}

export async function logoutSuperAdminSession(): Promise<void> {
  clearSuperAdminSession();
  if (typeof window === 'undefined') return;
  await fetch(`${API_BASE}/super-admin/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {});
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const tenantSlug = getActiveTenantSlug();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Tenant-Slug': tenantSlug,
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      clearAuthSession();
    }
    let message = `Gagal memproses permintaan (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) message = body.message.join(', ');
      else if (body.message) message = body.message;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export async function superAdminFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/super-admin/login')) {
      clearSuperAdminSession();
    }
    let message = `Gagal memproses permintaan (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) message = body.message.join(', ');
      else if (body.message) message = body.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

