import { AppointmentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export class QueryAppointmentsDto {
  @IsOptional()
  @IsString()
  doctorId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date trebuie să fie "YYYY-MM-DD"' })
  date?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;
}
