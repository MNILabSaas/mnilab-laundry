import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { BranchesService } from '../src/branches/branches.service.js';
import type { LaundryAuthUser } from '../src/common/auth/auth.decorators.js';
import { UserRole } from '../src/common/enums.js';
import {
  requireActorWriteBranch,
  resolveActorBranchScope,
} from '../src/common/utils/scope.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PublicTrackingService } from '../src/public-tracking/public-tracking.service.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const BRANCH_1 = '22222222-2222-4222-8222-222222222222';
const BRANCH_2 = '33333333-3333-4333-8333-333333333333';

function makeActor(overrides: Partial<LaundryAuthUser> = {}): LaundryAuthUser {
  return {
    id: 'staff-1',
    platformUserId: 'pu-1',
    tenantId: TENANT_A,
    tenantSlug: 'toko-a',
    branchId: BRANCH_1,
    name: 'Staf A',
    email: 'staf@toko-a.id',
    phone: null,
    role: UserRole.CASHIER,
    ...overrides,
  };
}

describe('Isolasi Multi-Tenant & Kontrol Cabang (mnilab-laundry)', () => {
  it('SUPER_OWNER dapat melihat semua cabang atau memilih cabang spesifik di tenant-nya', () => {
    const superOwner = makeActor({ role: UserRole.SUPER_OWNER, branchId: null });
    expect(resolveActorBranchScope(superOwner)).toBeNull();
    expect(resolveActorBranchScope(superOwner, BRANCH_2)).toBe(BRANCH_2);
    expect(() => resolveActorBranchScope(superOwner, 'not-a-uuid')).toThrow(
      BadRequestException,
    );
  });

  it('BRANCH_OWNER dan staf cabang dikunci ketat pada branchId miliknya', () => {
    const branchOwner = makeActor({ role: UserRole.BRANCH_OWNER, branchId: BRANCH_1 });
    expect(resolveActorBranchScope(branchOwner)).toBe(BRANCH_1);
    expect(requireActorWriteBranch(branchOwner)).toBe(BRANCH_1);
    expect(() => resolveActorBranchScope(branchOwner, BRANCH_2)).toThrow(
      ForbiddenException,
    );

    const unassigned = makeActor({ role: UserRole.CASHIER, branchId: null });
    expect(() => resolveActorBranchScope(unassigned)).toThrow(ForbiddenException);
  });

  it('OrdersService.getById selalu memfilter tenantId dan menolak akses pesanan cabang lain', async () => {
    let capturedWhere: any = null;
    const ordersRepo = {
      findOne: async (opts: any) => {
        capturedWhere = opts.where;
        return {
          id: 'order-1',
          tenantId: TENANT_A,
          branchId: BRANCH_2,
        };
      },
    };
    const svc = new OrdersService(
      {} as never,
      ordersRepo as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const cashierBranch1 = makeActor({ role: UserRole.CASHIER, branchId: BRANCH_1 });
    await expect(svc.getById('order-1', cashierBranch1)).rejects.toThrow(
      ForbiddenException,
    );
    expect(capturedWhere).toEqual({ id: 'order-1', tenantId: TENANT_A });

    const superOwner = makeActor({ role: UserRole.SUPER_OWNER, branchId: null });
    const ok = await svc.getById('order-1', superOwner);
    expect(ok.id).toBe('order-1');
  });

  it('BranchesService.create menolak pembuatan cabang baru jika kuota paket penuh', async () => {
    const branchesRepo = {
      count: async () => 1,
    };
    const platformClient = {
      getEntitlement: async () => ({
        allowed: true,
        limits: { maxBranches: 1 },
      }),
    };
    const svc = new BranchesService(branchesRepo as never, platformClient as never);
    const superOwner = makeActor({ role: UserRole.SUPER_OWNER, branchId: null });

    await expect(
      svc.create({ name: 'Cabang 2', code: 'CBG02' }, superOwner),
    ).rejects.toThrow(/Batas paket Anda maksimal 1 cabang/i);
  });

  it('PublicTrackingService menolak wildcard-only query dan selalu memfilter tenantId', async () => {
    const svc = new PublicTrackingService({} as never, {} as never);
    await expect(svc.search(TENANT_A, { q: '%%' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(svc.search(TENANT_A, { q: '__' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
