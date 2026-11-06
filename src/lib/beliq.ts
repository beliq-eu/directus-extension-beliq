import { Beliq, BeliqApiError } from '@beliq/sdk';

/** Build a configured SDK client from a resolved API key. */
export function createClient(apiKey: string): Beliq {
  return new Beliq({ apiKey });
}

/**
 * Turn an SDK error into a flat Error with a readable message. A BeliqApiError
 * carries the typed `{ code, message }` from beliq's error envelope; anything
 * else is surfaced verbatim.
 */
export function mapError(error: unknown): Error {
  if (error instanceof BeliqApiError) {
    return new Error(error.code ? `${error.message} (${error.code})` : error.message);
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
  if (candidate === undefined || candidate === null) {
    throw new Error(`beliq: ${field} is empty. It must be a JSON object.`);
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
