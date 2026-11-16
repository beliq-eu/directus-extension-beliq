# Changelog

This file starts at 0.3.1. An earlier version has a heading here only for a
breaking change; the rest of its changes are in the git history between the
version tags (https://github.com/beliq-eu/directus-extension-beliq/tags). 0.1.0
is on npm without a tag. Dates are the npm publish date, in UTC.

## 0.3.3 - 2026-11-16

- The README says that beliq covers three steps of an e-invoice: generate,
  validate, and deliver (in development). The operation runs the first two,
  parses and converts, and never sends or files an invoice. Until delivery
  through beliq is available, transmission (Peppol, plateforme agréée, SDI)
  and tax-authority reporting stay with your access point. Archiving stays
  with you, and beliq does not operate KSeF submission. No behaviour changed.

## 0.3.2 - 2026-11-16

- The package description, the README, the operation's description in the
  Directus UI and the two example flows no longer call the result compliant or
  the rules authority-pinned. Validate checks against the rule packs and
  schemas of the document's format, each pinned by version and hash. No
  behaviour changed.

## 0.3.1 - 2026-11-07

- Declares Directus 12: the extension's host range is `^11.0.0 || ^12.0.0`,
  where it was `^11.0.0`. No source file changed.

## 0.3.0 - 2026-11-06

- Breaking: Convert's `lostElements` output holds one object per lost element,
  with `path`, `value`, `reason`, `severity` and `acceptableLoss`. Before, each
  entry was the string `[object Object]`. When the list would pass the 6 KB
  header cap, it holds one `{ "truncated": true }` entry instead.
  `lostElementsCount` is unchanged.
