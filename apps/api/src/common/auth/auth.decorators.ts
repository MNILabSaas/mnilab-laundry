import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { UserRole } from '../enums.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export interface LaundryAuthUser {
  id: string; // laundry_staff.id
  platformUserId: string;
  tenantId: string;
  tenantSlug: string;
  branchId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): LaundryAuthUser => {
    const req = ctx.switchToHttp().getRequest<{ user: LaundryAuthUser }>();
    return req.user;
  },
);
