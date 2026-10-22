import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export const PRIVILEGES = ['STUDENT', 'TRUSTED', 'TEACHER', 'HEAD'] as const;
export type PrivilegeInput = (typeof PRIVILEGES)[number];

export class CreateAccountDto {
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

  @IsArray()
  @IsIn(PRIVILEGES, { each: true })
  privileges!: PrivilegeInput[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  subject?: string;

  /** Класс ученика — обязателен, если среди привилегий есть STUDENT. */
  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsIn(['', '1', '2'])
  group?: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  lastName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  middleName?: string;

  @IsOptional()
  @IsArray()
  @IsIn(PRIVILEGES, { each: true })
  privileges?: PrivilegeInput[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  subject?: string;
}

export class ImportStudentsDto {
  @IsString()
  classId!: string;

  /** Список колонкой из журнала: «Фамилия Имя Отчество» на строку. */
  @IsArray()
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  lines!: string[];
}

export class TrustedDto {
  @IsBoolean()
  trusted!: boolean;
}

export class GroupDto {
  @IsIn(['', '1', '2'])
  group!: string;
}

export class MoveStudentDto {
  @IsString()
  classId!: string;
}

export class ListAccountsQuery {
  @IsOptional()
  @IsIn([...PRIVILEGES, 'STAFF'])
  privilege?: PrivilegeInput | 'STAFF';

  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  /** Строкой: из адреса приходит «true», а не логическое значение. */
  @IsOptional()
  @IsIn(['true', 'false'])
  blocked?: string;
}
