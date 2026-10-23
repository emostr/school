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

export const GRADE_KINDS = [
  'LESSON',
  'ORAL',
  'HOMEWORK',
  'INDEPENDENT',
  'QUIZ',
  'TEST',
  'DICTATION',
  'ESSAY',
  'LAB',
  'PROJECT',
  'EXAM',
  'OTHER',
] as const;

export type GradeKindInput = (typeof GRADE_KINDS)[number];

/** Вес по умолчанию: контрольная весит втрое больше ответа у доски. */
export const DEFAULT_WEIGHTS: Record<GradeKindInput, number> = {
  LESSON: 1,
  ORAL: 1,
  HOMEWORK: 1,
  INDEPENDENT: 2,
  QUIZ: 2,
  TEST: 3,
  DICTATION: 2,
  ESSAY: 2,
  LAB: 2,
  PROJECT: 2,
  EXAM: 4,
  OTHER: 1,
};

export class GradeDto {
  @IsString()
  classId!: string;

  @IsString()
  subjectId!: string;

  @IsString()
  studentId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  lessonNumber?: number | null;

  @IsInt()
  @Min(1)
  @Max(5)
  value!: number;

  @IsOptional()
  @IsIn(GRADE_KINDS)
  kind?: GradeKindInput;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  weight?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  comment?: string;
}

export class UpdateGradeDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  value?: number;

  @IsOptional()
  @IsIn(GRADE_KINDS)
  kind?: GradeKindInput;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  weight?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  comment?: string;
}

export class BulkMarkDto {
  @IsString()
  studentId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  value!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  comment?: string;
}

/** Колонка оценок за одну работу: контрольная, диктант — всему классу сразу. */
export class BulkGradesDto {
  @IsString()
  classId!: string;

  @IsString()
  subjectId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  lessonNumber?: number | null;

  @IsIn(GRADE_KINDS)
  kind!: GradeKindInput;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  weight?: number;

  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => BulkMarkDto)
  marks!: BulkMarkDto[];
}

export class ImportAssignmentDto {
  @IsString()
  assignmentId!: string;

  @IsString()
  subjectId!: string;

  @IsIn(GRADE_KINDS)
  kind!: GradeKindInput;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  weight?: number;
}
