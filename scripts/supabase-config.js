/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Supabase Configuration
   Sửa SUPABASE_URL + SUPABASE_ANON_KEY khi bạn có project
   ========================================================= */
window.SUPABASE_CONFIG = {
  /* ⚠️ ĐÃ NGẮT khỏi project Supabase của VTY (dbfffwtnxhytcoczhxhf) — bản Tuấn Tú KHÔNG
     được phép ghi đè dữ liệu app VTY. Muốn chạy cloud cho Tuấn Tú: tạo project Supabase
     RIÊNG rồi điền url + anonKey của project đó vào đây (không dùng lại key VTY). */
  url:     'YOUR_SUPABASE_URL',
  anonKey: 'YOUR_SUPABASE_ANON_KEY',

  /* Chế độ vận hành.
     - 'localStorage': chạy bằng dữ liệu mock local (data/*.js) — tiện TEST & ĐIỀU CHỈNH offline.
     - 'supabase': đồng bộ cloud (cần seed lại dữ liệu đã rebrand vào Supabase trước).
     Đổi về 'supabase' khi muốn dùng cloud. */
  mode:    'localStorage',            // 'localStorage' | 'supabase'

  /* Mapping STORE keys → Supabase tables */
  tableMap: {
    customers:        'customers',
    orders:           'orders',
    vehicles:         'vehicles',
    drivers:          'drivers',
    partners:         'partners',
    staff:            'staff',
    paymentAccounts:  'payment_accounts',
    cashEntries:      'cash_entries',
    invoices:         'invoices',
    companyInfo:      'company_info',
    activityLogs:     'activity_logs',
    /* master data (md_*) lưu trong bảng master_data theo key */
  },

  /* Auto-switch sang supabase khi cả URL + key đều được set */
  isReady() {
    return this.url && this.url !== 'YOUR_SUPABASE_URL'
        && this.anonKey && this.anonKey !== 'YOUR_SUPABASE_ANON_KEY';
  },
};

/* Auto-detect mode — chỉ bật supabase khi có project RIÊNG (isReady) VÀ chọn mode supabase.
   Chưa cấu hình project riêng → luôn ép localStorage (không đụng cloud VTY). */
if (window.SUPABASE_CONFIG.mode === 'supabase' && window.SUPABASE_CONFIG.isReady()) {
  console.log('[NSTT] Supabase mode ACTIVE - syncing to cloud (project riêng)');
} else {
  window.SUPABASE_CONFIG.mode = 'localStorage';
  console.log('[NSTT] localStorage mode (dữ liệu mock local, KHÔNG đụng Supabase)');
}
