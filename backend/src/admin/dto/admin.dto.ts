import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class BellDto {
  @IsInt()
  @Min(0)
  @Max(12)
  number!: number;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Время звонка — в формате ЧЧ:ММ' })
  start!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Время звонка — в формате ЧЧ:ММ' })
  end!: string;
}

export class PeriodDto {
  @IsString()
  @Length(1, 40)
  title!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
}

export class UpdateSchoolDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  shortName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  @IsOptional()
  @IsIn([5, 6])
  weekDays?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(13)
  @ValidateNested({ each: true })
  @Type(() => BellDto)
  bells?: BellDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => PeriodDto)
  periods?: PeriodDto[];
}

export class CreateHeadDto {
  @IsString()
  @Length(1, 60)
  lastName!: string;

  @IsString()
  @Length(1, 60)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  middleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  subject?: string;

  /** Завуч, который ещё и ведёт уроки. */
  @IsOptional()
  @IsBoolean()
  teaches?: boolean;
}

export class HeadPrivilegeDto {
  @IsBoolean()
  head!: boolean;
}
