/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Supabase Client Wrapper
   Tạo client + helper functions cho data + auth
   Load sau supabase-config.js
   ========================================================= */
(function () {
  if (!window.SUPABASE_CONFIG?.isReady()) {
    console.log('[Supabase] Skip init - chưa cấu hình');
    return;
  }

  /* Load Supabase JS SDK từ CDN nếu chưa có */
  if (typeof window.supabase === 'undefined') {
    console.warn('[Supabase] SDK chưa load - thêm <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> vào HTML');
    return;
  }

  const { createClient } = window.supabase;
  const client = createClient(
    window.SUPABASE_CONFIG.url,
    window.SUPABASE_CONFIG.anonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  );
  window.SB = client;
  console.log('[Supabase] Client ready');

  /* === Mapping field NSTT (camelCase JS) ↔ Postgres (snake_case) ===
     CHỈ map những column NSTT DB thật sự có, theo schema supabase-nstt/01-schema-nstt.sql.
     `to`   = JS camelCase → DB snake_case (khi insert/update)
     `from` = DB snake_case → JS camelCase (khi đọc về app) */
  const FIELD_MAP = {
    customers: {
      to:   { group:'group_name', staffOwner:'staff_owner', lastContact:'last_contact', lastOrder:'last_order',
              orders:'orders_count', debtOverdue:'debt_overdue', orderFreq:'order_freq', mainCats:'main_cats' },
      from: { group_name:'group', staff_owner:'staffOwner', last_contact:'lastContact', last_order:'lastOrder',
              orders_count:'orders', debt_overdue:'debtOverdue', order_freq:'orderFreq', main_cats:'mainCats' },
    },
    products: {
      to:   { priceHistory:'price_history', stockThreshold:'stock_threshold', supplierId:'supplier_id' },
      from: { price_history:'priceHistory', stock_threshold:'stockThreshold', supplier_id:'supplierId' },
    },
    orders: {
      /* DB columns: code, order_date, customer_id, cust_name, service_type, transport_mode,
         pickup_addr, drop_addr, goods, qty, weight, unit, items, freight, cod, pay_by,
         shipper_id, driver_name, vehicle, status, return_reason, staff, delivered_at,
         delivery_time, taken_by, notes */
      to:   { date:'order_date', custName:'cust_name', cust:'customer_id', serviceType:'service_type',
              transportMode:'transport_mode', pickup:'pickup_addr', drop:'drop_addr', payBy:'pay_by',
              driverName:'driver_name', returnReason:'return_reason', deliveryTime:'delivery_time',
              takenBy:'taken_by', deliveredAt:'delivered_at', shipperId:'shipper_id',
              note:'notes',
              /* Quy trình Kho (SQL 19): ngày/ca/giờ giao + trạng thái kho + báo thiếu */
              createdAt:'created_at', deliverDate:'deliver_date', shipShift:'ship_shift',
              shipTime:'ship_time', whStatus:'wh_status', shortages:'shortages',
              /* drop field KHÔNG có cột trong DB orders */
              custId: null, custPhone: null, source: null,
              /* drop legacy VTY fields */
              driver: null, external: null, partner: null },
      from: { order_date:'date', cust_name:'custName', customer_id:'cust', service_type:'serviceType',
              transport_mode:'transportMode', pickup_addr:'pickup', drop_addr:'drop', pay_by:'payBy',
              driver_name:'driverName', return_reason:'returnReason', delivery_time:'deliveryTime',
              taken_by:'takenBy', delivered_at:'deliveredAt', shipper_id:'shipperId',
              notes:'note', created_at:'createdAt', deliver_date:'deliverDate',
              ship_shift:'shipShift', ship_time:'shipTime', wh_status:'whStatus', shortages:'shortages' },
    },
    invoices: {
      to:   { date:'invoice_date', desc:'description', vatRate:'vat_rate', paidDate:'paid_date',
              cqtCode:'cqt_code', cqtSync:'cqt_sync', issuedAt:'issued_at', relatedOrder:'related_order',
              customerId:'customer_id' },
      from: { invoice_date:'date', description:'desc', vat_rate:'vatRate', paid_date:'paidDate',
              cqt_code:'cqtCode', cqt_sync:'cqtSync', issued_at:'issuedAt', related_order:'relatedOrder',
              customer_id:'customerId' },
    },
    suppliers: {
      /* DB columns: id, code, name, contact_person, phone, email, address, tax,
         supply_categories(TEXT[]), payment_terms, balance, active, notes
         JS dùng: contact, category, paymentTerm, debt, totalSpend, rating, note */
      to:   { contact:'contact_person', category:'supply_categories',
              paymentTerm:'payment_terms', debt:'balance', note:'notes',
              /* DB đã có cột rating + total_spend → ghi thẳng (trước đây drop nhầm) */
              totalSpend: 'total_spend',
              /* alias mới nếu code dùng camelCase */
              contactPerson:'contact_person', supplyCategories:'supply_categories',
              paymentTerms:'payment_terms' },
      from: { contact_person:'contact', supply_categories:'category',
              payment_terms:'paymentTerm', balance:'debt', notes:'note',
              total_spend:'totalSpend' },
    },
    shippers: {
      to:   { ordersToday:'orders_today', kpiTotal:'kpi_total',
              /* DB không có các field này → drop */
              status: null, joinDate: null, telegramChatId: null,
              canDrive: null, trips30d: null, revenue30d: null,
              rating: null, recentTrips: null, address: null,
              code: null /* shippers DB không có code, dùng id */ },
      from: { orders_today:'ordersToday', kpi_total:'kpiTotal' },
    },
    leads: {
      /* DB columns: id, name, phone, email, address, source, stage, est_value,
         owner, notes, last_contact, converted_to, lost_reason
         JS dùng: contact, interest, note, lastTouch, createdAt, estValue, value */
      to:   { note:'notes', estValue:'est_value', value:'est_value',
              lastTouch:'last_contact', lastContact:'last_contact',
              convertedTo:'converted_to', lostReason:'lost_reason',
              /* drop field không có trong DB */
              contact: null, interest: null, createdAt: null },
      from: { notes:'note', est_value:'estValue',
              last_contact:'lastTouch',
              converted_to:'convertedTo', lost_reason:'lostReason' },
    },
    staff: {
      /* DB staff: cột là `perms`, `hire_date`; KHÔNG có code/avatar/address/salaryConfig.
         Map đầy đủ để THÊM/SỬA NV lưu trọn quyền + ngày vào lên cloud (không chỉ local). */
      to:   { hireDate:'hire_date', joinDate:'hire_date', userId:'user_id',
              permissions:'perms', code:null, avatar:null, address:null, salaryConfig:null },
      from: { hire_date:'joinDate', user_id:'userId', perms:'permissions' },
    },
    paymentAccounts: {
      to:   {},
      from: {},
    },
    cashEntries: {
      to:   { date:'entry_date', type:'entry_type', desc:'description',
              relatedOrder:'related_order', relatedInvoice:'related_invoice' },
      from: { entry_date:'date', entry_type:'type', description:'desc',
              related_order:'relatedOrder', related_invoice:'relatedInvoice' },
    },
    /* === 6 bảng phụ trợ (đợt 2) === */
    inventory: {
      to:   { productId:'product_id', minStock:'min_stock', maxStock:'max_stock',
              avgDaily:'avg_daily', lastIn:'last_in', lastOut:'last_out' },
      from: { product_id:'productId', min_stock:'minStock', max_stock:'maxStock',
              avg_daily:'avgDaily', last_in:'lastIn', last_out:'lastOut' },
    },
    purchases: {
      to:   { supplierId:'supplier_id' },
      from: { supplier_id:'supplierId' },
    },
    quotes: {
      to:   { custId:'cust_id', custName:'cust_name', validUntil:'valid_until',
              staffOwner:'staff_owner', convertedOrderId:'converted_order_id' },
      from: { cust_id:'custId', cust_name:'custName', valid_until:'validUntil',
              staff_owner:'staffOwner', converted_order_id:'convertedOrderId' },
    },
    recurring_orders: {
      to:   { custId:'cust_id', custName:'cust_name', daysOfWeek:'days_of_week',
              deliverAt:'deliver_at', nextRun:'next_run', lastRun:'last_run',
              staffOwner:'staff_owner', createdAt:'created_at_vn' },
      from: { cust_id:'custId', cust_name:'custName', days_of_week:'daysOfWeek',
              deliver_at:'deliverAt', next_run:'nextRun', last_run:'lastRun',
              staff_owner:'staffOwner', created_at_vn:'createdAt' },
    },
    returns: {
      to:   { orderCode:'order_code', custName:'cust_name',
              refundTotal:'refund_total', podPhoto:'pod_photo', handledBy:'handled_by' },
      from: { order_code:'orderCode', cust_name:'custName',
              refund_total:'refundTotal', pod_photo:'podPhoto', handled_by:'handledBy' },
    },
    adspend: {
      to:   {}, /* tất cả field đã trùng tên DB */
      from: {},
    },
  };

  /* Convert ISO timestamp → format "dd/mm/yyyy hh:mm" hoặc "dd/mm/yyyy" cho display.
     Postgres timestamps trở về dạng "2026-05-18T08:29:00+00:00",
     app code (vd orders.js render) expect "18/05/2026 08:29". */
  function isoToVN(s, withTime) {
    if (!s) return s;
    if (typeof s !== 'string') return s;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!m) return s;
    const d = `${m[3]}/${m[2]}/${m[1]}`;
    return withTime && m[4] ? `${d} ${m[4]}:${m[5]}` : d;
  }
  /* Convert VN date → ISO khi save. "18/05/2026 08:29" → "2026-05-18T08:29:00"
     Giá trị KHÔNG phải ngày (vd "—", "", "N/A") → null (cột date nullable nhận được). */
  function vnToIso(s, withTime) {
    if (!s) return null;                 /* '', null, undefined → null */
    if (typeof s !== 'string') return s; /* đã là Date/ISO */
    /* Nếu đã là ISO (2026-05-18...) → giữ nguyên */
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
    const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{1,2}))?/);
    if (!m) return null;                 /* "—", "N/A"... → null (không gửi rác xuống cột date) */
    const yr = m[3].length === 2 ? '20' + m[3] : m[3];
    const d = `${yr}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    return withTime && m[4] ? `${d}T${m[4].padStart(2,'0')}:${(m[5]||'00').padStart(2,'0')}:00` : d;
  }
  /* Fields cần convert ISO ↔ VN per table */
  const DATE_FIELDS = {
    orders:    { date: true, deliveredAt: true },                   // true = withTime
    invoices:  { date: false, paidDate: false },                    // false = date only
    customers: { created: false, lastOrder: false, lastContact: false },
    cashEntries: { date: false },
    leads:     { lastTouch: false, createdAt: false, lastContact: false },
    staff:     { hireDate: false, joinDate: false },
  };

  /* Fields PHẢI là số nguyên ở cloud — strip ký tự lạ (vd kpi "94%" → 94, salary "12.000.000" → 12000000).
     Tránh lỗi "invalid input syntax for type integer". '' / null → null. */
  const NUM_FIELDS = {
    staff: { kpi: true, salary: true },
  };

  /* Cột UNIQUE: chuỗi rỗng '' → NULL trước khi gửi.
     Postgres cho phép NHIỀU NULL nhưng KHÔNG cho nhiều '' (vd nhiều NV chưa có email
     → lỗi 'duplicate key value violates unique constraint staff_email_key'). */
  const NULL_IF_EMPTY = {
    staff: { email: true },
  };

  /* Parse tên cột lạ từ lỗi PostgREST:
     "Could not find the 'X' column of 'table' in the schema cache" */
  function parseUnknownColumn(msg) {
    if (!msg) return null;
    const m = String(msg).match(/Could not find the '([^']+)' column/);
    return m ? m[1] : null;
  }

  /* Caller (store.js) truyền TÊN BẢNG DB (cash_entries), nhưng FIELD_MAP/DATE_FIELDS
     key theo TÊN JS (cashEntries). Resolver snake_case → camelCase để tra đúng. */
  function fmKey(table) {
    if (FIELD_MAP[table] || DATE_FIELDS[table]) return table;
    const camel = String(table).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return (FIELD_MAP[camel] || DATE_FIELDS[camel]) ? camel : table;
  }

  function mapTo(table, obj) {
    if (!obj) return obj;
    const key = fmKey(table);
    const m = FIELD_MAP[key]?.to || {};
    const df = DATE_FIELDS[key] || {};
    const nf = NUM_FIELDS[key] || {};
    const ne = NULL_IF_EMPTY[key] || {};
    const result = {};
    for (const k of Object.keys(obj)) {
      /* Bỏ field nội bộ/transient (bắt đầu '_') — KHÔNG phải cột DB.
         VD: _prefRecorded, _source, _cashApplied, _payrollId, _adspendId */
      if (k.charAt(0) === '_') continue;
      const newKey = m[k] || k;
      if (newKey === null) continue;
      let v = obj[k];
      /* Convert VN date → ISO before insert if this JS field is a date */
      if (df[k] !== undefined) v = vnToIso(v, df[k]);
      /* Ép số nguyên cho cột số (kpi/salary) — bỏ %, dấu chấm phân cách... */
      if (nf[k]) {
        if (v === '' || v == null) v = null;
        else { const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10); v = Number.isNaN(n) ? null : n; }
      }
      /* Cột UNIQUE: '' → NULL (tránh đụng ràng buộc unique khi để trống) */
      if (ne[k] && (v === '' || (typeof v === 'string' && v.trim() === ''))) v = null;
      result[newKey] = v;
    }
    /* cash_entries.entry_date NOT NULL — phiếu quỹ tự tạo (hook đơn/ads/lương) thiếu ngày
       → mặc định HÔM NAY để không bị chặn khi sync. Phiếu có ngày hợp lệ KHÔNG bị đụng. */
    if (key === 'cashEntries' && !result.entry_date) {
      result.entry_date = new Date().toISOString().slice(0, 10);
    }
    return result;
  }
  function mapFrom(table, obj) {
    if (!obj) return obj;
    const key = fmKey(table);
    const m = FIELD_MAP[key]?.from || {};
    const df = DATE_FIELDS[key] || {};
    /* Tên field JS đích của các cột chuẩn (vd contact_person→contact).
       Nếu DB có cột RÁC trùng tên đích (vd cột 'contact' null song song
       'contact_person') thì cột chuẩn PHẢI thắng — nếu không, cột rác null
       đè lên giá trị thật → reload mất dữ liệu vừa sửa. */
    const mappedTargets = new Set(Object.values(m).filter(Boolean));
    const result = {};
    /* Lượt 1: cột thô / không map. Bỏ cột trùng tên với 1 đích đã map (để lượt 2 ghi). */
    for (const k of Object.keys(obj)) {
      if (m[k] !== undefined) continue;          /* xử lý ở lượt 2 */
      if (mappedTargets.has(k)) continue;        /* cột rác trùng đích → bỏ, cột chuẩn thắng */
      let v = obj[k];
      if (df[k] !== undefined) v = isoToVN(v, df[k]);
      result[k] = v;
    }
    /* Lượt 2: cột đã map (chuẩn) — ghi sau cùng nên luôn thắng cột rác. */
    for (const k of Object.keys(obj)) {
      const newKey = m[k];
      if (newKey === undefined) continue;
      if (newKey === null) continue;
      let v = obj[k];
      if (df[newKey] !== undefined) v = isoToVN(v, df[newKey]);
      result[newKey] = v;
    }
    return result;
  }

  /* === Supabase data API === */
  window.SB_DATA = {
    /* Lấy tất cả records của 1 bảng */
    async getAll(table) {
      const { data, error } = await client.from(table).select('*').order('created_at', { ascending: false });
      if (error) {
        console.error('[SB getAll]', table, error);
        window.toast?.('⚠ Load ' + table + ' lỗi cloud: ' + (error.message||'unknown'), 'warn');
        return [];
      }
      return data.map(r => mapFrom(table, r));
    },

    /* Insert 1 record — auto-strip cột lạ + retry (chống schema mismatch mọi bảng) */
    async insert(table, record) {
      const mapped = mapTo(table, record);
      for (let attempt = 0; attempt < 6; attempt++) {
        const { data, error } = await client.from(table).insert(mapped).select().single();
        if (!error) return mapFrom(table, data);
        const badCol = parseUnknownColumn(error.message);
        if (badCol && Object.prototype.hasOwnProperty.call(mapped, badCol)) {
          delete mapped[badCol];
          console.warn(`[SB insert] ${table}: bỏ cột lạ '${badCol}' rồi thử lại`);
          continue;
        }
        console.error('[SB insert]', table, error);
        window.toast?.('⚠ Lưu cloud lỗi ' + table + ': ' + (error.message||'unknown'), 'warn');
        return null;
      }
      return null;
    },

    /* Update theo id — auto-strip cột lạ + retry */
    async update(table, id, patch, idColumn = 'id') {
      const mapped = mapTo(table, patch);
      for (let attempt = 0; attempt < 6; attempt++) {
        const { data, error } = await client.from(table).update(mapped).eq(idColumn, id).select().single();
        if (!error) return mapFrom(table, data);
        const badCol = parseUnknownColumn(error.message);
        if (badCol && Object.prototype.hasOwnProperty.call(mapped, badCol)) {
          delete mapped[badCol];
          console.warn(`[SB update] ${table}: bỏ cột lạ '${badCol}' rồi thử lại`);
          continue;
        }
        console.error('[SB update]', table, error);
        window.toast?.('⚠ Update cloud lỗi ' + table + ': ' + (error.message||'unknown'), 'warn');
        return null;
      }
      return null;
    },

    /* Xóa theo id */
    async remove(table, id, idColumn = 'id') {
      const { error } = await client.from(table).delete().eq(idColumn, id);
      if (error) {
        console.error('[SB remove]', table, error);
        window.toast?.('⚠ Xóa cloud lỗi ' + table + ': ' + (error.message||'unknown'), 'warn');
        return false;
      }
      return true;
    },

    /* Subscribe realtime changes */
    subscribe(table, callback) {
      return client.channel('realtime-' + table)
        .on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
          callback(payload);
        }).subscribe();
    },

    /* Get master data (column trong DB là `items`, không phải `data`) */
    async getMasterData(key) {
      const { data, error } = await client.from('master_data').select('items').eq('key', key).single();
      if (error || !data) return null;
      return data.items;
    },
    async setMasterData(key, value) {
      const { error } = await client.from('master_data').upsert({ key, items: value, updated_at: new Date().toISOString() });
      return !error;
    },

    /* Get company info */
    async getCompanyInfo() {
      const { data, error } = await client.from('company_info').select('*').eq('id', 1).single();
      if (error) return null;
      return data;
    },
    async setCompanyInfo(info) {
      const { error } = await client.from('company_info').upsert({ id: 1, ...info, updated_at: new Date().toISOString() });
      return !error;
    },

    /* === Generic kv_store — cho 9 keys business-critical ===
       timesheet, payrollExtra, audit_log, inv_movements, snapshots,
       budget_2026, loyalty_rules, marketing_tpls, cust_prefs */
    async getKv(key) {
      const { data, error } = await client.from('kv_store').select('value').eq('key', key).single();
      if (error || !data) return null;
      return data.value;
    },
    async setKv(key, value) {
      const updated_by = (window.CURRENT_USER || {}).name || 'system';
      const { error } = await client.from('kv_store').upsert({
        key, value, updated_by,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        console.warn('[SB setKv]', key, error.message);
        window.toast?.('⚠ Sync ' + key + ' lỗi: ' + error.message, 'warn');
      }
      return !error;
    },
    async deleteKv(key) {
      const { error } = await client.from('kv_store').delete().eq('key', key);
      if (error) { console.warn('[SB deleteKv]', key, error.message); return false; }
      return true;
    },
    /* Xóa TẤT CẢ rows trong 1 bảng (1 API call) — filter idCol IS NOT NULL = mọi row */
    async clearTable(table, idColumn = 'id') {
      const { error } = await client.from(table).delete().not(idColumn, 'is', null);
      if (error) { console.warn('[SB clearTable]', table, error.message); return false; }
      return true;
    },

    /* === Integrations (Telegram bot, Gmail, AI keys, Zalo OA...) ===
       Schema: integrations(key TEXT PK, enabled BOOL, config JSONB, updated_at)
       Helper được STORE.get('int_*')/STORE.set('int_*') gọi để sync cloud.
       Key trong DB là dạng "telegram"/"ai-engine" (bỏ prefix "int_"). */
    async getIntegration(key) {
      const { data, error } = await client.from('integrations').select('config, enabled').eq('key', key).single();
      if (error || !data) return null;
      /* Merge enabled vào config để app dùng 1 object thống nhất */
      return { ...(data.config || {}), enabled: data.enabled };
    },
    async setIntegration(key, cfg) {
      const enabled = !!cfg.enabled;
      /* Tách enabled ra column riêng, phần còn lại lưu JSON config */
      const config = { ...cfg };
      delete config.enabled;
      const { error } = await client.from('integrations').upsert({
        key, enabled, config,
        updated_at: new Date().toISOString(),
      });
      if (error) console.warn('[SB setIntegration]', key, error.message);
      return !error;
    },
  };

  /* === Supabase Auth API === */
  window.SB_AUTH = {
    async signUp(email, password, metadata = {}) {
      return await client.auth.signUp({ email, password, options: { data: metadata } });
    },
    async signIn(email, password) {
      return await client.auth.signInWithPassword({ email, password });
    },
    async signOut() {
      return await client.auth.signOut();
    },
    async getSession() {
      const { data } = await client.auth.getSession();
      return data.session;
    },
    async getUser() {
      const { data } = await client.auth.getUser();
      return data.user;
    },
    async resetPassword(email) {
      return await client.auth.resetPasswordForEmail(email);
    },
    onAuthChange(callback) {
      return client.auth.onAuthStateChange(callback);
    },
  };
})();
