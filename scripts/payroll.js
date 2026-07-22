/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Chấm công & Bảng lương
   Tab Chấm công: NV × ngày, click cell cycle X→P→V→X
   Tab Bảng lương: lương cơ bản, công, thưởng/khấu trừ, thực lĩnh
   Upload Excel: SheetJS parse file từ máy chấm công → auto-fill
   ========================================================= */
(function () {
  let month = (window.todayDate ? window.todayDate() : new Date()).toISOString().slice(0, 7);
  let tab = 'attend';

  /* === Perm helpers === */
  function hasP(perm) { return !!(window.AUTH && window.AUTH.hasPerm && window.AUTH.hasPerm(perm)); }
  function canViewAll() { return hasP('payroll.viewAll') || hasP('all'); }
  function canEdit()    { return hasP('payroll.edit') || hasP('all'); }
  function canUpload()  { return hasP('payroll.upload') || hasP('all'); }
  /* === NEW: quyền liên quan workflow phiếu lương === */
  function canCalc()    { return hasP('payroll.calc') || hasP('payroll.submit') || hasP('all'); }
  function canApprove() { return hasP('payroll.approve') || hasP('all'); }
  /* Mở/sửa/duyệt phiếu lương = ai cần xem chi tiết phiếu */
  function canOpenPayslip() { return canCalc() || canApprove() || canViewAll(); }
  function meStaffId()  { const u = window.AUTH && window.AUTH.currentUser(); return u ? u.staffId : null; }

  /* =========================================================
     LỊCH LÀM VIỆC theo VỊ TRÍ (giờ VÀO ca = mốc tính đi muộn):

     [Văn phòng — Ban GĐ / Sales / CSKH / Kế toán / Marketing / Nhân sự]
     - Sáng 08:00-12:00 · Chiều 13:30-17:30
     - T7 chỉ ca sáng (0.5 công)

     [Kho — Nhân viên Kho / Quản lý kho]  (dept "Kho & Ship", role ~ "Kho")
     - Sáng 01:00-09:00 · Chiều 13:00-18:00

     [Ship — Giao hàng / Shipper / Tài xế]  (dept "Kho & Ship", role ~ "Giao hàng")
     - Sáng 05:00-11:00 · Chiều 13:00-18:00

     CN: tất cả nghỉ. Dept nay đã tách "Kho" ≠ "Ship" (v403), nhưng vẫn phân theo
     ROLE cho chắc (data cũ có thể còn "Kho & Ship" gộp; role luôn đúng).
     ========================================================= */
  const SHIFT_DEFAULT = {
    morn: ['08:00','12:00'],
    aft:  ['13:30','17:30'],
    label: 'Văn phòng',
  };
  const SHIFT_WAREHOUSE = {
    morn: ['01:00','09:00'],
    aft:  ['13:00','18:00'],
    label: 'Kho',
  };
  const SHIFT_SHIPPER = {
    morn: ['05:00','11:00'],
    aft:  ['13:00','18:00'],
    label: 'Shipper / Giao hàng',
  };
  function shiftHoursFor(staff) {
    if (!staff) return SHIFT_DEFAULT;
    const dept = String(staff.dept || '');
    const role = String(staff.role || '').toLowerCase();
    /* Khối Kho/Vận hành mới dùng ca kho/ship; văn phòng giữ mặc định. */
    const isOps = /kho|ship|giao|vận hành|van hanh/i.test(dept) || /shipper|tài xế|tai xe/.test(role);
    if (!isOps) return SHIFT_DEFAULT;
    /* Trong khối Kho/Vận hành: phân theo VAI TRÒ — giao hàng/shipper/tài xế = ca ship,
       còn lại (kho) = ca kho. (dept "Kho & Ship" chứa cả "kho" lẫn "ship" nên KHÔNG
       xét dept để tách — chỉ xét role.) */
    if (/giao hàng|giao hang|giao|shipper|tài xế|tai xe/.test(role)) return SHIFT_SHIPPER;
    return SHIFT_WAREHOUSE;
  }
  /* Để legacy code tham chiếu — dùng mặc định */
  const SHIFT_MORN_START = SHIFT_DEFAULT.morn[0];
  const SHIFT_MORN_END   = SHIFT_DEFAULT.morn[1];
  const SHIFT_AFT_START  = SHIFT_DEFAULT.aft[0];
  const SHIFT_AFT_END    = SHIFT_DEFAULT.aft[1];
  const LATE_GRACE_MIN = 15;            /* ≤ 15 phút: không phạt */
  const LATE_DEDUCT_PER_MIN = 5000;     /* > 15 phút: 5k/phút */

  /* Trọng số công theo thứ trong tuần:
     T2-T6 = 1 (full), T7 = 0.5 (chỉ sáng), CN = 0 (nghỉ) */
  function shiftFactor(year, monthIdx, day) {
    const dow = new Date(year, monthIdx, day).getDay();
    if (dow === 0) return 0;
    if (dow === 6) return 0.5;
    return 1.0;
  }
  function shiftFactorOfDay(dayIndex) {
    const [y, m] = month.split('-').map(Number);
    return shiftFactor(y, m - 1, dayIndex);
  }

  const STAFF = () => {
    const all = window.STORE.get('staff', window.STAFFS || []).filter(s => s.status === 'active');
    if (canViewAll()) return all;
    const meId = meStaffId();
    return all.filter(s => s.id === meId);
  };
  const SHEETS = () => window.STORE.get('timesheet', window.TIMESHEET || []);
  function sheetOf(sid) { return SHEETS().find(t => t.staffId === sid && t.month === month); }
  /* daysMeta: { staffId+month: { dayIdx → { lateMin, note } } } — lưu metadata riêng */
  function metaOf(sid) {
    const all = window.STORE.get('timesheetMeta', {});
    return all[sid + '_' + month] || {};
  }
  /* ⚠ Chấm công KHÔNG được ghi cả khối (STORE.set) — tab vừa mở, cache chưa về từ cloud thì
     cả mảng `timesheet` / map `timesheetMeta` đang là bản CŨ. Ghi đè = xoá công của mọi NV khác.
     rmwKv áp ĐÚNG ô vừa sửa lên BẢN CLOUD MỚI NHẤT. mutate phải idempotent (gán theo index). */
  function setMetaCell(sid, dayIdx, data) {
    const key = sid + '_' + month;
    const mut = all => {
      all = (all && typeof all === 'object' && !Array.isArray(all)) ? all : {};
      if (!all[key]) all[key] = {};
      if (data === null) delete all[key][dayIdx];
      else all[key][dayIdx] = Object.assign({}, all[key][dayIdx], data);
      return all;
    };
    if (window.STORE.rmwKv) window.STORE.rmwKv('timesheetMeta', mut, {});
    else window.STORE.set('timesheetMeta', mut(window.STORE.get('timesheetMeta', {})));
  }
  /* Ghi 1 ô chấm công của 1 NV trong tháng đang xem */
  function setDayCell(sid, day, status) {
    const mth = month, dflt = defaultDays();
    const mut = arr => {
      arr = Array.isArray(arr) ? arr : [];
      let sh = arr.find(t => t && t.staffId === sid && t.month === mth);
      if (!sh) { sh = { staffId: sid, month: mth, days: dflt.slice() }; arr.unshift(sh); }
      if (!Array.isArray(sh.days)) sh.days = dflt.slice();
      sh.days[day - 1] = status;
      return arr;
    };
    if (window.STORE.rmwKv) window.STORE.rmwKv('timesheet', mut, []);
    else window.STORE.set('timesheet', mut(SHEETS().slice()));
  }
  function counts(days, meta) {
    const c = { X: 0, L: 0, H: 0, P: 0, V: 0, off: 0, lateMin: 0 };
    (days || []).forEach((d, i) => {
      if (d === '_') c.off++;
      else if (c[d] !== undefined) c[d]++;
      if (d === 'L' && meta && meta[i + 1]) c.lateMin += (meta[i + 1].lateMin || 0);
    });
    return c;
  }
  /* Số "công tính lương" có trọng số T7 — T7 chỉ sáng tính 0.5 công */
  function paidDays(days) {
    let n = 0;
    (days || []).forEach((d, i) => {
      const sf = shiftFactorOfDay(i + 1);
      if (sf === 0) return;
      if (d === 'X' || d === 'L' || d === 'P') n += sf;            /* full ca */
      else if (d === 'H') n += sf * 0.5;                            /* nửa ca */
    });
    return n;
  }
  /* ===== KHO & SHIP làm CẢ TUẦN (T7 full 1 công, CN vẫn làm) — KHÔNG giảm cuối tuần như VP.
     Đó là lý do công chuẩn Kho 29 / Ship 30 (cao hơn VP ~24). VP: T7 = 0.5, CN = nghỉ. ===== */
  function _fullWeekStaff(s) {
    const d = String(s && s.dept || ''); const r = String(s && s.role || '').toLowerCase();
    return d === 'Kho' || d === 'Ship' || /kho|ship|giao|vận hành|van hanh/i.test(d) || /giao hàng|giao hang|shipper|tài xế|tai xe/.test(r);
  }
  function shiftFactorForStaff(s, dayN) { return _fullWeekStaff(s) ? 1.0 : shiftFactorOfDay(dayN); }

  /* ===== Helper chấm công THAM SỐ HOÁ THEO THÁNG =====
     Trước đây defaultDaysFor/paidDaysFor bám biến `month` của tab đang mở → không dùng lại được
     cho tháng khác (vd nút "Gửi tất cả CFO duyệt", hoặc lúc tạo phiếu mới). Nay tách ra để
     MỌI nơi tính công thực tế bằng CÙNG một công thức. */
  function _defaultDaysForMonth(s, mth) {
    const [y, m] = String(mth).split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    if (_fullWeekStaff(s)) return Array.from({ length: last }, () => 'X');   /* Kho/Ship làm cả tuần */
    return Array.from({ length: last }, (_, i) => (new Date(y, m - 1, i + 1).getDay() === 0 ? '_' : 'X'));
  }
  function _daysForStaffMonth(s, mth, rawDays) {
    const arr = rawDays || _defaultDaysForMonth(s, mth);
    return _fullWeekStaff(s) ? arr.map(v => (v === '_' ? 'X' : v)) : arr;
  }
  /* Công tính lương: Kho/Ship mọi ngày = 1 công · VP: T2-T6 = 1, T7 = 0.5, CN = 0.
     X/L/P = đủ ca · H = nửa ca · V = vắng (0). */
  function _paidDaysWeighted(s, mth, days) {
    const [y, m] = String(mth).split('-').map(Number);
    const full = _fullWeekStaff(s);
    let n = 0;
    (days || []).forEach((d, i) => {
      const dow = new Date(y, m - 1, i + 1).getDay();
      const sf = full ? 1.0 : (dow === 0 ? 0 : dow === 6 ? 0.5 : 1);
      if (sf === 0) return;
      if (d === 'X' || d === 'L' || d === 'P') n += sf;
      else if (d === 'H') n += sf * 0.5;
    });
    return n;
  }
  /* API DÙNG CHUNG: công thực tế của 1 NV trong 1 tháng (đọc thẳng bảng chấm công).
     payroll-approval.js dùng hàm này khi TẠO phiếu / GỬI HÀNG LOẠT để không lệch với bảng lương. */
  window.payrollWorkActual = function (staff, mth) {
    if (!staff || !mth) return 0;
    const sh = (window.STORE.get('timesheet', []) || []).find(t => t.staffId === staff.id && t.month === mth);
    return _paidDaysWeighted(staff, mth, _daysForStaffMonth(staff, mth, sh ? sh.days : null));
  };

  function defaultDaysFor(s) { return _defaultDaysForMonth(s, month); }
  /* Ngày để HIỂN THỊ + TÍNH cho 1 NV. Kho/Ship làm CẢ TUẦN → ô '_' (kiểu "CN nghỉ" của VP)
     coi là CÓ MẶT (X). Vắng thật vẫn là V. → thứ 7 + chủ nhật đều tính công. */
  function daysForStaff(s, rawDays) { return _daysForStaffMonth(s, month, rawDays); }
  /* Công tính lương THEO NV — uỷ quyền cho _paidDaysWeighted để KHÔNG có 2 công thức song song */
  function paidDaysFor(s, days) { return _paidDaysWeighted(s, month, days); }
  /* NC chuẩn = Σ shiftFactor của các ngày trong tháng (T7 = 0.5, CN = 0)
     → ví dụ tháng 31 ngày: 22 ngày T2-T6 × 1 + 4 ngày T7 × 0.5 + 4 CN × 0 = 24 NC */
  function workdaysInMonth() {
    const [y, m] = month.split('-').map(Number); const last = new Date(y, m, 0).getDate();
    let n = 0; for (let d = 1; d <= last; d++) n += shiftFactor(y, m - 1, d);
    return n;
  }
  function defaultDays() {
    const [y, m] = month.split('-').map(Number); const last = new Date(y, m, 0).getDate();
    return Array.from({ length: last }, (_, i) => new Date(y, m - 1, i + 1).getDay() === 0 ? '_' : 'X');
  }

  function render() {
    document.getElementById('payTabs').innerHTML =
      `<div class="rpt-tab ${tab === 'attend' ? 'active' : ''}" onclick="window.setPayTab('attend')">📅 Chấm công</div>` +
      `<div class="rpt-tab ${tab === 'calendar' ? 'active' : ''}" onclick="window.setPayTab('calendar')">🗓️ Lịch công</div>` +
      `<div class="rpt-tab ${tab === 'duty' ? 'active' : ''}" onclick="window.setPayTab('duty')">🏭 Lịch trực kho</div>` +
      `<div class="rpt-tab ${tab === 'bonus' ? 'active' : ''}" onclick="window.setPayTab('bonus')">🎁 Thưởng hỗ trợ</div>` +
      `<div class="rpt-tab ${tab === 'shipper' ? 'active' : ''}" onclick="window.setPayTab('shipper')">🛵 Hiệu suất Shipper</div>` +
      `<div class="rpt-tab ${tab === 'payroll' ? 'active' : ''}" onclick="window.setPayTab('payroll')">💰 Bảng lương</div>`;
    document.getElementById('payMonth').value = month;
    /* Hide upload button if user lacks perm */
    const upBtn = document.querySelector('[onclick*="openUploadTimesheet"]');
    if (upBtn) upBtn.style.display = canUpload() ? '' : 'none';
    /* Banner khi user chỉ xem được mình */
    const head = document.querySelector('.page-head .sub');
    if (head && !canViewAll()) {
      head.innerHTML = '🔒 Bạn chỉ được xem chấm công + lương <b>của chính mình</b>. ' +
                       'Cần perm <code>payroll.viewAll</code> để xem toàn bộ NV.';
    }
    if (tab === 'attend') renderAttend();
    else if (tab === 'calendar') renderCalendar();
    else if (tab === 'duty') { if (window.KHODUTY) window.KHODUTY.renderDutyTab(month); }
    else if (tab === 'bonus') { if (window.BONUS) window.BONUS.setBonusMonth(month); }
    else if (tab === 'shipper') { if (window.SHIPSTATS) window.SHIPSTATS.renderInto('payView', month); else document.getElementById('payView').innerHTML = '<div style="padding:24px;color:var(--muted)">Đang tải…</div>'; }
    else renderPayroll();
  }
  window.setPayTab = t => { tab = t; render(); };
  window.setPayMonth = m => { month = m; if (window.BONUS) window.BONUS.setBonusMonth(m); if (window.KHODUTY) window.KHODUTY.setMonth(m); render(); };
  /* Expose để batch submit gọi refresh không cần reload */
  window.renderPayrollPublic = () => { if (tab === 'payroll') renderPayroll(); else render(); };

  /* ===== 🗓️ LỊCH CÔNG: xem tháng nào có 5 T7 + 5 CN → NC chuẩn (công mặc định) GIẢM ===== */
  function _monthStats(y, m) {
    const last = new Date(y, m, 0).getDate();
    let sat = 0, sun = 0, nc = 0;
    for (let d = 1; d <= last; d++) {
      const dow = new Date(y, m - 1, d).getDay();
      if (dow === 6) sat++; else if (dow === 0) sun++;
      nc += shiftFactor(y, m - 1, d);   /* T2-T6=1 · T7=0.5 · CN=0 */
    }
    return { last, sat, sun, nc, reduced: sat >= 5 && sun >= 5 };
  }
  const _ncFmt = n => (n % 1 === 0 ? String(n) : n.toFixed(1));
  function renderCalendar() {
    const [y, m] = month.split('-').map(Number);
    const st = _monthStats(y, m);
    /* NC chuẩn "đầy đủ" tham chiếu = tháng 4 T7 + 4 CN cùng số ngày (để so lệch) */
    const refNc = st.last - 4 * 0.5 - 4;   /* (last - 8 ngày cuối tuần) + 4×0.5 = last - 4 - 4 = last-8+2... */
    /* Lưới ngày, tuần bắt đầu THỨ 2 */
    const first = new Date(y, m - 1, 1).getDay();       /* 0=CN..6=T7 */
    const startCol = (first + 6) % 7;                    /* Mon=0 */
    const cells = [];
    for (let i = 0; i < startCol; i++) cells.push(0);
    for (let d = 1; d <= st.last; d++) cells.push(d);
    while (cells.length % 7) cells.push(0);
    const todayD = window.todayDate();
    const dow = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    let grid = `<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px">`;
    grid += dow.map((n, i) => `<div style="text-align:center;font-weight:700;font-size:11px;color:${i === 5 ? '#B45309' : i === 6 ? '#DC2626' : 'var(--muted)'};padding:2px 0 4px">${n}</div>`).join('');
    cells.forEach(d => {
      if (!d) { grid += `<div></div>`; return; }
      const wd = new Date(y, m - 1, d).getDay();
      const isSat = wd === 6, isSun = wd === 0;
      const isToday = y === todayD.getFullYear() && m - 1 === todayD.getMonth() && d === todayD.getDate();
      const bg = isSun ? '#FEE2E2' : isSat ? '#FEF3C7' : '#fff';
      const bd = isToday ? '#15803D' : isSun ? '#FCA5A5' : isSat ? '#FDE68A' : '#EDF1EC';
      const col = isSun ? '#DC2626' : isSat ? '#B45309' : 'var(--navy)';
      const fac = isSun ? '0' : isSat ? '½' : '1';
      grid += `<div title="Ngày ${d}/${m} — ${fac} công" style="background:${bg};border:1.5px solid ${bd};border-radius:9px;min-height:52px;display:grid;place-items:center;line-height:1.05">
        <div style="text-align:center">
          <div style="font-weight:700;font-size:15px;color:${col}">${d}</div>
          <div style="font-size:8.5px;font-weight:700;color:${col};opacity:.72;margin-top:1px">${fac} công</div>
        </div>
      </div>`;
    });
    grid += `</div>`;

    /* Dải 12 tháng — 6 cột × 2 hàng, khớp bố cục Lịch trực kho */
    const yr = Array.from({ length: 12 }, (_, i) => {
      const ms = _monthStats(y, i + 1); const cur = (i + 1) === m;
      return `<button onclick="window.setPayMonth('${y}-${String(i + 1).padStart(2, '0')}')" title="${ms.reduced ? '⚠ 5 T7 + 5 CN → công giảm · ' : ''}NC chuẩn ${_ncFmt(ms.nc)}"
        style="border:1.5px solid ${cur ? '#15803D' : ms.reduced ? '#F59E0B' : '#EDF1EC'};background:${cur ? '#DCFCE7' : ms.reduced ? '#FFFBEB' : '#fff'};border-radius:7px;padding:5px 2px;cursor:pointer;text-align:center;line-height:1.2">
        <div style="font-weight:700;font-size:11.5px;color:${cur ? '#15803D' : 'var(--navy)'}">Th${i + 1}${ms.reduced ? ' <span style="color:#B45309">⚠</span>' : ''}</div>
        <div style="font-size:9.5px;color:var(--muted)">${_ncFmt(ms.nc)}</div>
      </button>`;
    }).join('');

    /* Bảng NC chuẩn cả năm — lấp cột phải, bấm dòng để nhảy tháng */
    const yrRows = Array.from({ length: 12 }, (_, i) => {
      const ms = _monthStats(y, i + 1); const cur = (i + 1) === m;
      return `<tr onclick="window.setPayMonth('${y}-${String(i + 1).padStart(2, '0')}')" style="cursor:pointer;background:${cur ? '#F0FDF4' : ms.reduced ? '#FFFBEB' : 'transparent'}">
        <td style="padding:5px 8px;font-weight:${cur ? '700' : '600'};color:${cur ? '#15803D' : 'var(--navy)'}">Tháng ${i + 1}${ms.reduced ? ' <span title="5 T7 + 5 CN → công giảm" style="color:#B45309">⚠</span>' : ''}</td>
        <td class="num" style="padding:5px 8px;color:var(--muted)">${ms.last}</td>
        <td class="num" style="padding:5px 8px;color:#B45309">${ms.sat}</td>
        <td class="num" style="padding:5px 8px;color:#DC2626">${ms.sun}</td>
        <td class="num" style="padding:5px 8px;font-weight:700;color:${ms.reduced ? '#B45309' : '#15803D'}">${_ncFmt(ms.nc)}</td>
      </tr>`;
    }).join('');

    const kpi = (label, val, sub, col) => `<div style="flex:1;min-width:96px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:9px 12px">
        <div style="font-size:10.5px;color:var(--muted);text-transform:uppercase;font-weight:600;letter-spacing:.2px">${label}</div>
        <div style="font-size:21px;font-weight:800;color:${col || 'var(--navy)'};line-height:1.25">${val}</div>
        <div style="font-size:10.5px;color:var(--muted)">${sub}</div>
      </div>`;

    document.getElementById('payView').innerHTML = `
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">

        <div style="flex:3 1 430px;min-width:0">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
            ${kpi(`NC chuẩn ${m}/${y}`, _ncFmt(st.nc), 'công 1 NV làm đủ', st.reduced ? '#B45309' : '#15803D')}
            ${kpi('Thứ 7', st.sat, '½ công/ngày', '#B45309')}
            ${kpi('Chủ nhật', st.sun, 'nghỉ · 0 công', '#DC2626')}
          </div>

          ${st.reduced
            ? `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:8px 11px;margin-bottom:9px;font-size:12px;color:#92400E">⚠ <b>Tháng ${m}/${y} có 5 Thứ 7 + 5 Chủ nhật</b> → NC chuẩn chỉ còn <b>${_ncFmt(st.nc)} công</b> (thường ~${_ncFmt(refNc)}). Công mặc định của NV tháng này <b>GIẢM</b> — app đã tự tính đúng khi ra lương.</div>`
            : `<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:8px 11px;margin-bottom:9px;font-size:12px;color:#15803D">✓ Tháng ${m}/${y} bình thường (${st.sat} T7 + ${st.sun} CN) → NC chuẩn <b>${_ncFmt(st.nc)} công</b>.</div>`}

          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11.5px;color:var(--muted);margin-bottom:8px">
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#fff;border:1px solid #CBD5C4;vertical-align:middle"></span> T2–T6 = <b>1 công</b></span>
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#FEF3C7;border:1px solid #FDE68A;vertical-align:middle"></span> <b style="color:#B45309">T7</b> = ½ công</span>
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#FEE2E2;border:1px solid #FCA5A5;vertical-align:middle"></span> <b style="color:#DC2626">CN</b> = nghỉ (0)</span>
          </div>

          ${grid}

          <div style="font-size:11px;color:var(--muted);margin-top:8px">Tháng nào rơi <b>5 T7 + 5 CN</b> thì NC chuẩn thấp hơn → lương theo công của NV tính trên mẫu số nhỏ hơn.</div>
        </div>

        <div style="flex:2 1 290px;min-width:270px">
          <div style="font-size:12.5px;font-weight:700;color:var(--navy);margin-bottom:7px">🗓️ Cả năm ${y} <span style="font-weight:400;color:var(--muted);font-size:11px">— ⚠ = 5+5, công giảm</span></div>
          <div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;margin-bottom:12px">${yr}</div>

          <div style="font-size:12.5px;font-weight:700;color:var(--navy);margin-bottom:7px">📊 Ngày công chuẩn từng tháng</div>
          <div style="border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff">
            <table class="mini-table" style="width:100%;border-collapse:separate;border-spacing:0">
              <thead><tr style="background:#F9FAFB">
                <th style="text-align:left;padding:7px 8px">Tháng</th>
                <th class="num" style="padding:7px 8px" title="Số ngày trong tháng">Ngày</th>
                <th class="num" style="padding:7px 8px">T7</th>
                <th class="num" style="padding:7px 8px">CN</th>
                <th class="num" style="padding:7px 8px">NC chuẩn</th>
              </tr></thead>
              <tbody>${yrRows}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  }
  /* Hide nút header theo perm — call sau init render */
  window.applyPayrollHeaderPerms = function () {
    const subBtn = document.querySelector('[onclick*="submitAllDrafts"]');
    if (subBtn) subBtn.style.display = canCalc() ? '' : 'none';
    const cfoBtn = document.querySelector('[onclick*="openPayslipBatchReview"]');
    if (cfoBtn) cfoBtn.style.display = canApprove() ? '' : 'none';
    const polBtn = document.querySelector('[onclick*="openLatePolicy"]');
    if (polBtn) polBtn.style.display = (hasP('all') || hasP('payroll.edit')) ? '' : 'none';
  };

  /* =========================================================
     SETTINGS — Cấu hình khung phạt đi muộn (admin only)
     ========================================================= */
  /* === Cài đặt PHỤ CẤP theo ca + % BHXH (admin) === */
  window.openAllowanceSettings = function () {
    if (!(hasP('all') || hasP('payroll.edit'))) {
      window.toast?.('🔒 Bạn không có quyền sửa phụ cấp/BHXH (cần payroll.edit hoặc all)', 'warn');
      return;
    }
    const PF = window.PayrollFormula;
    const cur = PF.getPayrollConfig();
    const money = (id, v) => `<input id="${id}" type="number" min="0" step="10000" value="${v}" style="width:100%;padding:8px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px;text-align:right;font-weight:700;box-sizing:border-box">`;
    const row = (key, label, hint) => `
      <div style="display:grid;grid-template-columns:1fr 170px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px dashed var(--line)">
        <div><b style="font-size:13px">${label}</b>${hint ? `<div style="font-size:11px;color:var(--muted)">${hint}</div>` : ''}</div>
        ${money('pcf_' + key, cur.allowance[key])}
      </div>`;

    window.openModal('⚙ Phụ cấp & BHXH', `
      <div style="font-size:12.5px;color:var(--muted);line-height:1.7;background:#F0FDFA;border:1px solid #99F6E4;border-radius:8px;padding:10px 12px;margin-bottom:14px">
        💡 Phụ cấp <b>chia theo công thực tế</b>: <code>mức tháng ÷ công chuẩn × công thực tế</code>.<br>
        Ca làm nhận diện theo <b>Vị trí</b> của NV (có chữ “sáng” / “chiều”). Kho <b>part-time</b> luôn 0đ.
      </div>

      <div class="section-h" style="margin-bottom:6px">Mức phụ cấp / tháng</div>
      ${row('office',   'Văn phòng',     'Sale · Kế toán · Ban GĐ · Nhân sự · Marketing')}
      ${row('khoSang',  'Kho ca sáng',   'Vị trí có chữ “sáng”')}
      ${row('khoChieu', 'Kho ca chiều',  'Vị trí có chữ “chiều”')}
      ${row('shipSang', 'Ship ca sáng',  'Gồm tiền xăng + hao mòn xe')}
      ${row('shipChieu','Ship ca chiều', 'Gồm tiền xăng + hao mòn xe')}

      <div class="section-h" style="margin:16px 0 6px">Ship — tách chi tiết (chỉ để ghi chú trên phiếu)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase">Tiền xăng</label>${money('pcf_fuel', cur.shipBreakdown.fuel)}</div>
        <div><label style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase">Hao mòn xe</label>${money('pcf_wear', cur.shipBreakdown.wear)}</div>
      </div>

      <div class="section-h" style="margin:16px 0 6px">🛡 BHXH</div>
      <div style="margin-bottom:10px">
        <label style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase">Mức lương cơ sở đóng BH — MẶC ĐỊNH cho mọi NV</label>
        ${money('pcf_defaultBase', cur.bhxh.defaultBase)}
        <div style="font-size:11.5px;color:var(--muted);margin-top:4px">Từng NV có thể đặt mức riêng trong hồ sơ; để trống thì dùng mức này.</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase">Cá nhân (%) — TRỪ vào lương</label>
          <input id="pcf_empPct" type="number" min="0" max="100" step="0.1" value="${cur.bhxh.empPct}" style="width:100%;padding:8px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px;text-align:right;font-weight:700;color:#7C3AED;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase">Doanh nghiệp (%) — cty chi</label>
          <input id="pcf_comPct" type="number" min="0" max="100" step="0.1" value="${cur.bhxh.comPct}" style="width:100%;padding:8px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px;text-align:right;font-weight:700;color:#6B7280;box-sizing:border-box">
        </div>
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:6px">
        Phần <b>doanh nghiệp</b> KHÔNG trừ vào thực lĩnh của NV — chỉ hiện ở cột “BHXH (DN)” để theo dõi chi phí.
        Tích chọn đóng BH trong <b>hồ sơ từng NV</b>; mức lương cơ sở lấy theo mặc định ở trên nếu NV không đặt riêng.
      </div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window._saveAllowanceSettings()">💾 Lưu cấu hình</button>`,
      width: '620px',
    });
  };
  window._saveAllowanceSettings = function () {
    /* Form dựng lại CẢ khối cấu hình từ DOM. Chưa nạp xong → các ô đang hiện MẶC ĐỊNH,
       bấm Lưu là ghi mặc định đè cấu hình thật (đổi phụ cấp + BHXH của mọi phiếu). */
    if (window.STORE.kvReady && !window.STORE.kvReady('payrollConfig')) {
      window.toast?.('⏳ Đang tải cấu hình từ máy chủ — thử lưu lại sau 1–2 giây', 'warn');
      return;
    }
    const num = id => parseFloat((document.getElementById(id) || {}).value) || 0;
    window.STORE.set('payrollConfig', {
      allowance: {
        office:    num('pcf_office'),
        khoSang:   num('pcf_khoSang'),
        khoChieu:  num('pcf_khoChieu'),
        shipSang:  num('pcf_shipSang'),
        shipChieu: num('pcf_shipChieu'),
      },
      shipBreakdown: { fuel: num('pcf_fuel'), wear: num('pcf_wear') },
      bhxh: { empPct: num('pcf_empPct'), comPct: num('pcf_comPct'), defaultBase: num('pcf_defaultBase') },
    });
    window.closeModal();
    window.toast?.('✓ Đã lưu phụ cấp & BHXH — bảng lương tính lại ngay', 'success');
    if (typeof renderPayroll === 'function') { try { renderPayroll(); } catch (e) {} }
  };

  window.openLatePolicySettings = function () {
    if (!(hasP('all') || hasP('payroll.edit'))) {
      window.toast?.('🔒 Bạn không có quyền sửa khung phạt (cần payroll.edit hoặc all)', 'warn');
      return;
    }
    const PF = window.PayrollFormula;
    const cur = PF.getLatePolicy();

    const _lpEsc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    function tierRow(t, i) {
      const isCong = t.unit === 'cong';
      return `<div class="lp-tier" data-idx="${i}" style="display:grid;grid-template-columns:88px 1fr 118px 128px 30px;gap:7px;padding:8px 0;border-bottom:1px dashed var(--line);align-items:center">
        <div style="display:flex;gap:4px;align-items:center">
          <span style="font-size:11px;color:var(--muted)">≥</span>
          <input class="lp-tier-min" type="number" min="0" max="480" value="${t.thresholdMinutes}" style="width:60px;text-align:right;padding:5px 7px;font-size:12.5px;border:1px solid var(--line);border-radius:5px">
          <span style="font-size:11px;color:var(--muted)">p</span>
        </div>
        <input class="lp-tier-label" type="text" value="${_lpEsc(t.label)}" placeholder="VD: > 10 phút" style="padding:5px 8px;font-size:12.5px;border:1px solid var(--line);border-radius:5px;min-width:0">
        <select class="lp-tier-unit" onchange="window._lpSwitchUnit(this)" style="padding:5px 6px;font-size:12px;border:1px solid var(--line);border-radius:5px;background:#fff">
          <option value="money" ${isCong?'':'selected'}>₫ Tiền cố định</option>
          <option value="cong"  ${isCong?'selected':''}>📆 Ngày công</option>
        </select>
        <div style="position:relative">
          <input class="lp-tier-amount" type="text" inputmode="numeric" value="${(+t.amount||0).toLocaleString('vi-VN')}" data-raw="${+t.amount||0}" placeholder="0"
            style="${isCong?'display:none;':''}width:100%;box-sizing:border-box;padding:5px 22px 5px 8px;text-align:right;font-size:12.5px;font-weight:700;color:#DC2626;border:1px solid var(--line);border-radius:5px">
          <select class="lp-tier-days" style="${isCong?'':'display:none;'}width:100%;box-sizing:border-box;padding:5px 6px;font-size:12.5px;font-weight:700;color:#DC2626;border:1px solid var(--line);border-radius:5px;background:#fff">
            <option value="0.5" ${(+t.days||0)===0.5?'selected':''}>trừ ½ ngày công</option>
            <option value="1"   ${(+t.days||0)===1  ?'selected':''}>trừ 1 ngày công</option>
            <option value="1.5" ${(+t.days||0)===1.5?'selected':''}>trừ 1½ ngày công</option>
            <option value="2"   ${(+t.days||0)===2  ?'selected':''}>trừ 2 ngày công</option>
          </select>
        </div>
        <button onclick="window._lpRemoveTier(${i})" style="background:transparent;border:none;color:#DC2626;cursor:pointer;font-size:16px">×</button>
      </div>`;
    }

    const html = `
      <div style="font-size:12.5px;color:var(--muted);line-height:1.7;background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:10px 12px;margin-bottom:14px">
        ⚙ <b>Khung phạt đi muộn</b> — khi NV bị chấm <code>L</code> ở tab Chấm công và phút muộn vượt grace, app sẽ tự cộng phạt vào phiếu lương theo mức tier dưới đây.<br>
        Mỗi lần muộn áp <b>1 mức duy nhất</b> = tier có ngưỡng cao nhất mà NV vượt qua.
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
        <div>
          <label style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase">Chế độ tính phạt</label>
          <select id="lpMode" style="width:100%;padding:7px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px">
            <option value="tier" ${cur.mode==='tier'?'selected':''}>Theo mức (tier) — Recommended</option>
            <option value="perMinute" ${cur.mode==='perMinute'?'selected':''}>Theo phút (gracePerMin)</option>
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase">Miễn phạt nếu muộn ≤ (phút)</label>
          <input id="lpGrace" type="number" min="0" max="60" value="${cur.graceMinutes}" style="width:100%;padding:7px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px;text-align:right;font-weight:700">
        </div>
      </div>

      <div id="lpTierSection" style="${cur.mode==='perMinute'?'display:none':''}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b style="font-size:13px">📊 Các mức phạt (tier)</b>
          <button class="btn btn-ghost btn-sm" onclick="window._lpAddTier()">➕ Thêm mức</button>
        </div>
        <div id="lpTierList" style="background:#FAFBFC;border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin-bottom:14px">
          ${(cur.tiers || []).map((t, i) => tierRow(t, i)).join('')}
        </div>
        <div style="font-size:11.5px;color:var(--muted);background:#F0FDF4;border-left:3px solid #15803D;padding:8px 12px;border-radius:6px;margin-bottom:14px;line-height:1.7">
          💡 <b>VD áp dụng:</b> NV đi muộn 35 phút (grace 10p) → áp tier có ngưỡng cao nhất mà 35 ≥ ngưỡng → tier <b>"> 30 phút"</b> → phạt <b>50.000 ₫</b><br>
          📆 <b>Đơn vị "Ngày công":</b> tiền phạt = <code>lương 1 ngày công của chính NV đó × số ngày</code> — mỗi người một mức, tự tính lại khi đổi lương cơ bản.
          VD muộn 200 phút, tier <b>≥180p → trừ ½ ngày công</b>, NV lương 8.000.000 / 25 công = 320.000/ngày → phạt <b>160.000 ₫</b>.
        </div>
      </div>

      <div id="lpPerMinSection" style="${cur.mode==='tier'?'display:none':''}">
        <label style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase">Mức phạt mỗi phút (sau grace)</label>
        <input id="lpRate" type="text" inputmode="numeric" value="${(cur.perMinuteRate||5000).toLocaleString('vi-VN')}" data-raw="${cur.perMinuteRate||5000}" style="width:100%;padding:7px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px;text-align:right;font-weight:700">
        <div style="font-size:11px;color:var(--muted);margin-top:4px">VD: 5.000 ₫/phút × (phút muộn − grace) — cách cũ NSTT</div>
      </div>
    `;
    /* LƯU — đọc GIÁ TRỊ ô hiện tại (đã sửa), bỏ dấu phân cách; KHÔNG dùng data-raw (là giá trị lúc MỞ). */
    window._saveLatePolicy = function () {
      /* Chưa nạp xong → modal đang hiện KHUNG PHẠT MẶC ĐỊNH, lưu là ghi đè khung thật */
      if (window.STORE.kvReady && !window.STORE.kvReady('latePolicy')) {
        window.toast?.('⏳ Đang tải khung phạt từ máy chủ — thử lưu lại sau 1–2 giây', 'warn');
        return;
      }
      const mode = document.getElementById('lpMode')?.value || 'tier';
      const graceMinutes = parseInt(document.getElementById('lpGrace')?.value, 10) || 0;
      const parseRaw = (el) => parseInt((el?.value ?? '').toString().replace(/[^\d-]/g, ''), 10) || 0;
      const tiers = Array.from(document.querySelectorAll('.lp-tier')).map(el => {
        const unit = el.querySelector('.lp-tier-unit')?.value === 'cong' ? 'cong' : 'money';
        return {
          thresholdMinutes: parseInt(el.querySelector('.lp-tier-min')?.value, 10) || 0,
          label: el.querySelector('.lp-tier-label')?.value || '',
          unit,
          amount: unit === 'money' ? parseRaw(el.querySelector('.lp-tier-amount')) : 0,
          days: unit === 'cong' ? (parseFloat(el.querySelector('.lp-tier-days')?.value) || 0) : 0,
        };
      }).filter(t => t.thresholdMinutes > 0).sort((a, b) => a.thresholdMinutes - b.thresholdMinutes);
      const perMinuteRate = parseRaw(document.getElementById('lpRate'));
      const policy = { mode, graceMinutes, tiers, perMinuteRate };
      window.STORE.set('latePolicy', policy);
      window.toast?.('✓ Đã lưu khung phạt đi muộn — ' + tiers.length + ' mức', 'success');
      window.closeModal?.();
      if (typeof render === 'function') render();
    };
    window.openModal('⚙ Cấu hình phạt đi muộn', html, {
      width: '620px',
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>
               <button class="btn btn-primary" onclick="window._saveLatePolicy()">💾 Lưu cài đặt</button>`,
    });

    /* Wire mode toggle */
    document.getElementById('lpMode')?.addEventListener('change', e => {
      const isTier = e.target.value === 'tier';
      document.getElementById('lpTierSection').style.display = isTier ? '' : 'none';
      document.getElementById('lpPerMinSection').style.display = isTier ? 'none' : '';
    });
    /* Wire money format for tier amount + perMinRate */
    const wireMoney = (root) => {
      root.querySelectorAll('input[inputmode="numeric"]').forEach(el => {
        el.addEventListener('focus', e => { e.target.value = e.target.dataset.raw || '0'; e.target.select(); });
        el.addEventListener('blur',  e => {
          const n = parseInt(String(e.target.value).replace(/[^\d-]/g, ''), 10) || 0;
          e.target.dataset.raw = n;
          e.target.value = n.toLocaleString('vi-VN');
        });
      });
    };
    wireMoney(document.body);

    /* Helpers — data-idx phải TĂNG DẦN, không đếm lại số dòng:
       xoá mức giữa rồi thêm mới sẽ cấp lại 1 data-idx đang tồn tại → nút ✕ xoá nhầm dòng. */
    let _lpSeq = (cur.tiers || []).length;
    window._lpAddTier = function () {
      const list = document.getElementById('lpTierList');
      const tmp = document.createElement('div');
      tmp.innerHTML = tierRow({ thresholdMinutes: 60, label: 'Mới', unit: 'money', amount: 100000 }, _lpSeq++);
      list.appendChild(tmp.firstElementChild);
      wireMoney(list);
    };
    window._lpRemoveTier = function (idx) {
      const el = document.querySelector('.lp-tier[data-idx="' + idx + '"]');
      el?.remove();
    };
    /* Đổi đơn vị 1 mức: ₫ tiền cố định ⇄ 📆 ngày công */
    window._lpSwitchUnit = function (sel) {
      const row = sel.closest('.lp-tier');
      if (!row) return;
      const isCong = sel.value === 'cong';
      const amt = row.querySelector('.lp-tier-amount');
      const days = row.querySelector('.lp-tier-days');
      if (amt) amt.style.display = isCong ? 'none' : '';
      if (days) days.style.display = isCong ? '' : 'none';
    };
  };

  function renderAttend() {
    const staffs = STAFF();
    const [y, m] = month.split('-').map(Number); const last = new Date(y, m, 0).getDate();
    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const today = window.todayDate();

    /* === HEADER === T2-T6 thường · T7 vàng (chỉ sáng) · CN đỏ (nghỉ) · today xanh dương */
    const dayHead = Array.from({ length: last }, (_, i) => {
      const d = i + 1;
      const dow = new Date(y, m - 1, d).getDay();
      const isSun = dow === 0;
      const isSat = dow === 6;
      const isToday = y === today.getFullYear() && m - 1 === today.getMonth() && d === today.getDate();
      const headBg = isToday ? '#E0F2FE' : isSun ? '#FEE2E2' : isSat ? '#FEF3C7' : '#FAFAFB';
      const headCol = isToday ? '#0369A1' : isSun ? 'var(--danger)' : isSat ? '#A16207' : 'var(--navy)';
      return `<th class="att-dh hide-xs" style="background:${headBg};color:${headCol}" title="${isSun ? 'Chủ nhật — nghỉ' : isSat ? 'Thứ 7 — chỉ ca sáng 08:00-12:00 (0.5 công)' : 'T' + (dow + 1) + ' — full ngày'}">
        <div class="dh-d">${d}</div>
        <div class="dh-w">${dayNames[dow]}${isSat ? '<sup style="font-size:8px">½</sup>' : ''}</div>
      </th>`;
    }).join('');

    /* === ROWS (gom theo phòng ban, accordion — dùng chung _payDeptOpen với bảng lương) === */
    const empRows = staffs.map((s) => {
      const sh = sheetOf(s.id); const days = daysForStaff(s, sh ? sh.days : null);
      const meta = metaOf(s.id);
      const c = counts(days, meta);
      const paid = paidDaysFor(s, days);
      const cells = days.map((v, i) => {
        const dayN = i + 1;
        const sf = shiftFactorForStaff(s, dayN);   /* Kho/Ship: mọi ngày = 1 (không ½ T7/nghỉ CN) */
        const isOff = v === '_';
        const isSat = sf === 0.5;
        const cellClass = isOff ? 'att-cell off' :
          v === 'X' ? 'att-cell s-x' :
          v === 'L' ? 'att-cell s-l' :
          v === 'H' ? 'att-cell s-h' :
          v === 'P' ? 'att-cell s-p' :
          v === 'V' ? 'att-cell s-v' : 'att-cell';
        const lateMin = (meta[dayN] && meta[dayN].lateMin) || 0;
        const chip = isOff ? '<span class="achip-off">—</span>' :
          v === 'X' ? '<span class="achip s-x">X</span>' :
          v === 'L' ? `<span class="achip s-l" title="Muộn ${lateMin}p">L</span>${lateMin>15?'<sup class="late-min">'+lateMin+'</sup>':''}` :
          v === 'H' ? '<span class="achip s-h">½</span>' :
          v === 'P' ? '<span class="achip s-p">P</span>' :
          v === 'V' ? '<span class="achip s-v">V</span>' : '';
        const tip = isOff ? 'Chủ nhật — nghỉ' : isSat ? `T7 — chỉ ca sáng 08:00-12:00 (0.5 công). Click để chọn trạng thái.` : 'Click để chọn trạng thái';
        const satMark = isSat && !isOff ? '<span class="sat-mark" title="½ công">½</span>' : '';
        return `<td class="${cellClass}${isSat?' is-sat':''} hide-xs" data-sid="${s.id}" data-day="${dayN}" title="${tip}">${chip}${satMark}</td>`;
      }).join('');
      const deptKey = _payDeptKey(s.dept);
      const rowHtml = `<tr class="att-row pay-emp" data-dept="${deptKey}" style="${_payDeptOpen.has(deptKey) ? '' : 'display:none'}">
        <td class="att-staff">
          <div class="staff-cell">
            <div class="av" style="background:${window.avatarColor(s.name)}">${window.initials(s.name)}</div>
            <div class="info">
              <div class="nm">${s.name}</div>
              <div class="rl">${s.role}</div>
            </div>
          </div>
        </td>
        ${cells}
        <td class="att-stat s-x hide-xs" title="Có mặt full"><b>${c.X}</b></td>
        <td class="att-stat s-l hide-xs" title="Đi muộn"><b>${c.L}</b>${c.lateMin?'<div class="sub">'+c.lateMin+'p</div>':''}</td>
        <td class="att-stat s-h hide-xs" title="½ phép"><b>${c.H}</b></td>
        <td class="att-stat s-p hide-xs" title="Phép cả ngày"><b>${c.P}</b></td>
        <td class="att-stat s-v hide-xs" title="Vắng"><b>${c.V}</b></td>
        <td class="att-stat sum" title="Công tính lương (H=0.5)"><b>${paid % 1 === 0 ? paid : paid.toFixed(1)}</b></td>
      </tr>`;
      return { deptKey, dept: s.dept || 'Khác', paid, rowHtml };
    });
    /* Gom theo PHÒNG BAN → header (bấm xổ) + NV bên dưới (ẩn khi gập). Tổng công mỗi phòng. */
    const _attColspan = last + 7;
    const _adg = {};
    empRows.forEach(e => { const g = _adg[e.deptKey] || (_adg[e.deptKey] = { name: e.dept, key: e.deptKey, emps: [], cong: 0 }); g.emps.push(e); g.cong += e.paid; });
    const rows = Object.values(_adg).sort((a, b) => b.emps.length - a.emps.length).map(g => {
      const open = _payDeptOpen.has(g.key);
      const hdr = `<tr class="pay-dept-hdr att-dept-hdr${open ? ' open' : ''}" data-deptkey="${g.key}" onclick="window.togglePayDept('${g.key}')">
        <td colspan="${_attColspan}" style="padding:0!important">
          <div style="position:sticky;left:0;display:inline-flex;align-items:center;gap:8px;padding:9px 12px;white-space:nowrap">
            <span class="dept-chev" style="color:#15803D;font-size:12px;width:12px">${open ? '▾' : '▸'}</span>
            <b style="font-size:13px">${g.name}</b>
            <span style="color:var(--muted);font-size:11.5px">${g.emps.length} NV</span>
            <span style="color:#15803D;font-weight:700;margin-left:10px">· Tổng công: ${g.cong % 1 === 0 ? g.cong : g.cong.toFixed(1)}</span>
          </div>
        </td></tr>`;
      return hdr + g.emps.map(e => e.rowHtml).join('');
    }).join('');

    /* === Tổng kết toàn công ty === */
    const totals = staffs.reduce((acc, s) => {
      const sh = sheetOf(s.id); const md = metaOf(s.id);
      const c = counts(daysForStaff(s, sh ? sh.days : null), md);
      acc.X += c.X; acc.L += c.L; acc.H += c.H; acc.P += c.P; acc.V += c.V; acc.lateMin += c.lateMin;
      return acc;
    }, { X: 0, L: 0, H: 0, P: 0, V: 0, lateMin: 0 });

    document.getElementById('payView').innerHTML = `
      <style>
        .att-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:12px}
        .att-summary .item{padding:10px 12px;border-radius:8px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:10px;border:1px solid var(--line)}
        .att-summary .item .ic{width:32px;height:32px;border-radius:7px;display:grid;place-items:center;font-size:14px;font-weight:800;color:#fff;flex-shrink:0}
        .att-summary .item .body{flex:1;min-width:0}
        .att-summary .item .num{font-size:18px;font-weight:800;line-height:1.1}
        .att-summary .item .lbl{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.3px;font-weight:600;margin-top:1px}
        .att-summary .item.x{background:#F0FDF4}  .att-summary .item.x .ic{background:#16A34A}  .att-summary .item.x .num{color:#15803D}
        .att-summary .item.l{background:#FFF7ED}  .att-summary .item.l .ic{background:#EA580C}  .att-summary .item.l .num{color:#C2410C}
        .att-summary .item.h{background:#FEFCE8}  .att-summary .item.h .ic{background:#CA8A04}  .att-summary .item.h .num{color:#A16207}
        .att-summary .item.p{background:#FFFBEB}  .att-summary .item.p .ic{background:#F59E0B}  .att-summary .item.p .num{color:#A16207}
        .att-summary .item.v{background:#FEF2F2}  .att-summary .item.v .ic{background:#EF4444}  .att-summary .item.v .num{color:#B91C1C}
        .att-summary .item.late{background:#F5F3FF}.att-summary .item.late .ic{background:#7C3AED}.att-summary .item.late .num{color:#6D28D9}

        .att-legend{display:flex;align-items:center;gap:10px;font-size:11.5px;color:var(--muted);margin-bottom:8px;flex-wrap:wrap;padding:10px 12px;background:#FAFAFB;border:1px dashed var(--line);border-radius:7px}
        .att-legend b{color:var(--navy)}
        .att-legend .achip{margin:0 2px}
        .achip{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;line-height:1;text-align:center;border-radius:6px;font-weight:800;font-size:12.5px;vertical-align:middle}
        .achip.s-x{background:#16A34A;color:#fff}
        .achip.s-l{background:#EA580C;color:#fff}
        .achip.s-h{background:linear-gradient(90deg,#F59E0B 50%,#16A34A 50%);color:#fff;font-size:13px}
        .achip.s-p{background:#F59E0B;color:#fff}
        .achip.s-v{background:#EF4444;color:#fff}
        .achip-off{color:var(--muted-2);font-weight:600;font-size:13px}
        .late-min{position:relative;top:-8px;font-size:9px;color:#C2410C;font-weight:700;background:#fff;padding:0 3px;border-radius:3px;border:1px solid #FED7AA}

        .att-wrap{background:#fff;border:1px solid var(--line);border-radius:10px;overflow:auto;max-height:calc(100vh - 320px)}
        table.att-table{width:auto;border-collapse:separate;border-spacing:0;font-family:'Segoe UI',Arial,sans-serif}
        table.att-table th, table.att-table td{padding:0;border-bottom:1px solid var(--line);border-right:1px solid #F1F3F5}
        table.att-table thead th{position:sticky;top:0;z-index:2;background:#FAFAFB}
        .att-staff{position:sticky;left:0;z-index:3;background:#fff;min-width:220px;padding:8px 12px!important;border-right:1px solid var(--line)!important}
        thead .att-staff{background:#F0FDF4;font-weight:700;color:var(--navy);font-size:12px;text-transform:uppercase;letter-spacing:0.3px;text-align:left}
        .att-dh{width:34px;text-align:center;padding:6px 0!important;font-size:11px;font-weight:700;border-bottom:2px solid var(--line)!important}
        .att-dh .dh-d{font-size:13px;font-weight:800;line-height:1.1}
        .att-dh .dh-w{font-size:9.5px;font-weight:500;opacity:0.7;text-transform:uppercase;letter-spacing:0.3px;margin-top:1px}

        .staff-cell{display:flex;align-items:center;gap:10px}
        .staff-cell .av{width:32px;height:32px;border-radius:50%;color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700;flex-shrink:0}
        .staff-cell .info .nm{font-weight:700;font-size:13px;color:var(--navy);line-height:1.2}
        .staff-cell .info .rl{font-size:11px;color:var(--muted);margin-top:1px}

        .att-row:hover .att-staff{background:#F0FDF4}
        .att-row:hover td:not(.att-staff){background:#FAFAFB}
        /* Header PHÒNG BAN trong bảng chấm công (accordion) — 1 ô colspan, nội dung ghim trái */
        .att-table tr.att-dept-hdr td{position:static!important;background:#F0FDF4!important;cursor:pointer;border-top:2px solid #BBF7D0!important;text-align:left!important}
        .att-table tr.att-dept-hdr td > div{background:#F0FDF4}
        .att-table tr.att-dept-hdr:hover td, .att-table tr.att-dept-hdr:hover td > div{background:#E4F7E8!important}
        .att-table tr.att-dept-hdr.open td, .att-table tr.att-dept-hdr.open td > div{background:#DCFCE7!important}

        .att-cell{width:34px;height:42px;text-align:center;vertical-align:middle;cursor:pointer;transition:transform 0.08s;background:#fff;position:relative;line-height:1;font-size:0;padding:0}
        .att-cell > *{font-size:12.5px;line-height:1}
        .att-cell:hover{transform:scale(1.15);z-index:1;box-shadow:0 0 0 2px var(--red) inset}
        .att-cell.off{background:repeating-linear-gradient(45deg,#F9FAFB,#F9FAFB 4px,#F3F4F6 4px,#F3F4F6 8px);cursor:default}
        .att-cell.off:hover{transform:none;box-shadow:none}
        .att-cell.s-x{background:#F0FDF4} .att-cell.s-l{background:#FFF7ED}
        .att-cell.s-h{background:#FEFCE8} .att-cell.s-p{background:#FFFBEB}
        .att-cell.s-v{background:#FEF2F2}
        /* T7 ô có viền vàng để phân biệt nửa ngày làm */
        .att-cell.is-sat{box-shadow:inset 0 -3px 0 #F59E0B}
        .sat-mark{position:absolute;top:1px;left:2px;font-size:8px;color:#A16207;font-weight:700;background:#FEF3C7;padding:0 3px;border-radius:3px;line-height:11px}

        .att-stat{width:46px;text-align:center;font-size:13.5px;padding:4px 0!important;border-left:1px solid var(--line)!important;font-weight:700}
        .att-stat .sub{font-size:9.5px;color:var(--muted);font-weight:600;margin-top:1px}
        .att-stat.s-x{background:#F0FDF4;color:#15803D}
        .att-stat.s-l{background:#FFF7ED;color:#C2410C}
        .att-stat.s-h{background:#FEFCE8;color:#A16207}
        .att-stat.s-p{background:#FFFBEB;color:#A16207}
        .att-stat.s-v{background:#FEF2F2;color:#B91C1C}
        .att-stat.sum{background:#E0F2FE;color:#0369A1;font-size:14px}
        thead .att-stat{font-size:11px;font-weight:700;padding:6px 0!important;text-transform:uppercase}

        /* Popover chọn trạng thái */
        .att-pop{position:fixed;z-index:9999;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.15);padding:10px;min-width:280px}
        .att-pop .ph{font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:0.3px;font-weight:700;margin-bottom:8px}
        .att-pop .opts{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:8px}
        .att-pop .opt{padding:8px 4px;border:1px solid var(--line);border-radius:7px;cursor:pointer;text-align:center;background:#fff;transition:all 0.15s}
        .att-pop .opt:hover{transform:translateY(-1px)}
        .att-pop .opt.on{box-shadow:0 0 0 2px var(--red)}
        .att-pop .opt .achip{margin-bottom:4px}
        .att-pop .opt .lb{font-size:10px;color:var(--muted);font-weight:600}
        .att-pop .late-row{display:flex;align-items:center;gap:8px;padding:8px;background:#FFF7ED;border:1px dashed #FED7AA;border-radius:7px;margin-bottom:8px}
        .att-pop .late-row label{font-size:11.5px;color:#C2410C;font-weight:700;margin:0}
        .att-pop .late-row input{width:60px;text-align:center;padding:4px 6px;border:1px solid var(--line);border-radius:5px;font-weight:700}
        .att-pop .actions{display:flex;gap:6px;justify-content:flex-end}
      </style>

      <div class="att-summary">
        <div class="item x"><div class="ic">X</div><div class="body"><div class="num">${totals.X}</div><div class="lbl">Có mặt full</div></div></div>
        <div class="item l"><div class="ic">L</div><div class="body"><div class="num">${totals.L}</div><div class="lbl">Đi muộn (${totals.lateMin}p)</div></div></div>
        <div class="item h"><div class="ic">½</div><div class="body"><div class="num">${totals.H}</div><div class="lbl">½ ngày phép</div></div></div>
        <div class="item p"><div class="ic">P</div><div class="body"><div class="num">${totals.P}</div><div class="lbl">Phép cả ngày</div></div></div>
        <div class="item v"><div class="ic">V</div><div class="body"><div class="num">${totals.V}</div><div class="lbl">Vắng không lương</div></div></div>
        <div class="item late"><div class="ic">⏰</div><div class="body"><div class="num">${totals.lateMin}</div><div class="lbl">Tổng phút muộn</div></div></div>
      </div>

      <div class="att-legend" style="flex-direction:column;align-items:stretch;gap:6px">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:11.5px">
          <span>🏢 <b>Văn phòng (GĐ/Sales/CSKH/Kế toán):</b> <b>${SHIFT_DEFAULT.morn[0]}-${SHIFT_DEFAULT.morn[1]}</b> + <b>${SHIFT_DEFAULT.aft[0]}-${SHIFT_DEFAULT.aft[1]}</b></span>
          <span>📦 <b>Kho:</b> <b>${SHIFT_WAREHOUSE.morn[0]}-${SHIFT_WAREHOUSE.morn[1]}</b> + <b>${SHIFT_WAREHOUSE.aft[0]}-${SHIFT_WAREHOUSE.aft[1]}</b></span>
          <span>🛵 <b>Ship (Giao hàng):</b> <b>${SHIFT_SHIPPER.morn[0]}-${SHIFT_SHIPPER.morn[1]}</b> + <b>${SHIFT_SHIPPER.aft[0]}-${SHIFT_SHIPPER.aft[1]}</b></span>
          <span>T7 chỉ ca sáng = 0.5 công · CN nghỉ</span>
        </div>
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <span>📌 <b>Click ô</b> để chọn:</span>
          <span><span class="achip s-x">X</span> Có mặt</span>
          <span><span class="achip s-l">L</span> Đi muộn (≤${LATE_GRACE_MIN}p miễn phạt)</span>
          <span><span class="achip s-h">½</span> Nửa ca phép</span>
          <span><span class="achip s-p">P</span> Cả ca phép</span>
          <span><span class="achip s-v">V</span> Vắng</span>
          <span style="color:#A16207"><b>Ô viền vàng ½</b> = T7 nửa ngày</span>
          <span>Ô gạch chéo = CN nghỉ</span>
        </div>
      </div>

      <div class="att-wrap">
        <table class="att-table">
          <thead>
            <tr>
              <th class="att-staff">Nhân viên (${staffs.length})</th>
              ${dayHead}
              <th class="att-stat s-x hide-xs" title="Có mặt full">X</th>
              <th class="att-stat s-l hide-xs" title="Muộn">L</th>
              <th class="att-stat s-h hide-xs" title="½ phép">½</th>
              <th class="att-stat s-p hide-xs" title="Phép cả">P</th>
              <th class="att-stat s-v hide-xs" title="Vắng">V</th>
              <th class="att-stat sum" title="Công tính lương">Công</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    document.querySelectorAll('.att-cell').forEach(td => {
      td.addEventListener('click', (e) => openCellPopover(td, e));
    });
  }

  /* === POPOVER chọn trạng thái === */
  function openCellPopover(td, evt) {
    if (!canEdit()) { window.toast('🔒 Bạn không có quyền chấm công (cần payroll.edit)', 'warn'); return; }
    const sid = td.dataset.sid; const day = parseInt(td.dataset.day, 10);
    const staff = STAFF().find(s => s.id === sid);
    const sh = sheetOf(sid); const days = sh ? sh.days.slice() : defaultDaysFor(staff);
    const cur = days[day - 1]; if (cur === '_' && !_fullWeekStaff(staff)) return;   /* Kho/Ship: cho sửa cả ngày CN (làm cả tuần) */
    const md = metaOf(sid); const curLate = (md[day] && md[day].lateMin) || 0;
    const sf = shiftFactorForStaff(staff, day);   /* Kho/Ship: T7/CN vẫn full */
    const isSat = sf === 0.5;
    const SH = shiftHoursFor(staff);
    const shTag = SH === SHIFT_SHIPPER ? '🛵 Ship' : SH === SHIFT_WAREHOUSE ? '📦 Kho' : '🏢 Văn phòng';
    const shiftInfo = isSat
      ? `${shTag} · T7 — chỉ ca sáng <b>${SH.morn[0]}-${SH.morn[1]}</b> · 1 công = <b>0.5</b>`
      : `${shTag} · T${new Date(+month.slice(0,4), +month.slice(5,7)-1, day).getDay()+1} — sáng <b>${SH.morn[0]}-${SH.morn[1]}</b>, chiều <b>${SH.aft[0]}-${SH.aft[1]}</b> · 1 công = 1.0`;

    /* Remove existing popover */
    document.querySelectorAll('.att-pop').forEach(p => p.remove());

    const pop = document.createElement('div');
    pop.className = 'att-pop';
    pop.innerHTML = `
      <div class="ph">Ngày ${day} · ${td.closest('tr').querySelector('.nm').textContent}</div>
      <div style="font-size:11px;color:var(--muted);padding:6px 10px;background:${isSat?'#FEF3C7':'#F0FDF4'};border-radius:6px;margin-bottom:8px;line-height:1.5">${shiftInfo}</div>
      <div class="opts" id="popOpts">
        ${['X','L','H','P','V'].map(s => `<div class="opt ${cur===s?'on':''}" data-s="${s}">
          <div class="achip s-${s.toLowerCase()}">${s==='H'?'½':s}</div>
          <div class="lb">${s==='X'?'Có mặt':s==='L'?'Muộn':s==='H'?'½ phép':s==='P'?'Phép':'Vắng'}</div>
        </div>`).join('')}
      </div>
      <div class="late-row" id="popLateRow" style="display:${cur==='L'?'flex':'none'}">
        <label>⏰ Đi muộn:</label>
        <input id="popLateMin" type="number" min="0" max="480" value="${curLate}">
        <span style="font-size:11px;color:#C2410C">phút (sau ${SH.morn[0]}). ≤${LATE_GRACE_MIN}p miễn phạt · sau đó ${LATE_DEDUCT_PER_MIN.toLocaleString('vi-VN')}đ/p</span>
      </div>
      <div class="actions">
        <button class="btn btn-ghost btn-sm" onclick="this.closest('.att-pop').remove()">Hủy</button>
        <button class="btn btn-primary btn-sm" id="popSave">💾 Lưu</button>
      </div>
    `;
    document.body.appendChild(pop);
    /* Position near click */
    const r = td.getBoundingClientRect();
    const popW = 320;
    let left = r.left + r.width / 2 - popW / 2;
    if (left + popW > window.innerWidth - 16) left = window.innerWidth - popW - 16;
    if (left < 16) left = 16;
    let top = r.bottom + 6;
    if (top + 200 > window.innerHeight) top = r.top - 200;
    pop.style.left = left + 'px'; pop.style.top = top + 'px';

    let picked = cur;
    pop.querySelectorAll('.opt').forEach(o => {
      o.addEventListener('click', () => {
        picked = o.dataset.s;
        pop.querySelectorAll('.opt').forEach(x => x.classList.toggle('on', x === o));
        pop.querySelector('#popLateRow').style.display = picked === 'L' ? 'flex' : 'none';
      });
    });
    pop.querySelector('#popSave').addEventListener('click', () => {
      setDayCell(sid, day, picked);
      /* Late minutes */
      if (picked === 'L') {
        const min = parseInt(pop.querySelector('#popLateMin').value, 10) || 0;
        setMetaCell(sid, day, { lateMin: min });
      } else {
        setMetaCell(sid, day, null);
      }
      pop.remove();
      render();
    });
    /* Click outside closes */
    setTimeout(() => {
      const close = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', close); } };
      document.addEventListener('click', close);
    }, 100);
  }

  function cycleCell(sid, day) {
    if (!canEdit()) { window.toast('🔒 Bạn không có quyền chấm công (cần perm payroll.edit)', 'warn'); return; }
    const sh = sheetOf(sid);
    const cur = sh ? sh.days[day - 1] : defaultDays()[day - 1];
    if (cur === '_') return;
    setDayCell(sid, day, cur === 'X' ? 'P' : cur === 'P' ? 'V' : 'X');
    render();
  }

  /* === Tính HOA HỒNG / THƯỞNG theo salaryConfig của NV ===
     Trả về { amount, label } để hiển thị trong cột "Hoa hồng/Thưởng" */
  function computeBonusFromConfig(staff) {
    const cfg = staff.salaryConfig || { type: 'fixed' };
    if (!cfg.type || cfg.type === 'fixed' || cfg.type === 'custom') return { amount: 0, label: cfg.type==='custom'?'tự tính':'—' };

    const [y, m] = month.split('-').map(Number);
    const orders = window.STORE.get('orders', window.ORDERS || []) || [];
    const customers = window.STORE.get('customers', window.CUSTOMERS || []) || [];

    const monthOrders = orders.filter(o => {
      if (o.status === 'cancelled') return false;
      const mm = (o.date || '').match(/(\d+)\/(\d+)\/(\d+)/);
      return mm && +mm[2] === m && +mm[3] === y;
    });

    if (cfg.type === 'commission') {
      const pct = cfg.commissionPct || 0;
      let scopeOrders = [];
      if (cfg.commissionScope === 'ownOrders') scopeOrders = monthOrders.filter(o => o.staff === staff.name);
      else if (cfg.commissionScope === 'allOrders') scopeOrders = monthOrders;
      else {  /* 'ownedCusts' default */
        const myCusts = customers.filter(c => c.staffOwner === staff.name).map(c => c.id);
        scopeOrders = monthOrders.filter(o => myCusts.includes(o.cust));
      }
      const rev = scopeOrders.reduce((s, o) => s + (o.freight || 0), 0);
      const bonus = Math.round(rev * pct / 100);
      return { amount: bonus, label: `${pct}% × ${scopeOrders.length}đ DT ${(rev/1e6).toFixed(1)}tr = ${(bonus/1e6).toFixed(2)}tr` };
    }
    if (cfg.type === 'perOrder') {
      const target = cfg.perOrderStatus || 'reconciled';
      const myOrders = monthOrders.filter(o => o.driverName === staff.name && o.status === target);
      const bonus = myOrders.length * (cfg.perOrderBonus || 0);
      return { amount: bonus, label: `${myOrders.length} đơn × ${(cfg.perOrderBonus||0).toLocaleString('vi-VN')}đ` };
    }
    if (cfg.type === 'kpi') {
      const myOrders = monthOrders.filter(o => o.staff === staff.name);
      const rev = myOrders.reduce((s, o) => s + (o.freight || 0), 0);
      const target = cfg.kpiTarget || 0;
      const pct = target ? rev / target * 100 : 0;
      let bonus = 0; let lbl;
      if (pct >= 100) { bonus = cfg.kpiBonus || 0; lbl = `Đạt ${pct.toFixed(0)}% KPI · full thưởng`; }
      else if (pct >= 80) { bonus = Math.round((cfg.kpiBonus || 0) * 0.5); lbl = `Đạt ${pct.toFixed(0)}% KPI · 50% thưởng`; }
      else lbl = `Chỉ ${pct.toFixed(0)}% KPI · không thưởng`;
      return { amount: bonus, label: lbl };
    }
    return { amount: 0, label: '—' };
  }

  /* ===== Nhóm bảng lương theo PHÒNG BAN (accordion: header = quỹ lương phòng, bấm xổ NV) ===== */
  const _payDeptKey = d => String(d || 'Khác').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase() || 'khac';
  let _payDeptOpen = new Set();   /* phòng đang xổ (mặc định GẬP hết → chỉ hiện tổng quỹ mỗi phòng) */
  window.togglePayDept = function (key) {
    const open = !_payDeptOpen.has(key);
    if (open) _payDeptOpen.add(key); else _payDeptOpen.delete(key);
    document.querySelectorAll(`tr.pay-emp[data-dept="${key}"]`).forEach(tr => { tr.style.display = open ? '' : 'none'; });
    const chev = document.querySelector(`tr.pay-dept-hdr[data-deptkey="${key}"] .dept-chev`);
    if (chev) chev.textContent = open ? '▾' : '▸';
    const hdr = document.querySelector(`tr.pay-dept-hdr[data-deptkey="${key}"]`);
    if (hdr) hdr.classList.toggle('open', open);
  };

  function renderPayroll() {
    const staffs = STAFF();
    const wdOffice = window.officeWorkStandard ? window.officeWorkStandard(month) : workdaysInMonth();   /* NC chuẩn khối VP theo lịch tháng */
    /* === Đọc payslips đã lập (array) cho tháng đang chọn === */
    const allPayslips = window.STORE.get('payrollExtra', []) || [];
    const monthPayslips = Array.isArray(allPayslips)
      ? allPayslips.filter(p => p && p.month === month)
      : [];
    const psByStaff = Object.fromEntries(monthPayslips.map(p => [p.staffId, p]));
    /* === Read latePolicy để tính phạt muộn auto từ chấm công === */
    const PF = window.PayrollFormula;
    const STATUS_BADGE = {
      'draft':     '<span style="background:#FEF3C7;color:#854D0E;padding:3px 9px;border-radius:5px;font-size:10.5px;font-weight:700">📝 NHÁP</span>',
      'submitted': '<span style="background:#DBEAFE;color:#1E40AF;padding:3px 9px;border-radius:5px;font-size:10.5px;font-weight:700">📤 CHỜ DUYỆT</span>',
      'approved':  '<span style="background:#DCFCE7;color:#15803D;padding:3px 9px;border-radius:5px;font-size:10.5px;font-weight:700">✓ ĐÃ DUYỆT</span>',
      'paid':      '<span style="background:#E0E7FF;color:#3730A3;padding:3px 9px;border-radius:5px;font-size:10.5px;font-weight:700">💵 ĐÃ TRẢ</span>',
    };

    let totalAll = 0; let totalBonusAll = 0; let totalPenAll = 0;
    let totalBhxhAll = 0; let totalAdvAll = 0; let totalCongAll = 0;
    let totalBhxhComAll = 0; let totalAllowAll = 0; let totalCommAll = 0;
    let countByStatus = { draft: 0, submitted: 0, approved: 0, paid: 0, none: 0 };

    const empData = staffs.map(s => {
      const sh = sheetOf(s.id);
      const days = daysForStaff(s, sh ? sh.days : null);
      const paid = paidDaysFor(s, days);
      /* NC chuẩn theo PHÒNG: Ship 30 · Kho 29/30(TV) · Văn phòng theo lịch tháng */
      const wd = window.workStandardFor ? window.workStandardFor(s.dept, s.contractType, month, s.role) : wdOffice;
      const luongNgay = wd ? Math.round((s.salary || 0) / wd) : 0;
      const luongCo = Math.round(luongNgay * paid);

      const ps = psByStaff[s.id];
      /* Phiếu NHÁP lập trước v418 chưa khai bhxhOn/commMode: drawer sẽ tự nạp cấu hình NV khi mở.
         Bảng lương phải nạp Y HỆT, nếu không bảng và phiếu hiện 2 số BHXH/hoa hồng khác nhau. */
      if (ps && ps.status === 'draft' && window.hydrateDraftPayslip) window.hydrateDraftPayslip(ps);
      const hasPhieu = !!(ps && typeof ps.total === 'number');

      /* Thưởng hỗ trợ Kho/Ship — TỰ tính từ sổ ghi (bonusLog), cộng thẳng vào cột Thưởng */
      /* Thưởng hỗ trợ = tính theo QUY CHẾ phủ ngày từng khoản. Nhưng phiếu ĐÃ nộp/duyệt/trả
         thì GIỮ số đã chốt trên phiếu (sửa quy chế sau này không làm đổi lương đã duyệt). */
      const _liveHelper = window.BONUS ? (window.BONUS.helperFor(s.id, month).total || 0) : 0;
      /* Phiếu ĐÃ nộp/duyệt/trả → LUÔN dùng số đã chốt trên phiếu (thiếu field ⇒ 0).
         Không dùng `typeof === 'number'` nữa: phiếu cũ có helperBonus = null sẽ rơi về số LIVE,
         nghĩa là sửa quy chế / lịch trực làm đổi lương đã duyệt. */
      const helperBonus = (ps && ps.status && ps.status !== 'draft') ? (+ps.helperBonus || 0) : _liveHelper;

      /* Dùng CHUNG engine với phiếu lương → bảng & phiếu KHÔNG BAO GIỜ lệch số.
         Chưa lập phiếu → dựng input tạm từ hồ sơ NV + chấm công để XEM TRƯỚC
         phụ cấp / hoa hồng / BHXH (trước đây cột này bỏ trống). */
      let _psIn = null;
      if (PF) {
        _psIn = Object.assign({
          dept: s.dept, role: s.role, contractType: s.contractType || 'official',
          basicSalary: s.salary || 0, workActual: paid,
          bonuses: [], penalties: [], advance: 0,
        }, ps || {}, { staffId: s.id, staffName: s.name, month, helperBonus });
        /* CHƯA lập phiếu → xem trước theo cấu hình NV (BHXH + hoa hồng).
           ĐÃ có phiếu → KHÔNG tự áp; giữ đúng số đã chốt trên phiếu (phiếu cũ = legacy). */
        if (!ps) {
          const sc = PF.getStaffPayCfg(s.id);
          _psIn.bhxhOn = sc.bhxhOn;
          /* Mức đóng BH = mức riêng của NV, nếu trống thì MỨC CƠ SỞ MẶC ĐỊNH (Cài đặt, 5.5tr).
             PHẢI khớp getOrCreatePayslip bên phiếu lương — nếu lấy s.salary như trước thì
             bảng và phiếu ra 2 số BHXH khác nhau cho cùng 1 người. */
          _psIn.bhxhBase = sc.bhxhBase || (+PF.getPayrollConfig().bhxh.defaultBase || 0);
          _psIn.commMode = sc.commMode;
          _psIn.commPct = sc.commPct;
          _psIn.commScope = sc.commScope;
        }
      }
      const c = _psIn ? PF.computePayslip(_psIn) : null;

      /* Phạt muộn — LẤY TỪ KẾT QUẢ TÍNH, không tính lại:
         phiếu đã duyệt/đã trả giữ số phạt đã chốt, và tier "trừ ½ ngày công" cần lương ngày
         của chính NV (chỉ computePayslip mới biết). Tính riêng ở đây → cột Phạt lệch phiếu lương. */
      const lateAuto = (c && c.lateAuto) ? c.lateAuto : { count: 0, total: 0, detail: [] };

      const workActual = c ? (+c.workActual || 0) : paid;
      /* Mẫu số hiển thị PHẢI lấy từ chính kết quả tính (theo contractType của PHIẾU),
         không lấy s.contractType của hồ sơ NV — nếu không "Công 26/29" mà lương lại chia cho 30. */
      const wdShow = c ? (+c.workStandard || wd) : wd;
      const baseSalary = c ? c.baseSalary : luongCo;
      const allowance  = c ? c.allowance : 0;
      const comm       = (c && c.commission) || { amount: 0, pct: 0, mode: 'none', revenue: 0 };
      const bonusSum   = c ? c.totalBonus : helperBonus;
      const penSum     = (c ? c.totalPenalty : 0) + lateAuto.total;
      const bhxhEmp    = c ? c.bhxhEmp : 0;
      const bhxhCom    = c ? c.bhxhCom : 0;
      const advance    = c ? c.advance : 0;
      const total      = c ? c.total : Math.max(0, luongCo + helperBonus - lateAuto.total);

      if (hasPhieu) countByStatus[ps.status] = (countByStatus[ps.status] || 0) + 1;
      else countByStatus.none++;
      const statusBadge = hasPhieu
        ? (STATUS_BADGE[ps.status] || '')
        : '<span style="color:var(--muted);font-size:10.5px">— chưa lập</span>';

      totalAll += total;
      totalBonusAll += bonusSum;
      totalPenAll += penSum;
      totalBhxhAll += bhxhEmp;
      totalBhxhComAll += bhxhCom;
      totalAdvAll += advance;
      totalAllowAll += allowance;
      totalCommAll += comm.amount;
      totalCongAll += workActual;

      const deptKey = _payDeptKey(s.dept);
      const rowHtml = `<tr class="pay-emp" data-dept="${deptKey}" style="${_payDeptOpen.has(deptKey) ? '' : 'display:none'}">
        <td><div style="display:flex;align-items:center;gap:8px">
          <div style="width:28px;height:28px;border-radius:50%;background:${window.avatarColor(s.name)};color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700">${window.initials(s.name)}</div>
          <div><b>${s.name}</b><div style="color:var(--muted);font-size:11px">${s.role} · ${s.dept || ''}</div></div>
        </div></td>
        <td class="num"><b>${window.fmt(s.salary || 0)}</b></td>
        <td class="num"><b style="color:#0369A1">${workActual % 1 === 0 ? workActual : workActual.toFixed(2)}</b><div style="font-size:10px;color:var(--muted)">/${wdShow % 1 === 0 ? wdShow : wdShow.toFixed(1)}</div></td>
        <td class="num"><b>${window.fmt(baseSalary)}</b></td>
        <td class="num" style="color:#0F766E" title="Phụ cấp ${PF ? (PF.ALLOWANCE_LABEL[c && c.allowanceKey] || '') : ''} — chia theo công thực tế">${allowance ? '<b>+' + window.fmt(allowance) + '</b>' : '<span style="color:var(--muted)">—</span>'}</td>
        <td class="num" style="color:#B45309" title="${comm.mode === 'auto' ? comm.pct + '% × doanh thu ' + window.fmt(comm.revenue) + 'đ' : comm.mode === 'manual' ? 'Nhập tay ở phiếu lương' : 'NV này không có hoa hồng'}">${comm.amount ? '<b>+' + window.fmt(comm.amount) + '</b>' + (comm.mode === 'auto' ? '<div style="font-size:10px;color:var(--muted);font-weight:400">' + comm.pct + '%</div>' : '') : '<span style="color:var(--muted)">—</span>'}</td>
        <td class="num" style="color:#15803D" title="${helperBonus ? 'Gồm thưởng hỗ trợ (sổ ghi): ' + window.fmt(helperBonus) + 'đ' : ''}">${bonusSum ? '<b>+' + window.fmt(bonusSum) + '</b>' + (helperBonus ? '<div style="font-size:10px;color:#0369A1;font-weight:400">🎁 ' + window.fmt(helperBonus) + '</div>' : '') : '<span style="color:var(--muted)">—</span>'}</td>
        <td class="num" style="color:#DC2626" title="${lateAuto.count ? lateAuto.count + ' lần muộn = ' + window.fmt(lateAuto.total) + 'đ (auto từ chấm công) + phạt khác' : 'Phạt thủ công'}">${penSum ? '<b>−' + window.fmt(penSum) + '</b>' + (lateAuto.count ? '<div style="font-size:10px;color:#A16207;font-weight:400">⏰ ' + lateAuto.count + ' lần muộn</div>' : '') : '<span style="color:var(--muted)">—</span>'}</td>
        <td class="num" style="color:#A16207">${advance ? '<b>−' + window.fmt(advance) + '</b>' : '<span style="color:var(--muted)">—</span>'}</td>
        <td class="num" style="color:#7C3AED" title="Nhân viên đóng ${c && c.bhxhRates ? c.bhxhRates.empPct : 10.5}% — TRỪ vào thực lĩnh">${bhxhEmp ? '<b>−' + window.fmt(bhxhEmp) + '</b>' : '<span style="color:var(--muted)">—</span>'}</td>
        <td class="num" style="color:#6B7280" title="Doanh nghiệp đóng ${c && c.bhxhRates ? c.bhxhRates.comPct : 21.5}% — công ty chi, KHÔNG trừ vào lương NV">${bhxhCom ? window.fmt(bhxhCom) : '<span style="color:var(--muted)">—</span>'}</td>
        <td class="num"><b style="color:var(--red);font-size:14px">${window.fmt(total)}</b></td>
        <td class="num">${statusBadge}</td>
        <td class="num">
          ${canOpenPayslip()
            ? `<button class="btn btn-navy btn-sm" onclick="window.openPayslipDrawer('${s.id}', '${month}')" title="${hasPhieu ? 'Xem/sửa phiếu lương' : 'Tạo phiếu lương'}">${hasPhieu ? '👁 Xem' : '➕ Lập'}</button>`
            : `<span style="color:var(--muted);font-size:11px;opacity:0.6" title="Bạn không có quyền duyệt lương">🔒</span>`}
        </td>
      </tr>`;
      return { deptKey, dept: s.dept || 'Khác', total, rowHtml };
    });

    /* Gom theo PHÒNG BAN → mỗi phòng 1 dòng header (bấm xổ) + các NV bên dưới (ẩn khi gập) */
    const _dg = {};
    empData.forEach(e => { const g = _dg[e.deptKey] || (_dg[e.deptKey] = { name: e.dept, key: e.deptKey, emps: [], total: 0 }); g.emps.push(e); g.total += e.total; });
    const _dgList = Object.values(_dg).sort((a, b) => b.total - a.total);   /* phòng quỹ lớn lên trước */
    const rows = _dgList.map(g => {
      const open = _payDeptOpen.has(g.key);
      const hdr = `<tr class="pay-dept-hdr${open ? ' open' : ''}" data-deptkey="${g.key}" onclick="window.togglePayDept('${g.key}')">
        <td colspan="14">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="dept-chev" style="color:#15803D;font-size:12px;width:12px">${open ? '▾' : '▸'}</span>
            <b style="font-size:13px">${g.name}</b>
            <span style="color:var(--muted);font-size:11.5px">${g.emps.length} NV</span>
            <div style="flex:1"></div>
            <span style="font-weight:800;color:var(--red)">Quỹ: ${window.fmt(g.total)}đ</span>
          </div>
        </td></tr>`;
      return hdr + g.emps.map(e => e.rowHtml).join('');
    }).join('');

    const wdFmt = wdOffice % 1 === 0 ? wdOffice : wdOffice.toFixed(1);
    const draftCount = countByStatus.draft || 0;
    const submittedCount = countByStatus.submitted || 0;
    const approvedCount = countByStatus.approved || 0;
    const paidCount = countByStatus.paid || 0;
    const noneCount = countByStatus.none || 0;
    const hasDraftOrNone = draftCount + noneCount;
    const submitAllVisible = canCalc() && hasDraftOrNone > 0;
    const approveAllVisible = canApprove() && submittedCount > 0;

    document.getElementById('payView').innerHTML = `
      <section class="kpis" style="margin-bottom:14px">
        <div class="kpi k-1"><div class="kpi-label">Tổng quỹ lương T${month.slice(5)}/${month.slice(0, 4)}</div><div class="kpi-value">${window.fmtShort(totalAll)}</div><div class="kpi-trend">${staffs.length} NV · VP ${wdFmt} · Kho 29/30 · Ship 30</div><div class="kpi-icon">💰</div></div>
        <div class="kpi k-2"><div class="kpi-label">Tổng thưởng tháng</div><div class="kpi-value" style="color:var(--ok)">${window.fmtShort(totalBonusAll)}</div><div class="kpi-trend">lễ + chuyên cần + hoa hồng + ship</div><div class="kpi-icon">🎁</div></div>
        <div class="kpi k-3"><div class="kpi-label">Tổng phạt + BHXH</div><div class="kpi-value" style="color:var(--danger)">${window.fmtShort(totalPenAll + totalBhxhAll)}</div><div class="kpi-trend">Phạt ${window.fmtShort(totalPenAll)} + BHXH ${window.fmtShort(totalBhxhAll)}</div><div class="kpi-icon">⚠️</div></div>
        <div class="kpi k-4"><div class="kpi-label">Tạm ứng đã ứng</div><div class="kpi-value" style="color:#A16207">${window.fmtShort(totalAdvAll)}</div><div class="kpi-trend">trừ vào lương cuối tháng</div><div class="kpi-icon">💵</div></div>
        <div class="kpi k-5"><div class="kpi-label">Lương TB/NV</div><div class="kpi-value">${window.fmtShort(staffs.length ? totalAll / staffs.length : 0)}</div><div class="kpi-trend">bình quân</div><div class="kpi-icon">🧮</div></div>
      </section>

      <!-- Status summary + batch actions -->
      <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;font-size:12.5px">
          <div><b style="color:#854D0E">📝 ${draftCount}</b> nháp</div>
          <div><b style="color:#1E40AF">📤 ${submittedCount}</b> chờ duyệt</div>
          <div><b style="color:#15803D">✓ ${approvedCount}</b> đã duyệt</div>
          <div><b style="color:#3730A3">💵 ${paidCount}</b> đã trả</div>
          ${noneCount ? `<div><b style="color:var(--muted)">○ ${noneCount}</b> chưa lập</div>` : ''}
        </div>
        <div style="display:flex;gap:8px">
          ${submitAllVisible ? `<button class="btn btn-navy" onclick="window.submitAllDrafts && window.submitAllDrafts('${month}')" title="HR gửi tất cả phiếu draft + tự lập phiếu cho NV chưa có">📤 Gửi tất cả CFO duyệt (${hasDraftOrNone})</button>` : ''}
          ${approveAllVisible ? `<button class="btn btn-primary" onclick="window.openPayslipBatchReview && window.openPayslipBatchReview('${month}')" title="CFO duyệt hàng loạt">✓ Duyệt hàng loạt (${submittedCount})</button>` : ''}
        </div>
      </div>

      <style>
        .pay-wrap{overflow:auto;position:relative;border:1px solid var(--line);border-radius:10px;background:#fff}
        .pay-table{min-width:1100px;border-collapse:separate;border-spacing:0}
        .pay-table th,.pay-table td{white-space:nowrap}
        /* Cột Nhân viên ghim TRÁI */
        .pay-table th:first-child,.pay-table td:first-child{position:sticky;left:0;z-index:2;background:#fff;border-right:1px solid var(--line)}
        .pay-table thead th:first-child{z-index:4}
        /* Cột "Phiếu" (nút Lập) ghim PHẢI — luôn nhìn thấy, khỏi lướt */
        .pay-table th:last-child,.pay-table td:last-child{position:sticky;right:0;z-index:2;background:#fff;border-left:1px solid var(--line);box-shadow:-6px 0 8px -6px rgba(0,0,0,.15);text-align:center}
        .pay-table thead th:last-child{z-index:4}
        .pay-table tfoot td:first-child,.pay-table tfoot td:last-child{background:#F9FAFB}
        .pay-table tbody tr:hover td{background:#F8FAF8}
        .pay-table tbody tr:hover td:first-child,.pay-table tbody tr:hover td:last-child{background:#F3FAF3}
        /* Dòng header PHÒNG BAN (accordion) — 1 ô colspan, KHÔNG sticky, bấm để xổ/gập NV */
        .pay-table tr.pay-dept-hdr td{position:static!important;left:auto!important;right:auto!important;box-shadow:none!important;background:#F0FDF4!important;cursor:pointer;padding:10px 14px!important;border-top:2px solid #BBF7D0;white-space:normal!important;text-align:left!important}
        .pay-table tr.pay-dept-hdr:hover td{background:#E4F7E8!important}
        .pay-table tr.pay-dept-hdr.open td{background:#DCFCE7!important}
        /* ===== ĐIỆN THOẠI: bảng lương → mỗi NV 1 THẺ (hết kéo ngang) ===== */
        @media (max-width:560px){
          .pay-wrap{overflow:visible!important;border:none;background:transparent}
          .pay-table{min-width:0!important;width:100%}
          .pay-table thead{display:none}
          .pay-table,.pay-table tbody,.pay-table tfoot{display:block;width:100%}
          .pay-table tbody tr,.pay-table tfoot tr{display:block;position:relative;background:#fff;border:1px solid var(--line);border-radius:12px;margin:0 0 10px;padding:11px 13px}
          .pay-table tfoot tr{background:#F0FDF4;border-color:#15803D}
          .pay-table td,.pay-table th:first-child,.pay-table td:first-child,.pay-table td:last-child{position:static!important;display:block;white-space:normal!important;border:none!important;box-shadow:none!important;padding:2px 0!important;text-align:left!important;font-size:12.5px}
          .pay-table td.num{text-align:left!important}
          /* tên NV = tiêu đề thẻ, chừa chỗ cho Thực lĩnh ghim phải */
          .pay-table tbody td:nth-child(1),.pay-table tfoot td:nth-child(1){font-weight:800;font-size:14px;padding-right:120px!important;padding-bottom:7px!important;margin-bottom:6px;border-bottom:1px dashed var(--line)!important}
          /* nhãn từng con số */
          .pay-table tbody td:nth-child(n+2)::before{color:var(--muted);font-weight:600;font-size:11px}
          .pay-table tbody td:nth-child(2)::before{content:"Lương CB: "}
          .pay-table tbody td:nth-child(3)::before{content:"Công: "}
          .pay-table tbody td:nth-child(4)::before{content:"Lương theo công: "}
          .pay-table tbody td:nth-child(5)::before{content:"Phụ cấp: "}
          .pay-table tbody td:nth-child(6)::before{content:"Hoa hồng: "}
          .pay-table tbody td:nth-child(7)::before{content:"Thưởng: "}
          .pay-table tbody td:nth-child(8)::before{content:"Phạt: "}
          .pay-table tbody td:nth-child(9)::before{content:"Tạm ứng: "}
          .pay-table tbody td:nth-child(10)::before{content:"BHXH (NV): "}
          .pay-table tbody td:nth-child(11)::before{content:"BHXH (DN): "}
          .pay-table tbody td:nth-child(13)::before{content:"Trạng thái: "}
          /* Thực lĩnh (cột 12) = số chính, ghim góc phải */
          .pay-table tbody td:nth-child(12){position:absolute!important;top:11px;right:13px;width:auto;font-weight:800;color:#DC2626;font-size:16px}
          /* nút Phiếu (cột 14) = hàng đáy full-width */
          .pay-table tbody td:nth-child(14){margin-top:8px;text-align:center!important}
          .pay-table tbody td:nth-child(14) .btn{width:100%}
          /* Header phòng ban trên ĐT: 1 dòng gọn, bỏ style card của cột 1 */
          .pay-table tr.pay-dept-hdr td{padding:10px 12px!important;padding-right:12px!important;font-size:13px;border-bottom:none!important;margin-bottom:0!important}
          .pay-table tr.pay-dept-hdr td::before{content:""!important}
        }
      </style>
      <div class="pay-wrap">
        <table class="mini-table pay-table">
          <thead><tr>
            <th style="min-width:190px">Nhân viên</th>
            <th class="num" title="Lương cơ bản hợp đồng">Lương CB</th>
            <th class="num" title="Công thực tế / NC chuẩn">Công</th>
            <th class="num" title="LCB × hệ số HĐ ÷ NC chuẩn × công thực tế">Lương theo công</th>
            <th class="num" style="background:#F0FDFA;color:#0F766E" title="VP 650k · Kho 500k · Ship 1.5tr (1.2tr xăng + 300k hao mòn) — chia theo công">Phụ cấp</th>
            <th class="num" style="background:#FFFBEB;color:#B45309" title="% × doanh thu (tự tính) hoặc nhập tay — cấu hình trong hồ sơ NV">% Hoa hồng</th>
            <th class="num" style="background:#F0FDF4;color:#15803D">Thưởng</th>
            <th class="num" style="background:#FEF2F2;color:#DC2626">Phạt</th>
            <th class="num" style="background:#FFFBEB;color:#A16207">Tạm ứng</th>
            <th class="num" style="background:#FAF5FF;color:#7C3AED" title="Nhân viên đóng 10,5% — TRỪ vào thực lĩnh">BHXH (NV)</th>
            <th class="num" style="background:#F3F4F6;color:#6B7280" title="Doanh nghiệp đóng 21,5% — công ty chi, KHÔNG trừ lương NV">BHXH (DN)</th>
            <th class="num" style="background:#FEE2E2">💰 Thực lĩnh</th>
            <th class="num">Trạng thái</th>
            <th class="num">Phiếu</th>
          </tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr style="background:#F9FAFB;font-weight:700;border-top:2px solid var(--navy)">
            <td>TỔNG ${staffs.length} NV</td>
            <td class="num">—</td>
            <td class="num">${totalCongAll.toFixed(1)}</td>
            <td class="num">—</td>
            <td class="num" style="color:#0F766E">+${window.fmt(totalAllowAll)}</td>
            <td class="num" style="color:#B45309">+${window.fmt(totalCommAll)}</td>
            <td class="num" style="color:#15803D">+${window.fmt(totalBonusAll)}</td>
            <td class="num" style="color:#DC2626">−${window.fmt(totalPenAll)}</td>
            <td class="num" style="color:#A16207">−${window.fmt(totalAdvAll)}</td>
            <td class="num" style="color:#7C3AED">−${window.fmt(totalBhxhAll)}</td>
            <td class="num" style="color:#6B7280" title="Chi phí công ty (không trừ NV)">${window.fmt(totalBhxhComAll)}</td>
            <td class="num"><b style="color:var(--red);font-size:14px">${window.fmt(totalAll)}</b></td>
            <td class="num">—</td>
            <td class="num">—</td>
          </tr></tfoot>
        </table>
      </div>

      <div style="font-size:12px;color:var(--muted);margin-top:10px;padding:12px 14px;background:#F0FDF4;border-radius:7px;border-left:3px solid #15803D;line-height:1.7">
        🧮 <b>Cách tính lương theo công thức NSTT:</b> Thực lĩnh = <b>(LCB × hệ số HĐ ÷ Công chuẩn × Công thực tế)</b> + <b>Phụ cấp</b> + <b>Thưởng</b> + <b>Hoa hồng</b> − <b>Phạt</b> − <b>BHXH (NV)</b> − <b>Tạm ứng</b><br>
        • <b>Công chuẩn:</b> Văn phòng 24 · Kho chính thức 29 · Kho thử việc / Part-time / Ship 30<br>
        • <b>Hệ số HĐ:</b> Chính thức 100% · Thử việc 85% · Thực tập / Part-time 100%<br>
        • <b>Phụ cấp</b> (chia theo công): VP 650k · Kho sáng/chiều 500k · Ship sáng/chiều 1.5M (1.2M xăng + 300k hao mòn) · Kho part-time 0 — <i>sửa mức trong Cài đặt</i><br>
        • <b>BHXH:</b> Nhân viên <b>10,5%</b> (trừ vào lương) · Doanh nghiệp <b>21,5%</b> (công ty chi, <b>không</b> trừ NV) — tích chọn + đặt mức lương cơ sở trong hồ sơ từng NV<br>
        • <b>Hoa hồng:</b> tự tính <b>% × doanh thu</b> hoặc <b>gõ tay</b> — chọn cách tính trong hồ sơ NV<br>
        • <b>Chi tiết thưởng/phạt/BHXH/tạm ứng</b> được cấu hình trong phiếu lương (bấm nút <b>Phiếu</b> bên phải mỗi NV)
      </div>`;
  }

  /* ====== 🧹 LÀM SẠCH chấm công tháng đang xem (up nhầm → xoá, up lại) ====== */
  window.clearTimesheetMonth = function () {
    if (!canUpload()) { window.toast('🔒 Bạn không có quyền làm sạch chấm công (cần payroll.upload)', 'warn'); return; }
    const mth = month;
    if (!confirm('🧹 Làm sạch TOÀN BỘ chấm công tháng ' + mth + '?\n\n→ Xoá dữ liệu công (X / V / P / đi muộn) của MỌI nhân viên trong tháng này, bảng về mặc định.\nDùng khi lỡ up nhầm file — xoá rồi up lại. KHÔNG ảnh hưởng tháng khác.')) return;
    if (window.STORE.rmwKv) {
      window.STORE.rmwKv('timesheet', arr => (Array.isArray(arr) ? arr.filter(t => !(t && t.month === mth)) : []), []);
      window.STORE.rmwKv('timesheetMeta', m => { m = (m && typeof m === 'object' && !Array.isArray(m)) ? m : {}; Object.keys(m).forEach(k => { if (k.endsWith('_' + mth)) delete m[k]; }); return m; }, {});
    } else {
      window.STORE.set('timesheet', (SHEETS() || []).filter(t => !(t && t.month === mth)));
      const mm = window.STORE.get('timesheetMeta', {}) || {}; Object.keys(mm).forEach(k => { if (k.endsWith('_' + mth)) delete mm[k]; }); window.STORE.set('timesheetMeta', mm);
    }
    if (window.audit) window.audit.log('payroll.clearTimesheet', 'Làm sạch chấm công ' + mth);
    window.toast('✓ Đã làm sạch chấm công tháng ' + mth + '. Up file mới để cập nhật lại.', 'success');
    render();
  };

  /* ====== Upload Excel chấm công ====== */
  window.openUploadTimesheet = function () {
    if (!canUpload()) { window.toast('🔒 Bạn không có quyền upload chấm công (cần perm payroll.upload)', 'warn'); return; }
    if (!canEdit())   { window.toast('🔒 Upload cần thêm perm payroll.edit để ghi dữ liệu', 'warn'); return; }
    window.openModal('📥 Upload file chấm công Excel', `
      <p style="font-size:12.5px;color:var(--muted);margin-bottom:10px">
        Chấp nhận <b>.xlsx / .xls / .csv</b> từ máy chấm công. App khớp theo <b>Tên viết tắt</b> (tên trong máy)
        đã gắn cho từng NV; ai chưa có tên viết tắt hoặc tên mới sẽ hiện ở bước "khớp thủ công".
        Giá trị ô: <code>X</code>/<code>1</code>/<code>8</code> (có mặt) · <code>P</code> (phép) · <code>V</code>/<code>0</code> (vắng).
        Áp dụng cho tháng <b>${month}</b> hiện chọn.
      </p>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
        <label style="font-size:12.5px;font-weight:600">Khu vực / máy chấm công:</label>
        <select id="tsZone" style="padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px">
          <option value="">Tự động (mọi khu vực)</option>
          <option value="vp">🏢 Văn phòng</option>
          <option value="kho">📦 Kho &amp; Ship</option>
        </select>
        <span style="font-size:11px;color:var(--muted)">Chọn đúng máy → tự tách người trùng tên viết tắt (vd "quang" VP ≠ "quang" Kho).</span>
      </div>
      <input type="file" id="tsFile" accept=".xlsx,.xls,.csv" style="display:block;margin:10px 0;padding:8px;border:1px solid var(--line);border-radius:7px;width:100%">
      <div id="tsPreview" style="font-size:12.5px;color:var(--muted);min-height:24px;padding:8px 0"></div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
               <button class="btn btn-primary" id="tsApply" onclick="window.applyUploadedTimesheet()" disabled>Áp dụng</button>`,
      width: '560px',
    });
    document.getElementById('tsFile').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!window.XLSX) {
        document.getElementById('tsPreview').innerHTML = '<span style="color:var(--danger)">❌ Thư viện SheetJS chưa load. Reload lại trang.</span>'; return;
      }
      try {
        const buf = await f.arrayBuffer();
        const wb = window.XLSX.read(buf, { type: 'array', cellDates: true });
        const det = _tsDetect(wb);
        if (det) det.lateMap = _tsBuildLateMap(wb);   /* per-day đi muộn từ sheet "Bảng thống kê bất thường" */
        if (!det) {
          document.getElementById('tsPreview').innerHTML = '<span style="color:var(--danger)">❌ Không tìm thấy sheet chấm công có cột Họ tên/Mã NV. File có ' + wb.SheetNames.length + ' sheet: ' + wb.SheetNames.slice(0, 6).join(', ') + '…</span>';
          window._tsDet = null; document.getElementById('tsApply').disabled = true; return;
        }
        window._tsDet = det;
        const isOffice = det.mode === 'office';
        const nData = isOffice ? (det.grid.filter(r => (r || []).some(c => /tên\s*:/i.test(String(c || '')) && !/phòng ban/i.test(String(c || '')))).length) : Math.max(0, det.grid.length - det.headerRow - 1);
        const modeLbl = det.mode === 'summary' ? 'Tổng hợp (Có mặt/Thực tế)' : isOffice ? 'Văn phòng (khối theo NV, dấu * = muộn)' : 'Lưới ngày (X/P/V)';
        document.getElementById('tsPreview').innerHTML = `✓ Đọc sheet <b>“${det.sheetName}”</b> · ~${nData} NV · kiểu <b>${modeLbl}</b>.<br>${isOffice ? 'Đọc: Họ tên ✓ · Ngày có mặt ✓ · Vắng ✓ · Đi muộn per-day (ca sáng 8:00 / chiều 13:30) ✓' : `Cột nhận diện: ${det.nameCol >= 0 ? 'Họ tên ✓' : '<span style="color:#B45309">thiếu Họ tên</span>'}${det.codeCol >= 0 ? ' · Mã/STT ✓' : ''}${det.deptCol >= 0 ? ' · Bộ phận ✓' : ''}${det.presentCol >= 0 ? ' · Công thực tế ✓' : ''}`}`;
        document.getElementById('tsApply').disabled = false;
      } catch (err) {
        document.getElementById('tsPreview').innerHTML = '<span style="color:var(--danger)">❌ Lỗi đọc file: ' + err.message + '</span>';
      }
    });
  };

  /* Chuẩn hoá tên viết tắt: bỏ dấu, thường hoá, gộp khoảng trắng (máy chấm công thường không dấu) */
  const _normAlias = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  /* Khu vực từ bộ phận: 'kho' nếu Kho/Ship/Giao, còn lại 'vp' (văn phòng) */
  const _deptZone = d => /kho|ship|giao/i.test(String(d || '')) ? 'kho' : 'vp';
  function _cellStatus(v) {
    v = String(v || '').trim().toUpperCase();
    if (/^X$|^1$|^8$|^CO|^C$|^FULL/.test(v) || (!isNaN(parseFloat(v)) && parseFloat(v) >= 7)) return 'X';
    if (/^L$|MUON|LATE/.test(v)) return 'L';
    if (/^H$|^0\.5$|NUA|HALF/.test(v) || (!isNaN(parseFloat(v)) && parseFloat(v) >= 3.5 && parseFloat(v) < 7)) return 'H';
    if (/^P$|PHEP/.test(v)) return 'P';
    if (/^V$|^0$|^K$|VANG/.test(v)) return 'V';
    return null;
  }
  function _applyTsDays(sheets, staffId, dayStat, last) {
    const staff = (window.STORE.get('staff', window.STAFFS || []) || []).find(x => x.id === staffId);
    const fullWeek = staff ? _fullWeekStaff(staff) : false;
    let sh = sheets.find(t => t.staffId === staffId && t.month === month);
    if (!sh) { sh = { staffId, month, days: defaultDays() }; sheets.unshift(sh); }
    sh.days = sh.days.slice();
    if (fullWeek) {
      /* KHO/SHIP làm CẢ TUẦN → nhập file GHI ĐÈ nguyên tháng: nền = 'V' (vắng) rồi áp X/L/V/P từ máy.
         FIX: trước đây ngày CN ('_') bị bỏ qua + Kho hiển thị '_' = X → công PHỒNG (máy 27 → app 28).
         Nay không còn ngày mặc định X nào → công = ĐÚNG "có mặt thực tế" của máy chấm công. */
      sh.days = Array.from({ length: last }, () => 'V');
      Object.keys(dayStat).forEach(k => { const di = +k; if (di >= 0 && di < last) sh.days[di] = dayStat[k]; });
    } else {
      /* Văn phòng: giữ CN nghỉ ('_'), chỉ ghi ngày máy có dữ liệu. */
      Object.keys(dayStat).forEach(k => { const di = +k; if (di >= last || sh.days[di] === '_') return; sh.days[di] = dayStat[k]; });
    }
  }

  const _tsHnorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
  /* DÒ đúng SHEET + DÒNG TIÊU ĐỀ + KIỂU trong workbook máy chấm công.
     Máy xuất nhiều sheet: "Bảng tổng hợp chấm công" (aggregate — ƯU TIÊN, có cột "Có mặt Thực tế"),
     "Bảng thông tin xếp ca" (lịch ca), "Bản ghi chấm công"... Tiêu đề KHÔNG ở dòng 0 (trên có
     dòng title + "Ngày tháng"). Trả về {grid, sheetName, headerRow, mode:'summary'|'daygrid', cols}. */
  function _tsDetect(wb) {
    const XU = window.XLSX.utils;
    const names = wb.SheetNames.slice().sort((a, b) => {
      const rank = n => /tong hop cham cong/.test(_tsHnorm(n)) ? 0 : (/xep ca/.test(_tsHnorm(n)) ? 2 : 1);
      return rank(a) - rank(b);
    });
    for (const sn of names) {
      const grid = XU.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
      let hr = -1;
      for (let r = 0; r < Math.min(14, grid.length); r++) {
        const cells = (grid[r] || []).map(_tsHnorm);
        if (cells.some(c => /ho ten|ho va ten|ten nv|ten nhan vien|ten viet tat/.test(c))) { hr = r; break; }
      }
      if (hr < 0) continue;
      const H = (grid[hr] || []).map(_tsHnorm);
      let nameCol = -1, codeCol = -1, deptCol = -1, presentCol = -1, vangCol = -1, phepCol = -1;
      H.forEach((h, i) => {
        if (nameCol < 0 && /(ho ten|ho va ten|ten nv|ten nhan|ten viet tat|^ten$|fullname|name)/.test(h)) nameCol = i;
        if (codeCol < 0 && /(ma so|ma nv|ma nhan|^ma$|empid|code|^stt)/.test(h)) codeCol = i;
        if (deptCol < 0 && /(bo phan|phong ban|dept|khu vuc)/.test(h)) deptCol = i;
        if (presentCol < 0 && /(co mat|thuc te)/.test(h)) presentCol = i;
        if (vangCol < 0 && /(vang mat|^vang)/.test(h)) vangCol = i;
        if (phepCol < 0 && /(xin nghi|nghi phep|^phep)/.test(h)) phepCol = i;
      });
      const dayCols = {};
      H.forEach((h, i) => { const n = parseInt(String((grid[hr][i]) || '').replace(/[^0-9.]/g, ''), 10); if (n >= 1 && n <= 31) dayCols[n] = i; });
      const nDays = Object.keys(dayCols).length;
      const mode = presentCol >= 0 ? 'summary' : (nDays >= 20 ? 'daygrid' : null);
      if (!mode || (nameCol < 0 && codeCol < 0)) continue;
      return { grid, sheetName: sn, headerRow: hr, mode, nameCol, codeCol, deptCol, presentCol, vangCol, phepCol, dayCols };
    }
    /* KHÔNG có bảng phẳng → thử format VĂN PHÒNG (khối "Báo cáo chấm công" + "Tên:" + "Ngày có mặt") */
    for (const sn of names) {
      const grid = XU.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
      const flat = grid.slice(0, 60).map(r => (r || []).map(_tsHnorm).join(' ')).join(' | ');
      if (/bao cao cham cong/.test(flat) && /ten\s*:/.test(flat) && /ngay co mat/.test(flat)) {
        return { grid, sheetName: sn, headerRow: 0, mode: 'office', nameCol: -1, codeCol: -1, deptCol: -1, presentCol: -1, vangCol: -1, phepCol: -1, dayCols: {} };
      }
    }
    return null;
  }

  /* Đọc ĐI MUỘN per-day per-NV từ sheet "Bảng thống kê bất thường" (cột "Thời gian trễ giờ").
     Trả { normName: { dayN: lateMin } }. CHÍNH XÁC hơn tổng "Số lần/Phút" (tổng chia TB sẽ phạt nhầm). */
  function _tsBuildLateMap(wb) {
    try {
      const XU = window.XLSX.utils;
      const sn = wb.SheetNames.find(n => /bat thuong/.test(_tsHnorm(n)));
      if (!sn) return {};
      const grid = XU.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
      let hr = -1;
      for (let r = 0; r < Math.min(8, grid.length); r++) { if ((grid[r] || []).map(_tsHnorm).some(c => /ho ten/.test(c))) { hr = r; break; } }
      if (hr < 0) return {};
      const H = (grid[hr] || []).map(_tsHnorm);
      const nameCol = H.findIndex(h => /ho ten/.test(h));
      const dateCol = H.findIndex(h => /ngay thang|^ngay/.test(h));
      const lateCol = H.findIndex(h => /tre gio/.test(h));
      if (nameCol < 0 || dateCol < 0 || lateCol < 0) return {};
      const dayOf = v => { if (v instanceof Date) return v.getDate(); const m = String(v || '').match(/(\d{1,2})[-/.](\d{1,2})/); return m ? +m[1] : 0; };
      const map = {};
      for (let r = hr + 1; r < grid.length; r++) {
        const row = grid[r]; if (!row) continue;
        const nm = _normAlias(String(row[nameCol] || '')); if (!nm) continue;
        const late = Math.round(parseFloat(String(row[lateCol]).replace(/[^0-9.]/g, '')) || 0);
        if (late <= 0) continue;
        const dayN = dayOf(row[dateCol]);
        if (dayN >= 1 && dayN <= 31) { map[nm] = map[nm] || {}; map[nm][dayN] = Math.max(map[nm][dayN] || 0, late); }
      }
      return map;
    } catch (e) { console.warn('[ts lateMap]', e); return {}; }
  }

  /* Bỏ tiền tố xưng hô đầu tên máy (chị/anh/em/cô/chú/bác...) để khớp họ tên NV */
  const _TS_TITLES = /^(chi|anh|em|co|chu|bac|ong|ba|cau|mo|di|thim|c|a)\s+/;
  function _tsNameKey(k) { return String(k || '').replace(_TS_TITLES, '').trim(); }
  /* Khớp TÊN máy ↔ họ tên NV theo TỪ: MỌI từ (≥2 ký tự) của tên máy đều là 1 từ trong họ tên NV.
     VD: "the trung"↔"nguyen the trung" ✓ · "bich"↔"nguyen thi bich" ✓ · "tuoi"↔"vu thi hong tuoi" ✓ */
  function _tsNameMatch(machineKey, fullName) {
    const mw = String(machineKey || '').split(' ').filter(w => w.length > 1);
    const fw = String(fullName || '').split(' ').filter(w => w.length > 1);
    if (!mw.length || !fw.length) return false;
    /* mọi từ tên máy ∈ họ tên NV, VÀ từ CUỐI (tên gọi) khớp từ cuối NV → né nhầm HỌ↔TÊN
       (vd "đăng" KHÔNG khớp "Đặng Quang Vinh" vì tên gọi là "vinh" ≠ "dang"). */
    return mw.every(w => fw.includes(w)) && mw[mw.length - 1] === fw[fw.length - 1];
  }

  /* Tên máy VP thường có ĐUÔI phòng ban ("van hr", "hieu sale", "quynhtrangsale") → tách tên + gợi ý phòng */
  const _TS_DEPTMAP = { ktoan: 'ke toan', ketoan: 'ke toan', kt: 'ke toan', hr: 'nhan su', sale: 'sale', kinhdoanh: 'sale', mkt: 'marketing', marketing: 'marketing', cskh: 'cskh' };
  const _TS_DEPTSUF = ['ktoan', 'ketoan', 'kinhdoanh', 'marketing', 'sale', 'mkt', 'kt', 'hr', 'cskh'];
  function _tsStripDept(k) {
    for (const suf of _TS_DEPTSUF) {
      if (k === suf) continue;
      if (k.endsWith(' ' + suf)) return { name: k.slice(0, -(suf.length + 1)).trim(), deptHint: _TS_DEPTMAP[suf] };
      if (k.endsWith(suf) && k.length > suf.length + 1) return { name: k.slice(0, -suf.length).trim(), deptHint: _TS_DEPTMAP[suf] };
    }
    return { name: k, deptHint: '' };
  }
  /* Khớp 1 tên máy → NV app (alias → mã → tên chính xác → tên theo TỪ → đuôi phòng ban). Dùng chung MỌI format. */
  function _tsMatchStaff(rawName, code, wantZone, staffs, aliasIdx) {
    const key = _normAlias(rawName);
    const zoneOk = s => !wantZone || _deptZone(s.dept) === wantZone;
    let cand = (aliasIdx[key] || []).map(id => staffs.find(x => x.id === id)).filter(Boolean);
    if (wantZone && cand.length > 1) cand = cand.filter(zoneOk);
    if (cand.length === 1) return { chosen: cand[0].id, auto: cand[0].id, status: 'ok' };
    if (cand.length > 1) return { chosen: '', auto: '', status: 'amb' };
    const byCode = code && staffs.find(x => (x.code === code || x.id === code) && zoneOk(x));
    if (byCode) return { chosen: byCode.id, auto: byCode.id, status: 'ok' };
    const kw = _tsNameKey(key);
    let ms = staffs.filter(s => zoneOk(s) && _normAlias(s.name) === kw);
    if (!ms.length) ms = staffs.filter(s => zoneOk(s) && _tsNameMatch(kw, _normAlias(s.name)));
    if (ms.length === 1) return { chosen: ms[0].id, auto: ms[0].id, status: 'ok' };
    if (ms.length > 1) return { chosen: '', auto: '', status: 'amb' };
    /* FALLBACK: tách đuôi phòng ban → lọc theo phòng → khớp tên (kể cả tên viết dính "quynhtrangsale") */
    const off = _tsStripDept(key);
    if (off.name && (off.name !== key || off.deptHint)) {
      const pool = staffs.filter(s => zoneOk(s) && (!off.deptHint || _tsHnorm(s.dept).includes(off.deptHint) || (off.deptHint === 'sale' && /kinh doanh|cskh/.test(_tsHnorm(s.dept)))));
      let m2 = pool.filter(s => _normAlias(s.name) === off.name || _tsNameMatch(off.name, _normAlias(s.name)));
      if (!m2.length && off.name.replace(/\s/g, '').length >= 4) m2 = pool.filter(s => _normAlias(s.name).replace(/\s/g, '').includes(off.name.replace(/\s/g, '')));
      if (m2.length === 1) return { chosen: m2[0].id, auto: m2[0].id, status: 'ok' };
      if (m2.length > 1) return { chosen: '', auto: '', status: 'amb' };
    }
    return { chosen: '', auto: '', status: 'new' };
  }

  /* Parser format VĂN PHÒNG: mỗi NV 1 KHỐI (dòng "Tên:X" → dòng tổng hợp "Ngày có mặt/vắng" →
     giờ vào-ra từng ngày, dấu '*' = muộn). Ca sáng 8:00 / chiều 13:30. Trả [{name, days, work, lateMeta}]. */
  function _tsOfficeParse(grid, last) {
    const cell = (r, c) => (grid[r] && grid[r][c] != null) ? String(grid[r][c]).trim() : '';
    const statNum = (r, kn) => { for (const cv of (grid[r] || [])) { const m = _tsHnorm(cv).match(new RegExp(kn + '[^0-9]{0,4}(\\d+)')); if (m) return +m[1]; } return 0; };
    const lateMinOf = (t, shMin) => { const m = String(t).match(/(\d{1,2}):(\d{2})/); if (!m) return 0; const v = (+m[1]) * 60 + (+m[2]) - shMin; return v > 0 ? v : 0; };
    const recs = [];
    for (let r = 0; r < grid.length; r++) {
      let name = '';
      for (let c = 0; c < 8; c++) { const v = cell(r, c); if (/tên\s*:/i.test(v) && !/phòng ban/i.test(v)) { name = v.replace(/[\s\S]*tên\s*:\s*/i, '').trim(); break; } }
      if (!name) continue;
      const sr = r + 1;
      const present = statNum(sr, 'co mat'), absent = statNum(sr, 'vang mat'), phep = statNum(sr, 'nghi'), congtac = statNum(sr, 'cong tac');
      const days = {}, lateMeta = {}; let lateCnt = 0;
      for (let rr = r + 5; rr < r + 20 && rr < grid.length; rr++) {
        [[0, 2, 4], [8, 10, 12]].forEach(g => {
          const dv = cell(rr, g[0]); const dm = dv.match(/^(\d{1,2})/); if (!dm) return;
          const day = +dm[1]; if (day < 1 || day > last) return;
          let lm = 0;
          if (cell(rr, g[1]).includes('*')) lm = Math.max(lm, lateMinOf(cell(rr, g[1]), 8 * 60));
          if (cell(rr, g[2]).includes('*')) lm = Math.max(lm, lateMinOf(cell(rr, g[2]), 13 * 60 + 30));
          if (lm > 0) { days[day - 1] = 'L'; lateMeta[day] = lm; lateCnt++; }
        });
      }
      const used = new Set(Object.keys(days).map(Number));
      let di = 0; const put = (n, st) => { let cc = 0; while (cc < n && di < last) { if (!used.has(di)) { days[di] = st; used.add(di); cc++; } di++; } };
      put(Math.max(0, present - lateCnt), 'X'); put(absent, 'V'); put(phep + congtac, 'P');
      recs.push({ name, work: present, days, lateMeta: Object.keys(lateMeta).length ? lateMeta : null });
      r = sr;
    }
    return recs;
  }

  /* Upload → PARSE + phân loại → mở bảng ĐỐI SOÁT (chưa ghi gì). Giống up đơn có SP ngoài danh mục. */
  window.applyUploadedTimesheet = function () {
    const det = window._tsDet;
    if (!det) { window.toast('Chưa đọc được file chấm công', 'warn'); return; }
    const zone = (document.getElementById('tsZone') || {}).value || '';
    const { grid, headerRow, mode, nameCol, codeCol, deptCol, presentCol, vangCol, phepCol, dayCols } = det;

    const staffs = window.STORE.get('staff', window.STAFFS || []);
    const aliasMap = window.STORE.get('staffAliases', {}) || {};
    const aliasIdx = {};   /* normAlias → [staffId] (có thể trùng: "quang"→[NV001,NV063]) */
    Object.entries(aliasMap).forEach(([sid, al]) => { const k = _normAlias(al); if (!k) return; (aliasIdx[k] = aliasIdx[k] || []).push(sid); });
    const [y, mm] = month.split('-').map(Number); const last = new Date(y, mm, 0).getDate();
    const _num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.]/g, '')); return isNaN(n) ? 0 : n; };

    const rows = [];
    if (mode === 'office') {
      /* VĂN PHÒNG (format khối). zone lấy theo dropdown (mặc định 'vp'). */
      _tsOfficeParse(grid, last).forEach(rec => {
        const mr = _tsMatchStaff(rec.name, '', zone || 'vp', staffs, aliasIdx);
        rows.push({ name: rec.name, code: '', days: rec.days, work: rec.work, lateMeta: rec.lateMeta, chosen: mr.chosen, auto: mr.auto, status: mr.status });
      });
    } else {
      for (let r = headerRow + 1; r < grid.length; r++) {
        const row = grid[r]; if (!row || !row.length) continue;
        const rawName = nameCol >= 0 ? String(row[nameCol] || '').trim() : '';
        const code = codeCol >= 0 ? String(row[codeCol] || '').trim() : '';
        if (!rawName) continue;   /* bỏ dòng tiêu đề phụ / rỗng — không có tên */
        let days = {}, work = 0, lateMeta = null;
        if (mode === 'summary') {
          const pv = String(row[presentCol] || '').trim();
          const m = pv.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
          work = m ? parseFloat(m[2]) : _num(pv);
          const nP = phepCol >= 0 ? Math.round(_num(row[phepCol])) : 0;
          const nV = vangCol >= 0 ? Math.round(_num(row[vangCol])) : 0;
          const used = new Set(); let lateCnt = 0;
          const lm = (det.lateMap && det.lateMap[_normAlias(rawName)]) || null;
          if (lm) { lateMeta = {}; Object.keys(lm).forEach(dN => { const idx = +dN - 1; if (idx >= 0 && idx < last) { days[idx] = 'L'; lateMeta[+dN] = lm[dN]; used.add(idx); lateCnt++; } }); }
          let di = 0; const put = (n, st) => { let c = 0; while (c < n && di < last) { if (!used.has(di)) { days[di] = st; used.add(di); c++; } di++; } };
          put(Math.max(0, Math.round(work) - lateCnt), 'X'); put(nV, 'V'); put(nP, 'P');
        } else {
          Object.keys(dayCols).forEach(d => { const st = _cellStatus(row[dayCols[d]]); if (st) days[parseInt(d, 10) - 1] = st; });
          work = Object.values(days).reduce((a, st) => a + (st === 'X' ? 1 : st === 'H' ? 0.5 : 0), 0);
        }
        const wantZone = zone || (deptCol >= 0 ? _deptZone(row[deptCol]) : '');
        const mr = _tsMatchStaff(rawName, code, wantZone, staffs, aliasIdx);
        rows.push({ name: rawName || code, code, days, work, lateMeta, chosen: mr.chosen, auto: mr.auto, status: mr.status });
      }
    }
    if (!rows.length) { window.toast('Không đọc được dòng NV nào trong file', 'warn'); return; }
    window._tsParsed = { rows, last };
    openTimesheetPreview();
  };

  /* === BẢNG ĐỐI SOÁT: từng dòng máy ↔ NV app; sửa được; NV chưa có → cảnh báo đỏ; xác nhận mới ghi === */
  function _tsStaffOptions(sel) {
    const staffs = window.STORE.get('staff', window.STAFFS || []).slice()
      .sort((a, b) => String(a.dept || '').localeCompare(String(b.dept || '')) || String(a.name).localeCompare(String(b.name)));
    return `<option value="">— Chưa khớp / bỏ qua —</option>` + staffs.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${s.name} — ${s.dept || ''}</option>`).join('');
  }
  function _tsStatusPill(row) {
    if (row.chosen) return '<span class="tag" style="background:#DCFCE7;color:#15803D">✓ Khớp</span>';
    if (row.status === 'amb') return '<span class="tag" style="background:#FEF3C7;color:#B45309">⚠ Trùng — chọn người</span>';
    return '<span class="tag" style="background:#FEE2E2;color:#B91C1C">🔴 Chưa có trong app</span>';
  }
  function openTimesheetPreview() {
    const P = window._tsParsed; if (!P) return;
    const staffs = window.STORE.get('staff', window.STAFFS || []);
    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const body = `
      <div id="tsBanner"></div>
      <div style="font-size:12px;color:var(--muted);margin:2px 0 8px">Kiểm tra máy chấm công đã khớp đúng người chưa. Sai thì đổi ở cột <b>Khớp NV</b>. Bấm <b>Xác nhận</b> mới ghi vào chấm công tháng <b>${month}</b>.</div>
      <div style="max-height:56vh;overflow:auto;border:1px solid var(--line);border-radius:8px">
        <table class="mini-table" style="margin:0;width:100%;font-size:12.5px">
          <thead><tr><th>Tên trong máy</th><th class="num">Công</th><th style="width:34%">Khớp NV trong app</th><th>Bộ phận</th><th>Trạng thái</th></tr></thead>
          <tbody>${P.rows.map((r, i) => `<tr>
            <td><b>${esc(r.name)}</b></td>
            <td class="num">${r.work % 1 ? r.work.toFixed(1) : r.work}</td>
            <td><select id="tsp${i}" onchange="window._tsPick(${i},this.value)" style="width:100%;padding:5px;border:1px solid ${r.chosen ? 'var(--line)' : '#FCA5A5'};border-radius:6px;font-size:12px">${_tsStaffOptions(r.chosen)}</select></td>
            <td id="tspd${i}" style="font-size:12px;color:var(--muted)">${esc((staffs.find(s => s.id === r.chosen) || {}).dept || '—')}</td>
            <td id="tsps${i}">${_tsStatusPill(r)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
    window.openModal('🧾 Đối soát chấm công trước khi cập nhật', body, {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window.confirmTimesheet()">✅ Xác nhận & cập nhật</button>`,
      width: '780px',
    });
    _tsRefreshBanner();
  }
  window._tsPick = function (i, val) {
    const P = window._tsParsed; if (!P || !P.rows[i]) return;
    P.rows[i].chosen = val;
    const staffs = window.STORE.get('staff', window.STAFFS || []);
    const dEl = document.getElementById('tspd' + i); if (dEl) dEl.textContent = (staffs.find(s => s.id === val) || {}).dept || '—';
    const sEl = document.getElementById('tsps' + i); if (sEl) sEl.innerHTML = _tsStatusPill(P.rows[i]);
    const selEl = document.getElementById('tsp' + i); if (selEl) selEl.style.borderColor = val ? 'var(--line)' : '#FCA5A5';
    _tsRefreshBanner();
  };
  function _tsRefreshBanner() {
    const P = window._tsParsed; const el = document.getElementById('tsBanner'); if (!P || !el) return;
    const newCnt = P.rows.filter(r => !r.chosen && r.status === 'new').length;
    const ambCnt = P.rows.filter(r => !r.chosen && r.status === 'amb').length;
    const okCnt = P.rows.filter(r => r.chosen).length;
    let h = `<div style="font-size:12.5px;margin-bottom:6px">Sẽ cập nhật <b style="color:var(--ok)">${okCnt}</b> NV.</div>`;
    if (newCnt) h += `<div style="background:#FEE2E2;border:1px solid #FCA5A5;color:#991B1B;border-radius:8px;padding:8px 11px;font-size:12.5px;margin-bottom:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">🔴 <b>${newCnt}</b> người trong máy chấm công CHƯA có trong app — thêm vào Nhân sự (hoặc chọn đúng người nếu họ đã có tên khác). <button class="btn btn-sm" style="background:#B91C1C;color:#fff" onclick="window._tsAddStaff()">➕ Thêm nhân viên</button></div>`;
    if (ambCnt) h += `<div style="background:#FEF3C7;border:1px solid #FDE68A;color:#92400E;border-radius:8px;padding:8px 11px;font-size:12.5px;margin-bottom:6px">⚠ <b>${ambCnt}</b> dòng trùng tên viết tắt — chọn đúng người ở cột "Khớp NV".</div>`;
    el.innerHTML = h;
  }
  window._tsAddStaff = function () {
    if (window.formNv && window.footNv) window.openModal('+ Thêm nhân viên', window.formNv(), { footer: window.footNv(), width: '560px' });
    else window.toast('Vào trang Nhân sự để thêm NV, rồi up lại file', 'info');
  };
  window.confirmTimesheet = function () {
    const P = window._tsParsed; if (!P) { window.closeModal(); return; }
    /* Import ghi đè công CỦA CẢ THÁNG → chưa nạp xong là ghi đè bằng cache cũ */
    const S = window.STORE;
    if (S.kvReady && (!S.kvReady('timesheet') || !S.kvReady('timesheetMeta') || !S.kvReady('staffAliases'))) {
      window.toast('⏳ Đang tải chấm công từ máy chủ — bấm Xác nhận lại sau 1–2 giây', 'warn');
      return;
    }
    const existing = S.get('staffAliases', {}) || {};
    const rows = P.rows.filter(r => r.chosen);
    let lateN = 0;
    rows.forEach(r => { if (r.lateMeta) lateN += Object.keys(r.lateMeta).length; });
    const applied = rows.length;
    const mth = month, last = P.last;

    /* Áp TỪNG NV lên bản cloud mới nhất — không ghi đè công của NV/tháng không nằm trong file */
    const rmw = (key, mut, fb) => (S.rmwKv ? S.rmwKv(key, mut, fb) : S.set(key, mut(S.get(key, fb))));
    rmw('staffAliases', m => {
      m = (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
      rows.forEach(r => { if (r.name && (r.chosen !== r.auto || !existing[r.chosen])) m[r.chosen] = r.name.trim(); });
      return m;
    }, {});
    rmw('timesheet', arr => {
      arr = Array.isArray(arr) ? arr : [];
      rows.forEach(r => _applyTsDays(arr, r.chosen, r.days, last));
      return arr;
    }, []);
    rmw('timesheetMeta', m => {
      m = (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
      rows.forEach(r => {
        if (!r.lateMeta || !Object.keys(r.lateMeta).length) return;
        const mk = r.chosen + '_' + mth;
        const mm = m[mk] = m[mk] || {};
        Object.keys(r.lateMeta).forEach(dN => { mm[dN] = Object.assign({}, mm[dN], { lateMin: r.lateMeta[dN] }); });
      });
      return m;
    }, {});
    const skipped = P.rows.length - applied;
    window._tsParsed = null;
    window.closeModal();
    window.toast(`✓ Đã cập nhật chấm công ${applied} NV${lateN ? ' · ' + lateN + ' lượt đi muộn' : ''}${skipped ? ' · bỏ ' + skipped + ' dòng chưa khớp' : ''}`, 'success');
    render();
  };

  /* ====== BẢNG XÁC THỰC CHẤM CÔNG — HR gửi NV qua Zalo (copy ảnh) để xác nhận cuối tháng ====== */
  window.openAttendanceVerify = function () {
    const [y, mm] = month.split('-').map(Number);
    const last = new Date(y, mm, 0).getDate();
    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const metaAll = window.STORE.get('timesheetMeta', {}) || {};
    const staffs = (window.STORE.get('staff', window.STAFFS || []) || []).filter(s => s.status !== 'inactive' && s.status !== 'off' && s.status !== 'nghỉ');
    const byDept = {};
    staffs.forEach(s => { const d = s.dept || 'Khác'; (byDept[d] = byDept[d] || []).push(s); });
    let stt = 0;
    const sections = Object.keys(byDept).sort().map(dept => {
      const rowsHtml = byDept[dept].map(s => {
        const sh = sheetOf(s.id); const days = sh ? sh.days : [];
        const meta = metaAll[s.id + '_' + month] || {};
        const c = counts(days, meta);
        const cong = c.X + c.L + c.H;
        const nghi = [], muon = [], phep = [];
        (days || []).forEach((d, i) => { if (d === 'V') nghi.push(i + 1); else if (d === 'L') muon.push(i + 1); else if (d === 'P') phep.push(i + 1); });
        stt++;
        const note = [];
        if (nghi.length) note.push('nghỉ ' + nghi.join(','));
        if (phep.length) note.push('phép ' + phep.join(','));
        if (muon.length) note.push('muộn ' + muon.join(',') + (c.lateMin ? ' (' + c.lateMin + 'p)' : ''));
        return `<tr><td class="c">${stt}</td><td class="nm">${esc(s.name)}</td><td>${esc(s.role || '')}</td><td class="c"><b>${cong}</b></td><td class="c">${last}</td><td class="note">${esc(note.join(' · '))}</td></tr>`;
      }).join('');
      return `<tr class="grp"><td colspan="6">${esc(dept)} (${byDept[dept].length})</td></tr>` + rowsHtml;
    }).join('');
    const css = `*{box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif}body{margin:0;padding:16px;background:#fff;color:#1a1a1a}
      .rt-h{text-align:center;margin-bottom:12px}.rt-h .co{font-size:15px;font-weight:800;color:#1B5E20}.rt-h .ti{font-size:18px;font-weight:800;margin-top:3px;color:#111}.rt-h .mo{font-size:12px;color:#555;margin-top:3px}
      table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{border:1px solid #B6C9B0;padding:5px 8px}th{background:#1B5E20;color:#fff;font-weight:700;font-size:11px;text-transform:uppercase}td.c{text-align:center}td.nm{font-weight:700}td.note{font-style:italic;color:#B45309;font-size:11.5px}tr.grp td{background:#FEF3C7;font-weight:800;color:#1B5E20;text-transform:uppercase;font-size:12px}tbody tr:nth-child(even):not(.grp){background:#F7FBF5}`;
    const body = `<div class="rt-h"><div class="co">NÔNG SẢN TUẤN TÚ HÀ NỘI</div><div class="ti">BẢNG CHẤM CÔNG THÁNG ${mm}/${y}</div><div class="mo">${last} ngày · Nhân viên vui lòng kiểm tra & xác nhận công / ngày nghỉ / đi muộn của mình</div></div>
      <table><thead><tr><th style="width:34px">STT</th><th>Họ tên</th><th>Vị trí</th><th style="width:52px">Công</th><th style="width:52px">Chuẩn</th><th>Ghi chú (nghỉ / muộn / phép)</th></tr></thead><tbody>${sections}</tbody></table>`;
    window._attReportHtml = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
    window.openModal('📋 Bảng xác thực chấm công — Tháng ' + mm + '/' + y, `
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px">Gửi lên nhóm Zalo để NV tự kiểm tra. Bấm <b>"📋 Copy ảnh"</b> rồi dán (Ctrl/Cmd + V) vào Zalo.</div>
      <iframe id="attPrev" style="width:100%;height:56vh;border:1px solid var(--line);border-radius:8px;background:#fff"></iframe>
    `, { width: '860px', footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button><button class="btn btn-primary" onclick="window._copyAttendanceImg()">📋 Copy ảnh gửi Zalo</button>` });
    setTimeout(() => { const f = document.getElementById('attPrev'); if (f) f.srcdoc = window._attReportHtml; }, 30);
  };
  window._copyAttendanceImg = function () {
    if (!window.copyReceiptImageDirect) { window.toast?.('Chưa nạp trình copy ảnh — thử lại sau 1 giây', 'warn'); return; }
    const r = window.copyReceiptImageDirect(window._attReportHtml, 'bang-cham-cong-' + month);
    if (r && r.unsupported) window.toast?.('Trình duyệt không hỗ trợ copy ảnh — dùng máy tính/Chrome', 'warn');
  };

  /* === Quản lý TÊN VIẾT TẮT máy chấm công (xem/sửa/gán cho NV mới) === */
  window.openAliasManager = function () {
    const staffs = window.STORE.get('staff', window.STAFFS || []).slice();
    const aliasMap = window.STORE.get('staffAliases', {}) || {};
    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const byDept = {};
    staffs.forEach(s => { const d = s.dept || 'Khác'; (byDept[d] = byDept[d] || []).push(s); });
    const filled = Object.values(aliasMap).filter(Boolean).length;
    const rows = Object.keys(byDept).sort().map(d => byDept[d].map(s => `<tr class="alias-row" data-k="${esc((s.name + ' ' + (s.dept || '')).toLowerCase())}">
        <td><b>${esc(s.name)}</b></td>
        <td><span class="staff-pill">${esc(s.dept || '')}</span></td>
        <td><input class="alias-inp" data-id="${s.id}" value="${esc(aliasMap[s.id] || '')}" placeholder="(chưa vân tay)" style="width:100%;padding:5px 7px;border:1px solid var(--line);border-radius:6px;font-size:12.5px"></td>
      </tr>`).join('')).join('');
    window.openModal('🔤 Tên viết tắt máy chấm công', `
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:8px">Điền <b>tên viết tắt</b> = đúng tên hiển thị trong máy chấm công (đang có <b>${filled}</b> NV). Để trống = chưa lấy vân tay. NV mới điền vào đây → kỳ sau tự khớp.</div>
      <input id="aliasSearch" placeholder="🔍 Tìm nhân viên…" oninput="window._aliasFilter(this.value)" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;margin-bottom:10px">
      <div style="max-height:56vh;overflow:auto;border:1px solid var(--line);border-radius:8px">
        <table class="mini-table" style="margin:0;width:100%;font-size:12.5px">
          <thead><tr><th>Nhân viên</th><th style="width:26%">Bộ phận</th><th style="width:30%">Tên viết tắt</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`, {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window.saveAliasManager()">💾 Lưu</button>`,
      width: '680px',
    });
  };
  window._aliasFilter = function (q) {
    q = String(q || '').toLowerCase().trim();
    document.querySelectorAll('.alias-row').forEach(tr => { tr.style.display = (!q || (tr.dataset.k || '').includes(q)) ? '' : 'none'; });
  };
  window.saveAliasManager = function () {
    const map = {};
    document.querySelectorAll('.alias-inp').forEach(inp => { const v = inp.value.trim(); if (v) map[inp.dataset.id] = v; });
    window.STORE.set('staffAliases', map);
    window.closeModal();
    window.toast('✓ Đã lưu tên viết tắt (' + Object.keys(map).length + ' NV)', 'success');
  };

  /* === init === (chỉ chạy nếu có #payView — trang Nhân sự gộp hoặc payroll.html) */
  if (document.getElementById('payView')) {
    window.STORE.subscribe('timesheet', render);
    window.STORE.subscribe('payrollExtra', () => { if (tab === 'payroll') renderPayroll(); });
    window.STORE.subscribe('bonusLog', () => { if (tab === 'bonus' || tab === 'payroll') render(); });
    window.STORE.subscribe('bonusRules', () => { if (tab === 'bonus' || tab === 'payroll' || tab === 'duty') render(); });
    window.STORE.subscribe('khoDuty', () => { if (tab === 'duty' || tab === 'bonus' || tab === 'payroll') render(); });
    /* Trang Nhân sự gộp (HR_MERGED) → staff.js đã dựng shell, KHÔNG gọi lại renderAppShell */
    if (!window.HR_MERGED) window.renderAppShell('payroll', 'Chấm công & Lương');
    render();
    window.applyPayrollHeaderPerms?.();
  }
})();
