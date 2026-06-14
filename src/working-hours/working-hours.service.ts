import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '../common/current-user.decorator';
import { assertDoctorOwnerOrAdmin } from '../common/ownership.util';
import { dateOnlyUtc, parseHHmm } from '../common/time.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTimeOffDto } from './dto/create-time-off.dto';
import { SetWorkingHoursDto } from './dto/set-working-hours.dto';

@Injectable()
export class WorkingHoursService {
  constructor(private readonly prisma: PrismaService) {}

  getWorkingHours(doctorId: string) {
    return this.prisma.workingHours.findMany({
      where: { doctorId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    });
  }

  async setWorkingHours(
    doctorId: string,
    dto: SetWorkingHoursDto,
    user: AuthUser,
  ) {
    await this.ensureDoctorExists(doctorId);
    assertDoctorOwnerOrAdmin(user, doctorId);

    for (const item of dto.items) {
      if (parseHHmm(item.startTime) >= parseHHmm(item.endTime)) {
        throw new BadRequestException(
          `startTime (${item.startTime}) trebuie să fie înainte de endTime (${item.endTime})`,
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.workingHours.deleteMany({ where: { doctorId } }),
      this.prisma.workingHours.createMany({
        data: dto.items.map((i) => ({
          doctorId,
          weekday: i.weekday,
          startTime: i.startTime,
          endTime: i.endTime,
        })),
      }),
    ]);

    return this.getWorkingHours(doctorId);
  }

  getTimeOff(doctorId: string) {
    return this.prisma.timeOff.findMany({
      where: { doctorId },
      orderBy: { date: 'asc' },
    });
  }

  async createTimeOff(
    doctorId: string,
    dto: CreateTimeOffDto,
    user: AuthUser,
  ) {
    await this.ensureDoctorExists(doctorId);
    assertDoctorOwnerOrAdmin(user, doctorId);

    const hasStart = dto.startTime != null;
    const hasEnd = dto.endTime != null;
    if (hasStart !== hasEnd) {
      throw new BadRequestException(
        'startTime și endTime trebuie furnizate împreună (sau deloc = toată ziua)',
      );
    }
    if (hasStart && hasEnd && parseHHmm(dto.startTime!) >= parseHHmm(dto.endTime!)) {
      throw new BadRequestException('startTime trebuie să fie înainte de endTime');
    }

    return this.prisma.timeOff.create({
      data: {
        doctorId,
        date: dateOnlyUtc(dto.date),
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        reason: dto.reason,
      },
    });
  }

  async deleteTimeOff(id: string, user: AuthUser) {
    const timeOff = await this.prisma.timeOff.findUnique({ where: { id } });
    if (!timeOff) {
      throw new NotFoundException('Time-off-ul nu a fost găsit');
    }
    assertDoctorOwnerOrAdmin(user, timeOff.doctorId);
    await this.prisma.timeOff.delete({ where: { id } });
    return { success: true };
  }

  private async ensureDoctorExists(doctorId: string) {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { id: doctorId },
    });
    if (!doctor) {
      throw new NotFoundException('Doctorul nu a fost găsit');
    }
  }
}
