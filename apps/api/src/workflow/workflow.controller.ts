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
  ApproveIroningPayoutDto,
  AssignRackDto,
  IroningEarningsQueryDto,
  ListIroningPayoutsQueryDto,
  QueueQueryDto,
  RejectIroningPayoutDto,
  RequestIroningPayoutDto,
  TransitionItemStatusDto,
} from './dto/workflow.dto.js';
import { WorkflowService } from './workflow.service.js';

@Controller('workflow')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get('ironing-queue')
  @Roles(UserRole.IRONING, UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  ironingQueue(
    @CurrentUser() actor: LaundryAuthUser,
    @Query() query: QueueQueryDto,
  ) {
    return this.workflowService.listIroningQueue(actor, query);
  }

  @Get('ironing-earnings')
  @Roles(UserRole.IRONING, UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  ironingEarnings(
    @CurrentUser() actor: LaundryAuthUser,
    @Query() query: IroningEarningsQueryDto,
  ) {
    return this.workflowService.getIroningEarnings(actor, query);
  }

  @Get('ironing-history')
  @Roles(UserRole.IRONING, UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  ironingHistory(
    @CurrentUser() actor: LaundryAuthUser,
    @Query() query: IroningEarningsQueryDto,
  ) {
    return this.workflowService.getIroningHistory(actor, query);
  }

  @Post('ironing-payouts/request')
  @Roles(UserRole.IRONING)
  requestIroningPayout(
    @CurrentUser() actor: LaundryAuthUser,
    @Body() dto: RequestIroningPayoutDto,
  ) {
    return this.workflowService.requestIroningPayout(actor, dto);
  }

  @Get('ironing-payouts')
  @Roles(UserRole.IRONING, UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  listIroningPayouts(
    @CurrentUser() actor: LaundryAuthUser,
    @Query() query: ListIroningPayoutsQueryDto,
  ) {
    return this.workflowService.listIroningPayouts(actor, query);
  }

  @Get('ironing-payouts/:id')
  @Roles(UserRole.IRONING, UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  getIroningPayoutDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.workflowService.getIroningPayoutDetail(id, actor);
  }

  @Patch('ironing-payouts/:id/pay')
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  payIroningPayout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveIroningPayoutDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.workflowService.payIroningPayout(id, dto, actor);
  }

  @Patch('ironing-payouts/:id/reject')
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  rejectIroningPayout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectIroningPayoutDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.workflowService.rejectIroningPayout(id, dto, actor);
  }

  @Get('washing-queue')
  @Roles(
    UserRole.WASHING,
    UserRole.SUPER_OWNER,
    UserRole.BRANCH_OWNER,
    UserRole.CASHIER,
  )
  washingQueue(
    @CurrentUser() actor: LaundryAuthUser,
    @Query() query: QueueQueryDto,
  ) {
    return this.workflowService.listWashingQueue(actor, query);
  }

  @Get('items/:id')
  getItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.workflowService.getItem(id, actor);
  }

  @Get('items/:id/history')
  getItemHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.workflowService.getItemHistory(id, actor);
  }

  @Post('items/:id/status')
  @Roles(UserRole.IRONING, UserRole.WASHING, UserRole.CASHIER, UserRole.SUPER_OWNER)
  transitionStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionItemStatusDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.workflowService.transitionStatus(id, dto, actor);
  }

  @Patch('items/:id/rack')
  @Roles(UserRole.CASHIER, UserRole.WASHING, UserRole.SUPER_OWNER)
  assignRack(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignRackDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.workflowService.assignRack(id, dto, actor);
  }
}
