/* =========================================================
   OrderSamples — "Mẫu đơn KH" để AI NHỚ NÉT CHỮ của từng khách
   ─────────────────────────────────────────────────────────
   Ý tưởng: Gemini/Claude là API KHÔNG nhớ giữa các lần gọi. Muốn AI "học"
   nét chữ 1 KH → mỗi lần đọc ảnh đơn của KH đó, ta đính kèm 1-2 MẪU CŨ
   (ảnh KH từng viết + KẾT QUẢ ĐÚNG đã được NV xác nhận) làm ví dụ few-shot.
   AI nhìn ví dụ → suy ra cách viết/viết tắt của KH → đọc ảnh mới chính xác hơn.

   LƯU TRỮ: IndexedDB THEO MÁY (ảnh base64 nặng → KHÔNG sync cloud, tránh phình —
   đúng bài học pod_photos/snapshots). Phần "chữ" (alias word→SP) vẫn ở CustPrefs
   (cust_prefs) và sync bình thường.

   API (async):
   - OrderSamples.ready()                         → Promise (DB sẵn sàng)
   - OrderSamples.add({custId,custName,b64,mime,rawItems,finalItems}) → Promise<id>
   - OrderSamples.forCust(custId, limit=2)        → Promise<[sample]> (mới nhất)
   - OrderSamples.listCust(custId)                → Promise<[sample]> (tất cả)
   - OrderSamples.all()                           → Promise<[sample]>
   - OrderSamples.countByCust()                   → Promise<{custId:count}>
   - OrderSamples.delete(id)                       → Promise
   - OrderSamples.clearCust(custId)               → Promise
   - OrderSamples.downscale(dataURL, maxW, q)     → Promise<{dataURL,b64,mime}>
   ========================================================= */
(function () {
  const DB_NAME = 'nstt_samples';
  const STORE = 'samples';
  const MAX_PER_CUST = 8;       /* giữ tối đa 8 mẫu/KH (xoá cũ nhất) */

  let _db = null, _readyP = null;

  function open() {
    if (_readyP) return _readyP;
    _readyP = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB không hỗ trợ')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('custId', 'custId', { unique: false });
          os.createIndex('ts', 'ts', { unique: false });
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
    return _readyP;
  }

  function tx(mode) { return _db.transaction(STORE, mode).objectStore(STORE); }
  function reqP(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

  async function allRaw() {
    await open();
    return reqP(tx('readonly').getAll());
  }

  /* Nén ảnh trước khi lưu/gửi AI: max chiều rộng + JPEG quality → nhẹ mà vẫn đọc được chữ */
  function downscale(dataURL, maxW, q) {
    maxW = maxW || 1100; q = q || 0.72;
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => {
          let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const out = cv.toDataURL('image/jpeg', q);
          const m = out.match(/^data:([^;]+);base64,(.*)$/);
          resolve(m ? { dataURL: out, mime: m[1], b64: m[2] } : { dataURL, mime: 'image/jpeg', b64: (dataURL.split(',')[1] || '') });
        };
        img.onerror = () => { const m = String(dataURL).match(/^data:([^;]+);base64,(.*)$/); resolve(m ? { dataURL, mime: m[1], b64: m[2] } : { dataURL, mime: 'image/jpeg', b64: '' }); };
        img.src = dataURL;
      } catch (e) {
        const m = String(dataURL).match(/^data:([^;]+);base64,(.*)$/);
        resolve(m ? { dataURL, mime: m[1], b64: m[2] } : { dataURL, mime: 'image/jpeg', b64: '' });
      }
    });
  }

  function newId() {
    /* Date.now không khả dụng trong vài môi trường harness — dùng performance + counter */
    const t = (typeof performance !== 'undefined' && performance.now) ? Math.floor(performance.now() * 1000) : 0;
    return 'smp_' + t.toString(36) + '_' + Math.floor((1 + Math.random()) * 1e6).toString(36);
  }

  const OrderSamples = {
    ready: open,

    async add(rec) {
      await open();
      const id = newId();
      const now = new Date();
      const full = {
        id,
        custId: rec.custId || '',
        custName: rec.custName || '',
        date: now.toLocaleDateString('vi-VN'),
        ts: now.toISOString(),
        mime: rec.mime || 'image/jpeg',
        b64: rec.b64 || '',
        rawItems: rec.rawItems || [],
        finalItems: rec.finalItems || [],
        note: rec.note || '',
      };
      await reqP(tx('readwrite').put(full));
      /* Cap MAX_PER_CUST — xoá mẫu cũ nhất của KH này */
      try {
        const mine = (await this.listCust(full.custId));
        if (mine.length > MAX_PER_CUST) {
          const drop = mine.slice(MAX_PER_CUST); /* listCust trả mới→cũ; phần dư là cũ nhất */
          for (const s of drop) await reqP(tx('readwrite').delete(s.id));
        }
      } catch (e) {}
      return id;
    },

    async listCust(custId) {
      const all = await allRaw();
      return all.filter(s => s.custId === custId).sort((a, b) => (a.ts < b.ts ? 1 : -1)); /* mới → cũ */
    },

    async forCust(custId, limit) {
      const mine = await this.listCust(custId);
      return mine.slice(0, limit || 2);
    },

    async all() {
      const all = await allRaw();
      return all.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    },

    async countByCust() {
      const all = await allRaw();
      const m = {};
      all.forEach(s => { m[s.custId] = (m[s.custId] || 0) + 1; });
      return m;
    },

    async delete(id) { await open(); return reqP(tx('readwrite').delete(id)); },

    async clearCust(custId) {
      const mine = await this.listCust(custId);
      for (const s of mine) await reqP(tx('readwrite').delete(s.id));
    },

    downscale,
  };

  window.OrderSamples = OrderSamples;
})();
