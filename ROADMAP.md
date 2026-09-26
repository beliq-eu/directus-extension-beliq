# Directus beliq connector - implementation roadmap

`status: live, next: the real-instance check, install the package into a throwaway Directus 11 and run each operation against a live key`

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
extension calls the published `@beliq/sdk` (`^0.4.0`) directly. The SDK owns the
wire format (paths, query, body, headers, envelope parsing), so the extension is
thin: resolve the key, dispatch by operation, deliver bytes. Option value-spaces
come from the SDK's `LIVE_*` lists so the UI never drifts from the API surface.

The build inlines the SDK into `dist/api.js`, so `@beliq/sdk` is a
`devDependency` and the published package declares no runtime dependency. A
Marketplace install only extracts the tarball, so a declared dependency would
never have been installed there anyway. The SDK version a release carries is
the one `package-lock.json` pins at its tag, because the release job installs
with `npm ci`. It ran `npm install` until 2026-09-24, on the belief that this
picked up the newest SDK patch; checked that day with npm 12.0.2, the version
the release job pins, it kept the locked 0.4.0 while 0.4.2 was the newest on
npm, so the switch changes nothing but makes the lockfile binding.

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
- done: Unit tests, green: `test/mapping.test.ts` (recording fetch asserts each
  operation's URL/method/query/body/headers), `test/handler.test.ts`,
  `test/sample-invoice.test.ts`, and `test/examples.test.ts` (every example
  flow sets only option values the operation accepts). `npm test` ran 36, all
  passing, offline on 2026-09-24.
- done: Live smoke `test/integration.test.ts` gated on `BELIQ_API_KEY` (5 tests).
- done: Per-angle example flows + `examples/import.mjs` loader, README.
- done: `npm run build` + `directus-extension validate` + em-dash sweep.

The real-instance check is the one open item and is tracked in the follow-ups
below, since it needs an instance this pass does not stand up.

## Out of scope this pass (follow-ups, need external coordination)

- done: Bootstrap publish. `directus-extension-beliq@0.1.0` was the local
  bootstrap under the npm `beliq` account with `--no-provenance` (a local publish
  has no CI OIDC token). Superseded by the OIDC release below.
- done: Repo `github.com/beliq-eu/directus-extension-beliq` (public) exists.
- done: Trusted Publisher attached on npmjs.com (`beliq-eu/directus-extension-beliq`,
  workflow `release.yml`). Verified end to end: tag `v0.1.1` published
  `directus-extension-beliq@0.1.1` through the OIDC workflow with a SLSA
  provenance attestation, no `NPM_TOKEN`. Every release cuts a `v*.*.*` tag and
  flows through `release.yml`; the published version is `0.2.5` (npm, read
  2026-09-24).
- done: Docs guide, live at https://docs.beliq.eu/integrations/directus/. Covers
  install (Marketplace and npm), use in a Flow, the four operations, and the
  `examples/import.mjs` loader.
- todo: Real-instance check - install the package into a throwaway Directus 11
  (npm, or its `package.json` and `dist/` in their own folder under
  `extensions/`) and run each operation against a live key. `api.beliq.eu`
  answers, so the key is the only input still to arrange.

## Notes / known unknowns

- `FilesService.uploadOne` storage location: uses the first entry of
  `env.STORAGE_LOCATIONS` (falls back to `local`). Confirm on a multi-storage
  install.
- Operation-options `meta.conditions` hide/show fields in the Flow panel;
  verified shape locally, confirm rendering during the real-instance check.
- Directus Cloud is out of reach by design (sandbox-only). Revisit if the
  sandbox ever gains a Files API + binary responses.

## Dependency state, measured 2026-09-24

Re-homed from `beliq-hq/STATUS-CONVENTION-ROADMAP.md`'s parked backlog in pass 8a-2. It was parked
there because a lockfile refresh is a code change and a stamping pass does not own one. It belongs
here.

**Five open Dependabot alerts, all development scope.** Measured against the API on 2026-09-24:

| # | Severity | Package | Advisory |
|---|---|---|---|
| 44 | high | `svgo` | `GHSA-w27v-7q3p-w38r` |
| 40 | high | `browserslist` | `GHSA-73wf-gq98-2v4g` |
| 45 | medium | `svgo` | `GHSA-4vpr-x523-8j87` |
| 39 | medium | `decode-uri-component` | `GHSA-vcc3-ghjq-m6fr` |
| 49 | medium | `baseline-browser-mapping` | `GHSA-w5vr-8v7q-w6rv` |

Every one carries `scope: development`, sits in `package-lock.json`, and comes in through
`@directus/extensions-sdk` -> `rollup-plugin-styler`, the build's CSS plugin. They run inside the
build and none is part of the bundle: `dist/api.js` imports only `node:stream`, and `dist/app.js`
only `@directus/extensions-sdk`, which the Directus host provides. That is the reason they are
recorded here rather than treated as an incident. `npm audit` on 2026-09-24 offered a fix without a
major version bump for all five, not applied at that date.

On 2026-09-21 there were seven: #48 (`vitest`) and #46 (`@vitest/mocker`, both
`GHSA-82fw-gwwq-j7x9`) were fixed that day when the vitest 4 update
[#18](https://github.com/beliq-eu/directus-extension-beliq/pull/18) merged.

**The parked entry recorded two; on 2026-09-21 it was seven.** This repo had already cleared its
alerts once (#4, 2026-08-08), so these are new rather than untouched, and the count more than
tripled in the six weeks since.

**The gap was merging, not noticing, and the queue cleared on 2026-09-21.** Renovate had already
proposed the fixes and they were still open at the 2026-09-21 measurement:
[#18](https://github.com/beliq-eu/directus-extension-beliq/pull/18) (`vitest` to v4, security,
proposed 2026-09-13, merged 2026-09-21) and
[#17](https://github.com/beliq-eu/directus-extension-beliq/pull/17) (`@unhead/vue` to v3, proposed
2026-09-07, merged 2026-09-21), beside
[#22](https://github.com/beliq-eu/directus-extension-beliq/pull/22) on the release workflow, merged
2026-09-21. At that date `renovate.json` extended the plain `local>beliq-eu/.github` preset, so
nothing landed without a human, and this queue was the cost. Since
[#27](https://github.com/beliq-eu/directus-extension-beliq/pull/27) (merged 2026-09-22) it extends
`local>beliq-eu/.github:automerge`: patch and digest updates and vulnerability-alert fixes merge on
their own once their status checks pass, and other minor and major updates still wait for a human.

**Both security PRs were red, and neither was broken by its dependency.** #18's `npm ci` failed at
the install step with `Missing: nanoid@3.3.19 from lock file`: Renovate updated `package.json` and
most of `package-lock.json` for the vitest 3 to 4 bump and left the regenerated tree incomplete.
Every step after the install skipped, so the PR presented as a failing test run with nothing tested,
and a reviewer reading the check names would conclude vitest 4 broke the extension. Regenerated by
hand on that branch on 2026-09-21 and verified against a clean `node_modules`: `npm ci` succeeds,
`directus-extension build` succeeds, and vitest 4.1.11 runs 28 passed / 5 skipped across 4 files.
The sibling `zapier-beliq` had the same class of failure on its own dependency PR from a different
cause (no lockfile update at all), so **read a red Renovate PR here as a lockfile problem until
proven otherwise**, not as a broken dependency.
