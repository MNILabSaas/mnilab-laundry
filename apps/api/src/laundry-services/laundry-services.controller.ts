import {
  Body,
  Controller,
  Delete,
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
  Public,
  Roles,
} from '../common/auth/auth.decorators.js';
import { UserRole } from '../common/enums.js';
import { getActiveTenantContext } from '../tenant-context/tenant-context.js';
import {
  CreateLaundryServiceDto,
  ListLaundryServicesQueryDto,
  UpdateLaundryServiceDto,
} from './dto/laundry-service.dto.js';
import { LaundryServicesService } from './laundry-services.service.js';

@Controller('services')
export class LaundryServicesController {
  constructor(private readonly servicesService: LaundryServicesService) {}

  @Public()
  @Get('public')
  listPublic(@Query('branchId') branchId?: string) {
    const ctx = getActiveTenantContext();
    return ctx ? this.servicesService.listPublicCatalog(ctx.tenantId, branchId) : [];
  }

  @Get('workflows')
  listWorkflows() {
    return this.servicesService.listWorkflows();
  }

  @Get()
  list(
    @Query() query: ListLaundryServicesQueryDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.servicesService.list(query, actor);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.servicesService.getById(id, actor);
  }

  @Get(':id/price-history')
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  getPriceHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.servicesService.getPriceHistory(id, actor);
  }

  @Post()
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  create(
    @Body() dto: CreateLaundryServiceDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.servicesService.create(dto, actor);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLaundryServiceDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.servicesService.update(id, dto, actor);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.servicesService.remove(id, actor);
  }
}
