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

  /* =========================================================
     CHÍNH SÁCH PHẠT ĐI MUỘN (link chấm công ↔ phiếu lương)
     - mode='tier' (mặc định): mỗi lần muộn áp 1 mức theo tier cao nhất NV vượt qua
     - mode='perMinute': phạt theo phút sau grace
     - Admin sửa qua Settings (lưu vào STORE key 'latePolicy')
     ========================================================= */
  const LATE_POLICY_DEFAULT = {
    mode: 'tier',
    graceMinutes: 10,
    tiers: [
      { thresholdMinutes: 10,  amount:  20000, label: '> 10 phút' },
      { thresholdMinutes: 30,  amount:  50000, label: '> 30 phút' },
      { thresholdMinutes: 60,  amount: 100000, label: '> 1 tiếng' },
      { thresholdMinutes: 180, amount: 300000, label: '> 3 tiếng (nửa buổi)' },
    ],
    perMinuteRate: 5000, /* dùng nếu mode='perMinute' */
  };

  function getLatePolicy() {
    if (!window.STORE) return LATE_POLICY_DEFAULT;
    const saved = window.STORE.get('latePolicy', null);
    return saved && saved.tiers ? saved : LATE_POLICY_DEFAULT;
  }

  /* 1 lần muộn X phút → trả về {amount, tier} */
  function applyLatePolicy(lateMin, policy) {
    policy = policy || getLatePolicy();
    lateMin = +lateMin || 0;
    const grace = +policy.graceMinutes || 0;
    if (lateMin <= grace) return { amount: 0, tier: null };

    if (policy.mode === 'perMinute') {
      const rate = +policy.perMinuteRate || 5000;
      const amount = Math.round((lateMin - grace) * rate);
      return { amount, tier: { label: `${lateMin - grace}p × ${rate.toLocaleString('vi-VN')}đ/p` } };
    }

    /* Tier mode — chọn tier có threshold cao nhất mà NV vượt qua */
    const tiers = [...(policy.tiers || [])].sort((a, b) => (b.thresholdMinutes || 0) - (a.thresholdMinutes || 0));
    for (const t of tiers) {
      if (lateMin >= (+t.thresholdMinutes || 0)) {
        return { amount: +t.amount || 0, tier: t };
      }
    }
    return { amount: 0, tier: null };
  }

  /* Compute tổng phạt muộn của 1 NV trong 1 tháng từ chấm công */
  function computeLateAutoForMonth(staffId, month, policy) {
    policy = policy || getLatePolicy();
    if (!window.STORE) return { count: 0, total: 0, detail: [] };

    const sheets = window.STORE.get('timesheet', []) || [];
    const sheet = sheets.find(t => t.staffId === staffId && t.month === month);
    if (!sheet || !Array.isArray(sheet.days)) return { count: 0, total: 0, detail: [] };

    const allMeta = window.STORE.get('timesheetMeta', {}) || {};
    const meta = allMeta[staffId + '_' + month] || {};

    let total = 0;
    const detail = [];
    sheet.days.forEach((status, idx) => {
      if (status !== 'L') return;
      const dayN = idx + 1;
      const lateMin = (meta[dayN] && meta[dayN].lateMin) || 0;
      const r = applyLatePolicy(lateMin, policy);
      if (r.amount > 0) {
        total += r.amount;
        detail.push({ day: dayN, lateMin, amount: r.amount, tierLabel: r.tier?.label || '' });
      }
    });
    return { count: detail.length, total, detail };
  }

  /* === Tính 1 dòng lương đầy đủ === */
  function computePayslip(input) {
    /* input = {
         basicSalary, contractType, dept, workActual, staffId, month,
         workStandardOverride, allowanceOverride,
         bonuses: [{name, amount}, ...],
         penalties: [{name, amount}, ...],
         bhxh, advance,
         mixedMode (optional): boolean,
         segments (optional): [{name, basicSalary, contractType, workActual, workStandardOverride?}]
       } */
    const cfg = getDeptConfig(input.dept, input.contractType);
    const workStandardDefault = input.workStandardOverride || cfg.workStandard;
    const allowanceMonthly = (input.allowanceOverride != null)
      ? input.allowanceOverride : cfg.allowanceMonthly;

    let baseSalary = 0, workActual = 0, ratio = 1, basicSalary = 0, workStandard = workStandardDefault;
    const segDetail = []; /* Breakdown cho mixed mode */

    if (input.mixedMode && Array.isArray(input.segments) && input.segments.length > 0) {
      /* === MIXED MODE === thử việc + chính thức trong cùng tháng */
      input.segments.forEach(seg => {
        const segRatio = CONTRACT_RATIO[seg.contractType] || 1.00;
        const segWS = seg.workStandardOverride || getDeptConfig(input.dept, seg.contractType).workStandard;
        const segBasic = +seg.basicSalary || 0;
        const segWork = +seg.workActual || 0;
        const segBase = roundK(segBasic * segRatio / segWS * segWork);
        baseSalary += segBase;
        workActual += segWork;
        segDetail.push({
          name: seg.name || (seg.contractType === 'probation' ? 'Thử việc' : 'Chính thức'),
          basicSalary: segBasic,
          contractType: seg.contractType,
          ratio: segRatio,
          workStandard: segWS,
          workActual: segWork,
          baseSalary: segBase,
        });
      });
      /* Báo cáo basicSalary + ratio trung bình cho display */
      basicSalary = segDetail.reduce((s, x) => s + x.basicSalary * x.workActual, 0) / (workActual || 1);
      ratio = segDetail.reduce((s, x) => s + x.ratio * x.workActual, 0) / (workActual || 1);
    } else {
      /* === SINGLE MODE === logic cũ */
      ratio = CONTRACT_RATIO[input.contractType] || 1.00;
      basicSalary = +input.basicSalary || 0;
      workActual = +input.workActual || 0;
      /* Lương theo công */
      baseSalary = roundK(basicSalary * ratio / workStandardDefault * workActual);
    }
    workStandard = workStandardDefault;

    /* Phụ cấp theo TỔNG công (cả mixed lẫn single) */
    const allowance = roundK(allowanceMonthly / workStandard * workActual);

    /* Tổng thưởng */
    const totalBonus = (input.bonuses || []).reduce((s, b) => s + (+b.amount || 0), 0);
    /* Tổng phạt */
    const totalPenalty = (input.penalties || []).reduce((s, p) => s + (+p.amount || 0), 0);

    const bhxh = +input.bhxh || 0;
    const advance = +input.advance || 0;

    /* === NEW: Phạt đi muộn (auto từ chấm công + latePolicy) === */
    let lateAuto = { count: 0, total: 0, detail: [] };
    if (input.staffId && input.month) {
      lateAuto = computeLateAutoForMonth(input.staffId, input.month);
    }

    const total = baseSalary + allowance + totalBonus - totalPenalty - bhxh - advance - lateAuto.total;

    /* Breakdown display — mixed mode liệt kê từng segment */
    let baseSalaryDetail;
    if (segDetail.length > 0) {
      baseSalaryDetail = segDetail.map(s =>
        `[${s.name}] ${formatVND(s.basicSalary)} × ${(s.ratio*100).toFixed(0)}% ÷ ${s.workStandard} × ${s.workActual} = ${formatVND(s.baseSalary)}`
      ).join(' · ') + ` → Σ ${formatVND(baseSalary)}`;
    } else {
      baseSalaryDetail = `${formatVND(basicSalary)} × ${(ratio*100).toFixed(0)}% ÷ ${workStandard} × ${workActual} = ${formatVND(baseSalary)}`;
    }

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
      lateAuto,
      segDetail, /* Mixed mode breakdown */
      total: Math.max(0, total),
      breakdown: {
        formula: segDetail.length > 0
          ? `Hỗn hợp ${segDetail.length} segment`
          : `${formatVND(basicSalary)} × ${(ratio*100).toFixed(0)}% ÷ ${workStandard} × ${workActual}`,
        baseSalaryDetail,
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
    /* Late policy */
    LATE_POLICY_DEFAULT,
    getLatePolicy,
    applyLatePolicy,
    computeLateAutoForMonth,
  };

  console.log('[NSTT] ✓ Payroll formula engine ready');
})();
