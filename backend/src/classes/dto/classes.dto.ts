import { IsInt, IsOptional, IsString, Length, Matches, Max, Min, ValidateIf } from 'class-validator';

export class CreateClassDto {
  @IsInt()
  @Min(1)
  @Max(11)
  number!: number;

  @IsString()
  @Length(1, 1)
  @Matches(/^[А-ЯЁ]$/, { message: 'Буква класса — одна прописная русская буква' })
  letter!: string;

  @IsOptional()
  @IsString()
  homeroomId?: string;
}

export class HomeroomDto {
  /** null — снять классного руководителя. */
  @ValidateIf((_, value) => value !== null)
  @IsString()
  homeroomId!: string | null;
}

export class PromoteClassDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(11)
  number?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[А-ЯЁ]$/)
  letter?: string;
}
