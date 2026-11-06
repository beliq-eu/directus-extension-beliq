import type { Readable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import api from '../src/api';

// The default Delivery, "save to Directus Files", through the handler. Directus
// is the boundary here: the FilesService below stands in for the one a running
// Directus puts on the operation's context, and records what the extension
// hands it. Whether Directus accepts that call is the real-instance check's
// question, not this file's.

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
const XML_BYTES = new TextEncoder().encode('<Invoice/>');
const INVOICE = JSON.stringify({ number: 'INV-1' });
const NEW_FILE_ID = '4b2d6a1e-0f3c-4c55-9a51-2f3c8e9d1a07';

interface Upload {
  serviceOptions: unknown;
  bytes: Buffer;
  data: Record<string, unknown>;
}

function directusContext(env: Record<string, unknown> = {}) {
  const uploads: Upload[] = [];
  const schema = { collections: {}, relations: [] };
  const database = { client: 'the knex instance' };
  const accountability = { user: 'user-1', role: 'role-1', admin: false };

  class FilesService {
    constructor(private readonly serviceOptions: unknown) {}

    async uploadOne(stream: Readable, data: Record<string, unknown>) {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
      uploads.push({ serviceOptions: this.serviceOptions, bytes: Buffer.concat(chunks), data });
      return NEW_FILE_ID;
    }
  }

  return {
    uploads,
    schema,
    database,
    accountability,
    context: {
      services: { FilesService },
      getSchema: async () => schema,
      database,
      accountability,
      env,
    } as never,
  };
}

function answer(bytes: Uint8Array, headers: Record<string, string>) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(bytes as Uint8Array<ArrayBuffer>, { status: 200, headers })) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

describe('delivery to Directus Files', () => {
  let restore = () => {};
  afterEach(() => restore());

  it('saves a generated PDF through FilesService.uploadOne when Delivery is left unset', async () => {
    restore = answer(PDF_BYTES, { 'content-type': 'application/pdf' });
    const directus = directusContext();

    const result = await api.handler(
      { operation: 'generate', apiKey: 'test-key', standard: 'facturx', output: 'pdf', invoice: INVOICE },
      directus.context,
    );

    expect(directus.uploads).toHaveLength(1);
    const [upload] = directus.uploads;
    // The service runs with the operation's own schema, database and
    // accountability, so the save has the permissions of the flow's role.
    expect(upload.serviceOptions).toEqual({
      schema: directus.schema,
      knex: directus.database,
      accountability: directus.accountability,
    });
    const options = upload.serviceOptions as Record<string, unknown>;
    expect(options.schema).toBe(directus.schema);
    expect(options.knex).toBe(directus.database);
    expect(options.accountability).toBe(directus.accountability);
    expect(upload.bytes.equals(Buffer.from(PDF_BYTES))).toBe(true);
    expect(upload.data).toEqual({
      title: 'invoice.pdf',
      filename_download: 'invoice.pdf',
      type: 'application/pdf',
      storage: 'local',
      folder: null,
    });
    expect(result).toMatchObject({
      fileId: NEW_FILE_ID,
      filename: 'invoice.pdf',
      contentType: 'application/pdf',
      sizeBytes: PDF_BYTES.length,
    });
    expect(result).not.toHaveProperty('base64');
  });

  it('saves into the Target Folder', async () => {
    restore = answer(PDF_BYTES, { 'content-type': 'application/pdf' });
    const directus = directusContext();

    await api.handler(
      {
        operation: 'generate',
        apiKey: 'test-key',
        standard: 'zugferd',
        output: 'pdf',
        invoice: INVOICE,
        deliveryMode: 'directusFile',
        folder: 'b7f1c2d4-folder',
      },
      directus.context,
    );

    expect(directus.uploads[0].data.folder).toBe('b7f1c2d4-folder');
  });

  // Directus's env loader turns a value with a comma into an array, split on
  // the comma and not trimmed, and leaves a single name a string
  // (packages/env/src/utils/guess-type.ts, lib/cast.ts). Its own uploadOne
  // takes the first entry, the same one taken here.
  it.each<[string | string[], string]>([
    ['s3', 's3'],
    [['s3', 'local'], 's3'],
    [[' gcs ', ' local'], 'gcs'],
  ])('saves to the first location of STORAGE_LOCATIONS=%j', async (locations, storage) => {
    restore = answer(PDF_BYTES, { 'content-type': 'application/pdf' });
    const directus = directusContext({ STORAGE_LOCATIONS: locations });

    await api.handler(
      { operation: 'generate', apiKey: 'test-key', standard: 'facturx', output: 'pdf', invoice: INVOICE },
      directus.context,
    );

    expect(directus.uploads[0].data.storage).toBe(storage);
  });

  it('saves a converted document with its lost elements in the result', async () => {
    const lost = [{ path: '/Invoice/cbc:Note', value: 'x', reason: 'no target field', severity: 'warning', acceptableLoss: false }];
    restore = answer(XML_BYTES, {
      'content-type': 'application/xml',
      'x-lost-elements-count': '1',
      'x-lost-elements': JSON.stringify(lost),
    });
    const directus = directusContext();

    const result = await api.handler(
      { operation: 'convert', apiKey: 'test-key', convertDocument: '<Invoice/>', targetFormat: 'ubl' },
      directus.context,
    );

    expect(directus.uploads).toHaveLength(1);
    expect(directus.uploads[0].bytes.toString('utf8')).toBe('<Invoice/>');
    expect(directus.uploads[0].data).toMatchObject({
      filename_download: 'converted.xml',
      type: 'application/xml',
      storage: 'local',
    });
    expect(result).toMatchObject({
      fileId: NEW_FILE_ID,
      filename: 'converted.xml',
      sizeBytes: XML_BYTES.length,
      lostElementsCount: 1,
      lostElements: lost,
    });
  });

  it('touches no FilesService on base64 delivery', async () => {
    restore = answer(PDF_BYTES, { 'content-type': 'application/pdf' });
    const directus = directusContext();

    const result = await api.handler(
      {
        operation: 'generate',
        apiKey: 'test-key',
        standard: 'facturx',
        output: 'pdf',
        invoice: INVOICE,
        deliveryMode: 'base64',
      },
      directus.context,
    );

    expect(directus.uploads).toHaveLength(0);
    expect(result).toMatchObject({ base64: Buffer.from(PDF_BYTES).toString('base64') });
  });
});
