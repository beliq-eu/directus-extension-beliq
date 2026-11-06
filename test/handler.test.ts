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

function recordGenerate(response?: { bytes: Uint8Array<ArrayBuffer>; contentType: string }) {
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

  // The Delivery note promises this. The context carries no Files service, so
  // a handler that tried to save the XML would throw here.
  it('returns XML inline whatever Delivery says, NLCIUS included', async () => {
    for (const options of [
      { standard: 'xrechnung', output: 'xml' },
      { standard: 'nlcius', output: 'pdf' },
    ]) {
      const { restore } = recordGenerate();
      try {
        const result = await api.handler(
          {
            operation: 'generate',
            apiKey: 'test-key',
            invoice: INVOICE,
            deliveryMode: 'directusFile',
            folder: 'folder-id',
            ...options,
          },
          { env: {} } as never,
        );
        expect(result, options.standard).toMatchObject({ xml: '<Invoice/>' });
        expect(result, options.standard).not.toHaveProperty('fileId');
      } finally {
        restore();
      }
    }
  });
});

// What the user typed into Invoice Data when it is not an invoice object.
const UNUSABLE_INVOICE_DATA: [string, unknown][] = [
  ['absent', undefined],
  ['empty', '   '],
  ['unparseable', '{"number": "INV-1",'],
  ['an array', '[{"number": "INV-1"}]'],
  ['an empty object', '{}'],
];

describe('Invoice Data the handler cannot use', () => {
  // Until 0.2.6 the handler sent `{}` in place of what was typed, and the user
  // got the API's schema 400 about missing fields instead of a word about
  // Invoice Data.
  it.each(UNUSABLE_INVOICE_DATA)(
    'fails on Invoice Data that is %s, naming the field, before any request',
    async (_label, invoice) => {
      const { calls, restore } = recordGenerate();
      try {
        await expect(
          api.handler(
            { operation: 'generate', apiKey: 'test-key', standard: 'xrechnung', output: 'xml', invoice },
            { env: {} } as never,
          ),
        ).rejects.toThrow(/^beliq: Invoice Data /);
      } finally {
        restore();
      }
      expect(calls).toHaveLength(0);
    },
  );

  it('carries the parse error of Invoice Data that is not JSON', async () => {
    await expect(generate({ standard: 'xrechnung', invoice: '{"number": "INV-1",' })).rejects.toThrow(
      /^beliq: Invoice Data is not valid JSON \(.+\)\.$/,
    );
  });

  it('sends an Invoice Data object Directus has already parsed as it stands', async () => {
    const body = await generate({ standard: 'xrechnung', invoice: { number: 'INV-7' } });
    expect(body.invoice).toEqual({ number: 'INV-7' });
  });
});

async function convert(lostElements: unknown[], lostElementsCount: number) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(new TextEncoder().encode('<Invoice/>'), {
      status: 200,
      headers: {
        'content-type': 'application/xml',
        'x-lost-elements-count': String(lostElementsCount),
        'x-lost-elements': JSON.stringify(lostElements),
      },
    })) as typeof fetch;
  try {
    return (await api.handler(
      { operation: 'convert', apiKey: 'test-key', deliveryMode: 'base64', convertDocument: '<Invoice/>', targetFormat: 'ubl' },
      { env: {} } as never,
    )) as Record<string, unknown>;
  } finally {
    globalThis.fetch = original;
  }
}

describe('convert handler', () => {
  it('returns each lost element as the object the API sent', async () => {
    // From the worked example at https://docs.beliq.eu/api-reference/convert/#lostelement-schema
    const lost = {
      path: '/Invoice/{urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2}AccountingSupplierParty/{urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2}Party/cbc:EndpointID',
      value: null,
      reason: 'Peppol endpoint stripped (target is not peppol-bis)',
      severity: 'info',
      acceptableLoss: true,
    };
    const result = await convert([lost], 1);
    expect(result.lostElementsCount).toBe(1);
    expect(result.lostElements).toEqual([lost]);
  });

  it('returns the one truncation entry of a list past the header cap, with the exact count', async () => {
    const truncated = {
      truncated: true,
      reason: 'Audit list exceeded 6144 bytes (412 entries); see X-Lost-Elements-Count for the exact count.',
    };
    const result = await convert([truncated], 412);
    expect(result.lostElementsCount).toBe(412);
    expect(result.lostElements).toEqual([truncated]);
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
