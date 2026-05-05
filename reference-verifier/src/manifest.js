/**
 * v1 manifest schema validation.
 *
 * Loads `schema/event-manifest.schema.json` (the canonical SF1 schema) and
 * exposes a single `validateManifest(manifest)` that returns either
 *   { ok: true }
 * or
 *   { ok: false, reason: 'manifest-schema-invalid', errors: [...] }
 *
 * Reason code is intentionally generic; callers wanting per-field detail
 * read `errors`. The verifier surfaces only the stable code, never the
 * raw schema-validator output.
 */

import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, '..', '..', 'schema', 'event-manifest.schema.json');

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

const ajv = new Ajv({
  allErrors: true,
  strict: false, // schema uses 2020-12 features Ajv accepts under strict:false
});
addFormats(ajv);

const validate = ajv.compile(schema);

/**
 * @param {unknown} manifest
 * @returns {{ok:true} | {ok:false, reason:string, errors:object[]}}
 */
export function validateManifest(manifest) {
  const ok = validate(manifest);
  if (ok) return { ok: true };
  return {
    ok: false,
    reason: 'manifest-schema-invalid',
    errors: validate.errors ?? [],
  };
}

export { schema as v1Schema };
