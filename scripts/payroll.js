/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Chấm công & Bảng lương
   Tab Chấm công: NV × ngày, click cell cycle X→P→V→X
   Tab Bảng lương: lương cơ bản, công, thưởng/khấu trừ, thực lĩnh
   Upload Excel: SheetJS parse file từ máy chấm công → auto-fill
   ========================================================= */
(function () {
  let month = '2026-05';
  let tab = 'attend';

  /* === Perm helpers === */
  function canViewAll() { return !!(window.AUTH && window.AUTH.hasPerm('payroll.viewAll')); }
  function canEdit()    { return !!(window.AUTH && window.AUTH.hasPerm('payroll.edit')); }
  function canUpload()  { return !!(window.AUTH && window.AUTH.hasPerm('payroll.upload')); }
  function meStaffId()  { const u = window.AUTH && window.AUTH.currentUser(); return u ? u.staffId : null; }

  /* =========================================================
     LỊCH LÀM VIỆC theo PHÒNG BAN:

     [Ban GĐ / Sales / CSKH / Kế toán]
     - T2-T6 full · Sáng 08:00-12:00 · Chiều 13:30-17:30 = 8h
     - T7 sáng    · 08:00-12:00 = 4h (0.5 công)

     [Vận hành — Shipper]
     - T2-T6 full · Sáng 05:00-11:00 · Chiều 13:00-18:00 = 11h
     - T7 sáng    · 05:00-11:00 = 6h (0.5 công)
     CN: cả hai dept đều nghỉ.
     ========================================================= */
  const SHIFT_DEFAULT = {
    morn: ['08:00','12:00'],
    aft:  ['13:30','17:30'],
    label: 'Văn phòng',
  };
  const SHIFT_SHIPPER = {
    morn: ['05:00','11:00'],
    aft:  ['13:00','18:00'],
    label: 'Shipper / Vận hành',
  };
  function shiftHoursFor(staff) {
    if (staff && (staff.dept === 'Vận hành' || /shipper|tài xế|tai xe/i.test(staff.role || ''))) {
      return SHIFT_SHIPPER;
    }
    return SHIFT_DEFAULT;
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
  function setMetaCell(sid, dayIdx, data) {
    const all = window.STORE.get('timesheetMeta', {});
    const key = sid + '_' + month;
    if (!all[key]) all[key] = {};
    if (data === null) delete all[key][dayIdx];
    else all[key][dayIdx] = Object.assign({}, all[key][dayIdx], data);
    window.STORE.set('timesheetMeta', all);
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
    if (tab === 'attend') renderAttend(); else renderPayroll();
  }
  window.setPayTab = t => { tab = t; render(); };
  window.setPayMonth = m => { month = m; render(); };

  function renderAttend() {
    const staffs = STAFF();
    const [y, m] = month.split('-').map(Number); const last = new Date(y, m, 0).getDate();
    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const today = new Date(2026, 4, 18);

    /* === HEADER === T2-T6 thường · T7 vàng (chỉ sáng) · CN đỏ (nghỉ) · today xanh dương */
    const dayHead = Array.from({ length: last }, (_, i) => {
      const d = i + 1;
      const dow = new Date(y, m - 1, d).getDay();
      const isSun = dow === 0;
      const isSat = dow === 6;
      const isToday = y === today.getFullYear() && m - 1 === today.getMonth() && d === today.getDate();
      const headBg = isToday ? '#E0F2FE' : isSun ? '#FEE2E2' : isSat ? '#FEF3C7' : '#FAFAFB';
      const headCol = isToday ? '#0369A1' : isSun ? 'var(--danger)' : isSat ? '#A16207' : 'var(--navy)';
      return `<th class="att-dh" style="background:${headBg};color:${headCol}" title="${isSun ? 'Chủ nhật — nghỉ' : isSat ? 'Thứ 7 — chỉ ca sáng 08:00-12:00 (0.5 công)' : 'T' + (dow + 1) + ' — full ngày'}">
        <div class="dh-d">${d}</div>
        <div class="dh-w">${dayNames[dow]}${isSat ? '<sup style="font-size:8px">½</sup>' : ''}</div>
      </th>`;
    }).join('');

    /* === ROWS === */
    const rows = staffs.map((s) => {
      const sh = sheetOf(s.id); const days = sh ? sh.days : defaultDays();
      const meta = metaOf(s.id);
      const c = counts(days, meta);
      const paid = paidDays(days);
      const cells = days.map((v, i) => {
        const dayN = i + 1;
        const sf = shiftFactorOfDay(dayN);
        const isOff = v === '_';
        const isSat = sf === 0.5;
        const cellClass = isOff ? 'att-cell off' :
          v === 'X' ? 'att-cell s-x' :
          v === 'L' ? 'att-cell s-l' :
          v === 'H' ? 'att-cell s-h' :
          v === 'P' ? 'att-cell s-p' :
          v === 'V' ? 'att-cell s-v' : 'att-cell';
        const lateMin = (meta[dayN] && meta[dayN].lateMin) || 0;
        const chip = isOff ? '<span class="chip-off">—</span>' :
          v === 'X' ? '<span class="chip s-x">X</span>' :
          v === 'L' ? `<span class="chip s-l" title="Muộn ${lateMin}p">L</span>${lateMin>15?'<sup class="late-min">'+lateMin+'</sup>':''}` :
          v === 'H' ? '<span class="chip s-h">½</span>' :
          v === 'P' ? '<span class="chip s-p">P</span>' :
          v === 'V' ? '<span class="chip s-v">V</span>' : '';
        const tip = isOff ? 'Chủ nhật — nghỉ' : isSat ? `T7 — chỉ ca sáng 08:00-12:00 (0.5 công). Click để chọn trạng thái.` : 'Click để chọn trạng thái';
        const satMark = isSat && !isOff ? '<span class="sat-mark" title="½ công">½</span>' : '';
        return `<td class="${cellClass}${isSat?' is-sat':''}" data-sid="${s.id}" data-day="${dayN}" title="${tip}">${chip}${satMark}</td>`;
      }).join('');
      return `<tr class="att-row">
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
        <td class="att-stat s-x" title="Có mặt full"><b>${c.X}</b></td>
        <td class="att-stat s-l" title="Đi muộn"><b>${c.L}</b>${c.lateMin?'<div class="sub">'+c.lateMin+'p</div>':''}</td>
        <td class="att-stat s-h" title="½ phép"><b>${c.H}</b></td>
        <td class="att-stat s-p" title="Phép cả ngày"><b>${c.P}</b></td>
        <td class="att-stat s-v" title="Vắng"><b>${c.V}</b></td>
        <td class="att-stat sum" title="Công tính lương (H=0.5)"><b>${paid % 1 === 0 ? paid : paid.toFixed(1)}</b></td>
      </tr>`;
    }).join('');

    /* === Tổng kết toàn công ty === */
    const totals = staffs.reduce((acc, s) => {
      const sh = sheetOf(s.id); const md = metaOf(s.id);
      const c = counts(sh ? sh.days : defaultDays(), md);
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
        .att-legend .chip{margin:0 2px}
        .chip{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;line-height:1;text-align:center;border-radius:6px;font-weight:800;font-size:12.5px;vertical-align:middle}
        .chip.s-x{background:#16A34A;color:#fff}
        .chip.s-l{background:#EA580C;color:#fff}
        .chip.s-h{background:linear-gradient(90deg,#F59E0B 50%,#16A34A 50%);color:#fff;font-size:13px}
        .chip.s-p{background:#F59E0B;color:#fff}
        .chip.s-v{background:#EF4444;color:#fff}
        .chip-off{color:var(--muted-2);font-weight:600;font-size:13px}
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
        .att-pop .opt .chip{margin-bottom:4px}
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
          <span>🏢 <b>Văn phòng (GĐ/Sales/CSKH/Kế toán):</b> T2-T6 <b>${SHIFT_DEFAULT.morn[0]}-${SHIFT_DEFAULT.morn[1]}</b> + <b>${SHIFT_DEFAULT.aft[0]}-${SHIFT_DEFAULT.aft[1]}</b></span>
          <span>🛵 <b>Shipper (Vận hành):</b> T2-T6 <b>${SHIFT_SHIPPER.morn[0]}-${SHIFT_SHIPPER.morn[1]}</b> + <b>${SHIFT_SHIPPER.aft[0]}-${SHIFT_SHIPPER.aft[1]}</b></span>
          <span>T7 chỉ ca sáng = 0.5 công · CN nghỉ</span>
        </div>
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <span>📌 <b>Click ô</b> để chọn:</span>
          <span><span class="chip s-x">X</span> Có mặt</span>
          <span><span class="chip s-l">L</span> Đi muộn (≤${LATE_GRACE_MIN}p miễn phạt)</span>
          <span><span class="chip s-h">½</span> Nửa ca phép</span>
          <span><span class="chip s-p">P</span> Cả ca phép</span>
          <span><span class="chip s-v">V</span> Vắng</span>
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
              <th class="att-stat s-x" title="Có mặt full">X</th>
              <th class="att-stat s-l" title="Muộn">L</th>
              <th class="att-stat s-h" title="½ phép">½</th>
              <th class="att-stat s-p" title="Phép cả">P</th>
              <th class="att-stat s-v" title="Vắng">V</th>
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
    const sh = sheetOf(sid); const days = sh ? sh.days.slice() : defaultDays();
    const cur = days[day - 1]; if (cur === '_') return;
    const md = metaOf(sid); const curLate = (md[day] && md[day].lateMin) || 0;
    const sf = shiftFactorOfDay(day);
    const isSat = sf === 0.5;
    /* Get staff to use correct shift hours */
    const staff = STAFF().find(s => s.id === sid);
    const SH = shiftHoursFor(staff);
    const isShipper = SH === SHIFT_SHIPPER;
    const shiftInfo = isSat
      ? `${isShipper ? '🛵 Shipper' : '🏢 Văn phòng'} · T7 — chỉ ca sáng <b>${SH.morn[0]}-${SH.morn[1]}</b> · 1 công = <b>0.5</b>`
      : `${isShipper ? '🛵 Shipper' : '🏢 Văn phòng'} · T${new Date(+month.slice(0,4), +month.slice(5,7)-1, day).getDay()+1} — sáng <b>${SH.morn[0]}-${SH.morn[1]}</b>, chiều <b>${SH.aft[0]}-${SH.aft[1]}</b> · 1 công = 1.0`;

    /* Remove existing popover */
    document.querySelectorAll('.att-pop').forEach(p => p.remove());

    const pop = document.createElement('div');
    pop.className = 'att-pop';
    pop.innerHTML = `
      <div class="ph">Ngày ${day} · ${td.closest('tr').querySelector('.nm').textContent}</div>
      <div style="font-size:11px;color:var(--muted);padding:6px 10px;background:${isSat?'#FEF3C7':'#F0FDF4'};border-radius:6px;margin-bottom:8px;line-height:1.5">${shiftInfo}</div>
      <div class="opts" id="popOpts">
        ${['X','L','H','P','V'].map(s => `<div class="opt ${cur===s?'on':''}" data-s="${s}">
          <div class="chip s-${s.toLowerCase()}">${s==='H'?'½':s}</div>
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
      const sheets = SHEETS().slice();
      let sheet = sheets.find(t => t.staffId === sid && t.month === month);
      if (!sheet) { sheet = { staffId: sid, month, days: defaultDays() }; sheets.unshift(sheet); }
      sheet.days = sheet.days.slice(); sheet.days[day - 1] = picked;
      window.STORE.set('timesheet', sheets);
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
    const sheets = SHEETS().slice();
    let sh = sheets.find(t => t.staffId === sid && t.month === month);
    if (!sh) { sh = { staffId: sid, month, days: defaultDays() }; sheets.unshift(sh); }
    const cur = sh.days[day - 1]; if (cur === '_') return;
    sh.days = sh.days.slice();
    sh.days[day - 1] = cur === 'X' ? 'P' : cur === 'P' ? 'V' : 'X';
    window.STORE.set('timesheet', sheets);
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

  function renderPayroll() {
    const staffs = STAFF(); const wd = workdaysInMonth();
    const extra = window.STORE.get('payrollExtra', {});
    let totalAll = 0; let totalLateDed = 0; let totalBonus = 0;
    const rows = staffs.map(s => {
      const sh = sheetOf(s.id); const md = metaOf(s.id);
      const days = sh ? sh.days : defaultDays();
      const c = counts(days, md);
      const paid = paidDays(days);
      const luongNgay = wd ? Math.round((s.salary || 0) / wd) : 0;
      const luongCo = Math.round(luongNgay * paid);
      /* Khấu trừ đi muộn — chỉ phần > grace */
      let lateDed = 0;
      Object.values(md).forEach(meta => {
        if (meta && meta.lateMin > LATE_GRACE_MIN) lateDed += (meta.lateMin - LATE_GRACE_MIN) * LATE_DEDUCT_PER_MIN;
      });
      totalLateDed += lateDed;
      /* Hoa hồng / thưởng theo salaryConfig */
      const auto = computeBonusFromConfig(s);
      totalBonus += auto.amount;
      const e = extra[s.id] || { bonus: 0, deduction: 0 };
      const total = luongCo + auto.amount + (e.bonus || 0) - (e.deduction || 0) - lateDed;
      totalAll += total;
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:8px">
          <div style="width:28px;height:28px;border-radius:50%;background:${window.avatarColor(s.name)};color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700">${window.initials(s.name)}</div>
          <div><b>${s.name}</b><div style="color:var(--muted);font-size:11px">${s.role}</div></div>
        </div></td>
        <td class="num">${window.fmtShort(s.salary || 0)}</td>
        <td class="num">${wd % 1 === 0 ? wd : wd.toFixed(1)}</td>
        <td class="num" style="color:#15803D">${c.X}</td>
        <td class="num" style="color:#C2410C">${c.L}${c.lateMin?'<div style="font-size:10px">⏰'+c.lateMin+'p</div>':''}</td>
        <td class="num" style="color:#A16207">${c.H}</td>
        <td class="num" style="color:#A16207">${c.P}</td>
        <td class="num" style="color:#B91C1C">${c.V}</td>
        <td class="num"><b style="color:#0369A1">${paid % 1 === 0 ? paid : paid.toFixed(1)}</b></td>
        <td class="num">${window.fmt(luongNgay)}</td>
        <td class="num">${window.fmt(luongCo)}</td>
        <td class="num" style="color:${lateDed?'var(--danger)':'var(--muted)'}">${lateDed?'-'+window.fmt(lateDed):'—'}</td>
        <td class="num">
          ${auto.amount ? `<b style="color:var(--ok)">+${window.fmt(auto.amount)}</b><div style="font-size:10px;color:var(--muted);font-weight:400;line-height:1.3;max-width:160px">${auto.label}</div>` : `<span style="color:var(--muted);font-size:11px">${auto.label}</span>`}
        </td>
        <td class="num"><input type="number" data-sid="${s.id}" data-field="bonus" value="${e.bonus || 0}" class="pay-extra" ${canEdit()?'':'disabled'} style="width:85px;text-align:right;padding:4px 6px;border:1px solid var(--line);border-radius:5px;${canEdit()?'':'background:#FAFAFB;color:var(--muted)'}"></td>
        <td class="num"><input type="number" data-sid="${s.id}" data-field="deduction" value="${e.deduction || 0}" class="pay-extra" ${canEdit()?'':'disabled'} style="width:85px;text-align:right;padding:4px 6px;border:1px solid var(--line);border-radius:5px;${canEdit()?'':'background:#FAFAFB;color:var(--muted)'}"></td>
        <td class="num"><b style="color:var(--red);font-size:14px">${window.fmt(total)}</b></td>
      </tr>`;
    }).join('');

    const totalPaid = staffs.reduce((s, x) => {
      const sh = sheetOf(x.id); return s + paidDays(sh ? sh.days : defaultDays());
    }, 0);

    const wdFmt = wd % 1 === 0 ? wd : wd.toFixed(1);
    document.getElementById('payView').innerHTML = `
      <section class="kpis" style="margin-bottom:14px">
        <div class="kpi k-1"><div class="kpi-label">Tổng quỹ lương T${month.slice(5)}/${month.slice(0, 4)}</div><div class="kpi-value">${window.fmtShort(totalAll)}</div><div class="kpi-trend">${staffs.length} NV</div><div class="kpi-icon">💰</div></div>
        <div class="kpi k-2"><div class="kpi-label">Ngày công chuẩn</div><div class="kpi-value">${wdFmt}</div><div class="kpi-trend">T2-T6×1 + T7×0.5, trừ CN</div><div class="kpi-icon">📅</div></div>
        <div class="kpi k-3"><div class="kpi-label">Tổng công tính</div><div class="kpi-value">${totalPaid % 1 === 0 ? totalPaid : totalPaid.toFixed(1)}</div><div class="kpi-trend">X+L+P + ½H · T7×0.5</div><div class="kpi-icon">✓</div></div>
        <div class="kpi k-4"><div class="kpi-label">Lương TB/NV</div><div class="kpi-value">${window.fmtShort(staffs.length ? totalAll / staffs.length : 0)}</div><div class="kpi-trend">bình quân</div><div class="kpi-icon">🧮</div></div>
        <div class="kpi k-5"><div class="kpi-label">Hoa hồng/Thưởng auto</div><div class="kpi-value" style="color:var(--ok)">${window.fmtShort(totalBonus)}</div><div class="kpi-trend">% DT / đơn / KPI</div><div class="kpi-icon">💰</div></div>
      </section>
      <div style="font-size:11.5px;color:var(--muted);padding:8px 12px;background:#F5F3FF;border-left:3px solid #7C3AED;border-radius:6px;margin-bottom:10px">
        ⏰ <b>Khấu trừ đi muộn tháng này:</b> <b style="color:${totalLateDed?'var(--danger)':'var(--ok)'}">${totalLateDed?'-'+window.fmt(totalLateDed)+'đ':'0đ'}</b>
        · Mức phạt: ${LATE_DEDUCT_PER_MIN.toLocaleString('vi-VN')}đ/phút sau ${LATE_GRACE_MIN}p miễn phạt
        · Giờ check muộn: <b>Văn phòng từ ${SHIFT_DEFAULT.morn[0]}</b> · <b>Shipper từ ${SHIFT_SHIPPER.morn[0]}</b>
      </div>
      <div class="chart-card" style="overflow:auto">
        <table class="mini-table" style="min-width:1480px">
          <thead><tr>
            <th>Nhân viên</th><th class="num">Lương CB</th><th class="num">NC chuẩn</th>
            <th class="num" title="Có mặt full">X</th>
            <th class="num" title="Đi muộn">L</th>
            <th class="num" title="½ phép">½</th>
            <th class="num" title="Phép cả">P</th>
            <th class="num" title="Vắng">V</th>
            <th class="num">Công tính</th>
            <th class="num">Lương/ngày</th>
            <th class="num">Lương theo công</th>
            <th class="num">Khấu trừ muộn</th>
            <th class="num" style="background:#F0FDF4">💰 Hoa hồng / Thưởng auto</th>
            <th class="num">Thưởng thêm</th>
            <th class="num">Khấu trừ khác</th>
            <th class="num">Thực lĩnh</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:10px;padding:12px 14px;background:#FAFAFB;border-radius:7px;border-left:3px solid var(--navy);line-height:1.7">
        💡 <b>Công thức lương — lịch làm T2-T6 full + T7 sáng + CN nghỉ:</b><br>
        • <b>Trọng số công/ngày:</b> T2-T6 = 1.0 · T7 = 0.5 (chỉ sáng) · CN = 0<br>
        • <b>NC chuẩn</b> = Σ trọng số ngày trong tháng (vd T5/2026 = 21 × 1 + 5 × 0.5 = 23.5)<br>
        • <b>Công tính</b> per NV = Σ (status × trọng số ngày) — X/L/P × sf · H × sf × 0.5 · V × 0<br>
        • <b>Lương/ngày</b> = Lương cơ bản ÷ NC chuẩn · <b>Lương theo công</b> = Lương/ngày × Công tính<br>
        • <b>Khấu trừ muộn</b> = (phút muộn − ${LATE_GRACE_MIN}p) × ${LATE_DEDUCT_PER_MIN.toLocaleString('vi-VN')}đ (chỉ phần sau ${LATE_GRACE_MIN}p miễn phạt)<br>
        • <b style="color:var(--ok)">💰 Hoa hồng/Thưởng auto</b> = compute từ <b>Cấu hình lương</b> của từng NV (vào Nhân viên → click NV → "💰 Cấu hình lương"):
        <br>&nbsp;&nbsp;&nbsp;◦ <b>Sales/CSKH</b>: % doanh thu × DT đơn KH phụ trách trong tháng
        <br>&nbsp;&nbsp;&nbsp;◦ <b>Shipper</b>: Thưởng cố định × số đơn giao thành công
        <br>&nbsp;&nbsp;&nbsp;◦ <b>KPI</b>: Đạt 100% mục tiêu → thưởng full · ≥80% → 50% · &lt;80% → 0
        <br>&nbsp;&nbsp;&nbsp;◦ <b>Custom</b>: ghi chú tự tính, tự nhập vào "Thưởng thêm"<br>
        • <b>Thực lĩnh</b> = Lương theo công + Hoa hồng/Thưởng auto + Thưởng thêm − Khấu trừ muộn − Khấu trừ khác
      </div>`;
    document.querySelectorAll('.pay-extra').forEach(inp => {
      inp.addEventListener('change', () => {
        const sid = inp.dataset.sid, field = inp.dataset.field, val = parseInt(inp.value, 10) || 0;
        const ex = { ...window.STORE.get('payrollExtra', {}) };
        ex[sid] = { ...(ex[sid] || {}), [field]: val };
        window.STORE.set('payrollExtra', ex);
        renderPayroll();
      });
    });
  }

  /* ====== Upload Excel chấm công ====== */
  window.openUploadTimesheet = function () {
    if (!canUpload()) { window.toast('🔒 Bạn không có quyền upload chấm công (cần perm payroll.upload)', 'warn'); return; }
    if (!canEdit())   { window.toast('🔒 Upload cần thêm perm payroll.edit để ghi dữ liệu', 'warn'); return; }
    window.openModal('📥 Upload file chấm công Excel', `
      <p style="font-size:12.5px;color:var(--muted);margin-bottom:10px">
        Chấp nhận <b>.xlsx / .xls / .csv</b> từ máy chấm công.
        App tự tìm cột <code>Họ tên</code> hoặc <code>Mã NV</code> + các cột số <code>1..31</code>.
        Giá trị ô: <code>X</code>/<code>1</code>/<code>8</code> (có mặt) · <code>P</code> (phép) · <code>V</code>/<code>0</code> (vắng).
        Áp dụng cho tháng <b>${month}</b> hiện chọn.
      </p>
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
        const wb = window.XLSX.read(buf, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        window._tsUploadData = data;
        const rows = data.length, cols = data[0] ? data[0].length : 0;
        document.getElementById('tsPreview').innerHTML = `✓ Đọc được <b>${rows}</b> dòng × <b>${cols}</b> cột.<br>Header: ${(data[0] || []).slice(0, 8).map(x => '<code>' + (x === '' ? '∅' : x) + '</code>').join(' ')}…`;
        document.getElementById('tsApply').disabled = false;
      } catch (err) {
        document.getElementById('tsPreview').innerHTML = '<span style="color:var(--danger)">❌ Lỗi đọc file: ' + err.message + '</span>';
      }
    });
  };

  window.applyUploadedTimesheet = function () {
    const data = window._tsUploadData; if (!data || !data.length) { window.toast('Chưa chọn file', 'warn'); return; }
    const header = data[0].map(h => String(h || '').trim());
    let nameCol = -1, codeCol = -1;
    header.forEach((h, i) => {
      if (nameCol < 0 && /(họ.*tên|tên.*nv|tên.*nhân|^tên|fullname|name)/i.test(h)) nameCol = i;
      if (codeCol < 0 && /(mã.*nv|mã.*nhân|^mã|empid|code)/i.test(h)) codeCol = i;
    });
    const dayCols = {};
    header.forEach((h, i) => {
      const n = parseInt(String(h).replace(/[^0-9]/g, ''), 10);
      if (n >= 1 && n <= 31) dayCols[n] = i;
    });
    if (nameCol < 0 && codeCol < 0) { window.toast('Không tìm thấy cột Họ tên / Mã NV', 'warn'); return; }
    if (!Object.keys(dayCols).length) { window.toast('Không tìm thấy cột ngày (1..31) trong header', 'warn'); return; }

    const staffs = window.STORE.get('staff', window.STAFFS || []);
    const sheets = window.STORE.get('timesheet', window.TIMESHEET || []).slice();
    const [y, mm] = month.split('-').map(Number); const last = new Date(y, mm, 0).getDate();
    let updated = 0; const miss = [];
    for (let r = 1; r < data.length; r++) {
      const row = data[r]; if (!row || !row.length) continue;
      const name = String(row[nameCol] || '').trim();
      const code = codeCol >= 0 ? String(row[codeCol] || '').trim() : '';
      if (!name && !code) continue;
      const nm = window.AI ? window.AI.norm(name) : name.toLowerCase();
      const s = (code && staffs.find(x => x.code === code || x.id === code))
        || staffs.find(x => window.AI ? window.AI.norm(x.name) === nm : x.name.toLowerCase() === nm)
        || staffs.find(x => { const xn = window.AI ? window.AI.norm(x.name) : x.name.toLowerCase(); return xn.includes(nm) || nm.includes(xn); });
      if (!s) { if (name) miss.push(name); continue; }
      let sh = sheets.find(t => t.staffId === s.id && t.month === month);
      if (!sh) { sh = { staffId: s.id, month, days: defaultDays() }; sheets.unshift(sh); }
      sh.days = sh.days.slice();
      Object.keys(dayCols).forEach(d => {
        const di = parseInt(d, 10) - 1; if (di >= last) return;
        const v = String(row[dayCols[d]] || '').trim().toUpperCase();
        if (sh.days[di] === '_') return;
        if (/^X$|^1$|^8$|^CO|^C$|^FULL/.test(v) || (!isNaN(parseFloat(v)) && parseFloat(v) >= 7)) sh.days[di] = 'X';
        else if (/^L$|MUON|LATE/.test(v)) sh.days[di] = 'L';
        else if (/^H$|^0\.5$|NUA|HALF/.test(v) || (!isNaN(parseFloat(v)) && parseFloat(v) >= 3.5 && parseFloat(v) < 7)) sh.days[di] = 'H';
        else if (/^P$|PHEP/.test(v)) sh.days[di] = 'P';
        else if (/^V$|^0$|^K$|VANG/.test(v)) sh.days[di] = 'V';
      });
      updated++;
    }
    window.STORE.set('timesheet', sheets);
    window.closeModal();
    window.toast(`✓ Cập nhật chấm công cho ${updated} NV${miss.length ? ' · chưa khớp: ' + miss.slice(0, 3).join(', ') : ''}`, updated ? 'success' : 'warn');
    render();
  };

  /* === init === */
  window.STORE.subscribe('timesheet', render);
  window.renderAppShell('payroll', 'Chấm công & Lương');
  render();
})();
