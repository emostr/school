import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SaveHomeworkDto {
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

  @IsOptional()
  @IsIn(['', '1', '2'])
  group?: string;

  @IsString()
  @MaxLength(50000)
  content!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  attachmentIds?: string[];
}

export class TemplateDto {
  @IsString()
  @Length(1, 80)
  title!: string;

  @IsString()
  @Length(1, 5000)
  content!: string;
}
