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
    steps:[
      { key:'units', label:'Inbox', cp:'CP/Inbox' },
      { key:'leads', label:'SĐT',   cp:'CP/SĐT' },
      { key:'custs', label:'Khách mua', cp:'CP/Khách' },
    ] },
  { id:'tuyen-dung', label:'Tuyển dụng', icon:'🧑‍💼', hasRevenue:false,
    steps:[
      { key:'units',      label:'Inbox', cp:'CP/Inbox' },
      { key:'leads',      label:'SĐT',   cp:'CP/SĐT' },
      { key:'candidates', label:'Ứng viên', cp:'CP/Ứng viên' },
    ] },
];

(function () {
  /* [ngày, chi tiêu, inbox] từ sheet thật */
  const BH = [[1,201195,7],[2,241977,10],[3,226685,13],[4,193872,9],[5,180663,10],[6,165439,3],
    [7,143229,10],[8,150282,7],[9,118579,7],[11,138076,7],[12,281042,10],[13,308258,12],
    [14,333157,9],[15,339913,17],[16,353024,17],[17,241199,10],[18,281848,7],[19,414928,12],
    [20,419358,14],[21,433274,16],[22,408059,12],[23,285512,11],[24,420364,14],[25,231908,4]];
  const TD = [[1,340096,13],[2,395209,12],[3,454398,23],[4,419322,18],[5,473398,28],[6,378529,12],
    [7,213044,8],[8,234931,12],[9,206567,9],[11,246527,11],[12,323038,13],[13,275486,13],
    [14,280745,9],[15,232148,6],[16,161940,12],[17,145331,6],[18,161171,4],[19,277417,11],
    [20,261277,12],[21,266869,10],[22,251048,18],[23,215109,13],[24,268009,16],[25,163111,5]];
  const iso = d => `2026-05-${String(d).padStart(2,'0')}`;
  const out = [];
  BH.forEach(([d,spend,u]) => {
    const leads = Math.round(u*0.6), custs = Math.round(leads*0.45);
    out.push({ id:`AD-BH-${d}`, date:iso(d), channel:'fb', objective:'ban-hang', form:'Mess',
      spend, units:u, leads, custs, revenue: custs*320000, candidates:0 });
  });
  TD.forEach(([d,spend,u]) => {
    const leads = Math.round(u*0.55), candidates = Math.round(leads*0.5);
    out.push({ id:`AD-TD-${d}`, date:iso(d), channel:'fb', objective:'tuyen-dung', form:'Mess',
      spend, units:u, leads, custs:0, revenue:0, candidates });
  });
  window.ADSPEND = out;
})();
