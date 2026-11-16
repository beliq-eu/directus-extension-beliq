import { Beliq, BeliqApiError, retryClass } from '@beliq/sdk';

/**
 * Directus documents no time limit for a custom operation, so the client does
 * not retry until a real instance shows how long a flow may wait: a retry
 * budget of 0 turns the SDK's retries off, and an attempt ends after
 * TIMEOUT_MS. An outage then fails the operation at once, and its error says
 * when to try again.
 */
export const RETRY_BUDGET_MS = 0;
export const TIMEOUT_MS = 25_000;

/** Build a configured SDK client from a resolved API key. */
export function createClient(apiKey: string): Beliq {
  return new Beliq({ apiKey, retryBudgetMs: RETRY_BUDGET_MS, timeoutMs: TIMEOUT_MS });
}

/**
 * When to try again: the server's `Retry-After` when it sent one in whole
 * seconds, or, for an outage the SDK stopped retrying, that it did not say.
 * Empty for any other failure.
 */
function retryHint(error: unknown, unavailable: boolean): string {
  const seconds = error instanceof BeliqApiError ? error.retryAfterSeconds : undefined;
  if (seconds !== undefined) {
    return `. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  }
  return unavailable ? '. beliq did not say when; try again later' : '';
}

/**
 * Turn an SDK error into a flat Error with a readable message. A BeliqApiError
 * carries the typed `{ code, message }` from beliq's error envelope; an outage
 * leads with that and says when to try again; anything else is surfaced
 * verbatim.
 */
export function mapError(error: unknown): Error {
  const unavailable = retryClass(error) === 'budget';
  const lead = unavailable ? 'beliq is unavailable for now: ' : '';
  if (error instanceof BeliqApiError) {
    const body = `${lead}${error.message}${retryHint(error, unavailable)}`;
    return new Error(error.code ? `${body} (${error.code})` : body);
  }
  if (unavailable) {
    const reason = error instanceof Error ? error.message : String(error);
    return new Error(`${lead}could not reach the beliq API (${reason})${retryHint(error, true)}`, {
      cause: error,
    });
  }
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Read a JSON option that has to hold a non-empty object. Directus hands it
 * over parsed or as the text that was typed. Anything else throws an error
 * that names the field, so no stand-in object reaches the API.
 */
export function asJsonObject(value: unknown, field: string): Record<string, unknown> {
  const candidate = typeof value === 'string' ? parseJson(value, field) : value;
  if (candidate === undefined) {
    throw new Error(`beliq: ${field} is empty. It must be a JSON object.`);
  }
  if (candidate === null) {
    throw new Error(`beliq: ${field} is JSON null. It must be a JSON object.`);
  }
  if (Array.isArray(candidate)) {
    throw new Error(`beliq: ${field} is a JSON array. It must be a JSON object.`);
  }
  if (typeof candidate !== 'object') {
    throw new Error(`beliq: ${field} is a JSON ${typeof candidate}. It must be a JSON object.`);
  }
  if (Object.keys(candidate).length === 0) {
    throw new Error(`beliq: ${field} is an empty JSON object.`);
  }
  return candidate as Record<string, unknown>;
}

function parseJson(text: string, field: string): unknown {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`beliq: ${field} is not valid JSON (${reason}).`, { cause: error });
  }
}
