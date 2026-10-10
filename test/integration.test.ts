import { describe, expect, it } from 'vitest';
import { Beliq } from '@beliq/sdk';
import { sampleInvoice } from './app-options';

// Live smoke against the real beliq API. Uses the same SDK calls src/api.ts
// makes. Skipped unless BELIQ_API_KEY is set, so CI without the secret stays
// green (the skip is expected, not a failure).

const API_KEY = process.env.BELIQ_API_KEY;

const INVOICE = sampleInvoice();

describe.skipIf(!API_KEY)('beliq live API', () => {
  const beliq = new Beliq({ apiKey: API_KEY ?? 'unused-when-skipped' });

  it('generates an XRechnung XML invoice', async () => {
    const result = await beliq.generate({
      standard: 'xrechnung',
      invoice: INVOICE,
      output: 'xml',
    });
    expect(result.contentType).toContain('xml');
    expect(result.xml).toContain('<');
  });

  it('generates a ZUGFeRD hybrid PDF', async () => {
    const result = await beliq.generate({
      standard: 'zugferd',
      invoice: INVOICE,
      output: 'pdf',
      profile: 'en16931',
    });
    expect(result.contentType).toContain('pdf');
    expect(Buffer.from(result.bytes).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('validates a generated document', async () => {
    const generated = await beliq.generate({
      standard: 'xrechnung',
      invoice: INVOICE,
      output: 'xml',
    });
    const result = await beliq.validate(generated.xml!, { format: 'auto' });
    // generate verifies its output before returning it, so the same bytes
    // have to come back valid from the same pinned rules.
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  it('parses a generated document', async () => {
    const generated = await beliq.generate({
      standard: 'xrechnung',
      invoice: INVOICE,
      output: 'xml',
    });
    const result = await beliq.parse(generated.xml!, { format: 'auto' });
    expect(result.invoice).toMatchObject({
      number: INVOICE.number,
      currencyCode: INVOICE.currencyCode,
      totalGrossAmount: INVOICE.totalGrossAmount,
    });
  });

  it('converts a document to UBL', async () => {
    const generated = await beliq.generate({
      standard: 'xrechnung',
      invoice: INVOICE,
      output: 'xml',
    });
    const result = await beliq.convert(generated.xml!, { targetFormat: 'ubl' });
    expect(result.bytes.length).toBeGreaterThan(0);
  });
});
