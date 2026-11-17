import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  type LaundryAuthUser,
  Roles,
} from '../common/auth/auth.decorators.js';
import { UserRole } from '../common/enums.js';
import {
  CreateStaffDto,
  ResetStaffPasswordDto,
  UpdateFaceDescriptorDto,
  UpdateStaffDto,
} from './dto/staff.dto.js';
import { StaffService } from './staff.service.js';

@Controller('staff')
@Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  list(
    @CurrentUser() actor: LaundryAuthUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.staffService.list(actor, branchId);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.staffService.getById(id, actor);
  }

  @Post()
  create(@Body() dto: CreateStaffDto, @CurrentUser() actor: LaundryAuthUser) {
    return this.staffService.create(dto, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.staffService.update(id, dto, actor);
  }

  @Patch(':id/password')
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetStaffPasswordDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.staffService.resetPassword(id, dto.password, actor);
  }

  @Patch(':id/face-descriptor')
  updateFace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFaceDescriptorDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.staffService.updateFaceDescriptor(id, dto.faceDescriptor, actor);
  }
}
