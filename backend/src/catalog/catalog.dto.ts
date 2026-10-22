import { IsDateString, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class SubjectDto {
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  short?: string;
}

export class RoomDto {
  @IsString()
  @Length(1, 40)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  note?: string;
}

export class HolidayDto {
  @IsString()
  @Length(2, 80)
  title!: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
