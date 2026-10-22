import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateAnswerDto {
  @IsString()
  questionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  raw?: string;

  /** Учитель может переспорить автопроверку: засчитать или снять ответ. */
  @IsOptional()
  @IsBoolean()
  correct?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class AssignStudentDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  studentName?: string;
}

export class AttachPageDto {
  @IsString()
  @MaxLength(200)
  file!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9)
  pageIndex?: number;
}
