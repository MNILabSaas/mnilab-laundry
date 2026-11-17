import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { LaundryAuthUser } from '../auth/auth.decorators.js';
import { UserRole } from '../enums.js';
import { isValidUuid } from './security.js';

/**
 * Menentukan cakupan cabang berdasarkan role:
 * - SUPER_OWNER: dapat melihat seluruh cabang di dalam tenant miliknya atau memfilter branchId tertentu.
 * - BRANCH_OWNER & staf cabang: terkunci ketat pada branchId miliknya sendiri.
 */
export function resolveActorBranchScope(
  actor: LaundryAuthUser,
  requestedBranchId?: string | null,
): string | null {
  const cleanRequested = requestedBranchId?.trim() || undefined;
  if (cleanRequested && !isValidUuid(cleanRequested)) {
    throw new BadRequestException('Format ID cabang tidak valid');
  }

  if (actor.role === UserRole.SUPER_OWNER) {
    return cleanRequested ?? null;
  }

  if (!actor.branchId) {
    throw new ForbiddenException('Akun Anda belum ditugaskan pada cabang operasional');
  }

  if (cleanRequested && cleanRequested !== actor.branchId) {
    throw new ForbiddenException('Anda tidak memiliki akses ke cabang lain');
  }

  return actor.branchId;
}

export function requireActorWriteBranch(
  actor: LaundryAuthUser,
  requestedBranchId?: string | null,
): string {
  const scoped = resolveActorBranchScope(actor, requestedBranchId);
  if (!scoped) {
    throw new BadRequestException('branchId wajib dipilih untuk operasi ini');
  }
  return scoped;
}
