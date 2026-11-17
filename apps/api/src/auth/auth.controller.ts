import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  type LaundryAuthUser,
  Public,
} from '../common/auth/auth.decorators.js';
import {
  clearAuthCookie,
  LAUNDRY_AUTH_COOKIE,
  setAuthCookie,
} from '../common/utils/auth-http.js';
import { AuthService } from './auth.service.js';
import {
  ExchangeSsoDto,
  LaundryLoginDto,
  UpdateOwnProfileDto,
} from './dto/auth.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LaundryLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    setAuthCookie(req, res, LAUNDRY_AUTH_COOKIE, result.accessToken);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('sso/exchange')
  @HttpCode(200)
  async exchangeSso(
    @Body() dto: ExchangeSsoDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.exchangeSsoLaunchToken(dto.launchCode);
    setAuthCookie(req, res, LAUNDRY_AUTH_COOKIE, result.accessToken);
    return result;
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    clearAuthCookie(req, res, LAUNDRY_AUTH_COOKIE);
    return { success: true };
  }

  @Get('me')
  me(@CurrentUser() user: LaundryAuthUser) {
    return this.authService.getMe(user.id, user.tenantId);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: LaundryAuthUser,
    @Body() dto: UpdateOwnProfileDto,
  ) {
    return this.authService.updateOwnProfile(user.id, user.tenantId, dto);
  }
}
