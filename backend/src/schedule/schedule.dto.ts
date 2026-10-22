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

export class LessonInput {
  @IsInt()
  @Min(1)
  @Max(7)
  weekday!: number;

  @IsInt()
  @Min(0)
  @Max(12)
  number!: number;

  @IsOptional()
  @IsIn(['', '1', '2'])
  group?: string;

  @IsString()
  subjectId!: string;

  @IsOptional()
  @IsString()
  teacherId?: string | null;

  @IsOptional()
  @IsString()
  roomId?: string | null;
}

export class SaveVersionDto {
  @IsDateString()
  validFrom!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LessonInput)
  lessons!: LessonInput[];
}

export class SaveChangeDto {
  @IsDateString()
  date!: string;

  @IsInt()
  @Min(0)
  @Max(12)
  number!: number;

  @IsOptional()
  @IsIn(['', '1', '2'])
  group?: string;

  @IsIn(['REPLACE', 'CANCEL', 'ADD'])
  kind!: 'REPLACE' | 'CANCEL' | 'ADD';

  @IsOptional()
  @IsString()
  subjectId?: string | null;

  @IsOptional()
  @IsString()
  teacherId?: string | null;

  @IsOptional()
  @IsString()
  roomId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
