export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("inspectionDB", 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("photos")) {
        db.createObjectStore("photos", { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function savePhoto(id: number, blob: Blob) {
  const db = await openDB();

  const tx = db.transaction("photos", "readwrite");
  const store = tx.objectStore("photos");

  store.put({
    id,
    blob,
  });
}

export async function getPhoto(id: number): Promise<string | null> {
  const db = await openDB();

  const tx = db.transaction("photos", "readonly");
  const store = tx.objectStore("photos");

  const request = store.get(id);

  return new Promise((resolve) => {
    request.onsuccess = () => {
      const result = request.result;

      if (!result) {
        resolve(null);
        return;
      }

      const url = URL.createObjectURL(result.blob);
      resolve(url);
    };

    request.onerror = () => resolve(null);
  });
}
