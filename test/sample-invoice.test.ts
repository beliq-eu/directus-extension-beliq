import { describe, expect, it } from 'vitest';
import app from '../src/app';

// EXAMPLE_INVOICE is the default_value Directus stores for a fresh operation, so
// it is what a user's first run sends. On XRechnung it succeeded even with a
// malformed Peppol id, because the CII builder ignores `party.peppol` entirely
// (bq-engine#267) and addresses the party by email. On Peppol BIS the UBL
// builder does use it, and PEPPOL-COMMON-R040 rejects a GLN whose GS1 check
// digit is wrong: fatal, four times, before the invoice is even looked at. So
// the sample needs a check the standard itself applies.

/**
 * PEPPOL-COMMON-R040's own rule, transcribed from
 * `PEPPOL-EN16931-UBL.sch::u:gln`: weight the data digits 3, 1, 3, 1 ... from
 * the right, and the check digit is what makes the total a multiple of ten.
 */
function isValidGln(value: string): boolean {
  if (!/^[0-9]+$/.test(value)) return false;
  const dataLength = value.length - 1;
  const reversed = [...value.slice(0, dataLength)].map(Number).reverse();
  const weighted = reversed.reduce((sum, d, i) => sum + d * (1 + (((i + 1) % 2) * 2)), 0);
  return (10 - (weighted % 10)) % 10 === Number(value[dataLength]);
}

function sampleInvoice(): Record<string, any> {
  const option = (app.options as any[]).find((o) => o.field === 'invoice');
  const stored = option.schema.default_value;
  return typeof stored === 'string' ? JSON.parse(stored) : stored;
}

describe('the GS1 rule the sample has to satisfy', () => {
  it('accepts a GLN with a correct check digit and rejects a wrong one', () => {
    // Proves the check can fail, so a green suite below means something.
    expect(isValidGln('4030000000003')).toBe(true);
    expect(isValidGln('4030000000001')).toBe(false);
    expect(isValidGln('40300000000x3')).toBe(false);
  });
});

describe('sample invoice', () => {
  it('gives both parties a GLN that passes PEPPOL-COMMON-R040', () => {
    const invoice = sampleInvoice();
    for (const party of ['seller', 'buyer'] as const) {
      const peppol = invoice[party].peppol;
      expect(peppol.schemeId, `${party}.peppol.schemeId`).toBe('0088');
      expect(isValidGln(peppol.id), `${party}.peppol.id ${peppol.id} must be a valid GLN`).toBe(true);
    }
  });

  it('gives the two parties distinct electronic addresses', () => {
    const invoice = sampleInvoice();
    expect(invoice.seller.peppol.id).not.toBe(invoice.buyer.peppol.id);
  });
});
