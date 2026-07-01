import {
  LIVE_CONVERT_TARGET_FORMATS,
  LIVE_GENERATE_STANDARDS,
  LIVE_PARSE_FORMATS,
  LIVE_PROFILES,
  LIVE_VALIDATE_FORMATS,
} from '@beliq/sdk';

// Dropdown value-spaces come straight from the SDK's LIVE_* lists, the publicly
// offered subset of the beliq coverage SSOT. Provisional formats the API can
// technically accept stay out of the UI (LPD-1). Labels here are cosmetic only.
const LABELS: Record<string, string> = {
  auto: 'Auto-detect',
  cii: 'CII',
  ubl: 'UBL',
  xrechnung: 'XRechnung',
  zugferd: 'ZUGFeRD',
  facturx: 'Factur-X',
  'peppol-bis': 'Peppol BIS',
  basicwl: 'BASIC WL',
  en16931: 'EN 16931',
  extended: 'EXTENDED',
  'extended-ctc-fr': 'EXTENDED CTC FR',
};

export interface Choice {
  text: string;
  value: string;
}

/** Turn a LIVE_* string list into Directus select-dropdown choices. */
export function choices(values: readonly string[]): Choice[] {
  return values.map((value) => ({ text: LABELS[value] ?? value, value }));
}

export const STANDARD_CHOICES = choices(LIVE_GENERATE_STANDARDS);
export const PROFILE_CHOICES = choices(LIVE_PROFILES);
export const VALIDATE_FORMAT_CHOICES = choices(LIVE_VALIDATE_FORMATS);
export const PARSE_FORMAT_CHOICES = choices(LIVE_PARSE_FORMATS);
export const CONVERT_TARGET_CHOICES = choices(LIVE_CONVERT_TARGET_FORMATS);

export const OUTPUT_CHOICES: Choice[] = [
  { text: 'XML', value: 'xml' },
  { text: 'PDF (Hybrid)', value: 'pdf' },
];

export const OPERATION_CHOICES: Choice[] = [
  { text: 'Generate', value: 'generate' },
  { text: 'Validate', value: 'validate' },
  { text: 'Parse', value: 'parse' },
  { text: 'Convert', value: 'convert' },
];

export const DELIVERY_CHOICES: Choice[] = [
  { text: 'Save to Directus File', value: 'directusFile' },
  { text: 'Base64 (return in output)', value: 'base64' },
];
