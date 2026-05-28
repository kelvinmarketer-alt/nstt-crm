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
      to:   { date:'order_date', custName:'cust_name', cust:'customer_id', serviceType:'service_type',
              transportMode:'transport_mode', pickup:'pickup_addr', drop:'drop_addr', payBy:'pay_by',
              driverName:'driver_name', returnReason:'return_reason', deliveryTime:'delivery_time',
              takenBy:'taken_by', deliveredAt:'delivered_at', shipperId:'shipper_id' },
      from: { order_date:'date', cust_name:'custName', customer_id:'cust', service_type:'serviceType',
              transport_mode:'transportMode', pickup_addr:'pickup', drop_addr:'drop', pay_by:'payBy',
              driver_name:'driverName', return_reason:'returnReason', delivery_time:'deliveryTime',
              taken_by:'takenBy', delivered_at:'deliveredAt', shipper_id:'shipperId' },
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
      to:   { contactPerson:'contact_person', supplyCategories:'supply_categories', paymentTerms:'payment_terms' },
      from: { contact_person:'contactPerson', supply_categories:'supplyCategories', payment_terms:'paymentTerms' },
    },
    shippers: {
      to:   { ordersToday:'orders_today', kpiTotal:'kpi_total' },
      from: { orders_today:'ordersToday', kpi_total:'kpiTotal' },
    },
    leads: {
      to:   { estValue:'est_value', value:'est_value', lastContact:'last_contact', convertedTo:'converted_to',
              lostReason:'lost_reason' },
      from: { est_value:'estValue', last_contact:'lastContact', converted_to:'convertedTo',
              lost_reason:'lostReason' },
    },
    staff: {
      to:   { hireDate:'hire_date', userId:'user_id' },
      from: { hire_date:'hireDate', user_id:'userId' },
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
  };

  function mapTo(table, obj) {
    if (!obj) return obj;
    const m = FIELD_MAP[table]?.to || {};
    const result = {};
    for (const k of Object.keys(obj)) {
      const newKey = m[k] || k;
      if (newKey === null) continue;
      result[newKey] = obj[k];
    }
    return result;
  }
  function mapFrom(table, obj) {
    if (!obj) return obj;
    const m = FIELD_MAP[table]?.from || {};
    const result = {};
    for (const k of Object.keys(obj)) {
      const newKey = m[k] || k;
      if (newKey === null) continue;
      result[newKey] = obj[k];
    }
    return result;
  }

  /* === Supabase data API === */
  window.SB_DATA = {
    /* Lấy tất cả records của 1 bảng */
    async getAll(table) {
      const { data, error } = await client.from(table).select('*').order('created_at', { ascending: false });
      if (error) { console.error('[SB getAll]', table, error); return []; }
      return data.map(r => mapFrom(table, r));
    },

    /* Insert 1 record */
    async insert(table, record) {
      const mapped = mapTo(table, record);
      const { data, error } = await client.from(table).insert(mapped).select().single();
      if (error) { console.error('[SB insert]', table, error); return null; }
      return mapFrom(table, data);
    },

    /* Update theo id (hoặc code/no) */
    async update(table, id, patch, idColumn = 'id') {
      const mapped = mapTo(table, patch);
      const { data, error } = await client.from(table).update(mapped).eq(idColumn, id).select().single();
      if (error) { console.error('[SB update]', table, error); return null; }
      return mapFrom(table, data);
    },

    /* Xóa theo id */
    async remove(table, id, idColumn = 'id') {
      const { error } = await client.from(table).delete().eq(idColumn, id);
      if (error) { console.error('[SB remove]', table, error); return false; }
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
