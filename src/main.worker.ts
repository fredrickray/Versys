import { createServer } from 'http';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { resolveListenPort } from './common/utils/listen-port';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  const logger = new Logger('Worker');
  logger.log('BullMQ worker context online');

  // Instacloud (and similar hosts) require a process to accept TCP on the
  // routed PORT. Workers have no public API — expose a tiny health listener.
  const port = resolveListenPort(Number(process.env.WORKER_PORT) || 3002);
  const server = createServer((req, res) => {
    if (req.url === '/health' || req.url === '/v1/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'versys-worker' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve, reject) => {
    server.listen(port, () => resolve());
    server.on('error', reject);
  });
  logger.log(`Worker health listening on :${port}`);

  const shutdown = () => {
    server.close(() => {
      void app.close().then(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void bootstrap();
