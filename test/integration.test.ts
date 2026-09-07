import { describe, expect, it } from 'vitest';
import { Beliq } from '@beliq/sdk';
import app from '../src/app';

// Live smoke against the real beliq API. Uses the same SDK calls src/api.ts
// makes. Skipped unless BELIQ_API_KEY is set, so CI without the secret stays
// green (the skip is expected, not a failure).

const API_KEY = process.env.BELIQ_API_KEY;

// EXAMPLE_INVOICE is the default_value Directus stores for a fresh operation,
// so the smoke drives that exact object rather than a second copy that can
// drift from it.
const INVOICE = ((): Record<string, unknown> => {
  const option = (app.options as any[]).find((o) => o.field === 'invoice');
  const stored = option.schema.default_value;
  return typeof stored === 'string' ? JSON.parse(stored) : stored;
})();

describe.skipIf(!API_KEY)('beliq live API', () => {
  const beliq = new Beliq({ apiKey: API_KEY ?? 'unused-when-skipped' });

  it('generates an XRechnung XML invoice', async () => {
    const result = await beliq.generate({
      standard: 'xrechnung',
      invoice: INVOICE as any,
      output: 'xml',
    });
    expect(result.contentType).toContain('xml');
    expect(result.xml).toContain('<');
  });

  it('generates a ZUGFeRD hybrid PDF', async () => {
    const result = await beliq.generate({
      standard: 'zugferd',
      invoice: INVOICE as any,
      output: 'pdf',
      profile: 'en16931',
    });
    expect(result.contentType).toContain('pdf');
    expect(Buffer.from(result.bytes).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('validates a generated document', async () => {
    const generated = await beliq.generate({
      standard: 'xrechnung',
      invoice: INVOICE as any,
      output: 'xml',
    });
    const result = await beliq.validate(generated.xml!, { format: 'auto' });
    expect(result).toHaveProperty('valid');
  });

  it('parses a generated document', async () => {
    const generated = await beliq.generate({
      standard: 'xrechnung',
      invoice: INVOICE as any,
      output: 'xml',
    });
    const result = await beliq.parse(generated.xml!, { format: 'auto' });
    expect(result).toBeTypeOf('object');
  });

  it('converts a document to UBL', async () => {
    const generated = await beliq.generate({
      standard: 'xrechnung',
      invoice: INVOICE as any,
      output: 'xml',
    });
    const result = await beliq.convert(generated.xml!, { targetFormat: 'ubl' });
    expect(result.bytes.length).toBeGreaterThan(0);
  });
});
