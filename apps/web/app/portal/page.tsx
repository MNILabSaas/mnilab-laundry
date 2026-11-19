'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LandingFeatureIcon from '../components/LandingFeatureIcon';
import {
  apiFetch,
  applyTenantThemeToDom,
  AVAILABLE_LANDING_ICONS,
  BAGUS_LAUNDRY_DEFAULT_BRANDING,
  buildBranchTrackingHref,
  clearAuthSession,
  DEFAULT_LANDING_FEATURES,
  DEFAULT_LANDING_HERO_DESC,
  DEFAULT_LANDING_SLOGAN,
  logoutAuthSession,
  formatRupiah,
  formatTenantSubdomainHost,
  getActiveTenantSlug,
  getBranchPhoneList,
  getBranchSlug,
  getStoredTenantBranding,
  getStoredUser,
  isTenantBrandingBlocked,
  PLATFORM_WEB_URL,
  setActiveTenantSlug,
  setAuthSession,
  setStoredTenantBranding,
  type AuthUser,
  type Branch,
  type CashSettlementItem,
  type ExpenseApprovalStatus,
  type ExpenseItem,
  type FeatureHighlightItem,
  type IroningEarningsResponse,
  type IroningHistoryItem,
  type IroningPayoutItem,
  type ItemStatus,
  type LaundryServiceItem,
  type LeaveRequestItem,
  type OrderDetail,
  type OrderItemDetail,
  type PaymentMethod,
  type PriceUnit,
  type TenantBranding,
  type TenantLandingConfig,
  type UserRole,
  type WorkflowCode,
  EXPENSE_APPROVAL_LABELS,
  STATUS_LABELS,
  WORKFLOW_LABELS,
} from '../lib/api';
import { processImageFileToAvatar } from '../lib/face-utils';
import {
  ForgotPasswordModal,
  PasswordInput,
  PayLaterSettlementModal,
  UserProfileModal,
} from './PortalModals';
import {
  AttendanceTerminalSection,
  OwnerAttendanceReportSection,
} from './AttendanceSection';
import {
  OwnerLeaveApprovalSection,
  StaffLeaveSection,
} from './LeaveSection';
import {
  exportIroningRecapToExcel,
  OwnerIroningPayoutSection,
  ProofTransferModal,
  RequestPayoutModal,
  StaffIroningPayoutHistorySection,
} from './IroningPayoutSection';
import { OwnerQrisWithdrawalSection } from './QrisWithdrawalSection';
import {
  DemoSandboxBar,
  getStoredDemoSandboxBranding,
} from '../components/DemoSandboxBar';
import TenantSubscriptionLockedScreen from '../components/TenantSubscriptionLockedScreen';
import { MniLabLuxuryLoader } from '../components/MniLabBrand';
import type { PlatformPublicInfoResponse } from '../lib/api';

type PortalTab =
  | 'SUPER_BRANCHES'
  | 'BRANCH_PROFILE'
  | 'CASHIER_ORDER'
  | 'ORDERS_LIST'
  | 'CASHIER_HISTORY'
  | 'CASHIER_RACK'
  | 'CASHIER_EXPENSES'
  | 'OWNER_SETTLEMENTS'
  | 'IRONING_QUEUE'
  | 'IRONING_EARNINGS'
  | 'IRONING_HISTORY'
  | 'WASHING_QUEUE'
  | 'OWNER_SERVICES'
  | 'OWNER_EXPENSES'
  | 'OWNER_REPORTS'
  | 'OWNER_USERS'
  | 'ATTENDANCE_TERMINAL'
  | 'OWNER_ATTENDANCE'
  | 'STAFF_LEAVES'
  | 'OWNER_LEAVES'
  | 'OWNER_IRONING_PAYOUTS'
  | 'OWNER_QRIS_WITHDRAWALS';

interface ReceiptResponse {
  store: { name: string; address: string; phone: string };
  availableSenderPhones?: Array<{ phone: string; label: string }>;
  order: OrderDetail;
  whatsappText: string;
  whatsappUrl: string;
}

interface ExpenseCategoryItem {
  id: string;
  name: string;
  description: string | null;
}

interface ReportSummary {
  range: { from: string; to: string };
  branchId: string | null;
  financials: {
    orderCount: number;
    totalRevenueBilled: number;
    totalPaymentsCollected: number;
    totalOutstanding: number;
    totalExpenses: number;
    netCashflow: number;
    averageTransactionValue?: number;
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
    totalExpenses: number;
    netCashflow: number;
  }>;
  operations: {
    activeItemsByStatus: Record<string, number>;
    serviceBreakdown: Array<{
      serviceName: string;
      itemCount: number;
      revenue: number;
    }>;
  };
}

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

function defaultTabForRole(role: UserRole): PortalTab {
  if (role === 'CASHIER') return 'CASHIER_ORDER';
  if (role === 'IRONING') return 'IRONING_QUEUE';
  if (role === 'WASHING') return 'WASHING_QUEUE';
  return 'OWNER_REPORTS';
}

export default function PortalPage() {
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PortalTab>('ORDERS_LIST');

  // Owner notification badge counts
  const [pendingExpensesCount, setPendingExpensesCount] = useState<number>(0);
  const [pendingSettlementsCount, setPendingSettlementsCount] = useState<number>(0);
  const [pendingLeavesCount, setPendingLeavesCount] = useState<number>(0);
  const [pendingIroningPayoutsCount, setPendingIroningPayoutsCount] = useState<number>(0);

  // Ironing Payout modals
  const [requestPayoutModalOpen, setRequestPayoutModalOpen] = useState(false);
  const [ironingProofModalPayout, setIroningProofModalPayout] = useState<IroningPayoutItem | null>(null);

  // Modal states (Forgot Password, User Profile, Pay Later Settlement)
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [settleOrderModal, setSettleOrderModal] = useState<OrderDetail | null>(null);

  // Client mount state & current date string (prevents Next.js prerender error on dynamic new Date())
  const [isClientReady, setIsClientReady] = useState(false);
  const [todayStr, setTodayStr] = useState<string>('');

  // Data states
  const [services, setServices] = useState<LaundryServiceItem[]>([]);
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderDateFilter, setOrderDateFilter] = useState<string>('');
  const [ironingQueue, setIroningQueue] = useState<OrderItemDetail[]>([]);
  const [washingQueue, setWashingQueue] = useState<OrderItemDetail[]>([]);
  const [rackInputs, setRackInputs] = useState<Record<string, string>>({});
  const [receiptModal, setReceiptModal] = useState<ReceiptResponse | null>(null);
  const [receiptPaperWidth, setReceiptPaperWidth] = useState<'58mm' | '80mm'>('58mm');

  // Multi-branch states
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');

  // Cashier new order form state
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [selectedSenderWhatsapp, setSelectedSenderWhatsapp] = useState('');
  const [isPayLater, setIsPayLater] = useState(false);
  const [payMethodInput, setPayMethodInput] = useState<PaymentMethod>('CASH');
  const [cashGivenInput, setCashGivenInput] = useState('');
  const [draftItems, setDraftItems] = useState<
    Array<{
      serviceId: string;
      weightKg: string;
      garmentCount: string;
      quantity: string;
      notes: string;
    }>
  >([{ serviceId: '', weightKg: '2', garmentCount: '', quantity: '1', notes: '' }]);

  // Cashier Confirmation Popup State
  const [orderConfirmModal, setOrderConfirmModal] = useState<{
    totalBill: number;
    isPayLater: boolean;
    payLaterFee: number;
    method: PaymentMethod;
    bayarAmt: number;
    kembalian: number;
    notes: string;
    itemsPayload: any[];
    customer: { name: string; phone: string; address?: string };
  } | null>(null);
  const [isFinalizingOrder, setIsFinalizingOrder] = useState(false);

  // Cashier Rack state
  const [cashierRackItems, setCashierRackItems] = useState<OrderItemDetail[]>([]);

  // Cashier & Owner Expense submission state
  const [categories, setCategories] = useState<ExpenseCategoryItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [expenseFilterStatus, setExpenseFilterStatus] = useState<string>('ALL');
  const [expCategoryId, setExpCategoryId] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState<string>('');
  const [expMethod, setExpMethod] = useState<PaymentMethod>('CASH');
  const [expNotes, setExpNotes] = useState('');
  const [rejectionModalId, setRejectionModalId] = useState<string | null>(null);
  const [rejectionNoteInput, setRejectionNoteInput] = useState('');

  // Cashier Daily Handover to Owner Modal state
  const [cashHandoverModal, setCashHandoverModal] = useState<{
    dateKey: string;
    formattedDate: string;
    totalCashIn: number;
    totalQrisIn: number;
    totalApprovedExpense: number;
    expectedCash: number;
    enteredPhysicalCash: string;
    targetWhatsapp: string;
    notes: string;
  } | null>(null);

  // History Pemesanan Date Filter (Tanggal, Bulan, Tahun)
  const [historyYear, setHistoryYear] = useState<number>(0);
  const [historyMonth, setHistoryMonth] = useState<number>(0);
  const [historyDay, setHistoryDay] = useState<number>(0);

  // Cash Settlement States (Setoran Kas Kasir ke Owner)
  const [currentSettlement, setCurrentSettlement] = useState<CashSettlementItem | null>(null);
  const [settlementsList, setSettlementsList] = useState<CashSettlementItem[]>([]);
  const [settlementFilterStatus, setSettlementFilterStatus] = useState<string>('ALL');
  const [settlementRejectModalId, setSettlementRejectModalId] = useState<string | null>(null);
  const [settlementRejectNote, setSettlementRejectNote] = useState('');
  const [isSubmittingSettlement, setIsSubmittingSettlement] = useState(false);

  // Ironing employee states
  const [earningsMonth, setEarningsMonth] = useState<number>(0);
  const [earningsYear, setEarningsYear] = useState<number>(0);
  const [ironingEarnings, setIroningEarnings] = useState<IroningEarningsResponse | null>(null);
  const [ironingHistory, setIroningHistory] = useState<IroningHistoryItem[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyFromDate, setHistoryFromDate] = useState('');
  const [historyToDate, setHistoryToDate] = useState('');

  // Owner Financial Reports state
  const [reportMonth, setReportMonth] = useState<number>(0);
  const [reportYear, setReportYear] = useState<number>(0);
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [staffList, setStaffList] = useState<AuthUser[]>([]);

  // Super Owner new branch form
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchCode, setNewBranchCode] = useState('');
  const [newBranchAddress, setNewBranchAddress] = useState('');
  const [newBranchPhone, setNewBranchPhone] = useState('');
  const [newBranchWhatsapp, setNewBranchWhatsapp] = useState('');
  const [newBranchWhatsappList, setNewBranchWhatsappList] = useState<string[]>(['']);
  const [newBranchIroningRate, setNewBranchIroningRate] = useState('1100');
  const [newBranchOpenTime, setNewBranchOpenTime] = useState('07:00');
  const [newBranchCloseTime, setNewBranchCloseTime] = useState('21:00');
  const [newBranchDefaultMinWeight, setNewBranchDefaultMinWeight] = useState('');
  const [newBranchPayLaterFee, setNewBranchPayLaterFee] = useState('1000');
  const [newBranchLatitude, setNewBranchLatitude] = useState('');
  const [newBranchLongitude, setNewBranchLongitude] = useState('');
  const [newBranchRadius, setNewBranchRadius] = useState('10');
  const [newBranchIsMain, setNewBranchIsMain] = useState(false);

  // Kustomisasi Landing Page Khusus Cabang Baru
  const [newBranchLandingOpen, setNewBranchLandingOpen] = useState(false);
  const [newBranchHeroSlogan, setNewBranchHeroSlogan] = useState('');
  const [newBranchHeroDesc, setNewBranchHeroDesc] = useState('');
  const [newBranchFeatures, setNewBranchFeatures] = useState<FeatureHighlightItem[]>(DEFAULT_LANDING_FEATURES);

  // Branch Profile Edit (Owner / Super Owner)
  const [editBranchId, setEditBranchId] = useState<string | null>(null);
  const [editBranchName, setEditBranchName] = useState('');
  const [editBranchAddress, setEditBranchAddress] = useState('');
  const [editBranchPhone, setEditBranchPhone] = useState('');
  const [editBranchWhatsapp, setEditBranchWhatsapp] = useState('');
  const [editBranchWhatsappList, setEditBranchWhatsappList] = useState<string[]>(['']);
  const [editBranchIroningRate, setEditBranchIroningRate] = useState('1100');
  const [editBranchOpenTime, setEditBranchOpenTime] = useState('07:00');
  const [editBranchCloseTime, setEditBranchCloseTime] = useState('21:00');
  const [editBranchDefaultMinWeight, setEditBranchDefaultMinWeight] = useState('');
  const [editBranchPayLaterFee, setEditBranchPayLaterFee] = useState('1000');
  const [editBranchLatitude, setEditBranchLatitude] = useState('');
  const [editBranchLongitude, setEditBranchLongitude] = useState('');
  const [editBranchRadius, setEditBranchRadius] = useState('10');

  // Kustomisasi Landing Page Khusus Edit Cabang
  const [editBranchLandingOpen, setEditBranchLandingOpen] = useState(false);
  const [editBranchHeroSlogan, setEditBranchHeroSlogan] = useState('');
  const [editBranchHeroDesc, setEditBranchHeroDesc] = useState('');
  const [editBranchFeatures, setEditBranchFeatures] = useState<FeatureHighlightItem[]>(DEFAULT_LANDING_FEATURES);

  // Kustomisasi Landing Page Perusahaan (Super Owner)
  const [companyLandingModalOpen, setCompanyLandingModalOpen] = useState(false);
  const [companyHeroSlogan, setCompanyHeroSlogan] = useState(DEFAULT_LANDING_SLOGAN);
  const [companyHeroDesc, setCompanyHeroDesc] = useState(DEFAULT_LANDING_HERO_DESC);
  const [companyFeatures, setCompanyFeatures] = useState<FeatureHighlightItem[]>(DEFAULT_LANDING_FEATURES);
  const [savingCompanyLanding, setSavingCompanyLanding] = useState(false);

  // Service Edit / Create Modal
  const [svcModalOpen, setSvcModalOpen] = useState(false);
  const [editingSvcId, setEditingSvcId] = useState<string | null>(null);
  const [svcFormName, setSvcFormName] = useState('');
  const [svcFormDesc, setSvcFormDesc] = useState('');
  const [svcFormWorkflow, setSvcFormWorkflow] = useState<WorkflowCode>('WASH_IRON');
  const [svcFormUnit, setSvcFormUnit] = useState<PriceUnit>('KG');
  const [svcFormPrice, setSvcFormPrice] = useState('');
  const [svcFormMinWeight, setSvcFormMinWeight] = useState('');
  const [svcFormDuration, setSvcFormDuration] = useState('48');
  const [svcFormBranchId, setSvcFormBranchId] = useState('');
  const [svcFormIsThirdParty, setSvcFormIsThirdParty] = useState(false);
  const [svcFormThirdPartyPartner, setSvcFormThirdPartyPartner] = useState('');
  const [svcFormDiscountType, setSvcFormDiscountType] = useState<'NONE' | 'PERCENTAGE' | 'FIXED'>('NONE');
  const [svcFormDiscountValue, setSvcFormDiscountValue] = useState('0');
  const [svcFormDiscountActive, setSvcFormDiscountActive] = useState(false);

  // Staff creation & edit (Minus 5: Form kosong semua saat inisialisasi)
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffRole, setStaffRole] = useState<UserRole | ''>('');
  const [staffBranchId, setStaffBranchId] = useState<string>('');
  const [staffPass, setStaffPass] = useState('');
  const [staffAvatarUrl, setStaffAvatarUrl] = useState('');
  const [staffFaceDescriptor, setStaffFaceDescriptor] = useState<string | null>(null);
  const [staffPhotoUploading, setStaffPhotoUploading] = useState(false);
  const [baseTenantBranding, setBaseTenantBranding] = useState<TenantBranding>(
    BAGUS_LAUNDRY_DEFAULT_BRANDING,
  );
  const [tenantBranding, setTenantBranding] = useState<TenantBranding>(
    BAGUS_LAUNDRY_DEFAULT_BRANDING,
  );
  const [allTenants, setAllTenants] = useState<TenantBranding[]>([]);
  const [platformWhatsapp, setPlatformWhatsapp] = useState('6281234567890');

  // Defer reading current time & stored session to client-side mount (Next.js prerender compliance & hydration fix)
  useEffect(() => {
    const storedBrand = getStoredTenantBranding();
    setBaseTenantBranding(storedBrand);
    setTenantBranding(storedBrand);
    applyTenantThemeToDom(storedBrand);

    const activeSlug = getActiveTenantSlug();
    apiFetch<TenantBranding>(`/tenants/public/${encodeURIComponent(activeSlug)}`)
      .then((b) => {
        if (b) {
          setBaseTenantBranding(b);
          setStoredTenantBranding(b);
          if (b.isDemo || b.slug === 'demo-laundry') {
            const sandbox = getStoredDemoSandboxBranding(b);
            if (sandbox) {
              setTenantBranding(sandbox);
              applyTenantThemeToDom(sandbox);
              return;
            }
          }
          setTenantBranding(b);
        }
      })
      .catch(() => {});

    apiFetch<PlatformPublicInfoResponse>('/tenants/platform-public')
      .then((info) => {
        if (info?.settings?.whatsappNumber) {
          setPlatformWhatsapp(
            info.settings.whatsappNumber.replace(/[^0-9]/g, '') || '6281234567890',
          );
        }
      })
      .catch(() => {});

    apiFetch<TenantBranding[]>('/tenants/public')
      .then((list) => {
        if (list && list.length > 0) setAllTenants(list);
      })
      .catch(() => {});

    const saved = getStoredUser();
    if (saved) {
      setUser(saved);
      setSelectedBranchId(saved.role === 'SUPER_OWNER' ? '' : (saved.branchId || ''));
      setActiveTab(defaultTabForRole(saved.role));
    }
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const ymd = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    setTodayStr(ymd);
    setOrderDateFilter(ymd);
    setExpDate(ymd);
    setHistoryYear(y);
    setHistoryMonth(m);
    setHistoryDay(d);
    setEarningsMonth(m);
    setEarningsYear(y);
    setReportMonth(m);
    setReportYear(y);
    setIsClientReady(true);
  }, []);

  // Load Main Data
  const loadData = useCallback(async () => {
    if (!user || !isClientReady) return;
    try {
      const activeBranches = await apiFetch<Branch[]>('/branches/active').catch(() => []);
      setBranches(activeBranches);

      const branchParam = selectedBranchId ? `&branchId=${selectedBranchId}` : '';
      const branchQ = selectedBranchId ? `?branchId=${selectedBranchId}` : '';

      const svcs = await apiFetch<LaundryServiceItem[]>(`/services${branchQ}`);
      setServices(svcs);
      if (svcs.length > 0) {
        setDraftItems((prev) =>
          prev.map((d) => (d.serviceId ? d : { ...d, serviceId: svcs[0].id })),
        );
      }

      if (activeTab === 'ORDERS_LIST') {
        const searchTrim = orderSearch.trim();
        let queryUrl = `/orders?limit=100${branchParam}`;
        if (searchTrim) {
          queryUrl += `&q=${encodeURIComponent(searchTrim)}`;
        } else if (orderDateFilter) {
          queryUrl += `&from=${orderDateFilter}&to=${orderDateFilter}`;
        }
        const res = await apiFetch<{ data: OrderDetail[] }>(queryUrl);
        setOrders(res.data);
      }

      // Check pending counts for owner notifications
      if (user.role === 'SUPER_OWNER' || user.role === 'BRANCH_OWNER' || user.role === 'OWNER') {
        const [expPendingRes, stlPendingRes, leavesPendingRes, payoutsPendingRes] = await Promise.all([
          apiFetch<{ total?: number; data?: ExpenseItem[] }>(
            `/expenses?limit=100&approvalStatus=PENDING${branchParam}`,
          ).catch(() => ({ total: 0, data: [] })),
          apiFetch<{ total?: number; data?: CashSettlementItem[] }>(
            `/cash-settlements?limit=100&status=PENDING${branchParam}`,
          ).catch(() => ({ total: 0, data: [] })),
          apiFetch<{ total?: number; data?: LeaveRequestItem[] }>(
            `/leaves?limit=100&status=PENDING${branchParam}`,
          ).catch(() => ({ total: 0, data: [] })),
          apiFetch<{ total?: number; data?: unknown[] }>(
            `/workflow/ironing-payouts?limit=100&status=PENDING${branchParam}`,
          ).catch(() => ({ total: 0, data: [] })),
        ]);
        setPendingExpensesCount(
          expPendingRes.total !== undefined ? expPendingRes.total : (expPendingRes.data?.length || 0),
        );
        setPendingSettlementsCount(
          stlPendingRes.total !== undefined ? stlPendingRes.total : (stlPendingRes.data?.length || 0),
        );
        setPendingLeavesCount(
          leavesPendingRes.total !== undefined ? leavesPendingRes.total : (leavesPendingRes.data?.length || 0),
        );
        setPendingIroningPayoutsCount(
          payoutsPendingRes.total !== undefined ? payoutsPendingRes.total : (payoutsPendingRes.data?.length || 0),
        );
      }

      if (activeTab === 'CASHIER_HISTORY') {
        const histDate = `${historyYear}-${String(historyMonth).padStart(2, '0')}-${String(historyDay).padStart(2, '0')}`;
        const [ordRes, expRes, stlRes] = await Promise.all([
          apiFetch<{ data: OrderDetail[] }>(
            `/orders?from=${histDate}&to=${histDate}&limit=1000${branchParam}`,
          ),
          apiFetch<{ data: ExpenseItem[] }>(
            `/expenses?from=${histDate}&to=${histDate}&limit=1000${branchParam}`,
          ),
          apiFetch<CashSettlementItem | null>(
            `/cash-settlements/by-date?date=${histDate}${branchParam}`,
          ).catch(() => null),
        ]);
        setOrders(ordRes.data);
        setExpenses(expRes.data);
        setCurrentSettlement(stlRes);
      }

      if (activeTab === 'OWNER_SETTLEMENTS') {
        const stls = await apiFetch<{ data: CashSettlementItem[] }>(
          `/cash-settlements?limit=100${branchParam}${settlementFilterStatus !== 'ALL' ? `&status=${settlementFilterStatus}` : ''}`,
        );
        setSettlementsList(stls.data);
      }

      if (activeTab === 'CASHIER_RACK') {
        const q = await apiFetch<OrderItemDetail[]>(`/workflow/washing-queue${branchQ}`);
        setCashierRackItems(q);
      }

      if (activeTab === 'IRONING_QUEUE') {
        const q = await apiFetch<OrderItemDetail[]>(`/workflow/ironing-queue${branchQ}`);
        setIroningQueue(q);
      }

      if (activeTab === 'IRONING_EARNINGS') {
        const earn = await apiFetch<IroningEarningsResponse>(
          `/workflow/ironing-earnings?month=${earningsMonth}&year=${earningsYear}`,
        );
        setIroningEarnings(earn);
      }

      if (activeTab === 'IRONING_HISTORY') {
        const histQ = `?q=${encodeURIComponent(historySearch)}${historyFromDate ? `&from=${historyFromDate}` : ''}${historyToDate ? `&to=${historyToDate}` : ''}`;
        const hist = await apiFetch<{ data: IroningHistoryItem[] }>(`/workflow/ironing-history${histQ}`);
        setIroningHistory(hist.data);
      }

      if (activeTab === 'WASHING_QUEUE') {
        const q = await apiFetch<OrderItemDetail[]>(`/workflow/washing-queue${branchQ}`);
        setWashingQueue(q);
      }

      if (activeTab === 'CASHIER_EXPENSES' || activeTab === 'OWNER_EXPENSES') {
        const [cats, exps] = await Promise.all([
          apiFetch<ExpenseCategoryItem[]>('/expenses/categories'),
          apiFetch<{ data: ExpenseItem[] }>(
            `/expenses?limit=100${branchParam}${expenseFilterStatus !== 'ALL' ? `&approvalStatus=${expenseFilterStatus}` : ''}`,
          ),
        ]);
        setCategories(cats);
        setExpenses(exps.data);
        if (cats.length > 0 && !expCategoryId) setExpCategoryId(cats[0].id);
      }

      if (activeTab === 'OWNER_REPORTS') {
        const padMonth = String(reportMonth).padStart(2, '0');
        const lastDay = new Date(reportYear, reportMonth, 0).getDate();
        const fromDate = `${reportYear}-${padMonth}-01`;
        const toDate = `${reportYear}-${padMonth}-${String(lastDay).padStart(2, '0')}`;
        const rep = await apiFetch<ReportSummary>(
          `/reports/summary?from=${fromDate}&to=${toDate}${branchParam}`,
        );
        setReport(rep);
      }

      if (activeTab === 'OWNER_USERS') {
        const us = await apiFetch<{ data: AuthUser[] }>(`/users${branchQ}`);
        setStaffList(us.data);
      }

      if (activeTab === 'BRANCH_PROFILE' && user.branchId) {
        const br = await apiFetch<Branch>(`/branches/${user.branchId}`);
        populateEditBranchForm(br);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat data');
    }
  }, [
    user,
    isClientReady,
    activeTab,
    orderSearch,
    orderDateFilter,
    expCategoryId,
    selectedBranchId,
    expenseFilterStatus,
    earningsMonth,
    earningsYear,
    historySearch,
    historyFromDate,
    historyToDate,
    reportMonth,
    reportYear,
    settlementFilterStatus,
    historyYear,
    historyMonth,
    historyDay,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  function populateEditBranchForm(br: Branch) {
    setEditBranchId(br.id);
    setEditBranchName(br.name);
    setEditBranchAddress(br.address || '');
    setEditBranchPhone(br.phone || '');
    const waList = getBranchPhoneList(br);
    setEditBranchWhatsapp(waList[0] || br.whatsappNumber || br.phone || '');
    setEditBranchWhatsappList(waList.length > 0 ? waList : ['']);
    setEditBranchIroningRate(String(br.ironingRate || 1100));
    setEditBranchOpenTime(br.openTime || '07:00');
    setEditBranchCloseTime(br.closeTime || '21:00');
    setEditBranchDefaultMinWeight(
      br.defaultMinWeightKg !== undefined && br.defaultMinWeightKg !== null && Number(br.defaultMinWeightKg) > 0
        ? String(br.defaultMinWeightKg)
        : '',
    );
    setEditBranchPayLaterFee(String(br.payLaterFee ?? 1000));
    setEditBranchLatitude(br.latitude !== undefined && br.latitude !== null ? String(br.latitude) : '');
    setEditBranchLongitude(br.longitude !== undefined && br.longitude !== null ? String(br.longitude) : '');
    setEditBranchRadius(String(br.attendanceRadiusMeters ?? 10));

    const blc = br.landingConfigJson;
    setEditBranchHeroSlogan(blc?.heroSlogan || '');
    setEditBranchHeroDesc(blc?.heroDescription || '');
    setEditBranchFeatures(
      blc?.features && blc.features.length === 3 ? blc.features : DEFAULT_LANDING_FEATURES,
    );
    setEditBranchLandingOpen(Boolean(blc?.heroSlogan || blc?.heroDescription || blc?.features));
  }

  // Auth Handlers
  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{
        accessToken: string;
        user: AuthUser;
        tenant?: TenantBranding;
      }>(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ identifier, password }),
        },
      );
      setAuthSession(res.user, res.tenant);
      if (res.tenant) {
        setTenantBranding(res.tenant);
      }
      setUser(res.user);
      setSelectedBranchId(res.user.role === 'SUPER_OWNER' ? '' : (res.user.branchId || ''));
      setActiveTab(defaultTabForRole(res.user.role));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal masuk');
      setIdentifier('');
      setPassword('');
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    void logoutAuthSession();
    setUser(null);
    setSuccessMsg(null);
    setErrorMsg(null);
  }

  // Current branch object for cashier / branch calculations
  const currentActiveBranch = useMemo(() => {
    const targetBranchId = user?.branchId || selectedBranchId;
    return branches.find((b) => b.id === targetBranchId) || user?.branch || branches[0] || null;
  }, [branches, user, selectedBranchId]);

  // Daftar pilihan Nomor Telp / WhatsApp Pengirim Struk untuk Kasir (Cabang + Perusahaan)
  const cashierSenderPhoneOptions = useMemo(() => {
    const opts: Array<{ phone: string; label: string }> = [];
    const seen = new Set<string>();
    const addOpt = (rawPhone: string | null | undefined, label: string) => {
      if (!rawPhone) return;
      for (const part of rawPhone.split(/[,;\n]+/)) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const digits = trimmed.replace(/[^0-9]/g, '') || trimmed;
        if (!seen.has(digits)) {
          seen.add(digits);
          opts.push({ phone: trimmed, label });
        }
      }
    };
    const branchNums = getBranchPhoneList(currentActiveBranch);
    branchNums.forEach((num, idx) => {
      addOpt(
        num,
        branchNums.length > 1
          ? `WA Cabang #${idx + 1} (${currentActiveBranch?.name || 'Cabang'})`
          : `WA Cabang (${currentActiveBranch?.name || 'Cabang'})`,
      );
    });
    addOpt(
      tenantBranding.whatsappPhone,
      `WA Utama Perusahaan (${tenantBranding.brandName})`,
    );
    return opts;
  }, [currentActiveBranch, tenantBranding.whatsappPhone, tenantBranding.brandName]);

  useEffect(() => {
    if (cashierSenderPhoneOptions.length > 0) {
      const exists = cashierSenderPhoneOptions.some(
        (o) => o.phone === selectedSenderWhatsapp,
      );
      if (!selectedSenderWhatsapp || !exists) {
        setSelectedSenderWhatsapp(cashierSenderPhoneOptions[0].phone);
      }
    }
  }, [cashierSenderPhoneOptions, selectedSenderWhatsapp]);

  const currentPayLaterFee = useMemo(() => {
    return currentActiveBranch?.payLaterFee !== undefined && currentActiveBranch?.payLaterFee !== null
      ? Number(currentActiveBranch.payLaterFee)
      : 1000;
  }, [currentActiveBranch]);

  // Calculate live item row totals for cashier (Minus 2: Min kg opsional per layanan / cabang)
  function calculateDraftRow(item: { serviceId: string; weightKg: string; quantity: string }) {
    const svc = services.find((s) => s.id === item.serviceId);
    if (!svc) return { billedQty: 0, rawTotal: 0, discountAmt: 0, finalTotal: 0, isMinApplied: false, minKgFloor: 0 };
    const isKg = svc.priceUnit === 'KG';
    let billedQty = isKg ? Math.max(0.1, Number(item.weightKg || 0)) : Math.max(1, Number(item.quantity || 1));
    let isMinApplied = false;
    let minKgFloor = 0;
    if (isKg) {
      const svcMin = svc.minWeightKg !== null && svc.minWeightKg !== undefined ? Number(svc.minWeightKg) : 0;
      const branchMin =
        currentActiveBranch?.defaultMinWeightKg !== null && currentActiveBranch?.defaultMinWeightKg !== undefined
          ? Number(currentActiveBranch.defaultMinWeightKg)
          : 0;
      minKgFloor = svcMin > 0 ? svcMin : branchMin > 0 ? branchMin : 0;
      if (minKgFloor > 0 && billedQty < minKgFloor) {
        billedQty = minKgFloor;
        isMinApplied = true;
      }
    }
    const rawTotal = Math.round(billedQty * svc.price);
    let discountAmt = 0;
    if (svc.discountActive && svc.discountType && svc.discountType !== 'NONE') {
      if (svc.discountType === 'PERCENTAGE') {
        discountAmt = Math.round((rawTotal * (svc.discountValue || 0)) / 100);
      } else if (svc.discountType === 'FIXED') {
        discountAmt = Math.min(rawTotal, svc.discountValue || 0);
      }
    }
    const finalTotal = Math.max(0, rawTotal - discountAmt);
    return { billedQty, rawTotal, discountAmt, finalTotal, isMinApplied, minKgFloor };
  }

  const liveTotals = useMemo(() => {
    const base = draftItems.reduce(
      (acc, it) => {
        const row = calculateDraftRow(it);
        return {
          rawSubtotal: acc.rawSubtotal + row.rawTotal,
          discountTotal: acc.discountTotal + row.discountAmt,
          itemsFinal: acc.itemsFinal + row.finalTotal,
        };
      },
      { rawSubtotal: 0, discountTotal: 0, itemsFinal: 0 },
    );
    const fee = isPayLater ? currentPayLaterFee : 0;
    return {
      rawSubtotal: base.rawSubtotal,
      discountTotal: base.discountTotal,
      payLaterFee: fee,
      finalTotal: base.itemsFinal + fee,
    };
  }, [draftItems, services, isPayLater, currentPayLaterFee, currentActiveBranch]);

  // Helper to extract YYYY-MM-DD in local time
  function toLocalDateStr(dateInput: string | Date | undefined | null): string {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Grouped orders for ORDERS_LIST by date (newest date first)
  const groupedOrdersByDate = useMemo(() => {
    const groups: Record<string, OrderDetail[]> = {};
    for (const o of orders) {
      const dateKey = toLocalDateStr(o.receivedAt);
      if (dateKey) {
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(o);
      }
    }
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map((dateKey) => {
        const dateOrders = groups[dateKey];
        const dayTotal = dateOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const dayPaid = dateOrders.reduce((sum, o) => sum + (o.paidAmount || 0), 0);
        const formattedDate = new Date(dateKey + 'T00:00:00').toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        return {
          dateKey,
          formattedDate,
          orders: dateOrders,
          dayTotal,
          dayPaid,
        };
      });
  }, [orders]);

  const historySelectedDate = useMemo(() => {
    if (!historyYear || !historyMonth || !historyDay) return '';
    const padM = String(historyMonth).padStart(2, '0');
    const padD = String(historyDay).padStart(2, '0');
    return `${historyYear}-${padM}-${padD}`;
  }, [historyYear, historyMonth, historyDay]);

  function setHistoryToToday() {
    const now = new Date();
    setHistoryYear(now.getFullYear());
    setHistoryMonth(now.getMonth() + 1);
    setHistoryDay(now.getDate());
  }

  function setHistoryToYesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setHistoryYear(d.getFullYear());
    setHistoryMonth(d.getMonth() + 1);
    setHistoryDay(d.getDate());
  }

  function setHistoryFromDateStr(dateStr: string) {
    if (!dateStr) return;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      const d = Number(parts[2]);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        setHistoryYear(y);
        setHistoryMonth(m);
        setHistoryDay(d);
      }
    }
  }

  // Single Day Ledger for CASHIER_HISTORY (cash in vs approved expenses for the selected date)
  const singleDayHistory = useMemo(() => {
    let totalCashIn = 0;
    let totalQrisIn = 0;

    const orderRows = orders.map((o) => {
      let cashAmt = 0;
      let qrisAmt = 0;
      let primaryMethod: PaymentMethod = 'CASH';

      if (o.payments && o.payments.length > 0) {
        for (const p of o.payments) {
          if (p.status === 'SUCCESS') {
            if (p.method === 'CASH') cashAmt += p.amount;
            else if (p.method === 'QRIS') qrisAmt += p.amount;
            primaryMethod = p.method;
          }
        }
      } else {
        // Fallback only if paidAmount > 0
        cashAmt = o.paidAmount > 0 ? o.paidAmount : 0;
      }

      totalCashIn += cashAmt;
      totalQrisIn += qrisAmt;

      return {
        order: o,
        cashAmt,
        qrisAmt,
        method: primaryMethod,
      };
    });

    // Approved expenses on this date
    const dateExpenses = expenses.filter(
      (ex) => ex.expenseDate === historySelectedDate && ex.approvalStatus === 'APPROVED',
    );
    const totalApprovedExpense = dateExpenses.reduce((sum, ex) => sum + (ex.amount || 0), 0);

    const expectedCashInDrawer = totalCashIn - totalApprovedExpense;

    const formattedDate = historySelectedDate
      ? new Date(historySelectedDate + 'T00:00:00').toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '-';

    return {
      dateKey: historySelectedDate,
      formattedDate,
      orders: orderRows,
      expenses: dateExpenses,
      totalCashIn,
      totalQrisIn,
      totalRevenue: totalCashIn + totalQrisIn,
      totalApprovedExpense,
      expectedCashInDrawer,
    };
  }, [orders, expenses, historySelectedDate]);

  // Step 1: Cashier opens Order Confirmation Popup
  function handleOpenOrderConfirmation(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    // Validate phone number 11 to 13 digits (format 08...)
    const cleanDigits = custPhone.replace(/\D/g, '');
    let localDigits = cleanDigits;
    if (cleanDigits.startsWith('62')) localDigits = `0${cleanDigits.slice(2)}`;
    else if (cleanDigits.startsWith('8')) localDigits = `0${cleanDigits}`;

    if (!/^08\d{9,11}$/.test(localDigits)) {
      setErrorMsg('Nomor WhatsApp customer tidak valid. Harus antara 11 hingga 13 digit (contoh: 08123456789).');
      return;
    }

    const totalBill = liveTotals.finalTotal;
    let bayarAmt = isPayLater ? 0 : totalBill;
    let kembalian = 0;

    if (!isPayLater && payMethodInput === 'CASH') {
      const cashGiven = Number(cashGivenInput || 0);
      if (cashGiven < totalBill) {
        setErrorMsg(`Uang pembayaran kurang! Total tagihan ${formatRupiah(totalBill)}, uang diterima ${formatRupiah(cashGiven)}.`);
        return;
      }
      bayarAmt = cashGiven;
      kembalian = cashGiven - totalBill;
    }

    const itemsPayload = draftItems.map((it) => {
      const svc = services.find((s) => s.id === it.serviceId);
      const isKg = svc?.priceUnit === 'KG';
      return {
        serviceId: it.serviceId,
        weightKg: isKg ? Number(it.weightKg) : undefined,
        garmentCount: it.garmentCount ? Number(it.garmentCount) : undefined,
        quantity: !isKg ? Number(it.quantity) : undefined,
        notes: it.notes || undefined,
      };
    });

    setOrderConfirmModal({
      totalBill,
      isPayLater,
      payLaterFee: liveTotals.payLaterFee,
      method: payMethodInput,
      bayarAmt,
      kembalian,
      notes: orderNotes,
      itemsPayload,
      customer: {
        name: custName,
        phone: custPhone,
        address: custAddress || undefined,
      },
    });
  }

  // Step 2: Finalize transaction once (with button Cetak Struk or Tutup)
  async function finalizeOrder(triggerPrint: boolean) {
    if (!orderConfirmModal || isFinalizingOrder) return;
    setIsFinalizingOrder(true);
    setErrorMsg(null);
    try {
      const created = await apiFetch<OrderDetail>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          customer: orderConfirmModal.customer,
          items: orderConfirmModal.itemsPayload,
          discount: liveTotals.discountTotal,
          isPayLater: orderConfirmModal.isPayLater,
          notes: orderConfirmModal.notes || undefined,
          initialPayment: orderConfirmModal.isPayLater
            ? undefined
            : {
                amount: orderConfirmModal.totalBill,
                method: orderConfirmModal.method,
              },
        }),
      });

      // Reset form
      setCustName('');
      setCustPhone('');
      setCustAddress('');
      setOrderNotes('');
      setIsPayLater(false);
      setCashGivenInput('');
      setDraftItems([{ serviceId: services[0]?.id || '', weightKg: '2', garmentCount: '', quantity: '1', notes: '' }]);
      setOrderConfirmModal(null);

      // Trigger WhatsApp & receipt
      const senderParam = selectedSenderWhatsapp
        ? `?senderPhone=${encodeURIComponent(selectedSenderWhatsapp)}`
        : '';
      const rec = await apiFetch<ReceiptResponse>(
        `/orders/${created.id}/receipt${senderParam}`,
      );
      setReceiptModal(rec);

      // Automatically trigger WhatsApp receipt
      if (rec.whatsappUrl) {
        window.open(rec.whatsappUrl, '_blank');
      }

      setSuccessMsg(`Transaksi ${created.orderNumber} berhasil difinalisasi & struk WhatsApp dipicu!`);
      await loadData();

      if (triggerPrint) {
        setTimeout(() => {
          window.print();
        }, 500);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memfinalisasi transaksi');
    } finally {
      setIsFinalizingOrder(false);
    }
  }

  async function openReceipt(orderId: string, customSenderPhone?: string) {
    try {
      const phoneToUse = customSenderPhone ?? selectedSenderWhatsapp;
      const senderParam = phoneToUse
        ? `?senderPhone=${encodeURIComponent(phoneToUse)}`
        : '';
      const rec = await apiFetch<ReceiptResponse>(
        `/orders/${orderId}/receipt${senderParam}`,
      );
      setReceiptModal(rec);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuka struk');
    }
  }

  async function handlePickupOrder(orderId: string) {
    setErrorMsg(null);
    try {
      await apiFetch(`/orders/${orderId}/pickup`, { method: 'POST' });
      setSuccessMsg('Pakaian telah diserahkan ke pelanggan.');
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal serah terima');
    }
  }

  async function handleTransitionStatus(itemId: string, toStatus: ItemStatus) {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiFetch(`/workflow/items/${itemId}/status`, {
        method: 'POST',
        body: JSON.stringify({ toStatus }),
      });
      setSuccessMsg(`Status berhasil diperbarui.`);
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengubah status');
    }
  }

  async function handleAssignRackAndComplete(itemId: string) {
    const rack = (rackInputs[itemId] || '').trim();
    if (!rack) {
      setErrorMsg('Nomor rak wajib diisi.');
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiFetch(`/workflow/items/${itemId}/rack`, {
        method: 'PATCH',
        body: JSON.stringify({ rackNumber: rack, markCompleted: true }),
      });
      setSuccessMsg(`Item berhasil disimpan di Rak ${rack.toUpperCase()}`);
      setRackInputs((prev) => ({ ...prev, [itemId]: '' }));
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan nomor rak');
    }
  }

  // Expense Handlers
  async function handleCreateExpense(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await apiFetch('/expenses', {
        method: 'POST',
        body: JSON.stringify({
          categoryId: expCategoryId,
          description: expDesc,
          amount: Number(expAmount),
          expenseDate: expDate || undefined,
          paymentMethod: expMethod,
          notes: expNotes || undefined,
        }),
      });
      setExpDesc('');
      setExpAmount('');
      setExpDate(new Date().toISOString().slice(0, 10));
      setExpNotes('');
      setSuccessMsg('Pengeluaran berhasil diajukan (Status: Menunggu Persetujuan).');
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengajukan pengeluaran');
    }
  }

  async function handleDecideExpense(id: string, status: ExpenseApprovalStatus, rejectionNote?: string) {
    setErrorMsg(null);
    try {
      await apiFetch(`/expenses/${id}/decide`, {
        method: 'PATCH',
        body: JSON.stringify({ status, rejectionNote }),
      });
      setSuccessMsg(`Pengeluaran berhasil ${status === 'APPROVED' ? 'disetujui' : 'ditolak'}.`);
      setRejectionModalId(null);
      setRejectionNoteInput('');
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses persetujuan pengeluaran');
    }
  }

  async function handleDecideSettlement(id: string, status: ExpenseApprovalStatus, reviewNotes?: string) {
    setErrorMsg(null);
    try {
      await apiFetch(`/cash-settlements/${id}/decide`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reviewNotes }),
      });
      setSuccessMsg(`Setoran kas berhasil ${status === 'APPROVED' ? 'disetujui (ACC)' : 'ditolak'}.`);
      setSettlementRejectModalId(null);
      setSettlementRejectNote('');
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses setoran kas');
    }
  }

  async function handleSubmitSettlement(actualCash: number, cashierNotes?: string) {
    setErrorMsg(null);
    setIsSubmittingSettlement(true);
    try {
      await apiFetch('/cash-settlements', {
        method: 'POST',
        body: JSON.stringify({
          settlementDate: singleDayHistory.dateKey,
          actualCash,
          cashierNotes: cashierNotes || undefined,
        }),
      });
      setSuccessMsg('Setoran kas harian berhasil diajukan ke Owner (Status: Menunggu Persetujuan).');
      setCashHandoverModal(null);
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengajukan setoran kas');
    } finally {
      setIsSubmittingSettlement(false);
    }
  }

  // Service Management Handlers (Minus 2: Min Kg Opsional + Cuci Sepatu / Dry Clean Pihak Ke-3)
  function openCreateServiceModal() {
    setEditingSvcId(null);
    setSvcFormName('');
    setSvcFormDesc('');
    setSvcFormWorkflow('WASH_IRON');
    setSvcFormUnit('KG');
    setSvcFormPrice('');
    setSvcFormMinWeight('');
    setSvcFormDuration('48');
    setSvcFormBranchId(selectedBranchId || user?.branchId || '');
    setSvcFormIsThirdParty(false);
    setSvcFormThirdPartyPartner('');
    setSvcFormDiscountType('NONE');
    setSvcFormDiscountValue('0');
    setSvcFormDiscountActive(false);
    setSvcModalOpen(true);
  }

  function applyThirdPartyPreset(preset: 'SHOE' | 'DRYCLEAN') {
    if (preset === 'SHOE') {
      setSvcFormName('Cuci Sepatu Deep Clean (Pihak Ke-3)');
      setSvcFormDesc('Pencucian sepatu deep clean bekerja sama dengan mitra profesional');
      setSvcFormWorkflow('WASH_DRY');
      setSvcFormUnit('ITEM');
      setSvcFormPrice('35000');
      setSvcFormMinWeight('');
      setSvcFormDuration('72');
      setSvcFormIsThirdParty(true);
      setSvcFormThirdPartyPartner('Mitra Shoe Care');
    } else {
      setSvcFormName('Dry Clean Jas / Kebaya (Pihak Ke-3)');
      setSvcFormDesc('Dry clean khusus pakaian formal/kebaya dengan mitra pihak ke-3');
      setSvcFormWorkflow('WASH_IRON');
      setSvcFormUnit('ITEM');
      setSvcFormPrice('45000');
      setSvcFormMinWeight('');
      setSvcFormDuration('72');
      setSvcFormIsThirdParty(true);
      setSvcFormThirdPartyPartner('Mitra Dry Clean');
    }
  }

  function openEditServiceModal(s: LaundryServiceItem) {
    setEditingSvcId(s.id);
    setSvcFormName(s.name);
    setSvcFormDesc(s.description || '');
    setSvcFormWorkflow(s.workflow);
    setSvcFormUnit(s.priceUnit);
    setSvcFormPrice(String(s.price));
    setSvcFormMinWeight(
      s.minWeightKg !== null && s.minWeightKg !== undefined && Number(s.minWeightKg) > 0
        ? String(s.minWeightKg)
        : '',
    );
    setSvcFormDuration(String(s.estimatedDurationHours || 48));
    setSvcFormBranchId(s.branchId || '');
    setSvcFormIsThirdParty(Boolean(s.isThirdParty));
    setSvcFormThirdPartyPartner(s.thirdPartyPartner || '');
    setSvcFormDiscountType(s.discountType || 'NONE');
    setSvcFormDiscountValue(String(s.discountValue || 0));
    setSvcFormDiscountActive(Boolean(s.discountActive));
    setSvcModalOpen(true);
  }

  async function handleSaveService(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const minKgVal =
        svcFormUnit === 'KG' && svcFormMinWeight.trim() !== '' && Number(svcFormMinWeight) > 0
          ? Number(svcFormMinWeight)
          : null;

      const payload = {
        name: svcFormName,
        description: svcFormDesc || undefined,
        workflow: svcFormWorkflow,
        priceUnit: svcFormUnit,
        price: Number(svcFormPrice),
        minWeightKg: minKgVal,
        estimatedDurationHours: Number(svcFormDuration || 24),
        branchId: isSuperOwner ? svcFormBranchId || null : undefined,
        isThirdParty: svcFormIsThirdParty,
        thirdPartyPartner: svcFormIsThirdParty ? svcFormThirdPartyPartner.trim() || null : null,
        discountType: svcFormDiscountType,
        discountValue: Number(svcFormDiscountValue || 0),
        discountActive: svcFormDiscountActive,
      };

      if (editingSvcId) {
        await apiFetch(`/services/${editingSvcId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setSuccessMsg(`Layanan ${svcFormName} berhasil diperbarui.`);
      } else {
        await apiFetch('/services', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setSuccessMsg(`Layanan baru ${svcFormName} berhasil ditambahkan.`);
      }

      setSvcModalOpen(false);
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan layanan');
    }
  }

  async function handleDeleteService(s: LaundryServiceItem) {
    if (!window.confirm(`Yakin ingin menonaktifkan layanan "${s.name}"? Layanan ini tidak akan muncul pada pilihan kasir baru, namun histori nota lama tetap aman.`)) {
      return;
    }
    setErrorMsg(null);
    try {
      await apiFetch(`/services/${s.id}`, { method: 'DELETE' });
      setSuccessMsg(`Layanan ${s.name} telah dinonaktifkan.`);
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menonaktifkan layanan');
    }
  }

  // Branch Profile Handlers (Minus 1, Minus 2, Tambahan 1, Tambahan 3)
  async function handleSaveBranchProfile(e: FormEvent) {
    e.preventDefault();
    if (!editBranchId) return;
    setErrorMsg(null);
    try {
      const branchLandingConfig: TenantLandingConfig | null =
        editBranchHeroSlogan.trim() || editBranchHeroDesc.trim() || editBranchLandingOpen
          ? {
              heroSlogan: editBranchHeroSlogan.trim() || undefined,
              heroDescription: editBranchHeroDesc.trim() || undefined,
              features: editBranchFeatures,
            }
          : null;

      const cleanEditWaList = editBranchWhatsappList
        .map((n) => n.trim())
        .filter(Boolean);
      const primaryEditWa =
        cleanEditWaList[0] || editBranchWhatsapp.trim() || editBranchPhone.trim() || '';

      await apiFetch(`/branches/${editBranchId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editBranchName,
          address: editBranchAddress,
          phone: editBranchPhone || primaryEditWa,
          whatsappNumber: primaryEditWa,
          whatsappNumbers: cleanEditWaList,
          ironingRate: Number(editBranchIroningRate),
          openTime: editBranchOpenTime || '07:00',
          closeTime: editBranchCloseTime || '21:00',
          defaultMinWeightKg:
            editBranchDefaultMinWeight.trim() !== '' && Number(editBranchDefaultMinWeight) > 0
              ? Number(editBranchDefaultMinWeight)
              : null,
          payLaterFee: Number(editBranchPayLaterFee || 0),
          latitude: editBranchLatitude.trim() !== '' ? Number(editBranchLatitude) : null,
          longitude: editBranchLongitude.trim() !== '' ? Number(editBranchLongitude) : null,
          attendanceRadiusMeters: Number(editBranchRadius || 10),
          landingConfigJson: branchLandingConfig,
        }),
      });
      setSuccessMsg('Profil cabang, jam operasional, minimal kg, charge bayar nanti, dan kustomisasi landing page cabang berhasil diperbarui.');
      if (isSuperOwner) setEditBranchId(null);
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui cabang');
    }
  }

  // Super Owner Branch Creation Handler
  async function handleCreateBranch(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const branchLandingConfig: TenantLandingConfig | null =
        newBranchHeroSlogan.trim() || newBranchHeroDesc.trim() || newBranchLandingOpen
          ? {
              heroSlogan: newBranchHeroSlogan.trim() || undefined,
              heroDescription: newBranchHeroDesc.trim() || undefined,
              features: newBranchFeatures,
            }
          : null;

      const cleanNewWaList = newBranchWhatsappList
        .map((n) => n.trim())
        .filter(Boolean);
      const primaryNewWa =
        cleanNewWaList[0] || newBranchWhatsapp.trim() || newBranchPhone.trim() || '';

      await apiFetch('/branches', {
        method: 'POST',
        body: JSON.stringify({
          name: newBranchName,
          code: newBranchCode,
          address: newBranchAddress || undefined,
          phone: newBranchPhone || primaryNewWa || undefined,
          whatsappNumber: primaryNewWa || undefined,
          whatsappNumbers: cleanNewWaList,
          ironingRate: Number(newBranchIroningRate || 1100),
          openTime: newBranchOpenTime || '07:00',
          closeTime: newBranchCloseTime || '21:00',
          defaultMinWeightKg:
            newBranchDefaultMinWeight.trim() !== '' && Number(newBranchDefaultMinWeight) > 0
              ? Number(newBranchDefaultMinWeight)
              : null,
          payLaterFee: Number(newBranchPayLaterFee || 1000),
          latitude: newBranchLatitude.trim() !== '' ? Number(newBranchLatitude) : null,
          longitude: newBranchLongitude.trim() !== '' ? Number(newBranchLongitude) : null,
          attendanceRadiusMeters: Number(newBranchRadius || 10),
          isMain: newBranchIsMain,
          landingConfigJson: branchLandingConfig,
        }),
      });
      setNewBranchName('');
      setNewBranchCode('');
      setNewBranchAddress('');
      setNewBranchPhone('');
      setNewBranchWhatsapp('');
      setNewBranchWhatsappList(['']);
      setNewBranchIroningRate('1100');
      setNewBranchOpenTime('07:00');
      setNewBranchCloseTime('21:00');
      setNewBranchDefaultMinWeight('');
      setNewBranchPayLaterFee('1000');
      setNewBranchLatitude('');
      setNewBranchLongitude('');
      setNewBranchRadius('10');
      setNewBranchIsMain(false);
      setNewBranchHeroSlogan('');
      setNewBranchHeroDesc('');
      setNewBranchFeatures(DEFAULT_LANDING_FEATURES);
      setNewBranchLandingOpen(false);
      setSuccessMsg('Cabang baru berhasil dibuat.');
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat cabang');
    }
  }

  function openCompanyLandingModal() {
    const lc = tenantBranding.landingConfig || tenantBranding.theme?.landingConfig;
    setCompanyHeroSlogan(lc?.heroSlogan || DEFAULT_LANDING_SLOGAN);
    setCompanyHeroDesc(lc?.heroDescription || DEFAULT_LANDING_HERO_DESC);
    setCompanyFeatures(
      lc?.features && lc.features.length === 3 ? lc.features : DEFAULT_LANDING_FEATURES,
    );
    setCompanyLandingModalOpen(true);
  }

  async function handleSaveCompanyLanding(e: FormEvent) {
    e.preventDefault();
    setSavingCompanyLanding(true);
    setErrorMsg(null);
    try {
      const updatedTheme = {
        ...(tenantBranding.theme || {}),
        landingConfig: {
          heroSlogan: companyHeroSlogan.trim() || DEFAULT_LANDING_SLOGAN,
          heroDescription: companyHeroDesc.trim() || DEFAULT_LANDING_HERO_DESC,
          features: companyFeatures,
        },
      };

      const updatedBranding = await apiFetch<TenantBranding>('/tenant-branding', {
        method: 'PATCH',
        body: JSON.stringify({
          themeConfigJson: updatedTheme,
        }),
      });

      if (updatedBranding) {
        setTenantBranding(updatedBranding);
        setStoredTenantBranding(updatedBranding);
      }
      setSuccessMsg('Kustomisasi tampilan landing page perusahaan berhasil disimpan!');
      setCompanyLandingModalOpen(false);
      await loadData();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan kustomisasi landing page perusahaan',
      );
    } finally {
      setSavingCompanyLanding(false);
    }
  }

  function fillGpsToBranchForm(mode: 'NEW' | 'EDIT') {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setErrorMsg('Browser tidak mendukung geolokasi GPS.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        if (mode === 'NEW') {
          setNewBranchLatitude(lat);
          setNewBranchLongitude(lng);
        } else {
          setEditBranchLatitude(lat);
          setEditBranchLongitude(lng);
        }
        setSuccessMsg(`Titik koordinat GPS berhasil diambil (${lat}, ${lng}).`);
      },
      () => {
        setErrorMsg('Gagal mengambil lokasi GPS. Pastikan izin lokasi diaktifkan pada browser.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // Staff Photo Upload & Staff Creation Handler (Minus 5 & Tambahan 3)
  async function handleStaffPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStaffPhotoUploading(true);
    setErrorMsg(null);
    try {
      const { dataUrl, faceDescriptor } = await processImageFileToAvatar(file);
      if (!faceDescriptor) {
        setStaffAvatarUrl('');
        setStaffFaceDescriptor(null);
        setErrorMsg(
          'Wajah tidak terdeteksi pada foto tersebut. Gunakan foto wajah asli yang jelas, terang, dan menghadap ke depan.',
        );
        return;
      }
      setStaffAvatarUrl(dataUrl);
      setStaffFaceDescriptor(faceDescriptor);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses foto wajah pegawai');
    } finally {
      setStaffPhotoUploading(false);
    }
  }

  async function handleUpdateExistingStaffPhoto(staffId: string, staffMemberName: string, file: File) {
    setErrorMsg(null);
    try {
      const { dataUrl, faceDescriptor } = await processImageFileToAvatar(file);
      if (!faceDescriptor) {
        setErrorMsg(
          `Wajah tidak terdeteksi pada foto yang dipilih untuk ${staffMemberName}. Gunakan foto wajah asli yang jelas dan menghadap ke depan.`,
        );
        return;
      }
      await apiFetch(`/users/${staffId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          avatarUrl: dataUrl,
          faceDescriptor,
        }),
      });
      setSuccessMsg(`Foto wajah & biometrik ${staffMemberName} berhasil diperbarui untuk Face Recognition.`);
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memperbarui foto pegawai');
    }
  }

  async function handleCreateStaff(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!staffRole) {
      setErrorMsg('Pilih Role Pegawai terlebih dahulu.');
      return;
    }
    if ((staffRole === 'CASHIER' || staffRole === 'WASHING') && (!staffAvatarUrl || !staffFaceDescriptor)) {
      setErrorMsg('Pegawai Kasir dan Bagian Cuci wajib memiliki Foto Wajah yang valid agar dapat terdeteksi otomatis oleh sistem absen Face Recognition.');
      return;
    }
    try {
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: staffName,
          email: staffEmail || undefined,
          phone: staffPhone || undefined,
          role: staffRole,
          branchId: staffBranchId || undefined,
          password: staffPass,
          avatarUrl: staffAvatarUrl || undefined,
          faceDescriptor: staffFaceDescriptor || undefined,
        }),
      });
      // Reset semua field kosong kembali (Minus 5)
      setStaffName('');
      setStaffEmail('');
      setStaffPhone('');
      setStaffRole('');
      setStaffBranchId('');
      setStaffPass('');
      setStaffAvatarUrl('');
      setStaffFaceDescriptor(null);
      setSuccessMsg('Akun pegawai baru berhasil ditambahkan beserta data Face Recognition.');
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambah pegawai');
    }
  }

  async function handleSendIroningPayout(employeeNotes: string) {
    try {
      await apiFetch('/workflow/ironing-payouts/request', {
        method: 'POST',
        body: JSON.stringify({
          month: earningsMonth,
          year: earningsYear,
          employeeNotes,
        }),
      });
      setSuccessMsg('Pengajuan upah setrika berhasil dikirim ke Owner. Harap menunggu proses transfer dan bukti pembayaran.');
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mengirim pengajuan pencairan upah');
    }
  }

  // ================== ROLE & NAVIGATION MATRIX ==================
  const isSuperOwner = user?.role === 'SUPER_OWNER';
  const isBranchOwner = user?.role === 'BRANCH_OWNER' || user?.role === 'OWNER';
  const isOwner = isSuperOwner || isBranchOwner;

  // Navigation tabs strictly per role specification
  const navTabs = useMemo(() => {
    if (!user) return [];
    if (user.role === 'SUPER_OWNER') {
      return [
        { id: 'OWNER_REPORTS' as PortalTab, label: 'Laporan Keuangan' },
        { id: 'OWNER_QRIS_WITHDRAWALS' as PortalTab, label: 'Pencairan QRIS Cabang' },
        { id: 'OWNER_EXPENSES' as PortalTab, label: 'Persetujuan Pengeluaran', badge: pendingExpensesCount },
        { id: 'OWNER_IRONING_PAYOUTS' as PortalTab, label: 'Upah Setrika', badge: pendingIroningPayoutsCount },
        { id: 'ORDERS_LIST' as PortalTab, label: 'Monitoring Pesanan' },
        { id: 'OWNER_SERVICES' as PortalTab, label: 'Master Layanan & Diskon' },
        { id: 'CASHIER_HISTORY' as PortalTab, label: 'History Pemesanan' },
        { id: 'OWNER_SETTLEMENTS' as PortalTab, label: 'Setoran Kas Kasir', badge: pendingSettlementsCount },
        { id: 'OWNER_ATTENDANCE' as PortalTab, label: 'Data Absensi Pegawai' },
        { id: 'OWNER_LEAVES' as PortalTab, label: 'ACC Cuti Pegawai', badge: pendingLeavesCount },
        { id: 'SUPER_BRANCHES' as PortalTab, label: 'Seluruh Cabang' },
        { id: 'OWNER_USERS' as PortalTab, label: 'Pegawai Semua Cabang' },
      ];
    }
    if (user.role === 'BRANCH_OWNER' || user.role === 'OWNER') {
      return [
        { id: 'OWNER_REPORTS' as PortalTab, label: 'Laporan Keuangan' },
        { id: 'OWNER_QRIS_WITHDRAWALS' as PortalTab, label: 'Pencairan QRIS Cabang' },
        { id: 'OWNER_EXPENSES' as PortalTab, label: 'Persetujuan Pengeluaran', badge: pendingExpensesCount },
        { id: 'OWNER_IRONING_PAYOUTS' as PortalTab, label: 'Upah Setrika', badge: pendingIroningPayoutsCount },
        { id: 'ORDERS_LIST' as PortalTab, label: 'Monitoring Pesanan' },
        { id: 'OWNER_SERVICES' as PortalTab, label: 'Master Layanan & Diskon' },
        { id: 'CASHIER_HISTORY' as PortalTab, label: 'History Pemesanan' },
        { id: 'OWNER_SETTLEMENTS' as PortalTab, label: 'Setoran Kas Kasir', badge: pendingSettlementsCount },
        { id: 'OWNER_ATTENDANCE' as PortalTab, label: 'Data Absensi Pegawai' },
        { id: 'OWNER_LEAVES' as PortalTab, label: 'ACC Cuti Pegawai', badge: pendingLeavesCount },
        { id: 'BRANCH_PROFILE' as PortalTab, label: 'Profil Cabang' },
        { id: 'OWNER_USERS' as PortalTab, label: 'Pegawai Cabang' },
      ];
    }
    if (user.role === 'CASHIER') {
      return [
        { id: 'CASHIER_ORDER' as PortalTab, label: 'Buat Pesanan' },
        { id: 'CASHIER_HISTORY' as PortalTab, label: 'History Pemesanan' },
        { id: 'ORDERS_LIST' as PortalTab, label: 'Daftar Pesanan' },
        { id: 'CASHIER_RACK' as PortalTab, label: 'Input Rak' },
        { id: 'CASHIER_EXPENSES' as PortalTab, label: 'Ajukan Pengeluaran' },
        { id: 'ATTENDANCE_TERMINAL' as PortalTab, label: 'Absen Masuk/Pulang (Wajah)' },
        { id: 'STAFF_LEAVES' as PortalTab, label: 'Pengajuan Cuti / Libur' },
      ];
    }
    if (user.role === 'IRONING') {
      return [
        { id: 'IRONING_QUEUE' as PortalTab, label: 'Antrean Setrika' },
        { id: 'IRONING_EARNINGS' as PortalTab, label: 'Penghasilan Bulan Ini' },
        { id: 'IRONING_HISTORY' as PortalTab, label: 'History Setrika' },
        { id: 'STAFF_LEAVES' as PortalTab, label: 'Pengajuan Cuti / Libur' },
      ];
    }
    if (user.role === 'WASHING') {
      return [
        { id: 'WASHING_QUEUE' as PortalTab, label: 'Bagian Cuci & Rak' },
        { id: 'ATTENDANCE_TERMINAL' as PortalTab, label: 'Absen Masuk/Pulang (Wajah)' },
        { id: 'STAFF_LEAVES' as PortalTab, label: 'Pengajuan Cuti / Libur' },
      ];
    }
    return [];
  }, [user, pendingExpensesCount, pendingSettlementsCount, pendingLeavesCount, pendingIroningPayoutsCount]);

  const isDemoTenant = Boolean(
    tenantBranding.isDemo || tenantBranding.slug === 'demo-laundry',
  );
  const defaultLogo = isDemoTenant
    ? '/Assets/logoDemoLaundry.webp'
    : '/Assets/logoLaundry.webp';
  const maxAllowedBranches = Number(tenantBranding.maxBranches || 3);

  // 1. Initial hydration guard (avoids SSR hydration mismatch)
  if (!isClientReady) {
    return (
      <MniLabLuxuryLoader
        label="LOADING"
        subtitle={`Memuat Portal ${tenantBranding.brandName}...`}
      />
    );
  }

  if (isTenantBrandingBlocked(tenantBranding)) {
    return (
      <TenantSubscriptionLockedScreen
        branding={tenantBranding}
        supportWhatsapp={platformWhatsapp}
      />
    );
  }

  // ================== VIEW: LOGIN FORM ==================
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-[#ffffff] text-[#454745]">
        {isDemoTenant && (
          <DemoSandboxBar
            baseBranding={baseTenantBranding}
            activeBranding={tenantBranding}
            onPreviewChange={setTenantBranding}
            currentArea="portal"
          />
        )}
        <header className="bg-[#ffffff] border-b border-[#e8ebe6] px-4 sm:px-6 h-16 flex items-center justify-between max-w-[1200px] w-full mx-auto">
          {isDemoTenant ? (
            <Link
              href="/"
              className="inline-flex items-center gap-2 font-medium text-[14px] text-[#163300] hover:underline underline-offset-4"
            >
              <span>←</span>
              <span>Kembali ke MNILab Platform</span>
            </Link>
          ) : (
            <Link
              href={`/?tenant=${encodeURIComponent(tenantBranding.slug)}`}
              className="inline-flex items-center gap-2 font-medium text-[14px] text-[#163300] hover:underline underline-offset-4"
            >
              <span>←</span>
              <span>Beranda {tenantBranding.brandName}</span>
            </Link>
          )}
          <div className="flex items-center gap-2">
            {isDemoTenant ? (
              <span className="text-[12px] text-[#8f7552] font-semibold bg-[#fceac2]/60 border border-[#cbaf80]/40 px-3.5 py-1 rounded-full">
                Demo Read-Only
              </span>
            ) : (
              <span className="text-[12px] text-[#054d28] font-semibold bg-[#e2f6d5] border border-[#9fe870]/60 px-3.5 py-1 rounded-full">
                Portal Manajemen Internal
              </span>
            )}
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="bg-[#e8ebe6] rounded-[28px] max-w-md w-full p-6 sm:p-10">

            <div className="flex items-center gap-3.5 mb-5">
              <img
                src={tenantBranding.logoUrl || defaultLogo}
                alt={`Logo ${tenantBranding.brandName}`}
                className="w-12 h-12 rounded-full object-cover shadow-[0_0_0_1px_rgba(14,15,12,0.12)]"
              />
              <div>
                <span className="inline-block bg-[#e2f6d5] text-[#163300] text-[12px] font-medium px-3 py-0.5 rounded-full mb-1">
                  Portal Manajemen
                </span>
                <h1 className="text-[28px] font-black text-[#0e0f0c] leading-[1.0] tracking-[-0.03em] uppercase">
                  {tenantBranding.brandName}
                </h1>
              </div>
            </div>

            <p className="text-[15px] text-[#454745] mb-6 leading-[1.5]">
              Masuk dengan akun karyawan, kasir, atau owner untuk mengelola operasional cabang.
            </p>

            {errorMsg && (
              <div className="mb-4 bg-[#cb272f] text-[#ffffff] text-[14px] font-medium rounded-[10px] p-3.5">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[14px] font-medium text-[#0e0f0c] mb-1.5">
                  Email atau Nomor HP
                </label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    if (password) setPassword('');
                  }}
                  placeholder="kasir@laundry.local"
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-4 py-3 text-[16px] text-[#0e0f0c] placeholder:text-[#868685] focus:outline-none focus:border-[#163300]"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[14px] font-medium text-[#0e0f0c]">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setForgotPasswordOpen(true)}
                    className="text-[12px] font-semibold text-[#163300] hover:underline underline-offset-4 cursor-pointer"
                  >
                    Lupa Password?
                  </button>
                </div>
                <PasswordInput
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-4 py-3 text-[16px] text-[#0e0f0c] placeholder:text-[#868685] focus:outline-none focus:border-[#163300]"
                />
              </div>
              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] font-medium text-[16px] py-3 px-6 rounded-full transition-colors cursor-pointer disabled:opacity-60"
              >
                {authLoading ? 'Memverifikasi...' : 'Masuk ke Portal'}
              </button>
            </form>

            {isDemoTenant && (
              <div className="mt-6 pt-5 border-t border-[#868685]/30">
                <div className="text-[12px] font-semibold text-[#8f7552] mb-2.5 flex items-center justify-between">
                  <span>Pilih Akun Demo (Read-Only):</span>
                  <span className="text-[11px] bg-[#fceac2]/70 text-[#725d42] px-2 py-0.5 rounded-full font-medium">
                    Sandbox
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  {[
                    {
                      label: 'Super Owner Demo',
                      email: 'demo@mnilab.local',
                      pass: 'DemoMNILab123!',
                    },
                    {
                      label: 'Kasir Demo',
                      email: 'kasir.demo@mnilab.local',
                      pass: 'DemoMNILab123!',
                    },
                    {
                      label: 'Setrika Demo',
                      email: 'setrika.demo@mnilab.local',
                      pass: 'DemoMNILab123!',
                    },
                    {
                      label: 'Cuci Demo',
                      email: 'cuci.demo@mnilab.local',
                      pass: 'DemoMNILab123!',
                    },
                  ].map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => {
                        setIdentifier(acc.email);
                        setPassword(acc.pass);
                      }}
                      className="bg-[#ffffff] border border-[#cbaf80]/40 hover:border-[#8f7552] hover:bg-[#fceac2]/25 rounded-[10px] px-3 py-2 text-left transition-colors cursor-pointer"
                    >
                      <div className="font-semibold text-[#0e0f0c]">{acc.label}</div>
                      <div className="text-[11px] text-[#6a6c6a] truncate">{acc.email}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>

        {forgotPasswordOpen && (
          <ForgotPasswordModal
            onClose={() => setForgotPasswordOpen(false)}
            onResetSuccess={(email, msg) => {
              setIdentifier(email);
              setSuccessMsg(msg);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#ffffff] text-[#454745]">
      {isDemoTenant && (
        <DemoSandboxBar
          baseBranding={baseTenantBranding}
          activeBranding={tenantBranding}
          onPreviewChange={setTenantBranding}
          currentArea="portal"
        />
      )}
      {/* Top Header */}
      <header className="bg-[#ffffff] border-b border-[#e8ebe6] sticky top-0 z-20 no-print">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={`/?tenant=${encodeURIComponent(tenantBranding.slug)}`}
              className="flex items-center gap-2.5 group"
            >
              <img
                src={tenantBranding.logoUrl || defaultLogo}
                alt={`Logo ${tenantBranding.brandName}`}
                className="w-9 h-9 rounded-full object-cover shadow-[0_0_0_1px_rgba(14,15,12,0.12)]"
              />
              <div className="leading-tight">
                <div className="font-black text-[15px] tracking-[-0.02em] text-[#163300] uppercase">
                  {tenantBranding.brandName}
                </div>
                <div className="text-[10px] font-medium text-[#6a6c6a]">
                  {tenantBranding.tagline || 'The Best Partner'}
                </div>
              </div>
            </Link>
            <span className="hidden sm:inline-block text-[12px] bg-[#e2f6d5] text-[#163300] font-medium px-3 py-1 rounded-full">
              {user.role}
            </span>
            {user.branch && (
              <span className="text-[12px] bg-[#163300] text-[#9fe870] font-medium px-3 py-1 rounded-full">
                {user.branch.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Filter Cabang untuk Super Owner */}
            {isSuperOwner && (
              <div className="flex items-center gap-2 text-[12px]">
                <span className="font-medium text-[#6a6c6a] hidden sm:inline">Cabang:</span>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="bg-[#ffffff] border border-[#868685] text-[#0e0f0c] rounded-[10px] px-3 py-1.5 font-medium text-[12px] focus:outline-none focus:border-[#163300]"
                >
                  <option value="">Semua Cabang (Global)</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Tombol Profil, Foto, Email & Ganti Password (Tambahan 2) */}
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              title="Buka Profil, Email & Ganti Password"
              className="flex items-center gap-2.5 bg-[#e8ebe6] hover:bg-[#e2f6d5] border border-transparent hover:border-[#163300] rounded-full pl-1.5 pr-3.5 py-1 transition-colors cursor-pointer"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-8 h-8 rounded-full object-cover border border-[#163300]"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#163300] text-[#9fe870] font-black text-xs flex items-center justify-center">
                  {user.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="text-left hidden md:block">
                <div className="text-[12px] font-bold text-[#0e0f0c] leading-tight">{user.name}</div>
                <div className="text-[10px] text-[#163300] font-semibold">
                  {user.email || user.phone || 'Profil & Password'}
                </div>
              </div>
              <span className="text-[11px] font-semibold text-[#163300] md:hidden">Profil</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="text-[13px] font-medium bg-[#ffffff] border border-[#163300] text-[#163300] hover:bg-[#e2f6d5] px-4 py-1.5 rounded-full transition-colors cursor-pointer"
            >
              Keluar
            </button>
          </div>
        </div>

        {/* Role Navigation Tabs with Horizontal Scroll Controls */}
        <div className="max-w-[1200px] mx-auto px-2 sm:px-4 flex items-center border-t border-[#e8ebe6] gap-1.5">
          <button
            type="button"
            onClick={() => tabsContainerRef.current?.scrollBy({ left: -220, behavior: 'smooth' })}
            aria-label="Geser tab ke kiri"
            className="flex-shrink-0 p-1.5 text-[#454745] hover:text-[#163300] hover:bg-[#e8ebe6] rounded-full cursor-pointer transition-colors"
          >
            ◀
          </button>
          <div
            ref={tabsContainerRef}
            className="flex-1 flex overflow-x-auto gap-1.5 py-2 px-1 scrollbar-none scroll-smooth"
          >
            {navTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`text-[13px] font-medium px-4 py-1.5 rounded-full whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-[#9fe870] text-[#163300] font-semibold'
                    : 'text-[#454745] hover:bg-[#e2f6d5] hover:text-[#163300]'
                }`}
              >
                <span>{tab.label}</span>
                {Boolean(tab.badge && tab.badge > 0) && (
                  <span className="bg-[#cb272f] text-[#ffffff] text-[11px] font-bold px-2 py-0.5 rounded-full">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => tabsContainerRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
            aria-label="Geser tab ke kanan"
            className="flex-shrink-0 p-1.5 text-[#454745] hover:text-[#163300] hover:bg-[#e8ebe6] rounded-full cursor-pointer transition-colors"
          >
            ▶
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {isDemoTenant && (
          <div className="bg-snow border border-line text-ink rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 no-print shadow-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="bg-scarlet text-snow text-[10px] font-sub font-semibold uppercase px-2.5 py-0.5 rounded-full">
                  MODE DEMO READ-ONLY
                </span>
                <span className="font-sub font-semibold text-[14px] text-ink">
                  Simulasi Operasional &amp; Data Dummy Aktif
                </span>
              </div>
              <p className="text-[12px] text-muted">
                Anda dapat menjelajahi seluruh laporan, antrian cuci/setrika, dan
                daftar pesanan dummy. Aksi pembuatan/perubahan transaksi dikunci oleh
                server. Gunakan tombol <strong>Simulasi Branding</strong> di bilah atas
                untuk mencoba upload logo &amp; ganti warna tema.
              </p>
            </div>
            <a
              href={`https://wa.me/${platformWhatsapp}?text=${encodeURIComponent(
                'Halo Tim MNILab, saya sedang mencoba akun Demo dan tertarik berlangganan sistem Laundry penuh.',
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-scarlet hover:bg-scarlet-dark text-snow shadow-lg shadow-scarlet/25 text-[12px] font-sub font-semibold px-4 py-2 rounded-xl shrink-0 transition-all"
            >
              Langganan Penuh via WhatsApp
            </a>
          </div>
        )}

        {/* Banner Notifikasi Pengajuan Kasir & Pegawai untuk Owner */}
        {isOwner && (pendingExpensesCount > 0 || pendingSettlementsCount > 0 || pendingLeavesCount > 0 || pendingIroningPayoutsCount > 0) && (
          <div className="bg-[#163300] text-[#ffffff] rounded-[28px] p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 no-print">
            <div>
              <span className="inline-block bg-[#054d28] text-[#9fe870] text-[11px] font-medium px-3 py-0.5 rounded-full mb-1.5">
                Menunggu Persetujuan Owner
              </span>
              <div className="font-bold text-[16px] text-[#ffffff]">
                Terdapat pengajuan operasional yang memerlukan verifikasi:
              </div>
              <div className="text-[13px] text-[#e2f6d5] mt-1 flex flex-wrap gap-4">
                {pendingExpensesCount > 0 && (
                  <span>
                    <strong className="text-[#9fe870]">{pendingExpensesCount}</strong> Pengajuan Pengeluaran Kasir
                  </span>
                )}
                {pendingSettlementsCount > 0 && (
                  <span>
                    <strong className="text-[#9fe870]">{pendingSettlementsCount}</strong> Setoran Kas Kasir
                  </span>
                )}
                {pendingLeavesCount > 0 && (
                  <span>
                    <strong className="text-[#9fe870]">{pendingLeavesCount}</strong> Pengajuan Cuti Pegawai
                  </span>
                )}
                {pendingIroningPayoutsCount > 0 && (
                  <span>
                    <strong className="text-[#9fe870]">{pendingIroningPayoutsCount}</strong> Pengajuan Upah Setrika
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 text-[13px] font-medium">
              {pendingExpensesCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('OWNER_EXPENSES');
                    setExpenseFilterStatus('PENDING');
                  }}
                  className="bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] font-semibold px-4 py-2 rounded-full cursor-pointer transition-colors"
                >
                  Review Pengeluaran ({pendingExpensesCount})
                </button>
              )}
              {pendingSettlementsCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('OWNER_SETTLEMENTS');
                    setSettlementFilterStatus('PENDING');
                  }}
                  className="bg-[#ffffff] hover:bg-[#e2f6d5] text-[#163300] font-semibold px-4 py-2 rounded-full cursor-pointer transition-colors"
                >
                  Review Setoran Kas ({pendingSettlementsCount})
                </button>
              )}
              {pendingLeavesCount > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('OWNER_LEAVES')}
                  className="bg-[#e2f6d5] hover:bg-[#9fe870] text-[#163300] font-semibold px-4 py-2 rounded-full cursor-pointer transition-colors"
                >
                  Review Cuti ({pendingLeavesCount})
                </button>
              )}
              {pendingIroningPayoutsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('OWNER_IRONING_PAYOUTS')}
                  className="bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] font-semibold px-4 py-2 rounded-full cursor-pointer transition-colors"
                >
                  Bayar Upah Setrika ({pendingIroningPayoutsCount})
                </button>
              )}
            </div>
          </div>
        )}
        {/* Banner Alert Notifikasi */}
        {errorMsg && (
          <div className="bg-[#cb272f] text-[#ffffff] text-[14px] font-medium rounded-[10px] p-4 flex justify-between items-center no-print">
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)} className="font-bold ml-3 cursor-pointer">✕</button>
          </div>
        )}
        {successMsg && (
          <div className="bg-[#e2f6d5] border border-[#163300]/20 text-[#163300] text-[14px] font-medium rounded-[10px] p-4 flex justify-between items-center no-print">
            <span>{successMsg}</span>
            <button type="button" onClick={() => setSuccessMsg(null)} className="font-bold ml-3 cursor-pointer">✕</button>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB: SUPER OWNER - KELOLA CABANG */}
        {/* ============================================================== */}
        {activeTab === 'SUPER_BRANCHES' && (
          <section className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">
                    DAFTAR SELURUH CABANG
                  </h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={openCompanyLandingModal}
                      className="text-[12px] font-bold bg-[#163300] hover:bg-[#054d28] text-[#9fe870] px-3.5 py-1.5 rounded-full transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      ✨ Kustomisasi Landing Perusahaan
                    </button>
                    <span className="text-[12px] font-medium bg-[#ffffff] text-[#163300] border border-[#868685]/40 px-3.5 py-1.5 rounded-full">
                      Kuota Paket: {branches.length} / {maxAllowedBranches} Cabang
                    </span>
                  </div>
                </div>
                {branches.length >= maxAllowedBranches && (
                  <div className="bg-snow border border-line text-ink rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                    <div className="text-[12px]">
                      <div className="font-sub font-semibold text-ink text-[13px]">
                        Kuota Cabang Paket Anda ({maxAllowedBranches} Cabang) Telah Penuh
                      </div>
                      <p className="text-muted mt-0.5">
                        Paket langganan Anda saat ini mencakup maksimal{' '}
                        {maxAllowedBranches} cabang. Untuk menambahkan cabang ke-
                        {maxAllowedBranches + 1} dan seterusnya, silakan upgrade paket
                        langganan MNILab Anda.
                      </p>
                    </div>
                    <a
                      href={`https://wa.me/${platformWhatsapp}?text=${encodeURIComponent(
                        `Halo Tim MNILab, saya dari mitra *${tenantBranding.brandName}* (${tenantBranding.slug}) ingin melakukan Upgrade Paket Langganan untuk menambah kuota di atas ${maxAllowedBranches} cabang.`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-scarlet hover:bg-scarlet-dark text-snow shadow-lg shadow-scarlet/25 text-[12px] font-sub font-semibold px-4 py-2 rounded-xl shrink-0 transition-all"
                    >
                      Upgrade Kuota via WhatsApp
                    </a>
                  </div>
                )}
                <div className="space-y-3">
                  {branches.length === 0 ? (
                    <div className="bg-[#ffffff] border-2 border-dashed border-[#163300] rounded-[16px] p-6 space-y-2 text-[#0e0f0c]">
                      <div className="inline-block bg-[#cb272f]/10 text-[#cb272f] text-[11px] font-bold px-3 py-1 rounded-full">
                        🔒 Belum Ada Cabang Aktif — Cek Nota Publik Belum Tersedia
                      </div>
                      <h3 className="font-black text-[18px] uppercase">
                        Silakan Buat Cabang Pertama Anda (Contoh: Pusat)
                      </h3>
                      <p className="text-[13px] text-[#454745] leading-relaxed">
                        Saat ini subdomain{' '}
                        <strong className="font-mono text-[#163300]">
                          {formatTenantSubdomainHost(
                            tenantBranding.brandName,
                            tenantBranding.slug,
                          )}
                        </strong>{' '}
                        belum memiliki cabang. Buat cabang pertama Anda melalui formulir{' '}
                        <strong>Tambah Cabang Baru</strong> di sebelah kanan agar pelanggan
                        dapat melakukan Cek Nota sesuai nama cabang (contoh:{' '}
                        <code>/pusat</code>).
                      </p>
                    </div>
                  ) : (
                    branches.map((b) => {
                      const branchSlug = getBranchSlug(b, tenantBranding.brandName);
                      const branchTrackHref = buildBranchTrackingHref(
                        b,
                        tenantBranding.slug,
                        tenantBranding.brandName,
                      );
                      const subdomainHost = formatTenantSubdomainHost(
                        tenantBranding.brandName,
                        tenantBranding.slug,
                        tenantBranding.customDomain,
                      );
                      const branchWaNumbers = getBranchPhoneList(b);
                      return (
                        <div
                          key={b.id}
                          className="bg-[#ffffff] rounded-[10px] p-5 flex flex-wrap items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-[16px] text-[#0e0f0c]">{b.name}</span>
                              <span className="text-[11px] font-medium bg-[#e8ebe6] px-2.5 py-0.5 rounded-full text-[#454745]">
                                {b.code}
                              </span>
                              {b.isMain && (
                                <span className="text-[11px] font-semibold bg-[#9fe870] text-[#163300] px-2.5 py-0.5 rounded-full">
                                  PUSAT
                                </span>
                              )}
                              <span className="text-[11px] font-semibold bg-[#e2f6d5] text-[#163300] px-2.5 py-0.5 rounded-full">
                                🕒 {b.openTime || '07:00'} - {b.closeTime || '21:00'} WIB
                              </span>
                            </div>
                            <div className="text-[13px] text-[#6a6c6a]">
                              {b.address || 'Alamat belum diatur'}
                            </div>
                            <div className="text-[12px] text-[#163300] font-mono bg-[#e2f6d5]/70 px-2.5 py-1 rounded inline-block">
                              Link Cek Nota Cabang: <strong>{subdomainHost}/{branchSlug}</strong>
                            </div>
                            <div className="text-[12px] text-[#454745] flex flex-wrap gap-3 pt-0.5">
                              <span>
                                WA Cabang ({branchWaNumbers.length || 1} Nomor):{' '}
                                <strong>{branchWaNumbers.length > 0 ? branchWaNumbers.join(' • ') : (b.whatsappNumber || b.phone || '-')}</strong>
                              </span>
                              <span>Tarif Setrika: <strong>{formatRupiah(b.ironingRate || 1100)}/kg</strong></span>
                              <span>
                                Min. Kg Default:{' '}
                                <strong>
                                  {b.defaultMinWeightKg && Number(b.defaultMinWeightKg) > 0
                                    ? `${b.defaultMinWeightKg} kg`
                                    : 'Tanpa Minimal'}
                                </strong>
                              </span>
                              <span>Charge Bayar Nanti: <strong>+{formatRupiah(b.payLaterFee ?? 1000)}</strong></span>
                              <span>
                                Radius Absen: <strong>{b.attendanceRadiusMeters ?? 10}m</strong>
                                {b.latitude !== null && b.latitude !== undefined ? ' (GPS Aktif)' : ' (GPS Belum Diatur)'}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={branchTrackHref}
                              className="text-[12px] font-semibold bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] px-3.5 py-2 rounded-full transition-colors"
                            >
                              Buka Cek Nota (/{branchSlug}) →
                            </Link>
                            <button
                              type="button"
                              onClick={() => populateEditBranchForm(b)}
                              className="text-[13px] font-medium bg-[#ffffff] border border-[#163300] text-[#163300] hover:bg-[#e2f6d5] px-4 py-2 rounded-full cursor-pointer transition-colors"
                            >
                              Edit Pengaturan Cabang
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Form Tambah Cabang */}
              <form onSubmit={handleCreateBranch} className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-3.5 h-fit">
                <h3 className="font-black text-[20px] text-[#0e0f0c] tracking-[-0.01em] uppercase">
                  TAMBAH CABANG BARU
                </h3>
                <div>
                  <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">Nama Cabang *</label>
                  <input
                    type="text"
                    required
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="Contoh: Cabang 3 (Rungkut)"
                    className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[13px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">Kode Cabang *</label>
                    <input
                      type="text"
                      required
                      value={newBranchCode}
                      onChange={(e) => setNewBranchCode(e.target.value.toUpperCase())}
                      placeholder="CBG03"
                      className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[13px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">Tarif Setrika (Rp/kg)</label>
                    <input
                      type="number"
                      min="0"
                      value={newBranchIroningRate}
                      onChange={(e) => setNewBranchIroningRate(e.target.value)}
                      placeholder="1100"
                      className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[13px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">Jam Buka</label>
                    <input
                      type="time"
                      value={newBranchOpenTime}
                      onChange={(e) => setNewBranchOpenTime(e.target.value)}
                      className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[13px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">Jam Tutup</label>
                    <input
                      type="time"
                      value={newBranchCloseTime}
                      onChange={(e) => setNewBranchCloseTime(e.target.value)}
                      className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[13px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">Min. Kg Default (Opsional)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={newBranchDefaultMinWeight}
                      onChange={(e) => setNewBranchDefaultMinWeight(e.target.value)}
                      placeholder="Kosong = Tanpa Min"
                      className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[13px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">Charge Bayar Nanti (Rp)</label>
                    <input
                      type="number"
                      min="0"
                      value={newBranchPayLaterFee}
                      onChange={(e) => setNewBranchPayLaterFee(e.target.value)}
                      placeholder="1000"
                      className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[13px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">Alamat Cabang</label>
                  <input
                    type="text"
                    value={newBranchAddress}
                    onChange={(e) => setNewBranchAddress(e.target.value)}
                    placeholder="Jl. Raya Rungkut No. 5"
                    className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[13px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                  />
                </div>
                <div className="bg-[#ffffff] rounded-[12px] p-3 space-y-2 border border-[#868685]/40">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <label className="block text-[12px] font-bold text-[#0e0f0c]">
                        Daftar Nomor Telp / WhatsApp Struk Cabang
                      </label>
                      <span className="text-[10px] text-[#6a6c6a] block">
                        Bisa tambah lebih dari 1 nomor WA agar kasir punya cadangan saat salah satu nomor terkena limit/ban.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewBranchWhatsappList((prev) => [...prev, ''])}
                      className="text-[11px] font-semibold bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] px-2.5 py-1 rounded-full shrink-0 cursor-pointer"
                    >
                      + Tambah Nomor WA
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {newBranchWhatsappList.map((waNum, wIdx) => (
                      <div key={wIdx} className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={waNum}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNewBranchWhatsappList((prev) =>
                              prev.map((item, idx) => (idx === wIdx ? val : item)),
                            );
                            if (wIdx === 0) setNewBranchWhatsapp(val);
                          }}
                          placeholder={
                            wIdx === 0
                              ? 'Nomor WA Utama Cabang (081234567890)'
                              : `Nomor WA Cadangan #${wIdx + 1} (0813...)`
                          }
                          className="flex-1 bg-[#f7f9f6] border border-[#868685] rounded-[8px] px-3 py-1.5 text-[12px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                        />
                        {newBranchWhatsappList.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setNewBranchWhatsappList((prev) =>
                                prev.filter((_, idx) => idx !== wIdx),
                              )
                            }
                            className="text-xs font-bold text-[#cb272f] hover:bg-[#cb272f]/10 px-2 py-1 rounded cursor-pointer"
                            title="Hapus nomor ini"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-[#ffffff] rounded-[10px] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#163300] uppercase">Titik GPS &amp; Radius Absen</span>
                    <button
                      type="button"
                      onClick={() => fillGpsToBranchForm('NEW')}
                      className="text-[11px] font-semibold bg-[#e2f6d5] text-[#163300] px-2.5 py-1 rounded-full cursor-pointer"
                    >
                      📍 Ambil GPS Saat Ini
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={newBranchLatitude}
                      onChange={(e) => setNewBranchLatitude(e.target.value)}
                      placeholder="Lat (-7.26...)"
                      className="bg-[#e8ebe6]/60 border border-[#868685] rounded-[8px] px-2.5 py-1.5 text-xs text-[#0e0f0c]"
                    />
                    <input
                      type="text"
                      value={newBranchLongitude}
                      onChange={(e) => setNewBranchLongitude(e.target.value)}
                      placeholder="Lng (112.75...)"
                      className="bg-[#e8ebe6]/60 border border-[#868685] rounded-[8px] px-2.5 py-1.5 text-xs text-[#0e0f0c]"
                    />
                    <input
                      type="number"
                      min="1"
                      value={newBranchRadius}
                      onChange={(e) => setNewBranchRadius(e.target.value)}
                      placeholder="Radius (m)"
                      title="Radius Maksimal Absen (Meter)"
                      className="bg-[#e8ebe6]/60 border border-[#868685] rounded-[8px] px-2.5 py-1.5 text-xs text-[#0e0f0c]"
                    />
                  </div>
                </div>

                {/* Kustomisasi Landing Page Khusus Cabang Ini */}
                <div className="pt-2 border-t border-[#868685]/30 space-y-2">
                  <button
                    type="button"
                    onClick={() => setNewBranchLandingOpen(!newBranchLandingOpen)}
                    className="w-full flex items-center justify-between bg-[#ffffff] border border-[#868685] hover:border-[#163300] px-3 py-2 rounded-[10px] text-left transition-colors cursor-pointer"
                  >
                    <div>
                      <span className="font-bold text-[12px] text-[#163300] block">
                        ✨ Kustomisasi Landing Page Cabang (Opsional)
                      </span>
                      <span className="text-[10px] text-[#6a6c6a] block">
                        Kosongkan bila ingin otomatis menggunakan slogan &amp; keunggulan perusahaan
                      </span>
                    </div>
                    <span className="text-[#163300] font-bold text-xs ml-2">
                      {newBranchLandingOpen ? '▲ Tutup' : '▼ Buka'}
                    </span>
                  </button>

                  {newBranchLandingOpen && (
                    <div className="bg-[#ffffff] border border-[#868685]/40 rounded-[12px] p-3 space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#0e0f0c] mb-1">
                          Slogan Khusus Cabang Ini
                        </label>
                        <input
                          type="text"
                          value={newBranchHeroSlogan}
                          onChange={(e) => setNewBranchHeroSlogan(e.target.value)}
                          placeholder="Kosong = Ikut Slogan Perusahaan"
                          className="w-full bg-[#e8ebe6]/40 border border-[#868685] rounded-[8px] px-3 py-1.5 text-xs text-[#0e0f0c]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#0e0f0c] mb-1">
                          Deskripsi Singkat Cabang
                        </label>
                        <textarea
                          rows={2}
                          value={newBranchHeroDesc}
                          onChange={(e) => setNewBranchHeroDesc(e.target.value)}
                          placeholder="Kosong = Ikut Deskripsi Perusahaan"
                          className="w-full bg-[#e8ebe6]/40 border border-[#868685] rounded-[8px] px-3 py-1.5 text-xs text-[#0e0f0c] leading-relaxed"
                        />
                      </div>
                      <div className="space-y-2 pt-2 border-t border-[#e8ebe6]">
                        <span className="text-[11px] font-bold text-[#163300] block">
                          3 Kartu Keunggulan Khusus Cabang
                        </span>
                        {newBranchFeatures.map((feat, idx) => (
                          <div key={idx} className="bg-[#e8ebe6]/50 rounded-[8px] p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-[#454745]">
                                Keunggulan #{idx + 1}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <div className="w-6 h-6 rounded-full bg-[#ffffff] flex items-center justify-center">
                                  <LandingFeatureIcon icon={feat.icon} className="w-3.5 h-3.5 text-[#163300]" />
                                </div>
                                <select
                                  value={feat.icon}
                                  onChange={(e) => {
                                    const next = [...newBranchFeatures];
                                    next[idx] = { ...next[idx], icon: e.target.value };
                                    setNewBranchFeatures(next);
                                  }}
                                  className="bg-[#ffffff] border border-[#868685] rounded-[6px] px-2 py-0.5 text-[11px] text-[#0e0f0c]"
                                >
                                  {AVAILABLE_LANDING_ICONS.map((ic) => (
                                    <option key={ic.id} value={ic.id}>
                                      {ic.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <input
                              type="text"
                              value={feat.title}
                              onChange={(e) => {
                                const next = [...newBranchFeatures];
                                next[idx] = { ...next[idx], title: e.target.value };
                                setNewBranchFeatures(next);
                              }}
                              placeholder={`Judul #${idx + 1}`}
                              className="w-full bg-[#ffffff] border border-[#868685] rounded-[6px] px-2 py-1 text-xs text-[#0e0f0c] font-semibold"
                            />
                            <textarea
                              rows={2}
                              value={feat.description}
                              onChange={(e) => {
                                const next = [...newBranchFeatures];
                                next[idx] = { ...next[idx], description: e.target.value };
                                setNewBranchFeatures(next);
                              }}
                              placeholder={`Penjelasan #${idx + 1}`}
                              className="w-full bg-[#ffffff] border border-[#868685] rounded-[6px] px-2 py-1 text-[11px] text-[#454745]"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] text-[14px] font-semibold py-3 rounded-full cursor-pointer transition-colors"
                >
                  Simpan Cabang Baru
                </button>
              </form>
            </div>

            {/* Modal Edit Cabang */}
            {editBranchId && (
              <div className="fixed inset-0 z-50 bg-[#0e0f0c]/60 flex items-center justify-center p-4">
                <form
                  onSubmit={handleSaveBranchProfile}
                  className="bg-[#ffffff] rounded-[28px] max-w-xl w-full p-6 sm:p-8 space-y-4 max-h-[92vh] overflow-y-auto"
                >
                  <div className="flex items-center justify-between border-b border-[#e8ebe6] pb-3">
                    <h3 className="font-black text-[18px] text-[#0e0f0c] uppercase">
                      Edit Pengaturan Operasional Cabang
                    </h3>
                    <button type="button" onClick={() => setEditBranchId(null)} className="text-[#6a6c6a] font-bold cursor-pointer">✕</button>
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">Nama Cabang</label>
                    <input
                      type="text"
                      required
                      value={editBranchName}
                      onChange={(e) => setEditBranchName(e.target.value)}
                      className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">Alamat Cabang</label>
                    <input
                      type="text"
                      value={editBranchAddress}
                      onChange={(e) => setEditBranchAddress(e.target.value)}
                      className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">Jam Buka Operasional</label>
                      <input
                        type="time"
                        value={editBranchOpenTime}
                        onChange={(e) => setEditBranchOpenTime(e.target.value)}
                        className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">Jam Tutup Operasional</label>
                      <input
                        type="time"
                        value={editBranchCloseTime}
                        onChange={(e) => setEditBranchCloseTime(e.target.value)}
                        className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">Min. Kg Default Cabang (Opsional)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={editBranchDefaultMinWeight}
                        onChange={(e) => setEditBranchDefaultMinWeight(e.target.value)}
                        placeholder="Kosongkan jika tanpa minimal"
                        className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">Charge Bayar Nanti / Waktu Ambil (Rp)</label>
                      <input
                        type="number"
                        min="0"
                        value={editBranchPayLaterFee}
                        onChange={(e) => setEditBranchPayLaterFee(e.target.value)}
                        className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="bg-[#f7f9f6] border border-[#868685]/50 rounded-[12px] p-3.5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <label className="block text-[12px] font-bold text-[#0e0f0c]">
                            Daftar Nomor Telp / WhatsApp Struk Cabang (Bisa Lebih dari 1 Nomor)
                          </label>
                          <span className="text-[11px] text-[#6a6c6a] block">
                            Jika diisi &gt;1 nomor WA, kasir dapat memilih nomor pengirim struk saat salah satu nomor terkena limit/ban.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditBranchWhatsappList((prev) => [...prev, ''])}
                          className="text-[11px] font-semibold bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] px-3 py-1 rounded-full shrink-0 cursor-pointer"
                        >
                          + Tambah Nomor WA Cabang
                        </button>
                      </div>
                      <div className="space-y-2">
                        {editBranchWhatsappList.map((waNum, wIdx) => (
                          <div key={wIdx} className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-[#163300] bg-[#e2f6d5] px-2.5 py-1 rounded-full shrink-0">
                              WA #{wIdx + 1}
                            </span>
                            <input
                              type="text"
                              value={waNum}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEditBranchWhatsappList((prev) =>
                                  prev.map((item, idx) => (idx === wIdx ? val : item)),
                                );
                                if (wIdx === 0) setEditBranchWhatsapp(val);
                              }}
                              placeholder={
                                wIdx === 0
                                  ? 'Nomor WA Utama Cabang (0812-xxxx-xxxx)'
                                  : `Nomor WA Cadangan #${wIdx + 1} (0813-xxxx-xxxx)`
                              }
                              className="flex-1 bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-1.5 text-[13px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                            />
                            {editBranchWhatsappList.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setEditBranchWhatsappList((prev) =>
                                    prev.filter((_, idx) => idx !== wIdx),
                                  )
                                }
                                className="text-xs font-bold text-[#cb272f] hover:bg-[#cb272f]/10 px-2.5 py-1.5 rounded-lg cursor-pointer"
                              >
                                Hapus
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">Tarif Setrika per Kg (Rp)</label>
                      <input
                        type="number"
                        min="0"
                        value={editBranchIroningRate}
                        onChange={(e) => setEditBranchIroningRate(e.target.value)}
                        className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                      />
                    </div>
                  </div>
                  <div className="bg-[#e8ebe6] rounded-[12px] p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#163300] uppercase">Lokasi GPS &amp; Radius Absen (Kasir/Cuci)</span>
                      <button
                        type="button"
                        onClick={() => fillGpsToBranchForm('EDIT')}
                        className="text-xs font-semibold bg-[#9fe870] text-[#163300] px-3 py-1 rounded-full cursor-pointer"
                      >
                        📍 Ambil Lokasi GPS Saat Ini
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#454745] mb-1">Latitude</label>
                        <input
                          type="text"
                          value={editBranchLatitude}
                          onChange={(e) => setEditBranchLatitude(e.target.value)}
                          placeholder="-7.2654"
                          className="w-full bg-[#ffffff] border border-[#868685] rounded-[8px] px-2.5 py-1.5 text-xs text-[#0e0f0c]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#454745] mb-1">Longitude</label>
                        <input
                          type="text"
                          value={editBranchLongitude}
                          onChange={(e) => setEditBranchLongitude(e.target.value)}
                          placeholder="112.7588"
                          className="w-full bg-[#ffffff] border border-[#868685] rounded-[8px] px-2.5 py-1.5 text-xs text-[#0e0f0c]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#454745] mb-1">Radius (Meter)</label>
                        <input
                          type="number"
                          min="1"
                          value={editBranchRadius}
                          onChange={(e) => setEditBranchRadius(e.target.value)}
                          placeholder="10"
                          className="w-full bg-[#ffffff] border border-[#868685] rounded-[8px] px-2.5 py-1.5 text-xs text-[#0e0f0c]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Kustomisasi Landing Page Khusus Cabang Ini */}
                  <div className="pt-2 border-t border-[#e8ebe6] space-y-2">
                    <button
                      type="button"
                      onClick={() => setEditBranchLandingOpen(!editBranchLandingOpen)}
                      className="w-full flex items-center justify-between bg-[#f7f9f6] border border-[#868685]/50 hover:border-[#163300] px-3.5 py-2 rounded-[10px] text-left transition-colors cursor-pointer"
                    >
                      <div>
                        <span className="font-bold text-[12px] text-[#163300] block">
                          ✨ Kustomisasi Landing Page Cabang Ini (Opsional)
                        </span>
                        <span className="text-[11px] text-[#6a6c6a] block">
                          Kosongkan bila ingin otomatis menggunakan slogan &amp; keunggulan perusahaan
                        </span>
                      </div>
                      <span className="text-[#163300] font-bold text-xs ml-2">
                        {editBranchLandingOpen ? '▲ Tutup' : '▼ Buka'}
                      </span>
                    </button>

                    {editBranchLandingOpen && (
                      <div className="bg-[#f7f9f6] border border-[#868685]/40 rounded-[12px] p-3.5 space-y-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-[#0e0f0c] mb-1">
                            Slogan Khusus Cabang Ini
                          </label>
                          <input
                            type="text"
                            value={editBranchHeroSlogan}
                            onChange={(e) => setEditBranchHeroSlogan(e.target.value)}
                            placeholder="Kosong = Ikut Slogan Perusahaan"
                            className="w-full bg-[#ffffff] border border-[#868685] rounded-[8px] px-3 py-1.5 text-xs text-[#0e0f0c]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#0e0f0c] mb-1">
                            Deskripsi Singkat Cabang
                          </label>
                          <textarea
                            rows={2}
                            value={editBranchHeroDesc}
                            onChange={(e) => setEditBranchHeroDesc(e.target.value)}
                            placeholder="Kosong = Ikut Deskripsi Perusahaan"
                            className="w-full bg-[#ffffff] border border-[#868685] rounded-[8px] px-3 py-1.5 text-xs text-[#0e0f0c] leading-relaxed"
                          />
                        </div>
                        <div className="space-y-2 pt-2 border-t border-[#e8ebe6]">
                          <span className="text-[11px] font-bold text-[#163300] block">
                            3 Kartu Keunggulan Khusus Cabang
                          </span>
                          {editBranchFeatures.map((feat, idx) => (
                            <div key={idx} className="bg-[#ffffff] rounded-[8px] p-2.5 space-y-1.5 border border-[#868685]/30">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-[#454745]">
                                  Keunggulan #{idx + 1}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <div className="w-6 h-6 rounded-full bg-[#e8ebe6] flex items-center justify-center">
                                    <LandingFeatureIcon icon={feat.icon} className="w-3.5 h-3.5 text-[#163300]" />
                                  </div>
                                  <select
                                    value={feat.icon}
                                    onChange={(e) => {
                                      const next = [...editBranchFeatures];
                                      next[idx] = { ...next[idx], icon: e.target.value };
                                      setEditBranchFeatures(next);
                                    }}
                                    className="bg-[#f7f9f6] border border-[#868685] rounded-[6px] px-2 py-0.5 text-[11px] text-[#0e0f0c]"
                                  >
                                    {AVAILABLE_LANDING_ICONS.map((ic) => (
                                      <option key={ic.id} value={ic.id}>
                                        {ic.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <input
                                type="text"
                                value={feat.title}
                                onChange={(e) => {
                                  const next = [...editBranchFeatures];
                                  next[idx] = { ...next[idx], title: e.target.value };
                                  setEditBranchFeatures(next);
                                }}
                                placeholder={`Judul #${idx + 1}`}
                                className="w-full bg-[#f7f9f6] border border-[#868685] rounded-[6px] px-2 py-1 text-xs text-[#0e0f0c] font-semibold"
                              />
                              <textarea
                                rows={2}
                                value={feat.description}
                                onChange={(e) => {
                                  const next = [...editBranchFeatures];
                                  next[idx] = { ...next[idx], description: e.target.value };
                                  setEditBranchFeatures(next);
                                }}
                                placeholder={`Penjelasan #${idx + 1}`}
                                className="w-full bg-[#f7f9f6] border border-[#868685] rounded-[6px] px-2 py-1 text-[11px] text-[#454745]"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditBranchId(null)}
                      className="text-[13px] font-medium px-5 py-2.5 border border-[#163300] text-[#163300] rounded-full cursor-pointer hover:bg-[#e2f6d5]"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="text-[13px] font-semibold bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] px-6 py-2.5 rounded-full cursor-pointer"
                    >
                      Simpan Perubahan
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Modal Kustomisasi Landing Page Perusahaan */}
            {companyLandingModalOpen && (
              <div className="fixed inset-0 z-50 bg-[#0e0f0c]/60 flex items-center justify-center p-4">
                <form
                  onSubmit={handleSaveCompanyLanding}
                  className="bg-[#ffffff] rounded-[28px] max-w-xl w-full p-6 sm:p-8 space-y-4 max-h-[92vh] overflow-y-auto"
                >
                  <div className="flex items-center justify-between border-b border-[#e8ebe6] pb-3">
                    <div>
                      <h3 className="font-black text-[18px] text-[#0e0f0c] uppercase">
                        Kustomisasi Landing Page Perusahaan
                      </h3>
                      <p className="text-[12px] text-[#6a6c6a]">
                        Teks ini menjadi default utama untuk subdomain web laundry Anda dan seluruh cabang.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCompanyLandingModalOpen(false)}
                      className="text-[#6a6c6a] font-bold cursor-pointer text-lg"
                    >
                      ✕
                    </button>
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">
                      Hero Slogan (Baris Teks Tebal)
                    </label>
                    <input
                      type="text"
                      required
                      value={companyHeroSlogan}
                      onChange={(e) => setCompanyHeroSlogan(e.target.value)}
                      placeholder="Contoh: CUCI BERSIH. SETRIKA RAPI. TANPA CAMPUR."
                      className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-[#0e0f0c] mb-1">
                      Hero Deskripsi Singkat
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={companyHeroDesc}
                      onChange={(e) => setCompanyHeroDesc(e.target.value)}
                      placeholder="Contoh: Setiap cucian diproses 1 mesin 1 pelanggan, disetrika uap..."
                      className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[13px] text-[#0e0f0c] focus:outline-none focus:border-[#163300] leading-relaxed"
                    />
                  </div>

                  <div className="space-y-3 pt-2 border-t border-[#e8ebe6]">
                    <div className="font-bold text-[12px] text-[#163300] uppercase tracking-wider">
                      3 Poin Fitur Unggulan (Dengan Pilihan Icon)
                    </div>
                    {companyFeatures.map((feat, idx) => (
                      <div
                        key={idx}
                        className="bg-[#f7f9f6] border border-[#868685]/40 rounded-[12px] p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-[#454745]">
                            Fitur #{idx + 1}
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-[#e8ebe6] flex items-center justify-center">
                              <LandingFeatureIcon icon={feat.icon} className="w-4 h-4 text-[#163300]" />
                            </div>
                            <select
                              value={feat.icon}
                              onChange={(e) => {
                                const next = [...companyFeatures];
                                next[idx] = { ...next[idx], icon: e.target.value };
                                setCompanyFeatures(next);
                              }}
                              className="bg-[#ffffff] border border-[#868685] rounded-[6px] px-2 py-1 text-xs text-[#0e0f0c]"
                            >
                              {AVAILABLE_LANDING_ICONS.map((ic) => (
                                <option key={ic.id} value={ic.id}>
                                  {ic.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <input
                          type="text"
                          required
                          value={feat.title}
                          onChange={(e) => {
                            const next = [...companyFeatures];
                            next[idx] = { ...next[idx], title: e.target.value };
                            setCompanyFeatures(next);
                          }}
                          placeholder={`Judul Fitur #${idx + 1}`}
                          className="w-full bg-[#ffffff] border border-[#868685] rounded-[8px] px-3 py-1.5 text-xs text-[#0e0f0c] font-semibold"
                        />
                        <textarea
                          rows={2}
                          required
                          value={feat.description}
                          onChange={(e) => {
                            const next = [...companyFeatures];
                            next[idx] = { ...next[idx], description: e.target.value };
                            setCompanyFeatures(next);
                          }}
                          placeholder={`Deskripsi Fitur #${idx + 1}`}
                          className="w-full bg-[#ffffff] border border-[#868685] rounded-[8px] px-3 py-1.5 text-xs text-[#454745] leading-relaxed"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-2.5 pt-3 border-t border-[#e8ebe6]">
                    <button
                      type="button"
                      onClick={() => setCompanyLandingModalOpen(false)}
                      className="text-[13px] font-medium px-5 py-2.5 border border-[#163300] text-[#163300] rounded-full cursor-pointer hover:bg-[#e2f6d5]"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={savingCompanyLanding}
                      className="text-[13px] font-semibold bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] px-6 py-2.5 rounded-full cursor-pointer disabled:opacity-60"
                    >
                      {savingCompanyLanding ? 'Menyimpan...' : 'Simpan Kustomisasi'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB: BRANCH OWNER - PROFIL CABANG */}
        {/* ============================================================== */}
        {activeTab === 'BRANCH_PROFILE' && (
          <section className="max-w-3xl bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">
                PROFIL &amp; PENGATURAN OPERASIONAL CABANG
              </h2>
              <p className="text-[14px] text-[#454745] mt-1">
                Atur jam buka &amp; tutup cabang, minimal kg default, biaya tambahan Bayar Nanti (Waktu Ambil), lokasi GPS absen, serta nomor WhatsApp struk.
              </p>
            </div>
            <form onSubmit={handleSaveBranchProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-[#0e0f0c] mb-1">Nama Cabang</label>
                  <input
                    type="text"
                    required
                    value={editBranchName}
                    onChange={(e) => setEditBranchName(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#0e0f0c] mb-1">Alamat Cabang</label>
                  <input
                    type="text"
                    value={editBranchAddress}
                    onChange={(e) => setEditBranchAddress(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-[#0e0f0c] mb-1">Jam Buka Cabang</label>
                  <input
                    type="time"
                    value={editBranchOpenTime}
                    onChange={(e) => setEditBranchOpenTime(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#0e0f0c] mb-1">Jam Tutup Cabang</label>
                  <input
                    type="time"
                    value={editBranchCloseTime}
                    onChange={(e) => setEditBranchCloseTime(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-[#0e0f0c] mb-1">
                    Minimal Kg Default Cabang (Opsional)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={editBranchDefaultMinWeight}
                    onChange={(e) => setEditBranchDefaultMinWeight(e.target.value)}
                    placeholder="Kosongkan jika tidak ada minimal kg"
                    className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                  />
                  <span className="text-[11px] text-[#6a6c6a] mt-1 block">
                    Digunakan jika layanan kiloan tidak mengatur minimal kg khusus
                  </span>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#0e0f0c] mb-1">
                    Charge Bayar Nanti / Waktu Ambil (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editBranchPayLaterFee}
                    onChange={(e) => setEditBranchPayLaterFee(e.target.value)}
                    placeholder="1000"
                    className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                  />
                  <span className="text-[11px] text-[#6a6c6a] mt-1 block">
                    Biaya tambahan otomatis saat pelanggan memilih &ldquo;Bayar Nanti Waktu Ambil&rdquo; (default Rp 1.000)
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-[#ffffff] rounded-[16px] p-4 space-y-2.5 border border-[#868685]/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <label className="block text-[13px] font-bold text-[#0e0f0c]">
                        Daftar Nomor Telp / WhatsApp Struk Cabang (Bisa Lebih dari 1 Nomor)
                      </label>
                      <span className="text-[11px] text-[#6a6c6a] block">
                        Tambahkan beberapa nomor WA cabang agar kasir dapat memilih nomor lain jika salah satu nomor WA terkena limit/ban.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditBranchWhatsappList((prev) => [...prev, ''])}
                      className="text-xs font-semibold bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] px-3.5 py-1.5 rounded-full shrink-0 cursor-pointer"
                    >
                      + Tambah Nomor WA Cabang
                    </button>
                  </div>
                  <div className="space-y-2">
                    {editBranchWhatsappList.map((waNum, wIdx) => (
                      <div key={wIdx} className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-[#163300] bg-[#e2f6d5] px-2.5 py-1 rounded-full shrink-0">
                          WA #{wIdx + 1}
                        </span>
                        <input
                          type="text"
                          value={waNum}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditBranchWhatsappList((prev) =>
                              prev.map((item, idx) => (idx === wIdx ? val : item)),
                            );
                            if (wIdx === 0) setEditBranchWhatsapp(val);
                          }}
                          placeholder={
                            wIdx === 0
                              ? 'Nomor WA Utama Cabang (081234567890)'
                              : `Nomor WA Cadangan #${wIdx + 1} (0813...)`
                          }
                          className="flex-1 bg-[#e8ebe6]/50 border border-[#868685] rounded-[10px] px-3.5 py-2 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                        />
                        {editBranchWhatsappList.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditBranchWhatsappList((prev) =>
                                prev.filter((_, idx) => idx !== wIdx),
                              )
                            }
                            className="text-xs font-bold text-[#cb272f] hover:bg-[#cb272f]/10 px-3 py-2 rounded-lg cursor-pointer"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#0e0f0c] mb-1">Tarif Setrika per Kg (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    value={editBranchIroningRate}
                    onChange={(e) => setEditBranchIroningRate(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                  />
                  <span className="text-[11px] text-[#6a6c6a] mt-1 block">Dasar perhitungan upah pegawai setrika cabang</span>
                </div>
              </div>

              <div className="bg-[#ffffff] rounded-[16px] p-4 space-y-3 border border-[#868685]/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-[#163300] uppercase">
                      Titik Koordinat GPS &amp; Radius Absen Outlet
                    </div>
                    <p className="text-[11px] text-[#6a6c6a]">
                      Membatasi jarak absen Kasir &amp; Bagian Cuci agar hanya bisa absen di lokasi outlet (contoh radius 10 meter).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fillGpsToBranchForm('EDIT')}
                    className="text-xs font-semibold bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] px-4 py-1.5 rounded-full cursor-pointer"
                  >
                    📍 Ambil Titik GPS Saat Ini
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#454745] mb-1">Latitude Outlet</label>
                    <input
                      type="text"
                      value={editBranchLatitude}
                      onChange={(e) => setEditBranchLatitude(e.target.value)}
                      placeholder="-7.265400"
                      className="w-full bg-[#e8ebe6]/50 border border-[#868685] rounded-[10px] px-3 py-2 text-xs text-[#0e0f0c]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#454745] mb-1">Longitude Outlet</label>
                    <input
                      type="text"
                      value={editBranchLongitude}
                      onChange={(e) => setEditBranchLongitude(e.target.value)}
                      placeholder="112.758800"
                      className="w-full bg-[#e8ebe6]/50 border border-[#868685] rounded-[10px] px-3 py-2 text-xs text-[#0e0f0c]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#454745] mb-1">Radius Maksimal Absen (Meter)</label>
                    <input
                      type="number"
                      min="1"
                      value={editBranchRadius}
                      onChange={(e) => setEditBranchRadius(e.target.value)}
                      placeholder="10"
                      className="w-full bg-[#e8ebe6]/50 border border-[#868685] rounded-[10px] px-3 py-2 text-xs text-[#0e0f0c]"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] font-semibold text-[15px] px-6 py-3 rounded-full cursor-pointer transition-colors"
              >
                Simpan Pengaturan Cabang
              </button>
            </form>
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB: KASIR - BUAT PESANAN */}
        {/* ============================================================== */}
        {activeTab === 'CASHIER_ORDER' && (
          <section className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
              <div>
                <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase mb-1">
                  BUAT PESANAN LAUNDRY BARU
                </h2>
                <p className="text-[14px] text-[#454745]">
                  Mendukung layanan kiloan, satuan, cuci sepatu &amp; dry clean pihak ke-3. Pembayaran dapat dibayar langsung atau dibayar nanti waktu ambil (+{formatRupiah(currentPayLaterFee)}).
                </p>
              </div>
              {currentActiveBranch && (
                <span className="text-xs font-semibold bg-[#163300] text-[#9fe870] px-4 py-1.5 rounded-full">
                  🕒 Jam Operasional {currentActiveBranch.name}: {currentActiveBranch.openTime || '07:00'} - {currentActiveBranch.closeTime || '21:00'} WIB
                </span>
              )}
            </div>

            <form onSubmit={handleOpenOrderConfirmation} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-[#0e0f0c] mb-1.5">
                    Nama Pelanggan *
                  </label>
                  <input
                    type="text"
                    required
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    placeholder="Contoh: Budi Santoso"
                    className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-4 py-3 text-[15px] text-[#0e0f0c] placeholder:text-[#868685] focus:outline-none focus:border-[#163300]"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#0e0f0c] mb-1.5">
                    Nomor WhatsApp Customer * (11 - 13 digit)
                  </label>
                  <input
                    type="tel"
                    required
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    placeholder="081234567890"
                    className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-4 py-3 text-[15px] text-[#0e0f0c] placeholder:text-[#868685] focus:outline-none focus:border-[#163300]"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[#0e0f0c] mb-1.5">
                    Alamat (Opsional)
                  </label>
                  <input
                    type="text"
                    value={custAddress}
                    onChange={(e) => setCustAddress(e.target.value)}
                    placeholder="Jl. Karang Menjangan..."
                    className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-4 py-3 text-[15px] text-[#0e0f0c] placeholder:text-[#868685] focus:outline-none focus:border-[#163300]"
                  />
                </div>
              </div>

              {/* Detail Layanan */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-bold uppercase tracking-wider text-[#163300]">
                    Daftar Layanan Dipesan
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftItems((prev) => [
                        ...prev,
                        {
                          serviceId: services[0]?.id || '',
                          weightKg: '2',
                          garmentCount: '',
                          quantity: '1',
                          notes: '',
                        },
                      ])
                    }
                    className="text-[13px] font-medium bg-[#ffffff] border border-[#163300] text-[#163300] hover:bg-[#e2f6d5] px-4 py-1.5 rounded-full cursor-pointer transition-colors"
                  >
                    + Tambah Baris Layanan
                  </button>
                </div>

                {draftItems.map((item, idx) => {
                  const selectedSvc = services.find((s) => s.id === item.serviceId);
                  const isKg = selectedSvc?.priceUnit === 'KG';
                  const rowCalc = calculateDraftRow(item);

                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-[#ffffff] p-4 rounded-[10px] items-end"
                    >
                      <div className="sm:col-span-4">
                        <label className="block text-[12px] font-medium text-[#454745] mb-1">
                          Jenis Layanan
                        </label>
                        <select
                          value={item.serviceId}
                          onChange={(e) =>
                            setDraftItems((prev) =>
                              prev.map((row, rIdx) =>
                                rIdx === idx ? { ...row, serviceId: e.target.value } : row,
                              ),
                            )
                          }
                          className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2.5 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                        >
                          {services
                            .filter((s) => s.isActive)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} — {formatRupiah(s.price)}/{s.priceUnit === 'KG' ? 'kg' : 'pcs'}
                                {s.isThirdParty ? ` [Pihak Ke-3${s.thirdPartyPartner ? `: ${s.thirdPartyPartner}` : ''}]` : ''}
                                {s.discountActive && s.discountType !== 'NONE'
                                  ? ` (Diskon: ${s.discountType === 'PERCENTAGE' ? `${s.discountValue}%` : formatRupiah(s.discountValue || 0)})`
                                  : ''}
                              </option>
                            ))}
                        </select>
                      </div>

                      {isKg ? (
                        <div className="sm:col-span-2">
                          <label className="block text-[12px] font-medium text-[#454745] mb-1">
                            Berat Aktual (Kg) *
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            required
                            value={item.weightKg}
                            onChange={(e) =>
                              setDraftItems((prev) =>
                                prev.map((row, rIdx) =>
                                  rIdx === idx ? { ...row, weightKg: e.target.value } : row,
                                ),
                              )
                            }
                            className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2.5 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                          />
                          {rowCalc.isMinApplied && (
                            <span className="text-[11px] text-[#163300] font-semibold block mt-1">
                              Min. {rowCalc.minKgFloor} kg tagihan
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="sm:col-span-2">
                          <label className="block text-[12px] font-medium text-[#454745] mb-1">
                            Jumlah Potong / Pasang *
                          </label>
                          <input
                            type="number"
                            min="1"
                            required
                            value={item.quantity}
                            onChange={(e) =>
                              setDraftItems((prev) =>
                                prev.map((row, rIdx) =>
                                  rIdx === idx ? { ...row, quantity: e.target.value } : row,
                                ),
                              )
                            }
                            className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2.5 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                          />
                        </div>
                      )}

                      <div className="sm:col-span-2">
                        <label className="block text-[12px] font-medium text-[#454745] mb-1">
                          Jml Pakaian (Opsional)
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={item.garmentCount}
                          onChange={(e) =>
                            setDraftItems((prev) =>
                              prev.map((row, rIdx) =>
                                rIdx === idx ? { ...row, garmentCount: e.target.value } : row,
                              ),
                            )
                          }
                          placeholder="Pcs"
                          className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2.5 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                        />
                      </div>

                      {/* Kolom Total Harga Item */}
                      <div className="sm:col-span-3">
                        <label className="block text-[12px] font-medium text-[#454745] mb-1">
                          Total Harga Item
                        </label>
                        <div className="bg-[#e8ebe6] rounded-[10px] px-3.5 py-2.5 text-[14px] font-bold text-[#0e0f0c] flex items-center justify-between">
                          <span>{formatRupiah(rowCalc.finalTotal)}</span>
                          {rowCalc.discountAmt > 0 && (
                            <span className="text-[11px] font-semibold bg-[#9fe870] text-[#163300] px-2 py-0.5 rounded-full">
                              Hemat {formatRupiah(rowCalc.discountAmt)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="sm:col-span-1 flex justify-end">
                        {draftItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setDraftItems((prev) => prev.filter((_, rIdx) => rIdx !== idx))
                            }
                            className="text-[13px] font-medium text-[#cb272f] hover:underline py-2 cursor-pointer"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Rincian Pembayaran (Bayar Langsung vs Bayar Nanti Waktu Ambil) — Forest Ink Dark Card */}
              <div className="bg-[#163300] text-[#ffffff] rounded-[28px] p-6 space-y-5">
                {/* Pilihan Waktu Pembayaran (Tambahan 1) */}
                <div className="space-y-2 border-b border-[#054d28] pb-4">
                  <label className="block text-xs font-bold text-[#9fe870] uppercase tracking-wider">
                    Pilihan Waktu Pembayaran
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setIsPayLater(false)}
                      className={`text-left rounded-[14px] p-3.5 border transition-colors cursor-pointer ${
                        !isPayLater
                          ? 'bg-[#9fe870] text-[#163300] border-[#9fe870]'
                          : 'bg-[#054d28] text-[#ffffff] border-[#054d28] hover:border-[#9fe870]/50'
                      }`}
                    >
                      <div className="font-black text-sm">💳 Bayar Langsung (Sekarang)</div>
                      <div className={`text-xs mt-0.5 ${!isPayLater ? 'text-[#163300]/80' : 'text-[#e2f6d5]'}`}>
                        Tanpa biaya tambahan (Rp 0)
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPayLater(true)}
                      className={`text-left rounded-[14px] p-3.5 border transition-colors cursor-pointer ${
                        isPayLater
                          ? 'bg-[#9fe870] text-[#163300] border-[#9fe870]'
                          : 'bg-[#054d28] text-[#ffffff] border-[#054d28] hover:border-[#9fe870]/50'
                      }`}
                    >
                      <div className="font-black text-sm">
                        ⏳ Bayar Nanti (Waktu Ambil) +{formatRupiah(currentPayLaterFee)}
                      </div>
                      <div className={`text-xs mt-0.5 ${isPayLater ? 'text-[#163300]/80' : 'text-[#e2f6d5]'}`}>
                        Dikenakan charge layanan bayar nanti sebesar {formatRupiah(currentPayLaterFee)}
                      </div>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#054d28] pb-4">
                  <div>
                    <div className="text-[12px] font-medium text-[#e2f6d5]">Total Tagihan Final</div>
                    <div className="text-[32px] font-black text-[#9fe870] leading-tight">
                      {formatRupiah(liveTotals.finalTotal)}
                    </div>
                    <div className="flex flex-wrap gap-3 text-[12px] mt-1">
                      {liveTotals.discountTotal > 0 && (
                        <span className="text-[#9fe870] font-medium">
                          Diskon: -{formatRupiah(liveTotals.discountTotal)}
                        </span>
                      )}
                      {isPayLater && liveTotals.payLaterFee > 0 && (
                        <span className="bg-[#054d28] text-[#9fe870] font-semibold px-2.5 py-0.5 rounded-full">
                          Termasuk Charge Bayar Nanti: +{formatRupiah(liveTotals.payLaterFee)}
                        </span>
                      )}
                    </div>
                  </div>

                  {!isPayLater && (
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex items-center gap-2 bg-[#054d28] p-1 rounded-full">
                        <button
                          type="button"
                          onClick={() => setPayMethodInput('CASH')}
                          className={`text-[13px] font-semibold px-5 py-2 rounded-full cursor-pointer transition-colors ${
                            payMethodInput === 'CASH'
                              ? 'bg-[#9fe870] text-[#163300]'
                              : 'text-[#ffffff] hover:text-[#9fe870]'
                          }`}
                        >
                          Tunai (CASH)
                        </button>
                        {tenantBranding.qrisPaymentEnabled ? (
                          <button
                            type="button"
                            onClick={() => setPayMethodInput('QRIS')}
                            className={`text-[13px] font-semibold px-5 py-2 rounded-full cursor-pointer transition-colors ${
                              payMethodInput === 'QRIS'
                                ? 'bg-[#9fe870] text-[#163300]'
                                : 'text-[#ffffff] hover:text-[#9fe870]'
                            }`}
                          >
                            QRIS (Bank Nobu)
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            title="Pembayaran QRIS sedang dalam pemeliharaan (integrasi Dynamic QRIS Bank Nobu)"
                            className="text-[12px] font-semibold px-4 py-2 rounded-full bg-[#163300]/70 text-[#e2f6d5]/70 border border-[#9fe870]/30 cursor-not-allowed flex items-center gap-1.5"
                          >
                            <span>🔧 QRIS (Under Maintenance)</span>
                          </button>
                        )}
                      </div>
                      {!tenantBranding.qrisPaymentEnabled && (
                        <span className="text-[11px] text-[#e2f6d5]/90">
                          * Pembayaran Dynamic QRIS (Bank Nobu) sedang dalam proses aktivasi API. Gunakan Tunai untuk sementara.
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {!isPayLater && payMethodInput === 'CASH' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[13px] font-medium text-[#e2f6d5] mb-1.5">
                        Uang Diterima dari Customer (Rp) *
                      </label>
                      <input
                        type="number"
                        required
                        min={liveTotals.finalTotal}
                        value={cashGivenInput}
                        onChange={(e) => setCashGivenInput(e.target.value)}
                        placeholder={String(liveTotals.finalTotal)}
                        className="w-full bg-[#ffffff] text-[#0e0f0c] rounded-[10px] px-4 py-3 text-[15px] font-bold focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium text-[#e2f6d5] mb-1.5">
                        Kembalian
                      </label>
                      <div className="bg-[#054d28] text-[#9fe870] rounded-[10px] px-4 py-3 text-[15px] font-black">
                        {formatRupiah(Math.max(0, Number(cashGivenInput || 0) - liveTotals.finalTotal))}
                      </div>
                    </div>
                  </div>
                )}

                {isPayLater && (
                  <div className="bg-[#054d28] rounded-[12px] p-3.5 text-xs text-[#e2f6d5]">
                    Pelanggan memilih <strong className="text-[#9fe870]">Bayar Nanti (Waktu Ambil)</strong>. Nota akan berstatus <strong className="text-[#9fe870]">UNPAID (Belum Lunas)</strong> dengan total {formatRupiah(liveTotals.finalTotal)} (sudah termasuk charge +{formatRupiah(liveTotals.payLaterFee)}) dan wajib dilunasi saat pengambilan cucian.
                  </div>
                )}

                {/* Pilihan Nomor Telp / WhatsApp Cabang / Perusahaan untuk Struk (Anti-Limit / Cadangan) */}
                {cashierSenderPhoneOptions.length > 0 && (
                  <div className="bg-[#054d28] rounded-[14px] p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <label className="block text-[12px] font-bold text-[#9fe870] uppercase tracking-wider">
                          📱 Pilih Nomor Telp / WhatsApp Cabang / Perusahaan pada Struk
                        </label>
                        <span className="text-[11px] text-[#e2f6d5] block">
                          Jika nomor WA utama cabang terkena limit/ban saat kirim struk, pilih nomor WA cadangan lainnya di bawah ini:
                        </span>
                      </div>
                      <span className="text-[11px] bg-[#163300] text-[#9fe870] px-2.5 py-0.5 rounded-full font-semibold">
                        {cashierSenderPhoneOptions.length} Nomor Tersedia
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {cashierSenderPhoneOptions.map((opt) => {
                        const active = selectedSenderWhatsapp === opt.phone;
                        return (
                          <button
                            key={opt.phone}
                            type="button"
                            onClick={() => setSelectedSenderWhatsapp(opt.phone)}
                            className={`text-left rounded-[10px] px-3.5 py-2 text-xs transition-all cursor-pointer border ${
                              active
                                ? 'bg-[#9fe870] text-[#163300] border-[#9fe870] font-bold shadow-xs'
                                : 'bg-[#163300] text-[#ffffff] border-[#9fe870]/30 hover:border-[#9fe870]'
                            }`}
                          >
                            <div className="font-mono font-bold text-[13px]">{opt.phone}</div>
                            <div className={`text-[10px] ${active ? 'text-[#163300]/80' : 'text-[#e2f6d5]'}`}>
                              {opt.label}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[13px] font-medium text-[#e2f6d5] mb-1.5">
                    Catatan Pesanan / Transaksi (Opsional)
                  </label>
                  <input
                    type="text"
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="Contoh: Pewangi lavender, pelanggan menitipkan hanger"
                    className="w-full bg-[#ffffff] text-[#0e0f0c] placeholder:text-[#868685] rounded-[10px] px-4 py-3 text-[14px] focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] font-semibold text-[16px] px-6 py-4 rounded-full cursor-pointer transition-colors"
              >
                Lanjutkan ke Konfirmasi Pesanan &amp; Buat Struk →
              </button>
            </form>

            {/* Popup Konfirmasi Sebelum Finalisasi Transaksi */}
            {orderConfirmModal && (
              <div className="fixed inset-0 z-50 bg-[#0e0f0c]/60 flex items-center justify-center p-4">
                <div className="bg-[#ffffff] rounded-[28px] max-w-md w-full p-6 sm:p-8 space-y-4">
                  <div className="border-b border-[#e8ebe6] pb-3">
                    <span className="inline-block bg-[#e2f6d5] text-[#163300] text-[11px] font-medium px-3 py-0.5 rounded-full mb-1">
                      Konfirmasi Transaksi Kasir
                    </span>
                    <h3 className="text-[22px] font-black text-[#0e0f0c] uppercase">
                      Ringkasan &amp; Cetak Struk
                    </h3>
                  </div>

                  <div className="text-[13px] space-y-2.5 bg-[#e8ebe6] p-4 rounded-[10px]">
                    <div className="flex justify-between">
                      <span className="text-[#6a6c6a]">Pelanggan:</span>
                      <strong className="text-[#0e0f0c]">{orderConfirmModal.customer.name}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6a6c6a]">No. WhatsApp Customer:</span>
                      <span className="font-mono text-[#0e0f0c]">{orderConfirmModal.customer.phone}</span>
                    </div>
                    {selectedSenderWhatsapp && (
                      <div className="flex justify-between">
                        <span className="text-[#6a6c6a]">No. WA Cabang/Company (Struk):</span>
                        <span className="font-mono font-bold text-[#163300]">{selectedSenderWhatsapp}</span>
                      </div>
                    )}
                    {orderConfirmModal.isPayLater && orderConfirmModal.payLaterFee > 0 && (
                      <div className="flex justify-between text-[#163300]">
                        <span>Charge Bayar Nanti:</span>
                        <span className="font-semibold">+{formatRupiah(orderConfirmModal.payLaterFee)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-[#868685]/30 pt-2">
                      <span className="text-[#0e0f0c] font-semibold">Total Tagihan:</span>
                      <strong className="text-[16px] text-[#163300]">{formatRupiah(orderConfirmModal.totalBill)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6a6c6a]">Status Pembayaran:</span>
                      <span className="font-bold text-[#0e0f0c]">
                        {orderConfirmModal.isPayLater
                          ? 'BAYAR NANTI (WAKTU AMBIL)'
                          : `LUNAS (${orderConfirmModal.method})`}
                      </span>
                    </div>
                    {!orderConfirmModal.isPayLater && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-[#6a6c6a]">Bayar (Uang Diterima):</span>
                          <span className="font-bold text-[#0e0f0c]">{formatRupiah(orderConfirmModal.bayarAmt)}</span>
                        </div>
                        {orderConfirmModal.method === 'CASH' && (
                          <div className="flex justify-between text-[#163300]">
                            <span className="font-semibold">Kembalian:</span>
                            <strong className="text-[14px]">{formatRupiah(orderConfirmModal.kembalian)}</strong>
                          </div>
                        )}
                      </>
                    )}
                    {orderConfirmModal.notes && (
                      <div className="border-t border-[#868685]/30 pt-2 text-[12px] text-[#6a6c6a]">
                        Catatan: {orderConfirmModal.notes}
                      </div>
                    )}
                  </div>

                  <p className="text-[12px] text-[#6a6c6a]">
                    Transaksi akan difinalisasi satu kali ke sistem dan struk otomatis dikirim via WhatsApp.
                  </p>

                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      disabled={isFinalizingOrder}
                      onClick={() => void finalizeOrder(false)}
                      className="bg-[#ffffff] border border-[#163300] hover:bg-[#e2f6d5] text-[#163300] font-medium text-[13px] px-4 py-2.5 rounded-full cursor-pointer transition-colors"
                    >
                      {isFinalizingOrder ? 'Memproses...' : 'Tutup (Kirim WA Saja)'}
                    </button>
                    <button
                      type="button"
                      disabled={isFinalizingOrder}
                      onClick={() => void finalizeOrder(true)}
                      className="bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] font-semibold text-[13px] px-5 py-2.5 rounded-full cursor-pointer transition-colors"
                    >
                      {isFinalizingOrder ? 'Memproses...' : 'Cetak Struk'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB: KASIR - INPUT RAK */}
        {/* ============================================================== */}
        {activeTab === 'CASHIER_RACK' && (
          <section className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">
                INPUT RAK PENYIMPANAN / AMBIL LANGSUNG
              </h2>
              <p className="text-[14px] text-[#454745] mt-1">
                Masukkan kode rak untuk cucian yang selesai disetrika, atau klik <strong>Ambil Langsung Tanpa Rak</strong> jika customer sudah datang mengambil pakaian sebelum sempat ditaruh di rak.
              </p>
            </div>

            <div className="space-y-3">
              {cashierRackItems
                .filter((it) => it.status === 'SETRIKA_SELESAI' || (it.workflow === 'WASH_DRY' && it.status === 'PROSES_CUCI'))
                .map((it) => (
                  <div
                    key={it.id}
                    className="bg-[#ffffff] rounded-[10px] p-5 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[16px] text-[#0e0f0c]">{it.order?.orderNumber}</span>
                        <span className="text-[12px] bg-[#e2f6d5] text-[#163300] font-medium px-3 py-0.5 rounded-full">
                          {STATUS_LABELS[it.status]}
                        </span>
                      </div>
                      <div className="text-[14px] text-[#454745] mt-1">
                        Pelanggan: <strong className="text-[#0e0f0c]">{it.order?.customer?.name}</strong> • Layanan: {it.serviceName}
                      </div>
                      <div className="text-[12px] text-[#6a6c6a] mt-0.5">
                        Workflow: {WORKFLOW_LABELS[it.workflow]}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <input
                        type="text"
                        placeholder="Kode Rak (misal: 40)"
                        value={rackInputs[it.id] || ''}
                        onChange={(e) =>
                          setRackInputs((prev) => ({ ...prev, [it.id]: e.target.value }))
                        }
                        className="bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-[14px] text-[#0e0f0c] w-40 font-semibold focus:outline-none focus:border-[#163300]"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAssignRackAndComplete(it.id)}
                        className="text-[13px] font-semibold bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] px-4 py-2 rounded-full cursor-pointer transition-colors"
                      >
                        Simpan ke Rak
                      </button>
                      {it.status === 'SETRIKA_SELESAI' && it.order?.id && (
                        <button
                          type="button"
                          onClick={() => void handlePickupOrder(it.order!.id)}
                          className="text-[13px] font-semibold bg-[#163300] hover:bg-[#054d28] text-[#9fe870] px-4 py-2 rounded-full cursor-pointer transition-colors"
                        >
                          ✓ Ambil Langsung Tanpa Rak
                        </button>
                      )}
                    </div>
                  </div>
                ))}

              {cashierRackItems.filter((it) => it.status === 'SETRIKA_SELESAI' || (it.workflow === 'WASH_DRY' && it.status === 'PROSES_CUCI')).length === 0 && (
                <div className="bg-[#ffffff] rounded-[10px] text-center py-10 text-[#6a6c6a] text-[14px]">
                  Tidak ada pakaian yang siap dimasukkan ke rak saat ini.
                </div>
              )}
            </div>
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB: KASIR - AJUKAN PENGELUARAN */}
        {/* ============================================================== */}
        {activeTab === 'CASHIER_EXPENSES' && (
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-5">
              <div>
                <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">
                  PENGAJUAN PENGELUARAN OPERASIONAL
                </h2>
                <p className="text-[14px] text-[#454745] mt-1">
                  Pengeluaran yang diajukan berstatus &ldquo;Menunggu Persetujuan&rdquo; dan akan diverifikasi oleh Owner Cabang atau Super Owner.
                </p>
              </div>

              <div className="space-y-3">
                {expenses.map((ex) => (
                  <div
                    key={ex.id}
                    className="bg-[#ffffff] rounded-[10px] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-bold text-[15px] text-[#0e0f0c]">{ex.description}</div>
                      <div className="text-[13px] text-[#6a6c6a] mt-0.5">
                        {ex.category?.name} • Kas Tanggal: <strong className="text-[#0e0f0c]">{ex.expenseDate}</strong> • {ex.paymentMethod}
                      </div>
                      {ex.notes && <div className="text-[12px] text-[#6a6c6a] mt-1">Catatan: {ex.notes}</div>}
                      {ex.rejectionNote && (
                        <div className="text-[12px] text-[#cb272f] font-semibold mt-1">
                          Alasan Ditolak: {ex.rejectionNote}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-black text-[16px] text-[#cb272f]">-{formatRupiah(ex.amount)}</div>
                      <span
                        className={`text-[11px] font-medium px-3 py-0.5 rounded-full inline-block mt-1 ${
                          ex.approvalStatus === 'APPROVED'
                            ? 'bg-[#9fe870] text-[#163300]'
                            : ex.approvalStatus === 'REJECTED'
                              ? 'bg-[#cb272f] text-[#ffffff]'
                              : 'bg-[#e2f6d5] text-[#163300]'
                        }`}
                      >
                        {EXPENSE_APPROVAL_LABELS[ex.approvalStatus]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Form Ajukan */}
            <form onSubmit={handleCreateExpense} className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-4 h-fit">
              <h3 className="font-black text-[20px] text-[#0e0f0c] tracking-[-0.01em] uppercase">
                AJUKAN PENGELUARAN
              </h3>
              <div>
                <label className="block text-[13px] font-medium text-[#0e0f0c] mb-1">Kategori</label>
                <select
                  value={expCategoryId}
                  onChange={(e) => setExpCategoryId(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#0e0f0c] mb-1">Keperluan / Deskripsi</label>
                <input
                  type="text"
                  required
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                  placeholder="Contoh: Isi ulang LPG 3kg, deterjen"
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-[14px] text-[#0e0f0c] placeholder:text-[#868685] focus:outline-none focus:border-[#163300]"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#0e0f0c] mb-1">
                  Sumber Uang / Tanggal Kas yang Digunakan <span className="text-[#cb272f]">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-[14px] text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                />
                <p className="text-[12px] text-[#6a6c6a] mt-1 leading-snug">
                  Gunakan tanggal hari ini, atau pilih tanggal kemarin jika memakai sisa kas kemarin yang belum diambil owner.
                </p>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#0e0f0c] mb-1">Nominal (Rp)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  placeholder="25000"
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-[14px] text-[#0e0f0c] placeholder:text-[#868685] focus:outline-none focus:border-[#163300]"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#0e0f0c] mb-1">Catatan Tambahan</label>
                <input
                  type="text"
                  value={expNotes}
                  onChange={(e) => setExpNotes(e.target.value)}
                  placeholder="Opsional..."
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-[14px] text-[#0e0f0c] placeholder:text-[#868685] focus:outline-none focus:border-[#163300]"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] text-[15px] font-semibold py-3 rounded-full cursor-pointer transition-colors"
              >
                Kirim Pengajuan
              </button>
            </form>
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB: DAFTAR PESANAN & MONITORING */}
        {/* ============================================================== */}
        {activeTab === 'ORDERS_LIST' && (
          <section className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">
                  {isOwner ? 'MONITORING PESANAN & PEMBAYARAN' : 'DAFTAR PESANAN LAUNDRY'}
                </h2>
                <p className="text-[14px] text-[#454745] mt-1">
                  {isOwner
                    ? 'Pantau alur pengerjaan tiap item (cuci, setrika, rak) dan status penyelesaian.'
                    : 'Kelola serah terima pakaian, pantau status pengerjaan per item, dan pengiriman struk.'}
                </p>
              </div>
              <input
                type="text"
                placeholder="Cari nota, pelanggan, no HP..."
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                className="bg-[#ffffff] border border-[#868685] rounded-[10px] px-4 py-2.5 text-[14px] text-[#0e0f0c] placeholder:text-[#868685] w-full sm:w-72 focus:outline-none focus:border-[#163300]"
              />
            </div>

            {/* Filter Tanggal Harian & Pintasan */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#ffffff] rounded-[10px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-[#0e0f0c]">Tanggal Pesanan:</span>
                <button
                  type="button"
                  onClick={() => setOrderDateFilter(todayStr)}
                  className={`text-[13px] px-4 py-1.5 rounded-full font-medium cursor-pointer transition-colors ${
                    orderDateFilter === todayStr && !orderSearch.trim()
                      ? 'bg-[#9fe870] text-[#163300] font-semibold'
                      : 'bg-[#e8ebe6] text-[#454745] hover:bg-[#e2f6d5] hover:text-[#163300]'
                  }`}
                >
                  Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() - 1);
                    setOrderDateFilter(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
                  }}
                  className="text-[13px] px-4 py-1.5 rounded-full bg-[#e8ebe6] hover:bg-[#e2f6d5] text-[#454745] hover:text-[#163300] font-medium cursor-pointer transition-colors"
                >
                  Kemarin
                </button>
                <input
                  type="date"
                  value={orderDateFilter}
                  onChange={(e) => setOrderDateFilter(e.target.value)}
                  className="bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-1.5 text-[13px] text-[#0e0f0c] font-medium cursor-pointer focus:outline-none focus:border-[#163300]"
                />
                <button
                  type="button"
                  onClick={() => setOrderDateFilter('')}
                  className={`text-[13px] px-4 py-1.5 rounded-full font-medium cursor-pointer transition-colors ${
                    !orderDateFilter && !orderSearch.trim()
                      ? 'bg-[#9fe870] text-[#163300] font-semibold'
                      : 'bg-[#e8ebe6] text-[#454745] hover:bg-[#e2f6d5] hover:text-[#163300]'
                  }`}
                >
                  Semua Tanggal
                </button>
              </div>

              {orderSearch.trim() ? (
                <div className="text-[12px] text-[#163300] font-medium bg-[#e2f6d5] px-3 py-1 rounded-full">
                  Mode Pencarian Global: Menampilkan hasil di seluruh tanggal
                </div>
              ) : orderDateFilter ? (
                <div className="text-[13px] text-[#6a6c6a] font-medium">
                  Menampilkan pesanan:{' '}
                  <strong className="text-[#0e0f0c]">
                    {new Date(orderDateFilter + 'T00:00:00').toLocaleDateString('id-ID', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </strong>
                </div>
              ) : (
                <div className="text-[13px] text-[#6a6c6a] font-medium">
                  Menampilkan seluruh data pesanan
                </div>
              )}
            </div>

            {groupedOrdersByDate.length === 0 ? (
              <div className="bg-[#ffffff] rounded-[10px] text-center py-12 text-[#6a6c6a] text-[14px]">
                Belum ada data pesanan laundry pada periode ini.
              </div>
            ) : (
              <div className="space-y-6">
                {groupedOrdersByDate.map((group) => (
                  <div key={group.dateKey} className="space-y-3">
                    {/* Header Pembeda Tanggal */}
                    <div className="bg-[#163300] text-[#ffffff] rounded-full px-5 py-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-[14px] font-bold text-[#9fe870]">
                          {group.formattedDate}
                        </span>
                        <span className="text-[12px] bg-[#054d28] text-[#ffffff] font-medium px-3 py-0.5 rounded-full">
                          {group.orders.length} Pesanan
                        </span>
                      </div>
                      <div className="text-[13px] text-[#e2f6d5] font-medium">
                        Total Omset:{' '}
                        <span className="text-[#9fe870] font-bold">
                          {formatRupiah(group.dayTotal)}
                        </span>
                      </div>
                    </div>

                    {/* Daftar Pesanan pada Tanggal Tersebut */}
                    <div className="space-y-3">
                      {group.orders.map((o) => (
                        <div
                          key={o.id}
                          className="bg-[#ffffff] rounded-[10px] p-5 space-y-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-bold text-[15px] text-[#0e0f0c]">{o.orderNumber}</span>
                                <span
                                  className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                                    o.paymentStatus === 'PAID'
                                      ? 'bg-[#9fe870] text-[#163300]'
                                      : o.paymentStatus === 'PARTIAL'
                                        ? 'bg-[#e2f6d5] text-[#163300]'
                                        : 'bg-[#cb272f] text-[#ffffff]'
                                  }`}
                                >
                                  {o.paymentStatus}
                                </span>
                                {o.isPayLater && (
                                  <span className="text-[11px] bg-[#163300] text-[#9fe870] font-semibold px-2.5 py-0.5 rounded-full">
                                    Bayar Nanti (+{formatRupiah(o.payLaterFee || 1000)})
                                  </span>
                                )}
                                {o.branch && (
                                  <span className="text-[11px] bg-[#e8ebe6] text-[#163300] font-medium px-2.5 py-0.5 rounded-full">
                                    {o.branch.name}
                                  </span>
                                )}
                              </div>
                              <div className="text-[14px] text-[#454745]">
                                Pelanggan: <strong className="text-[#0e0f0c]">{o.customer?.name}</strong> ({o.customer?.phone}) • Kasir: {o.cashier?.name}
                              </div>
                              <div className="text-[12px] text-[#6a6c6a]">
                                Waktu Masuk: {new Date(o.receivedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                              <div className="text-right">
                                <div className="text-[12px] text-[#6a6c6a]">
                                  Total {o.paidAmount < o.total ? `(Sisa: ${formatRupiah(o.total - o.paidAmount)})` : ''}
                                </div>
                                <div className="font-bold text-[18px] text-[#0e0f0c]">{formatRupiah(o.total)}</div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                {o.pickedUpAt ? (
                                  <span className="text-[12px] font-semibold text-[#163300] bg-[#e2f6d5] px-4 py-2 rounded-full inline-flex items-center gap-1.5">
                                    <span>✓</span> Selesai (Sudah Diambil)
                                  </span>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => void openReceipt(o.id)}
                                      className="text-[13px] font-medium bg-[#ffffff] border border-[#163300] hover:bg-[#e2f6d5] text-[#163300] px-4 py-2 rounded-full cursor-pointer transition-colors"
                                    >
                                      Struk
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const rec = await apiFetch<ReceiptResponse>(`/orders/${o.id}/receipt`);
                                        if (rec.whatsappUrl) window.open(rec.whatsappUrl, '_blank');
                                      }}
                                      className="text-[13px] font-medium bg-[#e2f6d5] hover:bg-[#9fe870] text-[#163300] px-4 py-2 rounded-full cursor-pointer transition-colors"
                                    >
                                      Kirim WA
                                    </button>
                                    {!isOwner && o.paidAmount < o.total && (
                                      <button
                                        type="button"
                                        onClick={() => setSettleOrderModal(o)}
                                        className="text-[13px] font-semibold bg-[#163300] hover:bg-[#054d28] text-[#9fe870] px-4 py-2 rounded-full cursor-pointer transition-colors"
                                      >
                                        💳 Lunasi Tagihan / Ambil
                                      </button>
                                    )}
                                    {!isOwner && o.paidAmount >= o.total && (
                                      <button
                                        type="button"
                                        onClick={() => void handlePickupOrder(o.id)}
                                        className="text-[13px] font-semibold bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] px-4 py-2 rounded-full cursor-pointer transition-colors"
                                      >
                                        Pakaian Diambil
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Rincian Status Pengerjaan Tiap Item */}
                          <div className="pt-3 border-t border-[#e8ebe6] space-y-2.5">
                            <div className="text-[11px] font-bold text-[#6a6c6a] uppercase tracking-wider">
                              Status Pengerjaan &amp; Rincian Item ({o.items?.length || 0}):
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                              {o.items?.map((it) => {
                                let statusBadge = (
                                  <span className="text-[11px] font-medium bg-[#ffffff] text-[#454745] px-2.5 py-0.5 rounded-full">
                                    {STATUS_LABELS[it.status] || it.status}
                                  </span>
                                );
                                if (o.pickedUpAt || it.status === 'SELESAI') {
                                  statusBadge = (
                                    <span className="text-[11px] font-semibold bg-[#9fe870] text-[#163300] px-2.5 py-0.5 rounded-full">
                                      {o.pickedUpAt ? 'Sudah Diambil' : 'Di Rak Siap Diambil'}
                                    </span>
                                  );
                                } else if (it.status === 'SETRIKA_SELESAI') {
                                  statusBadge = (
                                    <span className="text-[11px] font-medium bg-[#e2f6d5] text-[#163300] px-2.5 py-0.5 rounded-full">
                                      Selesai Setrika (Bisa Diambil Langsung / Input Rak)
                                    </span>
                                  );
                                } else if (it.status === 'PROSES_SETRIKA' || it.status === 'PROSES_CUCI') {
                                  statusBadge = (
                                    <span className="text-[11px] font-medium bg-[#163300] text-[#9fe870] px-2.5 py-0.5 rounded-full">
                                      {STATUS_LABELS[it.status]}
                                    </span>
                                  );
                                }

                                return (
                                  <div
                                    key={it.id}
                                    className="bg-[#e8ebe6] rounded-[10px] p-3.5 flex flex-col gap-2 text-[13px] text-[#454745]"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-bold text-[#0e0f0c]">{it.serviceName}</span>
                                      {statusBadge}
                                    </div>

                                    <div className="text-[12px] text-[#6a6c6a]">
                                      {it.weightKg ? `${it.weightKg} kg` : ''}
                                      {it.garmentCount ? ` • ${it.garmentCount} pcs` : ''}
                                      {it.quantity && it.quantity > 1 ? ` • ${it.quantity} item` : ''}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-[#868685]/20 text-[11px]">
                                      <span className={`px-2.5 py-0.5 rounded-full ${
                                        it.ironingEmployee?.name
                                          ? 'bg-[#e2f6d5] text-[#163300] font-medium'
                                          : 'bg-[#ffffff] text-[#6a6c6a]'
                                      }`}>
                                        Petugas Setrika: <strong>{it.ironingEmployee?.name || 'Belum diambil'}</strong>
                                      </span>

                                      <span className={`px-2.5 py-0.5 rounded-full ${
                                        it.rackNumber
                                          ? 'bg-[#9fe870] text-[#163300] font-semibold'
                                          : 'bg-[#ffffff] text-[#6a6c6a]'
                                      }`}>
                                        Nomor Rak: <strong>{it.rackNumber || 'Belum di rak'}</strong>
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB: HISTORY PEMESANAN & BUKU KAS HARIAN KASIR */}
        {/* ============================================================== */}
        {activeTab === 'CASHIER_HISTORY' && (
          <section className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">
                  HISTORY PEMESANAN &amp; KAS HARIAN KASIR
                </h2>
                <p className="text-[14px] text-[#454745] mt-1">
                  Laporan pembukuan harian: Pemasukan Tunai (Cash) dikurangi Pengeluaran yang Disetujui menghasilkan uang fisik yang wajib ada di laci kasir.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadData()}
                className="text-[13px] font-medium bg-[#ffffff] border border-[#163300] text-[#163300] hover:bg-[#e2f6d5] px-4 py-2 rounded-full cursor-pointer transition-colors"
              >
                Refresh Data
              </button>
            </div>

            {/* Filter Interaktif Tanggal */}
            <div className="bg-[#ffffff] rounded-[10px] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-[14px] font-bold text-[#0e0f0c]">Tanggal Pembukuan:</span>
                <span className="text-[13px] bg-[#163300] text-[#9fe870] font-semibold px-3.5 py-1 rounded-full">
                  {singleDayHistory.formattedDate}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                <button
                  type="button"
                  onClick={setHistoryToToday}
                  className="bg-[#e8ebe6] hover:bg-[#e2f6d5] text-[#163300] px-4 py-1.5 rounded-full cursor-pointer transition-colors"
                >
                  Hari Ini
                </button>
                <button
                  type="button"
                  onClick={setHistoryToYesterday}
                  className="bg-[#e8ebe6] hover:bg-[#e2f6d5] text-[#163300] px-4 py-1.5 rounded-full cursor-pointer transition-colors"
                >
                  Kemarin
                </button>
                <input
                  type="date"
                  value={historySelectedDate}
                  onChange={(e) => setHistoryFromDateStr(e.target.value)}
                  className="bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-1.5 text-[13px] text-[#0e0f0c] cursor-pointer focus:outline-none focus:border-[#163300]"
                />
              </div>
            </div>

            {/* Konten Transaksi & Buku Kas untuk Tanggal Terpilih */}
            <div className="space-y-5">
              {/* Header Tanggal & Tombol Kirim ke Owner */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#ffffff] rounded-[10px] p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="text-[16px] font-bold text-[#0e0f0c]">
                    {singleDayHistory.formattedDate}
                  </span>
                  <span className="text-[12px] font-medium bg-[#e2f6d5] text-[#163300] px-3 py-1 rounded-full">
                    {singleDayHistory.orders.length} Transaksi
                  </span>
                </div>

                {/* Status & Tombol Setoran Kas ke Owner */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {currentSettlement ? (
                    <>
                      {currentSettlement.status === 'PENDING' && (
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-[12px] font-semibold bg-[#e2f6d5] text-[#163300] px-3.5 py-1.5 rounded-full">
                            Setoran {formatRupiah(currentSettlement.actualCash)}: Menunggu ACC Owner
                          </span>
                          {isOwner ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleDecideSettlement(currentSettlement.id, 'APPROVED')}
                                className="text-[13px] font-semibold bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] px-4 py-1.5 rounded-full cursor-pointer"
                              >
                                ACC Setoran
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSettlementRejectModalId(currentSettlement.id);
                                  setSettlementRejectNote('');
                                }}
                                className="text-[13px] font-semibold bg-[#cb272f] text-[#ffffff] px-4 py-1.5 rounded-full cursor-pointer"
                              >
                                Tolak
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                const curBranch = branches.find((b) => b.id === (user?.branchId || selectedBranchId)) || branches[0];
                                setCashHandoverModal({
                                  dateKey: singleDayHistory.dateKey,
                                  formattedDate: singleDayHistory.formattedDate,
                                  totalCashIn: singleDayHistory.totalCashIn,
                                  totalQrisIn: singleDayHistory.totalQrisIn,
                                  totalApprovedExpense: singleDayHistory.totalApprovedExpense,
                                  expectedCash: singleDayHistory.expectedCashInDrawer,
                                  enteredPhysicalCash: String(currentSettlement.actualCash),
                                  targetWhatsapp: curBranch?.whatsappNumber || '',
                                  notes: currentSettlement.cashierNotes || '',
                                });
                              }}
                              className="text-[13px] font-medium text-[#163300] underline underline-offset-4 cursor-pointer"
                            >
                              Ubah Pengajuan
                            </button>
                          )}
                        </div>
                      )}

                      {currentSettlement.status === 'APPROVED' && (
                        <span className="text-[12px] font-semibold bg-[#9fe870] text-[#163300] px-4 py-1.5 rounded-full">
                          Setoran {formatRupiah(currentSettlement.actualCash)} Disetujui ({currentSettlement.reviewedBy?.name || 'Owner'})
                        </span>
                      )}

                      {currentSettlement.status === 'REJECTED' && (
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-[12px] font-semibold bg-[#cb272f] text-[#ffffff] px-3.5 py-1.5 rounded-full">
                            Setoran Ditolak ({currentSettlement.reviewNotes || 'Tanpa catatan'})
                          </span>
                          {!isOwner && (
                            <button
                              type="button"
                              onClick={() => {
                                const curBranch = branches.find((b) => b.id === (user?.branchId || selectedBranchId)) || branches[0];
                                setCashHandoverModal({
                                  dateKey: singleDayHistory.dateKey,
                                  formattedDate: singleDayHistory.formattedDate,
                                  totalCashIn: singleDayHistory.totalCashIn,
                                  totalQrisIn: singleDayHistory.totalQrisIn,
                                  totalApprovedExpense: singleDayHistory.totalApprovedExpense,
                                  expectedCash: singleDayHistory.expectedCashInDrawer,
                                  enteredPhysicalCash: String(Math.max(0, singleDayHistory.expectedCashInDrawer)),
                                  targetWhatsapp: curBranch?.whatsappNumber || '',
                                  notes: '',
                                });
                              }}
                              className="bg-[#9fe870] text-[#163300] text-[13px] font-semibold px-4 py-1.5 rounded-full cursor-pointer"
                            >
                              Ajukan Ulang Setoran
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {!isOwner ? (
                        <button
                          type="button"
                          onClick={() => {
                            const curBranch = branches.find((b) => b.id === (user?.branchId || selectedBranchId)) || branches[0];
                            setCashHandoverModal({
                              dateKey: singleDayHistory.dateKey,
                              formattedDate: singleDayHistory.formattedDate,
                              totalCashIn: singleDayHistory.totalCashIn,
                              totalQrisIn: singleDayHistory.totalQrisIn,
                              totalApprovedExpense: singleDayHistory.totalApprovedExpense,
                              expectedCash: singleDayHistory.expectedCashInDrawer,
                              enteredPhysicalCash: String(Math.max(0, singleDayHistory.expectedCashInDrawer)),
                              targetWhatsapp: curBranch?.whatsappNumber || '',
                              notes: '',
                            });
                          }}
                          className="bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] text-[13px] font-semibold px-5 py-2 rounded-full cursor-pointer transition-colors"
                        >
                          Kirim Setoran ke Owner
                        </button>
                      ) : (
                        <span className="text-[12px] font-medium text-[#6a6c6a] bg-[#e8ebe6] px-3.5 py-1.5 rounded-full">
                          Belum ada setoran diajukan kasir
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 4 Kartu Metrik Ringkasan Paling Atas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Pemasukan Cash */}
                <div className="bg-[#ffffff] rounded-[10px] p-5">
                  <div className="text-[12px] font-semibold text-[#163300]">
                    Pemasukan Cash
                  </div>
                  <div className="text-[22px] font-bold text-[#0e0f0c] mt-1">
                    {formatRupiah(singleDayHistory.totalCashIn)}
                  </div>
                  <div className="text-[11px] text-[#6a6c6a] mt-1">
                    Uang tunai fisik diterima kasir
                  </div>
                </div>

                {/* 2. Total Pengeluaran Approved */}
                <div className="bg-[#ffffff] rounded-[10px] p-5">
                  <div className="text-[12px] font-semibold text-[#cb272f]">
                    Pengeluaran (Approved)
                  </div>
                  <div className="text-[22px] font-bold text-[#cb272f] mt-1">
                    -{formatRupiah(singleDayHistory.totalApprovedExpense)}
                  </div>
                  <div className="text-[11px] text-[#6a6c6a] mt-1">
                    {singleDayHistory.expenses.length} pengeluaran disetujui owner
                  </div>
                </div>

                {/* 3. UANG KASIR SEHARUSNYA — Forest Ink Dark Card */}
                <div className="bg-[#163300] text-[#ffffff] rounded-[10px] p-5 sm:col-span-2 lg:col-span-1">
                  <div className="text-[12px] font-medium text-[#9fe870]">
                    Uang Kasir Seharusnya
                  </div>
                  <div className="text-[22px] font-black text-[#ffffff] mt-1">
                    {formatRupiah(singleDayHistory.expectedCashInDrawer)}
                  </div>
                  <div className="text-[11px] text-[#e2f6d5] mt-1">
                    Cash In ({formatRupiah(singleDayHistory.totalCashIn)}) - Beban ({formatRupiah(singleDayHistory.totalApprovedExpense)})
                  </div>
                </div>

                {/* 4. Total Pemasukan QRIS */}
                <div className="bg-[#ffffff] rounded-[10px] p-5">
                  <div className="text-[12px] font-semibold text-[#0b4c72]">
                    Pemasukan QRIS
                  </div>
                  <div className="text-[22px] font-bold text-[#0e0f0c] mt-1">
                    {formatRupiah(singleDayHistory.totalQrisIn)}
                  </div>
                  <div className="text-[11px] text-[#6a6c6a] mt-1">
                    Non-tunai (langsung ke rekening toko)
                  </div>
                </div>
              </div>

              {/* Rincian Pesanan Laundry (Pemasukan) */}
              <div className="bg-[#ffffff] rounded-[10px] p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-[#e8ebe6] pb-3">
                  <span className="text-[13px] font-bold text-[#0e0f0c] uppercase">
                    Pesanan Laundry ({singleDayHistory.orders.length})
                  </span>
                  <span className="text-[13px] text-[#163300] font-semibold">
                    Total Omset: {formatRupiah(singleDayHistory.totalRevenue)}
                  </span>
                </div>

                {singleDayHistory.orders.length === 0 ? (
                  <div className="text-[13px] text-[#6a6c6a] py-6 text-center">
                    Tidak ada transaksi pesanan laundry pada tanggal {singleDayHistory.formattedDate}.
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead className="sticky top-0 bg-[#ffffff]">
                        <tr className="text-[#6a6c6a] border-b border-[#e8ebe6]">
                          <th className="py-2.5 font-semibold">Nota</th>
                          <th className="py-2.5 font-semibold">Waktu</th>
                          <th className="py-2.5 font-semibold">Pelanggan</th>
                          <th className="py-2.5 font-semibold">Metode Bayar</th>
                          <th className="py-2.5 font-semibold text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e8ebe6]">
                        {singleDayHistory.orders.map(({ order: o, method }) => {
                          return (
                            <tr key={o.id} className="hover:bg-[#e2f6d5]/40">
                              <td className="py-2.5 font-mono font-bold text-[#0e0f0c]">{o.orderNumber}</td>
                              <td className="py-2.5 text-[#6a6c6a]">
                                {new Date(o.receivedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="py-2.5 text-[#454745]">
                                <strong className="text-[#0e0f0c]">{o.customer?.name}</strong>{' '}
                                <span className="text-[#6a6c6a]">({o.customer?.phone})</span>
                              </td>
                              <td className="py-2.5">
                                <span
                                  className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                                    method === 'CASH'
                                      ? 'bg-[#e2f6d5] text-[#163300]'
                                      : 'bg-[#0b4c72] text-[#ffffff]'
                                  }`}
                                >
                                  {method === 'CASH' ? 'CASH' : 'QRIS'}
                                </span>
                              </td>
                              <td className="py-2.5 text-right font-bold text-[#0e0f0c]">
                                {formatRupiah(o.total)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Rincian Pengeluaran Disetujui (Approved) */}
              <div className="bg-[#ffffff] rounded-[10px] p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-[#e8ebe6] pb-3">
                  <span className="text-[13px] font-bold text-[#0e0f0c] uppercase">
                    Pengeluaran Disetujui ({singleDayHistory.expenses.length})
                  </span>
                  <span className="text-[13px] text-[#cb272f] font-semibold">
                    Total: -{formatRupiah(singleDayHistory.totalApprovedExpense)}
                  </span>
                </div>

                {singleDayHistory.expenses.length === 0 ? (
                  <div className="text-[13px] text-[#6a6c6a] py-4 text-center">
                    Tidak ada pengeluaran disetujui untuk kas tanggal ini.
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead className="sticky top-0 bg-[#ffffff]">
                        <tr className="text-[#6a6c6a] border-b border-[#e8ebe6]">
                          <th className="py-2.5 font-semibold">Kategori</th>
                          <th className="py-2.5 font-semibold">Keperluan</th>
                          <th className="py-2.5 font-semibold">Metode</th>
                          <th className="py-2.5 font-semibold">Disetujui Oleh</th>
                          <th className="py-2.5 font-semibold text-right">Nominal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e8ebe6]">
                        {singleDayHistory.expenses.map((ex) => (
                          <tr key={ex.id} className="hover:bg-[#e2f6d5]/40">
                            <td className="py-2.5 font-semibold text-[#0e0f0c]">{ex.category?.name}</td>
                            <td className="py-2.5 text-[#454745]">
                              {ex.description}
                              {ex.notes && <span className="text-[#6a6c6a] block text-[11px]">{ex.notes}</span>}
                            </td>
                            <td className="py-2.5 text-[#6a6c6a]">{ex.paymentMethod}</td>
                            <td className="py-2.5 text-[#163300] font-medium">
                              ✓ {ex.approvedBy?.name || 'Owner'}
                            </td>
                            <td className="py-2.5 text-right font-bold text-[#cb272f]">
                              -{formatRupiah(ex.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB: ANTREAN & MONITORING SETRIKA */}
        {/* ============================================================== */}
        {activeTab === 'IRONING_QUEUE' && (
          <section className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">
                {isOwner ? 'Monitoring Antrean Setrika' : 'Antrean Pekerjaan Setrika'}
              </h2>
              <p className="text-xs text-[#6a6c6a] mt-0.5">
                {isOwner
                  ? 'Super Owner dan Owner Cabang memantau status secara read-only.'
                  : 'Ambil antrean pakaian yang siap disetrika, kemudian tandai selesai.'}
              </p>
            </div>

            <div className="space-y-3">
              {ironingQueue.map((item) => {
                // Status mapping sesuai section 3.5 & 6.3:
                // 1. Belum diambil oleh pegawai
                // 2. Sedang diproses oleh [Nama Pegawai]
                // 3. Proses sudah diselesaikan oleh [Nama Pegawai]
                let ironingDisplayStatus = 'Belum diambil oleh pegawai';
                if (item.status === 'PROSES_SETRIKA' && item.ironingEmployee) {
                  ironingDisplayStatus = `Sedang diproses oleh ${item.ironingEmployee.name}`;
                } else if (item.status === 'SETRIKA_SELESAI' || item.status === 'SELESAI') {
                  ironingDisplayStatus = `Proses sudah diselesaikan oleh ${item.ironingEmployee?.name || 'Petugas'}`;
                }

                return (
                  <div
                    key={item.id}
                    className="bg-[#ffffff] rounded-[10px] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#0e0f0c] font-mono">{item.order?.orderNumber}</span>
                        <span
                          className={`text-xs font-semibold px-3 py-0.5 rounded-full ${
                            item.status === 'SETRIKA_SELESAI' || item.status === 'SELESAI'
                              ? 'bg-[#9fe870] text-[#163300]'
                              : item.status === 'PROSES_SETRIKA'
                                ? 'bg-[#163300] text-[#9fe870]'
                                : 'bg-[#e8ebe6] text-[#454745]'
                          }`}
                        >
                          {ironingDisplayStatus}
                        </span>
                      </div>
                      <div className="text-xs text-[#454745] mt-1.5">
                        Pelanggan: <strong className="text-[#0e0f0c]">{item.order?.customer?.name}</strong> • Layanan: {item.serviceName}
                      </div>
                      <div className="text-xs text-[#6a6c6a] mt-0.5">
                        Kuantitas: <strong className="text-[#0e0f0c]">{item.weightKg ? `${item.weightKg} kg` : `${item.quantity} pcs`}</strong>
                      </div>
                    </div>

                    {!isOwner && (
                      <div className="flex items-center gap-2">
                        {item.status !== 'PROSES_SETRIKA' && item.status !== 'SETRIKA_SELESAI' && item.status !== 'SELESAI' && (
                          <button
                            type="button"
                            onClick={() => void handleTransitionStatus(item.id, 'PROSES_SETRIKA')}
                            className="text-xs font-semibold bg-[#163300] text-[#ffffff] hover:bg-[#054d28] px-4 py-2 rounded-full cursor-pointer transition-colors"
                          >
                            Ambil Pekerjaan
                          </button>
                        )}
                        {item.status === 'PROSES_SETRIKA' && (
                          <button
                            type="button"
                            onClick={() => void handleTransitionStatus(item.id, 'SETRIKA_SELESAI')}
                            className="text-xs font-semibold bg-[#9fe870] text-[#163300] hover:bg-[#8ee05c] px-4 py-2 rounded-full cursor-pointer transition-colors"
                          >
                            Selesaikan Setrika
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB: PEGAWAI SETRIKA - PENGHASILAN BULAN INI (Section 6.1) */}
        {/* ============================================================== */}
        {activeTab === 'IRONING_EARNINGS' && ironingEarnings && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8">
              <div>
                <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">Penghasilan Setrika Anda</h2>
                <p className="text-xs text-[#6a6c6a] mt-0.5">
                  Dihitung otomatis berdasarkan berat/kuantitas pengerjaan × tarif per kg snapshot cabang.
                </p>
              </div>

              {/* Filter Bulan & Tahun + Download Excel */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={earningsMonth}
                  onChange={(e) => setEarningsMonth(Number(e.target.value))}
                  className="bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs font-semibold text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                >
                  {MONTH_NAMES.map((name, i) => (
                    <option key={i + 1} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  value={earningsYear}
                  onChange={(e) => setEarningsYear(Number(e.target.value))}
                  className="bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs font-semibold text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                >
                  {[2024, 2025, 2026, 2027].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!ironingEarnings || ironingEarnings.items.length === 0}
                  onClick={() => exportIroningRecapToExcel(ironingEarnings, user?.branch?.name)}
                  className="bg-[#163300] hover:bg-[#204702] text-[#ffffff] font-bold text-xs px-3.5 py-2 rounded-full cursor-pointer transition-colors inline-flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span>📊 Download Excel</span>
                </button>
              </div>
            </div>

            {/* Banner Status Pengajuan Terkini */}
            {ironingEarnings.latestPayout && ironingEarnings.latestPayout.status === 'APPROVED' && ironingEarnings.latestPayout.transferProof && (
              <div className="bg-[#163300] text-[#ffffff] rounded-[20px] p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="bg-[#9fe870] text-[#163300] text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full">
                      Lunas Ditransfer
                    </span>
                    <span className="font-bold text-sm text-[#e2f6d5]">
                      Upah Periode {MONTH_NAMES[earningsMonth - 1]} {earningsYear} Sudah Dibayar
                    </span>
                  </div>
                  <p className="text-xs text-[#e8ebe6]">
                    Sebesar <strong>{formatRupiah(ironingEarnings.latestPayout.amount)}</strong> telah ditransfer oleh <strong>{ironingEarnings.latestPayout.paidByName || 'Owner'}</strong> pada {ironingEarnings.latestPayout.paidAt ? new Date(ironingEarnings.latestPayout.paidAt).toLocaleString('id-ID') : '-'}. Saldo bulan ini telah direset.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIroningProofModalPayout(ironingEarnings.latestPayout as any)}
                  className="bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] font-bold text-xs px-4 py-2 rounded-full cursor-pointer transition-colors shrink-0 flex items-center gap-1.5"
                >
                  <span>Lihat Bukti Transfer</span>
                  <span>📎</span>
                </button>
              </div>
            )}

            {ironingEarnings.payoutStatus === 'PENDING' && (
              <div className="bg-[#fef9c3] border border-[#ca8a04] text-[#854d0e] rounded-[20px] p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-black text-sm flex items-center gap-2">
                    <span>⏳ Pengajuan Pencairan Upah Sedang Diproses</span>
                    <span className="bg-[#ca8a04] text-[#ffffff] text-[10px] font-bold px-2 py-0.5 rounded-full">
                      PENDING
                    </span>
                  </div>
                  <p className="text-xs">
                    Pengajuan upah sebesar <strong>{formatRupiah(ironingEarnings.latestPayout?.amount || ironingEarnings.pendingEarnings || 0)}</strong> sedang menunggu proses transfer dan verifikasi bukti transfer oleh Owner.
                  </p>
                </div>
              </div>
            )}

            {/* Ringkasan Gaji / Upah Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Card 1: Sisa Saldo Belum Dicairkan (Reset ke 0 saat dibayar) */}
              <div className="bg-[#163300] text-[#ffffff] rounded-[20px] p-6 flex flex-col justify-between">
                <div>
                  <div className="text-xs text-[#e8ebe6] font-medium">Sisa Upah Belum Dicairkan</div>
                  <div className="text-3xl font-black text-[#9fe870] mt-1 tracking-[-0.02em]">
                    {formatRupiah(ironingEarnings.unpaidEarnings ?? ironingEarnings.totalEarnings)}
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-[#204702] text-[11px] text-[#e2f6d5]">
                  {(ironingEarnings.unpaidEarnings ?? ironingEarnings.totalEarnings) === 0 ? (
                    <span className="text-[#9fe870] font-semibold">✓ Saldo telah direset / lunas</span>
                  ) : (
                    <span>{ironingEarnings.unpaidItemsCount ?? 0} cucian siap diajukan pencairannya</span>
                  )}
                </div>
              </div>

              {/* Card 2: Total Penghasilan Bulan Ini */}
              <div className="bg-[#e8ebe6] rounded-[20px] p-6 flex flex-col justify-between">
                <div>
                  <div className="text-xs text-[#6a6c6a] font-medium">
                    Total Pengerjaan Bulan {MONTH_NAMES[earningsMonth - 1]}
                  </div>
                  <div className="text-3xl font-black text-[#0e0f0c] mt-1 tracking-[-0.02em]">
                    {formatRupiah(ironingEarnings.monthTotalEarnings ?? ironingEarnings.totalEarnings)}
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-[#d8dcd5] text-[11px] text-[#454745]">
                  <span>{ironingEarnings.totalItems} Cucian • Sudah Dibayar: {formatRupiah(ironingEarnings.paidEarnings || 0)}</span>
                </div>
              </div>

              {/* Card 3: Aksi Pengajuan */}
              <div className="bg-[#f7f9f5] border border-[#d8dcd5] rounded-[20px] p-6 flex flex-col justify-between">
                <div>
                  <div className="text-xs text-[#6a6c6a] font-medium">Status Pencairan Upah</div>
                  <div className="font-bold text-[#0e0f0c] text-sm mt-1">
                    {ironingEarnings.canRequestPayout
                      ? 'Upah Siap Dicairkan'
                      : ironingEarnings.payoutStatus === 'PENDING'
                        ? 'Menunggu Transfer Owner'
                        : (ironingEarnings.paidEarnings || 0) > 0
                          ? 'Sudah Lunas Dibayar'
                          : 'Belum Ada Pengerjaan'}
                  </div>
                </div>
                <div className="mt-3">
                  {ironingEarnings.canRequestPayout ? (
                    <button
                      type="button"
                      onClick={() => setRequestPayoutModalOpen(true)}
                      className="w-full bg-[#163300] hover:bg-[#204702] text-[#ffffff] font-bold text-xs py-2.5 px-4 rounded-full transition-colors cursor-pointer text-center"
                    >
                      Ajukan Pencairan Upah
                    </button>
                  ) : ironingEarnings.latestPayout?.transferProof ? (
                    <button
                      type="button"
                      onClick={() => setIroningProofModalPayout(ironingEarnings.latestPayout as any)}
                      className="w-full bg-[#e2f6d5] border border-[#163300] text-[#163300] hover:bg-[#163300] hover:text-[#ffffff] font-bold text-xs py-2.5 px-4 rounded-full transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5"
                    >
                      <span>Lihat Bukti Transfer</span>
                      <span>📎</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-[#6a6c6a] italic block text-center">
                      Tidak ada upah yang dapat diajukan
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Tabel Rincian Pengerjaan */}
            <div className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-base text-[#0e0f0c]">Rincian Pekerjaan Diselesaikan</h3>
                <span className="text-xs text-[#6a6c6a] font-medium">
                  {ironingEarnings.items.length} Pekerjaan tercatat
                </span>
              </div>
              <div className="overflow-x-auto bg-[#ffffff] rounded-[10px] p-2">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#e8ebe6] text-[#163300] font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-3 rounded-l-[8px]">Waktu Selesai</th>
                      <th className="py-3 px-3">No. Nota</th>
                      <th className="py-3 px-3">Pelanggan</th>
                      <th className="py-3 px-3">Layanan</th>
                      <th className="py-3 px-3">Berat / Qty</th>
                      <th className="py-3 px-3">Tarif / Kg</th>
                      <th className="py-3 px-3 text-right">Upah Diterima</th>
                      <th className="py-3 px-3 text-center rounded-r-[8px]">Status Upah</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8ebe6]">
                    {ironingEarnings.items.map((it) => (
                      <tr key={it.id} className="hover:bg-[#e2f6d5]/40 transition-colors">
                        <td className="py-3 px-3 text-[#6a6c6a]">{new Date(it.completedAt).toLocaleString('id-ID')}</td>
                        <td className="py-3 px-3 font-mono font-bold text-[#0e0f0c]">{it.orderNumber}</td>
                        <td className="py-3 px-3 font-medium text-[#0e0f0c]">{it.customerName}</td>
                        <td className="py-3 px-3 text-[#454745]">{it.serviceName}</td>
                        <td className="py-3 px-3 text-[#454745]">{it.weightKg ? `${it.weightKg} kg` : `${it.quantity} pcs`}</td>
                        <td className="py-3 px-3 font-semibold text-[#0e0f0c]">{formatRupiah(it.ironingRate)}</td>
                        <td className="py-3 px-3 text-right font-bold text-[#163300]">
                          {formatRupiah(it.ironingWage)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {it.isPaid ? (
                            <span className="bg-[#e2f6d5] text-[#163300] text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase">
                              Lunas
                            </span>
                          ) : it.isPending ? (
                            <span className="bg-[#fef9c3] text-[#854d0e] text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase">
                              Pending
                            </span>
                          ) : (
                            <span className="bg-[#e8ebe6] text-[#454745] text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase">
                              Belum Dicairkan
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {ironingEarnings.items.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-[#6a6c6a]">
                          Belum ada pengerjaan setrika yang selesai pada bulan ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {ironingEarnings.items.length > 0 && (
                    <tfoot className="border-t-2 border-[#163300] bg-[#f7f9f5] font-bold text-xs text-[#0e0f0c]">
                      <tr>
                        <td colSpan={4} className="py-3 px-3 text-right uppercase tracking-wider text-[#163300]">
                          TOTAL KESELURUHAN ({ironingEarnings.items.length} CUCIAN):
                        </td>
                        <td className="py-3 px-3 font-bold text-[#163300]">
                          {ironingEarnings.totalWeightKg ?? 0} kg
                        </td>
                        <td className="py-3 px-3"></td>
                        <td className="py-3 px-3 text-right font-black text-[#163300] text-sm">
                          {formatRupiah(ironingEarnings.monthTotalEarnings ?? ironingEarnings.totalEarnings)}
                        </td>
                        <td className="py-3 px-3 text-center text-[10px]">
                          <span className="text-[#163300]">Lunas: {formatRupiah(ironingEarnings.paidEarnings || 0)}</span>
                          <br />
                          <span className="text-[#854d0e]">Sisa: {formatRupiah(ironingEarnings.unpaidEarnings || 0)}</span>
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Riwayat Pengajuan Pencairan Upah Pegawai */}
            <StaffIroningPayoutHistorySection
              onViewProof={(p) => setIroningProofModalPayout(p)}
            />
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB: PEGAWAI SETRIKA - HISTORY SETRIKA (Section 6.2) */}
        {/* ============================================================== */}
        {activeTab === 'IRONING_HISTORY' && (
          <section className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">Riwayat Pengerjaan Setrika</h2>
                <p className="text-xs text-[#6a6c6a] mt-0.5">
                  Daftar seluruh pekerjaan yang pernah Anda ambil dan selesaikan.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Cari nota, customer, HP..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs text-[#0e0f0c] w-48 focus:outline-none focus:border-[#163300]"
                />
                <input
                  type="date"
                  value={historyFromDate}
                  onChange={(e) => setHistoryFromDate(e.target.value)}
                  className="bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                />
                <input
                  type="date"
                  value={historyToDate}
                  onChange={(e) => setHistoryToDate(e.target.value)}
                  className="bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                />
              </div>
            </div>

            <div className="overflow-x-auto bg-[#ffffff] rounded-[10px] p-2">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#e8ebe6] text-[#163300] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-3 rounded-l-[8px]">No. Nota</th>
                    <th className="py-3 px-3">Pelanggan</th>
                    <th className="py-3 px-3">Layanan</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Mulai</th>
                    <th className="py-3 px-3">Selesai</th>
                    <th className="py-3 px-3">Berat / Qty</th>
                    <th className="py-3 px-3">Tarif</th>
                    <th className="py-3 px-3 text-right rounded-r-[8px]">Upah</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8ebe6]">
                  {ironingHistory.map((it) => (
                    <tr key={it.id} className="hover:bg-[#e2f6d5]/40 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-[#0e0f0c]">{it.orderNumber}</td>
                      <td className="py-3 px-3 text-[#0e0f0c]">
                        {it.customerName} {it.customerPhone && <span className="text-[#6a6c6a]">({it.customerPhone})</span>}
                      </td>
                      <td className="py-3 px-3 text-[#454745]">{it.serviceName}</td>
                      <td className="py-3 px-3">
                        <span className="text-[11px] font-semibold bg-[#e2f6d5] text-[#163300] px-2.5 py-0.5 rounded-full">
                          {STATUS_LABELS[it.status]}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[#6a6c6a]">{it.startedAt ? new Date(it.startedAt).toLocaleTimeString('id-ID') : '-'}</td>
                      <td className="py-3 px-3 text-[#6a6c6a]">{it.completedAt ? new Date(it.completedAt).toLocaleTimeString('id-ID') : '-'}</td>
                      <td className="py-3 px-3 text-[#454745]">{it.weightKg ? `${it.weightKg} kg` : `${it.quantity} pcs`}</td>
                      <td className="py-3 px-3 text-[#454745]">{formatRupiah(it.ironingRate)}</td>
                      <td className="py-3 px-3 text-right font-bold text-[#163300]">
                        {it.completedAt ? formatRupiah(it.ironingWage) : '-'}
                      </td>
                    </tr>
                  ))}
                  {ironingHistory.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-[#6a6c6a]">
                        Tidak ada riwayat setrika yang sesuai kriteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB: BAGIAN CUCI & MONITORING RAK */}
        {/* ============================================================== */}
        {activeTab === 'WASHING_QUEUE' && (
          <section className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">
                {isOwner ? 'Monitoring Cuci & Rak' : 'Bagian Cuci & Penyelesaian Rak'}
              </h2>
              <p className="text-xs text-[#6a6c6a] mt-0.5">
                {isOwner
                  ? 'Status membedakan: menunggu proses setrika, setrika selesai belum di rak, dan sudah disimpan di rak beserta kode rak.'
                  : 'Proses tahap pencucian dan input kode rak.'}
              </p>
            </div>

            <div className="space-y-3">
              {washingQueue.map((item) => {
                // Section 3.6: Status cuci & input rak ringkas:
                // - Menunggu proses setrika selesai
                // - Setrika selesai tetapi belum disimpan ke rak
                // - Sudah disimpan di rak (contoh: Rak 40)
                let rackMonitoringLabel = 'Sedang proses pencucian';
                if (item.status === 'PROSES_SETRIKA') {
                  rackMonitoringLabel = 'Menunggu proses setrika selesai';
                } else if (item.status === 'SETRIKA_SELESAI' && !item.rackNumber) {
                  rackMonitoringLabel = 'Setrika selesai, belum disimpan ke rak';
                } else if (item.rackNumber) {
                  rackMonitoringLabel = `Sudah disimpan di Rak ${item.rackNumber}`;
                }

                return (
                  <div
                    key={item.id}
                    className="bg-[#ffffff] rounded-[10px] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#0e0f0c] font-mono">{item.order?.orderNumber}</span>
                        <span
                          className={`text-xs font-semibold px-3 py-0.5 rounded-full ${
                            item.rackNumber
                              ? 'bg-[#9fe870] text-[#163300]'
                              : 'bg-[#e8ebe6] text-[#454745]'
                          }`}
                        >
                          {rackMonitoringLabel}
                        </span>
                      </div>
                      <div className="text-xs text-[#454745] mt-1.5">
                        Pelanggan: <strong className="text-[#0e0f0c]">{item.order?.customer?.name}</strong> • Layanan: {item.serviceName}
                      </div>
                      <div className="text-xs text-[#6a6c6a] mt-0.5">
                        Workflow: <strong className="text-[#163300]">{WORKFLOW_LABELS[item.workflow]}</strong>
                      </div>
                    </div>

                    {!isOwner && (
                      <div className="flex flex-wrap items-center gap-2">
                        {item.status === 'PROSES_CUCI' && item.workflow === 'WASH_IRON' && (
                          <span className="text-xs text-[#163300] font-semibold bg-[#e2f6d5] px-3 py-1 rounded-full">
                            Siap untuk antrean setrika
                          </span>
                        )}
                        {(item.status === 'SETRIKA_SELESAI' || (item.workflow === 'WASH_DRY' && item.status === 'PROSES_CUCI')) && (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              placeholder="Nomor Rak"
                              value={rackInputs[item.id] || ''}
                              onChange={(e) =>
                                setRackInputs((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                              className="bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-1.5 text-xs w-28 font-semibold text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                            />
                            <button
                              type="button"
                              onClick={() => void handleAssignRackAndComplete(item.id)}
                              className="text-xs font-semibold bg-[#9fe870] text-[#163300] hover:bg-[#8ee05c] px-4 py-1.5 rounded-full cursor-pointer transition-colors"
                            >
                              Selesai di Rak
                            </button>
                            {item.status === 'SETRIKA_SELESAI' && item.order?.id && (
                              <button
                                type="button"
                                onClick={() => void handlePickupOrder(item.order!.id)}
                                className="text-xs font-semibold bg-[#163300] text-[#9fe870] hover:bg-[#054d28] px-4 py-1.5 rounded-full cursor-pointer transition-colors"
                              >
                                Ambil Langsung (Tanpa Rak)
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB: OWNER & SUPER OWNER - LAPORAN KEUANGAN (Section 3.7 & 4.5) */}
        {/* ============================================================== */}
        {activeTab === 'OWNER_REPORTS' && report && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8">
              <div>
                <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">
                  {isSuperOwner ? 'Laporan Keuangan Multi-Cabang' : `Laporan Keuangan (${user.branch?.name || 'Cabang'})`}
                </h2>
                <p className="text-xs text-[#6a6c6a] mt-0.5">
                  Laba bersih = Pemasukan tercatat dikurangi pengeluaran yang telah disetujui.
                </p>
              </div>

              {/* Filter Bulan & Tahun */}
              <div className="flex items-center gap-2">
                <select
                  value={reportMonth}
                  onChange={(e) => setReportMonth(Number(e.target.value))}
                  className="bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs font-semibold text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                >
                  {MONTH_NAMES.map((name, i) => (
                    <option key={i + 1} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
                <select
                  value={reportYear}
                  onChange={(e) => setReportYear(Number(e.target.value))}
                  className="bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs font-semibold text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                >
                  {[2024, 2025, 2026, 2027].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Ringkasan Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-[#e8ebe6] rounded-[10px] p-5">
                <div className="text-xs text-[#6a6c6a]">Pemasukan Sukses</div>
                <div className="text-2xl font-black text-[#163300] mt-1 tracking-[-0.02em]">
                  {formatRupiah(report.financials.totalPaymentsCollected)}
                </div>
              </div>
              <div className="bg-[#e8ebe6] rounded-[10px] p-5">
                <div className="text-xs text-[#6a6c6a]">Pengeluaran Disetujui</div>
                <div className="text-2xl font-black text-[#cb272f] mt-1 tracking-[-0.02em]">
                  {formatRupiah(report.financials.totalExpenses)}
                </div>
              </div>
              <div className="bg-[#163300] text-[#ffffff] rounded-[10px] p-5">
                <div className="text-xs text-[#e8ebe6]">Laba Bersih (Selisih)</div>
                <div className="text-2xl font-black text-[#9fe870] mt-1 tracking-[-0.02em]">
                  {formatRupiah(report.financials.netCashflow)}
                </div>
              </div>
              <div className="bg-[#e8ebe6] rounded-[10px] p-5">
                <div className="text-xs text-[#6a6c6a]">Jumlah Pesanan</div>
                <div className="text-2xl font-black text-[#0e0f0c] mt-1 tracking-[-0.02em]">
                  {report.financials.orderCount} Nota
                </div>
              </div>
              <div className="bg-[#e8ebe6] rounded-[10px] p-5">
                <div className="text-xs text-[#6a6c6a]">Transaksi Rata-Rata</div>
                <div className="text-2xl font-black text-[#0e0f0c] mt-1 tracking-[-0.02em]">
                  {formatRupiah(report.financials.averageTransactionValue || 0)}
                </div>
              </div>
            </div>

            {/* Grafik Visual Pemasukan vs Pengeluaran */}
            <div className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-4">
              <h3 className="font-bold text-base text-[#0e0f0c]">Perbandingan Pemasukan vs Pengeluaran</h3>
              <div className="bg-[#ffffff] rounded-[10px] p-5 space-y-4">
                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1.5">
                    <span className="text-[#163300]">Pemasukan ({formatRupiah(report.financials.totalPaymentsCollected)})</span>
                    <span className="text-[#0e0f0c]">100%</span>
                  </div>
                  <div className="w-full bg-[#e8ebe6] rounded-full h-3">
                    <div className="bg-[#163300] h-3 rounded-full w-full"></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1.5">
                    <span className="text-[#cb272f]">Pengeluaran Disetujui ({formatRupiah(report.financials.totalExpenses)})</span>
                    <span className="text-[#0e0f0c]">
                      {report.financials.totalPaymentsCollected > 0
                        ? `${Math.round((report.financials.totalExpenses / report.financials.totalPaymentsCollected) * 100)}%`
                        : '0%'}
                    </span>
                  </div>
                  <div className="w-full bg-[#e8ebe6] rounded-full h-3">
                    <div
                      className="bg-[#cb272f] h-3 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          report.financials.totalPaymentsCollected > 0
                            ? (report.financials.totalExpenses / report.financials.totalPaymentsCollected) * 100
                            : 0,
                        )}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabel Ringkas Per Cabang (Super Owner Comparison) */}
            {isSuperOwner && report.branchComparison && report.branchComparison.length > 0 && (
              <div className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-4">
                <h3 className="font-bold text-base text-[#0e0f0c]">Performa Antar-Cabang ({MONTH_NAMES[reportMonth - 1]} {reportYear})</h3>
                <div className="overflow-x-auto bg-[#ffffff] rounded-[10px] p-2">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#e8ebe6] text-[#163300] font-semibold uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-3 rounded-l-[8px]">Cabang</th>
                        <th className="py-3 px-3">Kode</th>
                        <th className="py-3 px-3">Pesanan</th>
                        <th className="py-3 px-3">Pemasukan</th>
                        <th className="py-3 px-3">Pengeluaran</th>
                        <th className="py-3 px-3 text-right rounded-r-[8px]">Laba Bersih</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e8ebe6]">
                      {report.branchComparison.map((bc) => (
                        <tr key={bc.branchId} className="hover:bg-[#e2f6d5]/40 transition-colors">
                          <td className="py-3 px-3 font-bold text-[#0e0f0c]">{bc.branchName}</td>
                          <td className="py-3 px-3 font-mono text-[#6a6c6a]">{bc.branchCode}</td>
                          <td className="py-3 px-3 text-[#454745]">{bc.orderCount} Nota</td>
                          <td className="py-3 px-3 font-semibold text-[#163300]">{formatRupiah(bc.totalPayments)}</td>
                          <td className="py-3 px-3 font-semibold text-[#cb272f]">{formatRupiah(bc.totalExpenses)}</td>
                          <td className="py-3 px-3 text-right font-black text-[#0e0f0c]">{formatRupiah(bc.netCashflow)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB: OWNER & SUPER OWNER - MASTER LAYANAN & DISKON (Section 3.8 & 4.6) */}
        {/* ============================================================== */}
        {activeTab === 'OWNER_SERVICES' && (
          <section className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">Master Layanan, Minimal KG &amp; Pihak Ke-3</h2>
                <p className="text-xs text-[#6a6c6a] mt-0.5">
                  Atur minimal KG per layanan (opsional per cabang) serta tambahkan layanan Cuci Sepatu atau Dry Clean dengan mitra pihak ketiga.
                </p>
              </div>
              <button
                type="button"
                onClick={openCreateServiceModal}
                className="bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] font-semibold text-xs px-5 py-2.5 rounded-full cursor-pointer transition-colors"
              >
                + Tambah Layanan Baru
              </button>
            </div>

            <div className="space-y-3">
              {services.map((s) => (
                <div
                  key={s.id}
                  className={`rounded-[10px] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 transition-colors ${
                    s.isActive ? 'bg-[#ffffff]' : 'bg-[#ffffff]/60 opacity-60'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-[#0e0f0c]">{s.name}</span>
                      <span className="text-[11px] font-semibold bg-[#e8ebe6] px-2.5 py-0.5 rounded-full text-[#454745]">
                        {WORKFLOW_LABELS[s.workflow]} • {s.priceUnit}
                      </span>
                      {s.branch ? (
                        <span className="text-[11px] bg-[#e2f6d5] text-[#163300] font-semibold px-2.5 py-0.5 rounded-full">
                          {s.branch.name}
                        </span>
                      ) : (
                        <span className="text-[11px] bg-[#e8ebe6] text-[#454745] font-semibold px-2.5 py-0.5 rounded-full">
                          Semua Cabang
                        </span>
                      )}
                      {s.isThirdParty && (
                        <span className="text-[11px] bg-[#163300] text-[#9fe870] font-semibold px-2.5 py-0.5 rounded-full">
                          Mitra Pihak Ke-3{s.thirdPartyPartner ? `: ${s.thirdPartyPartner}` : ''}
                        </span>
                      )}
                      {!s.isActive && (
                        <span className="text-[11px] bg-[#cb272f] text-[#ffffff] font-semibold px-2.5 py-0.5 rounded-full">
                          NONAKTIF
                        </span>
                      )}
                    </div>
                    {s.description && <div className="text-xs text-[#6a6c6a]">{s.description}</div>}
                    <div className="text-xs text-[#454745] flex flex-wrap items-center gap-3 pt-0.5">
                      <span>Harga: <strong className="text-[#0e0f0c]">{formatRupiah(s.price)}</strong></span>
                      {s.priceUnit === 'KG' && (
                        <span className="text-[#163300] font-semibold">
                          Min. KG: {s.minWeightKg && Number(s.minWeightKg) > 0 ? `${s.minWeightKg} kg` : 'Ikut Default Cabang / Tanpa Min'}
                        </span>
                      )}
                      {s.discountActive && s.discountType !== 'NONE' ? (
                        <span className="bg-[#9fe870] text-[#163300] text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                          Diskon: {s.discountType === 'PERCENTAGE' ? `${s.discountValue}%` : formatRupiah(s.discountValue || 0)}
                        </span>
                      ) : (
                        <span className="text-[#868685]">Tidak ada diskon</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditServiceModal(s)}
                      className="text-xs font-medium bg-[#ffffff] border border-[#163300] text-[#163300] hover:bg-[#e2f6d5] px-4 py-1.5 rounded-full cursor-pointer transition-colors"
                    >
                      Edit Lengkap
                    </button>
                    {s.isActive && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteService(s)}
                        className="text-xs font-semibold bg-[#cb272f] text-[#ffffff] hover:opacity-90 px-4 py-1.5 rounded-full cursor-pointer transition-opacity"
                      >
                        Nonaktifkan
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Tambah / Edit Layanan */}
            {svcModalOpen && (
              <div className="fixed inset-0 z-50 bg-[#0e0f0c]/60 flex items-center justify-center p-4">
                <form
                  onSubmit={handleSaveService}
                  className="bg-[#ffffff] rounded-[28px] max-w-lg w-full p-6 sm:p-8 space-y-4 border border-[#e8ebe6] max-h-[90vh] overflow-y-auto"
                >
                  <div className="flex items-center justify-between border-b border-[#e8ebe6] pb-3">
                    <h3 className="font-black text-lg text-[#0e0f0c] uppercase tracking-[-0.02em]">
                      {editingSvcId ? 'Edit Layanan & Diskon' : 'Tambah Layanan Baru'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setSvcModalOpen(false)}
                      className="text-[#6a6c6a] hover:text-[#0e0f0c] font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  {!editingSvcId && (
                    <div className="bg-[#e2f6d5] rounded-[10px] p-3 space-y-2">
                      <div className="text-[11px] font-bold text-[#163300]">
                        Template Cepat Layanan Pihak Ke-3 (Opsional):
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => applyThirdPartyPreset('SHOE')}
                          className="text-xs font-semibold bg-[#163300] text-[#9fe870] hover:bg-[#054d28] px-3 py-1.5 rounded-full cursor-pointer transition-colors"
                        >
                          + Isi Preset Cuci Sepatu (Pihak Ke-3)
                        </button>
                        <button
                          type="button"
                          onClick={() => applyThirdPartyPreset('DRYCLEAN')}
                          className="text-xs font-semibold bg-[#163300] text-[#9fe870] hover:bg-[#054d28] px-3 py-1.5 rounded-full cursor-pointer transition-colors"
                        >
                          + Isi Preset Dry Clean (Pihak Ke-3)
                        </button>
                      </div>
                    </div>
                  )}

                  {isSuperOwner && (
                    <div>
                      <label className="block text-xs font-semibold text-[#0e0f0c] mb-1">Berlaku Untuk Cabang</label>
                      <select
                        value={svcFormBranchId}
                        onChange={(e) => setSvcFormBranchId(e.target.value)}
                        className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-sm text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                      >
                        <option value="">Semua Cabang (Katalog Global)</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            Khusus {b.name} ({b.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-[#0e0f0c] mb-1">Nama Layanan *</label>
                    <input
                      type="text"
                      required
                      value={svcFormName}
                      onChange={(e) => setSvcFormName(e.target.value)}
                      placeholder="Contoh: Cuci Kering Setrika / Cuci Sepatu"
                      className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-sm text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#0e0f0c] mb-1">Deskripsi Layanan (Opsional)</label>
                    <input
                      type="text"
                      value={svcFormDesc}
                      onChange={(e) => setSvcFormDesc(e.target.value)}
                      placeholder="Keterangan singkat pengerjaan layanan..."
                      className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-xs text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#0e0f0c] mb-1">Workflow *</label>
                      <select
                        value={svcFormWorkflow}
                        onChange={(e) => setSvcFormWorkflow(e.target.value as WorkflowCode)}
                        className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-sm text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                      >
                        {Object.entries(WORKFLOW_LABELS).map(([code, label]) => (
                          <option key={code} value={code}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#0e0f0c] mb-1">Satuan Harga *</label>
                      <select
                        value={svcFormUnit}
                        onChange={(e) => setSvcFormUnit(e.target.value as PriceUnit)}
                        className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-sm text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                      >
                        <option value="KG">Per KG (Kilogram)</option>
                        <option value="ITEM">Per Satuan (Item)</option>
                        <option value="FLAT">Flat / Paket</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#0e0f0c] mb-1">Harga Satuan (Rp) *</label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={svcFormPrice}
                        onChange={(e) => setSvcFormPrice(e.target.value)}
                        placeholder="7000"
                        className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-sm text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#0e0f0c] mb-1">Min. KG (Opsional)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        disabled={svcFormUnit !== 'KG'}
                        value={svcFormMinWeight}
                        onChange={(e) => setSvcFormMinWeight(e.target.value)}
                        placeholder="Kosong = ikut cabang"
                        className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-sm text-[#0e0f0c] focus:outline-none focus:border-[#163300] disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#0e0f0c] mb-1">Estimasi (Jam)</label>
                      <input
                        type="number"
                        min="1"
                        value={svcFormDuration}
                        onChange={(e) => setSvcFormDuration(e.target.value)}
                        placeholder="48"
                        className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-sm text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                      />
                    </div>
                  </div>

                  {/* Mitra Pihak Ketiga (Cuci Sepatu / Dry Clean) */}
                  <div className="bg-[#e8ebe6] rounded-[10px] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-[#0e0f0c]">Kerjasama Mitra Pihak Ke-3 (Sepatu / Dry Clean)</label>
                      <label className="flex items-center gap-1.5 text-xs text-[#163300] font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={svcFormIsThirdParty}
                          onChange={(e) => setSvcFormIsThirdParty(e.target.checked)}
                          className="rounded accent-[#163300]"
                        />
                        Layanan Pihak Ke-3
                      </label>
                    </div>
                    {svcFormIsThirdParty && (
                      <div>
                        <label className="block text-[11px] font-semibold text-[#454745] mb-1">
                          Nama Mitra / Vendor Pihak Ke-3
                        </label>
                        <input
                          type="text"
                          value={svcFormThirdPartyPartner}
                          onChange={(e) => setSvcFormThirdPartyPartner(e.target.value)}
                          placeholder="Contoh: SneakerLab Surabaya / Mitra DryClean"
                          className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs text-[#0e0f0c]"
                        />
                      </div>
                    )}
                  </div>

                  {/* Pengaturan Diskon Cabang (Section 3.8) */}
                  <div className="bg-[#e8ebe6] rounded-[10px] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-[#0e0f0c]">Pengaturan Diskon Layanan</label>
                      <label className="flex items-center gap-1.5 text-xs text-[#163300] font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={svcFormDiscountActive}
                          onChange={(e) => setSvcFormDiscountActive(e.target.checked)}
                          className="rounded accent-[#163300]"
                        />
                        Aktifkan Diskon
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#454745] mb-1">Tipe Diskon</label>
                        <select
                          disabled={!svcFormDiscountActive}
                          value={svcFormDiscountType}
                          onChange={(e) => setSvcFormDiscountType(e.target.value as any)}
                          className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-2.5 py-2 text-xs text-[#0e0f0c] disabled:opacity-50"
                        >
                          <option value="NONE">Tidak Ada Diskon</option>
                          <option value="PERCENTAGE">Persentase (%)</option>
                          <option value="FIXED">Potongan Tetap (Rp)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#454745] mb-1">Nilai Diskon</label>
                        <input
                          type="number"
                          min="0"
                          disabled={!svcFormDiscountActive}
                          value={svcFormDiscountValue}
                          onChange={(e) => setSvcFormDiscountValue(e.target.value)}
                          placeholder={svcFormDiscountType === 'PERCENTAGE' ? '10' : '5000'}
                          className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-2.5 py-2 text-xs text-[#0e0f0c] disabled:opacity-50"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setSvcModalOpen(false)}
                      className="text-xs font-medium px-5 py-2.5 border border-[#163300] text-[#163300] rounded-full hover:bg-[#e2f6d5] cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="text-xs font-semibold bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] px-6 py-2.5 rounded-full cursor-pointer transition-colors"
                    >
                      Simpan Layanan
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB: OWNER & SUPER OWNER - PERSETUJUAN SETORAN KAS KASIR */}
        {/* ============================================================== */}
        {activeTab === 'OWNER_SETTLEMENTS' && (
          <section className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">
                  {isSuperOwner ? 'Persetujuan Setoran Kas Kasir (Semua Cabang)' : 'Persetujuan Setoran Kas Kasir'}
                </h2>
                <p className="text-xs text-[#6a6c6a] mt-0.5">
                  Verifikasi dan setujui (ACC) atau tolak uang fisik yang diserahkan kasir dari operasional harian cabang.
                </p>
              </div>

              {/* Filter Status Setoran */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#454745]">Status:</span>
                <select
                  value={settlementFilterStatus}
                  onChange={(e) => setSettlementFilterStatus(e.target.value)}
                  className="bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs font-semibold text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="PENDING">Menunggu ACC (Pending)</option>
                  <option value="APPROVED">Disetujui (Approved)</option>
                  <option value="REJECTED">Ditolak (Rejected)</option>
                </select>
              </div>
            </div>

            {/* List of settlements */}
            {settlementsList.length === 0 ? (
              <div className="bg-[#ffffff] rounded-[10px] text-center py-12 text-[#6a6c6a] text-sm">
                Belum ada data setoran kas kasir untuk kriteria ini.
              </div>
            ) : (
              <div className="space-y-4">
                {settlementsList.map((cs) => {
                  const isPending = cs.status === 'PENDING';
                  const isApproved = cs.status === 'APPROVED';
                  const isRejected = cs.status === 'REJECTED';

                  return (
                    <div
                      key={cs.id}
                      className="bg-[#ffffff] rounded-[10px] p-5 space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8ebe6] pb-3">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="font-bold text-base text-[#0e0f0c]">
                            {new Date(cs.settlementDate + 'T00:00:00').toLocaleDateString('id-ID', {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </span>
                          {cs.branch && (
                            <span className="text-[11px] bg-[#e2f6d5] text-[#163300] font-semibold px-3 py-0.5 rounded-full">
                              {cs.branch.name}
                            </span>
                          )}
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`text-xs font-semibold px-3.5 py-1 rounded-full ${
                            isApproved
                              ? 'bg-[#9fe870] text-[#163300]'
                              : isRejected
                                ? 'bg-[#cb272f] text-[#ffffff]'
                                : 'bg-[#163300] text-[#9fe870]'
                          }`}
                        >
                          {isApproved
                            ? 'Disetujui (ACC)'
                            : isRejected
                              ? 'Ditolak'
                              : 'Menunggu ACC Owner'}
                        </span>
                      </div>

                      {/* Info Kasir & Rincian Uang */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        <div className="bg-[#e8ebe6]/60 rounded-[10px] p-3.5">
                          <div className="text-[#6a6c6a] text-[11px] font-semibold">Kasir Penyerah</div>
                          <div className="font-bold text-[#0e0f0c] text-sm mt-0.5">{cs.cashier?.name}</div>
                          <div className="text-[11px] text-[#6a6c6a] mt-0.5">
                            Diajukan: {new Date(cs.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                          </div>
                        </div>

                        <div className="bg-[#e8ebe6]/60 rounded-[10px] p-3.5">
                          <div className="text-[#6a6c6a] text-[11px] font-semibold">Uang Kasir Seharusnya</div>
                          <div className="font-bold text-[#0e0f0c] text-sm mt-0.5">
                            {formatRupiah(cs.expectedCash)}
                          </div>
                          <div className="text-[11px] text-[#6a6c6a] mt-0.5">
                            Cash In ({formatRupiah(cs.totalCashIn)}) - Beban ({formatRupiah(cs.totalApprovedExpense)})
                          </div>
                        </div>

                        <div className="bg-[#163300] text-[#ffffff] rounded-[10px] p-3.5">
                          <div className="text-[#9fe870] text-[11px] font-bold uppercase tracking-wider">
                            Fisik Uang Diserahkan
                          </div>
                          <div className="font-black text-[#ffffff] text-base mt-0.5">
                            {formatRupiah(cs.actualCash)}
                          </div>
                          <div className="text-[11px] mt-0.5">
                            {cs.difference === 0 ? (
                              <span className="text-[#9fe870] font-semibold">Sesuai / Pas (Rp 0)</span>
                            ) : cs.difference > 0 ? (
                              <span className="text-[#9fe870] font-semibold">Lebih: +{formatRupiah(cs.difference)}</span>
                            ) : (
                              <span className="text-[#cb272f] bg-[#ffffff] px-1.5 py-0.5 rounded font-bold">
                                Kurang: -{formatRupiah(Math.abs(cs.difference))}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="bg-[#e8ebe6]/60 rounded-[10px] p-3.5">
                          <div className="text-[#6a6c6a] text-[11px] font-semibold">Pemasukan QRIS</div>
                          <div className="font-bold text-[#0b4c72] text-sm mt-0.5">
                            {formatRupiah(cs.totalQrisIn)}
                          </div>
                          <div className="text-[11px] text-[#6a6c6a] mt-0.5">Masuk langsung ke rekening</div>
                        </div>
                      </div>

                      {/* Catatan Kasir / Catatan Review */}
                      {cs.cashierNotes && (
                        <div className="text-xs bg-[#e2f6d5] rounded-[10px] p-3 text-[#163300]">
                          <span className="font-bold">Catatan Kasir:</span> {cs.cashierNotes}
                        </div>
                      )}

                      {cs.reviewedBy && (
                        <div className="text-xs text-[#6a6c6a] pt-1">
                          Diproses oleh: <strong className="text-[#0e0f0c]">{cs.reviewedBy.name}</strong> pada{' '}
                          {cs.reviewedAt ? new Date(cs.reviewedAt).toLocaleString('id-ID') : '-'}
                          {cs.reviewNotes && (
                            <span className="block text-[#cb272f] font-semibold mt-0.5">
                              Catatan Owner: {cs.reviewNotes}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Aksi ACC / Tolak jika PENDING */}
                      {isPending && (
                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e8ebe6]">
                          <button
                            type="button"
                            onClick={() => {
                              setSettlementRejectModalId(cs.id);
                              setSettlementRejectNote('');
                            }}
                            className="bg-[#cb272f] text-[#ffffff] hover:opacity-90 text-xs font-semibold px-4 py-2 rounded-full cursor-pointer transition-opacity"
                          >
                            Tolak Setoran
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDecideSettlement(cs.id, 'APPROVED')}
                            className="bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] text-xs font-semibold px-5 py-2 rounded-full cursor-pointer transition-colors"
                          >
                            ACC / Setujui Setoran
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB: OWNER & SUPER OWNER - PERSETUJUAN PENGELUARAN (Section 3.2 & 4.2) */}
        {/* ============================================================== */}
        {activeTab === 'OWNER_EXPENSES' && (
          <section className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">Persetujuan Pengeluaran Operasional</h2>
                <p className="text-xs text-[#6a6c6a] mt-0.5">
                  {isSuperOwner
                    ? 'Super Owner dapat menyetujui seluruh pengajuan pengeluaran dari semua cabang.'
                    : 'Owner Cabang menyetujui atau menolak pengajuan pengeluaran untuk cabangnya.'}
                </p>
              </div>

              {/* Filter Status */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#454745]">Status:</span>
                <select
                  value={expenseFilterStatus}
                  onChange={(e) => setExpenseFilterStatus(e.target.value)}
                  className="bg-[#ffffff] border border-[#868685] rounded-[10px] px-3 py-2 text-xs font-semibold text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="PENDING">Menunggu Persetujuan</option>
                  <option value="APPROVED">Disetujui</option>
                  <option value="REJECTED">Ditolak</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              {expenses.map((ex) => (
                <div
                  key={ex.id}
                  className="bg-[#ffffff] rounded-[10px] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-[#0e0f0c]">{ex.description}</span>
                      <span
                        className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                          ex.approvalStatus === 'APPROVED'
                            ? 'bg-[#9fe870] text-[#163300]'
                            : ex.approvalStatus === 'REJECTED'
                              ? 'bg-[#cb272f] text-[#ffffff]'
                              : 'bg-[#e8ebe6] text-[#163300]'
                        }`}
                      >
                        {EXPENSE_APPROVAL_LABELS[ex.approvalStatus]}
                      </span>
                      {ex.branch && (
                        <span className="text-[11px] bg-[#e2f6d5] text-[#163300] font-semibold px-2.5 py-0.5 rounded-full">
                          {ex.branch.name}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#6a6c6a]">
                      Kategori: <strong className="text-[#454745]">{ex.category?.name}</strong> • Tanggal: {ex.expenseDate} • Diajukan oleh: {ex.recordedBy?.name || 'Kasir'}
                    </div>
                    {ex.approvedBy && (
                      <div className="text-[11px] text-[#454745]">
                        Keputusan oleh: <strong className="text-[#0e0f0c]">{ex.approvedBy.name}</strong> pada {ex.approvedAt ? new Date(ex.approvedAt).toLocaleString('id-ID') : '-'}
                      </div>
                    )}
                    {ex.rejectionNote && (
                      <div className="text-xs text-[#cb272f] font-semibold">
                        Catatan Penolakan: {ex.rejectionNote}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="font-black text-base text-[#cb272f]">
                      -{formatRupiah(ex.amount)}
                    </div>

                    {ex.approvalStatus === 'PENDING' && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleDecideExpense(ex.id, 'APPROVED')}
                          className="text-xs font-semibold bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] px-4 py-1.5 rounded-full cursor-pointer transition-colors"
                        >
                          Setujui
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectionModalId(ex.id);
                            setRejectionNoteInput('');
                          }}
                          className="text-xs font-semibold bg-[#cb272f] hover:opacity-90 text-[#ffffff] px-4 py-1.5 rounded-full cursor-pointer transition-opacity"
                        >
                          Tolak
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Catatan Penolakan */}
            {rejectionModalId && (
              <div className="fixed inset-0 z-50 bg-[#0e0f0c]/60 flex items-center justify-center p-4">
                <div className="bg-[#ffffff] rounded-[28px] max-w-sm w-full p-6 space-y-4 border border-[#e8ebe6]">
                  <h3 className="font-black text-base text-[#0e0f0c] uppercase tracking-[-0.02em]">Alasan / Catatan Penolakan</h3>
                  <textarea
                    rows={3}
                    value={rejectionNoteInput}
                    onChange={(e) => setRejectionNoteInput(e.target.value)}
                    placeholder="Contoh: Nota tidak jelas, hubungi supervisor..."
                    className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] p-3 text-xs text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setRejectionModalId(null)}
                      className="text-xs font-medium px-4 py-2 border border-[#163300] text-[#163300] rounded-full hover:bg-[#e2f6d5] cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDecideExpense(rejectionModalId, 'REJECTED', rejectionNoteInput)}
                      className="text-xs font-semibold bg-[#cb272f] text-[#ffffff] px-5 py-2 rounded-full cursor-pointer hover:opacity-90"
                    >
                      Konfirmasi Tolak
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB: OWNER & SUPER OWNER - PENGELOLAAN PEGAWAI (Section 3.9 & 4.6) */}
        {/* ============================================================== */}
        {activeTab === 'OWNER_USERS' && (
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-6">
              <div>
                <h2 className="text-[25px] font-black text-[#0e0f0c] tracking-[-0.02em] uppercase">
                  {isSuperOwner ? 'Daftar Pegawai & Owner Multi-Cabang' : `Daftar Pegawai (${user.branch?.name || 'Cabang'})`}
                </h2>
                <p className="text-xs text-[#6a6c6a] mt-0.5">
                  Dikelompokkan rapi per cabang. Super Owner ditampilkan di bagian paling atas. Urutan role cabang: Branch Owner, Kasir, Bagian Cuci, Setrika.
                </p>
              </div>

              {/* 1. Super Owner Section */}
              {isSuperOwner && (
                <div className="bg-[#163300] text-[#ffffff] rounded-[10px] p-5 space-y-3">
                  <div className="text-xs font-bold text-[#9fe870] uppercase tracking-wider">
                    Super Owner / Manajemen Pusat
                  </div>
                  {staffList
                    .filter((u) => u.role === 'SUPER_OWNER')
                    .map((st) => (
                      <div
                        key={st.id}
                        className="bg-[#054d28] rounded-[10px] p-3.5 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-[#ffffff]">{st.name}</div>
                          <div className="text-[#e8ebe6] mt-0.5">{st.email} • {st.phone}</div>
                        </div>
                        <span className="font-semibold bg-[#9fe870] text-[#163300] px-3 py-0.5 rounded-full text-[11px]">
                          SUPER OWNER
                        </span>
                      </div>
                    ))}
                </div>
              )}

              {/* 2. Pengelompokan Pegawai Per Cabang */}
              <div className="space-y-4">
                {branches
                  .filter((b) => (isSuperOwner ? true : b.id === user.branchId))
                  .map((b) => {
                    const branchStaff = staffList.filter((s) => s.branchId === b.id);
                    const roleOrder = { BRANCH_OWNER: 1, OWNER: 1, CASHIER: 2, WASHING: 3, IRONING: 4, SUPER_OWNER: 99 };
                    branchStaff.sort((a, b) => (roleOrder[a.role] || 99) - (roleOrder[b.role] || 99));

                    return (
                      <div key={b.id} className="bg-[#ffffff] rounded-[10px] p-5 space-y-3">
                        <div className="flex items-center justify-between border-b border-[#e8ebe6] pb-2.5">
                          <div className="font-bold text-sm text-[#0e0f0c] flex items-center gap-2">
                            <span>{b.name}</span>
                            <span className="text-[11px] bg-[#e2f6d5] text-[#163300] font-semibold px-2.5 py-0.5 rounded-full">{b.code}</span>
                          </div>
                          <span className="text-xs font-semibold text-[#6a6c6a]">
                            {branchStaff.length} Pegawai
                          </span>
                        </div>

                        <div className="space-y-2">
                          {branchStaff.map((st) => (
                            <div
                              key={st.id}
                              className="bg-[#e8ebe6]/50 rounded-[10px] p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                            >
                              <div className="flex items-center gap-3">
                                {st.avatarUrl ? (
                                  <img
                                    src={st.avatarUrl}
                                    alt={st.name}
                                    className="w-10 h-10 rounded-full object-cover border border-[#163300]"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-[#163300] text-[#9fe870] flex items-center justify-center font-black text-xs">
                                    {st.name.slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <div className="font-bold text-[#0e0f0c] flex items-center gap-1.5">
                                    <span>{st.name}</span>
                                    {(st.role === 'CASHIER' || st.role === 'WASHING') && (
                                      <span
                                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                          st.avatarUrl
                                            ? 'bg-[#e2f6d5] text-[#163300]'
                                            : 'bg-[#cb272f] text-[#ffffff]'
                                        }`}
                                      >
                                        {st.avatarUrl ? 'Face ID Siap' : 'Belum Ada Foto Wajah'}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[#6a6c6a] mt-0.5">{st.email || '-'} • {st.phone || '-'}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="text-[11px] font-semibold bg-[#ffffff] border border-[#163300] text-[#163300] hover:bg-[#e2f6d5] px-2.5 py-1 rounded-full cursor-pointer transition-colors">
                                  Ubah Foto
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) void handleUpdateExistingStaffPhoto(st.id, st.name, file);
                                    }}
                                  />
                                </label>
                                <span
                                  className={`text-[11px] font-semibold px-3 py-1 rounded-full ${
                                    st.role === 'BRANCH_OWNER' || st.role === 'OWNER'
                                      ? 'bg-[#163300] text-[#9fe870]'
                                      : st.role === 'CASHIER'
                                        ? 'bg-[#9fe870] text-[#163300]'
                                        : 'bg-[#e2f6d5] text-[#163300]'
                                  }`}
                                >
                                  {st.role}
                                </span>
                              </div>
                            </div>
                          ))}
                          {branchStaff.length === 0 && (
                            <div className="text-[#6a6c6a] text-xs py-2">Belum ada pegawai yang ditugaskan di cabang ini.</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Form Tambah Pegawai (Minus 5: Kosong semua saat baru dibuka + Tambahan 3: Wajib Foto untuk Face Recognition) */}
            <form onSubmit={handleCreateStaff} autoComplete="off" className="bg-[#e8ebe6] rounded-[28px] p-6 sm:p-8 space-y-4 h-fit">
              <div>
                <h3 className="font-black text-lg text-[#0e0f0c] uppercase tracking-[-0.02em]">+ Tambah Akun Pegawai</h3>
                <p className="text-[11px] text-[#6a6c6a] mt-0.5">
                  Seluruh kolom dikosongkan agar Owner mengisi langsung. Wajib unggah foto wajah jelas untuk sistem absen Face Recognition.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0e0f0c] mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="Masukkan nama lengkap pegawai..."
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-sm text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0e0f0c] mb-1">Email (Untuk Reset Password &amp; Profil) *</label>
                <input
                  type="email"
                  required
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  placeholder="Masukkan email aktif pegawai..."
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-sm text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0e0f0c] mb-1">Nomor HP / WhatsApp *</label>
                <input
                  type="tel"
                  required
                  value={staffPhone}
                  onChange={(e) => setStaffPhone(e.target.value)}
                  placeholder="Masukkan nomor HP pegawai..."
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-sm text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0e0f0c] mb-1">Role Pegawai *</label>
                <select
                  required
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value as UserRole | '')}
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-sm text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                >
                  <option value="">Pilih Role Pegawai...</option>
                  <option value="CASHIER">Kasir (CASHIER)</option>
                  <option value="WASHING">Bagian Cuci (WASHING)</option>
                  <option value="IRONING">Petugas Setrika (IRONING)</option>
                  {isSuperOwner && <option value="BRANCH_OWNER">Owner Cabang (BRANCH_OWNER)</option>}
                </select>
              </div>
              {isSuperOwner && (
                <div>
                  <label className="block text-xs font-semibold text-[#0e0f0c] mb-1">Penempatan Cabang *</label>
                  <select
                    required
                    value={staffBranchId}
                    onChange={(e) => setStaffBranchId(e.target.value)}
                    className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-sm text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                  >
                    <option value="">Pilih Cabang...</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[#0e0f0c] mb-1">Password Awal *</label>
                <PasswordInput
                  required
                  value={staffPass}
                  onChange={(e) => setStaffPass(e.target.value)}
                  placeholder="Masukkan password awal (min. 6 karakter)"
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2.5 text-sm text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                />
              </div>
              <div className="bg-[#ffffff] rounded-[10px] p-3.5 space-y-2 border border-[#868685]">
                <label className="block text-xs font-bold text-[#0e0f0c]">
                  Foto Wajah Pegawai (Wajib untuk Face Recognition Absen) *
                </label>
                {staffAvatarUrl && (
                  <div className="flex items-center gap-3">
                    <img
                      src={staffAvatarUrl}
                      alt="Preview Pegawai"
                      className="w-14 h-14 rounded-full object-cover border-2 border-[#163300]"
                    />
                    <span className="text-[11px] font-semibold text-[#163300] bg-[#e2f6d5] px-2.5 py-1 rounded-full">
                      {staffFaceDescriptor && staffFaceDescriptor.length > 0
                        ? 'Wajah & Sidik Biometrik Siap'
                        : 'Foto Siap'}
                    </span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleStaffPhotoChange}
                  className="block w-full text-xs text-[#454745] file:mr-2 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-[#163300] file:text-[#9fe870] hover:file:bg-[#054d28] cursor-pointer"
                />
                {staffPhotoUploading && (
                  <div className="text-[11px] text-[#163300] font-semibold">
                    Memproses foto & mengekstrak fitur wajah...
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={staffPhotoUploading}
                className="w-full bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] text-sm font-semibold py-3 rounded-full cursor-pointer transition-colors disabled:opacity-50"
              >
                Buat Akun Pegawai
              </button>
            </form>
          </section>
        )}

        {/* ============================================================== */}
        {/* TAB: KASIR & BAGIAN CUCI - TERMINAL ABSEN FACE RECOGNITION + GPS */}
        {/* ============================================================== */}
        {activeTab === 'ATTENDANCE_TERMINAL' && (
          <AttendanceTerminalSection
            currentUser={user}
            onSuccessMsg={(msg) => setSuccessMsg(msg)}
            onErrorMsg={(msg) => setErrorMsg(msg)}
          />
        )}

        {/* ============================================================== */}
        {/* TAB: OWNER & SUPER OWNER - REKAP ABSENSI BULANAN & JAM KERJA */}
        {/* ============================================================== */}
        {activeTab === 'OWNER_ATTENDANCE' && (
          <OwnerAttendanceReportSection
            isSuperOwner={isSuperOwner}
            selectedBranchId={selectedBranchId}
            branches={branches}
            onSelectBranch={(id) => setSelectedBranchId(id)}
          />
        )}

        {/* ============================================================== */}
        {/* TAB: PEGAWAI - PENGAJUAN CUTI / MINTA LIBUR */}
        {/* ============================================================== */}
        {activeTab === 'STAFF_LEAVES' && (
          <StaffLeaveSection
            todayStr={todayStr}
            onSuccessMsg={(msg) => setSuccessMsg(msg)}
            onErrorMsg={(msg) => setErrorMsg(msg)}
          />
        )}

        {/* ============================================================== */}
        {/* TAB: OWNER & SUPER OWNER - PERSETUJUAN CUTI PEGAWAI */}
        {/* ============================================================== */}
        {activeTab === 'OWNER_LEAVES' && (
          <OwnerLeaveApprovalSection
            selectedBranchId={selectedBranchId}
            onSuccessMsg={(msg) => setSuccessMsg(msg)}
            onErrorMsg={(msg) => setErrorMsg(msg)}
            onDecisionDone={() => void loadData()}
          />
        )}

        {/* ============================================================== */}
        {/* TAB: OWNER & SUPER OWNER - PERSETUJUAN & PEMBAYARAN UPAH SETRIKA */}
        {/* ============================================================== */}
        {activeTab === 'OWNER_IRONING_PAYOUTS' && (
          <OwnerIroningPayoutSection
            selectedBranchId={selectedBranchId}
            branches={branches}
            isSuperOwner={isSuperOwner}
            onSuccessMsg={(msg) => setSuccessMsg(msg)}
            onErrorMsg={(msg) => setErrorMsg(msg)}
            onUpdate={() => void loadData()}
          />
        )}

        {/* ============================================================== */}
        {/* TAB: SUPER OWNER & OWNER - REKONSILIASI & PENCAIRAN QRIS CABANG */}
        {/* ============================================================== */}
        {activeTab === 'OWNER_QRIS_WITHDRAWALS' && (
          <OwnerQrisWithdrawalSection
            isSuperOwner={isSuperOwner}
            selectedBranchId={selectedBranchId}
            branches={branches}
            onSelectBranch={(id) => setSelectedBranchId(id)}
            onSuccessMsg={(msg) => setSuccessMsg(msg)}
            onErrorMsg={(msg) => setErrorMsg(msg)}
          />
        )}
      </main>

      {/* Modal Pengajuan Upah Setrika */}
      {requestPayoutModalOpen && ironingEarnings && (
        <RequestPayoutModal
          amount={ironingEarnings.unpaidEarnings ?? ironingEarnings.totalEarnings}
          totalItems={ironingEarnings.unpaidItemsCount ?? ironingEarnings.totalItems}
          month={earningsMonth}
          year={earningsYear}
          onClose={() => setRequestPayoutModalOpen(false)}
          onSubmit={handleSendIroningPayout}
        />
      )}

      {/* Modal Lihat Bukti Transfer Upah */}
      {ironingProofModalPayout && (
        <ProofTransferModal
          payout={ironingProofModalPayout}
          onClose={() => setIroningProofModalPayout(null)}
        />
      )}

      {/* ============================================================== */}
      {/* MODAL STRUK CETAK THERMAL (58mm / 80mm) & WHATSAPP */}
      {/* ============================================================== */}
      {receiptModal && (
        <div className="fixed inset-0 z-50 bg-[#0e0f0c]/60 flex items-center justify-center p-4">
          <div className="bg-[#ffffff] rounded-[28px] max-w-md w-full p-6 sm:p-8 space-y-4 border border-[#e8ebe6]">
            {/* Pilihan Format Lebar Kertas Thermal (Section 5.5) */}
            <div className="flex items-center justify-between border-b border-[#e8ebe6] pb-3 no-print">
              <span className="text-xs font-semibold text-[#454745]">Format Kertas Thermal:</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setReceiptPaperWidth('58mm')}
                  className={`text-xs font-semibold px-3.5 py-1 rounded-full cursor-pointer transition-colors ${
                    receiptPaperWidth === '58mm'
                      ? 'bg-[#9fe870] text-[#163300]'
                      : 'bg-[#e8ebe6] text-[#454745]'
                  }`}
                >
                  58 mm
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptPaperWidth('80mm')}
                  className={`text-xs font-semibold px-3.5 py-1 rounded-full cursor-pointer transition-colors ${
                    receiptPaperWidth === '80mm'
                      ? 'bg-[#9fe870] text-[#163300]'
                      : 'bg-[#e8ebe6] text-[#454745]'
                  }`}
                >
                  80 mm
                </button>
              </div>
            </div>

            {/* Pilihan Nomor WA Pengirim pada Modal Struk jika cabang punya > 1 nomor */}
            {receiptModal.availableSenderPhones &&
              receiptModal.availableSenderPhones.length > 1 && (
                <div className="bg-[#e8ebe6] rounded-[12px] p-3 space-y-1.5 no-print">
                  <label className="block text-[11px] font-bold text-[#163300]">
                    📱 Ganti Nomor Telp/WA Cabang pada Struk (Jika Kena Limit/Ban):
                  </label>
                  <select
                    value={receiptModal.store.phone}
                    onChange={(e) => {
                      const nextPhone = e.target.value;
                      setSelectedSenderWhatsapp(nextPhone);
                      void openReceipt(receiptModal.order.id, nextPhone);
                    }}
                    className="w-full bg-[#ffffff] border border-[#868685] rounded-[8px] px-3 py-1.5 text-xs font-mono font-bold text-[#0e0f0c]"
                  >
                    {receiptModal.availableSenderPhones.map((opt) => (
                      <option key={opt.phone} value={opt.phone}>
                        {opt.phone} — {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

            {/* Layout Struk Responsif */}
            <div
              className={`mx-auto bg-[#ffffff] p-3 font-mono text-[#0e0f0c] border border-dashed border-[#868685] rounded-[10px] text-xs ${
                receiptPaperWidth === '58mm' ? 'max-w-[260px]' : 'max-w-[340px]'
              }`}
            >
              <div className="text-center border-b border-dashed border-[#868685] pb-2 mb-2">
                <div className="font-black text-sm uppercase">{receiptModal.store.name}</div>
                <div className="text-[11px] text-[#454745]">{receiptModal.store.address}</div>
                <div className="text-[11px] text-[#454745]">WA: {receiptModal.store.phone}</div>
              </div>

              <div className="space-y-0.5 text-[11px] border-b border-dashed border-[#868685] pb-2 mb-2">
                <div>No. Nota : {receiptModal.order.orderNumber}</div>
                <div>Cabang   : {receiptModal.order.branch?.name || '-'}</div>
                <div>Customer : {receiptModal.order.customer?.name}</div>
                <div>Kasir    : {receiptModal.order.cashier?.name}</div>
                <div>Tgl      : {new Date(receiptModal.order.receivedAt).toLocaleString('id-ID')}</div>
              </div>

              <div className="space-y-1.5 border-b border-dashed border-[#868685] pb-2 mb-2">
                {receiptModal.order.items.map((it) => (
                  <div key={it.id} className="text-[11px]">
                    <div className="font-bold">{it.serviceName}</div>
                    <div className="flex justify-between text-[#454745]">
                      <span>
                        {it.quantity} {it.priceUnit === 'KG' ? 'kg' : 'pcs'} x {formatRupiah(it.unitPrice)}
                      </span>
                      <span className="font-bold text-[#0e0f0c]">{formatRupiah(it.itemTotal)}</span>
                    </div>
                    {it.rackNumber && (
                      <div className="text-[10px] text-[#6a6c6a]">Lokasi: Rak {it.rackNumber}</div>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatRupiah(receiptModal.order.subtotal)}</span>
                </div>
                {receiptModal.order.discount > 0 && (
                  <div className="flex justify-between text-[#163300] font-semibold">
                    <span>Diskon</span>
                    <span>-{formatRupiah(receiptModal.order.discount)}</span>
                  </div>
                )}
                {(receiptModal.order.payLaterFee || 0) > 0 && (
                  <div className="flex justify-between text-[#cb272f] font-semibold">
                    <span>Biaya Bayar Nanti</span>
                    <span>+{formatRupiah(receiptModal.order.payLaterFee || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm border-t border-dashed border-[#868685] pt-1">
                  <span>TOTAL</span>
                  <span>{formatRupiah(receiptModal.order.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Dibayar</span>
                  <span>{formatRupiah(receiptModal.order.paidAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sisa</span>
                  <span>{formatRupiah(receiptModal.order.remainingAmount)} ({receiptModal.order.paymentStatus})</span>
                </div>
              </div>

              <div className="text-center text-[10px] text-[#6a6c6a] border-t border-dashed border-[#868685] pt-2 mt-2">
                Terima kasih atas kepercayaan Anda!<br />
                Simpan struk ini untuk pengambilan cucian.
              </div>
            </div>

            {/* Aksi Struk */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 no-print">
              <a
                href={receiptModal.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] text-xs font-semibold px-4 py-2.5 rounded-full cursor-pointer transition-colors"
              >
                Kirim Struk via WhatsApp
              </a>
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-[#163300] hover:bg-[#054d28] text-[#ffffff] text-xs font-semibold px-4 py-2.5 rounded-full cursor-pointer transition-colors"
              >
                Cetak Struk
              </button>
              <button
                type="button"
                onClick={() => setReceiptModal(null)}
                className="bg-[#ffffff] border border-[#163300] text-[#163300] hover:bg-[#e2f6d5] text-xs font-medium px-4 py-2.5 rounded-full cursor-pointer transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: SETORAN KAS HARIAN KE OWNER (Requirement 3) */}
      {/* ============================================================== */}
      {cashHandoverModal && (
        <div className="fixed inset-0 bg-[#0e0f0c]/60 flex items-center justify-center p-4 z-50">
          <div className="bg-[#ffffff] rounded-[28px] max-w-lg w-full p-6 sm:p-8 space-y-4 max-h-[90vh] overflow-y-auto border border-[#e8ebe6]">
            <div className="flex items-start justify-between border-b border-[#e8ebe6] pb-3">
              <div>
                <h3 className="font-black text-lg text-[#0e0f0c] uppercase tracking-[-0.02em]">
                  Setoran Kas Harian ke Owner
                </h3>
                <p className="text-xs text-[#6a6c6a] mt-0.5">
                  Tanggal Transaksi: <strong className="text-[#0e0f0c]">{cashHandoverModal.formattedDate}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCashHandoverModal(null)}
                className="text-[#6a6c6a] hover:text-[#0e0f0c] text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Rincian Sistem */}
            <div className="bg-[#e8ebe6] rounded-[10px] p-4 space-y-2 text-xs">
              <div className="flex justify-between text-[#454745]">
                <span>Pemasukan Tunai (Cash):</span>
                <span className="font-bold text-[#0e0f0c]">{formatRupiah(cashHandoverModal.totalCashIn)}</span>
              </div>
              <div className="flex justify-between text-[#454745]">
                <span>Pemasukan QRIS (Rekening):</span>
                <span className="font-bold text-[#0b4c72]">{formatRupiah(cashHandoverModal.totalQrisIn)}</span>
              </div>
              <div className="flex justify-between text-[#454745]">
                <span>Pengeluaran Disetujui (Approved):</span>
                <span className="font-bold text-[#cb272f]">-{formatRupiah(cashHandoverModal.totalApprovedExpense)}</span>
              </div>
              <div className="border-t border-[#868685]/40 pt-2 flex justify-between font-black text-sm">
                <span className="text-[#0e0f0c]">Uang Kasir Seharusnya:</span>
                <span className="text-[#163300]">{formatRupiah(cashHandoverModal.expectedCash)}</span>
              </div>
            </div>

            {/* Form Input Kasir */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#0e0f0c] mb-1">
                  Total Uang Fisik yang Dihitung / Diserahkan (Rp) <span className="text-[#cb272f]">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={cashHandoverModal.enteredPhysicalCash}
                  onChange={(e) =>
                    setCashHandoverModal((prev) =>
                      prev ? { ...prev, enteredPhysicalCash: e.target.value } : null,
                    )
                  }
                  className="w-full bg-[#ffffff] border-2 border-[#163300] rounded-[10px] px-3.5 py-2.5 text-base font-black text-[#0e0f0c] focus:outline-none"
                  placeholder={String(cashHandoverModal.expectedCash)}
                />
                {/* Status Selisih Fisik */}
                {(() => {
                  const diff =
                    Number(cashHandoverModal.enteredPhysicalCash || 0) -
                    cashHandoverModal.expectedCash;
                  return (
                    <div className="mt-2 text-xs font-semibold">
                      {diff === 0 ? (
                        <span className="text-[#163300] bg-[#9fe870] px-3 py-1 rounded-full inline-block">
                          Fisik Uang Sesuai / Pas (Rp 0)
                        </span>
                      ) : diff > 0 ? (
                        <span className="text-[#163300] bg-[#e2f6d5] px-3 py-1 rounded-full inline-block">
                          Fisik Kasir Lebih: +{formatRupiah(diff)}
                        </span>
                      ) : (
                        <span className="text-[#ffffff] bg-[#cb272f] px-3 py-1 rounded-full inline-block">
                          Fisik Kasir Kurang: -{formatRupiah(Math.abs(diff))}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0e0f0c] mb-1">
                  Nomor WhatsApp Owner Cabang
                </label>
                <input
                  type="text"
                  value={cashHandoverModal.targetWhatsapp}
                  onChange={(e) =>
                    setCashHandoverModal((prev) =>
                      prev ? { ...prev, targetWhatsapp: e.target.value } : null,
                    )
                  }
                  placeholder="08123456789 atau 628..."
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-xs text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                />
                <p className="text-[11px] text-[#6a6c6a] mt-0.5">
                  Nomor WhatsApp tujuan untuk pengiriman rincian setoran kas harian ini.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0e0f0c] mb-1">
                  Catatan Kasir / Rincian Pecahan Uang (Opsional)
                </label>
                <textarea
                  rows={2}
                  value={cashHandoverModal.notes}
                  onChange={(e) =>
                    setCashHandoverModal((prev) =>
                      prev ? { ...prev, notes: e.target.value } : null,
                    )
                  }
                  placeholder="Contoh: Pecahan 100rb x 4, 50rb x 2. Sisa koin 5rb."
                  className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] px-3.5 py-2 text-xs text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e8ebe6]">
              <button
                type="button"
                onClick={() => setCashHandoverModal(null)}
                className="text-xs font-medium px-5 py-2.5 rounded-full border border-[#163300] text-[#163300] hover:bg-[#e2f6d5] cursor-pointer transition-colors"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={isSubmittingSettlement}
                onClick={async () => {
                  const physicalAmt = Number(cashHandoverModal.enteredPhysicalCash || 0);
                  const diff = physicalAmt - cashHandoverModal.expectedCash;
                  const curBranch = branches.find((b) => b.id === (user?.branchId || selectedBranchId)) || branches[0];
                  const branchName = curBranch?.name || `Cabang ${tenantBranding.brandName}`;

                  // 1. Submit ke backend agar muncul di panel Owner untuk di-ACC atau ditolak
                  await handleSubmitSettlement(physicalAmt, cashHandoverModal.notes);

                  // 2. Kirim notifikasi via WhatsApp ke Owner jika nomor tersedia
                  const lines = [
                    `*LAPORAN SETORAN KAS HARIAN*`,
                    `*${tenantBranding.brandName} - ${branchName}*`,
                    `*Tanggal:* ${cashHandoverModal.formattedDate}`,
                    `*Kasir:* ${user?.name || 'Kasir'}`,
                    `----------------------------------------`,
                    `*Pemasukan Tunai (Cash):* ${formatRupiah(cashHandoverModal.totalCashIn)}`,
                    `*Pemasukan QRIS (Rekening):* ${formatRupiah(cashHandoverModal.totalQrisIn)}`,
                    `*Pengeluaran Disetujui:* ${formatRupiah(cashHandoverModal.totalApprovedExpense)}`,
                    `----------------------------------------`,
                    `*Uang Kasir Seharusnya:* ${formatRupiah(cashHandoverModal.expectedCash)}`,
                    `*Uang Fisik Diserahkan:* ${formatRupiah(physicalAmt)}`,
                    diff === 0
                      ? `*Status Fisik:* Sesuai / Pas (Rp 0)`
                      : diff > 0
                        ? `*Status Fisik:* Lebih (+${formatRupiah(diff)})`
                        : `*Status Fisik:* Kurang (-${formatRupiah(Math.abs(diff))})`,
                    cashHandoverModal.notes ? `*Catatan:* ${cashHandoverModal.notes}` : '',
                    `----------------------------------------`,
                    `Laporan masuk ke sistem Laundry. Silakan cek menu 'Setoran Kas Kasir' untuk ACC atau Tolak.`,
                  ].filter(Boolean).join('\n');

                  const phoneClean = cashHandoverModal.targetWhatsapp.replace(/\D/g, '');
                  let intlPhone = phoneClean;
                  if (phoneClean.startsWith('08')) intlPhone = `62${phoneClean.slice(1)}`;
                  else if (phoneClean.startsWith('8')) intlPhone = `62${phoneClean}`;

                  if (intlPhone) {
                    window.open(`https://wa.me/${intlPhone}?text=${encodeURIComponent(lines)}`, '_blank');
                  }
                }}
                className="text-xs font-semibold bg-[#9fe870] hover:bg-[#8ee05c] text-[#163300] px-6 py-2.5 rounded-full cursor-pointer transition-colors disabled:opacity-50"
              >
                {isSubmittingSettlement ? 'Mengirim...' : 'Kirim & Ajukan ke Owner'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: ALASAN PENOLAKAN SETORAN KAS OWNER */}
      {/* ============================================================== */}
      {settlementRejectModalId && (
        <div className="fixed inset-0 bg-[#0e0f0c]/60 flex items-center justify-center p-4 z-50">
          <div className="bg-[#ffffff] rounded-[28px] max-w-sm w-full p-6 sm:p-8 space-y-4 border border-[#e8ebe6]">
            <h3 className="font-black text-base text-[#0e0f0c] uppercase tracking-[-0.02em]">Tolak Setoran Kas Kasir</h3>
            <p className="text-xs text-[#6a6c6a]">
              Berikan alasan penolakan agar kasir dapat memeriksa ulang fisik uang dan mengajukan kembali.
            </p>
            <textarea
              rows={3}
              required
              value={settlementRejectNote}
              onChange={(e) => setSettlementRejectNote(e.target.value)}
              placeholder="Contoh: Uang fisik kurang Rp 10.000, ada nota kas yang belum masuk..."
              className="w-full bg-[#ffffff] border border-[#868685] rounded-[10px] p-3 text-xs text-[#0e0f0c] focus:outline-none focus:border-[#163300]"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSettlementRejectModalId(null);
                  setSettlementRejectNote('');
                }}
                className="text-xs font-medium px-4 py-2 rounded-full border border-[#163300] text-[#163300] hover:bg-[#e2f6d5] cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void handleDecideSettlement(settlementRejectModalId, 'REJECTED', settlementRejectNote)}
                className="text-xs font-semibold bg-[#cb272f] hover:opacity-90 text-[#ffffff] px-5 py-2 rounded-full cursor-pointer transition-opacity"
              >
                Konfirmasi Tolak
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: PROFIL AKUN (GANTI FOTO, INFO EMAIL, GANTI PASSWORD) */}
      {/* ============================================================== */}
      {profileModalOpen && (
        <UserProfileModal
          user={user}
          onClose={() => setProfileModalOpen(false)}
          onUserUpdated={(updatedUser) => {
            setUser(updatedUser);
            setSuccessMsg('Profil akun berhasil diperbarui.');
            void loadData();
          }}
        />
      )}

      {/* ============================================================== */}
      {/* MODAL: PELUNASAN SAAT AMBIL CUCIAN (BAYAR NANTI) */}
      {/* ============================================================== */}
      {settleOrderModal && (
        <PayLaterSettlementModal
          order={settleOrderModal}
          canPickUpNow={settleOrderModal.items.every(
            (it) => it.status === 'SELESAI' || it.status === 'SETRIKA_SELESAI',
          )}
          onClose={() => setSettleOrderModal(null)}
          onSuccess={(msg) => {
            setSettleOrderModal(null);
            setSuccessMsg(msg);
            void loadData();
          }}
        />
      )}
    </div>
  );
}
