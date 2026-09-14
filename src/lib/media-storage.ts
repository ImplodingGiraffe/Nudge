import { useEffect, useState } from 'react';
import { nanoid } from 'platejs';

const DB_NAME = 'nudge_media_db';
const DB_VERSION = 1;
const STORE_NAME = 'media_files';

export interface LocalMediaRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

const blobUrlCache = new Map<string, string>();
const pendingFetches = new Map<string, Promise<string | null>>();

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open media database'));
  });
}

export async function saveMediaFile(
  file: File | Blob,
  customName?: string
): Promise<{ id: string; url: string; blobUrl: string }> {
  const id = `med_${nanoid()}`;
  const name = customName || (file instanceof File ? file.name : 'media');
  const type = file.type || 'application/octet-stream';
  const size = file.size;

  const record: LocalMediaRecord = {
    id,
    name,
    type,
    size,
    blob: file,
    createdAt: Date.now(),
  };

  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('Failed to put media file into IndexedDB'));
  });

  const blobUrl = URL.createObjectURL(file);
  blobUrlCache.set(id, blobUrl);

  return {
    id,
    url: `nudge-media://${id}`,
    blobUrl,
  };
}

export async function getMediaBlob(id: string): Promise<Blob | null> {
  try {
    const record = await getMediaRecord(id);
    if (!record || !record.blob) return null;

    if (record.type && (!record.blob.type || record.blob.type !== record.type)) {
      return new Blob([record.blob], { type: record.type });
    }
    return record.blob;
  } catch (err) {
    console.warn('Failed to retrieve media blob from IndexedDB:', err);
    return null;
  }
}

export async function getMediaRecord(id: string): Promise<LocalMediaRecord | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const record = req.result as LocalMediaRecord | undefined;
        resolve(record ?? null);
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('Failed to retrieve media record from IndexedDB:', err);
    return null;
  }
}

export function resolveMediaUrlSync(url?: string): string | null {
  if (!url) return null;
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  ) {
    return url;
  }

  if (url.startsWith('nudge-media://')) {
    const id = url.slice('nudge-media://'.length);
    return blobUrlCache.get(id) ?? null;
  }

  return url;
}

export async function resolveMediaUrlAsync(url?: string): Promise<string | null> {
  if (!url) return null;

  const sync = resolveMediaUrlSync(url);
  if (sync) return sync;

  if (url.startsWith('nudge-media://')) {
    const id = url.slice('nudge-media://'.length);

    if (pendingFetches.has(id)) {
      return pendingFetches.get(id)!;
    }

    const fetchPromise = (async () => {
      try {
        const blob = await getMediaBlob(id);
        if (blob) {
          const blobUrl = URL.createObjectURL(blob);
          blobUrlCache.set(id, blobUrl);
          return blobUrl;
        }
      } catch (err) {
        console.warn(`Could not resolve media ${id}:`, err);
      } finally {
        pendingFetches.delete(id);
      }
      return null;
    })();

    pendingFetches.set(id, fetchPromise);
    return fetchPromise;
  }

  return url;
}

export async function prewarmMediaFromText(text: string): Promise<void> {
  if (!text || !text.includes('nudge-media://')) return;

  const regex = /nudge-media:\/\/([a-zA-Z0-9_-]+)/g;
  let match: RegExpExecArray | null;
  const promises: Promise<string | null>[] = [];

  while ((match = regex.exec(text)) !== null) {
    const id = match[1];
    if (!blobUrlCache.has(id)) {
      promises.push(resolveMediaUrlAsync(`nudge-media://${id}`));
    }
  }

  if (promises.length > 0) {
    await Promise.allSettled(promises);
  }
}

export function useResolvedMediaUrl(url?: string): string | undefined {
  const [resolved, setResolved] = useState<string | undefined>(() => {
    return resolveMediaUrlSync(url) ?? undefined;
  });

  useEffect(() => {
    let cancelled = false;

    if (!url) {
      setResolved(undefined);
      return;
    }

    const sync = resolveMediaUrlSync(url);
    if (sync) {
      setResolved(sync);
      return;
    }

    if (url.startsWith('nudge-media://')) {
      resolveMediaUrlAsync(url).then((res) => {
        if (!cancelled && res) {
          setResolved(res);
        }
      });
    } else {
      setResolved(url);
    }

    return () => {
      cancelled = true;
    };
  }, [url]);

  return resolved;
}
