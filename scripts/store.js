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
  /* ⚠️ CHỐNG MẤT DỮ LIỆU: id đang có write GỬI DỞ lên cloud (insert/update) — LƯU RA localStorage
     để BỀN qua F5 (F5 huỷ write đang bay + reset RAM). Tác dụng:
     (1) merge (reload/poll/focus) KHÔNG cho cloud CŨ ghi đè bản LOCAL của record pending;
     (2) mỗi lần merge sẽ ĐẨY LẠI record pending lên cloud (write trước bị F5 cắt) đến khi thành công.
     → "vừa nhập/sửa xong, F5" không còn mất / quay về data cũ. Xoá pending khi cloud xác nhận. */
  const PENDING_PREFIX = 'vty__pending_';
  const TOMB_PREFIX = 'vty__tomb_';
  const _pendingCache = {};
  function _loadPending(key) {
    if (!_pendingCache[key]) {
      try { _pendingCache[key] = new Set((JSON.parse(localStorage.getItem(PENDING_PREFIX + key) || '[]') || []).map(String)); }
      catch (e) { _pendingCache[key] = new Set(); }
    }
    return _pendingCache[key];
  }
  function _savePending(key) { try { localStorage.setItem(PENDING_PREFIX + key, JSON.stringify([...(_pendingCache[key] || [])])); } catch (e) {} }
  function _markPending(key, id) { if (id == null) return; _loadPending(key).add(String(id)); _savePending(key); }
  function _clearPending(key, id) { if (id == null) return; _loadPending(key).delete(String(id)); _savePending(key); }
  function _isPending(key, id) { return id != null && _loadPending(key).has(String(id)); }

  /* === TOMBSTONE (bia mộ) — CHỐNG HỒI SINH record vừa XOÁ ===
     Bug gốc: SB_DATA.remove là fire-and-forget + trả false khi lỗi (KHÔNG throw) → xoá cloud
     hỏng ÂM THẦM (nhất là lúc DB timeout); mọi merge/realtime sau lại kéo record về =
     "xoá xong tự hiện lại LIÊN TỤC". Fix: đánh dấu id đã xoá (bền qua reload); merge/delta/
     realtime BỎ QUA + XOÁ LẠI cho tới khi cloud sạch rồi mới gỡ bia mộ. */
  const _tombCache = {};
  function _loadTomb(key) {
    if (!_tombCache[key]) {
      try { _tombCache[key] = new Set((JSON.parse(localStorage.getItem(TOMB_PREFIX + key) || '[]') || []).map(String)); }
      catch (e) { _tombCache[key] = new Set(); }
    }
    return _tombCache[key];
  }
  function _saveTomb(key) { try { localStorage.setItem(TOMB_PREFIX + key, JSON.stringify([...(_tombCache[key] || [])])); } catch (e) {} }
  function _addTomb(key, id) { if (id == null) return; _loadTomb(key).add(String(id)); _saveTomb(key); }
  function _clearTomb(key, id) { if (id == null) return; if (_loadTomb(key).delete(String(id))) _saveTomb(key); }
  function _isTomb(key, id) { return id != null && _loadTomb(key).has(String(id)); }

  const _subs = {};
  const _preloaded = new Set();
  /* Snapshot (JSON) bản đã đồng bộ cloud gần nhất, per table key.
     set() diff value vs snapshot này (KHÔNG vs cache live) → bắt được cả
     trường hợp caller mutate mảng TẠI CHỖ rồi set cùng reference. */
  const _synced = {};

  /* === RMW-KV (read-modify-write) — CHỐNG ĐÈ NHAU cho KV blob NHIỀU NGƯỜI sửa (vd priceTiers:
     2 nhóm × ~660 giá). Trước đây STORE.set('priceTiers') ghi đè CẢ khối (last-write-wins) →
     NV B (bản cũ) lưu đè mất edit của NV A; realtime máy khác cũng nuốt → "sửa xong 1 lúc load lại mất".
     Nay: mỗi thao tác = 1 `mutate(arr)→arr` áp lên bản CLOUD MỚI NHẤT rồi ghi lại (không đè phần
     của người khác). Local đổi NGAY (optimistic), cloud ghi GỘP debounce 1.2s (đỡ round-trip). */
  const _rmwQueue = {}; const _rmwTimer = {};
  async function _flushRmw(key) {
    const mutates = _rmwQueue[key] || []; _rmwQueue[key] = [];
    if (!mutates.length || !isSupabaseMode() || !window.SB_DATA || !window.SB_DATA.setKv) return;
    /* GIỮ ĐÚNG HÌNH DẠNG: cloud có thể là MẢNG (priceTiers, debtLedger…) HOẶC OBJECT/MAP
       (mktPrices, custPriceTiers, accountOpenings…). Trước đây ép non-array → [] khiến blob dạng
       object BỊ XOÁ sạch bản cloud khi flush (mất chỉnh của người khác). Nay lấy nguyên bản cloud
       nếu có; fallback bản local (đã đổi optimistic → đúng hình dạng); cuối cùng mới []. */
    let base;
    try { const cloud = await window.SB_DATA.getKv(key); base = (cloud != null) ? cloud : (_data[key] != null ? _data[key] : []); }
    catch (e) { base = (_data[key] != null ? _data[key] : []); }
    let cur = JSON.parse(JSON.stringify(base));
    mutates.forEach(m => { try { cur = m(cur) || cur; } catch (e) {} });   /* áp lại mọi thay đổi lên bản cloud mới */
    _data[key] = cur;
    try { localStorage.setItem(PREFIX + key, JSON.stringify(cur)); } catch (e) {}
    (_subs[key] || []).forEach(fn => { try { fn(cur); } catch (e) {} });
    window.SB_DATA.setKv(key, cur).catch(e => console.warn(`[STORE rmwKv flush ${key}]`, e));
  }

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
    'staffUsernames',  /* Tên đăng nhập tuỳ chọn {staffId: username} — login bằng email/SĐT/username */
    'staffAliases',    /* Tên viết tắt máy chấm công {staffId: 'tên viết tắt'} — khoá khớp phiếu chấm công */
    'mktPrices',       /* Bảng giá Marketing (chào hàng/ads) — KHÔNG ảnh hưởng đơn */
    'priceTiers',      /* Nhóm bảng giá theo nhóm KH (±% + override) — gửi báo giá riêng */
    'priceBaseMarkup', /* % giá gốc so giá nhập (link toàn hệ thống) — phải roaming đa máy */
    'priceAutoSend',   /* Cấu hình + lastSentDate auto-send bảng giá — sync tránh gửi Telegram trùng */
    'accountOpenings', /* Số dư GỐC từng TK quỹ {accId:number} — số dư = opening + (thu−chi từ cashEntries) */
    'recurringDrivers',/* Shipper mặc định mẫu đơn định kỳ {roId:{id,name}} — bảng recurring_orders không có cột driver */
    'procurementRuns', /* Phiên gom hàng → đặt NCC (Kho) — CRITICAL */
    'supplierClaims',  /* Khoản đòi lại NCC khi hàng NCC giao hỏng (Trả hàng) */
    'supplierMeta',    /* Loại NCC (sỉ/lẻ/cả hai) — cloud suppliers không có cột này */
    'custPriceTiers',  /* Nhóm giá gán cho từng KH {custId:tierId} — cloud customers không có cột price_tier */
    'custCreditDays',  /* Hạn công nợ (số ngày) theo từng KH {custId:days} — chính sách 3/7/15 */
    'custBrands',      /* Nhãn THƯƠNG HIỆU gom nhiều cơ sở {custId:'BIA ƠI'} — cùng thương hiệu = gộp công nợ + in phiếu ma trận */
    'orderQtyLocks',   /* Chốt SẢN LƯỢNG đơn {code:{by,byId,at}} — KT1 khớp SL khách nhận với đơn sale lên (bước trước báo giá) */
    'orderQuoteLocks', /* Chốt báo giá đơn {code:{by,byId,at}} — KT2 chốt giá (sau khi SL đã chốt), 5 kế toán đồng bộ để không sửa nhầm */
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
        _subscribeKvRealtime();   /* bật realtime kv_store (1 lần) khi có key KV đầu tiên được tải */
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
      await _mergeTableFromCloud(key, table);   /* orders: hàm này TỰ đặt mốc delta từ snapshot → vòng poll đầu đã nhẹ */
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
      window.SB_DATA.subscribe(table, (evt) => {
        /* TỐI ƯU BĂNG THÔNG: INSERT/UPDATE có sẵn bản ghi đầy đủ trong evt.new
           → áp delta 1 record, KHÔNG kéo lại cả bảng. Chỉ DELETE / trường hợp lạ
           mới full-merge (hiếm + cần baseline id-set để biết record nào bị xoá). */
        try {
          if (evt && evt.new && _preloaded.has(key) &&
              (evt.type === 'INSERT' || evt.type === 'UPDATE')) {
            if (_applyRealtimeUpsert(key, evt.new)) return;
          }
        } catch (e) { console.warn(`[STORE rt delta ${key}]`, e); }
        /* Debounce 150ms — gộp change liên tiếp thành 1 pull, vẫn cảm giác tức thì (<1s) */
        clearTimeout(_rtTimers[key]);
        _rtTimers[key] = setTimeout(() => {
          _mergeTableFromCloud(key, table).catch(() => {});
        }, 150);
      });
      console.log(`[STORE] 🔴 Realtime ON: ${key}`);
    } catch (e) {
      console.warn(`[STORE realtime ${key}]`, e.message);
      _realtimeSubs.delete(key);
    }
  }

  /* === REALTIME cho kv_store (công nợ, chấm công, sổ kho, gom hàng...) ===
     Subscribe MỘT LẦN cho cả bảng kv_store; mỗi thay đổi mang theo `key` → cập
     nhật đúng STORE key đó. NV đổi công nợ ở máy này → máy khác thấy ngay (<1s). */
  let _kvRealtimeOn = false;
  function _subscribeKvRealtime() {
    if (_kvRealtimeOn || !window.SB_DATA?.subscribeKv) return;
    _kvRealtimeOn = true;
    try {
      window.SB_DATA.subscribeKv(({ key, value }) => {
        if (!KV_KEYS.has(key)) return;            /* chỉ nhận key app quan tâm */
        if (value == null) return;
        if (_rmwQueue[key] && _rmwQueue[key].length) return;   /* còn edit chưa flush → bỏ qua, tránh nuốt (flush sẽ merge lên cloud) */
        const nextJson = JSON.stringify(value);
        if (nextJson === JSON.stringify(_data[key])) return;  /* không đổi → bỏ (né echo của chính mình) */
        _data[key] = value;
        try { localStorage.setItem(PREFIX + key, nextJson); } catch (e) {}
        (_subs[key] || []).forEach(fn => { try { fn(value); } catch (e) {} });
        console.log(`[STORE] 🔴 Realtime kv: ${key} cập nhật từ máy khác`);
      });
      console.log('[STORE] 🔴 Realtime ON: kv_store');
    } catch (e) {
      _kvRealtimeOn = false;
      console.warn('[STORE realtime kv]', e.message);
    }
  }

  /* === REALTIME DELTA: áp 1 record (INSERT/UPDATE) từ máy khác mà KHÔNG kéo cả bảng ===
     Trả về true nếu áp thành công; false → caller tự full-merge dự phòng.
     An toàn dữ liệu:
       • GIỮ flag '_' (cờ chống-lặp per-device) của bản ghi local hiện có.
       • Baseline (_synced) chỉ cập nhật ĐÚNG record này — KHÔNG nuốt record
         local-only chưa kịp đẩy lên cloud (tránh bug mất dữ liệu sau refresh). */
  /* PERF: gộp ghi localStorage + notify subscriber (mỗi cái = stringify + re-render CẢ bảng,
     rất nặng với orders ~ngàn dòng) vào 1 lần / ~300ms cho mỗi bảng. Nhiều người tạo đơn
     cùng lúc → hàng loạt realtime event; nếu stringify + re-render trên TỪNG event → đơ. */
  const _rtFlush = {};
  function _flushUpsert(key) {
    const arr = _data[key];
    if (!Array.isArray(arr)) return;
    try { localStorage.setItem(PREFIX + key, JSON.stringify(arr)); } catch (e) {}
    (_subs[key] || []).forEach(fn => { try { fn(arr); } catch (e) {} });
  }
  function _applyRealtimeUpsert(key, row) {
    const idCol = ID_COLUMN[key] || 'id';
    const keyOf = (it) => it && (it[idCol] != null ? it[idCol]
                       : (it.id != null ? it.id : (it.code != null ? it.code : it.no)));
    const rid = keyOf(row);
    if (rid == null) return false;   /* không khớp được id → full-merge */

    /* TOMBSTONE: record đã xoá cục bộ nhưng máy khác/echo còn đẩy INSERT/UPDATE về → XOÁ LẠI,
       KHÔNG hồi sinh (mã đơn/KH không tái dùng nên bia mộ luôn đúng). */
    if (_isTomb(key, rid)) {
      window.SB_DATA.remove(TABLE_MAP[key], rid, idCol).then(ok => { if (ok) _clearTomb(key, rid); }).catch(() => {});
      return true;
    }

    /* Cập nhật in-memory NGAY (rẻ: findIndex + gán 1 phần tử) */
    const arr = Array.isArray(_data[key]) ? _data[key] : (_load(key, []) || []);
    const idx = arr.findIndex(it => keyOf(it) === rid);
    if (idx >= 0) {
      const lr = arr[idx];
      const flags = {};
      for (const k of Object.keys(lr)) if (k.charAt(0) === '_') flags[k] = lr[k];   /* giữ cờ '_' per-device */
      arr[idx] = Object.assign({}, row, flags);
    } else {
      arr.push(row);
    }
    _data[key] = arr;

    /* Ghi localStorage + notify → GỘP debounce 300ms (bỏ stringify/re-render trên mỗi event).
       KHÔNG đụng baseline (_synced) ở đây: record vừa nhận ĐÃ ở cloud → poll/merge định kỳ
       dựng lại baseline đúng (không coi là local-only, không nuốt, không hồi sinh). */
    clearTimeout(_rtFlush[key]);
    _rtFlush[key] = setTimeout(() => _flushUpsert(key), 300);
    return true;
  }

  /* === MERGE + SELF-HEAL: pull cloud + đẩy record local-only (sync fail trước đó) ===
     Giải quyết: đơn tạo lúc lỗi (FK/RLS) kẹt local → tự đẩy lên khi load/poll
     → browser khác pull về thấy. Merge thay vì replace để KHÔNG mất record chưa sync. */
  async function _mergeTableFromCloud(key, table) {
    if (!window.SB_DATA) return;
    let cloud = await window.SB_DATA.getAll(table);
    if (!Array.isArray(cloud)) return;
    const idCol = ID_COLUMN[key] || 'id';
    const keyOf = (it) => it && (it[idCol] || it.id || it.code || it.no);
    /* TOMBSTONE: loại record vừa XOÁ khỏi snapshot cloud (chống hồi sinh) + XOÁ LẠI nếu cloud còn.
       Khi cloud đã sạch id đó → gỡ bia mộ. Làm TRƯỚC khi tính cursor/merge để mọi bước dưới không thấy nó. */
    const _tomb = _loadTomb(key);
    if (_tomb.size) {
      const _inCloud = new Set(cloud.map(c => String(keyOf(c))));
      for (const id of [..._tomb]) if (!_inCloud.has(id)) _clearTomb(key, id);   /* cloud đã sạch → gỡ */
      cloud = cloud.filter(c => {
        const id = String(keyOf(c));
        if (_isTomb(key, id)) {   /* còn trên cloud mà đang bia mộ → xoá lại, loại khỏi merge */
          window.SB_DATA.remove(table, keyOf(c), idCol).then(ok => { if (ok) _clearTomb(key, id); }).catch(() => {});
          return false;
        }
        return true;
      });
    }
    /* orders: đặt MỐC DELTA ngay từ chính snapshot vừa kéo (KHÔNG query max() riêng sau đó).
       Tránh khe đua: nếu máy khác sửa 1 đơn CHEN GIỮA getAll và max() → max() đẩy cursor
       vượt qua bản đó → delta dùng .gt sẽ không bao giờ kéo lại (mất cập nhật đến FULL kế). */
    if (key === 'orders') {
      let _mx = _cursor[key] || '';
      for (const _c of cloud) { const _u = _c && _c.updated_at; if (_u && _u > _mx) _mx = _u; }
      if (_mx) _cursor[key] = _mx;
    }
    let local = Array.isArray(_data[key]) ? _data[key] : (_load(key, []) || []);
    if (_tomb.size) {   /* DỌN record hồi sinh còn sót trong local → không để self-heal (neverSynced) đẩy lại lên cloud */
      const _n = local.length;
      local = local.filter(it => !_isTomb(key, keyOf(it)));
      if (local.length !== _n) _data[key] = local;
    }
    const cloudIds = new Set(cloud.map(keyOf));
    const localOnly = local.filter(it => keyOf(it) && !cloudIds.has(keyOf(it)));
    const localById = new Map(local.map(it => [keyOf(it), it]));
    const cloudById = (key === 'customers') ? new Map(cloud.map(c => [keyOf(c), c])) : null;

    /* Phân biệt: record local-only TỪNG có trên cloud (baseline) = đã bị XOÁ ở nơi khác → bỏ;
       record CHƯA từng lên cloud = mới tạo offline / sync lỗi → tự đẩy lên. */
    const prevIds = _loadSyncedIds(key);
    /* Record đang insert DỞ (pending) → LUÔN coi "chưa sync" (giữ + đẩy lại), KHÔNG bao giờ coi
       là "đã xoá trên cloud" (tránh reload giữa chừng làm mất record vừa thêm). */
    const deletedOnCloud = prevIds ? localOnly.filter(it => prevIds.has(keyOf(it)) && !_isPending(key, keyOf(it))) : [];
    const neverSynced    = prevIds ? localOnly.filter(it => !prevIds.has(keyOf(it)) || _isPending(key, keyOf(it))) : localOnly;

    /* CHỐNG HỒI SINH / UNDO-XOÁ khi máy DESYNC: nếu local ít hơn cloud RẤT NHIỀU (vd máy chỉ
       giữ được vài đơn do lỗi/quota trong khi cloud ~900) thì các "local-only" nhiều khả năng là
       RÁC / đã bị xoá ở nơi khác → KHÔNG tự đẩy lên cloud (nếu không máy desync sẽ đẩy NGƯỢC đơn
       cũ/đã-xoá lên, làm việc xoá của người khác bị hoàn tác — đúng triệu chứng user gặp). */
    const _desync = cloud.length >= 50 && local.length < cloud.length * 0.5;
    /* Self-heal: CHỈ đẩy record chưa từng lên cloud (guard ≤200 tránh mass-push nhầm) */
    if (_desync && neverSynced.length > 0) {
      console.warn(`[STORE] ${key}: DESYNC (local ${local.length} << cloud ${cloud.length}) — BỎ auto-push ${neverSynced.length} record local-only (chống hồi sinh / undo xoá). Đồng bộ lại từ cloud để sửa.`);
    } else if (neverSynced.length > 0 && neverSynced.length <= 200) {
      console.log(`[STORE] ${key}: tự đẩy ${neverSynced.length} record mới (chưa sync) lên cloud`);
      for (const it of neverSynced) {
        const oid = keyOf(it);
        const saved = await window.SB_DATA.insert(table, it).catch(() => null);
        if (saved) _clearPending(key, oid);   /* đẩy lại thành công → hết pending */
        /* Nếu insert cấp lại MÃ MỚI (vd đơn trùng mã được đổi) → cập nhật lại id cục bộ
           để khớp cloud, tránh kẹt/đẩy lặp + giữ đúng record (không bị nuốt). */
        if (saved && idCol && saved[idCol] && it[idCol] !== saved[idCol]) {
          const old = it[idCol]; it[idCol] = saved[idCol]; _clearPending(key, saved[idCol]);
          console.log(`[STORE] ${key}: mã '${old}' đổi → '${saved[idCol]}' (chống trùng)`);
        }
      }
    } else if (neverSynced.length > 200) {
      console.warn(`[STORE] ${key}: ${neverSynced.length} record chưa sync — BỎ QUA auto-push (quá nhiều)`);
    }
    /* ĐẨY LẠI record đang PENDING nhưng ĐÃ có trên cloud (giá trị cloud CŨ vì update trước bị F5
       cắt giữa chừng) → PATCH lại bằng bản LOCAL rồi mới clear pending. Cùng với việc cloudMerged
       giữ bản local cho record pending → F5 không còn quay về data cũ. */
    for (const it of local) {
      const id = keyOf(it);
      if (id == null || !_isPending(key, id) || !cloudIds.has(id)) continue;
      /* CHỐNG GHI ĐÈ NHẦM KHÁCH (như vụ KH001 Hằng Vy bị Panda Chef đè): nếu record cloud CÙNG
         MÃ là KH HOÀN TOÀN KHÁC (khác cả TÊN + SĐT + ĐỊA CHỈ) → đây là TRÙNG MÃ (2 KH khác nhau
         cùng KHxxx do sinh mã cục bộ lúc DB nghẽn), KHÔNG được PATCH đè (sẽ XOÁ KH cloud). Thay
         vào đó INSERT để (v353) cấp MÃ MỚI, giữ cả 2 KH. Đổi TÊN bình thường vẫn giữ SĐT/địa chỉ
         nên KHÔNG lọt guard (chỉ chặn khi CẢ 3 trường đều khác). */
      if (key === 'customers' && cloudById) {
        const cc = cloudById.get(id);
        const nz = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
        if (cc && nz(cc.name) !== nz(it.name) && nz(cc.phone) !== nz(it.phone) && nz(cc.address) !== nz(it.address)) {
          console.warn(`[STORE] customers: mã '${id}' trên cloud là KH KHÁC ("${cc.name}") — KHÔNG ghi đè; insert cấp mã mới cho "${it.name}"`);
          window.SB_DATA.insert(table, it).then(saved => {
            if (saved) {
              if (saved[idCol] && saved[idCol] !== id) { it[idCol] = saved[idCol]; try { localStorage.setItem(PREFIX + key, JSON.stringify(_data[key])); } catch (e) {} }
              _clearPending(key, id); _clearPending(key, it[idCol]);
              window.toast?.(`KH "${it.name}" trùng mã ${id} → đã cấp mã mới ${it[idCol]} (không ghi đè KH khác)`, 'success');
            }
          }).catch(() => {});
          continue;
        }
      }
      /* Chỉ hết pending khi đẩy lại THÀNH CÔNG (saved != null); hỏng → giữ pending, lần merge sau đẩy tiếp. */
      window.SB_DATA.update(table, id, it, idCol).then(saved => { if (saved != null) _clearPending(key, id); }).catch(() => {});
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
      /* Record đang GỬI DỞ write lên cloud (pending) → GIỮ bản LOCAL, đừng để cloud CŨ ghi đè
         (nếu không reload giữa lúc lưu sẽ mất thay đổi vừa nhập/sửa). */
      if (_isPending(key, keyOf(c))) return lr;
      const flags = {};
      for (const k of Object.keys(lr)) if (k.charAt(0) === '_') flags[k] = lr[k];
      return Object.keys(flags).length ? { ...c, ...flags } : c;
    });
    /* GIỮ lại record mới chưa sync (neverSynced) — KHÔNG giữ record đã bị xoá trên cloud.
       LUÔN giữ (kể cả >200): chỉ auto-PUSH bị hoãn khi >200 (ở trên), còn record vẫn phải
       nằm trong local — trước đây keep=[] khi >200 làm MẤT record local (import offline lớn). */
    const keep = neverSynced;
    const merged = cloudMerged.concat(keep);
    const newJson = JSON.stringify(merged);
    /* PERF: so với BASELINE cloud lần trước (_synced[key]) thay vì stringify lại _data[key].
       Bảng orders (kèm items JSONB) ~ngàn dòng → 2× JSON.stringify mỗi tick poll/focus = đơ main-thread.
       Baseline = "trạng thái cloud sau merge" — nếu cloud không đổi thì newJson === prevBaseline → bỏ qua,
       khỏi notify lại subscriber. Local-only đổi đã được set() tự notify riêng. */
    const prevBaseline = _synced[key];
    _synced[key] = newJson;   /* baseline = trạng thái cloud sau merge/self-heal */
    _persistSyncedIds(key, merged);  /* lưu id-set bền qua reload để lần sau biết record nào bị xoá */
    if (newJson !== prevBaseline) {
      _data[key] = merged;
      try { localStorage.setItem(PREFIX + key, newJson); } catch (e) {}
      (_subs[key] || []).forEach(fn => fn(merged));
      console.log(`[STORE] Synced ${key}: ${cloud.length} cloud + ${keep.length} đẩy lên`);
    }
  }

  /* ===== DELTA SYNC cho bảng NẶNG (orders) — chỉ kéo record ĐỔI kể từ mốc updated_at =====
     Vì sao: poll kéo cả 900+ đơn kèm items JSONB = ~5.8MB/lần × mỗi tab × mỗi 3' → pin CPU/IO
     Supabase (đã gây treo 522). Realtime websocket vẫn đẩy delta tức thì; poll chỉ là lưới
     an toàn. Delta poll chỉ tải vài record vừa đổi (~KB) thay vì cả bảng.
     - _cursor[key] = updated_at lớn nhất đã thấy (ISO thô DB). Tăng đơn điệu.
     - UPSERT giữ NGUYÊN THỨ TỰ local (ổn định → không re-render vô cớ) + giữ cờ '_' + pending.
     - KHÔNG xử lý xoá / KHÔNG tự đẩy local-only ở đây (để merge FULL định kỳ/refocus lo). */
  const _cursor = {};   /* _cursor[key] = updated_at (ISO thô DB) LỚN NHẤT đã merge — đặt từ snapshot getAll (orders) */
  let _pollTick = 0;

  async function _mergeDeltaFromCloud(key, table) {
    if (!window.SB_DATA || !window.SB_DATA.getChangedSince) { return _mergeTableFromCloud(key, table); }
    let since = _cursor[key];
    if (since == null) {                               /* chưa có mốc → merge FULL 1 lần (tự đặt mốc từ snapshot) */
      await _mergeTableFromCloud(key, table);
      return;
    }
    const res = await window.SB_DATA.getChangedSince(table, since, 500);
    if (!res || !Array.isArray(res.rows)) return;      /* lỗi → giữ mốc, poll sau thử lại */
    if (!res.rows.length) {                            /* KHÔNG có gì đổi → nhích mốc, xong */
      if (res.cursor && res.cursor > since) _cursor[key] = res.cursor;
      return;
    }

    const idCol = ID_COLUMN[key] || 'id';
    const keyOf = (it) => it && (it[idCol] || it.id || it.code || it.no);
    const local = Array.isArray(_data[key]) ? _data[key] : (_load(key, []) || []);
    const idxById = new Map(local.map((it, i) => [keyOf(it), i]));
    const merged = local.slice();
    let changed = false;
    /* Cursor CHỈ nhích tới record đã ÁP; khi gặp record đang PENDING (local ghi dở) thì DỪNG
       nhích cursor (rows sort updated_at tăng dần) — nếu không .gt sẽ bỏ qua bản MỚI của máy
       khác cùng record đó ở vòng sau. Vẫn tiếp tục áp các record khác trong lô. */
    let adv = since, blocked = false;
    for (const c of res.rows) {                        /* rows đã sort updated_at TĂNG DẦN */
      const id = keyOf(c); if (id == null) continue;
      if (_isTomb(key, id)) {   /* đã xoá cục bộ → xoá lại cloud, KHÔNG hồi sinh */
        window.SB_DATA.remove(table, id, idCol).then(ok => { if (ok) _clearTomb(key, id); }).catch(() => {});
        if (!blocked && c.updated_at) adv = c.updated_at;
        continue;
      }
      if (_isPending(key, id)) { blocked = true; continue; }   /* giữ local + chặn cursor vượt qua record này */
      const at = idxById.get(id);
      if (at != null) {
        const lr = merged[at];
        const flags = {};
        for (const k of Object.keys(lr)) if (k.charAt(0) === '_') flags[k] = lr[k];   /* giữ cờ chống-lặp */
        const rec = Object.keys(flags).length ? { ...c, ...flags } : c;
        if (JSON.stringify(lr) !== JSON.stringify(rec)) { merged[at] = rec; changed = true; }
      } else {
        merged.push(c); idxById.set(id, merged.length - 1); changed = true;   /* record mới từ máy khác */
      }
      if (!blocked && c.updated_at) adv = c.updated_at;   /* chỉ nhích cursor khi CHƯA gặp pending */
    }
    if (!blocked && res.cursor && res.cursor > adv) adv = res.cursor;
    if (adv && adv > since) _cursor[key] = adv;
    if (!changed) return;
    _data[key] = merged;
    const nj = JSON.stringify(merged);
    _synced[key] = nj; _persistSyncedIds(key, merged);
    try { localStorage.setItem(PREFIX + key, nj); } catch (e) {}
    (_subs[key] || []).forEach(fn => fn(merged));
    console.log(`[STORE] Δ ${key}: +${res.rows.length} record đổi (delta, không kéo cả bảng)`);
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

    /* Snapshot cloud gần nhất (JS-shape) của 1 bảng — KHÔNG bị RAM ghi đè tại chỗ.
       Dùng để so sánh "giá trị đang lưu trên cloud" vs giá trị tính lại, tránh ghi thừa. */
    cloudSnapshot(key) {
      if (_synced[key] == null) return null;
      try { return JSON.parse(_synced[key]); } catch (e) { return null; }
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

      /* === CỘT ĐƯỢC BẢO VỆ khỏi lưu-cả-mảng (set) ===
         products.img CHỈ được sửa qua trình sửa SP / chọn ảnh (STORE.update {img}).
         Các thao tác lưu CẢ MẢNG products (đổi markup giá, nhận hàng cập nhật giá nhập…)
         KHÔNG được phép ghi đè img — nếu máy đó có img CŨ/lệch thì sẽ làm "ảnh nhảy lung
         tung" sang SP khác. Nên set() bỏ qua img: không so sánh, không gửi lên. */
      const PROTECTED = { products: ['img'] };
      const prot = PROTECTED[key] || [];
      /* Bỏ field '_' (cờ per-máy, KHÔNG bao giờ gửi cloud) + cột bảo vệ (products.img) trước khi
         SO DIFF. Nhờ vậy record chỉ đổi cờ '_' (vd _invApplied) → diff BẰNG NHAU → KHÔNG bắn
         update rỗng lên cloud (trước đây mỗi lần đánh cờ = 1 request no-op / đơn). */
      const _strip = (o) => { const c = {}; for (const k of Object.keys(o)) { if (k.charAt(0) === '_' || prot.includes(k)) continue; c[k] = o[k]; } return c; };

      /* Items mới hoặc thay đổi */
      value.forEach(item => {
        const id = keyOf(item);
        if (id == null) return;
        const old = oldMap.get(id);
        if (!old) {
          /* New item → insert (giữ nguyên cả img cho SP mới) */
          window.SB_DATA.insert(table, item)
            .catch(e => console.warn(`[STORE set→insert ${key}]`, e));
        } else {
          const oC = _strip(old);
          const iC = _strip(item);
          if (JSON.stringify(oC) !== JSON.stringify(iC)) {
            /* Changed → update; gửi bản đã strip ('_' + cột bảo vệ img) lên cloud */
            window.SB_DATA.update(table, id, iC, idCol)
              .catch(e => console.warn(`[STORE set→update ${key}]`, e));
          }
        }
      });

      /* ⛔ KHÔNG xoá-the-thiếu (delete-by-omission) nữa.
         Lý do AN TOÀN DỮ LIỆU đa người dùng: nếu mảng `value` mà caller truyền vào
         bị CŨ (thiếu record vừa được NV khác thêm qua realtime), thì việc "có trong
         baseline nhưng không có trong value" sẽ bị hiểu nhầm là XOÁ → mất đơn/KH của
         người khác, reload là biến mất. Mọi thao tác xoá THẬT đều đi qua STORE.remove()
         (gọi SB_DATA.remove trực tiếp), nên set() chỉ cần insert + update.
         → set() giờ KHÔNG BAO GIỜ tự xoá record. */
      const omitted = oldArr.filter(item => {
        const id = keyOf(item);
        return id != null && !newMap.has(id);
      });
      if (omitted.length) {
        console.warn(`[STORE set ${key}] BỎ QUA ${omitted.length} record vắng mặt (không auto-xoá — dùng STORE.remove nếu muốn xoá thật):`,
          omitted.map(keyOf));
      }
      /* ⚠️ CHỐNG MẤT DỮ LIỆU: baseline CHỈ gồm record ĐÃ TỪNG CÓ (đã sync trước) + record
         cloud giữ lại (omitted). Record MỚI (chưa từng có, insert vừa fire ASYNC) KHÔNG cho
         vào baseline — nếu insert lỗi/chưa xong mà reload, merge sẽ coi là "mới chưa sync" →
         tự đẩy lại + GIỮ, thay vì tưởng "đã xoá trên cloud" rồi XOÁ MẤT. Record cũ (đã ở
         cloud) vẫn trong baseline nên không bị đẩy lặp. */
      const confirmedExisting = value.filter(it => oldMap.has(keyOf(it)));
      const baseline = omitted.length ? confirmedExisting.concat(omitted) : confirmedExisting;
      _synced[key] = JSON.stringify(baseline);
      _persistSyncedIds(key, baseline);
    },

    /* Thêm item vào mảng */
    add(key, item, fallback) {
      const arr = this.get(key, fallback);
      arr.unshift(item);
      _save(key);
      /* Push to Supabase */
      if (isSupabaseMode() && TABLE_MAP[key]) {
        const idCol = ID_COLUMN[key] || 'id';
        _markPending(key, item[idCol]);
        window.SB_DATA.insert(TABLE_MAP[key], item)
          .then(saved => {
            /* Insert đổi MÃ (vd đơn trùng mã → cấp mã mới) → cập nhật lại cache + UI */
            if (saved && saved[idCol] && item[idCol] !== saved[idCol]) {
              const old = item[idCol]; item[idCol] = saved[idCol];
              _clearPending(key, old); _markPending(key, saved[idCol]); _clearPending(key, saved[idCol]);
              _save(key);
              if (key === 'orders') window.toast?.(`Mã đơn ${old} trùng — đã tự đổi thành ${saved[idCol]} ✓`, 'info');
              else if (key === 'customers') window.toast?.(`Mã KH ${old} trùng — đã tự đổi thành ${saved[idCol]} ✓ (không mất khách)`, 'success');
            } else if (saved) { _clearPending(key, item[idCol]); }
            /* saved == null = INSERT HỎNG → GIỮ pending: merge (neverSynced) sẽ chèn LẠI + giữ
               record trên máy, KHÔNG để mất. Trước đây xoá pending ở đây kể cả khi hỏng. */
            /* ⚠️ CHỐNG MẤT DỮ LIỆU: CHỈ ghi baseline khi insert THÀNH CÔNG (saved != null =
               record đã CHẮC CHẮN ở cloud). Trước đây ghi baseline ĐỒNG BỘ ngay lúc add →
               nếu insert lỗi/chưa kịp xong mà user reload → merge tưởng "đã sync rồi bị xoá
               trên cloud" → XOÁ MẤT record. Nay: chưa vào baseline = merge coi "mới chưa sync"
               → tự ĐẨY LẠI lên cloud + GIỮ trên máy (self-heal, không mất). */
            if (saved && TABLE_MAP[key] && Array.isArray(_data[key])) {
              _synced[key] = JSON.stringify(_data[key]); _persistSyncedIds(key, _data[key]);
            }
          })
          .catch(e => { console.warn(`[STORE add ${key} → SB]`, e); });   /* GIỮ pending khi lỗi → merge tự đẩy lại */
      }
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
          _markPending(key, identifier);
          window.SB_DATA.update(TABLE_MAP[key], identifier, patch, idCol)
            .then(saved => {
              /* ⚠️ SB_DATA.update KHÔNG reject — lỗi (RLS/mạng/cột NOT NULL) trả về NULL.
                 CHỈ coi là XONG khi saved != null (cloud thật sự đã ghi). Nếu null = GHI HỎNG →
                 GIỮ pending: merge sẽ đẩy LẠI bản local lên cloud (không revert về giá trị cũ),
                 tránh "sửa xong, F5 là mất". */
              if (saved == null) return;
              _clearPending(key, identifier);
              if (TABLE_MAP[key] && Array.isArray(_data[key])) { _synced[key] = JSON.stringify(_data[key]); _persistSyncedIds(key, _data[key]); }
            })
            .catch(e => { console.warn(`[STORE update ${key} → SB]`, e); });
        }
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
        _addTomb(key, identifier);   /* BIA MỘ: chặn merge/realtime hồi sinh + đánh dấu cần xoá cloud */
        window.SB_DATA.remove(TABLE_MAP[key], identifier, idCol)
          .then(ok => { if (ok) _clearTomb(key, identifier); /* hỏng (false) → GIỮ bia mộ, merge/poll sẽ xoá lại */ })
          .catch(e => console.warn(`[STORE remove ${key} → SB]`, e));
      }
      if (TABLE_MAP[key] && Array.isArray(_data[key])) _synced[key] = JSON.stringify(_data[key]); if (TABLE_MAP[key] && Array.isArray(_data[key])) _persistSyncedIds(key, _data[key]);
    },

    subscribe(key, fn) {
      (_subs[key] = _subs[key] || []).push(fn);
    },

    /* Read-Modify-Write cho KV blob nhiều người sửa (priceTiers, mktPrices…): mutate(arr)→arr.
       Local đổi NGAY; cloud ghi gộp lên bản MỚI NHẤT (debounce) → không đè phần của NV khác.
       ⚠ mutate phải IDEMPOTENT (áp 2 lần cùng kết quả): set/xoá theo id, đừng dùng random/push-không-guard. */
    rmwKv(key, mutate) {
      if (!(key in _data)) _data[key] = _load(key, []);
      try { _data[key] = mutate(_data[key]) || _data[key]; } catch (e) { console.warn('[STORE rmwKv]', e); }
      _save(key);   /* optimistic local + notify subscriber (KHÔNG push cloud ở đây) */
      (_rmwQueue[key] = _rmwQueue[key] || []).push(mutate);
      clearTimeout(_rmwTimer[key]);
      _rmwTimer[key] = setTimeout(() => _flushRmw(key), 1200);
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

    /* Mã KH kế tiếp AN TOÀN (chống trùng tận gốc): lấy MAX của cả CLOUD lẫn LOCAL rồi +1.
       Vì nextId() chỉ nhìn local → máy tụt lại (chưa sync / lúc DB nghẽn) cấp trùng mã KH đã có
       → nuốt/đè khách (vụ KH001). Hàm này hỏi cloud (nextCloudCustCode) nên mã LUÔN vượt cloud.
       - offset: cấp nhiều mã liên tiếp trong 1 lô import (0,1,2...) mà chỉ hỏi cloud 1 lần ở offset 0.
       - Offline / lỗi cloud → fallback local nextId (v353 insert-retry + v355 guard vẫn đỡ hậu quả). */
    async nextCustCodeSafe(offset) {
      offset = offset || 0;
      const local = this.get('customers', []) || [];
      let mx = 0;
      for (const c of local) { const n = parseInt(String(c.id || c.code || '').replace(/\D/g, ''), 10); if (n > mx) mx = n; }
      if (isSupabaseMode() && window.SB_DATA && window.SB_DATA.nextCloudCustCode) {
        try {
          const cc = await window.SB_DATA.nextCloudCustCode();   /* = cloudMax + 1 */
          const m = cc && String(cc).match(/(\d+)/);
          if (m) mx = Math.max(mx, parseInt(m[1], 10) - 1);      /* -1 → cloudMax thực */
        } catch (e) {}
      }
      let n = mx + 1 + offset;
      const has = id => local.some(x => (x.id || x.code) === id);
      while (has('KH' + String(n).padStart(3, '0'))) n++;        /* né mã đã có cục bộ */
      return 'KH' + String(n).padStart(3, '0');
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
  /* 180s: realtime (delta) đã cập nhật tức thì; poll chỉ là lưới tự-sửa-lệch.
     Mỗi tick = SELECT * mọi bảng (orders kèm items JSONB nặng) × mỗi tab đang mở
     → để 60s gây IO đọc dồn liên tục, dễ cháy Disk IO budget. 180s giảm ~3× tải. */
  const DEFAULT_POLL_SEC = 180;
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
      _pollTick++;
      /* Bảng NẶNG (orders): dùng DELTA (chỉ record đổi) để khỏi kéo ~5.8MB/lần.
         Cứ mỗi 10 vòng (~30') mới merge FULL 1 lần để đối soát xoá + đẩy local-only + làm tươi mốc. */
      const fullReconcile = (_pollTick % 10 === 0);
      _preloaded.forEach(key => {
        const table = TABLE_MAP[key]; if (!table) return;
        if (key === 'orders' && window.SB_DATA && window.SB_DATA.getChangedSince && !fullReconcile) {
          _mergeDeltaFromCloud(key, table).catch(() => {});
        } else {
          /* Merge FULL + self-heal (đẩy local-only lên + pull cloud về); orders TỰ đặt mốc delta bên trong */
          _mergeTableFromCloud(key, table).catch(() => {});
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

  /* ĐỒNG BỘ LẠI 1 bảng TỪ CLOUD (sửa máy DESYNC: local ít hơn cloud, hoặc "xoá xong tự về").
     An toàn: CHỈ thay local KHI cloud phản hồi OK; đặt baseline = cloud (KHÔNG đẩy local-only lên);
     xoá pending/tombstone/cursor của bảng → hết vòng lặp đẩy-ngược. */
  window.STORE.resyncFromCloud = async function (key) {
    key = key || 'orders';
    const table = TABLE_MAP[key];
    if (!isSupabaseMode() || !table) { window.toast?.('Chưa bật cloud', 'warn'); return; }
    window.toast?.('Đang kéo lại ' + key + ' từ cloud…', 'info');
    const cloud = await window.SB_DATA.getAll(table);
    if (!Array.isArray(cloud)) { window.toast?.('Cloud chưa phản hồi — thử lại sau', 'warn'); return; }
    _data[key] = cloud;
    try { localStorage.setItem(PREFIX + key, JSON.stringify(cloud)); }
    catch (e) { window.toast?.('⚠ Bộ nhớ trình duyệt đầy — phiên này hiện đúng nhưng tải lại có thể chưa lưu hết', 'warn'); }
    _synced[key] = JSON.stringify(cloud); _persistSyncedIds(key, cloud);
    try { localStorage.removeItem(PENDING_PREFIX + key); } catch (e) {}
    _pendingCache[key] = new Set();
    try { localStorage.removeItem(TOMB_PREFIX + key); } catch (e) {}
    _tombCache[key] = new Set();
    delete _cursor[key];
    _preloaded.add(key); _preloadDone.add(key);
    (_subs[key] || []).forEach(fn => { try { fn(cloud); } catch (e) {} });
    window.toast?.('✓ Đã đồng bộ lại ' + cloud.length + ' ' + key + ' từ cloud', 'success');
    return cloud.length;
  };
  window.resyncOrders = () => window.STORE.resyncFromCloud('orders');

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
      /* PERF: throttle 20s (cũ 3s). Mỗi lần focus = re-pull MỌI bảng (orders nặng) song song
         → đổi tab liên tục là kéo lại cả ngàn dòng mỗi 3s, đơ app. Realtime websocket vẫn
         đẩy delta tức thì nên không cần kéo full mỗi lần focus; 20s là lưới an toàn đủ tươi. */
      if (now - _lastForeSync < 20000) return;
      _lastForeSync = now;
      _preloaded.forEach(key => {
        if (TABLE_MAP[key]) _mergeTableFromCloud(key, TABLE_MAP[key]).catch(() => {});
      });
    };
    document.addEventListener('visibilitychange', _foreSync);
    window.addEventListener('focus', _foreSync);
    window.addEventListener('online', _foreSync);

    /* === FLUSH edit đang chờ (rmwKv) NGAY khi rời trang/ẩn tab ===
       Phòng trường hợp NV sửa giá xong ĐÓNG/RELOAD trong <1.2s (trước khi debounce flush) →
       edit chưa kịp lên cloud → tải lại bị mất. Ẩn tab / đóng → đẩy ngay các key còn pending. */
    const _flushAllRmw = () => { Object.keys(_rmwQueue).forEach(k => { if (_rmwQueue[k] && _rmwQueue[k].length) { try { _flushRmw(k); } catch (e) {} } }); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) _flushAllRmw(); });
    window.addEventListener('pagehide', _flushAllRmw);
    window.addEventListener('beforeunload', _flushAllRmw);
  }
})();
