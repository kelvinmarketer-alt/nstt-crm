/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Phiếu duyệt lương (4-step workflow)
   ─────────────────────────────────────────────────────────
   Workflow theo quy trình NSTT thực tế:

   ┌──────────┐    ┌──────────────┐    ┌─────────────┐    ┌────────┐
   │  draft   │ → │  submitted   │ → │  approved   │ → │  paid  │
   │ (NS tính)│    │ (gửi CFO)    │    │ (CFO duyệt) │    │ (trả)  │
   └──────────┘    └──────────────┘    └─────────────┘    └────────┘

   Roles:
   - HR/NS (perm 'payroll.calc'+'payroll.submit'): nhập công, tính lương,
     submit gửi CFO. Không duyệt được.
   - CFO (perm 'payroll.approve' hoặc 'all'): sửa MỌI thông số nếu thấy
     không phù hợp, sau đó approve. Có thể trả về 'draft' nếu cần sửa.
   - Admin/CEO (perm 'all'): toàn quyền mọi step.
   - View-only ('payroll.viewAll'): xem mọi phiếu, không sửa.

   Status:
   - draft:     NS đang nhập, sửa thoải mái
   - submitted: NS đã gửi CFO, lock các field NS, CFO có thể edit
   - approved:  CFO đã duyệt, lock hoàn toàn (trừ admin)
   - paid:      Đã trả lương, tự tạo cashEntries phiếu chi
   ========================================================= */
(function () {

  if (!window.PayrollFormula) {
    console.warn('[Payroll] Cần payroll-formula.js load trước');
    return;
  }

  const PF = window.PayrollFormula;

  /* === Money input helper — format khi blur, raw khi focus === */
  function parseMoney(s) {
    return parseInt(String(s == null ? '' : s).replace(/[^\d\-]/g, ''), 10) || 0;
  }
  function fmtMoney(n) {
    return (parseMoney(n)).toLocaleString('vi-VN');
  }
  /* Money input HTML helper — type="text" + format */
  function moneyInput(id, value, opts) {
    opts = opts || {};
    const readonly = opts.readonly ? 'readonly' : '';
    const placeholder = opts.placeholder || '';
    const style = opts.style || 'width:100%;padding:7px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px;text-align:right;font-weight:700';
    const cls = opts.cls || 'ps-money';
    return `<input id="${id}" type="text" inputmode="numeric" class="${cls}" value="${fmtMoney(value)}" data-raw="${parseMoney(value)}" placeholder="${placeholder}" ${readonly} style="${style}">`;
  }
  /* Mức lương cơ sở đóng BHXH mặc định (Cài đặt → payrollConfig.bhxh.defaultBase, mặc định 5.5tr) */
  const _bhxhDefaultBase = () => (PF.getPayrollConfig ? (+PF.getPayrollConfig().bhxh.defaultBase || 0) : 5500000);
  const _esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Bỏ dấu để so tên khoản thưởng ("Hoa hồng" / "doanh số" / "commission") */
  const _noAccent = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
  /* Phiếu đã có dòng THƯỞNG là hoa hồng → không bật hoa hồng tự động (tránh cộng trùng) */
  function _hasCommissionBonus(ps) {
    return (ps && Array.isArray(ps.bonuses) ? ps.bonuses : [])
      .some(b => /hoa hong|commission|doanh so/.test(_noAccent(b && b.name)));
  }

  /* === CHI TIẾT PHẠT ĐI MUỘN — mức khai theo "ngày công" hiện luôn cách quy ra tiền === */
  function lateDetailHTML(la, dayWage) {
    la = la || { count: 0, detail: [] };
    if (!la.count) return '';
    const f = PF.formatVND;
    const dw = +dayWage || 0;
    /* tierLabel = ô nhập tự do trong Cấu hình phạt → PHẢI escape, kẻo lưu thẻ HTML vào khung phạt
       là chạy script trong phiếu lương của kế toán/CFO. */
    const rows = (la.detail || []).map(d => {
      const how = d.unit === 'cong'
        ? ` → <b>${d.days === 0.5 ? '½' : +d.days} ngày công</b> × ${f(dw)}đ/công =`
        : ' →';
      return `Ngày ${+d.day}: muộn ${+d.lateMin}p (${_esc(d.tierLabel) || 'tier'})${how} <b>${f(d.amount)} đ</b>`;
    }).join('<br>');
    return `<details style="margin-top:6px">
      <summary style="cursor:pointer;font-size:11.5px;color:#DC2626">📋 Chi tiết ${la.count} lần</summary>
      <div style="padding:6px 0 0 12px;font-size:11.5px;color:#7F1D1D;line-height:1.7">${rows}</div>
    </details>`;
  }

  /* === GIẢI THÍCH PHỤ CẤP: vì sao ra đúng con số đó === */
  function allowanceDetailHTML(c) {
    if (!PF.allowanceExplain) return '';
    const x = PF.allowanceExplain(c);
    const f = PF.formatVND;
    const rows = [];

    /* Kho part-time: mặc định 0đ. Nhưng nếu phiếu GHI ĐÈ thủ công thì vẫn có tiền
       → không được in "0 ₫" (sẽ mâu thuẫn với con số hiển thị bên cạnh). */
    if (x.ptKho && !x.overridden) {
      rows.push(`<div>📌 Bộ phận <b>Kho</b> · hợp đồng <b>part-time</b> → theo quy định <b>không có phụ cấp (0 ₫)</b>.</div>`);
      return rows.join('');
    }
    const caLbl = x.shift === 'sang' ? 'sáng' : x.shift === 'chieu' ? 'chiều' : '';
    if (x.ptKho) {
      rows.push(`<div>📌 Bộ phận <b>Kho</b> · hợp đồng <b>part-time</b> (quy định 0 ₫) — nhưng phiếu này đang <b>ghi đè thủ công</b>.</div>`);
    } else {
      rows.push(`<div>📌 Bộ phận <b>${_esc(x.dept || '—')}</b>${caLbl
        ? ` · vị trí “${_esc(x.role || '')}” có chữ <b>${caLbl}</b>`
        : (x.role ? ` · vị trí “${_esc(x.role)}”` : '')} → áp mức <b>${_esc(x.label)}</b>.</div>`);
    }

    if (x.overridden) {
      rows.push(`<div>✍️ <b>Ghi đè thủ công</b>: ${f(x.monthly)} ₫/tháng <span style="opacity:.7">(mức theo Cài đặt: ${f(x.configMonthly)} ₫)</span></div>`);
    } else {
      rows.push(`<div>💰 Mức tháng: <b>${f(x.monthly)} ₫</b>${x.isShip && (x.fuel || x.wear)
        ? ` <span style="opacity:.8">= ${f(x.fuel)} tiền xăng + ${f(x.wear)} hao mòn xe</span>` : ''}</div>`);
    }

    if (x.workStandard <= 0) {
      rows.push(`<div>🧮 Công chuẩn = 0 → phụ cấp <b>0 ₫</b>.</div>`);
      return rows.join('');
    }
    if (x.full) {
      /* Đủ hoặc dư công → hưởng TRỌN mức tháng (có trần) */
      rows.push(`<div>🧮 Công thực tế <b>${x.workActual}</b> ≥ công chuẩn <b>${x.workStandard}</b> → hưởng <b>trọn mức tháng</b> = <b style="color:#1E40AF">${f(x.amount)} ₫</b></div>`);
      if (x.capped) {
        rows.push(`<div style="color:#15803D;margin-top:2px">✓ Làm dư ${(x.workActual - x.workStandard).toFixed(1).replace(/\.0$/, '')} công nhưng phụ cấp <b>không cộng thêm</b> — đã chặn trần đúng mức tối đa của vị trí.</div>`);
      }
    } else {
      rows.push(`<div>🧮 Thiếu công → chia theo tỉ lệ: <b>${f(x.monthly)}</b> ÷ <b>${x.workStandard}</b> <span style="opacity:.7">(công chuẩn)</span> × <b>${x.workActual}</b> <span style="opacity:.7">(công thực tế)</span> = <b style="color:#1E40AF">${f(x.amount)} ₫</b></div>`);
      rows.push(`<div style="opacity:.75">≈ ${f(x.perDay)} ₫ / 1 công${x.isShip ? ' (xăng + hao mòn)' : ''}</div>`);
    }
    if (x.workActual === 0) rows.push(`<div style="opacity:.75">Chưa có công thực tế → phụ cấp 0 ₫.</div>`);
    return rows.join('');
  }

  /* Wire money inputs trong drawer — focus=raw, blur=format */
  function wireMoneyInputs(root) {
    if (!root) return;
    root.querySelectorAll('.ps-money').forEach(el => {
      el.addEventListener('focus', e => {
        e.target.value = e.target.dataset.raw || '0';
        e.target.select();
      });
      el.addEventListener('blur', e => {
        const n = parseMoney(e.target.value);
        e.target.dataset.raw = n;
        e.target.value = fmtMoney(n);
      });
    });
  }
  /* Đọc raw từ input money (kể cả khi đang focus) */
  function getMoneyRaw(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    /* Nếu đang focus thì value là raw, otherwise dùng dataset */
    return parseMoney(el === document.activeElement ? el.value : (el.dataset.raw ?? el.value));
  }

  /* === Lưu/lấy phiếu lương từ STORE === */
  function getPayslips()      { return window.STORE.get('payrollExtra', []) || []; }

  /* ⚠ KHÔNG ghi cả sổ lương bằng STORE.set. Một tab vừa mở (cache chưa về từ cloud) mà bấm Lưu
     sẽ ghi đè TOÀN BỘ phiếu lương của mọi NV bằng bản cũ. rmwKv áp đúng thay đổi lên bản
     cloud mới nhất → 5 kế toán sửa 5 phiếu khác nhau không đè nhau. mutate phải IDEMPOTENT. */
  function _psMut(mutate) {
    const norm = a => (Array.isArray(a) ? a : []);
    if (window.STORE.rmwKv) window.STORE.rmwKv('payrollExtra', a => mutate(norm(a)) || norm(a), []);
    else { const a = norm(getPayslips()); window.STORE.set('payrollExtra', mutate(a) || a); }
  }
  const _upsert = (list, ps) => { const i = list.findIndex(x => x && x.id === ps.id); if (i >= 0) list[i] = ps; else list.push(ps); };
  function savePayslip(ps)        { _psMut(list => { _upsert(list, ps); return list; }); }
  function savePayslipsMany(arr)  { _psMut(list => { arr.forEach(ps => _upsert(list, ps)); return list; }); }

  /* Đóng băng các số ĐÃ TÍNH vào phiếu khi lưu (báo cáo/đối soát đọc trực tiếp,
     không phải tính lại). Dùng CHUNG cho: lưu nháp / nộp / duyệt / nộp hàng loạt. */
  function computedSnapshot(c) {
    return {
      baseSalary: c.baseSalary,
      allowance: c.allowance,
      total: c.total,
      dayWage: c.dayWage,
      penalties: c.penalties,                                   /* khoản 'ngày công' đã quy đổi ra tiền */
      commissionAmount: c.commission ? c.commission.amount : 0,
      commissionPct:    c.commission ? c.commission.pct : 0,
      commissionRevenue:c.commission ? c.commission.revenue : 0,
      bhxhEmp: c.bhxhEmp,
      bhxhCom: c.bhxhCom,
      bhxh:    c.bhxhEmp,                                       /* alias cho code/báo cáo cũ */
      /* Đóng băng phạt đi muộn: sửa khung phạt / chấm công tháng cũ KHÔNG được đổi phiếu đã chốt */
      lateAuto: c.lateAuto || { count: 0, total: 0, detail: [] },
      lateTotal: (c.lateAuto && c.lateAuto.total) || 0,
    };
  }

  /* Công thực tế của 1 NV trong 1 tháng — DÙNG CHUNG công thức với bảng lương (payroll.js).
     Nếu payroll.js chưa nạp (trang khác) thì fallback công chuẩn. */
  function workActualOf(staff, mth) {
    if (window.payrollWorkActual) return window.payrollWorkActual(staff, mth);
    return window.workStandardFor
      ? window.workStandardFor(staff.dept, staff.contractType, mth, staff.role)
      : PF.getDeptConfig(staff.dept, staff.contractType).workStandard;
  }

  /* Nạp cấu hình BHXH + hoa hồng vào 1 phiếu NHÁP chưa khai (dùng chung cho drawer & bảng lương,
     để 2 nơi không hiển thị lệch nhau). Trả về chính object đã sửa. */
  function hydrateDraftPayslip(ps, cfg) {
    if (!ps || ps.status !== 'draft') return ps;
    cfg = cfg || (PF.getStaffPayCfg ? PF.getStaffPayCfg(ps.staffId) : null);
    if (!cfg) return ps;
    if (ps.bhxhOn == null && !(+ps.bhxh > 0)) {
      ps.bhxhOn = cfg.bhxhOn;
      ps.bhxhBase = cfg.bhxhBase || _bhxhDefaultBase();
    }
    if (ps.commMode == null) {
      const dup = _hasCommissionBonus(ps);
      ps.commMode = dup ? 'none' : cfg.commMode;
      ps.commissionPct = dup ? 0 : cfg.commPct;
      ps.commScope = cfg.commScope;
    }
    return ps;
  }
  window.hydrateDraftPayslip = hydrateDraftPayslip;

  /* === Tìm phiếu theo NV + tháng === */
  function findPayslip(staffId, month) {
    return getPayslips().find(p => p.staffId === staffId && p.month === month);
  }

  /* === Tạo hoặc lấy phiếu cho NV trong tháng === */
  function getOrCreatePayslip(staffId, month) {
    const existing = findPayslip(staffId, month);
    const staff = (window.STORE.get('staff', []) || []).find(s => s.id === staffId) || {};
    const cfg = PF.getStaffPayCfg ? PF.getStaffPayCfg(staffId)
                                  : { bhxhOn:false, bhxhBase:0, commMode:'none', commPct:0, commScope:'ownedCusts' };
    if (existing) {
      /* Phiếu NHÁP (chưa chốt) → nạp cấu hình BHXH/hoa hồng mới nhất của NV.
         Phiếu ĐÃ NỘP / DUYỆT / TRẢ → GIỮ NGUYÊN, KHÔNG tự tính lại (bảo toàn số đã chốt). */
      /* Phiếu NHÁP → nạp cấu hình BHXH/hoa hồng mới nhất (giữ số cũ nếu đã có, tránh cộng trùng
         hoa hồng khi phiếu đã có dòng thưởng "hoa hồng"). Phiếu đã chốt: KHÔNG đụng. */
      hydrateDraftPayslip(existing, cfg);
      return existing;
    }
    return {
      id: 'PR-' + month + '-' + staffId,
      month,
      staffId,
      staffName: staff.name || '?',
      dept: staff.dept || 'VP',
      role: staff.role || '',
      contractType: staff.contractType || 'official',
      basicSalary: staff.salary || 0,
      /* Công thực tế lấy thẳng từ BẢNG CHẤM CÔNG (trước đây hardcode 0 → mở phiếu ra thấy 0 công,
         lệch hẳn với bảng lương; lỡ bấm Lưu là NV về ~0đ). */
      workActual: workActualOf(staff, month),
      workStandardOverride: null,
      allowanceOverride: null,
      bonuses: [],
      penalties: [],
      /* BHXH — tích chọn + mức lương cơ sở lấy từ hồ sơ NV (sửa được ngay trên phiếu) */
      bhxhOn: cfg.bhxhOn,
      bhxhBase: cfg.bhxhBase || _bhxhDefaultBase(),
      bhxh: 0,
      /* Hoa hồng — auto (% × doanh thu) hoặc manual (gõ tay), theo hồ sơ NV */
      commMode: cfg.commMode,
      commissionPct: cfg.commPct,
      commScope: cfg.commScope,
      commissionAmount: 0,
      advance: 0,
      notes: '',
      status: 'draft',
      createdAt: new Date().toISOString(),
      approvedBy: null,
      approvedAt: null,
      paidAt: null,
    };
  }

  /* === Render drawer phiếu duyệt === */
  window.openPayslipDrawer = function (staffId, month) {
    month = month || '2026-' + String(new Date().getMonth()+1).padStart(2,'0');
    const p = getOrCreatePayslip(staffId, month);
    /* Đảm bảo computePayslip có staffId + month để tính lateAuto */
    p.staffId = p.staffId || staffId;
    p.month = p.month || month;
    /* Thưởng hỗ trợ Kho/Ship (sổ ghi hàng ngày) — tính theo QUY CHẾ phủ ngày của từng khoản.
       KHOÁ phiếu đã nộp/duyệt/trả: giữ đúng tổng thưởng đã chốt, dù sau này sửa quy chế. */
    const _helper = window.BONUS ? window.BONUS.helperFor(staffId, month) : { total: 0, entries: [], noPolicy: 0 };
    const _psLocked = !!(p.status && p.status !== 'draft');   /* đã chốt ⇒ giữ số cũ (thiếu field ⇒ 0) */
    if (_psLocked) p.helperBonus = +p.helperBonus || 0;
    else p.helperBonus = _helper.total;
    const computed = PF.computePayslip(p);
    const lateAuto = computed.lateAuto || { count: 0, total: 0, detail: [] };
    /* Phiếu lập TRƯỚC v418 chưa khai bhxhOn/commMode → giữ nguyên UI + số cũ, KHÔNG tự tính lại */
    const isLegacyBhxh = (p.bhxhOn == null);
    const isLegacyComm = (p.commMode == null);
    const SCOPE_LABEL = {
      ownedCusts: 'đơn của KH NV phụ trách',
      ownOrders:  'đơn NV tự tạo',
      allOrders:  'tất cả đơn',
    };

    /* === Permission detection === */
    const hasPerm = (perm) => !!(window.AUTH && window.AUTH.hasPerm && window.AUTH.hasPerm(perm));
    const isAdmin = hasPerm('all');
    const isCFO = isAdmin || hasPerm('payroll.approve');
    const isHR = isAdmin || hasPerm('payroll.calc') || hasPerm('payroll.submit');
    const canView = isAdmin || isCFO || isHR || hasPerm('payroll.viewAll');

    /* === Edit permission per status === */
    let canEdit = false;
    if (p.status === 'draft')      canEdit = isHR || isCFO;     /* NS hoặc CFO sửa */
    if (p.status === 'submitted')  canEdit = isCFO;             /* Chỉ CFO sửa */
    if (p.status === 'approved')   canEdit = isAdmin;           /* Chỉ admin */
    if (p.status === 'paid')       canEdit = false;             /* Lock hoàn toàn */

    const statusBadge = p.status === 'draft'
      ? '<span style="background:#FEF3C7;color:#854D0E;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700">📝 NHÁP (NS đang tính)</span>'
      : p.status === 'submitted'
      ? '<span style="background:#DBEAFE;color:#1E40AF;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700">📤 CHỜ CFO DUYỆT</span>'
      : p.status === 'approved'
      ? '<span style="background:#DCFCE7;color:#15803D;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700">✓ CFO ĐÃ DUYỆT</span>'
      : '<span style="background:#E0E7FF;color:#3730A3;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700">💵 ĐÃ TRẢ</span>';

    const drawer = document.getElementById('drawer');
    const dc = document.getElementById('drawerContent');
    if (!drawer || !dc) {
      window.toast?.('Page này chưa có drawer container', 'warn');
      return;
    }

    /* === Mixed-mode segment helpers === */
    function defaultSegments(payslip) {
      /* Default: 1 segment = current single config */
      return [
        { name: 'Thử việc', basicSalary: payslip.basicSalary || 0, contractType: 'probation', workActual: 0, workStandardOverride: null },
        { name: 'Chính thức', basicSalary: payslip.basicSalary || 0, contractType: 'official', workActual: payslip.workActual || 0, workStandardOverride: null },
      ];
    }
    function renderSegmentList(segments, editable) {
      return (segments || []).map((seg, i) => `
        <div class="ps-seg" data-idx="${i}" style="display:grid;grid-template-columns:140px 130px 110px 90px 1fr 32px;gap:6px;padding:6px 0;border-bottom:1px dashed #BFDBFE;align-items:center">
          <input class="ps-seg-name" data-idx="${i}" type="text" value="${(seg.name||'').replace(/"/g,'&quot;')}" placeholder="Tên đoạn" ${editable?'':'readonly'} style="border:1px solid #BFDBFE;border-radius:5px;padding:5px 7px;font-size:12px;background:#fff">
          <select class="ps-seg-contract" data-idx="${i}" ${editable?'':'disabled'} style="border:1px solid #BFDBFE;border-radius:5px;padding:5px 7px;font-size:12px;background:#fff">
            <option value="official"  ${seg.contractType==='official'?'selected':''}>Chính thức 100%</option>
            <option value="probation" ${seg.contractType==='probation'?'selected':''}>Thử việc 85%</option>
            <option value="intern"    ${seg.contractType==='intern'?'selected':''}>Thực tập 100%</option>
            <option value="parttime"  ${seg.contractType==='parttime'?'selected':''}>Part-time 100%</option>
          </select>
          <input class="ps-seg-basic ps-money" data-idx="${i}" type="text" inputmode="numeric" value="${fmtMoney(seg.basicSalary||0)}" data-raw="${parseMoney(seg.basicSalary||0)}" placeholder="LCB" ${editable?'':'readonly'} style="border:1px solid #BFDBFE;border-radius:5px;padding:5px 7px;font-size:12px;text-align:right;font-weight:700;background:#fff" title="Lương cơ bản đoạn này">
          <input class="ps-seg-work" data-idx="${i}" type="number" step="0.05" value="${seg.workActual||''}" placeholder="Công" ${editable?'':'readonly'} style="border:1px solid #BFDBFE;border-radius:5px;padding:5px 7px;font-size:12px;text-align:right;font-weight:700;background:#fff" title="Số công đoạn này">
          <input class="ps-seg-std" data-idx="${i}" type="number" value="${seg.workStandardOverride||''}" placeholder="NC chuẩn (auto)" ${editable?'':'readonly'} style="border:1px solid #BFDBFE;border-radius:5px;padding:5px 7px;font-size:12px;text-align:right;background:#fff" title="Bỏ trống = dùng mặc định theo dept">
          ${editable ? `<button onclick="window._psRemoveSegment(${i})" style="background:transparent;border:none;color:#DC2626;cursor:pointer;font-size:16px">×</button>` : '<span></span>'}
        </div>
      `).join('') || `<div style="padding:8px;color:var(--muted);text-align:center;font-size:12px">Chưa có phân đoạn</div>`;
    }

    /* Render bonus + penalty rows editable */
    function bonusRows(arr) {
      return (arr || []).map((b, i) => `
        <div class="ps-line ps-bonus" data-idx="${i}" style="display:grid;grid-template-columns:1fr 160px 32px;gap:8px;padding:6px 0;border-bottom:1px dashed var(--line)">
          <input class="ps-bonus-name" data-idx="${i}" value="${(b.name||'').replace(/"/g,'&quot;')}" placeholder="VD: Doanh số 3% nhà X" ${canEdit?'':'readonly'} style="border:1px solid var(--line);border-radius:6px;padding:5px 8px;font-size:12.5px">
          <input class="ps-bonus-amount ps-money" data-idx="${i}" type="text" inputmode="numeric" value="${b.amount ? fmtMoney(b.amount) : ''}" data-raw="${parseMoney(b.amount||0)}" placeholder="0" ${canEdit?'':'readonly'} style="border:1px solid var(--line);border-radius:6px;padding:5px 8px;text-align:right;font-size:12.5px;font-weight:700;color:#15803D">
          ${canEdit ? `<button onclick="window._psRemoveBonus(${i})" style="background:transparent;border:none;color:#DC2626;cursor:pointer;font-size:16px">×</button>` : '<span></span>'}
        </div>
      `).join('') || `<div style="padding:8px;color:var(--muted);text-align:center;font-size:12px">Chưa có khoản thưởng</div>`;
    }
    /* Lương 1 ngày công hiện tại của NV — để quy đổi khoản phạt theo NGÀY CÔNG */
    function currentDayWage() {
      try {
        const d = window._psCurrentDraft || p;
        return PF.computePayslip(Object.assign({}, d, { staffId: d.staffId || staffId, month: d.month || month })).dayWage || 0;
      } catch (e) { return 0; }
    }
    function penaltyRows(arr) {
      const dw = currentDayWage();
      return (arr || []).map((it, i) => {
        const isCong = it && it.unit === 'cong';
        const days = +((it || {}).days) || 0;
        const amt = isCong ? PF.roundK(dw * days) : ((it && it.amount) || 0);
        const dayLbl = days === 0.5 ? '½' : String(days);
        return `
        <div class="ps-line ps-pen" data-idx="${i}" data-unit="${isCong ? 'cong' : ''}" data-days="${isCong ? days : ''}" style="display:grid;grid-template-columns:1fr 160px 32px;gap:8px;padding:6px 0;border-bottom:1px dashed var(--line)">
          <input class="ps-pen-name" data-idx="${i}" value="${((it && it.name) || '').replace(/"/g,'&quot;')}" placeholder="VD: Đi muộn > 10p × 3 ngày" ${canEdit?'':'readonly'} style="border:1px solid var(--line);border-radius:6px;padding:5px 8px;font-size:12.5px">
          <input class="ps-pen-amount ps-money" data-idx="${i}" type="text" inputmode="numeric" value="${fmtMoney(amt)}" data-raw="${parseMoney(amt)}" placeholder="0" ${(canEdit && !isCong)?'':'readonly'} title="${isCong ? `Tự tính: ${dayLbl} × lương 1 ngày (${fmtMoney(dw)} ₫) — sửa Lương CB/công thì tự đổi theo` : ''}" style="border:1px solid var(--line);border-radius:6px;padding:5px 8px;text-align:right;font-size:12.5px;font-weight:700;color:#DC2626;background:${isCong ? '#F3F4F6' : '#fff'}">
          ${canEdit ? `<button onclick="window._psRemovePenalty(${i})" style="background:transparent;border:none;color:#DC2626;cursor:pointer;font-size:16px">×</button>` : '<span></span>'}
        </div>`;
      }).join('') || `<div style="padding:8px;color:var(--muted);text-align:center;font-size:12px">Không có khoản phạt</div>`;
    }

    /* === HTML drawer === */
    dc.innerHTML = `
      <div style="background:linear-gradient(135deg,#1B5E20 0%,#15803D 100%);color:#fff;padding:18px 22px;position:relative">
        <button onclick="closeDrawer()" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.15);border:none;color:#fff;width:30px;height:30px;border-radius:6px;cursor:pointer">✕</button>
        <h2 style="margin:0 0 4px;font-size:18px">💼 PHIẾU DUYỆT LƯƠNG</h2>
        <div style="font-size:12.5px;opacity:0.9">Tháng ${p.month} · ${statusBadge}</div>
      </div>

      <div style="padding:14px 18px;border-bottom:1px solid var(--line);background:#FAFBFC">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px">
          <div><b style="color:var(--navy)">${p.staffName}</b><div style="color:var(--muted);font-size:11.5px">${p.role || '—'}</div></div>
          <div style="text-align:right"><span style="background:#EFF6FF;color:#1E40AF;padding:3px 9px;border-radius:5px;font-size:11.5px;font-weight:600">${p.dept}</span></div>
        </div>
      </div>

      <div style="padding:14px 18px;overflow-y:auto;max-height:calc(100vh - 180px)">

        <!-- Cấu hình cơ bản -->
        <div class="section-h" style="margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
          <span>⚙ Cấu hình lương</span>
          <label style="font-size:11.5px;font-weight:600;color:#1E40AF;cursor:pointer;display:flex;align-items:center;gap:6px;text-transform:none" title="Bật khi NV vừa thử việc vừa chính thức trong cùng tháng">
            <input type="checkbox" id="psMixedMode" ${p.mixedMode?'checked':''} ${canEdit?'':'disabled'}>
            🔀 Lương hỗn hợp (TV + CT)
          </label>
        </div>

        <!-- ==== SINGLE MODE ==== -->
        <div id="psSingleSection" style="${p.mixedMode?'display:none':''}">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
            <div>
              <label style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">Lương cơ bản (₫)</label>
              ${moneyInput('psBasic', p.basicSalary, { readonly: !canEdit })}
            </div>
            <div>
              <label style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">Loại HĐ</label>
              <select id="psContract" ${canEdit?'':'disabled'} style="width:100%;padding:7px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px">
                <option value="official"  ${p.contractType==='official'?'selected':''}>Chính thức (100%)</option>
                <option value="probation" ${p.contractType==='probation'?'selected':''}>Thử việc (85%)</option>
                <option value="intern"    ${p.contractType==='intern'?'selected':''}>Thực tập (100%)</option>
                <option value="parttime"  ${p.contractType==='parttime'?'selected':''}>Part-time (100%)</option>
              </select>
            </div>
            <div>
              <label style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">Công thực tế</label>
              <input id="psWorkActual" type="number" step="0.05" value="${p.workActual}" ${canEdit?'':'readonly'} style="width:100%;padding:7px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px;text-align:right">
            </div>
            <div>
              <label style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">Công chuẩn (mặc định ${computed.workStandard})</label>
              <input id="psWorkStd" type="number" value="${p.workStandardOverride || ''}" placeholder="${computed.workStandard}" ${canEdit?'':'readonly'} style="width:100%;padding:7px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px;text-align:right">
            </div>
          </div>
        </div>

        <!-- ==== MIXED MODE ==== -->
        <div id="psMixedSection" style="${p.mixedMode?'':'display:none'};background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:12px 14px;margin-bottom:14px">
          <div style="font-size:11.5px;color:#1E40AF;margin-bottom:8px;line-height:1.5">
            💡 <b>Lương hỗn hợp:</b> NV có 2+ phân đoạn trong cùng tháng (vd 5 công thử việc + 25 công chính thức).
            Tổng base = Σ <i>(LCB × hệ số ÷ NC × công)</i> từng đoạn.
          </div>
          <div id="psSegList">
            ${renderSegmentList(p.segments || defaultSegments(p), canEdit)}
          </div>
          ${canEdit ? `<button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="window._psAddSegment()">➕ Thêm phân đoạn</button>` : ''}
        </div>

        <!-- Khoản TÍNH -->
        <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:12px 14px;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <b style="color:#15803D;font-size:13px">① Lương theo công</b>
            <span style="font-size:15px;font-weight:800;color:#15803D" id="psBaseSalary">${PF.formatVND(computed.baseSalary)} ₫</span>
          </div>
          <div style="font-size:11px;color:#15803D;opacity:0.8" id="psBaseFormula">${computed.breakdown.baseSalaryDetail}</div>
        </div>

        <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:12px 14px;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div>
              <b style="color:#1E40AF;font-size:13px">② Phụ cấp</b>
              <span style="font-size:11px;color:#1E40AF;opacity:0.7;margin-left:6px">
                Mặc định ${PF.formatVND(computed.allowanceMonthly)} ₫/tháng
              </span>
            </div>
            <span style="font-size:15px;font-weight:800;color:#1E40AF" id="psAllowance">${PF.formatVND(computed.allowance)} ₫</span>
          </div>
          <div id="psAllowanceDetail" style="font-size:11.5px;color:#1E40AF;line-height:1.8;background:#fff;border:1px dashed #BFDBFE;border-radius:7px;padding:8px 11px;margin-bottom:8px">${allowanceDetailHTML(computed)}</div>
          ${canEdit ? moneyInput('psAllowanceOverride', p.allowanceOverride || 0, {
            placeholder: 'Ghi đè mức phụ cấp (để trống/0 = mặc định)',
            style: 'width:100%;padding:6px 10px;font-size:12px;border:1px solid #BFDBFE;border-radius:6px;background:#fff;text-align:right'
          }) : ''}
        </div>

        <!-- THƯỞNG -->
        <div class="section-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span>③ Thưởng <span style="color:var(--ok);font-weight:700" id="psBonusTotal">+ ${PF.formatVND(computed.totalBonus)} ₫</span></span>
          ${canEdit ? '<button class="btn btn-ghost btn-sm" onclick="window._psAddBonus()">➕ Thêm khoản thưởng</button>' : ''}
        </div>
        <div id="psBonusList" style="background:#FAFBFC;border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin-bottom:${_helper.total ? '8px' : '14px'}">
          ${bonusRows(p.bonuses)}
        </div>
        ${(_helper.total || _helper.entries.length || _psLocked) ? `<details style="border:1px solid #BAE6FD;border-radius:8px;background:#F0F9FF;padding:8px 12px;margin-bottom:14px">
          <summary style="cursor:pointer;font-weight:700;color:#0369A1;font-size:12.5px">🎁 Thưởng hỗ trợ Kho/Ship (theo quy chế): + ${PF.formatVND(_psLocked ? p.helperBonus : _helper.total)} ₫ · ${_helper.entries.length} khoản <span style="font-weight:400;color:var(--muted)">— bấm xem từng ngày</span></summary>
          ${_psLocked ? `<div style="margin-top:8px;background:#F3F4F6;border:1px solid var(--line);border-radius:7px;padding:7px 10px;font-size:11.5px;color:#374151">
            🔒 Phiếu đã chốt — giữ nguyên tổng <b>${PF.formatVND(p.helperBonus)} ₫</b> tại thời điểm duyệt.
            ${_helper.total !== p.helperBonus ? `Quy chế hiện tại tính ra ${PF.formatVND(_helper.total)} ₫ (chỉ tham khảo).` : ''}
          </div>` : ''}
          ${_helper.noPolicy ? `<div style="margin-top:8px;background:#FEF2F2;border:1px solid #FECACA;border-radius:7px;padding:7px 10px;font-size:11.5px;color:#B91C1C">
            ⚠ <b>${_helper.noPolicy} khoản</b> rơi vào ngày không thuộc quy chế nào → tính 0đ. Khai bổ sung ở tab <b>🎁 Thưởng hỗ trợ → ⚙ Quy chế thưởng</b>.
          </div>` : ''}
          <div style="margin-top:8px;display:grid;gap:3px">
            ${_helper.entries.map(e => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;border-bottom:1px dashed #E0F2FE;padding:3px 0">
              <span>${(e.date || '').split('-').reverse().join('/')} · ${window.BONUS ? window.BONUS.labelOf(e) : e.task}${e.note ? ' <span style="color:var(--muted)">(' + (e.note || '').replace(/</g, '&lt;') + ')</span>' : ''}
                ${e.noPolicy ? '<span style="color:#B91C1C">· ⚠ chưa có quy chế</span>' : `<span style="color:var(--muted)">· ${(e.policyName || '').replace(/</g, '&lt;')}</span>`}</span>
              <b style="color:${e.amount ? '#0369A1' : '#B91C1C'};white-space:nowrap">+${PF.formatVND(e.amount)}</b>
            </div>`).join('')}
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:6px">Đã gộp vào tổng ③ Thưởng ở trên. Sửa ở tab <b>🎁 Thưởng hỗ trợ</b>.</div>
        </details>` : ''}

        <!-- PHẠT -->
        <div class="section-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span>④ Phạt/Trừ <span style="color:var(--danger);font-weight:700" id="psPenaltyTotal">− ${PF.formatVND(computed.totalPenalty)} ₫</span></span>
          ${canEdit ? `<div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" onclick="window._psAddPenaltyCong(0.5)" title="Trừ ½ ngày công — tự quy đổi theo lương 1 ngày của NV">➖ ½ ngày công</button>
            <button class="btn btn-ghost btn-sm" onclick="window._psAddPenaltyCong(1)" title="Trừ 1 ngày công — tự quy đổi theo lương 1 ngày của NV">➖ 1 ngày công</button>
            <button class="btn btn-ghost btn-sm" onclick="window._psAddPenalty()">➕ Khoản trừ khác</button>
          </div>` : ''}
        </div>
        <div id="psPenaltyList" style="background:#FAFBFC;border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin-bottom:14px">
          ${penaltyRows(p.penalties)}
        </div>

        <!-- ⏰ Phạt đi muộn AUTO (link với chấm công) -->
        <div style="background:${lateAuto.count?'#FEF2F2':'#F9FAFB'};border:1px solid ${lateAuto.count?'#FECACA':'var(--line)'};border-radius:10px;padding:12px 14px;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div>
              <b style="color:${lateAuto.count?'#DC2626':'var(--muted)'};font-size:13px">⏰ Phạt đi muộn (tự tính từ chấm công)</b>
              <div style="font-size:11px;color:var(--muted);margin-top:2px">${lateAuto.count?lateAuto.count+' lần muộn':'Không có lần nào'}
                · <a href="javascript:window.openLatePolicySettings && window.openLatePolicySettings()" style="color:#1E40AF">Sửa khung phạt</a></div>
            </div>
            <span id="psLateTotal" style="font-size:15px;font-weight:800;color:${lateAuto.count?'#DC2626':'var(--muted)'}">${lateAuto.count?'− '+PF.formatVND(lateAuto.total)+' ₫':'— 0 ₫'}</span>
          </div>
          <div id="psLateDetail">${lateDetailHTML(lateAuto, computed.dayWage)}</div>
        </div>

        <!-- ⑤ HOA HỒNG (phiếu lập từ v418 mới có; phiếu cũ giữ nguyên, không hiện) -->
        ${isLegacyComm ? '' : `
        <div class="section-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span>⑤ Hoa hồng <span style="color:#B45309;font-weight:700" id="psCommTotal">+ ${PF.formatVND(computed.commission.amount)} ₫</span></span>
        </div>
        <div style="display:grid;grid-template-columns:1.4fr 96px 1fr;gap:10px;margin-bottom:6px">
          <div>
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">Cách tính</label>
            <select id="psCommMode" ${canEdit?'':'disabled'} style="width:100%;padding:8px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px;background:#fff">
              <option value="none"   ${p.commMode==='none'?'selected':''}>— Không có —</option>
              <option value="auto"   ${p.commMode==='auto'?'selected':''}>📈 % × doanh thu</option>
              <option value="manual" ${p.commMode==='manual'?'selected':''}>✍️ Gõ tay</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">% hoa hồng</label>
            <input id="psCommPct" type="number" step="0.1" min="0" max="100" value="${p.commissionPct||''}" ${(canEdit && p.commMode==='auto')?'':'readonly'} style="width:100%;padding:8px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px;text-align:right;box-sizing:border-box">
          </div>
          <div>
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">Số tiền hoa hồng (₫)</label>
            ${moneyInput('psCommAmount', computed.commission.amount, { readonly: !canEdit || p.commMode !== 'manual', placeholder: '0' })}
          </div>
        </div>
        <div id="psCommHint" style="font-size:11.5px;color:var(--muted);margin-bottom:6px"></div>
        ${_hasCommissionBonus(p) ? `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:7px;padding:7px 10px;font-size:11.5px;color:#92400E;margin-bottom:14px">
          ⚠ Phiếu này đã có khoản <b>thưởng</b> mang tên hoa hồng — nên hoa hồng tự động đang <b>tắt</b> để không cộng trùng.
          Muốn dùng hoa hồng tự động thì <b>xoá dòng thưởng đó</b> ở mục ③ trước.
        </div>` : '<div style="margin-bottom:8px"></div>'}`}

        <!-- ⑥ BHXH + TẠM ỨNG -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;align-items:start">
          ${isLegacyBhxh ? `
          <div>
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">🛡 BHXH (₫/tháng)</label>
            ${moneyInput('psBhxh', p.bhxh, { readonly: !canEdit, placeholder: '0 hoặc 578.000' })}
            <div style="font-size:11px;color:var(--muted);margin-top:4px">Phiếu lập trước bản v418 — giữ nguyên cách nhập cũ để không đổi số đã chốt.</div>
          </div>` : `
          <div style="border:1px solid #E9D5FF;background:#FAF5FF;border-radius:8px;padding:10px 12px">
            <label class="check-item" style="font-weight:700;color:#6B21A8;font-size:12.5px">
              <input type="checkbox" id="psBhxhOn" ${p.bhxhOn?'checked':''} ${canEdit?'':'disabled'}>
              <span>🛡 Đóng BHXH</span>
            </label>
            <div style="font-size:11px;color:#6B21A8;opacity:.8;margin-top:3px">Tích 1 lần → ghi vào hồ sơ NV, <b>các tháng sau tự áp</b> (không phải tích lại).</div>
            <div id="psBhxhBox" style="display:${p.bhxhOn?'':'none'};margin-top:8px">
              <label style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">Mức lương cơ sở đóng BH</label>
              ${moneyInput('psBhxhBase', p.bhxhBase || _bhxhDefaultBase(), { readonly: !canEdit, placeholder: '5.500.000' })}
              <div style="font-size:11.5px;margin-top:6px;line-height:1.65">
                NV <b>${computed.bhxhRates.empPct}%</b>: <b style="color:#7C3AED" id="psBhxhEmp">−${PF.formatVND(computed.bhxhEmp)} ₫</b><br>
                DN <b>${computed.bhxhRates.comPct}%</b>: <span style="color:#6B7280" id="psBhxhCom">${PF.formatVND(computed.bhxhCom)} ₫</span>
                <span style="color:var(--muted)">— công ty chi, <b>không</b> trừ NV</span>
              </div>
            </div>
          </div>`}
          <div>
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">💵 Tạm ứng đã ứng (₫)</label>
            ${moneyInput('psAdvance', p.advance, { readonly: !canEdit, placeholder: '0' })}
          </div>
        </div>

        <!-- GHI CHÚ -->
        <div style="margin-bottom:14px">
          <label style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">📝 Ghi chú</label>
          <textarea id="psNotes" placeholder="VD: Mỗi tháng 1 ngày nghỉ có lương; Trừ 578k BHXH..." ${canEdit?'':'readonly'} style="width:100%;padding:8px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px;resize:vertical;min-height:60px">${p.notes||''}</textarea>
        </div>

        <!-- TỔNG -->
        <div style="background:linear-gradient(135deg,#1B5E20,#15803D);color:#fff;padding:18px 20px;border-radius:12px;text-align:center">
          <div style="font-size:13px;opacity:0.9;margin-bottom:6px">TỔNG THỰC LĨNH</div>
          <div style="font-size:28px;font-weight:800" id="psTotal">${PF.formatVND(computed.total)} ₫</div>
          <div style="font-size:11px;opacity:0.85;margin-top:6px" id="psBreakdownText">
            ${PF.formatVND(computed.baseSalary)} + ${PF.formatVND(computed.allowance)} + ${PF.formatVND(computed.totalBonus)} − ${PF.formatVND(computed.totalPenalty)} − ${PF.formatVND(lateAuto.total)}<sub>muộn</sub> − ${PF.formatVND(computed.bhxh)} − ${PF.formatVND(computed.advance)}
          </div>
        </div>

      </div>

      <!-- Footer actions theo 4-step workflow -->
      <div style="padding:12px 18px;border-top:1px solid var(--line);background:#fff;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${(() => {
          /* Status: draft */
          if (p.status === 'draft') {
            return `
              ${canEdit ? '<button class="btn btn-ghost" onclick="window._psSave()">💾 Lưu nháp</button>' : ''}
              ${isHR ? '<button class="btn btn-navy" onclick="window._psSubmit()" title="Gửi bảng lương dự kiến cho CFO duyệt">📤 Gửi CFO duyệt</button>' : ''}
              ${isCFO && !isHR ? '<button class="btn btn-primary" onclick="window._psApprove()" title="Duyệt thẳng (admin/CFO)">✓ Duyệt thẳng</button>' : ''}
            `;
          }
          /* Status: submitted — chờ CFO duyệt */
          if (p.status === 'submitted') {
            if (isCFO) return `
              ${canEdit ? '<button class="btn btn-ghost" onclick="window._psSave()" title="Lưu thay đổi (CFO sửa)">💾 Lưu chỉnh sửa</button>' : ''}
              <button class="btn btn-ghost" onclick="window._psReturnDraft()" style="color:#A16207" title="Trả về NS sửa lại">↩ Trả về sửa</button>
              <button class="btn btn-primary" onclick="window._psApprove()" title="Duyệt phiếu lương">✓ Duyệt phiếu</button>
            `;
            return `<span style="background:#FEF3C7;color:#854D0E;padding:8px 14px;border-radius:7px;font-size:12.5px">⏳ Đang chờ CFO duyệt — không được sửa</span>`;
          }
          /* Status: approved */
          if (p.status === 'approved') {
            return `
              ${isAdmin ? '<button class="btn btn-ghost" onclick="window._psReturnDraft()" title="Mở lại để sửa (admin only)">↩ Mở lại sửa</button>' : ''}
              ${isCFO || isAdmin ? '<button class="btn btn-primary" onclick="window._psPay()">💵 Đã trả lương</button>' : '<span style="color:var(--ok);padding:8px 14px;font-weight:600">✓ Đã duyệt — đợi NS trả</span>'}
            `;
          }
          /* Status: paid */
          return `<span style="color:var(--ok);padding:8px 14px;font-weight:600">✓ Đã hoàn tất · Phiếu chi đã tạo ở Sổ quỹ</span>`;
        })()}
        <div style="flex:1"></div>
        <button class="btn btn-ghost" onclick="closeDrawer()">Đóng</button>
      </div>
    `;

    /* === Wire live recalculate khi user gõ === */
    window._psCurrentDraft = JSON.parse(JSON.stringify(p));

    function collect() {
      const d = window._psCurrentDraft;
      d.mixedMode = !!document.getElementById('psMixedMode')?.checked;
      if (d.mixedMode) {
        /* Đọc segments từ DOM */
        const readSegAmount = (el) => {
          if (!el) return 0;
          return parseMoney(el === document.activeElement ? el.value : (el.dataset.raw ?? el.value));
        };
        d.segments = Array.from(document.querySelectorAll('.ps-seg')).map(el => ({
          name: el.querySelector('.ps-seg-name')?.value || '',
          contractType: el.querySelector('.ps-seg-contract')?.value || 'official',
          basicSalary: readSegAmount(el.querySelector('.ps-seg-basic')),
          workActual: +(el.querySelector('.ps-seg-work')?.value || 0),
          workStandardOverride: +el.querySelector('.ps-seg-std')?.value || null,
        }));
        /* Báo cáo workActual tổng + basicSalary trung bình cho display compat */
        d.workActual = d.segments.reduce((s, x) => s + x.workActual, 0);
      } else {
        d.basicSalary = getMoneyRaw('psBasic');
        d.contractType = document.getElementById('psContract')?.value || 'official';
        d.workActual = +(document.getElementById('psWorkActual')?.value || 0);
      }
      const wsv = document.getElementById('psWorkStd')?.value;
      d.workStandardOverride = wsv ? +wsv : null;
      const ao = getMoneyRaw('psAllowanceOverride');
      d.allowanceOverride = ao || null;
      /* BHXH: có checkbox = phiếu mới (tự tính NV/DN) · không có = phiếu cũ (giữ ô nhập tiền cũ) */
      const bhxhOnEl = document.getElementById('psBhxhOn');
      if (bhxhOnEl) {
        d.bhxhOn = !!bhxhOnEl.checked;
        d.bhxhBase = getMoneyRaw('psBhxhBase');
        d.bhxh = 0;
      } else if (document.getElementById('psBhxh')) {
        d.bhxh = getMoneyRaw('psBhxh');   /* legacy — KHÔNG set bhxhOn để engine giữ nguyên số cũ */
      }
      /* Hoa hồng: chỉ ghi khi phiếu có mục này (phiếu cũ không có → không cộng trùng) */
      const commModeEl = document.getElementById('psCommMode');
      if (commModeEl) {
        d.commMode = commModeEl.value;
        d.commissionPct = parseFloat(document.getElementById('psCommPct')?.value) || 0;
        d.commissionAmount = getMoneyRaw('psCommAmount');
      }
      d.advance = getMoneyRaw('psAdvance');
      d.notes = document.getElementById('psNotes')?.value || '';
      /* Collect bonus/penalty từ DOM — đọc raw từ data-raw nếu blur, value nếu đang focus */
      const readAmount = (el) => {
        if (!el) return 0;
        return parseMoney(el === document.activeElement ? el.value : (el.dataset.raw ?? el.value));
      };
      d.bonuses = Array.from(document.querySelectorAll('.ps-bonus')).map(el => ({
        name: el.querySelector('.ps-bonus-name')?.value || '',
        amount: readAmount(el.querySelector('.ps-bonus-amount')),
      })).filter(b => b.amount > 0 || b.name);
      d.penalties = Array.from(document.querySelectorAll('.ps-pen')).map(el => {
        const row = {
          name: el.querySelector('.ps-pen-name')?.value || '',
          amount: readAmount(el.querySelector('.ps-pen-amount')),
        };
        /* Khoản phạt theo NGÀY CÔNG: giữ unit+days để engine tự quy đổi lại theo lương ngày */
        if (el.dataset.unit === 'cong') { row.unit = 'cong'; row.days = +el.dataset.days || 0; }
        return row;
      }).filter(x => x.amount > 0 || x.name || x.unit === 'cong');
      /* Phiếu ĐÃ nộp/duyệt/trả → giữ nguyên tổng thưởng hỗ trợ đã chốt (không tính lại theo quy chế mới) */
      if (d.status && d.status !== 'draft') d.helperBonus = +d.helperBonus || 0;   /* đã chốt ⇒ giữ nguyên */
      else d.helperBonus = window.BONUS ? window.BONUS.helperFor(d.staffId || staffId, d.month || month).total : 0;
      return d;
    }
    function refreshComputed() {
      const d = collect();
      /* Đảm bảo lateAuto luôn được tính lại theo chấm công + latePolicy hiện tại */
      d.staffId = d.staffId || staffId;
      d.month = d.month || month;
      const c = PF.computePayslip(d);
      const la = c.lateAuto || { count: 0, total: 0 };
      document.getElementById('psBaseSalary').textContent = PF.formatVND(c.baseSalary) + ' ₫';
      document.getElementById('psBaseFormula').textContent = c.breakdown.baseSalaryDetail;
      document.getElementById('psAllowance').textContent = PF.formatVND(c.allowance) + ' ₫';
      const adEl = document.getElementById('psAllowanceDetail');
      if (adEl) adEl.innerHTML = allowanceDetailHTML(c);   /* giải thích phụ cấp cập nhật theo công/mức mới */
      document.getElementById('psBonusTotal').textContent = '+ ' + PF.formatVND(c.totalBonus) + ' ₫';
      document.getElementById('psPenaltyTotal').textContent = '− ' + PF.formatVND(c.totalPenalty) + ' ₫';
      document.getElementById('psTotal').textContent = PF.formatVND(c.total) + ' ₫';

      /* Phạt muộn: mức khai theo "ngày công" đổi theo LCB/công → vẽ lại khối này */
      const lateTotEl = document.getElementById('psLateTotal');
      if (lateTotEl) {
        lateTotEl.textContent = la.count ? '− ' + PF.formatVND(la.total) + ' ₫' : '— 0 ₫';
        lateTotEl.style.color = la.count ? '#DC2626' : 'var(--muted)';
      }
      const lateDetEl = document.getElementById('psLateDetail');
      if (lateDetEl) lateDetEl.innerHTML = lateDetailHTML(la, c.dayWage);

      /* Khoản phạt theo NGÀY CÔNG → cập nhật lại số tiền khi LCB/công thay đổi */
      (c.penalties || []).forEach((pp, i) => {
        if (!pp || pp.unit !== 'cong') return;
        const el = document.querySelector(`.ps-pen[data-idx="${i}"] .ps-pen-amount`);
        if (el) { el.value = fmtMoney(pp.amount); el.dataset.raw = pp.amount; }
      });

      /* Hoa hồng */
      const cm = c.commission || { mode: 'none', amount: 0, pct: 0, revenue: 0 };
      const commTotal = document.getElementById('psCommTotal');
      if (commTotal) commTotal.textContent = '+ ' + PF.formatVND(cm.amount) + ' ₫';
      const commAmtEl = document.getElementById('psCommAmount');
      const commPctEl = document.getElementById('psCommPct');
      if (commAmtEl) {
        const auto = cm.mode === 'auto';
        if (auto) { commAmtEl.value = fmtMoney(cm.amount); commAmtEl.dataset.raw = cm.amount; }
        commAmtEl.readOnly = !canEdit || cm.mode !== 'manual';
        if (commPctEl) commPctEl.readOnly = !canEdit || !auto;
      }
      const hint = document.getElementById('psCommHint');
      if (hint) {
        hint.innerHTML = cm.mode === 'auto'
          ? `${cm.pct}% × doanh thu <b>${PF.formatVND(cm.revenue)} ₫</b> (${SCOPE_LABEL[cm.scope] || ''}) = <b style="color:#B45309">${PF.formatVND(cm.amount)} ₫</b>`
          : cm.mode === 'manual'
            ? 'Kế toán tự nhập số tiền hoa hồng cho vị trí này.'
            : 'NV này không tính hoa hồng — đổi cách tính trong hồ sơ NV.';
      }

      /* BHXH NV / DN */
      const empEl = document.getElementById('psBhxhEmp');
      if (empEl) empEl.textContent = '−' + PF.formatVND(c.bhxhEmp) + ' ₫';
      const comEl = document.getElementById('psBhxhCom');
      if (comEl) comEl.textContent = PF.formatVND(c.bhxhCom) + ' ₫';

      const bt = document.getElementById('psBreakdownText');
      if (bt) bt.innerHTML = `${PF.formatVND(c.baseSalary)} + ${PF.formatVND(c.allowance)}<sub>PC</sub> + ${PF.formatVND(c.totalBonus)}<sub>thưởng</sub>${cm.amount ? ' + ' + PF.formatVND(cm.amount) + '<sub>HH</sub>' : ''} − ${PF.formatVND(c.totalPenalty)}<sub>phạt</sub> − ${PF.formatVND(la.total)}<sub>muộn</sub> − ${PF.formatVND(c.bhxhEmp)}<sub>BHXH NV</sub> − ${PF.formatVND(c.advance)}<sub>ứng</sub>`;
    }

    /* Bind inputs */
    dc.querySelectorAll('input, select, textarea').forEach(el => {
      el.addEventListener('input', refreshComputed);
      el.addEventListener('change', refreshComputed);
    });
    /* Money inputs: format on blur, raw on focus */
    wireMoneyInputs(dc);

    /* Bật/tắt ô "mức lương cơ sở" theo checkbox BHXH */
    document.getElementById('psBhxhOn')?.addEventListener('change', e => {
      const box = document.getElementById('psBhxhBox');
      if (box) box.style.display = e.target.checked ? '' : 'none';
    });
    /* Điền hint hoa hồng + trạng thái readonly ngay khi mở phiếu */
    try { refreshComputed(); } catch (e) {}

    /* === Toggle Mixed Mode === */
    document.getElementById('psMixedMode')?.addEventListener('change', e => {
      const on = e.target.checked;
      document.getElementById('psSingleSection').style.display = on ? 'none' : '';
      document.getElementById('psMixedSection').style.display = on ? '' : 'none';
      /* Khi BẬT lần đầu chưa có segments → seed default */
      if (on && (!window._psCurrentDraft.segments || window._psCurrentDraft.segments.length === 0)) {
        window._psCurrentDraft.segments = defaultSegments(window._psCurrentDraft);
        document.getElementById('psSegList').innerHTML = renderSegmentList(window._psCurrentDraft.segments, canEdit);
        /* Rewire money inputs trong segments mới */
        wireMoneyInputs(document.getElementById('psSegList'));
        document.querySelectorAll('#psSegList input, #psSegList select').forEach(el => {
          el.addEventListener('input', refreshComputed);
          el.addEventListener('change', refreshComputed);
        });
      }
      refreshComputed();
    });

    /* === Segment add/remove === */
    window._psAddSegment = function () {
      const d = collect();
      if (!d.segments) d.segments = [];
      d.segments.push({ name: 'Phân đoạn ' + (d.segments.length + 1), basicSalary: 0, contractType: 'official', workActual: 0 });
      window._psCurrentDraft = d;
      const list = document.getElementById('psSegList');
      list.innerHTML = renderSegmentList(d.segments, canEdit);
      wireMoneyInputs(list);
      list.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', refreshComputed);
        el.addEventListener('change', refreshComputed);
      });
      refreshComputed();
    };
    window._psRemoveSegment = function (idx) {
      const d = collect();
      if (d.segments) d.segments.splice(idx, 1);
      window._psCurrentDraft = d;
      const list = document.getElementById('psSegList');
      list.innerHTML = renderSegmentList(d.segments, canEdit);
      wireMoneyInputs(list);
      list.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', refreshComputed);
        el.addEventListener('change', refreshComputed);
      });
      refreshComputed();
    };

    /* === Action helpers (expose to window) === */
    window._psAddBonus = function () {
      const d = collect();
      d.bonuses.push({ name:'', amount: 0 });
      window._psCurrentDraft = d;
      const list = document.getElementById('psBonusList');
      list.innerHTML = bonusRows(d.bonuses);
      list.querySelectorAll('input').forEach(el => {
        el.addEventListener('input', refreshComputed);
        el.addEventListener('change', refreshComputed);
      });
      wireMoneyInputs(list);
    };
    window._psRemoveBonus = function (idx) {
      const d = collect();
      d.bonuses.splice(idx, 1);
      window._psCurrentDraft = d;
      const list = document.getElementById('psBonusList');
      list.innerHTML = bonusRows(d.bonuses);
      list.querySelectorAll('input').forEach(el => {
        el.addEventListener('input', refreshComputed);
        el.addEventListener('change', refreshComputed);
      });
      wireMoneyInputs(list);
      refreshComputed();
    };
    window._psAddPenalty = function () {
      const d = collect();
      d.penalties.push({ name:'', amount: 0 });
      window._psCurrentDraft = d;
      const list = document.getElementById('psPenaltyList');
      list.innerHTML = penaltyRows(d.penalties);
      list.querySelectorAll('input').forEach(el => {
        el.addEventListener('input', refreshComputed);
        el.addEventListener('change', refreshComputed);
      });
      wireMoneyInputs(list);
    };
    /* Phạt theo NGÀY CÔNG (½ hoặc 1 ngày) — số tiền tự quy đổi từ lương 1 ngày, không gõ tay */
    window._psAddPenaltyCong = function (days) {
      const d = collect();
      d.penalties.push({ name: `Trừ ${days === 0.5 ? '½' : days} ngày công`, unit: 'cong', days, amount: 0 });
      window._psCurrentDraft = d;
      const list = document.getElementById('psPenaltyList');
      list.innerHTML = penaltyRows(d.penalties);
      list.querySelectorAll('input').forEach(el => {
        el.addEventListener('input', refreshComputed);
        el.addEventListener('change', refreshComputed);
      });
      wireMoneyInputs(list);
      refreshComputed();
    };
    window._psRemovePenalty = function (idx) {
      const d = collect();
      d.penalties.splice(idx, 1);
      window._psCurrentDraft = d;
      const list = document.getElementById('psPenaltyList');
      list.innerHTML = penaltyRows(d.penalties);
      list.querySelectorAll('input').forEach(el => {
        el.addEventListener('input', refreshComputed);
        el.addEventListener('change', refreshComputed);
      });
      wireMoneyInputs(list);
      refreshComputed();
    };

    /* Tích BHXH / đổi cách tính hoa hồng NGAY TRÊN PHIẾU → ghi ngược về hồ sơ NV
       (KV payrollStaffCfg) để THÁNG SAU tự áp, khỏi phải tích lại mỗi tháng.
       Chỉ chạy khi phiếu còn NHÁP hoặc vừa gửi — phiếu đã duyệt/đã trả không đụng tới,
       và việc ghi cấu hình KHÔNG làm đổi một đồng nào của các phiếu đã chốt (chúng lưu số riêng). */
    function _syncCfgToStaff(d) {
      if (!PF.setStaffPayCfg || !d.staffId) return;
      if (d.bhxhOn == null && d.commMode == null) return;    /* phiếu legacy — không có 2 mục này */
      const cur = PF.getStaffPayCfg(d.staffId);
      const next = {
        bhxhOn:   !!d.bhxhOn,
        bhxhBase: d.bhxhOn ? (+d.bhxhBase || _bhxhDefaultBase()) : 0,
        commMode: d.commMode || 'none',
        commPct:  +d.commissionPct || 0,
        commScope: d.commScope || cur.commScope,
      };
      const same = cur.bhxhOn === next.bhxhOn && cur.bhxhBase === next.bhxhBase &&
                   cur.commMode === next.commMode && cur.commPct === next.commPct &&
                   cur.commScope === next.commScope;
      if (same) return;
      PF.setStaffPayCfg(d.staffId, next);
      window.toast?.(`💾 Đã ghi vào hồ sơ ${d.staffName} — các tháng sau tự áp`, 'info');
    }

    window._psSave = function () {
      const d = collect();
      const c = PF.computePayslip(d);
      const final = { ...d, ...computedSnapshot(c) };
      savePayslip(final);
      _syncCfgToStaff(final);
      window.toast?.('✓ Đã lưu phiếu nháp', 'success');
    };

    /* === HR/NS gửi CFO duyệt === */
    window._psSubmit = function () {
      if (!confirm('Gửi phiếu lương ' + p.staffName + ' cho CFO duyệt?\n\nSau khi gửi anh/chị KHÔNG sửa được nữa — chỉ CFO mới sửa được.')) return;
      const d = collect();
      const c = PF.computePayslip(d);
      const user = (window.AUTH && window.AUTH.currentUser()) || {};
      const final = {
        ...d,
        ...computedSnapshot(c),
        status: 'submitted',
        submittedBy: user.name || user.email || 'NS',
        submittedAt: new Date().toISOString(),
      };
      savePayslip(final);
      _syncCfgToStaff(final);
      window.toast?.('📤 Đã gửi CFO · ' + PF.formatVND(c.total) + ' ₫', 'success');
      closeDrawer();
    };

    /* === CFO duyệt phiếu === */
    window._psApprove = function () {
      if (!confirm('Duyệt phiếu lương cho ' + p.staffName + '?\n\nSau khi duyệt sẽ KHÔNG sửa được (trừ admin).')) return;
      const d = collect();
      const c = PF.computePayslip(d);
      const user = (window.AUTH && window.AUTH.currentUser()) || {};
      const final = {
        ...d,
        ...computedSnapshot(c),
        status: 'approved',
        approvedBy: user.name || user.email || 'CFO',
        approvedAt: new Date().toISOString(),
      };
      savePayslip(final);
      window.toast?.('✓ CFO đã duyệt · ' + PF.formatVND(c.total) + ' ₫', 'success');
      closeDrawer();
    };

    /* === CFO/Admin trả về NS sửa === */
    window._psReturnDraft = function () {
      const reason = prompt('Trả về NS sửa lại — Lý do (gửi cho NS biết để sửa):');
      if (!reason) return;
      const d = collect();
      const final = {
        ...d,
        status: 'draft',
        returnReason: reason,
        returnedAt: new Date().toISOString(),
      };
      savePayslip(final);
      window.toast?.('↩ Đã trả phiếu về NS sửa', 'warn');
      closeDrawer();
    };

    window._psPay = function () {
      if (!confirm('Đánh dấu đã TRẢ lương cho ' + p.staffName + '?\n\nSẽ tự tạo phiếu chi vào Sổ quỹ.')) return;
      const d = collect();
      const final = { ...d, paid: true, status: 'paid', paidAt: new Date().toISOString() };
      savePayslip(final);
      /* cross-module-hooks.js subscribe 'payrollExtra' sẽ tự tạo cashEntries */
      window.toast?.('✓ Đã trả lương + tạo phiếu chi Sổ quỹ', 'success');
      closeDrawer();
    };

    /* Show drawer */
    drawer.classList.add('open');
    document.getElementById('drawerBg')?.classList.add('open');
  };

  /* =========================================================
     BẢNG LƯƠNG DỰ KIẾN — CFO xem hàng loạt + duyệt nhanh
     ========================================================= */
  window.openPayslipBatchReview = function (month) {
    month = month || '2026-' + String(new Date().getMonth()+1).padStart(2,'0');
    const hasPerm = (perm) => !!(window.AUTH && window.AUTH.hasPerm && window.AUTH.hasPerm(perm));
    const isAdmin = hasPerm('all');
    const isCFO = isAdmin || hasPerm('payroll.approve');
    if (!isCFO) {
      window.toast?.('⚠ Chỉ CFO mới xem được bảng dự kiến', 'warn');
      return;
    }

    const payslips = getPayslips().filter(p => p.month === month);
    const staffs = (window.STORE.get('staff', []) || []).filter(s => s.status === 'active');

    /* Gom phiếu theo status */
    const submitted = payslips.filter(p => p.status === 'submitted');
    const approved = payslips.filter(p => p.status === 'approved');
    const paid = payslips.filter(p => p.status === 'paid');
    const draft = payslips.filter(p => p.status === 'draft');

    const totalSubmit = submitted.reduce((s, p) => s + (p.total || 0), 0);
    const totalApproved = approved.reduce((s, p) => s + (p.total || 0), 0);
    const totalPaid = paid.reduce((s, p) => s + (p.total || 0), 0);

    const drawer = document.getElementById('drawer');
    const dc = document.getElementById('drawerContent');
    if (!drawer || !dc) return;

    /* Render list NV với status */
    function renderRow(s) {
      const ps = payslips.find(p => p.staffId === s.id);
      const status = ps?.status || 'none';
      const total = ps?.total || 0;
      const statusBadge = {
        'none':      '<span style="color:var(--muted);font-size:11px">— Chưa lập</span>',
        'draft':     '<span style="background:#FEF3C7;color:#854D0E;padding:2px 8px;border-radius:6px;font-size:10.5px;font-weight:700">NHÁP</span>',
        'submitted': '<span style="background:#DBEAFE;color:#1E40AF;padding:2px 8px;border-radius:6px;font-size:10.5px;font-weight:700">📤 CHỜ DUYỆT</span>',
        'approved':  '<span style="background:#DCFCE7;color:#15803D;padding:2px 8px;border-radius:6px;font-size:10.5px;font-weight:700">✓ DUYỆT</span>',
        'paid':      '<span style="background:#E0E7FF;color:#3730A3;padding:2px 8px;border-radius:6px;font-size:10.5px;font-weight:700">💵 TRẢ</span>',
      }[status];
      return `<tr style="border-bottom:1px solid var(--line)">
        <td style="padding:8px 10px"><b>${s.name}</b><div style="color:var(--muted);font-size:11px">${s.dept || '?'}</div></td>
        <td class="num" style="padding:8px 10px">${PF.formatVND(s.salary || 0)}</td>
        <td style="padding:8px 10px">${statusBadge}</td>
        <td class="num" style="padding:8px 10px"><b style="color:var(--red)">${total ? PF.formatVND(total) + ' ₫' : '—'}</b></td>
        <td class="num" style="padding:8px 10px">
          <button class="btn btn-ghost btn-sm" onclick="window.openPayslipDrawer('${s.id}', '${month}')">${ps ? '👁 Xem' : '➕ Lập'}</button>
        </td>
      </tr>`;
    }

    dc.innerHTML = `
      <div style="background:linear-gradient(135deg,#1B5E20 0%,#15803D 100%);color:#fff;padding:18px 22px;position:relative">
        <button onclick="closeDrawer()" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.15);border:none;color:#fff;width:30px;height:30px;border-radius:6px;cursor:pointer">✕</button>
        <h2 style="margin:0 0 4px;font-size:18px">📊 BẢNG LƯƠNG DỰ KIẾN — CFO DUYỆT</h2>
        <div style="font-size:12.5px;opacity:0.9">Tháng ${month} · ${staffs.length} NV active · ${payslips.length} phiếu đã lập</div>
      </div>

      <!-- 4 KPI status -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:14px 16px;background:#FAFBFC;border-bottom:1px solid var(--line)">
        <div style="background:#FEF3C7;padding:10px 12px;border-radius:7px">
          <div style="font-size:10.5px;color:#854D0E;text-transform:uppercase;font-weight:700">📝 Nháp</div>
          <div style="font-size:18px;font-weight:800;color:#854D0E">${draft.length}</div>
          <div style="font-size:11px;color:#A16207">NS đang tính</div>
        </div>
        <div style="background:#DBEAFE;padding:10px 12px;border-radius:7px">
          <div style="font-size:10.5px;color:#1E40AF;text-transform:uppercase;font-weight:700">📤 Chờ duyệt</div>
          <div style="font-size:18px;font-weight:800;color:#1E40AF">${submitted.length}</div>
          <div style="font-size:11px;color:#1E40AF">${PF.formatVND(totalSubmit)} ₫</div>
        </div>
        <div style="background:#DCFCE7;padding:10px 12px;border-radius:7px">
          <div style="font-size:10.5px;color:#15803D;text-transform:uppercase;font-weight:700">✓ Đã duyệt</div>
          <div style="font-size:18px;font-weight:800;color:#15803D">${approved.length}</div>
          <div style="font-size:11px;color:#15803D">${PF.formatVND(totalApproved)} ₫</div>
        </div>
        <div style="background:#E0E7FF;padding:10px 12px;border-radius:7px">
          <div style="font-size:10.5px;color:#3730A3;text-transform:uppercase;font-weight:700">💵 Đã trả</div>
          <div style="font-size:18px;font-weight:800;color:#3730A3">${paid.length}</div>
          <div style="font-size:11px;color:#3730A3">${PF.formatVND(totalPaid)} ₫</div>
        </div>
      </div>

      <!-- Actions hàng loạt -->
      ${submitted.length > 0 ? `
      <div style="padding:10px 18px;background:#FEF9E7;border-bottom:1px solid #F5E0A6">
        <button class="btn btn-primary" onclick="window._psApproveAllSubmitted('${month}')">
          ✓ DUYỆT TẤT CẢ ${submitted.length} PHIẾU CHỜ — Tổng ${PF.formatVND(totalSubmit)} ₫
        </button>
        <span style="font-size:11.5px;color:#854D0E;margin-left:10px">⚠ Nên review từng phiếu trước khi duyệt hàng loạt</span>
      </div>
      ` : ''}

      <!-- Table NV -->
      <div style="padding:14px 18px;max-height:calc(100vh - 320px);overflow-y:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead>
            <tr style="background:#1B5E20;color:#fff">
              <th style="padding:10px;text-align:left">Nhân viên</th>
              <th style="padding:10px;text-align:right">LCB (₫)</th>
              <th style="padding:10px;text-align:left">Trạng thái</th>
              <th style="padding:10px;text-align:right">Thực lĩnh</th>
              <th style="padding:10px;text-align:right"></th>
            </tr>
          </thead>
          <tbody>
            ${staffs.map(renderRow).join('')}
          </tbody>
        </table>
      </div>
    `;

    /* Approve all submitted */
    window._psApproveAllSubmitted = function (m) {
      if (!confirm(`Duyệt TẤT CẢ ${submitted.length} phiếu chờ?\n\nTổng: ${PF.formatVND(totalSubmit)} ₫\n\nHành động này KHÔNG thể hoàn tác.`)) return;
      const user = (window.AUTH && window.AUTH.currentUser()) || {};
      const now = new Date().toISOString();
      const count = getPayslips().filter(p => p.month === m && p.status === 'submitted').length;
      /* Idempotent: chạy lần 2 không còn phiếu 'submitted' nào của tháng m → không đổi gì */
      _psMut(list => {
        list.forEach(p => {
          if (p && p.month === m && p.status === 'submitted') {
            p.status = 'approved';
            p.approvedBy = user.name || 'CFO';
            p.approvedAt = now;
          }
        });
        return list;
      });
      window.toast?.(`✓ Đã duyệt ${count} phiếu · Tổng ${PF.formatVND(totalSubmit)} ₫`, 'success');
      window.openPayslipBatchReview(m); /* refresh */
    };

    drawer.classList.add('open');
    document.getElementById('drawerBg')?.classList.add('open');
  };

  /* =========================================================
     BATCH SUBMIT — HR gửi TẤT CẢ phiếu (draft + chưa lập) cho CFO
     ========================================================= */
  window.submitAllDrafts = function (month) {
    month = month || '2026-' + String(new Date().getMonth()+1).padStart(2,'0');
    const hasPerm = (perm) => !!(window.AUTH && window.AUTH.hasPerm && window.AUTH.hasPerm(perm));
    const isAdmin = hasPerm('all');
    const isHR = isAdmin || hasPerm('payroll.calc') || hasPerm('payroll.submit');
    if (!isHR) {
      window.toast?.('🔒 Bạn không có quyền gửi phiếu lương cho CFO (cần perm payroll.submit/payroll.calc)', 'warn');
      return;
    }
    /* Chưa nạp xong sổ lương/chấm công → phân loại draft/none sẽ SAI và tạo trùng phiếu */
    if (window.STORE.kvReady && (!window.STORE.kvReady('payrollExtra') || !window.STORE.kvReady('timesheet'))) {
      window.toast?.('⏳ Đang tải bảng lương từ máy chủ — thử lại sau 1–2 giây', 'warn');
      return;
    }

    const staffs = (window.STORE.get('staff', []) || []).filter(s => s.status === 'active');
    const list = getPayslips();
    const monthPayslipsByStaff = Object.fromEntries(
      list.filter(p => p.month === month).map(p => [p.staffId, p])
    );

    /* Phân loại: draft (sẽ submit), none (sẽ auto-tạo + submit), submitted+ (bỏ qua) */
    const toSubmit = [];   /* draft existing → đổi status */
    const toCreate = [];   /* NV chưa có phiếu → tạo phiếu mặc định */
    const skipped = [];    /* submitted/approved/paid */
    staffs.forEach(s => {
      const ps = monthPayslipsByStaff[s.id];
      if (!ps) toCreate.push(s);
      else if (ps.status === 'draft') toSubmit.push(ps);
      else skipped.push({ staffName: s.name, status: ps.status });
    });

    const totalAffect = toSubmit.length + toCreate.length;
    if (totalAffect === 0) {
      window.toast?.('Không có phiếu nháp nào để gửi · ' + skipped.length + ' phiếu đã submit trước đó', 'warn');
      return;
    }

    const msg = [
      `Gửi TẤT CẢ ${totalAffect} phiếu lương tháng ${month} cho CFO duyệt?`,
      '',
      `📤 ${toSubmit.length} phiếu NHÁP → CHỜ DUYỆT`,
      `➕ ${toCreate.length} NV chưa lập → tự tạo phiếu + gửi`,
      skipped.length ? `⏭ ${skipped.length} phiếu bỏ qua (đã submit/duyệt/trả)` : '',
      '',
      'Sau khi gửi anh/chị KHÔNG sửa được nữa — chỉ CFO mới sửa được.',
    ].filter(Boolean).join('\n');
    if (!confirm(msg)) return;

    const now = new Date().toISOString();
    const user = (window.AUTH && window.AUTH.currentUser()) || {};
    const submitterName = user.name || user.email || 'NS';
    let totalAmount = 0;
    const created = [];

    /* 1) Đổi status draft → submitted (giữ nguyên data) */
    toSubmit.forEach(ps => {
      const c = PF.computePayslip(ps);
      Object.assign(ps, {
        ...computedSnapshot(c),
        status: 'submitted',
        submittedBy: submitterName,
        submittedAt: now,
      });
      totalAmount += c.total;
    });

    /* 2) Auto-tạo phiếu cho NV chưa có.
       PHẢI dùng ĐÚNG các nguồn số mà bảng lương + phiếu lương đang dùng, nếu không phiếu
       gửi hàng loạt sẽ sai tiền rồi bị ĐÓNG BĂNG luôn ở trạng thái 'submitted':
         · công thực tế  → window.payrollWorkActual (X/L/P đủ ca, H nửa ca, VP T7=0.5, CN=0)
           (trước đây đếm thô X|P → mất ngày đi muộn 'L', mất nửa ngày 'H', tính T7 = 1 công)
         · thưởng hỗ trợ → BONUS.helperFor (lịch trực kho + sổ ghi)  (trước đây BỎ QUA → mất tiền)
         · BHXH + hoa hồng → PF.getStaffPayCfg   (trước đây đọc s.hasBHXH — trường KHÔNG tồn tại
           — và hardcode 578.000đ; hoa hồng bị bỏ trắng) */
    toCreate.forEach(s => {
      const cfg = PF.getStaffPayCfg ? PF.getStaffPayCfg(s.id) : { bhxhOn:false, bhxhBase:0, commMode:'none', commPct:0, commScope:'ownedCusts' };
      const draft = {
        id: 'PR-' + month + '-' + s.id,
        month,
        staffId: s.id,
        staffName: s.name,
        dept: s.dept || 'VP',
        role: s.role || '',
        contractType: s.contractType || 'official',
        basicSalary: s.salary || 0,
        workActual: workActualOf(s, month),
        workStandardOverride: null,
        allowanceOverride: null,
        bonuses: [],
        penalties: [],
        helperBonus: window.BONUS ? (window.BONUS.helperFor(s.id, month).total || 0) : 0,
        bhxhOn: cfg.bhxhOn,
        bhxhBase: cfg.bhxhBase || _bhxhDefaultBase(),
        bhxh: 0,
        commMode: cfg.commMode,
        commissionPct: cfg.commPct,
        commScope: cfg.commScope,
        commissionAmount: 0,
        advance: 0,
        notes: '(Tự tạo bởi HR khi gửi hàng loạt)',
        createdAt: now,
        status: 'submitted',
        submittedBy: submitterName,
        submittedAt: now,
        approvedBy: null,
        approvedAt: null,
        paidAt: null,
      };
      const c = PF.computePayslip(draft);
      Object.assign(draft, computedSnapshot(c));
      totalAmount += c.total;
      created.push(draft);
    });

    /* Ghi theo TỪNG phiếu lên bản cloud mới nhất — không ghi đè sổ lương của người khác */
    savePayslipsMany(toSubmit.concat(created));
    window.toast?.(`📤 Đã gửi ${totalAffect} phiếu cho CFO duyệt · Tổng ${PF.formatVND(totalAmount)} ₫`, 'success');

    /* Refresh view nếu đang ở trang Bảng lương */
    if (typeof window.renderPayrollPublic === 'function') window.renderPayrollPublic();
    else location.reload();
  };

  console.log('[NSTT] ✓ Payroll workflow ready — openPayslipDrawer / openPayslipBatchReview / submitAllDrafts');
})();
