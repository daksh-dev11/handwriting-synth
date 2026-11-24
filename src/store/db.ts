export const DB_NAME = 'handwriting-synth';
export const DB_VERSION = 1;
const OPEN_DB_TIMEOUT_MS = 3_000;

export type StoreName = 'raw' | 'pack' | 'meta';

export interface Db {
  idb: IDBDatabase | null;
  mem: Record<StoreName, Map<string, unknown>>;
  onClose: (() => void) | null;
}

function createMemoryDb(): Db {
  return { idb: null, mem: { raw: new Map(), pack: new Map(), meta: new Map() }, onClose: null };
}

function attachConnection(db: Db, idb: IDBDatabase): void {
  idb.onversionchange = () => idb.close();
  idb.onclose = () => {
    if (db.idb !== idb) return;
    db.idb = null;
    db.onClose?.();
  };
}

export async function openDb(): Promise<Db> {
  if (typeof indexedDB === 'undefined') return createMemoryDb();

  return new Promise<Db>((resolve) => {
    let settled = false;
    let request: IDBOpenDBRequest;
    const fallback = createMemoryDb();
    const finish = (db: Db): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(db);
    };
    const timeout = setTimeout(() => finish(fallback), OPEN_DB_TIMEOUT_MS);

    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const idb = request.result;
        if (!idb.objectStoreNames.contains('raw')) idb.createObjectStore('raw');
        if (!idb.objectStoreNames.contains('pack')) idb.createObjectStore('pack');
        if (!idb.objectStoreNames.contains('meta')) idb.createObjectStore('meta');
      };
      request.onblocked = () => finish(fallback);
      request.onerror = () => finish(fallback);
      request.onsuccess = () => {
        if (settled) {
          request.result.close();
          return;
        }
        const db: Db = {
          idb: request.result,
          mem: fallback.mem,
          onClose: null,
        };
        attachConnection(db, request.result);
        finish(db);
      };
    } catch {
      finish(fallback);
    }
  });
}

function errorName(error: unknown): string | undefined {
  return error instanceof Error ? error.name : undefined;
}

async function reopenOnce<T>(db: Db, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const name = errorName(error);
    if (name !== 'InvalidStateError' && name !== 'UnknownError') throw error;

    const reopened = await openDb();
    db.idb = reopened.idb;
    if (db.idb) attachConnection(db, db.idb);
    return operation();
  }
}

export function tx(
  db: Db,
  stores: StoreName[],
  mode: IDBTransactionMode,
  fn: (st: Record<StoreName, IDBObjectStore>) => void,
): Promise<void> {
  const idb = db.idb;
  if (!idb) return Promise.reject(new Error('NO_IDB'));

  return new Promise<void>((resolve, reject) => {
    let transaction: IDBTransaction | undefined;
    try {
      transaction = idb.transaction(stores, mode);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction?.error ?? new Error('TRANSACTION_ERROR'));
      transaction.onabort = () => reject(transaction?.error ?? new Error('ABORT'));
      const handles = Object.fromEntries(
        stores.map((store) => [store, transaction!.objectStore(store)]),
      ) as Record<StoreName, IDBObjectStore>;
      fn(handles);
    } catch (error) {
      if (transaction) {
        try {
          transaction.abort();
        } catch (abortError) {
          reject(new AggregateError([error, abortError], 'transaction callback and abort failed'));
          return;
        }
      }
      reject(error);
    }
  });
}

export async function get<T>(db: Db, store: StoreName, key: string): Promise<T | undefined> {
  return reopenOnce(db, async () => {
    if (!db.idb) return db.mem[store].get(key) as T | undefined;
    const idb = db.idb;
    return new Promise<T | undefined>((resolve, reject) => {
      try {
        const transaction = idb.transaction(store, 'readonly');
        const request = transaction.objectStore(store).get(key);
        request.onsuccess = () => resolve(request.result as T | undefined);
        request.onerror = () => reject(request.error ?? new Error('REQUEST_ERROR'));
        transaction.onerror = () => reject(transaction.error ?? new Error('TRANSACTION_ERROR'));
        transaction.onabort = () => reject(transaction.error ?? new Error('ABORT'));
      } catch (error) {
        reject(error);
      }
    });
  });
}

export async function put(db: Db, store: StoreName, key: string, value: unknown): Promise<void> {
  await reopenOnce(db, async () => {
    if (!db.idb) {
      db.mem[store].set(key, value);
      return;
    }
    await tx(db, [store], 'readwrite', (handles) => {
      handles[store].put(value, key);
    });
  });
}

export async function getAll<T>(db: Db, store: StoreName): Promise<Array<[string, T]>> {
  return reopenOnce(db, async () => {
    if (!db.idb) {
      return [...db.mem[store].entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) as Array<[string, T]>;
    }

    const entries: Array<[string, T]> = [];
    await tx(db, [store], 'readonly', (handles) => {
      const request = handles[store].openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (typeof cursor.key === 'string') entries.push([cursor.key, cursor.value as T]);
        cursor.continue();
      };
    });
    return entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  });
}

export async function clear(db: Db, store: StoreName): Promise<void> {
  await reopenOnce(db, async () => {
    if (!db.idb) {
      db.mem[store].clear();
      return;
    }
    await tx(db, [store], 'readwrite', (handles) => {
      handles[store].clear();
    });
  });
}
