import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import {
  IS_PUBLIC_KEY,
  type LaundryAuthUser,
  ROLES_KEY,
} from '../common/auth/auth.decorators.js';
import { UserRole } from '../common/enums.js';
import {
  extractBearerOrCookieToken,
  LAUNDRY_AUTH_COOKIE,
} from '../common/utils/auth-http.js';
import { LaundryStaff } from '../staff/laundry-staff.entity.js';
import {
  type ActiveTenantContext,
  getActiveTenantContext,
} from '../tenant-context/tenant-context.js';

@Injectable()
export class LaundryJwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @InjectRepository(LaundryStaff)
    private readonly staffRepo: Repository<LaundryStaff>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<
        Request & { user?: LaundryAuthUser; tenantContext?: ActiveTenantContext }
      >();
    const token = extractBearerOrCookieToken(req, LAUNDRY_AUTH_COOKIE);
    if (!token) {
      throw new UnauthorizedException('Sesi login Laundry tidak ditemukan');
    }

    let payload: {
      sub: string;
      platformUserId: string;
      tenantId: string;
      tenantSlug: string;
      aud?: string;
    };
    try {
      payload = await this.jwtService.verifyAsync(token, {
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Token sesi Laundry tidak valid atau kedaluwarsa');
    }

    if (payload.aud !== 'mnilab-laundry') {
      throw new UnauthorizedException('Token bukan untuk aplikasi MNILab Laundry');
    }

    const activeTenant = getActiveTenantContext() ?? req.tenantContext;
    if (!activeTenant || payload.tenantId !== activeTenant.tenantId) {
      throw new UnauthorizedException('Token tidak cocok dengan tenant aktif');
    }

    const staff = await this.staffRepo.findOne({
      where: {
        id: payload.sub,
        tenantId: activeTenant.tenantId,
        isActive: true,
      },
    });
    if (!staff) {
      throw new UnauthorizedException('Akun staf tidak aktif pada tenant ini');
    }

    req.user = {
      id: staff.id,
      platformUserId: staff.platformUserId,
      tenantId: staff.tenantId,
      tenantSlug: activeTenant.tenantSlug,
      branchId: staff.branchId,
      name: staff.name,
      email: staff.email,
      phone: staff.phone,
      role: staff.role,
    };
    return true;
  }
}

@Injectable()
export class EntitlementAndDemoGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { tenantContext?: ActiveTenantContext }>();
    const path = req.originalUrl || req.url || '';
    if (
      path.startsWith('/health') ||
      path.startsWith('/public/branding') ||
      path.startsWith('/tenants/') ||
      path.startsWith('/auth/')
    ) {
      return true;
    }

    const activeTenant = getActiveTenantContext() ?? req.tenantContext;
    if (!activeTenant) {
      return true;
    }

    if (!activeTenant.entitlement.allowed) {
      throw new ForbiddenException(
        activeTenant.entitlement.reason ||
          'Langganan MNILab Laundry untuk mitra ini tidak aktif atau telah berakhir.',
      );
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const method = (req.method || 'GET').toUpperCase();
    if (
      activeTenant.isDemo &&
      !isPublic &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
    ) {
      throw new ForbiddenException(
        'Lingkungan DEMO bersifat Read-Only: Perubahan data operasional, transaksi, dan pengaturan dikunci. Gunakan fitur Simulasi Branding (Logo & Tema) di bilah atas untuk mencoba tampilan brand Anda, atau hubungi MNILab via WhatsApp untuk berlangganan penuh.',
      );
    }

    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = Boolean(
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]),
    );
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: LaundryAuthUser }>();
    if (!req.user) {
      throw new UnauthorizedException('Autentikasi diperlukan');
    }
    if (!requiredRoles.includes(req.user.role)) {
      throw new ForbiddenException('Role Anda tidak memiliki izin untuk aksi ini');
    }
    return true;
  }
}
