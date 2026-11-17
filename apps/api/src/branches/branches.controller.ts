import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CurrentUser,
  type LaundryAuthUser,
  Public,
  Roles,
} from '../common/auth/auth.decorators.js';
import { UserRole } from '../common/enums.js';
import { getActiveTenantContext } from '../tenant-context/tenant-context.js';
import { BranchesService } from './branches.service.js';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto.js';

@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Public()
  @Get('public')
  listPublic() {
    const ctx = getActiveTenantContext();
    return ctx ? this.branchesService.listPublic(ctx.tenantId) : [];
  }

  @Get()
  @Roles(
    UserRole.SUPER_OWNER,
    UserRole.BRANCH_OWNER,
    UserRole.CASHIER,
    UserRole.WASHING,
    UserRole.IRONING,
  )
  list(@CurrentUser() actor: LaundryAuthUser) {
    return this.branchesService.list(actor);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.branchesService.getById(id, actor);
  }

  @Post()
  @Roles(UserRole.SUPER_OWNER)
  create(@Body() dto: CreateBranchDto, @CurrentUser() actor: LaundryAuthUser) {
    return this.branchesService.create(dto, actor);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.branchesService.update(id, dto, actor);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_OWNER)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.branchesService.deactivate(id, actor);
  }
}
