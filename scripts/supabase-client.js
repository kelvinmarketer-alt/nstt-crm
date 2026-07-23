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
      /* priceTier: KHÔNG có cột trong DB → map null để KHÔNG vỡ sync KH.
         Nhóm giá của KH lưu ở KV 'custPriceTiers' (sync qua master_data, roaming đa máy). */
      to:   { group:'group_name', staffOwner:'staff_owner', lastContact:'last_contact', lastOrder:'last_order',
              orders:'orders_count', debtOverdue:'debt_overdue', orderFreq:'order_freq', mainCats:'main_cats',
              priceTier: null,
              /* field CLIENT-ONLY không có cột DB → drop (tránh retry-strip tốn request mỗi lần lưu KH).
                 ordersList = danh sách đơn (tính từ orders); attachments = file base64 (nặng, giữ local);
                 fb = link Facebook (bảng chưa chạy migration 22-add-customer-fb → chưa có cột). */
              ordersList: null, attachments: null, fb: null },
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
              /* nhóm giá đơn — metadata local (giá đã baked vào items[].price) → KHÔNG cột DB */
              priceTier: null, priceTierName: null,
              /* đơn giao bù (trả hàng) — metadata local, KHÔNG cột DB */
              isReplacement: null, replacementFor: null,
              /* metadata local KHÔNG có cột DB → drop (nếu gửi lên = 400 "column not found" = báo đỏ lỗi cloud) */
              transitAt: null, transitBy: null, pickupAt: null,
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
              primaryPlate:'vehicle',   /* biển số → cột `vehicle` (trước đây gửi thô → retry-strip mỗi lần lưu) */
              /* DB không có các field này → drop */
              email: null,
              status: null, joinDate: null, telegramChatId: null,
              canDrive: null, trips30d: null, revenue30d: null,
              rating: null, recentTrips: null, address: null,
              code: null /* shippers DB không có code, dùng id */ },
      from: { orders_today:'ordersToday', kpi_total:'kpiTotal', vehicle:'primaryPlate' },
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
      /* whReceivedAt/whBy = metadata KHO nhận (bước 2) — KHÔNG có cột DB → drop (gửi lên = 400 báo đỏ lỗi cloud).
         Trạng thái (ordered→wh_received→received) lưu ở cột `status`; SL nhận/lỗi/dư lưu trong `items` (jsonb) → vẫn bền. */
      to:   { supplierId:'supplier_id', whReceivedAt: null, whBy: null, whStatus: null },
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
      /* DB returns CHỈ có: id, order_code, cust_name, date, reason, items(jsonb), refund_total,
         status, pod_photo, handled_by, note, created_at, updated_at.
         App gắn thêm nhiều field tóm tắt/hằng số ở CẤP GỐC (caseType, disposition, fault,
         refundMode, supplierId...) → KHÔNG có cột → insert/update 400 = phiếu trả KHÔNG lên cloud.
         → DROP hết: mọi dữ liệu quan trọng (điều kiện từng SP, NCC, buyTotal đòi nợ) đã nằm
         TRONG `items` (jsonb, bền); disposition/fault chỉ là nhãn suy ra được từ items[].cond. */
      to:   { orderCode:'order_code', custName:'cust_name',
              refundTotal:'refund_total', podPhoto:'pod_photo', handledBy:'handled_by',
              custId: null, item: null, qtyReturn: null, caseType: null, resolution: null,
              disposition: null, fault: null, refundMode: null, supplierId: null,
              supplierName: null, supClaimAmount: null, fromShip: null, reportedAt: null },
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

  /* Lỗi TẠM THỜI (mạng/timeout/CORS chớp nhoáng) — store.js có hàng đợi pending tự đẩy lại ở vòng
     poll sau → KHÔNG dọa nhân viên bằng toast đỏ "lỗi cloud" (họ thấy đỏ nhưng vào lại là hết).
     CHỈ lỗi DB THẬT (có error.code: 23xxx not-null/unique, 42xxx, PGRSTxxx) mới đáng báo. */
  function _isTransientErr(error) {
    if (!error) return true;
    if (error.code) return false;
    return /fetch|network|timeout|failed to fetch|load failed|econn|etimedout|aborted/i.test(error.message || '');
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
      /* FIX: dùng hasOwnProperty — KHÔNG dùng `m[k] || k` vì khi m[k]===null
         thì `null || k` ra k (null là falsy) → field map-null KHÔNG bị bỏ,
         lọt lên cloud thành cột lạ → vỡ insert. Map null = CHỦ ĐÍCH bỏ field. */
      const newKey = Object.prototype.hasOwnProperty.call(m, k) ? m[k] : k;
      if (newKey === null) continue;   /* field được map null → bỏ hẳn (không gửi cloud) */
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
    /* CỘT NGÀY NOT NULL — payload CÓ mang field ngày nhưng rỗng/null (do vnToIso không parse được
       hoặc bỏ trống) → mặc định HÔM NAY để KHÔNG bị 400 "null value violates not-null" (= báo đỏ
       lỗi cloud) hoặc mất patch âm thầm ở update→insert. CHỈ đụng khi field ngày CÓ trong payload
       (hasOwnProperty) → KHÔNG ghi đè ngày thật của patch lẻ không chạm tới ngày. */
    const _todayISO = new Date().toISOString().slice(0, 10);
    const _fixDate = (col) => { if (Object.prototype.hasOwnProperty.call(result, col) && !result[col]) result[col] = _todayISO; };
    if (key === 'cashEntries' && !result.entry_date) result.entry_date = _todayISO;   /* NOT NULL: luôn cần */
    if (key === 'orders')   _fixDate('order_date');     /* TIMESTAMPTZ NOT NULL */
    if (key === 'invoices') _fixDate('invoice_date');   /* DATE NOT NULL */
    if (key === 'adspend')  _fixDate('date');           /* TEXT NOT NULL */
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

  /* === TỐI ƯU TẢI: orders KHÔNG kéo cột `items` (JSONB ~5.8MB/900 đơn) trong danh sách/poll.
     Chỉ tải items khi MỞ/IN/SỬA từng đơn (getOrderItems). Danh sách hiện kg (weight) + số mã
     (đếm từ `goods`). → mỗi lần vào trang Đơn: 0.28MB thay vì 5.8MB (~21× nhẹ). */
  const ORDER_COLS = 'cod,code,created_at,cust_name,customer_id,deliver_date,delivered_at,delivery_time,driver_name,drop_addr,freight,goods,notes,order_date,pay_by,pickup_addr,qty,return_reason,service_type,ship_shift,ship_time,shipper_id,shortages,staff,status,taken_by,transport_mode,unit,updated_at,vehicle,weight,wh_status';
  function _selectCols(table) { return table === 'orders' ? ORDER_COLS : '*'; }

  /* === Supabase data API === */
  window.SB_DATA = {
    /* Lấy TẤT CẢ records của 1 bảng — PHÂN TRANG theo lô 1000 (Supabase giới hạn
       1000 dòng/lần; nếu không lặp range sẽ tự RỚT đơn cũ khi >1000 → lệch dữ liệu). */
    async getAll(table) {
      /* Bảng NẶNG (orders kèm items JSONB ~5.8MB/900 đơn): kéo full trong 1 câu dễ chạm
         statement_timeout khi DB đang tải → CHIA LÔ NHỎ (mỗi câu ~1.2MB) để câu nào cũng
         chạy nhanh, qua được timeout. Bảng nhẹ giữ lô 1000 (1 round-trip). */
      const HEAVY = new Set(['orders']);
      let PAGE = HEAVY.has(table) ? 200 : 1000;
      /* Phân trang PHẢI sắp theo cột DUY NHẤT, nếu không các dòng trùng created_at
         (700 đơn lịch sử cùng created_at 13/6) sẽ nhảy giữa các lô → trùng/sót.
         orders: dùng 'code' (unique + tăng dần theo thời gian = mới trước, ổn định). */
      const ORDER_COL = HEAVY.has(table) ? 'code' : 'created_at';
      let from = 0, out = [], lastErr = null;
      for (let guard = 0; guard < 600; guard++) {   /* lô nhỏ → nhiều vòng hơn; 600×200 = 120k dòng */
        const { data, error } = await client.from(table).select(_selectCols(table))
          .order(ORDER_COL, { ascending: false }).range(from, from + PAGE - 1);
        if (error) {
          /* Lô này timeout → thử THU NHỎ lô 1 lần (100) rồi lặp lại từ vị trí hiện tại;
             vẫn lỗi → bỏ cuộc (trả null, merge giữ local). */
          if (/timeout|statement/i.test(error.message || '') && PAGE > 100) { PAGE = 100; continue; }
          lastErr = error; break;
        }
        out = out.concat(data || []);
        if (!data || data.length < PAGE) break;       /* lô cuối → xong */
        from += data.length;
      }
      if (lastErr) {
        console.error('[SB getAll]', table, lastErr);
        window.toast?.('⚠ Load ' + table + ' lỗi cloud: ' + (lastErr.message||'unknown'), 'warn');
        /* Lỗi (rỗng HOẶC thiếu trang) → trả NULL để merge BỎ QUA lượt này, KHÔNG coi cloud rỗng
           rồi drop record local (bảng nhấp nháy trắng). Poll kế sẽ thử lại. Mọi caller đã guard Array.isArray. */
        return null;
      }
      return out.map(r => mapFrom(table, r));
    },

    /* === DELTA SYNC — chỉ kéo record ĐỔI kể từ mốc `sinceISO` (theo updated_at) ===
       Dùng cho poll bảng nặng (orders ~5.8MB/lần nếu kéo cả bảng). Trả về:
         { rows: [mapped...], cursor: <updated_at LỚN NHẤT trong lô, dạng ISO thô của DB> }
       hoặc null nếu lỗi (caller giữ nguyên mốc, poll sau thử lại).
       - Sắp xếp updated_at TĂNG DẦN + limit → nếu đổi nhiều hơn `limitRows`, cursor
         nhích tới record cuối lô, poll kế tiếp chạy tiếp (không mất, chỉ chia nhiều lô).
       - cursor lấy từ updated_at THÔ của DB (trước mapFrom) → không phụ thuộc DATE_FIELDS. */
    async getChangedSince(table, sinceISO, limitRows) {
      try {
        let q = client.from(table).select(_selectCols(table)).order('updated_at', { ascending: true }).limit(limitRows || 500);
        if (sinceISO) q = q.gt('updated_at', sinceISO);
        const { data, error } = await q;
        if (error) { console.warn('[SB getChangedSince]', table, error.message); return null; }
        const rows = data || [];
        let cursor = sinceISO || null;
        for (const r of rows) { const u = r && r.updated_at; if (u && (!cursor || u > cursor)) cursor = u; }
        return { rows: rows.map(r => mapFrom(table, r)), cursor };
      } catch (e) { console.warn('[SB getChangedSince]', table, e.message); return null; }
    },

    /* Mốc updated_at lớn nhất của bảng (1 dòng ~50B) — đặt mốc delta sau khi merge FULL. */
    async maxUpdated(table) {
      try {
        const { data, error } = await client.from(table).select('updated_at').order('updated_at', { ascending: false }).limit(1);
        if (error || !data || !data.length) return null;
        return data[0].updated_at || null;
      } catch (e) { return null; }
    },

    /* Lấy `items` của MỘT đơn (lazy) — danh sách/poll KHÔNG kéo items để nhẹ; mở/in/sửa đơn mới gọi. */
    async getOrderItems(code) {
      try {
        const { data, error } = await client.from('orders').select('items').eq('code', code).maybeSingle();
        if (error || !data) return null;
        return Array.isArray(data.items) ? data.items : (data.items || []);
      } catch (e) { return null; }
    },

    /* Lấy `items` của NHIỀU đơn (bulk) — cho báo cáo GIÁ VỐN của CFO (danh sách không kéo items).
       Chia lô 100 mã/câu để né URL quá dài. Trả map { code: items[] }. Lô lỗi → bỏ qua lô đó. */
    async getOrderItemsBulk(codes) {
      const out = {};
      const list = Array.from(new Set((codes || []).filter(Boolean)));
      for (let i = 0; i < list.length; i += 100) {
        const chunk = list.slice(i, i + 100);
        try {
          const { data, error } = await client.from('orders').select('code,items').in('code', chunk);
          if (!error && Array.isArray(data)) data.forEach(r => { out[r.code] = Array.isArray(r.items) ? r.items : []; });
        } catch (e) { /* lô lỗi → bỏ qua, các lô khác vẫn có dữ liệu */ }
      }
      return out;
    },

    /* Lấy mã đơn kế tiếp THEO CLOUD (chống trùng khi nhiều máy tạo đơn cùng lúc) */
    async nextCloudOrderCode() {
      try {
        const { data } = await client.from('orders').select('code').order('code', { ascending: false }).limit(5);
        let max = 526052;
        (data || []).forEach(r => { const m = String(r.code || '').match(/NSTT-(\d+)/); if (m) max = Math.max(max, +m[1]); });
        return 'NSTT-' + (max + 1);
      } catch (e) { return null; }
    },

    /* Mã KH kế tiếp THEO CLOUD (chống trùng khi máy tạo mã KHxxx từ max CỤC BỘ lỗi thời —
       máy đứng sau lúc DB nghẽn sẽ cấp trùng mã của KH đã có → nếu không đổi mã sẽ bị NUỐT). */
    async nextCloudCustCode() {
      try {
        const { data } = await client.from('customers').select('id').order('id', { ascending: false }).limit(5);
        let max = 0;
        (data || []).forEach(r => { const m = String(r.id || '').match(/KH0*(\d+)/); if (m) max = Math.max(max, +m[1]); });
        return 'KH' + String(max + 1).padStart(3, '0');
      } catch (e) { return null; }
    },

    /* Insert 1 record — auto-strip cột lạ + retry (chống schema mismatch mọi bảng) */
    async insert(table, record) {
      const mapped = mapTo(table, record);
      /* === CHỐNG "ĐƠN ẢO" (phantom) — idempotency theo NỘI DUNG ===
         Khi mạng chờn, cơ chế tự-cứu-dữ-liệu (store.js self-heal) có thể ĐẨY LẠI đơn dưới dạng
         "nhẹ" — KHÔNG kèm mặt hàng (items rỗng). Vì mỗi lần đẩy lại được cấp MÃ MỚI nên chốt
         chặn trùng-mã (23505) bên dưới KHÔNG bắt được → sinh ra đơn rỗng 0 mặt hàng (vụ
         527096–099). Chặn tại đây: nếu order sắp chèn KHÔNG có mặt hàng mà ĐÃ có 1 đơn CÙNG
         khách + CÙNG tiền hàng (khác mã) CÓ mặt hàng trên cloud → đây là bản đẩy-lại trùng,
         BỎ QUA, trả về đơn thật. (Chỉ chạy khi items rỗng → không thêm tải cho đơn bình thường.) */
      if (table === 'orders') {
        const itemsArr = mapped.items;
        const itemsEmpty = !Array.isArray(itemsArr) || itemsArr.length === 0;
        if (itemsEmpty && mapped.customer_id && (+mapped.freight > 0)) {
          try {
            const { data: twins } = await client.from('orders')
              .select('code,items,freight,customer_id')
              .eq('customer_id', mapped.customer_id)
              .eq('freight', mapped.freight)
              .limit(20);
            const twin = (twins || []).find(t =>
              t.code !== mapped.code && Array.isArray(t.items) && t.items.length > 0);
            if (twin) {
              console.warn(`[SB insert] orders: BỎ QUA đơn RỖNG (items=0) '${mapped.code}' — đã có đơn thật '${twin.code}' cùng KH+tiền (chống đơn ảo do đẩy-lại).`);
              return mapFrom(table, twin);
            }
          } catch (e) { /* đọc lỗi → cứ chèn bình thường, KHÔNG chặn nhầm */ }
        }
      }
      for (let attempt = 0; attempt < 30; attempt++) {   /* đủ lượt strip mọi cột lạ (trước đây 6 → thiếu) */
        const { data, error } = await client.from(table).insert(mapped).select().single();
        if (!error) return mapFrom(table, data);
        const badCol = parseUnknownColumn(error.message);
        if (badCol && Object.prototype.hasOwnProperty.call(mapped, badCol)) {
          delete mapped[badCol];
          console.warn(`[SB insert] ${table}: bỏ cột lạ '${badCol}' rồi thử lại`);
          continue;
        }
        /* MÃ ĐƠN TRÙNG (2 máy tạo cùng lúc) → cấp lại mã cao hơn cloud rồi thử lại.
           Trả về record với mã MỚI để caller cập nhật lại cache + UI. */
        if (table === 'orders' && (error.code === '23505' || /duplicate key|orders_pkey/i.test(error.message || ''))) {
          /* 23505 có thể vì: (a) lần thử/đồng bộ trước ĐÃ chèn đơn NÀY thành công →
             mã này chính là đơn của ta → TRẢ VỀ, KHÔNG cấp mã mới (tránh nhân đôi);
             (b) 2 máy trùng mã của 2 ĐƠN KHÁC → cấp mã mới rồi thử lại. */
          try {
            const ex = await client.from('orders').select('*').eq('code', mapped.code).maybeSingle();
            const e = ex && ex.data;
            if (e && e.customer_id === mapped.customer_id
                && Math.abs((+e.freight || 0) - (+mapped.freight || 0)) < 1
                && String(e.order_date || '').slice(0, 10) === String(mapped.order_date || '').slice(0, 10)) {
              console.warn(`[SB insert] orders: mã '${mapped.code}' đã là ĐƠN NÀY trên cloud → không tạo trùng`);
              return mapFrom(table, e);
            }
          } catch (e) { /* lỗi đọc → rơi xuống cấp mã mới */ }
          const nc = await this.nextCloudOrderCode();
          if (nc && nc !== mapped.code) {
            console.warn(`[SB insert] orders: mã '${mapped.code}' trùng (đơn khác) → đổi '${nc}' rồi thử lại`);
            mapped.code = nc;
            continue;
          }
        }
        /* KHÁCH HÀNG trùng mã KHxxx (máy đứng sau lúc DB nghẽn cấp trùng mã của KH KHÁC).
           Giống orders: nếu mã đó trên cloud là KH KHÁC (khác tên) → cấp mã mới rồi thử lại
           (KHÔNG để bị nuốt); nếu trùng tên → đúng KH này rồi → trả về (idempotent). */
        if (table === 'customers' && (error.code === '23505' || /duplicate key/i.test(error.message || ''))) {
          const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
          try {
            const ex = await client.from('customers').select('*').eq('id', mapped.id).maybeSingle();
            const e = ex && ex.data;
            if (e && norm(e.name) === norm(mapped.name)) {
              console.warn(`[SB insert] customers: '${mapped.id}' đã là KH này trên cloud → không tạo trùng`);
              return mapFrom(table, e);
            }
          } catch (e) { /* đọc lỗi → rơi xuống cấp mã mới */ }
          const nc = await this.nextCloudCustCode();
          if (nc && nc !== mapped.id) {
            console.warn(`[SB insert] customers: mã '${mapped.id}' trùng KH khác → đổi '${nc}' rồi thử lại (chống nuốt KH)`);
            mapped.id = nc;
            /* ĐỔI CẢ code — customers.code là cột UNIQUE NOT NULL riêng, tạo KH id===code.
               Trước đây chỉ đổi id → code cũ vẫn trùng customers_code_key → 23505 lặp mãi → KH KẸT local. */
            if (mapped.code != null) mapped.code = nc;
            continue;
          }
        }
        /* MỌI BẢNG KHÁC (adspend, inventory…): trùng PK = bản ghi NÀY đã có trên
           cloud (self-heal/realtime echo chèn trước, hoặc import chạy lại) → IDEMPOTENT:
           lấy bản cloud trả về, KHÔNG spam toast "duplicate key". (Trước đây chỉ orders được
           xử lý → mọi import khác nổ hàng loạt toast lỗi.) */
        if (error.code === '23505' || /duplicate key/i.test(error.message || '')) {
          const pkCol = mapped.id != null ? 'id' : (mapped.no != null ? 'no' : (mapped.code != null ? 'code' : null));
          if (pkCol && mapped[pkCol] != null) {
            try {
              const ex = await client.from(table).select('*').eq(pkCol, mapped[pkCol]).maybeSingle();
              if (ex && ex.data) { console.warn(`[SB insert] ${table}: '${mapped[pkCol]}' đã có trên cloud → coi như đã lưu`); return mapFrom(table, ex.data); }
            } catch (e) { /* đọc lỗi → bỏ qua im lặng */ }
          }
          console.warn(`[SB insert] ${table}: trùng PK, dữ liệu đã ở cloud — bỏ qua`, error.message);
          return null;
        }
        console.error('[SB insert]', table, error);
        if (!_isTransientErr(error)) window.toast?.('⚠ Lưu cloud lỗi ' + table + ': ' + (error.message||'unknown'), 'warn');
        return null;
      }
      return null;
    },

    /* Update theo id — auto-strip cột lạ + retry.
       Dùng maybeSingle(): 0 row khớp → KHÔNG báo lỗi (tránh "Cannot coerce…"),
       mà UPSERT (insert) vì bản ghi chỉ có ở local, chưa có trên cloud. */
    async update(table, id, patch, idColumn = 'id') {
      const mapped = mapTo(table, patch);
      for (let attempt = 0; attempt < 30; attempt++) {
        const { data, error } = await client.from(table).update(mapped).eq(idColumn, id).select().maybeSingle();
        if (!error) {
          if (data) return mapFrom(table, data);
          /* 0 row khớp → bản ghi chưa tồn tại trên cloud → INSERT (upsert) */
          const full = Object.assign({}, mapped);
          if (full[idColumn] == null) full[idColumn] = id;
          for (let j = 0; j < 30; j++) {
            const ins = await client.from(table).insert(full).select().single();
            if (!ins.error) return mapFrom(table, ins.data);
            const bc = parseUnknownColumn(ins.error.message);
            if (bc && Object.prototype.hasOwnProperty.call(full, bc)) { delete full[bc]; continue; }
            console.warn('[SB update→insert]', table, ins.error.message);
            return null;   /* không toast — tránh spam khi thiếu cột NOT NULL ở patch lẻ */
          }
          return null;
        }
        const badCol = parseUnknownColumn(error.message);
        if (badCol && Object.prototype.hasOwnProperty.call(mapped, badCol)) {
          delete mapped[badCol];
          console.warn(`[SB update] ${table}: bỏ cột lạ '${badCol}' rồi thử lại`);
          continue;
        }
        console.error('[SB update]', table, error);
        if (!_isTransientErr(error)) window.toast?.('⚠ Update cloud lỗi ' + table + ': ' + (error.message||'unknown'), 'warn');
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

    /* Subscribe realtime changes.
       Truyền về 1 event ĐÃ CHUẨN HOÁ + ĐÃ map sang field app:
         { type:'INSERT'|'UPDATE'|'DELETE', new:{...}|null, old:{...}|null }
       Nhờ có `new` (bản ghi đầy đủ với INSERT/UPDATE) → STORE áp delta 1 record,
       KHÔNG phải kéo lại TOÀN BỘ bảng (tiết kiệm ~90% băng thông egress). */
    subscribe(table, callback) {
      const hasCols = (o) => o && typeof o === 'object' && Object.keys(o).length > 0;
      return client.channel('realtime-' + table)
        .on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
          let evt;
          try {
            evt = {
              type: payload.eventType,
              new: hasCols(payload.new) ? mapFrom(table, payload.new) : null,
              old: hasCols(payload.old) ? mapFrom(table, payload.old) : null,
            };
          } catch (e) {
            evt = { type: payload.eventType || null, new: null, old: null };
          }
          callback(evt);
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
        console.warn('[SB setKv]', key, error.code, error.message);
        /* CHỐNG SPAM: tối đa 1 toast / key / 30s (tránh hàng chục toast khi mạng chập chờn).
           Kèm LÝ DO (code/message) để chẩn đoán: 42501/permission = RLS chặn ghi · 413/quá lớn ·
           mạng = lỗi fetch. Lưu lần lỗi gần nhất ra window.__kvLastErr để xem nhanh ở console. */
        window.__kvLastErr = { key, code: error.code, message: error.message, at: new Date().toISOString() };
        const W = (window.__kvWarnAt = window.__kvWarnAt || {});
        const now = Date.now();
        const why = /permission|rls|policy|42501/i.test(error.message + error.code) ? ' (quyền ghi bị chặn)'
          : /JWT|token|expired|401/i.test(error.message + error.code) ? ' (phiên hết hạn — đăng nhập lại)' : '';
        /* cust_prefs = bộ nhớ HỌC thói quen mua (không phải tiền/đơn) — blob to (~450KB) nên trên
           4G/5G hay timeout; bản local KHÔNG mất, đơn kế tiếp tự ghi lại → ĐỪNG dọa user bằng toast,
           chỉ log console. Các key quan trọng (công nợ, chấm công, sổ kho…) vẫn cảnh báo bình thường.
           Ngoại lệ: nếu lỗi do QUYỀN/PHIÊN (cần user xử lý) thì vẫn báo. */
        const quiet = key === 'cust_prefs' && !why;
        if (!quiet && (!W[key] || now - W[key] > 30000)) { W[key] = now; window.toast?.('⚠ Chưa lưu được "' + key + '" lên cloud' + why + ' — sẽ tự thử lại', 'warn'); }
      }
      return !error;
    },
    async deleteKv(key) {
      const { error } = await client.from('kv_store').delete().eq('key', key);
      if (error) { console.warn('[SB deleteKv]', key, error.message); return false; }
      return true;
    },
    /* Realtime cho kv_store: NV đổi công nợ/chấm công/sổ kho ở máy này → máy khác thấy ngay.
       callback({ key, value }) — value là JSONB đầy đủ của key đó (cả mảng/object).
       ⚠ Cần chạy SQL 21-realtime-kv-store.sql để thêm kv_store vào publication. */
    subscribeKv(callback) {
      return client.channel('realtime-kv_store')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'kv_store' }, payload => {
          const row = payload.new && payload.new.key ? payload.new : payload.old;
          if (row && row.key) callback({ key: row.key, value: row.value });
        }).subscribe();
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
