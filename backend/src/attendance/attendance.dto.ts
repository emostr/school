import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const STATUSES = ['PRESENT', 'SICK', 'EXCUSED', 'UNEXCUSED'] as const;

export class MarkInput {
  @IsString()
  studentId!: string;

  @IsIn(STATUSES)
  status!: (typeof STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class SaveLessonDto {
  @IsString()
  classId!: string;

  @IsDateString()
  date!: string;

  @IsInt()
  @Min(0)
  @Max(12)
  number!: number;

  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => MarkInput)
  marks!: MarkInput[];
}
