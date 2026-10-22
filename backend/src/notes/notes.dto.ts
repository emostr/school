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

export class SaveNoteDto {
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

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsIn(['FILES', 'RICH'])
  kind!: 'FILES' | 'RICH';

  @IsOptional()
  @IsString()
  @MaxLength(500000)
  content?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  attachmentIds?: string[];
}
