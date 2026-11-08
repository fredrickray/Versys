import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

export const CORRELATION_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<{
      headers: Record<string, string>;
      correlationId?: string;
    }>();
    const res = http.getResponse<{
      setHeader: (k: string, v: string) => void;
    }>();
    const id = req.headers[CORRELATION_HEADER] || randomUUID();
    req.correlationId = id;
    res.setHeader(CORRELATION_HEADER, id);
    return next.handle().pipe(tap(() => undefined));
  }
}
