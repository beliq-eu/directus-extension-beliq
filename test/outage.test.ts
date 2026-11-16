import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../src/api';
import { TIMEOUT_MS } from '../src/lib/beliq';

// The real operation handler and SDK client, with the fit they ship, against a
// real HTTP server on 127.0.0.1, unscaled. Global fetch only rewrites the fixed
// https://api.beliq.eu origin to that server. Directus documents no limit for
// an operation, so each case ends within one attempt's deadline.
const API_ORIGIN = 'https://api.beliq.eu';
const realFetch = globalThis.fetch;

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let server: Server;
let origin: string;
let requests: number;
let handler: Handler;

beforeEach(async () => {
  requests = 0;
  server = createServer((req, res) => {
    requests++;
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.stubGlobal('fetch', (url: string | URL, init?: RequestInit) =>
    realFetch(String(url).replace(API_ORIGIN, origin), init),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  if (server.listening) await close();
});

function close(): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

async function validate(): Promise<{ message: string; ms: number }> {
  const started = performance.now();
  try {
    await api.handler({ operation: 'validate', apiKey: 'test-key', validateDocument: '<Invoice/>' }, {
      env: {},
    } as never);
  } catch (error) {
    return { message: (error as Error).message, ms: performance.now() - started };
  }
  throw new Error('the operation did not fail');
}

describe('an operation during an outage fails within one attempt and says when to try again', () => {
  it('names the server wait of a 503 DATABASE_UNAVAILABLE, after one request', async () => {
    handler = (_req, res) => {
      res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '30' });
      res.end(JSON.stringify({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'database unavailable' } }));
    };
    const result = await validate();
    expect(result.message).toBe(
      'beliq is unavailable for now: database unavailable. Try again in 30 seconds (DATABASE_UNAVAILABLE)',
    );
    expect(requests).toBe(1);
  });

  it('does not retry a blip either', async () => {
    handler = (_req, res) => {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('upstream unavailable');
    };
    const result = await validate();
    expect(result.message).toMatch(/^beliq is unavailable for now: .+\. beliq did not say when; try again later$/);
    expect(requests).toBe(1);
  });

  it('ends a hung attempt at its deadline', async () => {
    handler = () => {};
    const result = await validate();
    expect(requests).toBe(1);
    expect(result.ms).toBeGreaterThanOrEqual(TIMEOUT_MS);
    expect(result.ms).toBeLessThan(TIMEOUT_MS + 2_000);
  }, TIMEOUT_MS + 10_000);

  it('says beliq could not be reached when nothing listens', async () => {
    await close();
    const result = await validate();
    expect(result.message).toMatch(
      /^beliq is unavailable for now: could not reach the beliq API \(.+\)\. beliq did not say when; try again later$/,
    );
    expect(result.ms).toBeLessThan(TIMEOUT_MS);
  });
});
