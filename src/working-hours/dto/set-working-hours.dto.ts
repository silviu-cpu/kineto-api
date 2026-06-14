import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class WorkingHourItemDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday: number;

  @Matches(HHMM, { message: 'startTime trebuie să fie în format "HH:mm"' })
  startTime: string;

  @Matches(HHMM, { message: 'endTime trebuie să fie în format "HH:mm"' })
  endTime: string;
}

export class SetWorkingHoursDto {
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => WorkingHourItemDto)
  items: WorkingHourItemDto[];
}
