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
import { CustomersService } from './customers.service.js';
import {
  CreateCustomerDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
} from './dto/customer.dto.js';

@Controller('customers')
@Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER, UserRole.CASHIER)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  list(
    @Query() query: ListCustomersQueryDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.customersService.list(actor.tenantId, query);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.customersService.getById(id, actor.tenantId);
  }

  @Post()
  create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.customersService.create(actor.tenantId, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.customersService.update(id, actor.tenantId, dto);
  }
}
