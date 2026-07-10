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
     PHỤ CẤP theo BỘ PHẬN + CA · BHXH — cấu hình ở Cài đặt
     (KV 'payrollConfig'; thiếu key nào thì lấy mặc định dưới đây)
     - Văn phòng            650.000 ₫/tháng
     - Kho sáng / Kho chiều 500.000 ₫/tháng
     - Ship sáng / chiều  1.500.000 ₫/tháng (1.200k xăng + 300k hao mòn xe)
     BHXH: Cá nhân 10,5% (TRỪ vào lương) · Doanh nghiệp 21,5% (cty chi, KHÔNG trừ NV)
     ========================================================= */
  const ALLOWANCE_DEFAULT = {
    office:    650000,
    khoSang:   500000,
    khoChieu:  500000,
    shipSang: 1500000,
    shipChieu:1500000,
  };
  const SHIP_BREAKDOWN_DEFAULT = { fuel: 1200000, wear: 300000 };
  const BHXH_DEFAULT = { empPct: 10.5, comPct: 21.5 };

  const ALLOWANCE_LABEL = {
    office:   'Văn phòng',
    khoSang:  'Kho ca sáng',
    khoChieu: 'Kho ca chiều',
    shipSang: 'Ship ca sáng',
    shipChieu:'Ship ca chiều',
  };

  function getPayrollConfig() {
    const s = (window.STORE && window.STORE.get('payrollConfig', null)) || {};
    return {
      allowance:     Object.assign({}, ALLOWANCE_DEFAULT, s.allowance || {}),
      shipBreakdown: Object.assign({}, SHIP_BREAKDOWN_DEFAULT, s.shipBreakdown || {}),
      bhxh:          Object.assign({}, BHXH_DEFAULT, s.bhxh || {}),
    };
  }

  /* Ca làm suy từ role: "Nhân viên Kho sáng" / "Nhân viên Giao hàng chiều" */
  function shiftOf(role) {
    const r = (role || '').toLowerCase();
    if (/chi[eề]u/.test(r)) return 'chieu';
    if (/s[aá]ng/.test(r))  return 'sang';
    return '';
  }
  /* Bộ phận + ca → key phụ cấp */
  function allowanceKeyFor(dept, role) {
    const sh = shiftOf(role);
    if (dept === 'Kho') return sh === 'chieu' ? 'khoChieu' : 'khoSang';
    if (dept === 'Ship' || dept === 'Giao hàng' || dept === 'Vận hành') return sh === 'chieu' ? 'shipChieu' : 'shipSang';
    return 'office';
  }
  /* Mức phụ cấp tháng của 1 NV. Kho PART-TIME giữ nguyên quy tắc cũ = 0đ. */
  function getAllowanceMonthly(dept, role, contractType) {
    if (dept === 'Kho' && contractType === 'parttime') return 0;
    const cfg = getPayrollConfig();
    return +cfg.allowance[allowanceKeyFor(dept, role)] || 0;
  }

  /* === Cấu hình lương RIÊNG từng NV (KV 'payrollStaffCfg') ===
     { [staffId]: { bhxhOn, bhxhBase, commMode:'none'|'auto'|'manual', commPct, commScope } }
     Để ở KV vì bảng `staff` trên cloud KHÔNG có cột salary_config (insert sẽ tự strip → mất). */
  function getStaffPayCfg(staffId) {
    const all = (window.STORE && window.STORE.get('payrollStaffCfg', {})) || {};
    const c = all[staffId] || {};
    return {
      bhxhOn:   !!c.bhxhOn,
      bhxhBase: +c.bhxhBase || 0,
      commMode: c.commMode || 'none',
      commPct:  +c.commPct || 0,
      commScope: c.commScope || 'ownedCusts',
    };
  }
  function setStaffPayCfg(staffId, patch) {
    const all = (window.STORE && window.STORE.get('payrollStaffCfg', {})) || {};
    all[staffId] = Object.assign({}, all[staffId] || {}, patch);
    window.STORE.set('payrollStaffCfg', all);
    return all[staffId];
  }

  /* === Doanh thu của 1 NV trong tháng (để tính hoa hồng tự động) ===
     scope: ownOrders = đơn NV tự tạo · ownedCusts = đơn của KH NV phụ trách · allOrders = tất cả
     Chỉ tính đơn KHÔNG huỷ, theo ngày giao (deliverDate) rơi vào tháng. */
  function staffRevenue(staffName, scope, month) {
    if (!window.STORE || !staffName || !month) return 0;
    const orders = window.STORE.get('orders', []) || [];
    const custs  = window.STORE.get('customers', []) || [];
    const owned  = new Set(custs.filter(c => (c.staffOwner || '') === staffName).map(c => c.id));
    const inMonth = o => {
      const d = o.deliverDate || o.date || '';
      if (/^\d{4}-\d{2}/.test(d)) return d.slice(0, 7) === month;
      const m = String(d).match(/(\d{1,2})\/(\d{4})/);          /* dd/mm/yyyy kiểu VN */
      const m2 = String(d).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m2) return `${m2[3]}-${String(m2[2]).padStart(2,'0')}` === month;
      return m ? `${m[2]}-${String(m[1]).padStart(2,'0')}` === month : false;
    };
    return orders.reduce((sum, o) => {
      if (o.status === 'cancelled' || o.status === 'canceled') return sum;
      if (!inMonth(o)) return sum;
      const cid = o.custId || o.cust;
      const hit = scope === 'allOrders' ? true
              : scope === 'ownOrders'  ? (o.staff === staffName)
              : owned.has(cid);
      return hit ? sum + (+o.freight || 0) : sum;
    }, 0);
  }

  /* === Hoa hồng ===
     auto   → % × doanh thu (theo phạm vi khai ở hồ sơ NV)
     manual → kế toán gõ thẳng số tiền vào phiếu (commissionAmount)
     Phiếu lương được override % (input.commissionPct) so với hồ sơ. */
  function computeCommission(input) {
    const cfg  = getStaffPayCfg(input.staffId);
    /* commMode CHƯA KHAI (phiếu lập trước v418) → coi như KHÔNG có hoa hồng.
       Nếu lấy theo cấu hình NV thì phiếu cũ (vốn đã ghi hoa hồng ở dòng Thưởng)
       sẽ bị CỘNG TRÙNG. Phiếu mới / bản xem trước luôn truyền commMode rõ ràng. */
    if (input.commMode == null) return { mode: 'none', pct: 0, revenue: 0, amount: 0, legacy: true };
    const mode = input.commMode;
    if (mode === 'manual') {
      return { mode, pct: 0, revenue: 0, amount: Math.round(+input.commissionAmount || 0) };
    }
    if (mode !== 'auto') return { mode: 'none', pct: 0, revenue: 0, amount: 0 };
    const pct   = (input.commissionPct != null && input.commissionPct !== '') ? +input.commissionPct : cfg.commPct;
    const scope = input.commScope || cfg.commScope;
    const revenue = staffRevenue(input.staffName, scope, input.month);
    return { mode, pct, scope, revenue, amount: roundK(revenue * pct / 100) };
  }

  /* === BHXH === base = "mức lương cơ sở" đóng BH (tuỳ chỉnh từng NV).
     Trả về { on, base, emp, com }. CHỈ `emp` bị trừ vào thực lĩnh. */
  function computeBhxh(input) {
    const rates = getPayrollConfig().bhxh;
    const cfg   = getStaffPayCfg(input.staffId);
    /* bhxhOn CHƯA KHAI (phiếu lập trước v418) → GIỮ NGUYÊN số `bhxh` đã lưu,
       KHÔNG tự tính lại (tránh đổi số liệu phiếu đã duyệt/đã trả). */
    if (input.bhxhOn == null) {
      const legacy = +input.bhxh || 0;
      return { on: false, base: 0, emp: legacy, com: 0, empPct: rates.empPct, comPct: rates.comPct, legacy: true };
    }
    if (!input.bhxhOn) {
      return { on: false, base: 0, emp: 0, com: 0, empPct: rates.empPct, comPct: rates.comPct, legacy: false };
    }
    const base = (input.bhxhBase != null && +input.bhxhBase > 0) ? +input.bhxhBase
               : (cfg.bhxhBase > 0 ? cfg.bhxhBase : (+input.basicSalary || 0));
    return {
      on: true, base,
      emp: Math.round(base * rates.empPct / 100),
      com: Math.round(base * rates.comPct / 100),
      empPct: rates.empPct, comPct: rates.comPct, legacy: false,
    };
  }

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
    /* NC chuẩn: Ship 30 · Kho 29/30(TV) · Văn phòng theo LỊCH tháng (workStandardFor).
       Fallback cfg.workStandard nếu helper chưa nạp. */
    const _autoWS = (typeof window !== 'undefined' && window.workStandardFor)
      ? window.workStandardFor(input.dept, input.contractType, input.month, input.role)
      : cfg.workStandard;
    const workStandardDefault = input.workStandardOverride || _autoWS;
    /* Phụ cấp: theo BỘ PHẬN + CA (Cài đặt). Override thủ công ở phiếu vẫn thắng. */
    const allowanceMonthly = (input.allowanceOverride != null)
      ? input.allowanceOverride : getAllowanceMonthly(input.dept, input.role, input.contractType);

    let baseSalary = 0, workActual = 0, ratio = 1, basicSalary = 0, workStandard = workStandardDefault;
    const segDetail = []; /* Breakdown cho mixed mode */

    if (input.mixedMode && Array.isArray(input.segments) && input.segments.length > 0) {
      /* === MIXED MODE === thử việc + chính thức trong cùng tháng */
      input.segments.forEach(seg => {
        const segRatio = CONTRACT_RATIO[seg.contractType] || 1.00;
        const segWS = seg.workStandardOverride || ((typeof window !== 'undefined' && window.workStandardFor)
          ? window.workStandardFor(input.dept, seg.contractType, input.month, input.role)
          : getDeptConfig(input.dept, seg.contractType).workStandard);
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

    /* Tổng thưởng = thưởng thủ công + thưởng hỗ trợ Kho/Ship (sổ ghi, tự tính) */
    const helperBonus = +input.helperBonus || 0;
    const totalBonus = (input.bonuses || []).reduce((s, b) => s + (+b.amount || 0), 0) + helperBonus;

    /* Lương 1 NGÀY CÔNG — để quy đổi mức phạt "trừ ½ ngày / 1 ngày công" */
    const dayWage = workStandard ? roundK(basicSalary * ratio / workStandard) : 0;
    /* Phạt: khoản unit='cong' TỰ quy đổi ra tiền theo lương ngày hiện tại (không lưu cứng) */
    const penalties = (input.penalties || []).map(p => {
      if (p && p.unit === 'cong') {
        const days = +p.days || 0;
        return Object.assign({}, p, { days, amount: roundK(dayWage * days) });
      }
      return p;
    });
    const totalPenalty = penalties.reduce((s, p) => s + (+p.amount || 0), 0);

    /* Hoa hồng — auto (% × doanh thu) hoặc gõ tay, tuỳ vị trí */
    const commission = computeCommission(input);

    /* BHXH — NV 10,5% (TRỪ vào lương) · DN 21,5% (công ty chi, KHÔNG trừ NV) */
    const bh = computeBhxh(input);
    const bhxhEmp = bh.emp;
    const bhxhCom = bh.com;
    const bhxh = bhxhEmp;                 /* alias giữ tương thích code/phiếu cũ */
    const advance = +input.advance || 0;

    /* === Phạt đi muộn (auto từ chấm công + latePolicy) === */
    let lateAuto = { count: 0, total: 0, detail: [] };
    if (input.staffId && input.month) {
      lateAuto = computeLateAutoForMonth(input.staffId, input.month);
    }

    /* THỰC LĨNH = Lương công + Phụ cấp + Thưởng + Hoa hồng
                   − Phạt − Phạt muộn − BHXH(NV) − Tạm ứng
       (BHXH doanh nghiệp KHÔNG trừ — là chi phí công ty, chỉ hiển thị để theo dõi) */
    const total = baseSalary + allowance + totalBonus + commission.amount
                - totalPenalty - bhxhEmp - advance - lateAuto.total;

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
      allowanceKey: allowanceKeyFor(input.dept, input.role),
      ratio,
      baseSalary,
      allowance,
      dayWage,
      penalties,            /* đã quy đổi khoản 'cong' → tiền (đè penalties gốc trong ...input) */
      totalBonus,
      helperBonus,
      totalPenalty,
      commission,           /* {mode, pct, scope, revenue, amount} */
      bhxh,                 /* = bhxhEmp (alias cũ) */
      bhxhEmp,
      bhxhCom,
      bhxhOn: bh.on,
      bhxhBase: bh.base,
      bhxhRates: { empPct: bh.empPct, comPct: bh.comPct },
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
    /* Phạt theo NGÀY CÔNG — tự quy đổi ra tiền theo lương ngày của chính NV đó
       (lương ngày = LCB × hệ số HĐ ÷ công chuẩn). Không cần gõ số tiền. */
    { id:'half_day', name:'➖ Trừ ½ ngày công', unit:'cong', days:0.5, placeholder:'Tự tính = ½ × lương 1 ngày' },
    { id:'one_day',  name:'➖ Trừ 1 ngày công', unit:'cong', days:1,   placeholder:'Tự tính = lương 1 ngày' },
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
    /* Phụ cấp theo ca + BHXH + hoa hồng (v418) */
    ALLOWANCE_DEFAULT,
    ALLOWANCE_LABEL,
    BHXH_DEFAULT,
    SHIP_BREAKDOWN_DEFAULT,
    getPayrollConfig,
    getAllowanceMonthly,
    allowanceKeyFor,
    shiftOf,
    getStaffPayCfg,
    setStaffPayCfg,
    staffRevenue,
    computeCommission,
    computeBhxh,
    /* Late policy */
    LATE_POLICY_DEFAULT,
    getLatePolicy,
    applyLatePolicy,
    computeLateAutoForMonth,
  };

  console.log('[NSTT] ✓ Payroll formula engine ready');
})();
