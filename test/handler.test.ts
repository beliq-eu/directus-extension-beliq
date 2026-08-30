import { afterEach, describe, expect, it } from 'vitest';
import api from '../src/api';
import { STANDARDS_WITH_PROFILE_CHOICE, profileChoicesFor } from '../src/lib/options';

// The operation handler itself, not the SDK underneath it. test/mapping.test.ts
// drives `@beliq/sdk` directly, so it cannot see an option this file maps wrong:
// the profile default that shipped in 0.2.0 was invisible to it for exactly that
// reason. Here the handler runs, and the recorder captures what reached the wire.

interface Recorded {
  url: string;
  body: unknown;
}

function recordGenerate(response?: { bytes: Uint8Array; contentType: string }) {
  const calls: Recorded[] = [];
  const original = globalThis.fetch;
  const body = response?.bytes ?? new TextEncoder().encode('<Invoice/>');
  const contentType = response?.contentType ?? 'application/xml';

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    return new Response(body, {
      status: 200,
      headers: { 'content-type': contentType },
    });
  }) as typeof fetch;

  return { calls, restore: () => { globalThis.fetch = original; } };
}

const INVOICE = JSON.stringify({ number: 'INV-1' });

async function generate(options: Record<string, unknown>) {
  const { calls, restore } = recordGenerate();
  try {
    await api.handler(
      { operation: 'generate', apiKey: 'test-key', output: 'xml', invoice: INVOICE, ...options },
      { env: {} } as never,
    );
  } finally {
    restore();
  }
  return calls[0]?.body as Record<string, unknown>;
}

/**
 * Drive the handler down its PDF path. `deliveryMode: 'base64'` keeps the
 * result out of the Directus Files service, which needs a running Directus.
 */
async function generatePdf(options: Record<string, unknown>) {
  const { calls, restore } = recordGenerate({
    bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]), // %PDF-1
    contentType: 'application/pdf',
  });
  try {
    await api.handler(
      {
        operation: 'generate',
        apiKey: 'test-key',
        output: 'pdf',
        deliveryMode: 'base64',
        invoice: INVOICE,
        ...options,
      },
      { env: {} } as never,
    );
  } finally {
    restore();
  }
  return calls[0]?.body as Record<string, unknown>;
}

describe('generate handler', () => {
  afterEach(() => {
    // A leaked stub would make every later suite assert against this recorder.
    expect(typeof globalThis.fetch).toBe('function');
  });

  it('drops a profile the standard does not accept', async () => {
    // The shape that shipped: an operation saved with the old default still
    // carries profile=en16931, which XRechnung answers with a 422.
    const body = await generate({ standard: 'xrechnung', profile: 'en16931' });
    expect(body).not.toHaveProperty('profile');
    expect(body.standard).toBe('xrechnung');
  });

  it('drops the France CTC overlay profile on ZUGFeRD', async () => {
    const body = await generate({ standard: 'zugferd', profile: 'extended-ctc-fr' });
    expect(body).not.toHaveProperty('profile');
  });

  it('keeps a profile the standard does accept', async () => {
    const body = await generate({ standard: 'facturx', profile: 'extended-ctc-fr' });
    expect(body.profile).toBe('extended-ctc-fr');
  });

  it('lets a preset pin the profile the standard needs', async () => {
    const body = await generate({ standard: 'nlcius' });
    expect(body).toMatchObject({ standard: 'peppol-bis', profile: 'netherlands-nlcius' });
  });

  // XRechnung and Peppol BIS have no hybrid PDF. The API refuses PDF output for
  // them unless the request names a visual to render, so without `template` the
  // Output=PDF choice is a 400 no saved option value avoids.
  it('asks for the built-in visual when PDF is chosen and no stored template is given', async () => {
    const body = await generatePdf({ standard: 'xrechnung' });
    expect(body.output).toBe('pdf');
    expect(body.template).toBe('standard');
  });

  // Factur-X and ZUGFeRD render their page either way, so the same field goes
  // out for them too rather than being gated on a standard list the extension
  // would then have to keep in step with the API.
  it('asks for the built-in visual on the hybrid standards as well', async () => {
    const body = await generatePdf({ standard: 'zugferd' });
    expect(body.template).toBe('standard');
  });

  it('prefers a stored template over the built-in visual', async () => {
    const body = await generatePdf({ standard: 'xrechnung', pdfTemplateId: 'k3d-9mp' });
    expect(body.pdfTemplateId).toBe('k3d-9mp');
    expect(body).not.toHaveProperty('template');
  });

  it('sends no visual on XML output, where there is nothing to render', async () => {
    const body = await generate({ standard: 'xrechnung' });
    expect(body).not.toHaveProperty('template');
  });

  it('sends no profile when none was chosen', async () => {
    const body = await generate({ standard: 'facturx' });
    expect(body).not.toHaveProperty('profile');
  });
});

describe('profile field visibility', () => {
  it('offers the field only where a choice exists', () => {
    // xrechnung has one legal profile and nlcius is a preset that pins one, so
    // neither leaves the caller anything to pick.
    expect(STANDARDS_WITH_PROFILE_CHOICE).toEqual(['zugferd', 'facturx', 'peppol-bis']);
  });

  it('offers only profiles the chosen standard accepts', () => {
    expect(profileChoicesFor('zugferd').map((c) => c.value)).not.toContain('extended-ctc-fr');
    expect(profileChoicesFor('facturx').map((c) => c.value)).toContain('extended-ctc-fr');
    expect(profileChoicesFor('peppol-bis').map((c) => c.value)).toEqual([
      'peppol',
      'romania-ro-cius',
      'netherlands-nlcius',
    ]);
  });
});
