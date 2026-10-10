import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { choicesOf, optionFields } from './app-options';
import { usableProfile } from '../src/lib/options';

// examples/ holds flow definitions a user loads as they are, so an option value
// the operation cannot use is a first run that fails. A profile the standard
// does not accept is the case that shipped: the API answers it with 422
// PROFILE_STANDARD_MISMATCH, and the handler drops it without a word.

const EXAMPLES = new URL('../examples/', import.meta.url);

const operations = readdirSync(EXAMPLES)
  .filter((file) => file.endsWith('.flow.json'))
  .flatMap((file) => {
    const flow = JSON.parse(readFileSync(new URL(file, EXAMPLES), 'utf8')) as {
      operations: { type: string; options: Record<string, string> }[];
    };
    return flow.operations
      .filter((op) => op.type === 'beliq')
      .map((op) => ({ file, options: op.options }));
  });

const dropdownValues = new Map(
  optionFields().flatMap((o): [string, string[]][] => {
    if (!o.field || o.meta?.interface !== 'select-dropdown') return [];
    const values = choicesOf(o.field).map((c) => c.value);
    return values.length > 0 ? [[o.field, values]] : [];
  }),
);

describe('example flows', () => {
  it('cover generate, validate and convert', () => {
    expect(operations.map((op) => op.options.operation).sort()).toEqual([
      'convert',
      'generate',
      'validate',
    ]);
  });

  it.each(operations)('$file sets only dropdown values the operation offers', ({ options }) => {
    for (const [field, value] of Object.entries(options)) {
      const offered = dropdownValues.get(field);
      if (offered) expect(offered, field).toContain(value);
    }
  });

  it.each(operations.filter((op) => op.options.operation === 'generate'))(
    '$file sends the profile it states',
    ({ options }) => {
      expect(usableProfile(options.standard, options.profile)).toBe(options.profile);
    },
  );
});
