import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthUser } from '../common/auth-user.interface';
import { CreateTimeOffDto } from './dto/create-time-off.dto';
import { SetWorkingHoursDto } from './dto/set-working-hours.dto';
import { WorkingHoursService } from './working-hours.service';

@Controller()
export class WorkingHoursController {
  constructor(private readonly workingHoursService: WorkingHoursService) {}

  @Get('doctors/:id/working-hours')
  getWorkingHours(@Param('id') id: string) {
    return this.workingHoursService.getWorkingHours(id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('doctors/:id/working-hours')
  setWorkingHours(
    @Param('id') id: string,
    @Body() dto: SetWorkingHoursDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workingHoursService.setWorkingHours(id, dto, user);
  }

  @Get('doctors/:id/time-off')
  getTimeOff(@Param('id') id: string) {
    return this.workingHoursService.getTimeOff(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('doctors/:id/time-off')
  createTimeOff(
    @Param('id') id: string,
    @Body() dto: CreateTimeOffDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workingHoursService.createTimeOff(id, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('time-off/:id')
  deleteTimeOff(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.workingHoursService.deleteTimeOff(id, user);
  }
}
