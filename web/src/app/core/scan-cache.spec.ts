import 'fake-indexeddb/auto';

import type { IDBPDatabase } from 'idb';

import {
  getCacheMeta,
  getChannelEntry,
  getOtsEntry,
  getScanCursor,
  openScanCache,
  purgeScanCache,
  putChannelEntry,
  putOtsEntry,
  setScanCursor,
} from './scan-cache';

describe('scan-cache (IndexedDB v1)', () => {
  // Track every DB opened by a spec so afterEach can close them
  // before the next test purges. IndexedDB blocks `deleteDatabase`
  // while any open connection is still live; tests that leak a
  // connection will hang the next purge.
  const opened: IDBPDatabase[] = [];

  async function open(account: string, rippled?: string): Promise<IDBPDatabase> {
    const db = await openScanCache(account, rippled);
    opened.push(db);
    return db;
  }

  afterEach(async () => {
    while (opened.length > 0) {
      const db = opened.pop()!;
      try {
        db.close();
      } catch {
        /* swallow — already closed */
      }
    }
    await purgeScanCache('rTEST');
    await purgeScanCache('rA');
    await purgeScanCache('rB');
    await purgeScanCache('rTEST', 'https://node-a.example');
    await purgeScanCache('rTEST', 'https://node-b.example');
  });

  it('round-trips a channel entry by sha256', async () => {
    const db = await open('rTEST');
    await putChannelEntry(db, 'a'.repeat(64), {
      txHash: 'TX1',
      ledgerIndex: 100,
      bundleHashHex: 'b'.repeat(64),
    });
    const got = await getChannelEntry(db, 'a'.repeat(64));
    expect(got?.txHash).toBe('TX1');
    expect(got?.bundleHashHex).toBe('b'.repeat(64));
  });

  it('round-trips an OTS entry by bundleHash', async () => {
    const db = await open('rTEST');
    await putOtsEntry(db, 'b'.repeat(64), { txHash: 'TX2', ledgerIndex: 200 });
    expect((await getOtsEntry(db, 'b'.repeat(64)))?.txHash).toBe('TX2');
  });

  it('persists scan cursor for resume', async () => {
    const db = await open('rTEST');
    await setScanCursor(db, 12345);
    expect(await getScanCursor(db)).toBe(12345);
  });

  it('scopes cache per account (different account, separate db)', async () => {
    const a = await open('rA');
    const b = await open('rB');
    await putChannelEntry(a, 'c'.repeat(64), {
      txHash: 'A1',
      ledgerIndex: 1,
      bundleHashHex: 'd'.repeat(64),
    });
    expect(await getChannelEntry(b, 'c'.repeat(64))).toBeUndefined();
  });

  it('purgeScanCache wipes everything for an account', async () => {
    const db = await open('rTEST');
    await setScanCursor(db, 999);
    db.close();
    await purgeScanCache('rTEST');
    const db2 = await open('rTEST');
    expect(await getScanCursor(db2)).toBeUndefined();
  });

  it('getCacheMeta returns nulls for an unseen account', async () => {
    const meta = await getCacheMeta('rTEST');
    expect(meta.cursor).toBeNull();
    expect(meta.lastUpdatedIso).toBeNull();
  });

  it('getCacheMeta returns the cursor + lastUpdatedIso after a setScanCursor', async () => {
    const db = await open('rTEST');
    await setScanCursor(db, 7654);
    db.close();
    // Pop it from the opened tracker since we already closed it.
    opened.pop();
    const meta = await getCacheMeta('rTEST');
    expect(meta.cursor).toBe(7654);
    expect(typeof meta.lastUpdatedIso).toBe('string');
    expect(meta.lastUpdatedIso!.length).toBeGreaterThan(0);
  });

  it('partitions the cache per rippled URL', async () => {
    const a = await open('rTEST', 'https://node-a.example');
    const b = await open('rTEST', 'https://node-b.example');
    await putChannelEntry(a, 'e'.repeat(64), {
      txHash: 'A1',
      ledgerIndex: 1,
      bundleHashHex: 'f'.repeat(64),
    });
    expect(await getChannelEntry(b, 'e'.repeat(64))).toBeUndefined();
  });
});
