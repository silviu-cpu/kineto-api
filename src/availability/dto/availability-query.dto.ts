import { IsString, Matches } from 'class-validator';

export class AvailabilityQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date trebuie să fie "YYYY-MM-DD"' })
  date: string;

  @IsString()
  serviceId: string;
}
