/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Data Store
   Auto-sync: localStorage (instant) + Supabase (cloud, async)

   Sync strategy: Offline-first
   - get(key)        → return cache instantly, kick off async refresh from Supabase
   - add/update/remove → write to cache + localStorage, push to Supabase async
   - Realtime        → khi Supabase data đổi từ user khác, pull về local
   ========================================================= */
(function () {
  const PREFIX = 'vty_';

  /* === Seed version === : khi đổi dữ liệu mẫu (data/*.js) thì tăng version này.
     App sẽ tự xoá các key dữ liệu cũ trong localStorage để nạp lại bản mới
     (giữ nguyên đăng nhập + cấu hình tích hợp). Tránh tình trạng "kẹt data cũ". */
  const SEED_VERSION = 'nstt-2026-06-07-real-roster-v4';
  try {
    if (localStorage.getItem(PREFIX + 'seedVersion') !== SEED_VERSION) {
      /* Migration: chuyển dữ liệu 'drivers' cũ → 'shippers' nếu user đã có */
      try {
        const oldDrivers = localStorage.getItem(PREFIX + 'drivers');
        const hasShippers = localStorage.getItem(PREFIX + 'shippers');
        if (oldDrivers && !hasShippers) {
          localStorage.setItem(PREFIX + 'shippers', oldDrivers);
          console.log('[STORE] Migrated drivers → shippers');
        }
      } catch (e) {}

      [
        /* Core bảng */
        'customers', 'orders', 'drivers', 'vehicles', 'partners', 'products',
        'shippers', 'adspend', 'staff', 'paymentAccounts', 'cashEntries', 'invoices', 'activityLogs',
        /* Bảng mới đợt 2-3 */
        'inventory', 'suppliers', 'purchases', 'returns',
        'recurring_orders', 'quotes', 'leads',
        /* Bảng động đợt 4-5-7 */
        'cust_prefs', 'audit_log', 'snapshots', 'budget_2026',
        'pod_photos', 'inv_movements', 'marketing_tpls', 'loyalty_rules',
      ].forEach(k => {
        /* Giữ shippers nếu vừa migrate từ drivers */
        if (k === 'shippers') return;
        /* GIỮ products: data thật (SP đã import) synced từ cloud — tránh nhấp nháy.
           XOÁ staff: ép mọi máy bỏ cache NV demo cũ → kéo lại roster thật 13 NV từ cloud
           (đồng thời xoá baseline id-set staff để merge sạch). */
        if (k === 'products') return;
        localStorage.removeItem(PREFIX + k);
        localStorage.removeItem(PREFIX + '__sids__' + k);
      });
      /* Xoá luôn drivers cũ sau khi migrate */
      localStorage.removeItem(PREFIX + 'drivers');
      /* Xoá master data + chat history per user */
      Object.keys(localStorage).filter(k =>
        k.startsWith(PREFIX + 'md_') ||
        k.startsWith(PREFIX + 'aic_') ||
        k.startsWith(PREFIX + 'hb_')
      ).forEach(k => localStorage.removeItem(k));
      localStorage.setItem(PREFIX + 'seedVersion', SEED_VERSION);
      console.log('[STORE] Seed version mới → đã nạp lại bảng + reset chat/audit history');
    }
  } catch (e) {}

  const _data = {};
  const _subs = {};
  const _preloaded = new Set();
  /* Snapshot (JSON) bản đã đồng bộ cloud gần nhất, per table key.
     set() diff value vs snapshot này (KHÔNG vs cache live) → bắt được cả
     trường hợp caller mutate mảng TẠI CHỖ rồi set cùng reference. */
  const _synced = {};

  /* === Baseline ID-set (BỀN qua reload) — để phân biệt record bị XOÁ ở máy khác
     với record mới tạo offline. Chỉ lưu danh sách id (nhẹ), per table key.
     - record có ở local, KHÔNG có trên cloud, NHƯNG có trong baseline cũ → đã bị xoá → BỎ
     - record có ở local, KHÔNG có trên cloud, KHÔNG có trong baseline → mới offline → ĐẨY LÊN */
  function _idOf(key, it) {
    const idCol = (typeof ID_COLUMN !== 'undefined' && ID_COLUMN[key]) || 'id';
    return it && (it[idCol] || it.id || it.code || it.no);
  }
  function _persistSyncedIds(key, arr) {
    try {
      const ids = (arr || []).map(x => _idOf(key, x)).filter(v => v != null);
      localStorage.setItem(PREFIX + '__sids__' + key, JSON.stringify(ids));
    } catch (e) {}
  }
  function _loadSyncedIds(key) {
    /* Ưu tiên snapshot trong RAM (_synced) nếu có; fallback id-set đã lưu localStorage */
    try {
      if (_synced[key] != null) {
        const a = JSON.parse(_synced[key]);
        if (Array.isArray(a)) return new Set(a.map(x => _idOf(key, x)).filter(v => v != null));
      }
    } catch (e) {}
    try {
      const v = localStorage.getItem(PREFIX + '__sids__' + key);
      if (v != null) return new Set(JSON.parse(v));
    } catch (e) {}
    return null;
  }

  /* Mapping STORE key → Supabase table name (NSTT 17 bảng — 11 core + 6 extra) */
  const TABLE_MAP = {
    customers:        'customers',
    products:         'products',
    orders:           'orders',
    invoices:         'invoices',
    suppliers:        'suppliers',
    shippers:         'shippers',
    leads:            'leads',
    staff:            'staff',
    paymentAccounts:  'payment_accounts',
    cashEntries:      'cash_entries',
    /* activityLogs (nhật ký đăng nhập) GIỮ LOCAL — bảng cloud activity_logs schema
       lệch (id bigint vs 'L...', thiếu cột at_time) gây lỗi insert. Audit chính dùng
       window.audit → kv_store('audit_log') (JSONB, sync OK). */
    /* Extra (đợt 2) */
    inventory:        'inventory',
    purchases:        'purchases',
    quotes:           'quotes',
    recurring_orders: 'recurring_orders',
    returns:          'returns',
    adspend:          'adspend',
  };

  /* ID column khác `id` cho 1 số bảng */
  const ID_COLUMN = {
    orders:       'code',
    cashEntries:  'no',
    invoices:     'no',
    staff:        'id',   /* bảng staff chỉ có cột id (KHÔNG có 'code') → update/remove theo id */
  };

  /* === Generic kv_store keys — sync qua bảng kv_store(key, value JSONB) ===
     Các bảng này schema phức tạp (JSONB nested), ít query SQL → dùng generic.
     QUAN TRỌNG: NV mất chấm công + bảng lương khi đổi máy nếu KHÔNG sync. */
  const KV_KEYS = new Set([
    'timesheet',       /* Chấm công NV — CRITICAL */
    'timesheetMeta',   /* Giờ vào muộn, lý do — CRITICAL */
    'payrollExtra',    /* Bảng lương chi tiết — CRITICAL */
    'latePolicy',      /* Khung phạt đi muộn — CRITICAL (admin cấu hình) */
    'staffAuth',       /* Mật khẩu cá nhân NV (HASH SHA-256, KHÔNG lưu thô) — CRITICAL */
    'mktPrices',       /* Bảng giá Marketing (chào hàng/ads) — KHÔNG ảnh hưởng đơn */
    'priceTiers',      /* Nhóm bảng giá theo nhóm KH (±% + override) — gửi báo giá riêng */
    'procurementRuns', /* Phiên gom hàng → đặt NCC (Kho) — CRITICAL */
    'supplierClaims',  /* Khoản đòi lại NCC khi hàng NCC giao hỏng (Trả hàng) */
    'supplierMeta',    /* Loại NCC (sỉ/lẻ/cả hai) — cloud suppliers không có cột này */
    'custPriceTiers',  /* Nhóm giá gán cho từng KH {custId:tierId} — cloud customers không có cột price_tier */
    'custCreditDays',  /* Hạn công nợ (số ngày) theo từng KH {custId:days} — chính sách 3/7/15 */
    'debtLedger',      /* Sổ công nợ theo ngày {custId,date,type,amount,ref} — phát sinh/trả nợ từng dòng */
    'autoRecurring',   /* Cấu hình tự tạo đơn định kỳ {enabled,time} — cron GitHub Actions đọc qua master_data */
    'audit_log',       /* Truy vết NV — HIGH */
    'inv_movements',   /* Sổ xuất nhập kho — HIGH */
    /* 'snapshots' KHÔNG sync cloud: mỗi bản backup copy TOÀN BỘ data (gồm 268 SP) →
       payload JSONB quá lớn → setKv timeout 500 + phình. Backup vốn nên theo MÁY (local). */
    'budget_2026',     /* Kế hoạch năm — HIGH */
    'loyalty_rules',   /* Rules tích điểm — MED */
    'marketing_tpls',  /* Template marketing — MED */
    'cust_prefs',      /* Thói quen mua KH — MED */
    'pod_photos',      /* Ảnh giao hàng — MED (base64 lớn) */
    'telegramChannels', /* Cấu hình routing (legacy, deprecated) */
    /* usage_stats: KHÔNG sync — tracker theo per-machine (deviceId) */
  ]);

  function isSupabaseMode() {
    return window.SUPABASE_CONFIG?.mode === 'supabase' && !!window.SB_DATA;
  }

  function _load(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw) return JSON.parse(raw);
    } catch (e) { console.warn('[STORE _load]', e); }
    return fallback != null ? JSON.parse(JSON.stringify(fallback)) : [];
  }

  function _save(key) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(_data[key])); }
    catch (e) { console.warn('[STORE _save]', e); }
    (_subs[key] || []).forEach(fn => {
      try { fn(_data[key]); } catch (e) { console.warn('[STORE subscriber]', e); }
    });
  }

  /* Đã tải XONG (hoàn tất, không chỉ "đã bắt đầu") dữ liệu cloud cho key — dùng gate
     cho các hook side-effect (trừ kho/cộng nợ) để KHÔNG chạy trên cache rỗng/cũ. */
  const _preloadDone = new Set();

  /* Async load from Supabase, replace cache nếu DB có data */
  async function _preloadFromSupabase(key) {
    if (!isSupabaseMode()) return;
    _preloaded.add(key);
    try {
      /* Special-case: companyInfo & master_data (md_*) — không qua TABLE_MAP */
      if (key === 'companyInfo') {
        const info = await window.SB_DATA.getCompanyInfo();
        if (info) {
          /* Convert snake_case từ DB → camelCase JS */
          const mapped = {
            name: info.name, shortName: info.short_name, tax: info.tax,
            address: info.address, director: info.director, hotline: info.hotline,
            email: info.email, website: info.website, bank: info.bank,
            bankOwner: info.bank_owner, logo: info.logo_url, slogan: info.slogan,
          };
          _data[key] = mapped;
          try { localStorage.setItem(PREFIX + key, JSON.stringify(mapped)); } catch (e) {}
          (_subs[key] || []).forEach(fn => fn(mapped));
          console.log('[STORE] Synced companyInfo từ Supabase');
        }
        return;
      }
      if (key.startsWith('md_')) {
        const items = await window.SB_DATA.getMasterData(key.slice(3));
        if (Array.isArray(items) && items.length > 0) {
          _data[key] = items;
          try { localStorage.setItem(PREFIX + key, JSON.stringify(items)); } catch (e) {}
          (_subs[key] || []).forEach(fn => fn(items));
          console.log(`[STORE] Synced ${key}: ${items.length} items`);
        }
        return;
      }
      /* === KV store (timesheet, payrollExtra, audit_log...) ===
         Bảng kv_store(key, value JSONB) — generic key-value sync.
         9 keys CRITICAL: NV mất chấm công + bảng lương nếu KHÔNG sync. */
      if (KV_KEYS.has(key) && window.SB_DATA?.getKv) {
        const v = await window.SB_DATA.getKv(key);
        if (v != null && (!Array.isArray(v) || v.length > 0)) {
          /* Cloud có data → dùng, ghi đè local */
          _data[key] = v;
          try { localStorage.setItem(PREFIX + key, JSON.stringify(v)); } catch (e) {}
          (_subs[key] || []).forEach(fn => fn(v));
          console.log(`[STORE] Synced ${key} ← kv_store (${Array.isArray(v) ? v.length + ' items' : 'object'})`);
        } else {
          /* Cloud trống → MIGRATION: push local lên cloud nếu local có data */
          const localV = _data[key];
          if (localV && (Array.isArray(localV) ? localV.length > 0 : Object.keys(localV).length > 0)) {
            window.SB_DATA.setKv(key, localV)
              .then(() => console.log(`[STORE] ⬆ Migrated ${key} → kv_store`))
              .catch(e => console.warn(`[STORE migrate ${key}]`, e));
          }
        }
        return;
      }

      /* === Integrations (int_telegram, int_ai-engine, int_gmail...) ===
         Bảng `integrations` (key, enabled, config) — sync để cấu hình
         token/API key hoạt động trên mọi máy/trình duyệt. */
      if (key.startsWith('int_') && window.SB_DATA?.getIntegration) {
        const intKey = key.slice(4);
        const cfg = await window.SB_DATA.getIntegration(intKey);
        if (cfg && Object.keys(cfg).length > 1) {
          /* Supabase có config → dùng, ghi đè local */
          _data[key] = cfg;
          try { localStorage.setItem(PREFIX + key, JSON.stringify(cfg)); } catch (e) {}
          (_subs[key] || []).forEach(fn => fn(cfg));
          console.log(`[STORE] Synced ${key} ← Supabase`);
        } else {
          /* Supabase trống → MIGRATION: push local lên Supabase nếu có cấu hình */
          const localCfg = _data[key];
          if (localCfg && typeof localCfg === 'object' && Object.keys(localCfg).length > 0
              && (localCfg.botToken || localCfg.apiKey || localCfg.accessToken || localCfg.channels)) {
            window.SB_DATA.setIntegration(intKey, localCfg)
              .then(() => console.log(`[STORE] ⬆ Migrated ${key} → Supabase`))
              .catch(e => console.warn(`[STORE migrate ${key}]`, e));
          }
        }
        return;
      }
      /* Bảng table-mapped: customers, orders, products, ... */
      const table = TABLE_MAP[key];
      if (!table) return;
      await _mergeTableFromCloud(key, table);
      /* Bật Realtime — đổi ở máy khác → máy này thấy ngay (<1s) */
      _subscribeRealtime(key, table);
    } catch (e) {
      console.warn(`[STORE preload ${key}]`, e.message);
    } finally {
      _preloadDone.add(key);
      /* Báo cho hook đang đợi gate (cross-module-hooks) re-check */
      (_subs['__preloaded__'] || []).forEach(fn => { try { fn(key); } catch (e) {} });
    }
  }

  /* === REALTIME: subscribe postgres_changes → pull về khi có thay đổi từ máy khác === */
  const _realtimeSubs = new Set();
  const _rtTimers = {};
  function _subscribeRealtime(key, table) {
    if (_realtimeSubs.has(key) || !window.SB_DATA?.subscribe) return;
    _realtimeSubs.add(key);
    try {
      window.SB_DATA.subscribe(table, () => {
        /* Debounce 120ms — gộp change liên tiếp thành 1 pull, vẫn cảm giác tức thì (<1s) */
        clearTimeout(_rtTimers[key]);
        _rtTimers[key] = setTimeout(() => {
          _mergeTableFromCloud(key, table).catch(() => {});
        }, 120);
      });
      console.log(`[STORE] 🔴 Realtime ON: ${key}`);
    } catch (e) {
      console.warn(`[STORE realtime ${key}]`, e.message);
      _realtimeSubs.delete(key);
    }
  }

  /* === MERGE + SELF-HEAL: pull cloud + đẩy record local-only (sync fail trước đó) ===
     Giải quyết: đơn tạo lúc lỗi (FK/RLS) kẹt local → tự đẩy lên khi load/poll
     → browser khác pull về thấy. Merge thay vì replace để KHÔNG mất record chưa sync. */
  async function _mergeTableFromCloud(key, table) {
    if (!window.SB_DATA) return;
    const cloud = await window.SB_DATA.getAll(table);
    if (!Array.isArray(cloud)) return;
    const idCol = ID_COLUMN[key] || 'id';
    const keyOf = (it) => it && (it[idCol] || it.id || it.code || it.no);
    const local = Array.isArray(_data[key]) ? _data[key] : (_load(key, []) || []);
    const cloudIds = new Set(cloud.map(keyOf));
    const localOnly = local.filter(it => keyOf(it) && !cloudIds.has(keyOf(it)));
    const localById = new Map(local.map(it => [keyOf(it), it]));

    /* Phân biệt: record local-only TỪNG có trên cloud (baseline) = đã bị XOÁ ở nơi khác → bỏ;
       record CHƯA từng lên cloud = mới tạo offline / sync lỗi → tự đẩy lên. */
    const prevIds = _loadSyncedIds(key);
    const deletedOnCloud = prevIds ? localOnly.filter(it => prevIds.has(keyOf(it))) : [];
    const neverSynced    = prevIds ? localOnly.filter(it => !prevIds.has(keyOf(it))) : localOnly;

    /* Self-heal: CHỈ đẩy record chưa từng lên cloud (guard ≤200 tránh mass-push nhầm) */
    if (neverSynced.length > 0 && neverSynced.length <= 200) {
      console.log(`[STORE] ${key}: tự đẩy ${neverSynced.length} record mới (chưa sync) lên cloud`);
      for (const it of neverSynced) {
        await window.SB_DATA.insert(table, it).catch(() => {});
      }
    } else if (neverSynced.length > 200) {
      console.warn(`[STORE] ${key}: ${neverSynced.length} record chưa sync — BỎ QUA auto-push (quá nhiều)`);
    }
    if (deletedOnCloud.length) {
      console.log(`[STORE] ${key}: bỏ ${deletedOnCloud.length} record đã bị xoá trên cloud (KHÔNG hồi sinh)`);
    }

    /* Merge: cloud (nguồn chính) — GIỮ LẠI flag '_' từ bản local.
       Flag '_' (vd _invApplied, _debtApplied, _cashApplied, _shipperNotified)
       là cờ chống-lặp per-device, KHÔNG lưu cloud (bị strip). Nếu không giữ,
       mỗi lần merge sẽ tưởng "chưa xử lý" → trừ kho/ghi nợ/gửi TG LẶP LẠI. */
    const cloudMerged = cloud.map(c => {
      const lr = localById.get(keyOf(c));
      if (!lr) return c;
      const flags = {};
      for (const k of Object.keys(lr)) if (k.charAt(0) === '_') flags[k] = lr[k];
      return Object.keys(flags).length ? { ...c, ...flags } : c;
    });
    /* GIỮ lại record mới chưa sync (neverSynced) — KHÔNG giữ record đã bị xoá trên cloud */
    const keep = neverSynced.length <= 200 ? neverSynced : [];
    const merged = cloudMerged.concat(keep);
    const newJson = JSON.stringify(merged);
    _synced[key] = newJson;   /* baseline = trạng thái cloud sau merge/self-heal */
    _persistSyncedIds(key, merged);  /* lưu id-set bền qua reload để lần sau biết record nào bị xoá */
    if (newJson !== JSON.stringify(_data[key] || [])) {
      _data[key] = merged;
      try { localStorage.setItem(PREFIX + key, newJson); } catch (e) {}
      (_subs[key] || []).forEach(fn => fn(merged));
      console.log(`[STORE] Synced ${key}: ${cloud.length} cloud + ${keep.length} đẩy lên`);
    }
  }

  window.STORE = {
    /* Lấy dữ liệu — sync, return cache instantly */
    get(key, fallback) {
      if (!(key in _data)) _data[key] = _load(key, fallback);
      /* Fire-and-forget preload từ Supabase — TABLE_MAP + companyInfo + md_* + int_* + KV_KEYS */
      if (isSupabaseMode() && !_preloaded.has(key) &&
          (TABLE_MAP[key] || key === 'companyInfo' ||
           key.startsWith('md_') || key.startsWith('int_') || KV_KEYS.has(key))) {
        _preloadFromSupabase(key);
      }
      return _data[key];
    },

    /* Set toàn bộ — DIFF-SYNC: nếu là array và TABLE_MAP có key,
       sẽ so sánh cache cũ với value mới rồi push delta (insert/update/delete) lên Supabase. */
    set(key, value) {
      /* Baseline để diff = SNAPSHOT cloud gần nhất (nếu có) — KHÔNG dùng cache live,
         vì caller có thể đã mutate cache TẠI CHỖ (cùng reference) → slice() sẽ giống
         hệt value → diff bỏ sót → không push lên cloud (bug mất dữ liệu sau refresh). */
      let baseArr;
      if (Array.isArray(value) && _synced[key] != null) {
        try { baseArr = JSON.parse(_synced[key]); } catch (e) { baseArr = null; }
      }
      if (!Array.isArray(baseArr)) baseArr = Array.isArray(_data[key]) ? _data[key].slice() : [];
      const oldArr = baseArr;
      _data[key] = value;
      _save(key);

      /* CompanyInfo dùng singleton table */
      if (isSupabaseMode() && key === 'companyInfo' && value && window.SB_DATA?.setCompanyInfo) {
        window.SB_DATA.setCompanyInfo(value).catch(e => console.warn('[STORE set → SB]', e));
        return;
      }
      /* Master data lưu vào bảng master_data */
      if (isSupabaseMode() && key.startsWith('md_') && window.SB_DATA?.setMasterData) {
        window.SB_DATA.setMasterData(key.slice(3), value).catch(e => console.warn('[STORE md → SB]', e));
        return;
      }
      /* Integrations (Telegram bot, AI keys, Gmail, Zalo...)
         → bảng integrations(key, enabled, config). Sync để token/key
         dùng được trên mọi máy/trình duyệt. */
      if (isSupabaseMode() && key.startsWith('int_') && window.SB_DATA?.setIntegration && value) {
        window.SB_DATA.setIntegration(key.slice(4), value).catch(e => console.warn('[STORE int → SB]', e));
        return;
      }
      /* KV store (timesheet, payrollExtra, audit_log, snapshots, ...) */
      if (isSupabaseMode() && KV_KEYS.has(key) && window.SB_DATA?.setKv && value != null) {
        window.SB_DATA.setKv(key, value).catch(e => console.warn(`[STORE kv ${key} → SB]`, e));
        return;
      }

      /* Array tables: diff + push (chỉ chạy nếu key có TABLE_MAP và value là array) */
      if (!isSupabaseMode() || !TABLE_MAP[key] || !Array.isArray(value)) return;

      const table = TABLE_MAP[key];
      const idCol = ID_COLUMN[key] || 'id';
      const keyOf = (it) => it[idCol] || it.id || it.code || it.no;

      const oldMap = new Map(oldArr.map(x => [keyOf(x), x]));
      const newMap = new Map(value.map(x => [keyOf(x), x]));

      /* Items mới hoặc thay đổi */
      value.forEach(item => {
        const id = keyOf(item);
        if (id == null) return;
        const old = oldMap.get(id);
        if (!old) {
          /* New item → insert */
          window.SB_DATA.insert(table, item)
            .catch(e => console.warn(`[STORE set→insert ${key}]`, e));
        } else if (JSON.stringify(old) !== JSON.stringify(item)) {
          /* Changed → update */
          window.SB_DATA.update(table, id, item, idCol)
            .catch(e => console.warn(`[STORE set→update ${key}]`, e));
        }
      });

      /* Items bị xoá: có ở oldMap nhưng không ở newMap */
      oldArr.forEach(item => {
        const id = keyOf(item);
        if (id != null && !newMap.has(id)) {
          window.SB_DATA.remove(table, id, idCol)
            .catch(e => console.warn(`[STORE set→remove ${key}]`, e));
        }
      });
      /* Cập nhật baseline = trạng thái vừa đẩy lên cloud */
      _synced[key] = JSON.stringify(value);
      _persistSyncedIds(key, value);
    },

    /* Thêm item vào mảng */
    add(key, item, fallback) {
      const arr = this.get(key, fallback);
      arr.unshift(item);
      _save(key);
      /* Push to Supabase */
      if (isSupabaseMode() && TABLE_MAP[key]) {
        window.SB_DATA.insert(TABLE_MAP[key], item)
          .catch(e => console.warn(`[STORE add ${key} → SB]`, e));
      }
      if (TABLE_MAP[key] && Array.isArray(_data[key])) _synced[key] = JSON.stringify(_data[key]); if (TABLE_MAP[key] && Array.isArray(_data[key])) _persistSyncedIds(key, _data[key]);
      return item;
    },

    /* Update theo id/code/no */
    update(key, identifier, patch, fallback) {
      const arr = this.get(key, fallback);
      const i = arr.findIndex(x => x.id === identifier || x.code === identifier || x.no === identifier);
      if (i >= 0) {
        arr[i] = { ...arr[i], ...patch };
        _save(key);
        /* Push to Supabase */
        if (isSupabaseMode() && TABLE_MAP[key]) {
          /* Mặc định khóa = 'id' (KH/NCC/NV... cloud dùng id, KHÔNG có cột code).
             Bảng dùng code/no đã khai báo rõ trong ID_COLUMN (orders=code, invoices/cashEntries=no). */
          const idCol = ID_COLUMN[key] || 'id';
          window.SB_DATA.update(TABLE_MAP[key], identifier, patch, idCol)
            .catch(e => console.warn(`[STORE update ${key} → SB]`, e));
        }
        if (TABLE_MAP[key] && Array.isArray(_data[key])) _synced[key] = JSON.stringify(_data[key]); if (TABLE_MAP[key] && Array.isArray(_data[key])) _persistSyncedIds(key, _data[key]);
        return arr[i];
      }
      return null;
    },

    /* Xóa item */
    remove(key, identifier, fallback) {
      const arr = this.get(key, fallback);
      const item = arr.find(x => x.id === identifier || x.code === identifier || x.no === identifier);
      _data[key] = arr.filter(x => x.id !== identifier && x.code !== identifier && x.no !== identifier);
      _save(key);
      /* Push to Supabase */
      if (isSupabaseMode() && TABLE_MAP[key] && item) {
        const idCol = ID_COLUMN[key] || 'id';   /* mặc định 'id'; code/no khai báo trong ID_COLUMN */
        window.SB_DATA.remove(TABLE_MAP[key], identifier, idCol)
          .catch(e => console.warn(`[STORE remove ${key} → SB]`, e));
      }
      if (TABLE_MAP[key] && Array.isArray(_data[key])) _synced[key] = JSON.stringify(_data[key]); if (TABLE_MAP[key] && Array.isArray(_data[key])) _persistSyncedIds(key, _data[key]);
    },

    subscribe(key, fn) {
      (_subs[key] = _subs[key] || []).push(fn);
    },

    /* Dữ liệu cloud của key đã tải XONG chưa? (localStorage mode → luôn true).
       Hook side-effect (kho/nợ) PHẢI đợi true mới chạy — tránh áp dụng trên cache rỗng. */
    isPreloaded(key) {
      return !isSupabaseMode() || _preloadDone.has(key);
    },

    reset(key) {
      localStorage.removeItem(PREFIX + key);
      delete _data[key];
      _preloaded.delete(key);
      (_subs[key] || []).forEach(fn => fn(null));
      window.toast?.('Đã reset ' + key + ' về dữ liệu mẫu', 'info');
    },

    resetAll() {
      Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k));
      Object.keys(_data).forEach(k => delete _data[k]);
      _preloaded.clear();
      window.toast?.('Đã reset toàn bộ về dữ liệu mẫu', 'success');
      setTimeout(() => location.reload(), 800);
    },

    /* Xóa data demo — XÓA CẢ CLOUD + local (trước đây chỉ xóa local → reload bị cloud kéo về). */
    async clearDemoCache() {
      const DEMO_KEYS = [
        'customers', 'orders', 'invoices', 'returns', 'purchases',
        'quotes', 'leads', 'suppliers', 'recurring_orders', 'cashEntries',
      ];
      if (isSupabaseMode() && window.SB_DATA && window.SB_DATA.clearTable) {
        for (const k of DEMO_KEYS) {
          const table = TABLE_MAP[k]; if (!table) continue;
          await window.SB_DATA.clearTable(table, ID_COLUMN[k] || 'id').catch(() => {});
        }
      }
      DEMO_KEYS.forEach(k => {
        localStorage.removeItem(PREFIX + k);
        delete _data[k];
        _preloaded.delete(k);
        _synced[k] = JSON.stringify([]);
      });
      window.toast?.('🧹 Đã xóa ' + DEMO_KEYS.length + ' bảng (cả cloud) · đang reload…', 'success');
      setTimeout(() => location.reload(), 700);
    },

    /* === Xóa TOÀN BỘ data kinh doanh (đơn/HĐ/KH/kho/quỹ...) ===
       GIỮ LẠI: nhân viên (staff), sản phẩm (products), lương (payrollExtra),
                chấm công (timesheet/timesheetMeta), khung phạt (latePolicy),
                settings, integrations.
       Xóa cả localStorage + đẩy DELETE lên Supabase cho các bảng table-mapped. */
    async clearBusinessData() {
      const BUSINESS_KEYS = [
        'customers', 'orders', 'invoices', 'returns', 'purchases',
        'quotes', 'leads', 'suppliers', 'recurring_orders', 'cashEntries',
        'debt', 'inventory', 'adspend', 'partners',
        'inv_movements', 'audit_log', 'cust_prefs', 'activityLogs',
      ];

      /* 1) Xóa Supabase — bulk delete 1 API call/bảng (clearTable) */
      if (isSupabaseMode() && window.SB_DATA) {
        for (const key of BUSINESS_KEYS) {
          const table = TABLE_MAP[key];
          if (!table) continue;
          const idCol = ID_COLUMN[key] || 'id';
          if (window.SB_DATA.clearTable) {
            await window.SB_DATA.clearTable(table, idCol).catch(() => {});
          }
        }
        /* kv_store keys: inv_movements, audit_log, cust_prefs */
        for (const kvKey of ['inv_movements', 'audit_log', 'cust_prefs']) {
          if (window.SB_DATA.deleteKv) await window.SB_DATA.deleteKv(kvKey).catch(() => {});
        }
      }

      /* 2) Xóa localStorage + cache RAM */
      BUSINESS_KEYS.forEach(k => {
        localStorage.removeItem(PREFIX + k);
        delete _data[k];
        _preloaded.delete(k);
        (_subs[k] || []).forEach(fn => fn([]));
      });

      window.toast?.('🗑 Đã xóa toàn bộ data kinh doanh (giữ NV + SP + lương) · đang reload…', 'success');
      setTimeout(() => location.reload(), 800);
    },

    /* Push toàn bộ localStorage hiện tại lên Supabase (migration tool) */
    async migrateToSupabase() {
      if (!isSupabaseMode()) {
        alert('Chưa cấu hình Supabase. Vào Settings → Integrations.');
        return { uploaded: 0, failed: 0 };
      }
      let uploaded = 0, failed = 0;
      for (const [key, table] of Object.entries(TABLE_MAP)) {
        const items = _data[key] || _load(key, []);
        if (!items.length) continue;
        for (const item of items) {
          try {
            await window.SB_DATA.insert(table, item);
            uploaded++;
          } catch (e) {
            failed++;
            console.warn(`[Migration] ${key}:${item.id||item.code||item.no}`, e.message);
          }
        }
      }
      const msg = `Migrated: ${uploaded} OK · ${failed} failed`;
      console.log(msg);
      window.toast?.(msg, failed ? 'warn' : 'success');
      return { uploaded, failed };
    },

    nextId(key, prefix, pad = 3) {
      const arr = this.get(key, []);
      const max = arr.reduce((m, x) => {
        const code = x.code || x.id || '';
        const num = parseInt(code.replace(/\D/g, '').slice(-pad), 10);
        return isNaN(num) ? m : Math.max(m, num);
      }, 0);
      return prefix + String(max + 1).padStart(pad, '0');
    },

    nextOrderCode() {
      const arr = this.get('orders', []);
      const max = arr.reduce((m, o) => {
        const m2 = (o.code || '').match(/NSTT-(\d+)/);
        return m2 ? Math.max(m, parseInt(m2[1], 10)) : m;
      }, 526052);
      return 'NSTT-' + (max + 1);
    },
  };

  /* === Helpers === */
  window.formVal = function(selector, root = document) {
    const el = root.querySelector(selector);
    return el ? el.value.trim() : '';
  };

  window.confirmDelete = function(message, onConfirm) {
    if (confirm('⚠️ ' + message + '\n\nThao tác này không thể hoàn tác.')) onConfirm();
  };

  /* Log mode khi load */
  setTimeout(() => {
    if (isSupabaseMode()) {
      console.log('%c[NSTT] ☁ Cloud sync mode (Supabase)', 'color:#15803D;font-weight:bold');
    } else {
      console.log('%c[NSTT] 💾 LocalStorage mode', 'color:#B45309;font-weight:bold');
    }
  }, 100);

  /* === REALTIME POLL — tiết kiệm egress ===
     Mỗi N phút re-fetch các bảng đã preload từ Supabase để đồng bộ.
     Default 5 phút (300s) — vừa đủ cho free tier 5GB egress với 50 NV.
     User có thể chỉnh ở Settings → window.STORE.setPollInterval(seconds).

     Chi phí free tier:
     - Poll 60s × 50 NV × 8h = ~360GB egress/tháng (VƯỢT 5GB free)
     - Poll 5min × 50 NV × 8h = ~7GB egress/tháng (vẫn nhẹ vượt nhưng OK)
     - Poll 10min × 50 NV × 8h = ~3.5GB egress/tháng (an toàn)

     Skip poll khi tab nền (document.hidden) → 0 cost khi user không xem. */

  /* Real-time CHÍNH = websocket (đã bật mọi bảng, ~0 egress, <1s).
     Poll chỉ là LƯỚI AN TOÀN khi websocket rớt mạng → để 60s là đủ nhanh + nhẹ egress
     (skip khi tab nền). Khi quay lại tab → đồng bộ NGAY (visibilitychange bên dưới). */
  const DEFAULT_POLL_SEC = 60;
  let _pollIntervalId = null;
  let _pollSec = DEFAULT_POLL_SEC;

  function _startPoll() {
    if (_pollIntervalId) clearInterval(_pollIntervalId);
    /* Load user-configured interval từ localStorage nếu có */
    try {
      const saved = parseInt(localStorage.getItem(PREFIX + 'pollSec') || '0', 10);
      if (saved >= 20) _pollSec = saved;
    } catch (e) {}
    _pollIntervalId = setInterval(() => {
      if (!isSupabaseMode()) return;
      if (document.hidden) return;
      _preloaded.forEach(key => {
        if (TABLE_MAP[key]) {
          /* Merge + self-heal (đẩy local-only lên + pull cloud về) */
          _mergeTableFromCloud(key, TABLE_MAP[key]).catch(() => {});
        }
      });
    }, _pollSec * 1000);
    console.log(`[STORE] ⏱ Realtime poll: ${_pollSec}s (${(_pollSec/60).toFixed(1)} phút)`);
  }

  /* Public API: user/dev có thể chỉnh poll interval */
  window.STORE.setPollInterval = function (sec) {
    if (sec < 20) { console.warn('Min 20s'); return; }
    if (sec > 3600) { console.warn('Max 1h'); return; }
    _pollSec = sec;
    try { localStorage.setItem(PREFIX + 'pollSec', String(sec)); } catch (e) {}
    _startPoll();
    console.log(`[STORE] Poll interval saved: ${sec}s`);
  };
  window.STORE.getPollInterval = function () { return _pollSec; };

  /* Đồng bộ NGAY tất cả bảng đã load (merge + self-heal) — gọi từ nút hoặc console */
  window.STORE.syncNow = async function () {
    if (!isSupabaseMode()) { window.toast?.('Chưa bật chế độ cloud', 'warn'); return; }
    let n = 0;
    for (const key of _preloaded) {
      if (TABLE_MAP[key]) { await _mergeTableFromCloud(key, TABLE_MAP[key]).catch(() => {}); n++; }
    }
    window.toast?.('🔄 Đã đồng bộ ' + n + ' bảng với cloud', 'success');
  };
  window.syncNow = () => window.STORE.syncNow();

  /* Expose clear helpers as top-level shortcut */
  window.clearDemoCache = () => window.STORE.clearDemoCache();
  window.clearBusinessData = () => window.STORE.clearBusinessData();

  if (typeof window !== 'undefined') _startPoll();

  /* === QUAY LẠI TAB → ĐỒNG BỘ NGAY (real-time feel) ===
     Khi user chuyển sang app khác rồi quay lại, hoặc tab được focus,
     pull cloud ngay lập tức thay vì đợi vòng poll kế tiếp.
     Throttle 3s để tránh spam khi focus/blur liên tục. */
  if (typeof window !== 'undefined') {
    let _lastForeSync = 0;
    const _foreSync = () => {
      if (!isSupabaseMode() || document.hidden) return;
      const now = Date.now();
      if (now - _lastForeSync < 3000) return;
      _lastForeSync = now;
      _preloaded.forEach(key => {
        if (TABLE_MAP[key]) _mergeTableFromCloud(key, TABLE_MAP[key]).catch(() => {});
      });
    };
    document.addEventListener('visibilitychange', _foreSync);
    window.addEventListener('focus', _foreSync);
    window.addEventListener('online', _foreSync);
  }
})();
