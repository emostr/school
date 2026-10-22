import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateAssignmentDto {
  @IsString()
  testId!: string;

  @IsString()
  classId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** Запасные бланки без фамилии — для новеньких и для испорченных листов. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  spare?: number;
}

export class UpdateAssignmentDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
