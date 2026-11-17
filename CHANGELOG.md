# Changelog

This file starts at 0.3.1. An earlier version has a heading here only for a
breaking change; the rest of its changes are in the git history between the
version tags (https://github.com/beliq-eu/directus-extension-beliq/tags). 0.1.0
is on npm without a tag. Dates are the npm publish date, in UTC.

## 0.4.0 - 2026-11-17

- Breaking: a request to beliq that takes longer than 25 seconds now fails
  with a timeout. In 0.3.3 an attempt could take up to 90 seconds, so a
  large document that beliq answered in, say, 40 seconds worked then. A flow
  that rode out a short outage on 0.3.3's retries now fails at once and has
  to run again.
- The operation does not retry when beliq is unavailable. A 503
  `DATABASE_UNAVAILABLE`, or an API that cannot be reached, fails the
  operation at once, and an attempt that gets no answer ends after 25
  seconds. In 0.3.3 an outage was retried 3 times, about 2 minutes at
  `Retry-After: 30`, with attempts of up to 90 seconds. A blocking flow holds
  a database connection while the operation waits, so a wait of minutes makes
  other requests to the instance fail. The README's "When beliq is unavailable"
  gives the readings from Directus 12.6.1 on SQLite and PostgreSQL.
- An outage error starts with `beliq is unavailable for now` and says when to
  try again: `Try again in 30 seconds` when beliq sent a wait, or
  `beliq did not say when; try again later`. Any other error with a
  `Retry-After`, such as a 429 `RATE_LIMITED`, names the wait too.
- The extension bundles `@beliq/sdk` 0.7, up from 0.6.
- The package includes this changelog.

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
