import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const QUESTION_TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SHORT_ANSWER', 'EXTENDED'] as const;

export class OptionInput {
  @IsString()
  @Length(1, 40)
  id!: string;

  @IsString()
  @MaxLength(2000)
  content!: string;
}

export class QuestionInput {
  @IsIn(QUESTION_TYPES)
  type!: (typeof QUESTION_TYPES)[number];

  /** 0 — задание во всех вариантах, 1..N — только в своём. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8)
  variant?: number;

  @IsString()
  @MaxLength(20000)
  content!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  points!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionInput)
  options!: OptionInput[];

  @IsObject()
  answerKey!: Record<string, unknown>;
}

export class SaveTestDto {
  @IsString()
  @Length(2, 200)
  title!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  variantCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  instructions?: string;

  @IsOptional()
  @IsObject()
  gradeScale?: Record<string, number>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionInput)
  questions!: QuestionInput[];
}

export class ShareDto {
  @IsString()
  teacherId!: string;

  @IsOptional()
  @IsBoolean()
  canEdit?: boolean;
}
