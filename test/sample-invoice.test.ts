import { describe, expect, it } from 'vitest';
import app from '../src/app';

// EXAMPLE_INVOICE is the default_value Directus stores for a fresh operation, so
// it is what a user's first run sends. On Peppol BIS a GLN whose GS1 check
// digit is wrong is fatal four times over before the invoice is even looked at
// (PEPPOL-COMMON-R040). Every other standard emits the id and says nothing:
// KoSIT's XRechnung packs carry no R040, so a malformed id ships. So the
// sample needs a check the standard itself applies.

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

describe('the fields the XRechnung CIUS requires', () => {
  // `verify` defaults to true, so an invoice that satisfies plain EN 16931 and
  // nothing more comes back 422 on the user's first run. Each assertion names
  // the rule the field answers.
  const invoice = sampleInvoice();

  it('carries the seller contact group BG-6 (BR-DE-2)', () => {
    expect(invoice.seller.contactName).toBeTruthy();
    expect(invoice.seller.phone).toBeTruthy();
  });

  it('carries payment instructions BG-16 (BR-DE-1)', () => {
    expect(invoice.paymentMeans?.typeCode).toBeTruthy();
  });

  it('carries a VAT breakdown BG-23 matching every line (BR-CO-18, BR-S-01)', () => {
    expect(invoice.taxSummary?.length).toBeGreaterThan(0);
    for (const line of invoice.lines) {
      expect(
        invoice.taxSummary.some(
          (t: any) => t.vatCategoryCode === line.vatCategoryCode && t.vatRate === line.vatRate,
        ),
      ).toBe(true);
    }
  });

  it('carries a buyerReference (BR-DE-15)', () => {
    expect(invoice.buyerReference).toBeTruthy();
  });

  it('states totals consistent with its lines (BR-CO-13, BR-CO-15)', () => {
    const net = invoice.lines.reduce((sum: number, l: any) => sum + l.lineTotal, 0);
    const tax = invoice.taxSummary.reduce((sum: number, t: any) => sum + t.taxAmount, 0);
    expect(invoice.totalNetAmount).toBe(net);
    expect(invoice.totalTaxAmount).toBe(tax);
    expect(invoice.totalGrossAmount).toBe(net + tax);
  });
});
