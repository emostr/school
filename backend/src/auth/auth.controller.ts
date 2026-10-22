import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';
import { AllowSetup } from '../common/decorators/allow-setup.decorator';
import { Access } from '../common/decorators/access.decorator';
import { CurrentAccount } from '../common/decorators/current-account.decorator';
import { RequestAccount, SESSION_COOKIE } from '../common/types';
import {
  ChangePasswordDto,
  ConfirmTotpDto,
  LoginDto,
  PreferencesDto,
  TotpLoginDto,
  UpdateProfileDto,
} from './dto/auth.dto';

@Controller('auth')
@Access('ANY')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private context(req: FastifyRequest) {
    return { ip: req.ip ?? '', userAgent: String(req.headers['user-agent'] ?? '').slice(0, 250) };
  }

  /**
   * Флаг Secure выставляем по схеме публичного адреса, а не по NODE_ENV:
   * платформа, поднятая по http, иначе выдаёт Secure-cookie, которую Safari
   * молча выбрасывает — вход проходит, а следующий запрос получает 401.
   */
  private secureCookies(): boolean {
    return (this.config.get<string>('PUBLIC_URL') ?? '').startsWith('https://');
  }

  private setCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.secureCookies(),
      path: '/',
      expires: expiresAt,
    });
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.login(dto.login, dto.password, this.context(req));
    if (result.stage === 'totp') {
      return { stage: 'totp', ticket: result.ticket };
    }
    this.setCookie(reply, result.token, result.expiresAt);
    return { stage: 'session', profile: result.profile };
  }

  @Public()
  @Post('login/totp')
  @HttpCode(200)
  async loginTotp(
    @Body() dto: TotpLoginDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.completeTotpLogin(dto.ticket, dto.code, this.context(req));
    this.setCookie(reply, result.token, result.expiresAt);
    return { stage: 'session', profile: result.profile };
  }

  @AllowSetup()
  @Get('me')
  me(@CurrentAccount() account: RequestAccount) {
    return this.auth.profile(account.id);
  }

  @Patch('me')
  updateProfile(@CurrentAccount() account: RequestAccount, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(account.id, dto.subject);
  }

  /** Тема и вид уведомлений меняются и во время первичной настройки. */
  @AllowSetup()
  @Patch('preferences')
  preferences(@CurrentAccount() account: RequestAccount, @Body() dto: PreferencesDto) {
    return this.auth.updatePreferences(account.id, dto);
  }

  @AllowSetup()
  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentAccount() account: RequestAccount, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.auth.logout(account.sessionId);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @AllowSetup()
  @Post('password')
  @HttpCode(200)
  changePassword(@CurrentAccount() account: RequestAccount, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(account.id, dto.currentPassword, dto.newPassword, account.sessionId);
  }

  @AllowSetup()
  @Post('totp/setup')
  @HttpCode(200)
  startTotp(@CurrentAccount() account: RequestAccount) {
    return this.auth.startTotpSetup(account.id);
  }

  @AllowSetup()
  @Post('totp/confirm')
  @HttpCode(200)
  confirmTotp(@CurrentAccount() account: RequestAccount, @Body() dto: ConfirmTotpDto) {
    return this.auth.confirmTotpSetup(account.id, dto.code);
  }

  @Post('totp/disable')
  @HttpCode(200)
  disableTotp(@CurrentAccount() account: RequestAccount, @Body('password') password: string) {
    return this.auth.disableTotp(account, password ?? '');
  }

  @Post('backup-codes')
  @HttpCode(200)
  regenerateBackupCodes(@CurrentAccount() account: RequestAccount) {
    return this.auth.regenerateBackupCodes(account.id);
  }

  @Get('sessions')
  listSessions(@CurrentAccount() account: RequestAccount) {
    return this.auth.listSessions(account.id, account.sessionId);
  }

  @Delete('sessions/:id')
  async revokeSession(@CurrentAccount() account: RequestAccount, @Param('id') id: string) {
    await this.auth.revokeSession(account.id, id);
    return { ok: true };
  }

  @Delete('sessions')
  revokeOthers(@CurrentAccount() account: RequestAccount) {
    return this.auth.revokeOtherSessions(account.id, account.sessionId);
  }

  @Access('TEACHER', 'HEAD')
  @Get('colleagues')
  colleagues(@CurrentAccount() account: RequestAccount) {
    return this.auth.colleagues(account);
  }
}
