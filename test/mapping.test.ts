import { describe, expect, it } from 'vitest';
import { Beliq } from '@beliq/sdk';

// These tests assert that each beliq operation, driven through the SDK exactly
// as src/api.ts drives it, maps its options onto the right wire request:
// URL path, method, query string, headers, and body. A recording fetch stands
// in for the network, so nothing here touches the live API. The recorder can
// return either a JSON envelope (validate/parse) or raw bytes with response
// headers (generate/convert), matching what the real API returns per operation.

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

interface StubResponse {
  status?: number;
  headers?: Record<string, string>;
  /** JSON envelope body (validate/parse). */
  json?: unknown;
  /** Raw bytes body (generate/convert). */
  bytes?: Uint8Array;
}

function recordingFetch(response: StubResponse) {
  const calls: Recorded[] = [];
  const status = response.status ?? 200;
  const headers = new Headers(response.headers ?? {});

  const bytes: Uint8Array = response.bytes
    ? response.bytes
    : new TextEncoder().encode(JSON.stringify(response.json ?? { success: true, data: {} }));

  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const initHeaders = (init?.headers ?? {}) as Record<string, string>;
    const rawBody = init?.body;
    let body: string | undefined;
    if (typeof rawBody === 'string') {
      body = rawBody;
    } else if (rawBody instanceof Uint8Array) {
      body = new TextDecoder().decode(rawBody);
    }
    calls.push({
      url: String(input),
      method: String(init?.method ?? 'GET'),
      headers: { ...initHeaders },
      body,
    });
    return {
      ok: status >= 200 && status < 300,
      status,
      headers,
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as unknown as Response;
  }) as unknown as typeof fetch;

  return { fetchImpl, calls };
}

const API_KEY = 'test_key_123';

function parseUrl(url: string) {
  const u = new URL(url);
  return { path: u.pathname, query: Object.fromEntries(u.searchParams.entries()) };
}

describe('beliq operation mapping', () => {
  it('generate (xml) posts a JSON body to /v1/generate and decodes the XML', async () => {
    const { fetchImpl, calls } = recordingFetch({
      headers: { 'content-type': 'application/xml', 'x-schematron-version': 'xr-3.0.2' },
      bytes: new TextEncoder().encode('<Invoice/>'),
    });
    const beliq = new Beliq({ apiKey: API_KEY, fetch: fetchImpl });

    const result = await beliq.generate({
      standard: 'xrechnung',
      invoice: { number: 'INV-1' } as any,
      output: 'xml',
      profile: 'en16931',
    });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    const { path } = parseUrl(call.url);
    expect(call.method).toBe('POST');
    expect(path).toBe('/v1/generate');
    expect(call.headers['Content-Type']).toBe('application/json');
    expect(call.headers['X-API-Key']).toBe(API_KEY);
    expect(JSON.parse(call.body!)).toEqual({
      standard: 'xrechnung',
      output: 'xml',
      invoice: { number: 'INV-1' },
      profile: 'en16931',
    });
    expect(result.contentType).toBe('application/xml');
    expect(result.xml).toBe('<Invoice/>');
    expect(result.meta.schematronVersion).toBe('xr-3.0.2');
  });

  it('generate (pdf) sends output=pdf and pdfTemplateId, returns raw PDF bytes', async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]); // %PDF-1
    const { fetchImpl, calls } = recordingFetch({
      headers: { 'content-type': 'application/pdf', 'x-pdf-kind': 'facturx' },
      bytes: pdf,
    });
    const beliq = new Beliq({ apiKey: API_KEY, fetch: fetchImpl });

    const result = await beliq.generate({
      standard: 'facturx',
      invoice: { number: 'INV-2' } as any,
      output: 'pdf',
      profile: 'en16931',
      pdfTemplateId: 'tpl_abc',
    });

    const body = JSON.parse(calls[0].body!);
    expect(body.output).toBe('pdf');
    expect(body.pdfTemplateId).toBe('tpl_abc');
    expect(body.standard).toBe('facturx');
    expect(result.contentType).toBe('application/pdf');
    expect(result.xml).toBeUndefined();
    expect(Array.from(result.bytes)).toEqual(Array.from(pdf));
    expect(result.meta.pdfKind).toBe('facturx');
  });

  it('validate posts raw document bytes to /v1/validate with the format query', async () => {
    const { fetchImpl, calls } = recordingFetch({
      json: { success: true, data: { valid: true, errors: [] } },
    });
    const beliq = new Beliq({ apiKey: API_KEY, fetch: fetchImpl });

    const result = await beliq.validate('<Invoice>xml</Invoice>', { format: 'cii' });

    const { path, query } = parseUrl(calls[0].url);
    expect(calls[0].method).toBe('POST');
    expect(path).toBe('/v1/validate');
    expect(query.format).toBe('cii');
    // XML document => sniffed content type
    expect(calls[0].headers['Content-Type']).toBe('application/xml');
    expect(calls[0].body).toBe('<Invoice>xml</Invoice>');
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('parse posts raw document bytes to /v1/parse with the format query', async () => {
    const { fetchImpl, calls } = recordingFetch({
      json: { success: true, data: { invoice: { number: 'INV-3' } } },
    });
    const beliq = new Beliq({ apiKey: API_KEY, fetch: fetchImpl });

    const result = await beliq.parse('<Invoice/>', { format: 'ubl' });

    const { path, query } = parseUrl(calls[0].url);
    expect(calls[0].method).toBe('POST');
    expect(path).toBe('/v1/parse');
    expect(query.format).toBe('ubl');
    expect(calls[0].body).toBe('<Invoice/>');
    expect(result).toEqual({ invoice: { number: 'INV-3' } });
  });

  it('convert posts to /v1/convert with targetFormat and (facturx) targetProfile', async () => {
    const zip = new Uint8Array([1, 2, 3, 4]);
    const { fetchImpl, calls } = recordingFetch({
      headers: {
        'content-type': 'application/pdf',
        'x-lost-elements-count': '2',
        'x-lost-elements': JSON.stringify(['DeliveryDate', 'BuyerReference']),
      },
      bytes: zip,
    });
    const beliq = new Beliq({ apiKey: API_KEY, fetch: fetchImpl });

    const result = await beliq.convert('<Invoice/>', {
      targetFormat: 'facturx',
      targetProfile: 'en16931',
    });

    const { path, query } = parseUrl(calls[0].url);
    expect(calls[0].method).toBe('POST');
    expect(path).toBe('/v1/convert');
    expect(query.targetFormat).toBe('facturx');
    expect(query.targetProfile).toBe('en16931');
    expect(calls[0].body).toBe('<Invoice/>');
    expect(result.meta.lostElementsCount).toBe(2);
    expect(result.meta.lostElements).toEqual(['DeliveryDate', 'BuyerReference']);
    expect(Array.from(result.bytes)).toEqual([1, 2, 3, 4]);
  });

  it('convert to a plain XML target does not add a targetProfile query', async () => {
    const { fetchImpl, calls } = recordingFetch({
      headers: { 'content-type': 'application/xml' },
      bytes: new TextEncoder().encode('<Invoice/>'),
    });
    const beliq = new Beliq({ apiKey: API_KEY, fetch: fetchImpl });

    await beliq.convert('<Invoice/>', { targetFormat: 'ubl', targetProfile: 'en16931' });

    const { query } = parseUrl(calls[0].url);
    expect(query.targetFormat).toBe('ubl');
    expect(query.targetProfile).toBeUndefined();
  });
});
