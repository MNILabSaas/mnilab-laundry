import { Attendance } from '../attendances/attendance.entity.js';
import { Branch } from '../branches/branch.entity.js';
import { CashSettlement } from '../cash-settlements/cash-settlement.entity.js';
import { Customer } from '../customers/customer.entity.js';
import { ExpenseCategory } from '../expenses/expense-category.entity.js';
import { Expense } from '../expenses/expense.entity.js';
import { LaundryService } from '../laundry-services/laundry-service.entity.js';
import { ServicePriceHistory } from '../laundry-services/service-price-history.entity.js';
import { LeaveRequest } from '../leaves/leave-request.entity.js';
import { LaundryOrderItem } from '../orders/laundry-order-item.entity.js';
import { LaundryOrder } from '../orders/laundry-order.entity.js';
import { Payment } from '../payments/payment.entity.js';
import { QrisWithdrawal } from '../payments/qris-withdrawal.entity.js';
import { LaundryStaff } from '../staff/laundry-staff.entity.js';
import { TenantProfile } from '../tenant-context/tenant-profile.entity.js';
import { IroningPayout } from '../workflow/ironing-payout.entity.js';
import { OrderStatusHistory } from '../workflow/order-status-history.entity.js';

export const LAUNDRY_ENTITIES = [
  TenantProfile,
  Branch,
  LaundryStaff,
  Customer,
  LaundryService,
  ServicePriceHistory,
  LaundryOrder,
  LaundryOrderItem,
  OrderStatusHistory,
  IroningPayout,
  Payment,
  QrisWithdrawal,
  ExpenseCategory,
  Expense,
  CashSettlement,
  Attendance,
  LeaveRequest,
];
