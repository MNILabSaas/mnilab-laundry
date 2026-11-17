import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ItemStatus, UserRole, WorkflowCode } from '../common/enums.js';
import {
  getWorkflow,
  TransitionAction,
  type WorkflowTransition,
} from './workflow.config.js';

export interface TransitionContext {
  workflow: WorkflowCode;
  currentStatus: ItemStatus;
  targetStatus: ItemStatus;
  actorRole: UserRole;
  actorId: string;
  ironingStaffId: string | null;
  rackNumber: string | null;
}

export function assertTransition(ctx: TransitionContext): WorkflowTransition {
  const def = getWorkflow(ctx.workflow);
  if (ctx.currentStatus === ctx.targetStatus) {
    throw new BadRequestException(`Item sudah berstatus ${ctx.currentStatus}`);
  }
  const transition = def.transitions.find(
    (t) => t.from === ctx.currentStatus && t.to === ctx.targetStatus,
  );
  if (!transition) {
    throw new BadRequestException(
      `Transisi ${ctx.currentStatus} -> ${ctx.targetStatus} tidak diizinkan untuk alur ${def.label}`,
    );
  }
  if (!transition.roles.includes(ctx.actorRole)) {
    throw new ForbiddenException(
      `Role ${ctx.actorRole} tidak diizinkan melakukan transisi ${transition.action}`,
    );
  }
  if (
    transition.action === TransitionAction.START_IRONING &&
    ctx.ironingStaffId
  ) {
    throw new ConflictException('Item sudah diambil oleh pegawai setrika lain');
  }
  if (
    transition.action === TransitionAction.FINISH_IRONING &&
    ctx.actorRole !== UserRole.SUPER_OWNER &&
    ctx.ironingStaffId !== ctx.actorId
  ) {
    throw new ForbiddenException(
      'Hanya pegawai setrika yang mengambil pekerjaan ini yang dapat menyelesaikannya',
    );
  }
  if (
    transition.action === TransitionAction.COMPLETE &&
    !ctx.rackNumber?.trim()
  ) {
    throw new BadRequestException('Nomor rak wajib diisi sebelum item selesai');
  }
  return transition;
}

const RACK_ASSIGNER_ROLES = [
  UserRole.CASHIER,
  UserRole.WASHING,
  UserRole.SUPER_OWNER,
];

export function assertCanAssignRack(
  workflow: WorkflowCode,
  currentStatus: ItemStatus,
  actorRole: UserRole,
): void {
  if (!RACK_ASSIGNER_ROLES.includes(actorRole)) {
    throw new ForbiddenException(
      'Hanya kasir, bagian cuci, atau Super Owner yang boleh menetapkan nomor rak',
    );
  }
  const def = getWorkflow(workflow);
  const canCompleteNow = def.transitions.some(
    (t) => t.from === currentStatus && t.action === TransitionAction.COMPLETE,
  );
  if (!canCompleteNow && currentStatus !== ItemStatus.SELESAI) {
    throw new BadRequestException(
      `Nomor rak belum bisa diisi saat status ${currentStatus} untuk alur ${def.label}`,
    );
  }
}
