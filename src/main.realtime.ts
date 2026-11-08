import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { RealtimeAppModule } from './realtime.module';

async function bootstrap() {
  const app = await NestFactory.create(RealtimeAppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Realtime');
  const port = config.getOrThrow<number>('realtimePort');
  await app.listen(port);
  logger.log(
    `Realtime listening on :${port} (Socket.IO gateway lands in Phase 1)`,
  );
}

void bootstrap();
