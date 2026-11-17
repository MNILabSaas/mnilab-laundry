export enum UserRole {
  SUPER_OWNER = 'SUPER_OWNER',
  BRANCH_OWNER = 'BRANCH_OWNER',
  CASHIER = 'CASHIER',
  IRONING = 'IRONING',
  WASHING = 'WASHING',
}

export enum WorkflowCode {
  WASH_IRON = 'WASH_IRON',
  WASH_DRY = 'WASH_DRY',
  WASH_WET = 'WASH_WET',
  IRON_ONLY = 'IRON_ONLY',
  WASH_IRON_ITEM = 'WASH_IRON_ITEM',
}

export enum PriceUnit {
  KG = 'KG',
  ITEM = 'ITEM',
  FLAT = 'FLAT',
}

export enum ItemStatus {
  MENUNGGU_SETRIKA = 'MENUNGGU_SETRIKA',
  PROSES_CUCI = 'PROSES_CUCI',
  PROSES_SETRIKA = 'PROSES_SETRIKA',
  SETRIKA_SELESAI = 'SETRIKA_SELESAI',
  SELESAI = 'SELESAI',
}

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  [ItemStatus.MENUNGGU_SETRIKA]: 'Menunggu setrika',
  [ItemStatus.PROSES_CUCI]: 'Sedang dicuci',
  [ItemStatus.PROSES_SETRIKA]: 'Sedang disetrika',
  [ItemStatus.SETRIKA_SELESAI]: 'Setrika selesai',
  [ItemStatus.SELESAI]: 'Selesai, siap diambil',
};

export enum PaymentMethod {
  CASH = 'CASH',
  QRIS = 'QRIS',
  TRANSFER = 'TRANSFER',
  OTHER = 'OTHER',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum OrderPaymentStatus {
  UNPAID = 'UNPAID',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
}

export enum ExpenseApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export const EXPENSE_APPROVAL_LABELS: Record<ExpenseApprovalStatus, string> = {
  [ExpenseApprovalStatus.PENDING]: 'Menunggu Persetujuan',
  [ExpenseApprovalStatus.APPROVED]: 'Disetujui',
  [ExpenseApprovalStatus.REJECTED]: 'Ditolak',
};

export enum LeaveType {
  CUTI = 'CUTI',
  IZIN = 'IZIN',
  SAKIT = 'SAKIT',
}
