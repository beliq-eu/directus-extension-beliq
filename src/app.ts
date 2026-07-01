import { defineOperationApp } from '@directus/extensions-sdk';
import {
  CONVERT_TARGET_CHOICES,
  DELIVERY_CHOICES,
  OPERATION_CHOICES,
  OUTPUT_CHOICES,
  PARSE_FORMAT_CHOICES,
  PROFILE_CHOICES,
  STANDARD_CHOICES,
  VALIDATE_FORMAT_CHOICES,
} from './lib/options.js';

type Rule = Record<string, unknown>;

/** Meta fragment that hides a field unless `rule` matches another option's value. */
function onlyWhen(rule: Rule) {
  return {
    hidden: true,
    conditions: [{ name: 'show', rule, hidden: false }],
  };
}

const EXAMPLE_INVOICE = {
  number: 'INV-001',
  issueDate: '2026-01-31',
  dueDate: '2026-03-02',
  currencyCode: 'EUR',
  seller: {
    name: 'Your Company GmbH',
    address: { line1: 'Main St 1', city: 'Berlin', postalCode: '10115', countryCode: 'DE' },
    taxId: 'DE123456789',
  },
  buyer: {
    name: 'Customer SARL',
    address: { line1: 'Rue 2', city: 'Paris', postalCode: '75001', countryCode: 'FR' },
  },
  lines: [
    {
      description: 'Widget',
      quantity: 2,
      unitPrice: 10,
      lineTotal: 20,
      vatRate: 19,
      vatCategoryCode: 'S',
    },
  ],
  taxSummary: [{ categoryCode: 'S', rate: 19, taxableAmount: 20, taxAmount: 3.8 }],
  paymentTerms: 'Net 30',
  totalNetAmount: 20,
  totalTaxAmount: 3.8,
  totalGrossAmount: 23.8,
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
        options: { choices: PROFILE_CHOICES },
        note: 'EN 16931 data granularity profile (applies to Factur-X / ZUGFeRD).',
        ...onlyWhen({ operation: { _eq: 'generate' } }),
      },
      schema: { default_value: 'en16931' },
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
