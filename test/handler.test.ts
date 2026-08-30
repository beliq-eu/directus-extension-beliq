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

function recordGenerate() {
  const calls: Recorded[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    return new Response(new TextEncoder().encode('<Invoice/>'), {
      status: 200,
      headers: { 'content-type': 'application/xml' },
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
