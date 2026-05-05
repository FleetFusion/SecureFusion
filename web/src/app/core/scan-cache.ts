/**
 * IndexedDB-backed scan cache.
 *
 * The orchestrator scans an account's `account_tx` history forward,
 * indexing every SF1.bundle (3-memo anchor) and SF1.ots upgrade
 * (4-memo) tx it encounters. The cache is keyed by
 * `(account, rippledUrl)` — a different rippled node clears/forks its
 * own cache. On a warm boot the orchestrator reads the cursor and
 * scans only new ledgers; on a cold boot the cursor is undefined and
 * the scan starts from genesis.
 *
 * Per-origin scoping is automatic (browser sandbox).
 *
 * Schema v1:
 *   - object store `channel`: key = sha256 hex; value = ChannelEntry
 *   - object store `ots`:     key = bundleHashHex; value = OtsEntry
 *   - object store `meta`:    single record {id:'cursor', value:number}
 */

import { deleteDB, openDB, type IDBPDatabase } from 'idb';

export interface ChannelEntry {
  txHash: string;
  ledgerIndex: number;
  bundleHashHex: string;
}

export interface OtsEntry {
  txHash: string;
  ledgerIndex: number;
}

export const SCAN_CACHE_VERSION = 1;
const STORE_CHANNEL = 'channel';
const STORE_OTS = 'ots';
const STORE_META = 'meta';

/**
 * Open (or create) the per-account scan-cache database. The database
 * name composes the account so a different rippled node forks into a
 * separate database, preventing one node's view contaminating another.
 *
 * @param account     r-prefixed XRPL classic address.
 * @param rippledUrl  optional rippled URL fragment baked into the DB
 *                    name. When supplied, switching rippled URLs
 *                    invalidates the cache automatically.
 */
export async function openScanCache(
  account: string,
  rippledUrl?: string,
): Promise<IDBPDatabase> {
  const name = dbNameFor(account, rippledUrl);
  return openDB(name, SCAN_CACHE_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_CHANNEL)) {
        db.createObjectStore(STORE_CHANNEL);
      }
      if (!db.objectStoreNames.contains(STORE_OTS)) {
        db.createObjectStore(STORE_OTS);
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    },
  });
}

export async function putChannelEntry(
  db: IDBPDatabase,
  sha256: string,
  entry: ChannelEntry,
): Promise<void> {
  await db.put(STORE_CHANNEL, entry, sha256);
}

export async function getChannelEntry(
  db: IDBPDatabase,
  sha256: string,
): Promise<ChannelEntry | undefined> {
  return (await db.get(STORE_CHANNEL, sha256)) as ChannelEntry | undefined;
}

export async function putOtsEntry(
  db: IDBPDatabase,
  bundleHashHex: string,
  entry: OtsEntry,
): Promise<void> {
  await db.put(STORE_OTS, entry, bundleHashHex);
}

export async function getOtsEntry(
  db: IDBPDatabase,
  bundleHashHex: string,
): Promise<OtsEntry | undefined> {
  return (await db.get(STORE_OTS, bundleHashHex)) as OtsEntry | undefined;
}

/**
 * Persist the scan cursor — the highest ledger_index successfully
 * indexed. The orchestrator passes this back as `fromLedger` on a
 * warm-resume to avoid rescanning ledgers it has already covered.
 */
export async function setScanCursor(db: IDBPDatabase, ledgerIndex: number): Promise<void> {
  await db.put(STORE_META, ledgerIndex, 'cursor');
  await db.put(STORE_META, new Date().toISOString(), 'lastUpdatedIso');
}

export async function getScanCursor(db: IDBPDatabase): Promise<number | undefined> {
  return (await db.get(STORE_META, 'cursor')) as number | undefined;
}

export interface ScanCacheMeta {
  cursor: number | null;
  lastUpdatedIso: string | null;
}

/**
 * Read the cursor + last-updated timestamp for an account / rippled
 * URL combination. Used by the Settings panel's Cache section. Opens
 * (creating if missing) the per-account database; the database is
 * cheap to create and immediately closed afterwards.
 */
export async function getCacheMeta(
  account: string,
  rippledUrl?: string,
): Promise<ScanCacheMeta> {
  const db = await openScanCache(account, rippledUrl);
  try {
    const cursor = (await db.get(STORE_META, 'cursor')) as number | undefined;
    const lastUpdatedIso = (await db.get(STORE_META, 'lastUpdatedIso')) as
      | string
      | undefined;
    return {
      cursor: cursor ?? null,
      lastUpdatedIso: lastUpdatedIso ?? null,
    };
  } finally {
    db.close();
  }
}

/**
 * Delete the entire scan-cache database for the supplied account /
 * rippled URL combination. Used by the "Force Rescan" UI in Phase C.
 */
export async function purgeScanCache(account: string, rippledUrl?: string): Promise<void> {
  await deleteDB(dbNameFor(account, rippledUrl));
}

function dbNameFor(account: string, rippledUrl?: string): string {
  // The base prefix `sf-scan` is shared across the SPA.
  // Including the rippled host (when supplied) means the cache is
  // automatically partitioned per-node — see Task 6 in the plan.
  if (rippledUrl) {
    let host = rippledUrl;
    try {
      host = new URL(rippledUrl).host || rippledUrl;
    } catch {
      // Non-URL strings (e.g. test fixtures) fall through to the
      // raw value as the host fragment.
    }
    return `sf-scan:${account}:${host}`;
  }
  return `sf-scan:${account}`;
}
