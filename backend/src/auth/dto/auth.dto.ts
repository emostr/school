import { IsIn, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(3, 60)
  login!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}

export class TotpLoginDto {
  @IsString()
  ticket!: string;

  @IsString()
  @Length(4, 20)
  code!: string;
}

export class ChangePasswordDto {
  @IsString()
  @Length(1, 128)
  currentPassword!: string;

  @IsString()
  @MinLength(10, { message: 'Пароль должен быть не короче 10 символов' })
  @MaxLength(128)
  newPassword!: string;
}

export class ConfirmTotpDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  subject?: string;
}

export class PreferencesDto {
  @IsOptional()
  @IsIn(['dark', 'light'])
  theme?: 'dark' | 'light';

  /** toast — плашка в углу, popup — окно посреди экрана. */
  @IsOptional()
  @IsIn(['toast', 'popup'])
  notify?: 'toast' | 'popup';
}
