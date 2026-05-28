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

  /* === Mapping field NSTT (camelCase JS) ↔ Postgres (snake_case) === */
  const FIELD_MAP = {
    customers: {
      to:   { groupName:'group_name', staffOwner:'staff_owner', lastContact:'last_contact', lastOrder:'last_order',
              ordersCount:'orders_count', debtOverdue:'debt_overdue', remindCount:'remind_count',
              taxCode:'tax_code', representative:'rep', serviceId:'service_id' },
      from: { group_name:'groupName', staff_owner:'staffOwner', last_contact:'lastContact', last_order:'lastOrder',
              orders_count:'orders', debt_overdue:'debtOverdue', remind_count:'remindCount',
              tax_code:'tax', rep:'rep', service_id:'serviceId' },
    },
    orders: {
      to:   { customerName:'customer_name', customerId:'customer_id', serviceType:'service_type', transportMode:'transport_mode',
              dropAddress:'drop_address', payBy:'pay_by', driverId:'driver_id', driverName:'driver_name',
              partnerId:'partner_id', partnerName:'partner_name', partnerCost:'partner_cost',
              cancelReason:'cancel_reason', orderDate:'order_date',
              drop:'drop_address' },
      from: { customer_name:'custName', customer_id:'cust', service_type:'serviceType', transport_mode:'transportMode',
              drop_address:'drop', pay_by:'payBy', driver_id:'driver', driver_name:'driverName',
              partner_id:'partnerId', partner_name:'partnerName', partner_cost:'partnerCost',
              cancel_reason:'cancelReason', order_date:'date',
              cust_id_alias:null },
    },
    vehicles: {
      to:   { vehicleType:'vehicle_type', capUnit:'cap_unit', lastDriver:'last_driver', lastDriverName:'last_driver_name',
              currentOrder:'current_order', currentRoute:'current_route', lastService:'last_service',
              nextRegister:'next_register', nextServiceKm:'next_service_km', cost30d:'cost_30d', trips30d:'trips_30d',
              maintenanceNote:'maintenance_note' },
      from: { vehicle_type:'type', cap_unit:'capUnit', last_driver:'lastDriver', last_driver_name:'lastDriverName',
              current_order:'currentOrder', current_route:'currentRoute', last_service:'lastService',
              next_register:'nextRegister', next_service_km:'nextServiceKm', cost_30d:'cost30d', trips_30d:'trips30d',
              maintenance_note:'maintenanceNote' },
    },
    drivers: {
      to:   { canDrive:'can_drive', primaryVehicle:'primary_vehicle', primaryPlate:'primary_plate',
              joinDate:'join_date', trips30d:'trips_30d', revenue30d:'revenue_30d' },
      from: { can_drive:'canDrive', primary_vehicle:'primaryVehicle', primary_plate:'primaryPlate',
              join_date:'joinDate', trips_30d:'trips30d', revenue_30d:'revenue30d' },
    },
    partners: {
      to:   { vehiclePlate:'vehicle_plate', vehicleType:'vehicle_type', capUnit:'cap_unit',
              trips30d:'trips_30d', totalSpent30d:'total_spent_30d' },
      from: { vehicle_plate:'vehiclePlate', vehicle_type:'vehicleType', cap_unit:'capUnit',
              trips_30d:'trips30d', total_spent_30d:'totalSpent30d' },
    },
    staff: {
      to:   { avatarColor:'avatar_color', joinDate:'join_date' },
      from: { avatar_color:'avatarColor', join_date:'joinDate' },
    },
    paymentAccounts: {
      to:   {},
      from: {},
    },
    cashEntries: {
      to:   { entryDate:'entry_date', entryType:'entry_type', refOrder:'ref_order',
              date:'entry_date', type:'entry_type', desc:'description' },
      from: { entry_date:'date', entry_type:'type', ref_order:'refOrder', description:'desc' },
    },
    invoices: {
      to:   { invDate:'inv_date', taxCode:'tax_code', cqtCode:'cqt_code', cqtSync:'cqt_sync',
              issuedAt:'issued_at', paidDate:'paid_date', paidVia:'paid_via',
              date:'inv_date', cust:'customer', tax:'tax_code', desc:'description' },
      from: { inv_date:'date', tax_code:'tax', cqt_code:'cqtCode', cqt_sync:'cqtSync',
              issued_at:'issuedAt', paid_date:'paidDate', paid_via:'paidVia',
              customer:'cust', description:'desc' },
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

    /* Get master data */
    async getMasterData(key) {
      const { data, error } = await client.from('master_data').select('data').eq('key', key).single();
      if (error || !data) return null;
      return data.data;
    },
    async setMasterData(key, value) {
      const { error } = await client.from('master_data').upsert({ key, data: value, updated_at: new Date().toISOString() });
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
