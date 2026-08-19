// IndexedDB & S3 Media Storage Service to bypass 5MB LocalStorage Quota Limits

const DB_NAME = 'WotSocialMediaDB_v1';
const STORE_NAME = 'media_drafts';

// Global In-Memory Fallback Cache
const memoryCache: Record<string, string> = {};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (event: any) => resolve(event.target.result);
    request.onerror = (event: any) => reject(event.target.error);
  });
}

export const saveDraftMedia = async (url: string, type: string): Promise<void> => {
  // 1. Always set memory cache first for immediate synchronous access
  memoryCache['draftMediaUrl'] = url;
  memoryCache['draftMediaType'] = type;

  // 2. Try SessionStorage if small enough
  try {
    sessionStorage.setItem('draftMediaUrl', url.slice(0, 1000)); // Truncate if base64 to avoid quota error
    sessionStorage.setItem('draftMediaType', type);
  } catch (e) {
    console.warn("SessionStorage quota limit reached:", e);
  }

  // 3. Store full URL in IndexedDB (supports 500MB+)
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ url, type, timestamp: Date.now() }, 'currentDraft');
  } catch (err) {
    console.warn("IndexedDB storage fallback to memory cache:", err);
  }
};

export const getDraftMedia = async (): Promise<{ url: string; type: string } | null> => {
  // 1. Check memory cache first
  if (memoryCache['draftMediaUrl']) {
    const url = memoryCache['draftMediaUrl'];
    const type = memoryCache['draftMediaType'] || 'image';
    delete memoryCache['draftMediaUrl'];
    delete memoryCache['draftMediaType'];
    return { url, type };
  }

  // 2. Check IndexedDB
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get('currentDraft');

    return new Promise((resolve) => {
      request.onsuccess = () => {
        if (request.result && request.result.url) {
          // Clear after reading
          try {
            const delTx = db.transaction(STORE_NAME, 'readwrite');
            delTx.objectStore(STORE_NAME).delete('currentDraft');
          } catch (e) {}
          resolve({ url: request.result.url, type: request.result.type });
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
};
