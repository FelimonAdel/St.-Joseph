/**
 * api.js — طبقة الاتصال والمزامنة بين التطبيق المحلي وGoogle Sheets Web App
 */
window.AppAPI = {
  getApiUrl() {
    return localStorage.getItem("st_joseph_api_url") || window.APP_CONFIG.apiUrl || "";
  },

  setApiUrl(url) {
    localStorage.setItem("st_joseph_api_url", (url || "").trim());
  },

  async loadInitialData() {
    const cached = await window.LocalDB.getState("appData");
    const photos = await window.LocalDB.getAllPhotos();
    let data = cached || structuredClone(window.SEED_DATA);

    // دمج الصور المحفوظة محلياً
    data.boys = (data.boys || []).map((b) => ({
      ...b,
      photoUrl: photos[b.name] || b.photoUrl || ""
    }));

    // إذا كان هناك رابط API ومتصل بالإنترنت، نجلب أحدث نسخة من الشيت
    const url = this.getApiUrl();
    if (url && navigator.onLine) {
      try {
        const res = await fetch(`${url}?action=snapshot`, { method: "GET" });
        if (res.ok) {
          const remote = await res.json();
          if (remote && Array.isArray(remote.boys) && remote.boys.length > 0) {
            remote.boys = remote.boys.map((b) => ({
              ...b,
              photoUrl: photos[b.name] || b.photoUrl || ""
            }));
            await window.LocalDB.setState("appData", remote);
            return { data: remote, source: "live" };
          }
        }
      } catch (err) {
        console.warn("Live fetch failed, using cached/seed data:", err);
      }
    }

    if (!cached) {
      await window.LocalDB.setState("appData", data);
    }
    return { data, source: cached ? "cache" : "seed" };
  },

  async queueOrSend(action) {
    const url = this.getApiUrl();
    if (!url || !navigator.onLine) {
      await window.LocalDB.enqueue(action);
      return { synced: false, queued: true };
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(action)
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return { synced: true, queued: false };
    } catch (err) {
      await window.LocalDB.enqueue(action);
      return { synced: false, queued: true };
    }
  },

  async syncQueue() {
    const url = this.getApiUrl();
    if (!url || !navigator.onLine) return { processed: 0, remaining: (await window.LocalDB.getQueue()).length };

    const queue = await window.LocalDB.getQueue();
    let processed = 0;
    for (const item of queue) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(item)
        });
        if (res.ok) {
          await window.LocalDB.removeQueueItem(item.id);
          processed++;
        } else {
          break;
        }
      } catch (err) {
        break;
      }
    }
    const remaining = (await window.LocalDB.getQueue()).length;
    return { processed, remaining };
  }
};
