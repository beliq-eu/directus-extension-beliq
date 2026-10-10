import type { Invoice } from '@beliq/sdk';
import app from '../src/app';

/** The operation's option fields. Directus also takes a function or a component there. */
export function optionFields() {
  if (!Array.isArray(app.options)) throw new Error('app.options is not a list of fields');
  return app.options;
}

export function optionField(name: string) {
  const field = optionFields().find((o) => o.field === name);
  if (!field) throw new Error(`no option field "${name}"`);
  return field;
}

/** The choices of a dropdown option, as the operation offers them. */
export function choicesOf(name: string): { text: string; value: string }[] {
  const choices: unknown = optionField(name).meta?.options?.choices;
  if (!Array.isArray(choices)) throw new Error(`option field "${name}" has no choices`);
  return choices;
}

/**
 * EXAMPLE_INVOICE is the default_value Directus stores for a fresh operation,
 * so a test drives that exact object rather than a second copy that can drift
 * from it.
 */
export function sampleInvoice(): Invoice {
  const stored: unknown = optionField('invoice').schema?.default_value;
  return (typeof stored === 'string' ? JSON.parse(stored) : stored) as Invoice;
}
