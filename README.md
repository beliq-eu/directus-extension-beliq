# directus-extension-beliq

A [Directus](https://directus.io) Flow **operation** for [beliq](https://beliq.eu), a REST API that generates, validates, parses, and converts EU-compliant e-invoices (XRechnung, ZUGFeRD, Factur-X, Peppol BIS) against authority-pinned, drift-checked rules.

One operation, four use cases:

- **Generate** an invoice from a structured EN 16931 object, as XML or a hybrid PDF/A-3.
- **Validate** a document against the pinned rule set and return the compliance verdict.
- **Parse** a document into a structured invoice.
- **Convert** a document between formats (CII, UBL, ZUGFeRD, Factur-X, XRechnung, Peppol BIS).

By default the bytes an operation produces (a generated PDF, a converted document) are saved **straight into Directus Files** and the operation returns the new file's `fileId`, so a following operation can attach it to a record. You can also return them as **base64**. Generate as XML and validate/parse return their JSON straight into the flow data chain.

Backed by the published [`@beliq/sdk`](https://www.npmjs.com/package/@beliq/sdk).

## Installation

This is a standard (non-sandboxed) API extension, so it installs on self-hosted Directus:

- **Marketplace** (self-hosted with `MARKETPLACE_TRUST=all`): search for `directus-extension-beliq`.
- **Manual**: `npm install directus-extension-beliq` into your project, or drop the built `dist/` into your `extensions/` directory, then restart Directus.

It is not installable on Directus Cloud (which only runs sandboxed extensions; the sandbox has no access to the Files service or binary responses).

## Use it in a Flow

Add the **beliq** operation to a Flow and pick an operation.

- **API Key**: paste a key from [dashboard.beliq.eu](https://dashboard.beliq.eu), or leave it blank to read the `BELIQ_API_KEY` environment variable (recommended, keeps the key out of the flow definition).
- **Delivery** (Generate as PDF, and Convert):
  - **Save to Directus File** (default) returns `{ fileId, filename, contentType, sizeBytes, ... }`.
  - **Base64** returns `{ base64, ... }`.
- **Generate** as XML returns `{ xml, contentType, ... }`; **Validate** and **Parse** return their JSON result.

## Examples

`examples/` holds three ready-to-load Flow definitions, one per angle:

- `generate-xrechnung-from-record.flow.json` - turn a new invoice record into an XRechnung XML invoice.
- `validate-uploaded-file.flow.json` - validate an invoice document and return the verdict.
- `convert-format.flow.json` - convert a document to a Factur-X hybrid PDF and store it.

Directus has no one-click Flow import, so `examples/import.mjs` (zero dependencies) POSTs a chosen example to your instance through the Flows API and wires it up:

```bash
DIRECTUS_URL=https://directus.example.com \
DIRECTUS_TOKEN=<admin static token> \
node examples/import.mjs validate-uploaded-file.flow.json
```

It prints the flow's admin URL when done. Open it, set your API key (or the `BELIQ_API_KEY` env var), and run.

## Development

```bash
npm install
npm run build      # @directus/extensions-sdk -> dist/app.js + dist/api.js
npm run validate   # SDK conformance check
npm test           # unit tests (operation mapping)
npm run scrub:check
```

Live smoke test against the real API:

```bash
BELIQ_API_KEY=beliq_xxx npm run test:integration
```

## License

[MIT](./LICENSE)
