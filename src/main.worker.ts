import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  const logger = new Logger('Worker');
  logger.log('BullMQ worker context online (processors land in Phase 1–2)');
  // Keep process alive; processors register via module providers in later phases.
  process.on('SIGINT', () => {
    void app.close().then(() => process.exit(0));
  });
}

void bootstrap();
