import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { resolveListenPort } from './common/utils/listen-port';
import { RealtimeAppModule } from './realtime.module';

async function bootstrap() {
  const app = await NestFactory.create(RealtimeAppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Realtime');
  // Prefer Instacloud PORT (routed health-check) over REALTIME_PORT.
  const port = resolveListenPort(config.getOrThrow<number>('realtimePort'));
  await app.listen(port, '0.0.0.0');
  logger.log(
    `Realtime Socket.IO listening on 0.0.0.0:${port} (namespace /realtime)`,
  );
}

void bootstrap();
