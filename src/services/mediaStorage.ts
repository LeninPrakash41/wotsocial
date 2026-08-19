// IndexedDB & S3 Media Storage Service to bypass 5MB LocalStorage Quota Limits

const DB_NAME = 'WotSocialMediaDB_v2';
const DRAFTS_STORE = 'media_drafts';
const ASSETS_STORE = 'media_assets';

// Global In-Memory Cache for Instant Synchronous Access
let globalDraftCache: { url: string; type: string } | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
        db.createObjectStore(DRAFTS_STORE);
      }
      if (!db.objectStoreNames.contains(ASSETS_STORE)) {
        db.createObjectStore(ASSETS_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = (event: any) => resolve(event.target.result);
    request.onerror = (event: any) => reject(event.target.error);
  });
}

// 1. Draft Media Pre-loading (Bypasses Quota & Synchronous Handshake)
export const saveDraftMedia = async (url: string, type: string): Promise<void> => {
  globalDraftCache = { url, type };
  try {
    sessionStorage.setItem('wot_draft_url_preview', url.slice(0, 500));
    sessionStorage.setItem('wot_draft_type_preview', type);
  } catch (e) {}

  try {
    const db = await openDB();
    const tx = db.transaction(DRAFTS_STORE, 'readwrite');
    tx.objectStore(DRAFTS_STORE).put({ url, type, timestamp: Date.now() }, 'currentDraft');
  } catch (err) {
    console.warn("IndexedDB draft save fallback:", err);
  }
};

export const getDraftMedia = async (): Promise<{ url: string; type: string } | null> => {
  if (globalDraftCache) {
    const res = { ...globalDraftCache };
    globalDraftCache = null;
    return res;
  }

  try {
    const db = await openDB();
    const tx = db.transaction(DRAFTS_STORE, 'readonly');
    const store = tx.objectStore(DRAFTS_STORE);
    const request = store.get('currentDraft');

    return new Promise((resolve) => {
      request.onsuccess = () => {
        if (request.result && request.result.url) {
          const res = { url: request.result.url, type: request.result.type };
          try {
            const delTx = db.transaction(DRAFTS_STORE, 'readwrite');
            delTx.objectStore(DRAFTS_STORE).delete('currentDraft');
          } catch (e) {}
          resolve(res);
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

// 2. High-Capacity Media Asset Storage (Supports 500MB+ Base64/Videos)
export const saveMediaAssetToIDB = async (asset: any): Promise<void> => {
  try {
    const db = await openDB();
    const tx = db.transaction(ASSETS_STORE, 'readwrite');
    tx.objectStore(ASSETS_STORE).put(asset);
  } catch (err) {
    console.error("Failed to save media asset to IndexedDB:", err);
  }
};

export const loadMediaAssetsFromIDB = async (): Promise<any[]> => {
  try {
    const db = await openDB();
    const tx = db.transaction(ASSETS_STORE, 'readonly');
    const store = tx.objectStore(ASSETS_STORE);
    const request = store.getAll();

    return new Promise((resolve) => {
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => resolve([]);
    });
  } catch (e) {
    return [];
  }
};

export const deleteMediaAssetFromIDB = async (id: string): Promise<void> => {
  try {
    const db = await openDB();
    const tx = db.transaction(ASSETS_STORE, 'readwrite');
    tx.objectStore(ASSETS_STORE).delete(id);
  } catch (e) {}
};
