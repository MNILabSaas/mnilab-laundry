import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  type LaundryAuthUser,
  Roles,
} from '../common/auth/auth.decorators.js';
import { UserRole } from '../common/enums.js';
import { CreateOrderDto, ListOrdersQueryDto } from './dto/order.dto.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Roles(
    UserRole.SUPER_OWNER,
    UserRole.BRANCH_OWNER,
    UserRole.CASHIER,
    UserRole.WASHING,
    UserRole.IRONING,
  )
  list(
    @Query() query: ListOrdersQueryDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.ordersService.list(query, actor);
  }

  @Get(':id')
  @Roles(
    UserRole.SUPER_OWNER,
    UserRole.BRANCH_OWNER,
    UserRole.CASHIER,
    UserRole.WASHING,
    UserRole.IRONING,
  )
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.ordersService.getById(id, actor);
  }

  @Get(':id/receipt')
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER, UserRole.CASHIER)
  receipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('senderPhone') senderPhone: string | undefined,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.ordersService.buildReceipt(id, actor, senderPhone);
  }

  @Post()
  @Roles(UserRole.CASHIER, UserRole.SUPER_OWNER)
  create(@Body() dto: CreateOrderDto, @CurrentUser() actor: LaundryAuthUser) {
    return this.ordersService.create(dto, actor);
  }

  @Post(':id/pickup')
  @Roles(
    UserRole.SUPER_OWNER,
    UserRole.BRANCH_OWNER,
    UserRole.CASHIER,
    UserRole.WASHING,
  )
  markPickedUp(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.ordersService.markPickedUp(id, actor);
  }
}
