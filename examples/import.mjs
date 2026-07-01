#!/usr/bin/env node
// Import one of the example Flow definitions into a running Directus instance.
//
// Directus has no one-click Flow import in the UI, so this POSTs the flow and
// its operation(s) through the Flows API and wires them together.
//
//   DIRECTUS_URL=https://directus.example.com \
//   DIRECTUS_TOKEN=<admin static token> \
//   node examples/import.mjs validate-uploaded-file.flow.json
//
// The token must belong to an admin (creating flows/operations is admin-only).
// Get one from User Directory -> your user -> Token, or the static token env var.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const url = (process.env.DIRECTUS_URL || '').replace(/\/+$/, '');
const token = process.env.DIRECTUS_TOKEN || '';
const fileArg = process.argv[2];

if (!url || !token || !fileArg) {
  console.error(
    'Usage: DIRECTUS_URL=... DIRECTUS_TOKEN=... node examples/import.mjs <flow-file.json>',
  );
  process.exit(1);
}

const filePath = isAbsolute(fileArg) ? fileArg : resolve(here, fileArg);

async function api(method, path, body) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message = json?.errors?.[0]?.message || text || res.statusText;
    throw new Error(`${method} ${path} -> ${res.status}: ${message}`);
  }
  return json.data;
}

// Drop the human-only "$note" keys before sending anything to Directus.
function strip(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k !== '$note') out[k] = v;
  }
  return out;
}

const raw = JSON.parse(await readFile(filePath, 'utf8'));
const flowDef = strip(raw.flow);
const opsDef = (raw.operations || []).map(strip);

const flow = await api('POST', '/flows', flowDef);
console.log(`Created flow "${flow.name}" (${flow.id})`);

// Create each operation, chaining them in array order via "resolve" (the
// success path) so a multi-step example wires end to end.
let previousId = null;
let firstId = null;
for (const op of opsDef) {
  const created = await api('POST', '/operations', { ...op, flow: flow.id });
  console.log(`  + operation "${created.name}" (${created.type})`);
  if (firstId === null) firstId = created.id;
  if (previousId) await api('PATCH', `/operations/${previousId}`, { resolve: created.id });
  previousId = created.id;
}

// The flow's entry point is its first operation.
if (firstId) await api('PATCH', `/flows/${flow.id}`, { operation: firstId });

console.log(`\nDone. Open it at ${url}/admin/settings/flows/${flow.id}`);
