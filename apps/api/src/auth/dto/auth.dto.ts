import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ToLowerTrim, Trim } from '../../common/dto/transforms.js';
import { IsSafeImageUri } from '../../common/utils/security.js';

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
  @IsSafeImageUri()
  avatarUrl?: string | null;
}
