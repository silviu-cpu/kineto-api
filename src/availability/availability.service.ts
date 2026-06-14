import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import {
  addMinutes,
  dateOnlyUtc,
  nowLocalHHmm,
  overlaps,
  parseHHmm,
  todayLocalDateStr,
} from '../common/time.util';
import { PrismaService } from '../prisma/prisma.service';

export interface Slot {
  startTime: string;
  endTime: string;
}

// Acceptă atât PrismaService cât și un client de tranzacție.
type Db = PrismaService | Prisma.TransactionClient;

interface ExistingAppointment {
  startTime: string;
  endTime: string;
}

interface SlotContext {
  /** Sloturi din program, minus trecut și minus time-off. Includ sloturile ocupate. */
  scheduleSlots: Slot[];
  /** Programări active în ziua respectivă. */
  appointments: ExistingAppointment[];
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sloturile efectiv libere (program − trecut − time-off − ocupate). */
  async getAvailableSlots(
    doctorId: string,
    dateStr: string,
    serviceId: string,
    db: Db = this.prisma,
  ): Promise<Slot[]> {
    const { scheduleSlots, appointments } = await this.buildContext(
      doctorId,
      dateStr,
      serviceId,
      db,
    );
    return scheduleSlots.filter(
      (slot) =>
        !appointments.some((a) =>
          overlaps(slot.startTime, slot.endTime, a.startTime, a.endTime),
        ),
    );
  }

  async getAvailability(doctorId: string, dateStr: string, serviceId: string) {
    return this.getAvailableSlots(doctorId, dateStr, serviceId);
  }

  /**
   * Verifică pe server că un slot cerut e rezervabil; întoarce endTime calculat.
   * - slot în afara programului / în trecut / în time-off → 400 BadRequest
   * - slot valid dar deja ocupat → 409 Conflict
   */
  async assertSlotBookable(
    doctorId: string,
    dateStr: string,
    serviceId: string,
    startTime: string,
    db: Db = this.prisma,
  ): Promise<{ endTime: string }> {
    const { scheduleSlots, appointments } = await this.buildContext(
      doctorId,
      dateStr,
      serviceId,
      db,
    );

    const slot = scheduleSlots.find((s) => s.startTime === startTime);
    if (!slot) {
      throw new BadRequestException(
        'Slotul cerut nu este în program, este în trecut sau este blocat.',
      );
    }

    const occupied = appointments.some((a) =>
      overlaps(slot.startTime, slot.endTime, a.startTime, a.endTime),
    );
    if (occupied) {
      throw new ConflictException('Slotul tocmai a fost rezervat');
    }

    return { endTime: slot.endTime };
  }

  /** Încarcă datele și generează grila de sloturi (fără filtrarea ocupării). */
  private async buildContext(
    doctorId: string,
    dateStr: string,
    serviceId: string,
    db: Db,
  ): Promise<SlotContext> {
    const doctor = await db.doctorProfile.findFirst({
      where: { id: doctorId, active: true },
    });
    if (!doctor) {
      throw new NotFoundException('Doctorul nu a fost găsit sau este inactiv');
    }

    const service = await db.service.findFirst({
      where: { id: serviceId, active: true },
    });
    if (!service) {
      throw new NotFoundException('Serviciul nu a fost găsit sau este inactiv');
    }

    const date = dateOnlyUtc(dateStr);
    const weekday = date.getUTCDay(); // 0=Duminică ... 6=Sâmbătă

    const workingHours = await db.workingHours.findMany({
      where: { doctorId, weekday },
    });
    if (workingHours.length === 0) {
      return { scheduleSlots: [], appointments: [] };
    }

    const duration = service.durationMinutes;

    const appointments = await db.appointment.findMany({
      where: {
        doctorId,
        date,
        status: { not: AppointmentStatus.CANCELLED },
      },
      select: { startTime: true, endTime: true },
    });

    const timeOffs = await db.timeOff.findMany({
      where: { doctorId, date },
      select: { startTime: true, endTime: true },
    });

    const isToday = dateStr === todayLocalDateStr();
    const nowMinutes = parseHHmm(nowLocalHHmm());

    const scheduleSlots: Slot[] = [];

    for (const wh of workingHours) {
      const blockStart = parseHHmm(wh.startTime);
      const blockEnd = parseHHmm(wh.endTime);

      for (
        let start = blockStart;
        start + duration <= blockEnd;
        start += duration
      ) {
        const slotStart = addMinutes(wh.startTime, start - blockStart);
        const slotEnd = addMinutes(slotStart, duration);

        // în trecut (doar dacă e azi)
        if (isToday && parseHHmm(slotStart) < nowMinutes) {
          continue;
        }

        // suprapunere cu time-off (interval sau toată ziua)
        const clashesTimeOff = timeOffs.some((t) => {
          if (!t.startTime || !t.endTime) return true; // toată ziua blocată
          return overlaps(slotStart, slotEnd, t.startTime, t.endTime);
        });
        if (clashesTimeOff) continue;

        scheduleSlots.push({ startTime: slotStart, endTime: slotEnd });
      }
    }

    return { scheduleSlots, appointments };
  }
}