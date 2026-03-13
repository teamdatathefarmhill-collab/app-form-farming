const DB_NAME = 'farmhill-offline';
const DB_VERSION = 1;
const STORE = 'submitQueue';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE, {
        keyPath: 'id',
        autoIncrement: true,
      });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function enqueue(payload) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add({ ...payload, queuedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function flushQueue(gasUrl) {
  const items = await getAll();
  if (items.length === 0) return { flushed: 0, failed: 0 };

  let flushed = 0;
  let failed = 0;

  for (const item of items) {
    const { id, queuedAt, ...payload } = item;
    try {
      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        await deleteById(id);
        flushed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { flushed, failed };
}