/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Chi phí quảng cáo theo ngày
   Mỗi entry: { id, date:'YYYY-MM-DD', channel, objective, form, spend,
                units, leads, custs, revenue, candidates }
   Mẫu funnel + KPI khác nhau theo "mục đích chạy" (objective).
   Seed lấy theo Google Sheet báo giá ads thật (tháng 5).
   ========================================================= */

window.AD_CHANNELS = [
  { id:'fb',     label:'Facebook', icon:'📘', color:'#1877F2' },
  { id:'google', label:'Google',   icon:'🔍', color:'#EA4335' },
  { id:'tiktok', label:'TikTok',   icon:'🎵', color:'#111111' },
  { id:'zalo',   label:'Zalo',     icon:'💬', color:'#0068FF' },
];

window.AD_FORMS = ['Mess', 'Tin nhắn', 'Tương tác', 'Form', 'Lead', 'Video'];

/* Mục đích chạy → khung chỉ số (funnel) riêng → mẫu báo cáo khác nhau */
window.AD_OBJECTIVES = [
  { id:'ban-hang', label:'Bán hàng / Sản phẩm', icon:'🛒', hasRevenue:true,
    /* Bỏ cột Inbox + CP/Inbox theo yêu cầu — chỉ theo dõi SĐT → Khách mua → Doanh thu */
    steps:[
      { key:'leads', label:'SĐT',   cp:'CP/SĐT' },
      { key:'custs', label:'Khách mua', cp:'CP/Khách' },
    ] },
  { id:'tuyen-dung', label:'Tuyển dụng', icon:'🧑‍💼', hasRevenue:false,
    /* Cột đặt ĐÚNG như báo cáo tuyển dụng của user: Lead → CV (bỏ Inbox) */
    steps:[
      { key:'leads',      label:'Lead', cp:'$/Lead' },
      { key:'candidates', label:'CV',   cp:'$/CV' },
    ] },
];

/* Data thật nhập trên app (lưu Supabase). Empty để app trắng — KHÔNG seed demo. */
window.ADSPEND = [];
