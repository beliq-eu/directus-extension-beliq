import { defineOperationApp } from '@directus/extensions-sdk';
import {
  CONVERT_TARGET_CHOICES,
  DELIVERY_CHOICES,
  OPERATION_CHOICES,
  OUTPUT_CHOICES,
  PARSE_FORMAT_CHOICES,
  PROFILE_CHOICES,
  STANDARD_CHOICES,
  STANDARDS_WITH_PROFILE_CHOICE,
  VALIDATE_FORMAT_CHOICES,
  profileChoicesFor,
} from './lib/options.js';

type Rule = Record<string, unknown>;

/** Meta fragment that hides a field unless `rule` matches another option's value. */
function onlyWhen(rule: Rule) {
  return {
    hidden: true,
    conditions: [{ name: 'show', rule, hidden: false }],
  };
}

// The prefilled example, and the shape a first run actually succeeds with: it
// clears the request schema, and clears XRechnung's own rules, which want a
// seller contact (BR-DE-2) and an electronic address for both parties
// (PEPPOL-EN16931-R010/R020). Verified against POST /v1/generate.
const EXAMPLE_INVOICE = {
  number: 'INV-2026-001',
  issueDate: '2026-01-15',
  dueDate: '2026-02-14',
  currencyCode: 'EUR',
  buyerReference: '991-12345-67',
  seller: {
    name: 'Seller GmbH',
    vatId: 'DE123456789',
    contactName: 'A Person',
    email: 'billing@seller.example',
    phone: '+49 30 123456',
    address: { street: 'Hauptstrasse 1', city: 'Berlin', postalCode: '10115', countryCode: 'DE' },
    peppol: { schemeId: '0088', id: '4030000000001' },
  },
  buyer: {
    name: 'Buyer SARL',
    vatId: 'FR12345678901',
    email: 'ap@buyer.example',
    address: { street: 'Rue de la Paix 2', city: 'Paris', postalCode: '75002', countryCode: 'FR' },
    peppol: { schemeId: '0088', id: '4030000000002' },
  },
  lines: [
    {
      description: 'Consulting services',
      quantity: 10,
      unitCode: 'HUR',
      unitPrice: 100,
      lineTotal: 1000,
      vatRate: 19,
      vatCategoryCode: 'S',
    },
  ],
  taxSummary: [{ vatCategoryCode: 'S', vatRate: 19, taxableAmount: 1000, taxAmount: 190 }],
  paymentMeans: { typeCode: '58', iban: 'DE89370400440532013000' },
  totalNetAmount: 1000,
  totalTaxAmount: 190,
  totalGrossAmount: 1190,
};

export default defineOperationApp({
  id: 'beliq',
  name: 'beliq',
  icon: 'receipt_long',
  description: 'Generate, validate, parse, and convert EU-compliant e-invoices with beliq.',
  overview: ({ operation, standard, deliveryMode }) => [
    { label: 'Operation', text: String(operation ?? 'generate') },
    { label: 'Standard', text: String(standard ?? '-') },
    { label: 'Delivery', text: String(deliveryMode ?? 'directusFile') },
  ],
  options: [
    {
      field: 'operation',
      name: 'Operation',
      type: 'string',
      meta: {
        width: 'half',
        interface: 'select-dropdown',
        options: { choices: OPERATION_CHOICES },
        note: 'What beliq should do with the invoice.',
      },
      schema: { default_value: 'generate' },
    },

    // Generate
    {
      field: 'standard',
      name: 'Standard',
      type: 'string',
      meta: {
        width: 'half',
        interface: 'select-dropdown',
        options: { choices: STANDARD_CHOICES },
        note: 'Target e-invoice standard.',
        ...onlyWhen({ operation: { _eq: 'generate' } }),
      },
      schema: { default_value: 'xrechnung' },
    },
    {
      field: 'profile',
      name: 'Profile',
      type: 'string',
      meta: {
        width: 'half',
        interface: 'select-dropdown',
        options: { choices: [] },
        note: 'Data granularity profile. Shown only for the standards that leave it open; the rest pin their own.',
        // Each standard accepts its own profile set, so the choices follow the
        // Standard field rather than being one flat list: an unfiltered list
        // offers values the engine answers with 422 PROFILE_STANDARD_MISMATCH.
        // Standards with a single legal profile, and the presets that already
        // pin one, leave the field hidden.
        hidden: true,
        conditions: STANDARDS_WITH_PROFILE_CHOICE.map((standard) => ({
          name: `show-${standard}`,
          rule: { _and: [{ operation: { _eq: 'generate' } }, { standard: { _eq: standard } }] },
          hidden: false,
          options: { choices: profileChoicesFor(standard) },
        })),
      },
      // No default: a stored profile the standard does not accept is a 422 the
      // caller never chose. Unset lets the engine apply the standard's own.
      schema: {},
    },
    {
      field: 'output',
      name: 'Output',
      type: 'string',
      meta: {
        width: 'half',
        interface: 'select-dropdown',
        options: { choices: OUTPUT_CHOICES },
        note: 'XML returns the raw invoice; PDF returns a hybrid PDF/A-3.',
        ...onlyWhen({ operation: { _eq: 'generate' } }),
      },
      schema: { default_value: 'xml' },
    },
    {
      field: 'invoice',
      name: 'Invoice Data',
      type: 'json',
      meta: {
        width: 'full',
        interface: 'input-code',
        options: { language: 'json' },
        note: 'Structured invoice: seller, buyer, lines, totals (see docs.beliq.eu).',
        ...onlyWhen({ operation: { _eq: 'generate' } }),
      },
      schema: { default_value: EXAMPLE_INVOICE },
    },
    {
      field: 'pdfTemplateId',
      name: 'PDF Template ID',
      type: 'string',
      meta: {
        width: 'half',
        interface: 'input',
        note: 'Optional. Render the PDF from a saved beliq dashboard template.',
        ...onlyWhen({ operation: { _eq: 'generate' } }),
      },
    },

    // Validate
    {
      field: 'validateFormat',
      name: 'Format',
      type: 'string',
      meta: {
        width: 'half',
        interface: 'select-dropdown',
        options: { choices: VALIDATE_FORMAT_CHOICES },
        note: 'Input format hint; auto-detect works for most documents.',
        ...onlyWhen({ operation: { _eq: 'validate' } }),
      },
      schema: { default_value: 'auto' },
    },
    {
      field: 'validateDocument',
      name: 'Document',
      type: 'text',
      meta: {
        width: 'full',
        interface: 'input-code',
        options: { language: 'xml' },
        note: 'Reference the XML from an earlier flow step, or paste it here.',
        ...onlyWhen({ operation: { _eq: 'validate' } }),
      },
    },

    // Parse
    {
      field: 'parseFormat',
      name: 'Format',
      type: 'string',
      meta: {
        width: 'half',
        interface: 'select-dropdown',
        options: { choices: PARSE_FORMAT_CHOICES },
        note: 'Input format hint; auto-detect works for most documents.',
        ...onlyWhen({ operation: { _eq: 'parse' } }),
      },
      schema: { default_value: 'auto' },
    },
    {
      field: 'parseDocument',
      name: 'Document',
      type: 'text',
      meta: {
        width: 'full',
        interface: 'input-code',
        options: { language: 'xml' },
        note: 'Reference the XML from an earlier flow step, or paste it here.',
        ...onlyWhen({ operation: { _eq: 'parse' } }),
      },
    },

    // Convert
    {
      field: 'targetFormat',
      name: 'Target Format',
      type: 'string',
      meta: {
        width: 'half',
        interface: 'select-dropdown',
        options: { choices: CONVERT_TARGET_CHOICES },
        note: 'Format to convert the document into.',
        ...onlyWhen({ operation: { _eq: 'convert' } }),
      },
      schema: { default_value: 'ubl' },
    },
    {
      field: 'convertProfile',
      name: 'Target Profile',
      type: 'string',
      meta: {
        width: 'half',
        interface: 'select-dropdown',
        options: { choices: PROFILE_CHOICES },
        note: 'Applies when the target is Factur-X or ZUGFeRD.',
        ...onlyWhen({ operation: { _eq: 'convert' } }),
      },
    },
    {
      field: 'convertDocument',
      name: 'Document',
      type: 'text',
      meta: {
        width: 'full',
        interface: 'input-code',
        options: { language: 'xml' },
        note: 'Reference the XML from an earlier flow step, or paste it here.',
        ...onlyWhen({ operation: { _eq: 'convert' } }),
      },
    },

    // Delivery (generate + convert produce bytes)
    {
      field: 'deliveryMode',
      name: 'Delivery',
      type: 'string',
      meta: {
        width: 'half',
        interface: 'select-dropdown',
        options: { choices: DELIVERY_CHOICES },
        note: 'How the generated file is returned.',
        conditions: [
          {
            name: 'show for byte-producing operations',
            rule: { operation: { _in: ['generate', 'convert'] } },
            hidden: false,
          },
        ],
        hidden: true,
      },
      schema: { default_value: 'directusFile' },
    },
    {
      field: 'folder',
      name: 'Target Folder',
      type: 'string',
      meta: {
        width: 'half',
        interface: 'system-folder',
        note: 'Optional folder for the created file.',
        ...onlyWhen({ deliveryMode: { _eq: 'directusFile' } }),
      },
    },

    // Connection
    {
      field: 'apiKey',
      name: 'API Key',
      type: 'string',
      meta: {
        width: 'full',
        interface: 'input',
        options: { masked: true },
        note: 'beliq API key. Leave blank to use the BELIQ_API_KEY environment variable.',
      },
    },
  ],
});
