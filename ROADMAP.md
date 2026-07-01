# Directus beliq connector - implementation roadmap

Living roadmap for the Directus connector, a beliq clone of the sibling
`../../polydoc/tools/directus-extension-polydoc`, backed by the published
`@beliq/sdk` (not a vendored request builder).

Status legend: todo · in progress · done

---

## 0. Decision record (why this shape)

Directus's automation surface is **Flows**, and the step type inside a Flow is
an **operation**. So the direct analog of an n8n node or an Activepieces piece
is a single **operation extension** with an `operation` dropdown
(generate / validate / parse / convert). Not a bundle, not four extensions.

### Standard (non-sandboxed) extension - the load-bearing decision

Directus has two mutually exclusive execution models per package:

| Model | Capabilities | Install | Verdict |
|---|---|---|---|
| **Sandboxed** | `request` / `log` / `sleep` only. No `FilesService`, no DB, no clean binary handling. | One-click on Directus Cloud + self-hosted | Would gut the core value (cannot save a generated PDF) |
| **Standard** | Full handler `context`: `services` (incl. `FilesService`), `getSchema`, `database`, `accountability`, `env`; global `fetch`. | Self-hosted (npm / Marketplace with `MARKETPLACE_TRUST=all`); **not** Directus Cloud | **Chosen** |

Standard wins: it lets the operation save the generated file **straight into
Directus Files** and return the `fileId`, which is the database-native
integration. Trade-off accepted: no one-click install on Directus Cloud.

### Backed by @beliq/sdk

Unlike the polydoc extension (which vendors a `buildRequestBody` port), this
extension calls the published `@beliq/sdk` (`^0.1.1`) directly. The SDK owns the
wire format (paths, query, body, headers, envelope parsing), so the extension is
thin: resolve the key, dispatch by operation, deliver bytes. Option value-spaces
come from the SDK's `LIVE_*` lists so the UI never drifts from the API surface.

### Marketplace listing

Marketplace discovery is by npm keyword: the package carries
`directus-extension` and `directus-extension-operation`, and Directus's
Marketplace auto-indexes matching npm packages with **no review gate**. There is
no sandbox, so it lists as an unsandboxed extension that self-hosted instances
opt into via `MARKETPLACE_TRUST=all`.

### Naming

Folder + npm package = `directus-extension-beliq` (unscoped). Marketplace
discovery requires the `directus-extension-` name prefix, and for Directus the
repo root *is* the published package. Icon is a Material Symbols name
(`receipt_long`), not a bundled SVG, so there is no copy-icons build step.

---

## 1. Product model

beliq API operations surfaced here (single dropdown):

- **Generate** `POST /v1/generate` - JSON invoice in, XML or hybrid PDF out.
- **Validate** `POST /v1/validate` - document bytes in, JSON verdict out.
- **Parse** `POST /v1/parse` - document bytes in, structured JSON out.
- **Convert** `POST /v1/convert` - document bytes in, converted bytes out.

Delivery for the byte-producing operations (Generate as PDF, Convert):
**Directus File (default)** via `FilesService.uploadOne`, returning
`{ fileId, ... }`; or **base64** inline. No cloudStorage / webhook delivery
(beliq has no such transport) and no `X-Sandbox` header (beliq has no sandbox
tier).

Option value-spaces come from the SDK `LIVE_*` lists. Provisional formats the
API can technically accept stay out of the UI (LPD-1).

### Three angle-split example flows

| Angle | Example flow |
|---|---|
| Generate | `examples/generate-xrechnung-from-record.flow.json` |
| Validate | `examples/validate-uploaded-file.flow.json` |
| Convert | `examples/convert-format.flow.json` |

Directus has no one-click Flow import, so `examples/import.mjs` (zero deps)
POSTs a chosen example through the Flows API and wires the entry point.

---

## 2. Build checklist (this pass: build + verify locally only)

- done: Scaffold repo, `package.json` (`directus:extension` operation block +
  Marketplace keywords + `@beliq/sdk` dep), `tsconfig`, `vitest.config`,
  `.gitignore`, `LICENSE`.
- done: `src/lib/options.ts` (LIVE_* -> Directus choices + LABELS),
  `src/lib/beliq.ts` (createClient / mapError / asJsonObject),
  `src/lib/deliver.ts` (FilesService.uploadOne).
- done: `src/app.ts` (`defineOperationApp`): operation dropdown + per-op option
  groups, conditional via `meta.conditions`, delivery + folder, API key.
- done: `src/api.ts` (`defineOperationApi`): resolve key -> `new Beliq` ->
  dispatch by operation -> deliver bytes (Directus File / base64) -> `mapError`.
- done: Unit tests `test/mapping.test.ts` (recording fetch asserts each
  operation's URL/method/query/body/headers), green.
- done: Live smoke `test/integration.test.ts` gated on `BELIQ_API_KEY`.
- done: Per-angle example flows + `examples/import.mjs` loader, README.
- done: `npm run build` + `directus-extension validate` + em-dash sweep.
- todo: Real-instance check - load `dist/` into a throwaway Directus 11, run
  each operation against a live key.

## Out of scope this pass (follow-ups, need external coordination)

- done: Bootstrap publish. `directus-extension-beliq@0.1.0` is live on npm
  (public, tag `latest`), published locally under the npm `beliq` account with
  `--no-provenance` (a local publish has no CI OIDC token, so provenance is off
  for this one release only).
- done: Repo `github.com/beliq-eu/directus-extension-beliq` (public) exists.
- todo (operator, on npmjs.com): attach `beliq-eu/directus-extension-beliq` as a
  Trusted Publisher for the package, so tagged releases publish via OIDC with
  provenance through `release.yml`. Needs an npm login; cannot be done with a
  publish token.
- todo: Real-instance check - load `dist/` into a throwaway Directus 11, run each
  operation against a live key (needs the beliq API live).
- todo: Docs guide on docs.beliq.eu (install + 4 use cases + the `import.mjs`
  loader).

## Notes / known unknowns

- `FilesService.uploadOne` storage location: uses the first entry of
  `env.STORAGE_LOCATIONS` (falls back to `local`). Confirm on a multi-storage
  install.
- Operation-options `meta.conditions` hide/show fields in the Flow panel;
  verified shape locally, confirm rendering during the real-instance check.
- Directus Cloud is out of reach by design (sandbox-only). Revisit if the
  sandbox ever gains a Files API + binary responses.
