import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Appointment,
  AppointmentStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { AvailabilityService } from '../availability/availability.service';
import { AuthUser } from '../common/current-user.decorator';
import { dateOnlyUtc } from '../common/time.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { QueryAppointmentsDto } from './dto/query-appointments.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateAppointmentDto): Promise<Appointment> {
    const appointment = await this.prisma.$transaction(async (tx) => {
      // Re-validare pe server: doctor+service active, în program, nu în trecut,
      // nu în time-off, fără suprapunere. Întoarce endTime calculat.
      const { endTime } = await this.availability.assertSlotBookable(
        dto.doctorId,
        dto.date,
        dto.serviceId,
        dto.startTime,
        tx,
      );

      try {
        return await tx.appointment.create({
          data: {
            doctorId: dto.doctorId,
            serviceId: dto.serviceId,
            patientName: dto.patientName,
            patientPhone: dto.patientPhone,
            patientEmail: dto.patientEmail,
            notes: dto.notes,
            date: dateOnlyUtc(dto.date),
            startTime: dto.startTime,
            endTime,
            status: AppointmentStatus.CONFIRMED,
          },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw new ConflictException('Slotul tocmai a fost rezervat');
        }
        throw e;
      }
    });

    await this.sendNotificationSafe(appointment);
    return appointment;
  }

  findMany(user: AuthUser, query: QueryAppointmentsDto) {
    const where: Prisma.AppointmentWhereInput = {};

    if (user.role === Role.DOCTOR) {
      // Doctorul vede DOAR programările lui (ignoră doctorId din query).
      where.doctorId = user.doctorProfileId ?? '__none__';
    } else if (query.doctorId) {
      where.doctorId = query.doctorId;
    }

    if (query.date) {
      where.date = dateOnlyUtc(query.date);
    }
    if (query.status) {
      where.status = query.status;
    }

    return this.prisma.appointment.findMany({
      where,
      include: { service: true },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  }

  async updateStatus(id: string, dto: UpdateStatusDto, user: AuthUser) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });
    if (!appointment) {
      throw new NotFoundException('Programarea nu a fost găsită');
    }
    if (
      user.role === Role.DOCTOR &&
      appointment.doctorId !== user.doctorProfileId
    ) {
      throw new ForbiddenException('Nu poți modifica programări ale altui doctor');
    }

    return this.prisma.appointment.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  private async sendNotificationSafe(appointment: Appointment): Promise<void> {
    try {
      const doctor = await this.prisma.doctorProfile.findUnique({
        where: { id: appointment.doctorId },
        include: { user: true },
      });
      const service = await this.prisma.service.findUnique({
        where: { id: appointment.serviceId },
      });

      await this.notifications.notifyNewAppointment({
        doctorEmail: doctor?.user.email ?? null,
        doctorName: doctor?.user.fullName ?? 'Doctor',
        serviceName: service?.name ?? 'Serviciu',
        date: appointment.date.toISOString().slice(0, 10),
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        patientName: appointment.patientName,
        patientPhone: appointment.patientPhone,
        patientEmail: appointment.patientEmail,
        notes: appointment.notes,
      });
    } catch (e) {
      // Eșecul emailului NU trebuie să anuleze programarea.
      this.logger.error(
        `Trimiterea notificării a eșuat pentru programarea ${appointment.id}`,
        e instanceof Error ? e.stack : String(e),
      );
    }
  }
}
