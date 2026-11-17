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
  CreateLeaveRequestDto,
  DecideLeaveRequestDto,
  ListLeaveRequestsQueryDto,
} from './dto/leave-request.dto.js';
import { LeavesService } from './leaves.service.js';

@Controller('leaves')
export class LeavesController {
  constructor(private readonly leavesService: LeavesService) {}

  @Get()
  list(
    @Query() query: ListLeaveRequestsQueryDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.leavesService.list(query, actor);
  }

  @Post()
  create(
    @Body() dto: CreateLeaveRequestDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.leavesService.create(dto, actor);
  }

  @Patch(':id/decide')
  @Roles(UserRole.SUPER_OWNER, UserRole.BRANCH_OWNER)
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideLeaveRequestDto,
    @CurrentUser() actor: LaundryAuthUser,
  ) {
    return this.leavesService.decide(id, dto, actor);
  }
}
