import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
}

function extract(exception: unknown): ErrorBody {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return { statusCode: status, error: exception.name, message: response };
    }
    const body = response as Record<string, unknown>;
    const raw = body.message;
    const message = Array.isArray(raw) ? raw.join('; ') : String(raw ?? exception.message);
    return {
      statusCode: status,
      error: String(body.error ?? exception.name),
      message,
    };
  }
  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    error: 'InternalServerError',
    message: 'Внутренняя ошибка сервера',
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const body = extract(exception);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    void reply.status(body.statusCode).send(body);
  }
}
