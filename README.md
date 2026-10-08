# directus-extension-beliq

A [Directus](https://directus.io) Flow **operation** for [beliq](https://beliq.eu), a REST API that generates, validates, parses, and converts EU-compliant e-invoices (XRechnung, ZUGFeRD, Factur-X, Peppol BIS) against authority-pinned, drift-checked rules.

One operation, four use cases:

- **Generate** an invoice from a structured EN 16931 object, as XML or PDF.
- **Validate** a document against the pinned rule set and return the compliance verdict.
- **Parse** a document into a structured invoice.
- **Convert** a document between formats (CII, UBL, ZUGFeRD, Factur-X, XRechnung, Peppol BIS).

By default the bytes an operation produces (a generated PDF, a converted document) are saved **straight into Directus Files** and the operation returns the new file's `fileId`, so a following operation can attach it to a record. You can also return them as **base64**. Generate as XML and validate/parse return their JSON straight into the flow data chain.

Backed by the published [`@beliq/sdk`](https://www.npmjs.com/package/@beliq/sdk).

## Installation

This is a standard (non-sandboxed) API extension, so it installs on self-hosted Directus:

- **Marketplace** (self-hosted with `MARKETPLACE_TRUST=all`): search for `directus-extension-beliq`.
- **npm**: run `npm install directus-extension-beliq` in your Directus project directory, then restart Directus. Directus loads the extensions listed in that project's `package.json` dependencies.
- **Extensions folder**: give the extension its own folder under `extensions/` (the `EXTENSIONS_PATH` setting) holding its `package.json` and `dist/`, then restart Directus. Directus reads each folder's `package.json` to find the entry points and skips a folder without one, so a bare `dist/` is never loaded:

  ```bash
  mkdir -p extensions/directus-extension-beliq
  npm pack directus-extension-beliq
  tar -xzf directus-extension-beliq-*.tgz --strip-components=1 -C extensions/directus-extension-beliq
  ```

It is not installable on Directus Cloud (which only runs sandboxed extensions; the sandbox has no access to the Files service or binary responses).

## Use it in a Flow

Add the **beliq** operation to a Flow and pick an operation.

- **API Key**: paste a key from [dashboard.beliq.eu](https://dashboard.beliq.eu), or leave it blank to read the `BELIQ_API_KEY` environment variable (recommended, keeps the key out of the flow definition).
- **Delivery** (Generate as PDF, and Convert):
  - **Save to Directus File** (default) returns `{ fileId, filename, contentType, sizeBytes, ... }`.
  - **Base64** returns `{ base64, ... }`.
- **Generate** as XML returns `{ xml, contentType, ... }`; **Validate** and **Parse** return their JSON result.

## Format coverage

The Standard dropdown of **Generate** carries every standard `POST /v1/generate` accepts. `GET https://api.beliq.eu/v1/rulesets` publishes each format with a badge saying how deep its check goes:

- **Authority-checked** (the authority's own rules): XRechnung, ZUGFeRD, Factur-X, Peppol BIS and NLCIUS.
- **Schema-checked** (structure only, no business rules): FatturaPA, Facturae, e-SLOG and KSeF FA(3). Their authority publishes no machine-readable business rules.

One profile sits below its standard's badge: Romania RO_CIUS, a profile of Peppol BIS, is **Community-checked** (real business rules from an independent pack, not the authority's own). The [Romania reference](https://docs.beliq.eu/format-reference/romania/) says why.

KSeF FA(3) generation covers ordinary VAT invoices in PLN between Polish parties, at VAT rates 23, 22, 8, 7 and 5. The [Poland KSeF FA(3) reference](https://docs.beliq.eu/format-reference/poland/) states the full scope.

beliq generates and validates the document. Transmission (Peppol, PDP, KSeF, SDI), archiving, and tax-authority reporting are separate and remain your access point's job: beliq does not operate KSeF submission, and this operation never sends or files an invoice.

Only ZUGFeRD and Factur-X have a hybrid PDF, a PDF/A-3 with the XML embedded. For the other standards, PDF output is a visualization with no XML inside it, and the legal document is the XML. NLCIUS always returns XML.

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

Live smoke test against the real API, with a `blq_test_` sandbox key so its 8 documents come out of the sandbox allowance rather than a plan quota:

```bash
BELIQ_API_KEY=blq_test_xxx npm run test:integration
```

## License

[MIT](./LICENSE)
