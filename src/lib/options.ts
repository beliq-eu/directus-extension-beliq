import {
  LIVE_CONVERT_TARGET_FORMATS,
  LIVE_GENERATE_PRESETS,
  LIVE_GENERATE_STANDARDS,
  LIVE_PARSE_FORMATS,
  LIVE_PROFILES,
  LIVE_VALIDATE_FORMATS,
  isProfileAllowedForStandard,
  profilesForStandard,
  type Standard,
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

// Curated profile presets (e.g. NLCIUS = Peppol BIS + the netherlands-nlcius
// profile) are offered as extra generate targets beside the plain standards; a
// profile preset resolves to its standard + profile at call time.
const PROFILE_PRESETS = LIVE_GENERATE_PRESETS.filter((p) => p.profile);

export const STANDARD_CHOICES: Choice[] = [
  ...choices(LIVE_GENERATE_STANDARDS),
  ...PROFILE_PRESETS.map((p) => ({ text: p.label, value: p.id })),
];

export interface GenerateTarget {
  standard: Standard;
  profile?: string;
  output?: 'xml' | 'pdf';
}

/** Resolve a Standard-dropdown value to the generate standard (and profile) it means. */
export function resolveGenerateTarget(value: string): GenerateTarget {
  const preset = PROFILE_PRESETS.find((p) => p.id === value);
  if (preset) return { standard: preset.standard, profile: preset.profile, output: preset.output };
  return { standard: value as Standard };
}

export const PROFILE_CHOICES = choices(LIVE_PROFILES);

/**
 * The profiles a standard accepts. `profile` is pinned per standard, and the
 * engine answers a pair outside its table with 422 PROFILE_STANDARD_MISMATCH,
 * so one flat list would offer values that cannot succeed.
 */
export function profileChoicesFor(value: string): Choice[] {
  return choices(profilesForStandard(resolveGenerateTarget(value).standard));
}

/**
 * Standard-dropdown values that leave the caller a profile to pick: more than
 * one legal value, and not a preset that already pins one.
 */
export const STANDARDS_WITH_PROFILE_CHOICE: string[] = STANDARD_CHOICES.map((c) => c.value).filter(
  (value) => !resolveGenerateTarget(value).profile && profileChoicesFor(value).length > 1,
);

/** Drop a profile the resolved standard does not accept. */
export function usableProfile(value: string, profile: string | undefined): string | undefined {
  if (!profile) return undefined;
  return isProfileAllowedForStandard(resolveGenerateTarget(value).standard, profile)
    ? profile
    : undefined;
}
export const VALIDATE_FORMAT_CHOICES = choices(LIVE_VALIDATE_FORMATS);
export const PARSE_FORMAT_CHOICES = choices(LIVE_PARSE_FORMATS);
export const CONVERT_TARGET_CHOICES = choices(LIVE_CONVERT_TARGET_FORMATS);

// "PDF" without a qualifier: whether it is a hybrid PDF/A-3 or a visualization
// with no embedded XML depends on the chosen standard, which a static label
// cannot say. The Output field note carries that.
export const OUTPUT_CHOICES: Choice[] = [
  { text: 'XML', value: 'xml' },
  { text: 'PDF', value: 'pdf' },
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
