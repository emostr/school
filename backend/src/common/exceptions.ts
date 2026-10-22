import { HttpException, HttpStatus } from '@nestjs/common';

/** 423 Locked — учётная запись не прошла обязательную настройку. */
export class SetupRequiredException extends HttpException {
  constructor(message: string) {
    super({ statusCode: HttpStatus.LOCKED, error: 'SETUP_REQUIRED', message }, HttpStatus.LOCKED);
  }
}
