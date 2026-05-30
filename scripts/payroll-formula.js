/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Công thức tính lương (engine)
   ─────────────────────────────────────────────────────────
   Dựa trên tài liệu công thức nội bộ + bảng lương tháng 4/2026 thực tế.

   TỔNG THỰC LĨNH =
     Lương theo công + Phụ cấp + Thưởng
     − Phạt/Trừ − BHXH − Tạm ứng

   Lương theo công = Lcb × Hệ số HĐ ÷ Công chuẩn × Công thực tế
   Phụ cấp        = Mức phụ cấp tháng ÷ Công chuẩn × Công thực tế

   Công chuẩn (mẫu số) theo bộ phận:
   - Văn phòng (HR, KT, Sale, MKT, Tuyển dụng): 24
   - Kho chính thức:                            29
   - Kho thử việc + Ship + Part-time:           30

   Hệ số HĐ:
   - Chính thức:               100%
   - Thử việc:                 85%
   - Thực tập / Part-time:     100% (lương cơ bản thường thấp hơn)

   Phụ cấp mặc định (có thể override):
   - Văn phòng: 650.000 ₫/tháng
   - Kho:       500.000 ₫/tháng
   - Ship:    1.500.000 ₫/tháng (đi đường nhiều)
   - Part-time Kho: 0 ₫
   ========================================================= */
(function () {

  /* === Config bộ phận → công chuẩn + phụ cấp === */
  const DEPT_CONFIG = {
    'VP':          { workStandard: 24, allowanceMonthly: 650000, label: 'Văn phòng' },
    'HCNS':        { workStandard: 24, allowanceMonthly: 650000, label: 'HR/Tuyển dụng' },
    'Tuyển dụng':  { workStandard: 24, allowanceMonthly: 650000, label: 'Tuyển dụng' },
    'Kế toán':     { workStandard: 24, allowanceMonthly: 650000, label: 'Kế toán' },
    'Sale':        { workStandard: 24, allowanceMonthly: 650000, label: 'Sale' },
    'MKT':         { workStandard: 24, allowanceMonthly: 650000, label: 'Marketing' },
    'Kho':         { workStandard: 29, allowanceMonthly: 500000, label: 'Kho chính thức' },
    'Kho_TV':      { workStandard: 30, allowanceMonthly: 500000, label: 'Kho thử việc' },
    'Kho_PT':      { workStandard: 30, allowanceMonthly: 0,      label: 'Kho part-time' },
    'Ship':        { workStandard: 30, allowanceMonthly: 1500000, label: 'Giao hàng' },
    'Giao hàng':   { workStandard: 30, allowanceMonthly: 1500000, label: 'Giao hàng' },
    'Vận hành':    { workStandard: 30, allowanceMonthly: 1500000, label: 'Vận hành' },
  };

  /* Hệ số HĐ theo contractType */
  const CONTRACT_RATIO = {
    'official':    1.00,    /* NV chính thức */
    'probation':   0.85,    /* Thử việc */
    'probation85': 0.85,    /* Alias */
    'intern':      1.00,    /* Thực tập sinh (LCB thường thấp hơn) */
    'parttime':    1.00,    /* Part-time */
  };

  /* === Lookup config bộ phận === */
  function getDeptConfig(dept, contractType) {
    /* Kho có 3 chế độ: chính thức 29, thử việc 30, part-time 30 */
    if (dept === 'Kho') {
      if (contractType === 'probation') return DEPT_CONFIG.Kho_TV;
      if (contractType === 'parttime') return DEPT_CONFIG.Kho_PT;
      return DEPT_CONFIG.Kho;
    }
    return DEPT_CONFIG[dept] || DEPT_CONFIG.VP;
  }

  /* === Round nhẹ 1 nghìn đồng cho gọn === */
  function roundK(n) { return Math.round(n / 1000) * 1000; }

  /* === Tính 1 dòng lương đầy đủ === */
  function computePayslip(input) {
    /* input = {
         basicSalary, contractType, dept, workActual,
         workStandardOverride, allowanceOverride,
         bonuses: [{name, amount}, ...],
         penalties: [{name, amount}, ...],
         bhxh, advance,
       } */
    const cfg = getDeptConfig(input.dept, input.contractType);
    const workStandard = input.workStandardOverride || cfg.workStandard;
    const allowanceMonthly = (input.allowanceOverride != null)
      ? input.allowanceOverride : cfg.allowanceMonthly;
    const ratio = CONTRACT_RATIO[input.contractType] || 1.00;

    const basicSalary = +input.basicSalary || 0;
    const workActual = +input.workActual || 0;

    /* Lương theo công */
    const baseSalary = roundK(basicSalary * ratio / workStandard * workActual);
    /* Phụ cấp theo công */
    const allowance = roundK(allowanceMonthly / workStandard * workActual);

    /* Tổng thưởng */
    const totalBonus = (input.bonuses || []).reduce((s, b) => s + (+b.amount || 0), 0);
    /* Tổng phạt */
    const totalPenalty = (input.penalties || []).reduce((s, p) => s + (+p.amount || 0), 0);

    const bhxh = +input.bhxh || 0;
    const advance = +input.advance || 0;

    const total = baseSalary + allowance + totalBonus - totalPenalty - bhxh - advance;

    return {
      ...input,
      workStandard,
      allowanceMonthly,
      ratio,
      baseSalary,
      allowance,
      totalBonus,
      totalPenalty,
      bhxh,
      advance,
      total: Math.max(0, total),
      breakdown: {
        formula: `${formatVND(basicSalary)} × ${(ratio*100).toFixed(0)}% ÷ ${workStandard} × ${workActual}`,
        baseSalaryDetail: `${formatVND(basicSalary)} × ${(ratio*100).toFixed(0)}% ÷ ${workStandard} × ${workActual} = ${formatVND(baseSalary)}`,
        allowanceDetail: `${formatVND(allowanceMonthly)} ÷ ${workStandard} × ${workActual} = ${formatVND(allowance)}`,
      },
    };
  }

  function formatVND(n) { return (n || 0).toLocaleString('vi-VN'); }

  /* === Templates thưởng/phạt phổ biến để boss chọn nhanh === */
  const BONUS_TEMPLATES = [
    { id:'sales',    name:'💰 Doanh số / Hoa hồng', placeholder:'3% × doanh thu KH X' },
    { id:'ship',     name:'📦 Ship đơn chiều', placeholder:'N đơn × giá (Bông 30k, thường 70k, Long Biên 70-120k)' },
    { id:'attend',   name:'✅ Chuyên cần (đủ công)', placeholder:'250k–500k' },
    { id:'holiday',  name:'🎉 Lễ tết (Giỗ Tổ, 30/4, 1/5...)', placeholder:'100k–300k mỗi dịp' },
    { id:'task',     name:'⭐ Xuất sắc / Hoàn thành CV', placeholder:'100k–150k' },
    { id:'overtime', name:'⏰ Làm thêm T7/CN', placeholder:'Theo giờ thực tế' },
    { id:'custom',   name:'➕ Khoản khác', placeholder:'Ghi rõ lý do' },
  ];
  const PENALTY_TEMPLATES = [
    { id:'late10',   name:'⏰ Đi muộn > 10 phút', placeholder:'20.000 ₫/lần' },
    { id:'late30',   name:'⏰ Đi muộn > 30 phút', placeholder:'50.000 ₫/lần' },
    { id:'late60',   name:'⏰ Đi muộn > 1 tiếng', placeholder:'100.000 ₫/lần' },
    { id:'noshow',   name:'❌ Nghỉ không phép', placeholder:'300.000 ₫/ngày' },
    { id:'goods',    name:'🛒 Trừ tiền hàng (mua mang về, hàng hư)', placeholder:'Theo giá trị thực' },
    { id:'company',  name:'🏢 Công ty hỗ trợ (KHÔNG trừ — ghi để theo dõi)', placeholder:'Đánh dấu miễn phạt' },
    { id:'custom',   name:'➕ Khoản khác', placeholder:'Ghi rõ lý do' },
  ];

  /* === Public API === */
  window.PayrollFormula = {
    computePayslip,
    getDeptConfig,
    BONUS_TEMPLATES,
    PENALTY_TEMPLATES,
    CONTRACT_RATIO,
    DEPT_CONFIG,
    formatVND,
    roundK,
  };

  console.log('[NSTT] ✓ Payroll formula engine ready');
})();
