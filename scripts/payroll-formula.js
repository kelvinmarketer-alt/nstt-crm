/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Công thức tính lương (engine)
   ─────────────────────────────────────────────────────────
   Dựa trên tài liệu công thức nội bộ + bảng lương tháng 4/2026 thực tế.

   TỔNG THỰC LĨNH =
     Lương theo công + Phụ cấp + Thưởng
     − Phạt/Trừ − BHXH − Tạm ứng

   Lương theo công = Lcb × Hệ số HĐ ÷ Công chuẩn × Công thực tế
   Phụ cấp        = Mức phụ cấp tháng × min(1, Công thực tế ÷ Công chuẩn)
                    → CÓ TRẦN: đủ hoặc dư công (31/30) đều hưởng TRỌN mức tháng;
                      thiếu công (29/30) mới bị chia theo tỉ lệ.

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
  /* defaultBase = MỨC LƯƠNG CƠ SỞ đóng BHXH mặc định cho mọi NV (sửa ở Cài đặt,
     hoặc đặt riêng từng người trong hồ sơ NV). */
  const BHXH_DEFAULT = { empPct: 10.5, comPct: 21.5, defaultBase: 5500000 };

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

  /* === Giải thích PHỤ CẤP: vì sao ra con số đó ===
     Nhận `c` = kết quả computePayslip. Trả về mọi mảnh ghép để phiếu lương hiển thị. */
  function allowanceExplain(c) {
    const cfg  = getPayrollConfig();
    const key  = c.allowanceKey || allowanceKeyFor(c.dept, c.role);
    const isShip = (key === 'shipSang' || key === 'shipChieu');
    const ptKho  = (c.dept === 'Kho' && c.contractType === 'parttime');
    const overridden = (c.allowanceOverride != null && +c.allowanceOverride > 0);
    const ws = +c.workStandard || 0;
    const wa = +c.workActual || 0;
    return {
      key,
      label: ALLOWANCE_LABEL[key] || '',
      shift: shiftOf(c.role),                      /* 'sang' | 'chieu' | '' */
      dept: c.dept, role: c.role,
      monthly: +c.allowanceMonthly || 0,           /* mức tháng ĐANG áp (đã tính override) */
      configMonthly: getAllowanceMonthly(c.dept, c.role, c.contractType),  /* mức theo Cài đặt */
      overridden, ptKho, isShip,
      fuel: isShip ? (+cfg.shipBreakdown.fuel || 0) : 0,
      wear: isShip ? (+cfg.shipBreakdown.wear || 0) : 0,
      workStandard: ws,
      workActual: wa,
      perDay: ws ? Math.round((+c.allowanceMonthly || 0) / ws) : 0,
      amount: +c.allowance || 0,
      /* Làm DƯ công (vd 31/30) → bị CHẶN TRẦN ở đúng mức tháng, không cộng thêm. */
      capped: ws > 0 && wa > ws,
      full:   ws > 0 && wa >= ws,   /* hưởng trọn mức tháng */
    };
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
    /* Ưu tiên: mức ghi trên PHIẾU → mức riêng của NV → mức cơ sở MẶC ĐỊNH (Cài đặt, 5.5tr).
       KHÔNG lấy lương cơ bản làm mức đóng BH (mỗi người một LCB → sai chuẩn). */
    const base = (input.bhxhBase != null && +input.bhxhBase > 0) ? +input.bhxhBase
               : (cfg.bhxhBase > 0 ? cfg.bhxhBase : (+rates.defaultBase || 0));
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
      { thresholdMinutes: 10,  unit: 'money', amount:  20000, label: '> 10 phút' },
      { thresholdMinutes: 30,  unit: 'money', amount:  50000, label: '> 30 phút' },
      { thresholdMinutes: 60,  unit: 'money', amount: 100000, label: '> 1 tiếng' },
      { thresholdMinutes: 180, unit: 'cong',  days: 0.5, amount: 0, label: '> 3 tiếng — trừ ½ ngày công' },
    ],
    perMinuteRate: 5000, /* dùng nếu mode='perMinute' */
  };

  /* Tier có 2 đơn vị:
       unit='money' → phạt CỐ ĐỊNH `amount` đồng
       unit='cong'  → phạt = `days` ngày công × lương 1 ngày công của chính NV đó
     Tier CŨ (trước v424) không có `unit` ⇒ coi như 'money' (giữ nguyên tiền). */
  function _normTier(t) {
    t = t || {};
    const unit = t.unit === 'cong' ? 'cong' : 'money';
    return {
      thresholdMinutes: +t.thresholdMinutes || 0,
      label: t.label || '',
      unit,
      amount: unit === 'money' ? (+t.amount || 0) : 0,
      days: unit === 'cong' ? (+t.days || 0) : 0,
    };
  }

  function getLatePolicy() {
    if (!window.STORE) return LATE_POLICY_DEFAULT;
    const saved = window.STORE.get('latePolicy', null);
    if (!saved || !saved.tiers) return LATE_POLICY_DEFAULT;
    return Object.assign({}, saved, { tiers: (saved.tiers || []).map(_normTier) });
  }

  const _congLabel = d => (d === 0.5 ? '½ ngày công' : d === 1 ? '1 ngày công' : d + ' ngày công');

  /* 1 lần muộn X phút → trả về {amount, tier}. dayWage = lương 1 ngày công (cho tier unit='cong'). */
  function applyLatePolicy(lateMin, policy, dayWage) {
    policy = policy || getLatePolicy();
    lateMin = +lateMin || 0;
    dayWage = +dayWage || 0;
    const grace = +policy.graceMinutes || 0;
    if (lateMin <= grace) return { amount: 0, tier: null, unit: 'money', days: 0 };

    if (policy.mode === 'perMinute') {
      const rate = +policy.perMinuteRate || 5000;
      const amount = Math.round((lateMin - grace) * rate);
      return { amount, tier: { label: `${lateMin - grace}p × ${rate.toLocaleString('vi-VN')}đ/p` }, unit: 'money', days: 0 };
    }

    /* Tier mode — chọn tier có threshold cao nhất mà NV vượt qua */
    const tiers = (policy.tiers || []).map(_normTier).sort((a, b) => b.thresholdMinutes - a.thresholdMinutes);
    for (const t of tiers) {
      if (lateMin >= t.thresholdMinutes) {
        if (t.unit === 'cong') {
          return { amount: roundK(dayWage * t.days), tier: t, unit: 'cong', days: t.days };
        }
        return { amount: t.amount, tier: t, unit: 'money', days: 0 };
      }
    }
    return { amount: 0, tier: null, unit: 'money', days: 0 };
  }

  /* Compute tổng phạt muộn của 1 NV trong 1 tháng từ chấm công.
     dayWage cần cho tier tính theo ngày công — computePayslip luôn truyền vào. */
  function computeLateAutoForMonth(staffId, month, policy, dayWage) {
    policy = policy || getLatePolicy();
    if (!window.STORE) return { count: 0, total: 0, detail: [] };

    const sheets = window.STORE.get('timesheet', []) || [];
    const sheet = sheets.find(t => t.staffId === staffId && t.month === month);
    if (!sheet || !Array.isArray(sheet.days)) return { count: 0, total: 0, detail: [] };

    const allMeta = window.STORE.get('timesheetMeta', {}) || {};
    const meta = allMeta[staffId + '_' + month] || {};

    let total = 0, totalDays = 0;
    const detail = [];
    sheet.days.forEach((status, idx) => {
      if (status !== 'L') return;
      const dayN = idx + 1;
      const lateMin = (meta[dayN] && meta[dayN].lateMin) || 0;
      const r = applyLatePolicy(lateMin, policy, dayWage);
      if (r.amount > 0 || r.days > 0) {
        total += r.amount;
        totalDays += r.days;
        detail.push({
          day: dayN, lateMin, amount: r.amount,
          unit: r.unit, days: r.days,
          tierLabel: (r.tier && r.tier.label) || (r.unit === 'cong' ? _congLabel(r.days) : ''),
        });
      }
    });
    return { count: detail.length, total, totalDays, detail };
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
        const segBase = segWS > 0 ? roundK(segBasic * segRatio / segWS * segWork) : 0;   /* chặn chia 0 → ∞ */
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
      /* Lương theo công — chặn chia 0 (công chuẩn = 0 → 0đ, không ra ∞/NaN) */
      baseSalary = workStandardDefault > 0
        ? roundK(basicSalary * ratio / workStandardDefault * workActual)
        : 0;
    }
    workStandard = workStandardDefault;

    /* Phụ cấp theo TỔNG công — CÓ TRẦN = đúng mức tháng của vị trí.
       Làm ĐỦ hoặc DƯ công (vd 31/30) → hưởng trọn mức tháng, KHÔNG cộng thêm.
       Làm THIẾU công (vd 29/30)      → mức tháng ÷ công chuẩn × công thực tế. */
    const allowRatio = workStandard > 0 ? Math.min(1, workActual / workStandard) : 0;
    let allowance = roundK(allowanceMonthly * allowRatio);

    /* ============ ĐÓNG BĂNG TIỀN CỦA PHIẾU ĐÃ DUYỆT / ĐÃ TRẢ ============
       Phiếu 'approved'/'paid' = tiền ĐÃ chốt (và có thể đã chi cho NV). Mọi thứ tính LIVE
       (phạt đi muộn theo latePolicy hiện tại, hoa hồng theo đơn hàng hiện tại, % BHXH ở Cài đặt,
        công thức phụ cấp mới…) đều KHÔNG được phép làm đổi số của các phiếu đó.
       → Nếu phiếu có lưu sẵn con số nào thì dùng lại đúng con số ấy.
       Phiếu 'draft'/'submitted' (chưa duyệt, chưa chi) vẫn tính lại bình thường. */
    const _frozen = (input.status === 'approved' || input.status === 'paid');
    const _keep = (stored, computed) => (_frozen && typeof stored === 'number') ? +stored : computed;

    allowance  = _keep(input.allowance, allowance);
    baseSalary = _keep(input.baseSalary, baseSalary);

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

    /* Hoa hồng — auto (% × doanh thu) hoặc gõ tay, tuỳ vị trí.
       Phiếu đã chốt: giữ số tiền hoa hồng đã lưu (đơn hàng tháng đó sửa sau không làm đổi lương). */
    const _comm = computeCommission(input);
    const commission = Object.assign({}, _comm, { amount: _keep(input.commissionAmount, _comm.amount) });

    /* BHXH — NV 10,5% (TRỪ vào lương) · DN 21,5% (công ty chi, KHÔNG trừ NV).
       Phiếu đã chốt: giữ số đã lưu (đổi % ở Cài đặt không làm đổi lương đã duyệt). */
    const bh = computeBhxh(input);
    const bhxhEmp = _keep(input.bhxhEmp, bh.emp);
    const bhxhCom = _keep(input.bhxhCom, bh.com);
    const bhxh = bhxhEmp;                 /* alias giữ tương thích code/phiếu cũ */
    const advance = +input.advance || 0;

    /* === Phạt đi muộn (auto từ chấm công + latePolicy hiện tại) ===
       Phiếu đã chốt: giữ số phạt đã lưu — sửa khung phạt muộn hoặc sửa chấm công tháng cũ
       KHÔNG được làm đổi thực lĩnh của phiếu đã duyệt/đã trả. */
    let lateAuto = { count: 0, total: 0, detail: [] };
    if (_frozen && input.lateAuto && typeof input.lateAuto.total === 'number') {
      lateAuto = input.lateAuto;
    } else if (input.staffId && input.month) {
      /* dayWage: cần cho mức phạt khai theo "½ / 1 ngày công" */
      lateAuto = computeLateAutoForMonth(input.staffId, input.month, null, dayWage);
    }

    /* THỰC LĨNH = Lương công + Phụ cấp + Thưởng + Hoa hồng
                   − Phạt − Phạt muộn − BHXH(NV) − Tạm ứng
       (BHXH doanh nghiệp KHÔNG trừ — là chi phí công ty, chỉ hiển thị để theo dõi) */
    const total = _keep(input.total,
      baseSalary + allowance + totalBonus + commission.amount
      - totalPenalty - bhxhEmp - advance - lateAuto.total);

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
        allowanceDetail: (workStandard > 0 && workActual >= workStandard)
          ? `Đủ công (${workActual}/${workStandard}) → hưởng trọn mức tháng ${formatVND(allowanceMonthly)}`
          : `${formatVND(allowanceMonthly)} ÷ ${workStandard} × ${workActual} = ${formatVND(allowance)}`,
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
    allowanceExplain,
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
