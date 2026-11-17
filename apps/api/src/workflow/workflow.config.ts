import { ItemStatus, UserRole, WorkflowCode } from '../common/enums.js';

export enum TransitionAction {
  START_IRONING = 'START_IRONING',
  FINISH_IRONING = 'FINISH_IRONING',
  COMPLETE = 'COMPLETE',
}

export interface WorkflowTransition {
  from: ItemStatus;
  to: ItemStatus;
  action: TransitionAction;
  roles: UserRole[];
}

export interface WorkflowDefinition {
  code: WorkflowCode;
  label: string;
  initialStatus: ItemStatus;
  statuses: ItemStatus[];
  requiresIroning: boolean;
  transitions: WorkflowTransition[];
  note?: string;
}

const START_IRONING_ROLES = [UserRole.IRONING, UserRole.SUPER_OWNER];
const FINISH_IRONING_ROLES = [UserRole.IRONING, UserRole.SUPER_OWNER];
const COMPLETE_ROLES = [UserRole.CASHIER, UserRole.WASHING, UserRole.SUPER_OWNER];

function washThenIron(code: WorkflowCode, label: string): WorkflowDefinition {
  return {
    code,
    label,
    initialStatus: ItemStatus.PROSES_CUCI,
    statuses: [
      ItemStatus.PROSES_CUCI,
      ItemStatus.PROSES_SETRIKA,
      ItemStatus.SETRIKA_SELESAI,
      ItemStatus.SELESAI,
    ],
    requiresIroning: true,
    transitions: [
      {
        from: ItemStatus.PROSES_CUCI,
        to: ItemStatus.PROSES_SETRIKA,
        action: TransitionAction.START_IRONING,
        roles: START_IRONING_ROLES,
      },
      {
        from: ItemStatus.PROSES_SETRIKA,
        to: ItemStatus.SETRIKA_SELESAI,
        action: TransitionAction.FINISH_IRONING,
        roles: FINISH_IRONING_ROLES,
      },
      {
        from: ItemStatus.SETRIKA_SELESAI,
        to: ItemStatus.SELESAI,
        action: TransitionAction.COMPLETE,
        roles: COMPLETE_ROLES,
      },
    ],
  };
}

function washOnly(
  code: WorkflowCode,
  label: string,
  note?: string,
): WorkflowDefinition {
  return {
    code,
    label,
    initialStatus: ItemStatus.PROSES_CUCI,
    statuses: [ItemStatus.PROSES_CUCI, ItemStatus.SELESAI],
    requiresIroning: false,
    transitions: [
      {
        from: ItemStatus.PROSES_CUCI,
        to: ItemStatus.SELESAI,
        action: TransitionAction.COMPLETE,
        roles: COMPLETE_ROLES,
      },
    ],
    note,
  };
}

export const WORKFLOWS: Record<WorkflowCode, WorkflowDefinition> = {
  [WorkflowCode.WASH_IRON]: washThenIron(WorkflowCode.WASH_IRON, 'Cuci + Setrika'),
  [WorkflowCode.WASH_DRY]: washOnly(WorkflowCode.WASH_DRY, 'Cuci Kering'),
  [WorkflowCode.WASH_WET]: washOnly(
    WorkflowCode.WASH_WET,
    'Cuci Basah (Mamel)',
    'Alur sama dengan Cuci Kering.',
  ),
  [WorkflowCode.IRON_ONLY]: {
    code: WorkflowCode.IRON_ONLY,
    label: 'Setrika Saja',
    initialStatus: ItemStatus.MENUNGGU_SETRIKA,
    statuses: [
      ItemStatus.MENUNGGU_SETRIKA,
      ItemStatus.PROSES_SETRIKA,
      ItemStatus.SETRIKA_SELESAI,
      ItemStatus.SELESAI,
    ],
    requiresIroning: true,
    transitions: [
      {
        from: ItemStatus.MENUNGGU_SETRIKA,
        to: ItemStatus.PROSES_SETRIKA,
        action: TransitionAction.START_IRONING,
        roles: START_IRONING_ROLES,
      },
      {
        from: ItemStatus.PROSES_SETRIKA,
        to: ItemStatus.SETRIKA_SELESAI,
        action: TransitionAction.FINISH_IRONING,
        roles: FINISH_IRONING_ROLES,
      },
      {
        from: ItemStatus.SETRIKA_SELESAI,
        to: ItemStatus.SELESAI,
        action: TransitionAction.COMPLETE,
        roles: COMPLETE_ROLES,
      },
    ],
  },
  [WorkflowCode.WASH_IRON_ITEM]: washThenIron(
    WorkflowCode.WASH_IRON_ITEM,
    'Cuci Satuan + Setrika',
  ),
};

export function getWorkflow(code: WorkflowCode): WorkflowDefinition {
  return WORKFLOWS[code];
}

export function ironingPickupStatuses(): Array<{
  workflow: WorkflowCode;
  status: ItemStatus;
}> {
  return Object.values(WORKFLOWS).flatMap((wf) =>
    wf.transitions
      .filter((t) => t.action === TransitionAction.START_IRONING)
      .map((t) => ({ workflow: wf.code, status: t.from })),
  );
}

export function completionStatuses(): Array<{
  workflow: WorkflowCode;
  status: ItemStatus;
}> {
  return Object.values(WORKFLOWS).flatMap((wf) =>
    wf.transitions
      .filter((t) => t.action === TransitionAction.COMPLETE)
      .map((t) => ({ workflow: wf.code, status: t.from })),
  );
}
