import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve } from 'node:path';
import Redis from 'ioredis';
import { Pool } from 'pg';
import request, { type Response } from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { DEMO_PHONES } from '../../src/database/seeds/demo-users.seed';
import type { RealtimeEnvelope } from '../../src/modules/realtime/realtime-envelope';

const ROOT = resolve(__dirname, '../..');
const API_PORT = 3210;
const REALTIME_PORT = 3211;
const DEVICE_ID = '00000000-0000-4000-8000-000000000030';

type Tokens = { accessToken: string; refreshToken: string };
type ManagedProcess = {
  child: ChildProcessWithoutNullStreams;
  output: string[];
};

describe('API to worker to dedicated realtime process', () => {
  const processes: ManagedProcess[] = [];
  const sockets: Socket[] = [];
  let redis: Redis;
  let pool: Pool;

  beforeAll(() => {
    redis = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB ?? 0),
    });
    pool = new Pool({
      host: process.env.DATABASE_HOST ?? 'localhost',
      port: Number(process.env.DATABASE_PORT ?? 5432),
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
    });
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    for (const managed of processes.reverse()) await stop(managed.child);
    await pool?.query(
      `UPDATE users SET is_active = true, is_dispatcher = true WHERE phone_e164 = $1`,
      [DEMO_PHONES.dispatcher],
    );
    await redis?.quit();
    await pool?.end();
  });

  it('relays committed events only to currently authorized sockets', async () => {
    const api = start('dist/main.api.js', {
      API_PORT: String(API_PORT),
    });
    const realtime = start('dist/main.realtime.js', {
      REALTIME_PORT: String(REALTIME_PORT),
    });
    processes.push(api, realtime);

    await waitForHttp(`http://127.0.0.1:${API_PORT}/v1/health`, api);
    await waitForHttp(`http://127.0.0.1:${REALTIME_PORT}/health`, realtime);

    await expect(connect()).rejects.toThrow('unauthorized');

    const reporter = await login(DEMO_PHONES.reporter, DEVICE_ID);
    const dispatcher = await login(
      DEMO_PHONES.dispatcher,
      '00000000-0000-4000-8000-000000000031',
    );
    const unrelatedPhone = `+234813${String(Date.now()).slice(-7)}`;
    const unrelated = await login(
      unrelatedPhone,
      '00000000-0000-4000-8000-000000000032',
    );

    const dispatchSocket = await connect(dispatcher.accessToken);
    const unrelatedSocket = await connect(unrelated.accessToken);
    sockets.push(dispatchSocket, unrelatedSocket);

    expect(await subscribe(dispatchSocket, 'subscribe:dispatch')).toEqual({
      ok: true,
    });
    expect(await subscribe(unrelatedSocket, 'subscribe:dispatch')).toEqual({
      ok: false,
      error: 'forbidden',
    });

    let unrelatedReceived = false;
    unrelatedSocket.on('incident.created', () => {
      unrelatedReceived = true;
    });

    const firstIncident = await createIncident(
      reporter.accessToken,
      'relay-one',
    );
    let beforeWorkerReceived = false;
    dispatchSocket.once('incident.created', () => {
      beforeWorkerReceived = true;
    });
    await delay(300);
    expect(beforeWorkerReceived).toBe(false);

    const firstEvent = waitForIncident(dispatchSocket, firstIncident.id);
    const worker = start('dist/main.worker.js');
    processes.push(worker);
    const delivered = await firstEvent;
    expect(delivered.type).toBe('incident.created');
    expect(unrelatedReceived).toBe(false);
    await waitForPublished(firstIncident.id);

    const controlUser = await pool.query<{ id: string }>(
      `UPDATE users SET is_dispatcher = true WHERE phone_e164 = $1 RETURNING id`,
      [unrelatedPhone],
    );
    expect(controlUser.rowCount).toBe(1);
    expect(await subscribe(unrelatedSocket, 'subscribe:dispatch')).toEqual({
      ok: true,
    });

    const dispatcherUser = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE phone_e164 = $1`,
      [DEMO_PHONES.dispatcher],
    );
    await pool.query(`UPDATE users SET is_active = false WHERE id = $1`, [
      dispatcherUser.rows[0].id,
    ]);

    let deactivatedReceived = false;
    dispatchSocket.on('incident.created', () => {
      deactivatedReceived = true;
    });
    const secondPromise = waitForIncident(unrelatedSocket, 'pending');
    const secondIncident = await createIncident(
      reporter.accessToken,
      'relay-two',
    );
    const second = await retarget(
      secondPromise,
      unrelatedSocket,
      secondIncident.id,
    );
    expect(second.incidentId).toBe(secondIncident.id);
    await delay(200);
    expect(deactivatedReceived).toBe(false);
    expect(dispatchSocket.connected).toBe(false);

    await pool.query(
      `UPDATE users SET is_active = true, is_dispatcher = true WHERE id = $1`,
      [dispatcherUser.rows[0].id],
    );
    const freshDispatcher = await login(
      DEMO_PHONES.dispatcher,
      '00000000-0000-4000-8000-000000000033',
    );
    const revokedSocket = await connect(freshDispatcher.accessToken);
    sockets.push(revokedSocket);
    expect(await subscribe(revokedSocket, 'subscribe:dispatch')).toEqual({
      ok: true,
    });
    await pool.query(`UPDATE users SET is_dispatcher = false WHERE id = $1`, [
      dispatcherUser.rows[0].id,
    ]);

    let revokedReceived = false;
    revokedSocket.on('incident.created', () => {
      revokedReceived = true;
    });
    const thirdPromise = waitForIncident(unrelatedSocket, 'pending');
    const thirdIncident = await createIncident(
      reporter.accessToken,
      'relay-three',
    );
    const third = await thirdPromise;
    expect(third.incidentId).toBe(thirdIncident.id);
    await delay(200);
    expect(revokedReceived).toBe(false);
  }, 45_000);

  function start(
    entry: string,
    overrides: Record<string, string> = {},
  ): ManagedProcess {
    const output: string[] = [];
    const child = spawn(process.execPath, [entry], {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        API_PORT: String(API_PORT),
        REALTIME_PORT: String(REALTIME_PORT),
        SMS_PROVIDER: 'mock',
        CHANNEL_SIMULATOR_ONLY: 'true',
        ...overrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString()));
    return { child, output };
  }

  async function login(phoneE164: string, deviceId: string): Promise<Tokens> {
    await redis.del(`otp:throttle:${phoneE164}`);
    await request(`http://127.0.0.1:${API_PORT}`)
      .post('/v1/auth/otp/request')
      .send({ phoneE164 })
      .expect(202);
    const code = await redis.get(`otp:${phoneE164}`);
    const response: Response = await request(`http://127.0.0.1:${API_PORT}`)
      .post('/v1/auth/otp/verify')
      .send({ phoneE164, code, deviceId })
      .expect(201);
    return response.body as Tokens;
  }

  async function createIncident(
    accessToken: string,
    label: string,
  ): Promise<{ id: string }> {
    const response: Response = await request(`http://127.0.0.1:${API_PORT}`)
      .post('/v1/incidents')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'fight', channel: 'app_button', locationLabel: label })
      .expect(201);
    return response.body as { id: string };
  }

  async function connect(token?: string): Promise<Socket> {
    return new Promise((resolveSocket, reject) => {
      const socket = io(`http://127.0.0.1:${REALTIME_PORT}/realtime`, {
        auth: token ? { token } : {},
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        timeout: 3_000,
      });
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error('socket_timeout'));
      }, 4_000);
      socket.once('connect', () => {
        clearTimeout(timer);
        resolveSocket(socket);
      });
      socket.once('connect_error', (error) => {
        clearTimeout(timer);
        socket.disconnect();
        reject(error);
      });
    });
  }

  async function subscribe(
    socket: Socket,
    event: 'subscribe:dispatch' | 'subscribe:incident',
    body?: Record<string, unknown>,
  ): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolveAck, reject) => {
      socket
        .timeout(3_000)
        .emit(event, body, (error: Error | null, ack: unknown) => {
          if (error) reject(error);
          else resolveAck(ack as { ok: boolean; error?: string });
        });
    });
  }

  function waitForIncident(
    socket: Socket,
    incidentId: string,
  ): Promise<RealtimeEnvelope> {
    return new Promise((resolveEvent, reject) => {
      const timer = setTimeout(
        () => reject(new Error('realtime_timeout')),
        8_000,
      );
      const listener = (event: RealtimeEnvelope) => {
        if (incidentId !== 'pending' && event.incidentId !== incidentId) return;
        clearTimeout(timer);
        socket.off('incident.created', listener);
        resolveEvent(event);
      };
      socket.on('incident.created', listener);
    });
  }

  async function retarget(
    pending: Promise<RealtimeEnvelope>,
    socket: Socket,
    incidentId: string,
  ): Promise<RealtimeEnvelope> {
    const event = await pending;
    if (event.incidentId === incidentId) return event;
    return waitForIncident(socket, incidentId);
  }

  async function waitForPublished(incidentId: string): Promise<void> {
    await waitFor(async () => {
      const result = await pool.query<{ published_at: Date | null }>(
        `SELECT published_at FROM realtime_outbox WHERE incident_id = $1`,
        [incidentId],
      );
      return !!result.rows[0]?.published_at;
    });
  }
});

async function waitForHttp(
  url: string,
  processInfo: ManagedProcess,
): Promise<void> {
  await waitFor(async () => {
    if (processInfo.child.exitCode != null) {
      throw new Error(`process_exited:${processInfo.output.join('')}`);
    }
    try {
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  });
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await delay(50);
  }
  throw new Error('condition_timeout');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function stop(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode != null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((resolveExit) => child.once('exit', () => resolveExit())),
    delay(2_000),
  ]);
  if (child.exitCode == null) child.kill('SIGKILL');
}
