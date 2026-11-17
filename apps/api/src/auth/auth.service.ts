import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { LaundryAuthUser } from '../common/auth/auth.decorators.js';
import { UserRole } from '../common/enums.js';
import { normalizePhone } from '../common/utils/phone.js';
import {
  type PlatformAuthPayload,
  PlatformClientService,
} from '../platform/platform-client.service.js';
import { LaundryStaff } from '../staff/laundry-staff.entity.js';
import { formatTenantBrandingForClient } from '../tenant-context/public-branding.controller.js';
import { getActiveTenantContext } from '../tenant-context/tenant-context.js';
import {
  DEFAULT_LAUNDRY_THEME,
  TenantProfile,
} from '../tenant-context/tenant-profile.entity.js';
import type {
  ChangeOwnPasswordDto,
  LaundryLoginDto,
  ResetPasswordConfirmDto,
  UpdateOwnProfileDto,
} from './dto/auth.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly platformClient: PlatformClientService,
    private readonly jwtService: JwtService,
    @InjectRepository(LaundryStaff)
    private readonly staffRepo: Repository<LaundryStaff>,
    @InjectRepository(TenantProfile)
    private readonly profilesRepo: Repository<TenantProfile>,
  ) {}

  private async upsertStaffFromPlatformAuth(
    payload: PlatformAuthPayload,
  ): Promise<LaundryStaff> {
    await this.profilesRepo.upsert(
      {
        tenantId: payload.tenant.id,
        slug: payload.tenant.slug,
        brandName: payload.tenant.brandName,
        tagline: payload.tenant.tagline,
        logoUrl: payload.tenant.logoUrl,
        themeConfigJson: payload.tenant.theme ?? DEFAULT_LAUNDRY_THEME,
        whatsappPhone: payload.tenant.whatsappPhone,
        isDemo: payload.tenant.isDemo,
        subscriptionStatus: payload.entitlement.status,
        maxBranches: payload.entitlement.limits?.maxBranches ?? 1,
        syncedAt: new Date(),
      },
      ['tenantId'],
    );

    let staff = await this.staffRepo.findOne({
      where: {
        tenantId: payload.tenant.id,
        platformUserId: payload.user.id,
      },
      relations: { branch: true },
    });

    if (!staff && payload.user.email) {
      staff = await this.staffRepo.findOne({
        where: {
          tenantId: payload.tenant.id,
          email: payload.user.email.toLowerCase(),
        },
        relations: { branch: true },
      });
    }

    if (!staff) {
      if (
        payload.membership.role === 'TENANT_OWNER' ||
        payload.membership.role === 'TENANT_ADMIN'
      ) {
        staff = await this.staffRepo.save(
          this.staffRepo.create({
            tenantId: payload.tenant.id,
            platformUserId: payload.user.id,
            branchId: null,
            name: payload.user.name,
            email: payload.user.email,
            phone: payload.user.phone,
            role:
              payload.membership.role === 'TENANT_ADMIN'
                ? UserRole.BRANCH_OWNER
                : UserRole.SUPER_OWNER,
            isActive: true,
          }),
        );
      } else {
        throw new ForbiddenException(
          'Akun staf Anda belum memiliki profil peran operasional di Laundry. Hubungi Super Owner.',
        );
      }
    } else if (!staff.isActive) {
      throw new ForbiddenException('Akun staf Laundry Anda sedang dinonaktifkan');
    } else {
      let changed = false;
      if (staff.platformUserId !== payload.user.id) {
        staff.platformUserId = payload.user.id;
        changed = true;
      }
      if (staff.name !== payload.user.name) {
        staff.name = payload.user.name;
        changed = true;
      }
      if (staff.email !== payload.user.email) {
        staff.email = payload.user.email;
        changed = true;
      }
      if (staff.phone !== payload.user.phone) {
        staff.phone = payload.user.phone;
        changed = true;
      }
      if (changed) {
        staff = await this.staffRepo.save(staff);
      }
    }

    return staff;
  }

  private async signSession(staff: LaundryStaff, payload: PlatformAuthPayload) {
    const accessToken = await this.jwtService.signAsync({
      sub: staff.id,
      platformUserId: staff.platformUserId,
      tenantId: staff.tenantId,
      tenantSlug: payload.tenant.slug,
      branchId: staff.branchId,
      role: staff.role,
      aud: 'mnilab-laundry',
    });

    const formattedTenant = formatTenantBrandingForClient(
      {
        tenantId: payload.tenant.id,
        tenantSlug: payload.tenant.slug,
        brandName: payload.tenant.brandName,
        tagline: payload.tenant.tagline,
        logoUrl: payload.tenant.logoUrl,
        theme: payload.tenant.theme ?? DEFAULT_LAUNDRY_THEME,
        whatsappPhone: payload.tenant.whatsappPhone,
        isDemo: payload.tenant.isDemo,
        entitlement: payload.entitlement,
      },
      {
        cityOrRegion: payload.tenant.cityOrRegion,
        defaultAddress: payload.tenant.defaultAddress,
      },
    );

    return {
      accessToken,
      user: {
        id: staff.id,
        platformUserId: staff.platformUserId,
        tenantId: staff.tenantId,
        branchId: staff.branchId,
        branch: staff.branch ?? null,
        name: staff.name,
        email: staff.email,
        phone: staff.phone,
        role: staff.role,
        avatarUrl: staff.avatarUrl,
        faceDescriptor: staff.faceDescriptor,
        isActive: staff.isActive,
      },
      tenant: formattedTenant,
      entitlement: payload.entitlement,
    };
  }

  async login(dto: LaundryLoginDto) {
    const activeCtx = getActiveTenantContext();
    const targetSlug = dto.tenantSlug || activeCtx?.tenantSlug;
    if (!targetSlug) {
      throw new UnauthorizedException('Slug mitra laundry wajib ditentukan');
    }

    const platformAuth = await this.platformClient.verifyCredentials({
      tenantSlug: targetSlug,
      identifier: dto.identifier,
      password: dto.password,
    });

    const staff = await this.upsertStaffFromPlatformAuth(platformAuth);
    return this.signSession(staff, platformAuth);
  }

  async exchangeSsoLaunchToken(launchCode: string) {
    const platformAuth = await this.platformClient.exchangeLaunchToken(launchCode);
    const staff = await this.upsertStaffFromPlatformAuth(platformAuth);
    return this.signSession(staff, platformAuth);
  }

  async getMe(staffId: string, tenantId: string) {
    const staff = await this.staffRepo.findOne({
      where: { id: staffId, tenantId },
      relations: { branch: true },
    });
    if (!staff) throw new UnauthorizedException('Profil staf tidak ditemukan');
    const activeCtx = getActiveTenantContext();
    return {
      user: {
        id: staff.id,
        platformUserId: staff.platformUserId,
        tenantId: staff.tenantId,
        branchId: staff.branchId,
        branch: staff.branch ?? null,
        name: staff.name,
        email: staff.email,
        phone: staff.phone,
        role: staff.role,
        avatarUrl: staff.avatarUrl,
        faceDescriptor: staff.faceDescriptor,
        isActive: staff.isActive,
      },
      tenant: activeCtx ? formatTenantBrandingForClient(activeCtx) : null,
      entitlement: activeCtx?.entitlement ?? null,
    };
  }

  async updateOwnProfile(
    staffId: string,
    tenantId: string,
    dto: UpdateOwnProfileDto,
  ) {
    const staff = await this.staffRepo.findOne({
      where: { id: staffId, tenantId },
      relations: { branch: true },
    });
    if (!staff) throw new UnauthorizedException('Profil staf tidak ditemukan');

    const cleanPhone =
      dto.phone !== undefined
        ? dto.phone
          ? normalizePhone(dto.phone) ?? dto.phone
          : null
        : undefined;

    if (
      dto.name !== undefined ||
      dto.email !== undefined ||
      cleanPhone !== undefined
    ) {
      await this.platformClient.updateStaffAccount(staff.platformUserId, {
        tenantId,
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(cleanPhone !== undefined ? { phone: cleanPhone } : {}),
      });
    }

    if (dto.name !== undefined) staff.name = dto.name;
    if (dto.email !== undefined) staff.email = dto.email;
    if (cleanPhone !== undefined) staff.phone = cleanPhone;
    if (dto.avatarUrl !== undefined) staff.avatarUrl = dto.avatarUrl;
    if (dto.faceDescriptor !== undefined) staff.faceDescriptor = dto.faceDescriptor;
    return this.staffRepo.save(staff);
  }

  async changeOwnPassword(
    actor: LaundryAuthUser,
    dto: ChangeOwnPasswordDto,
  ) {
    if (dto.confirmPassword && dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Konfirmasi kata sandi baru tidak cocok');
    }
    const staff = await this.staffRepo.findOne({
      where: { id: actor.id, tenantId: actor.tenantId },
    });
    if (!staff) throw new UnauthorizedException('Profil staf tidak ditemukan');

    const identifier = staff.email || staff.phone;
    if (!identifier) {
      throw new BadRequestException('Akun tidak memiliki email atau nomor HP');
    }

    await this.platformClient.verifyCredentials({
      tenantSlug: actor.tenantSlug,
      identifier,
      password: dto.currentPassword,
    });

    await this.platformClient.updateStaffAccount(staff.platformUserId, {
      tenantId: actor.tenantId,
      newPassword: dto.newPassword,
    });
    return { success: true };
  }

  forgotPassword(email: string) {
    return this.platformClient.forgotPassword(email);
  }

  resetPassword(dto: ResetPasswordConfirmDto) {
    return this.platformClient.resetPassword(dto);
  }
}
