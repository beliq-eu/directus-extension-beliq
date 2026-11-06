import { describe, expect, it } from 'vitest';
import { asJsonObject } from '../src/lib/beliq';

describe('asJsonObject', () => {
  it('returns an object Directus has already parsed, unchanged', () => {
    const value = { number: 'INV-1', lines: [{ quantity: 2 }] };
    expect(asJsonObject(value, 'Invoice Data')).toBe(value);
  });

  it('parses the text of an object, with the whitespace around it', () => {
    expect(asJsonObject('\n  {"number": "INV-1"}\n', 'Invoice Data')).toEqual({ number: 'INV-1' });
  });

  it.each([
    ['absent', undefined, 'is empty. It must be a JSON object.'],
    ['null', null, 'is empty. It must be a JSON object.'],
    ['blank text', ' \n ', 'is empty. It must be a JSON object.'],
    ['the text null', 'null', 'is empty. It must be a JSON object.'],
    ['an array', '[{"number": "INV-1"}]', 'is a JSON array. It must be a JSON object.'],
    ['a parsed array', [{ number: 'INV-1' }], 'is a JSON array. It must be a JSON object.'],
    ['a number', '42', 'is a JSON number. It must be a JSON object.'],
    ['a quoted string', '"INV-1"', 'is a JSON string. It must be a JSON object.'],
    ['an empty object', '{}', 'is an empty JSON object.'],
    ['a parsed empty object', {}, 'is an empty JSON object.'],
  ])('refuses %s, naming the field', (_label, value, message) => {
    expect(() => asJsonObject(value, 'Invoice Data')).toThrow(`beliq: Invoice Data ${message}`);
  });

  it('refuses text that is not JSON and carries the parser error as message and cause', () => {
    let thrown: unknown;
    try {
      asJsonObject('{"number": "INV-1",', 'Invoice Data');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const error = thrown as Error;
    expect(error.cause).toBeInstanceOf(SyntaxError);
    expect(error.message).toBe(
      `beliq: Invoice Data is not valid JSON (${(error.cause as SyntaxError).message}).`,
    );
  });
});
