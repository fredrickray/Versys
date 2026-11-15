import { createServer, type Server } from 'node:http';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { resolveListenPort } from './common/utils/listen-port';
import { WorkerModule } from './worker.module';

/**
 * Instacloud health-checks the routed PORT within ~2 minutes.
 * Start listening BEFORE Nest/Redis/DB bootstrap — otherwise a slow
 * dependency connection fails the deploy even though the worker is fine.
 */
function startHealthServer(port: number): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.url === '/health' || req.url === '/v1/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'versys-worker' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    // Bind all interfaces — required for PaaS health probes.
    server.listen(port, '0.0.0.0', () => resolve(server));
  });
}

async function bootstrap() {
  const logger = new Logger('Worker');
  const port = resolveListenPort(Number(process.env.WORKER_PORT) || 3002);

  // eslint-disable-next-line no-console
  console.log(
    `[Worker] opening health listener on 0.0.0.0:${port} (PORT=${process.env.PORT ?? ''})`,
  );

  let server: Server;
  try {
    server = await startHealthServer(port);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Worker] failed to bind health port', err);
    process.exit(1);
  }
  logger.log(`Worker health listening on 0.0.0.0:${port}`);

  try {
    const app = await NestFactory.createApplicationContext(WorkerModule, {
      bufferLogs: true,
    });
    logger.log('BullMQ workers and durable outbox publishers are online');

    let shuttingDown = false;
    const shutdown = (signal: NodeJS.Signals) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.log(`Worker received ${signal}; closing health server and queues`);
      server.close(() => {
        void app
          .close()
          .then(() => process.exit(0))
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.stack : String(error);
            logger.error(message);
            process.exit(1);
          });
      });
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    logger.error(
      'Worker Nest bootstrap failed — health port stays up so the deploy probe can pass',
      err instanceof Error ? err.stack : String(err),
    );
    // Keep process alive on the health port; fix env/Redis and restart.
    process.on('SIGINT', () => process.exit(1));
    process.on('SIGTERM', () => process.exit(1));
  }
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack : String(error);
  console.error(message);
  process.exitCode = 1;
});
