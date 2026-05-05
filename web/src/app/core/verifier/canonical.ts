/**
 * Canonical JSON serialisation for SecureFusion event manifests.
 *
 * Vendored TypeScript port of `reference-verifier/src/canonical.js`.
 * See `SOURCE.md` for the upstream commit hash and re-port policy.
 *
 * Implements the subset of RFC 8785 (JSON Canonicalization Scheme)
 * needed for SecureFusion manifests. The output is what gets hashed
 * to produce the bundleHash anchored on chain.
 *
 * Rules:
 *   - Object keys sorted lexicographically by Unicode codepoint.
 *   - No insignificant whitespace.
 *   - Booleans/null lowercase.
 *   - Numbers in shortest round-trip form (per RFC 8785).
 *   - Strings UTF-8 with minimal escaping.
 *
 * Non-goals: this implementation does NOT handle every RFC 8785 numeric
 * edge case (large integers, NaN, Infinity). SecureFusion manifests
 * don't require these. If you hit a numeric edge case, file an issue.
 */

/**
 * Produce the canonical UTF-8 byte representation of a value, ready
 * for hashing.
 */
export function canonicalise(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicaliseToString(value));
}

/**
 * Produce the canonical JSON string representation of a value.
 */
export function canonicaliseToString(value: unknown): string {
  return serialise(value);
}

function serialise(v: unknown): string {
  if (v === null) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';

  const type = typeof v;
  if (type === 'number') return serialiseNumber(v as number);
  if (type === 'string') return serialiseString(v as string);

  if (Array.isArray(v)) {
    return '[' + v.map(serialise).join(',') + ']';
  }

  if (type === 'object') {
    // All keys are canonicalised. Underscore-prefixed keys are NOT
    // special: they are part of the manifest if present and contribute
    // to the hash. Examples that need human-readable comments must
    // keep them in a sibling .meta.json file, not inside the manifest
    // itself. (joint-plan D2; B1.)
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => serialiseString(k) + ':' + serialise(obj[k]));
    return '{' + parts.join(',') + '}';
  }

  throw new Error(`Cannot canonicalise value of type ${type}`);
}

function serialiseNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error('Non-finite numbers are not permitted in canonical JSON');
  }
  // Integers without a decimal point.
  if (Number.isInteger(n)) return String(n);
  // For floats, JavaScript's default toString produces the shortest
  // round-trippable representation, which matches RFC 8785 for the
  // ranges SecureFusion uses (geo coordinates, accelerations, etc.).
  return String(n);
}

function serialiseString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) out += '\\"';
    else if (c === 0x5c) out += '\\\\';
    else if (c === 0x08) out += '\\b';
    else if (c === 0x0c) out += '\\f';
    else if (c === 0x0a) out += '\\n';
    else if (c === 0x0d) out += '\\r';
    else if (c === 0x09) out += '\\t';
    else if (c < 0x20) out += '\\u' + c.toString(16).padStart(4, '0');
    else out += s[i];
  }
  out += '"';
  return out;
}
