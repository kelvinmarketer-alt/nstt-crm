/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Supabase Configuration
   Sửa SUPABASE_URL + SUPABASE_ANON_KEY khi bạn có project
   ========================================================= */
window.SUPABASE_CONFIG = {
  /* ✅ Project NSTT riêng — KHÔNG dùng chung với VTY (dbfffwtnxhytcoczhxhf).
     Project ref: edhyvdstmewshurxucka */
  url:     'https://edhyvdstmewshurxucka.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkaHl2ZHN0bWV3c2h1cnh1Y2thIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NDI4MDYsImV4cCI6MjA5NTUxODgwNn0.WXOLLLkyrLPRAOnAu_4tgFL4KJ-S3ZKuOYePgWc_96I',

  /* Chế độ vận hành.
     - 'localStorage': chạy bằng dữ liệu mock local (data/*.js) — tiện TEST & ĐIỀU CHỈNH offline.
     - 'supabase': đồng bộ cloud — đang BẬT. DB đã có 120 SP + 28 KH + 706 đơn + 5 NV. */
  mode:    'supabase',                // 'localStorage' | 'supabase'

  /* Mapping STORE keys → Supabase tables — XEM TABLE_MAP TRONG store.js
     (Trước đây nhân đôi ở đây — đã dọn dead code, source of truth nằm ở store.js) */

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
