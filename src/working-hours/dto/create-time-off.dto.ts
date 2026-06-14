import { IsOptional, IsString, Matches } from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateTimeOffDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date trebuie să fie "YYYY-MM-DD"' })
  date: string;

  @IsOptional()
  @Matches(HHMM, { message: 'startTime trebuie să fie în format "HH:mm"' })
  startTime?: string;

  @IsOptional()
  @Matches(HHMM, { message: 'endTime trebuie să fie în format "HH:mm"' })
  endTime?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
