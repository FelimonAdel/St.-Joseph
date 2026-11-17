/**
 * db.js — قاعدة البيانات المحلية (IndexedDB) للعمل Offline والمزامنة التلقائية
 */
const DB_NAME = "StJosephFamilyDB";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("state")) {
        db.createObjectStore("state", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("syncQueue")) {
        db.createObjectStore("syncQueue", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("photos")) {
        db.createObjectStore("photos", { keyPath: "name" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

window.LocalDB = {
  async getState(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("state", "readonly");
      const req = tx.objectStore("state").get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  },

  async setState(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("state", "readwrite");
      tx.objectStore("state").put({ key, value, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async enqueue(action) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("syncQueue", "readwrite");
      tx.objectStore("syncQueue").add({ ...action, createdAt: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getQueue() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("syncQueue", "readonly");
      const req = tx.objectStore("syncQueue").getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async removeQueueItem(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("syncQueue", "readwrite");
      tx.objectStore("syncQueue").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async savePhoto(boyName, dataUrl) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("photos", "readwrite");
      tx.objectStore("photos").put({ name: boyName, dataUrl });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async getAllPhotos() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("photos", "readonly");
      const req = tx.objectStore("photos").getAll();
      req.onsuccess = () => {
        const map = {};
        (req.result || []).forEach((p) => { map[p.name] = p.dataUrl; });
        resolve(map);
      };
      req.onerror = () => reject(req.error);
    });
  }
};
