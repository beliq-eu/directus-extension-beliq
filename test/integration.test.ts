import { describe, expect, it } from 'vitest';
import { Beliq } from '@beliq/sdk';

// Live smoke against the real beliq API. Uses the same SDK calls src/api.ts
// makes. Skipped unless BELIQ_API_KEY is set, so CI without the secret stays
// green (the skip is expected, not a failure).

const API_KEY = process.env.BELIQ_API_KEY;

const INVOICE = {
  number: 'INV-SMOKE-1',
  issueDate: '2026-01-31',
  dueDate: '2026-03-02',
  currencyCode: 'EUR',
  seller: {
    name: 'Your Company GmbH',
    address: { line1: 'Main St 1', city: 'Berlin', postalCode: '10115', countryCode: 'DE' },
    taxId: 'DE123456789',
  },
  buyer: {
    name: 'Customer SARL',
    address: { line1: 'Rue 2', city: 'Paris', postalCode: '75001', countryCode: 'FR' },
  },
  lines: [
    { description: 'Widget', quantity: 2, unitPrice: 10, lineTotal: 20, vatRate: 19, vatCategoryCode: 'S' },
  ],
  taxSummary: [{ categoryCode: 'S', rate: 19, taxableAmount: 20, taxAmount: 3.8 }],
  paymentTerms: 'Net 30',
  totalNetAmount: 20,
  totalTaxAmount: 3.8,
  totalGrossAmount: 23.8,
};

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
