import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ToLowerTrim, Trim } from '../../common/dto/transforms.js';
import { UserRole } from '../../common/enums.js';
import {
  IsSafeFaceDescriptor,
  IsSafeImageUri,
} from '../../common/utils/security.js';

export class CreateStaffDto {
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

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

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @IsOptional()
  @IsSafeImageUri()
  avatarUrl?: string | null;

  @IsOptional()
  @IsSafeFaceDescriptor()
  faceDescriptor?: string | null;
}

export class UpdateStaffDto {
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
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @IsOptional()
  @IsSafeImageUri()
  avatarUrl?: string | null;

  @IsOptional()
  @IsSafeFaceDescriptor()
  faceDescriptor?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResetStaffPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class UpdateFaceDescriptorDto {
  @IsSafeFaceDescriptor()
  faceDescriptor: string;
}
