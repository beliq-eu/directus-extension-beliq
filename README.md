# directus-extension-beliq

A [Directus](https://directus.io) Flow **operation**: generate, validate, parse and convert EU e-invoices (XRechnung, ZUGFeRD, Factur-X, Peppol BIS) with the [beliq](https://beliq.eu) API from Directus. [Format coverage](#format-coverage) lists the further formats Generate carries and how deep each check goes.

One operation, four use cases:

- **Generate** an invoice from a structured EN 16931 object, as XML or PDF.
- **Validate** a document against the rule packs and schemas of its format and return the verdict.
- **Parse** a document into a structured invoice.
- **Convert** a document between formats (CII, UBL, ZUGFeRD, Factur-X, XRechnung, Peppol BIS).

By default the bytes an operation produces (a generated PDF, a converted document) are saved **straight into Directus Files** and the operation returns the new file's `fileId`, so a following operation can attach it to a record. You can also return them as **base64**. Generate as XML and validate/parse return their JSON straight into the flow data chain.

The save runs with the permissions of whoever triggered the flow, such as the user behind a webhook call or the user whose change an event flow reacts to. A scheduled flow has no user and saves without a permission check. Outside the admin role, that user's policy needs **create** on `directus_files`. Without it the operation fails with Directus's "You don't have permission to access collection "directus_files"" error, after beliq has generated or converted the document, so that call still counts against your quota.

Backed by the published [`@beliq/sdk`](https://www.npmjs.com/package/@beliq/sdk).

## Installation

This is a standard (non-sandboxed) API extension, so it installs on self-hosted Directus 11 and 12, the range `directus:extension.host` in `package.json` declares:

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
- **Convert** also returns `lostElementsCount`, how many source elements the engine recorded as having no target equivalent, and `lostElements`, one object per loss with the `path`, `value`, `reason`, `severity` and `acceptableLoss` that [the LostElement schema](https://docs.beliq.eu/api-reference/convert/#lostelement-schema) describes. A loss the engine does not detect is not counted. When the list would pass the API's 6 KB header cap, it holds one `{ "truncated": true }` entry instead of the losses, and `lostElementsCount` stays the exact count.

## When beliq is unavailable

The operation does not retry. When beliq answers that it is unavailable, or cannot be reached, the operation fails at once, and its error says when to try again: `Try again in 15 seconds` when beliq sent a wait, or `beliq did not say when; try again later`. An attempt that gets no answer ends after 25 seconds.

It does not retry because of how Directus runs a blocking flow (an Event Hook of type Filter, such as one on `items.create`). The save waits for the operation, and Directus holds a database connection for the whole wait. On Directus 12.6.1 we measured:

- On SQLite, that connection is the only one. While one save waits, every other request that reads the database waits too, and fails after 60 seconds with `Knex: Timeout acquiring a connection`.
- On PostgreSQL, the pool holds 10 connections by default (`DB_POOL__MAX`). Ten saves waiting at once have the same effect.

Because the operation gives up after 25 seconds, the other requests wait at most that long and then go through. With retries on, a save waited minutes, and the other requests failed.

When the operation fails in a blocking flow, Directus refuses the save with the error, and nothing is written. In a Webhook flow, the caller still gets `200` with an empty body, and the error shows only in the flow's logs.

## Format coverage

The Standard dropdown of **Generate** carries every standard `POST /v1/generate` accepts. `GET https://api.beliq.eu/v1/rulesets` publishes each format with a badge saying how deep its check goes:

- **Authority-checked** (the authority's own rules): XRechnung, ZUGFeRD, Factur-X, Peppol BIS and NLCIUS.
- **Schema-checked** (structure only, no business rules): FatturaPA, Facturae, e-SLOG and KSeF FA(3). Their authority publishes no machine-readable business rules.

One profile sits below its standard's badge: Romania RO_CIUS, a profile of Peppol BIS, is **Community-checked** (real business rules from an independent pack, not the authority's own). The [Romania reference](https://docs.beliq.eu/format-reference/romania/) says why.

KSeF FA(3) generation covers ordinary VAT invoices in PLN between Polish parties, at VAT rates 23, 22, 8, 7 and 5. The [Poland KSeF FA(3) reference](https://docs.beliq.eu/format-reference/poland/) states the full scope.

beliq does five things with an e-invoice: generate, validate, parse, convert and deliver (in development). This operation runs the first four; it never sends or files an invoice. Until delivery through beliq is available, transmission (Peppol, plateforme agréée, SDI) and tax-authority reporting stay with your access point. Archiving stays with you, and beliq does not operate KSeF submission.

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
npm run typecheck  # type-check src/ and test/, emits nothing
npm run lint       # ESLint over src/, test/, examples/ and the root config files
npm test           # unit tests (operation mapping)
```

Live smoke test against the real API, with a `blq_test_` sandbox key so its 8 documents come out of the sandbox allowance rather than a plan quota:

```bash
BELIQ_API_KEY=blq_test_xxx npm run test:integration
```

## License

[MIT](./LICENSE)
