import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ToLowerTrim, Trim } from '../../common/dto/transforms.js';
import {
  IsSafeFaceDescriptor,
  IsSafeImageUri,
} from '../../common/utils/security.js';

export class LaundryLoginDto {
  @IsOptional()
  @ToLowerTrim()
  @IsString()
  @MaxLength(80)
  tenantSlug?: string;

  @ToLowerTrim()
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  identifier: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string;
}

export class ExchangeSsoDto {
  @Trim()
  @IsString()
  @MinLength(10)
  launchCode: string;
}

export class UpdateOwnProfileDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @ToLowerTrim()
  @IsString()
  @MaxLength(150)
  email?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @IsOptional()
  @IsSafeImageUri()
  avatarUrl?: string | null;

  @IsOptional()
  @IsSafeFaceDescriptor()
  faceDescriptor?: string | null;
}

export class ChangeOwnPasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  confirmPassword?: string;
}

export class ForgotPasswordDto {
  @ToLowerTrim()
  @IsEmail()
  @MaxLength(150)
  email: string;
}

export class ResetPasswordConfirmDto {
  @ToLowerTrim()
  @IsEmail()
  @MaxLength(150)
  email: string;

  @Trim()
  @IsString()
  @MinLength(4)
  @MaxLength(10)
  code: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  confirmPassword?: string;
}
