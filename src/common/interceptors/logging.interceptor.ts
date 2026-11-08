import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<{
      method: string;
      url: string;
      correlationId?: string;
    }>();
    const started = Date.now();
    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            `${req.method} ${req.url} ${Date.now() - started}ms cid=${req.correlationId ?? '-'}`,
          );
        },
        error: (err: Error) => {
          this.logger.warn(
            `${req.method} ${req.url} ${Date.now() - started}ms cid=${req.correlationId ?? '-'} err=${err.message}`,
          );
        },
      }),
    );
  }
}
