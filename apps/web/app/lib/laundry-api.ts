export const LAUNDRY_API_BASE =
  process.env.NEXT_PUBLIC_API_URL || '/api-backend';

export type UserRole =
  | 'SUPER_OWNER'
  | 'BRANCH_OWNER'
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
export type OrderPaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
export type ExpenseApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

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
  WASH_WET: 'Cuci Basah (Mamel)',
  IRON_ONLY: 'Setrika Saja',
  WASH_IRON_ITEM: 'Cuci Satuan + Setrika',
};

export interface TenantThemeConfig {
  primaryColor: string;
  primaryHoverColor: string;
  darkColor: string;
  secondaryColor: string;
  surfaceColor: string;
}

export interface EntitlementInfo {
  tenantId: string;
  tenantSlug: string;
  productCode: string;
  allowed: boolean;
  status: string;
  isDemo: boolean;
  reason: string | null;
  limits: { maxBranches: number; maxStaff?: number };
  features: string[];
  subscriptionEndAt: string | null;
}

export interface TenantBrandingInfo {
  tenantId: string;
  slug: string;
  brandName: string;
  tagline: string;
  logoUrl: string | null;
  theme: TenantThemeConfig;
  whatsappPhone: string | null;
  isDemo: boolean;
  entitlement: EntitlementInfo;
}

export interface BranchItem {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  ironingRate: number;
  openTime: string;
  closeTime: string;
  defaultMinWeightKg: number | null;
  payLaterFee: number;
  latitude: number | null;
  longitude: number | null;
  attendanceRadiusMeters: number;
  isMain: boolean;
  isActive: boolean;
}

export interface LaundryUserProfile {
  id: string;
  platformUserId: string;
  tenantId: string;
  branchId: string | null;
  branch?: BranchItem | null;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  avatarUrl?: string | null;
  faceDescriptor?: string | null;
  isActive?: boolean;
}

export interface LaundryServiceItem {
  id: string;
  branchId: string | null;
  name: string;
  description: string | null;
  workflow: WorkflowCode;
  priceUnit: PriceUnit;
  price: number;
  minWeightKg: number | null;
  estimatedDurationHours: number | null;
  discountType: 'NONE' | 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  discountActive: boolean;
  isThirdParty: boolean;
  thirdPartyPartner: string | null;
  isActive: boolean;
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
  orderId: string;
  serviceName: string;
  workflow: WorkflowCode;
  priceUnit: PriceUnit;
  unitPrice: number;
  weightKg: number | null;
  garmentCount: number | null;
  quantity: number;
  itemTotal: number;
  discountAmount: number;
  status: ItemStatus;
  notes: string | null;
  rackNumber: string | null;
  ironingWage: number | null;
  ironingStaffId: string | null;
  ironingStaff?: { id: string; name: string } | null;
  ironingCompletedAt: string | null;
  ironingPaidAt: string | null;
  order?: OrderDetail;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  branchId: string;
  branch?: BranchItem;
  customer?: CustomerItem;
  receivedAt: string;
  estimatedCompletionAt: string | null;
  subtotal: number;
  discount: number;
  isPayLater: boolean;
  payLaterFee: number;
  total: number;
  paidAmount: number;
  paymentStatus: OrderPaymentStatus;
  notes: string | null;
  pickedUpAt: string | null;
  items: OrderItemDetail[];
}

export interface IroningPayoutItem {
  id: string;
  branchId: string;
  branch?: BranchItem;
  employee?: { id: string; name: string };
  periodMonth: number;
  periodYear: number;
  amount: number;
  totalItems: number;
  status: ExpenseApprovalStatus;
  employeeNotes: string | null;
  transferProof: string | null;
  paymentNotes: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

export interface ExpenseCategoryItem {
  id: string;
  name: string;
  description: string | null;
}

export interface ExpenseItem {
  id: string;
  branchId: string;
  branch?: BranchItem;
  category?: ExpenseCategoryItem;
  recordedBy?: { id: string; name: string };
  description: string;
  amount: number;
  expenseDate: string;
  paymentMethod: PaymentMethod;
  approvalStatus: ExpenseApprovalStatus;
  notes: string | null;
}

export interface CashSettlementItem {
  id: string;
  branchId: string;
  branch?: BranchItem;
  cashier?: { id: string; name: string };
  settlementDate: string;
  totalCashIn: number;
  totalQrisIn: number;
  totalApprovedExpense: number;
  expectedCash: number;
  actualCash: number;
  difference: number;
  status: ExpenseApprovalStatus;
  cashierNotes: string | null;
}

export interface LeaveRequestItem {
  id: string;
  branchId: string;
  branch?: BranchItem;
  staff?: { id: string; name: string; role: UserRole };
  leaveType: 'CUTI' | 'IZIN' | 'SAKIT';
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: ExpenseApprovalStatus;
  reviewNotes: string | null;
}

export interface ReportSummary {
  range: { from: string; to: string };
  branchId: string | null;
  financials: {
    orderCount: number;
    totalRevenueBilled: number;
    totalPaymentsCollected: number;
    totalOutstanding: number;
    totalExpenses: number;
    netCashflow: number;
    paymentByMethod: Record<string, number>;
    expenseByCategory: Record<string, number>;
  };
  branchComparison?: Array<{
    branchId: string;
    branchName: string;
    branchCode: string;
    orderCount: number;
    totalRevenue: number;
    totalPayments: number;
  }>;
}

export interface PublicTrackedOrder {
  orderNumber: string;
  branchId: string | null;
  branchName: string | null;
  customerDisplayName: string;
  receivedAt: string;
  estimatedCompletionAt: string | null;
  isPickedUp: boolean;
  items: Array<{
    serviceName: string;
    status: string;
    statusLabel: string;
    steps: Array<{ code: string; label: string; done: boolean; active: boolean }>;
  }>;
}

const TENANT_STORAGE_KEY = 'mnilab_laundry_active_tenant_slug';

export function getBranchSlug(branch: Pick<BranchItem, 'code' | 'name'>): string {
  return (branch.code || branch.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getActiveTenantSlug(): string {
  if (typeof window === 'undefined') return 'demo-laundry';
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('tenant')?.trim().toLowerCase();
  if (fromQuery) {
    window.sessionStorage.setItem(TENANT_STORAGE_KEY, fromQuery);
    return fromQuery;
  }

  const host = window.location.hostname.toLowerCase();
  const reserved = new Set(['www', 'mnilab', 'api', 'admin', 'portal', 'laundry', 'app']);
  for (const suffix of ['.mnilab.my.id', '.mnilab.id', '.localhost']) {
    if (host.endsWith(suffix)) {
      const sub = host.slice(0, -suffix.length);
      if (sub && !sub.includes('.') && !reserved.has(sub)) {
        return sub === 'demo' ? 'demo-laundry' : sub;
      }
    }
  }

  return window.sessionStorage.getItem(TENANT_STORAGE_KEY) || 'demo-laundry';
}

export function setActiveTenantSlug(slug: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(TENANT_STORAGE_KEY, slug.trim().toLowerCase());
}

export function applyTenantThemeToDom(theme?: TenantThemeConfig | null): void {
  if (typeof document === 'undefined' || !theme) return;
  const root = document.documentElement;
  root.style.setProperty('--brand-primary', theme.primaryColor || '#9fe870');
  root.style.setProperty(
    '--brand-primary-hover',
    theme.primaryHoverColor || '#8ee05c',
  );
  root.style.setProperty('--brand-dark', theme.darkColor || '#163300');
  root.style.setProperty('--brand-secondary', theme.secondaryColor || '#054d28');
  root.style.setProperty('--brand-surface', theme.surfaceColor || '#e2f6d5');
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
}

export async function laundryFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('X-Tenant-Slug')) {
    headers.set('X-Tenant-Slug', getActiveTenantSlug());
  }
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${LAUNDRY_API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    const msg =
      typeof parsed === 'object' &&
      parsed !== null &&
      'message' in parsed &&
      (Array.isArray((parsed as { message: unknown }).message)
        ? (parsed as { message: string[] }).message.join(', ')
        : String((parsed as { message: unknown }).message));
    throw new Error(msg || `Permintaan gagal (${res.status})`);
  }

  return parsed as T;
}
