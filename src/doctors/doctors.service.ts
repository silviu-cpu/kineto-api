import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthUser } from '../common/current-user.decorator';
import { assertDoctorOwnerOrAdmin } from '../common/ownership.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';

const PUBLIC_SELECT = {
  id: true,
  specialty: true,
  bio: true,
  photoUrl: true,
  defaultSlotMinutes: true,
  active: true,
  user: { select: { fullName: true, email: true } },
} satisfies Prisma.DoctorProfileSelect;

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  findAllPublic() {
    return this.prisma.doctorProfile.findMany({
      where: { active: true },
      select: PUBLIC_SELECT,
    });
  }

  async findOnePublic(id: string) {
    const doctor = await this.prisma.doctorProfile.findFirst({
      where: { id, active: true },
      select: PUBLIC_SELECT,
    });
    if (!doctor) {
      throw new NotFoundException('Doctorul nu a fost găsit');
    }
    return doctor;
  }

  async create(dto: CreateDoctorDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Există deja un cont cu acest email');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role: Role.DOCTOR,
        },
      });

      return tx.doctorProfile.create({
        data: {
          userId: user.id,
          specialty: dto.specialty,
          bio: dto.bio,
          photoUrl: dto.photoUrl,
          defaultSlotMinutes: dto.defaultSlotMinutes ?? 30,
        },
        select: PUBLIC_SELECT,
      });
    });
  }

  async update(id: string, dto: UpdateDoctorDto, user: AuthUser) {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { id },
    });
    if (!doctor) {
      throw new NotFoundException('Doctorul nu a fost găsit');
    }
    assertDoctorOwnerOrAdmin(user, id);

    const { fullName, ...profileData } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (fullName) {
        await tx.user.update({
          where: { id: doctor.userId },
          data: { fullName },
        });
      }
      return tx.doctorProfile.update({
        where: { id },
        data: profileData,
        select: PUBLIC_SELECT,
      });
    });
  }

  async softDelete(id: string) {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { id },
    });
    if (!doctor) {
      throw new NotFoundException('Doctorul nu a fost găsit');
    }
    return this.prisma.doctorProfile.update({
      where: { id },
      data: { active: false },
      select: PUBLIC_SELECT,
    });
  }
}
