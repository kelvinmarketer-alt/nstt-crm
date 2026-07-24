/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — 🏭 LỊCH TRỰC KHO
   ─────────────────────────────────────────────────────────
   Xếp lịch trực kho theo NGÀY × BUỔI (sáng / chiều).
   Đây là NGUỒN DUY NHẤT sinh ra tiền "Trực kho" cho phiếu lương
   (mục Trực kho đã bỏ khỏi sổ ghi thưởng thủ công → không cộng trùng).

   Quy ước:
   - Mỗi buổi có người trực; 1 người trực 1 buổi = 1 lần thưởng (mức /buổi theo QUY CHẾ KHO của ngày đó).
   - Tối đa 2 người/NGÀY (thường 1 sáng + 1 chiều). Nhiều hơn 2 → BẮT BUỘC ghi chú lý do.
   - Tất cả người có tên trong ngày đều được thưởng (kể cả khi > 2 người).

   Lưu KV: khoDuty = { 'YYYY-MM-DD': { sang:[staffId], chieu:[staffId], note:'' } }
   ========================================================= */
(function () {
  const S = () => window.STORE;
  const fmt = n => (window.fmt ? window.fmt(n) : (+n || 0).toLocaleString('vi-VN'));
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const BUOI = ['sang', 'chieu'];
  const BUOI_LABEL = { sang: 'Sáng', chieu: 'Chiều' };
  const MAX_PER_DAY = 2;   /* vượt mức này thì bắt buộc ghi chú */

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const MIG_KEY = '__migrated_kho_truc';   /* cờ: đã chuyển dòng 'kho-truc' nhập tay cũ sang lịch */
  const dateKeys = r => Object.keys(r).filter(k => DATE_RE.test(k));

  /* ===== Dữ liệu ===== */
  function getRosterRaw() {
    const r = S().get('khoDuty', {});
    return (r && typeof r === 'object' && !Array.isArray(r)) ? r : {};
  }
  function getRoster() { migrateLegacy(); return getRosterRaw(); }
  /* dayOf đọc RAW — migrate đã chạy ở entry-point (bonusEntries / renderDutyTab / openDay) */

  /* ⚠ KHÔNG BAO GIỜ ghi cả khối lịch bằng STORE.set.
     Tab vừa mở chưa kịp nạp cloud → getRosterRaw() trả {} → set('khoDuty', {}) XOÁ SẠCH lịch của
     cả công ty (đã xảy ra 10/07/2026). rmwKv áp ĐÚNG thao tác của user lên BẢN CLOUD MỚI NHẤT,
     nên chỉ ngày được sửa mới đổi, các ngày khác giữ nguyên. mutate phải IDEMPOTENT. */
  function _mutRoster(mutate) {
    const norm = r => (r && typeof r === 'object' && !Array.isArray(r)) ? r : {};
    if (S().rmwKv) S().rmwKv('khoDuty', r => mutate(norm(r)) || norm(r), {});
    else { const r = norm(getRosterRaw()); mutate(r); S().set('khoDuty', r); }   /* fallback bản cũ */
  }
  function setDay(date, day) {   /* day = {sang,chieu,note} | null để xoá */
    _mutRoster(r => { if (!day) delete r[date]; else r[date] = day; return r; });
  }
  function dayOf(date) {
    const d = getRosterRaw()[date] || {};
    return {
      sang: Array.isArray(d.sang) ? d.sang.slice() : [],
      chieu: Array.isArray(d.chieu) ? d.chieu.slice() : [],
      note: d.note || '',
    };
  }
  const dayCount = d => d.sang.length + d.chieu.length;                     /* số CA */
  const peopleCount = d => new Set(d.sang.concat(d.chieu)).size;            /* số NGƯỜI (1 người 2 buổi = 1) */

  /* MIGRATE 1 LẦN: dòng 'kho-truc' nhập tay cũ trong bonusLog → lịch trực (mặc định ca sáng).
     Không xoá bonusLog (helperFor đã bỏ qua chúng). Idempotent + có cờ nên không hồi sinh
     người đã bị gỡ khỏi lịch. */
  let _migDone = false;
  function migrateLegacy() {
    if (_migDone || !window.STORE) return;
    /* ⛔ ĐỢI CLOUD. migrateLegacy chạy tự động mỗi lần render bảng lương (qua bonusEntries).
       Nếu chạy khi khoDuty/bonusLog chưa nạp xong, nó sẽ dựng lịch từ con số 0 rồi cắm cờ MIG_KEY
       → ghi đè lịch thật và không bao giờ migrate lại. Chưa nạp xong thì để lần render sau. */
    if (S().kvReady && (!S().kvReady('khoDuty') || !S().kvReady('bonusLog'))) return;
    const r = getRosterRaw();
    if (r[MIG_KEY]) { _migDone = true; return; }          /* đã migrate ở máy khác → thôi */
    const log = S().get('bonusLog', []) || [];
    const legacy = log.filter(e => e && e.task === 'kho-truc' && e.staffId && DATE_RE.test(String(e.date || '')));
    if (!legacy.length) return;                            /* CHƯA latch: dữ liệu cloud có thể về muộn */
    _migDone = true;
    /* Áp lên BẢN CLOUD MỚI NHẤT, idempotent (indexOf trước khi push) → chạy 2 lần vẫn ra 1 kết quả */
    _mutRoster(roster => {
      legacy.forEach(e => {
        const d = roster[e.date] || (roster[e.date] = { sang: [], chieu: [], note: '' });
        const b = e.buoi === 'chieu' ? 'chieu' : 'sang';
        if (!Array.isArray(d[b])) d[b] = [];
        if (d[b].indexOf(e.staffId) < 0) d[b].push(e.staffId);
      });
      roster[MIG_KEY] = true;                              /* cờ: đừng hồi sinh người đã bị gỡ khỏi lịch */
      return roster;
    });
    console.log(`[NSTT] ✓ Chuyển ${legacy.length} ca trực kho cũ (bonusLog) → Lịch trực kho`);
  }

  /* ===== Nhân sự Kho ===== */
  const khoStaff = () => (S().get('staff', window.STAFFS || []) || [])
    .filter(s => s.status === 'active' && String(s.dept || '') === 'Kho')
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
  const staffById = id => (S().get('staff', window.STAFFS || []) || []).find(s => s.id === id) || {};
  /* Tên ngắn hiển thị ở góc ô lịch: lấy tên gọi (từ cuối) */
  const shortName = n => { const w = String(n || '').trim().split(/\s+/); return w[w.length - 1] || '?'; };

  /* ===== Sinh khoản thưởng cho phiếu lương =====
     Mỗi (ngày, buổi, người) = 1 khoản `kho-truc`. Số tiền do BONUS.computeAmount tính
     theo QUY CHẾ KHO phủ ngày đó (nên đổi quy chế là tiền tự đổi, đúng giai đoạn). */
  function _entry(date, buoi, staffId, note) {
    const st = staffById(staffId);
    return {
      id: `DUTY-${date}-${buoi}-${staffId}`,
      date, staffId,
      staffName: st.name || '',
      dept: 'Kho',
      task: 'kho-truc',
      buoi,
      source: 'duty',          /* → sổ ghi hiện read-only, trỏ về tab Lịch trực */
      note: note || '',
    };
  }
  function bonusEntries(staffId, month) {
    const r = getRoster();
    const out = [];
    dateKeys(r).forEach(date => {
      if (String(date).slice(0, 7) !== month) return;
      const d = dayOf(date);
      BUOI.forEach(b => d[b].forEach(id => { if (id === staffId) out.push(_entry(date, b, id, d.note)); }));
    });
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  function bonusEntriesMonth(month) {
    const r = getRoster();
    const out = [];
    dateKeys(r).forEach(date => {
      if (String(date).slice(0, 7) !== month) return;
      const d = dayOf(date);
      BUOI.forEach(b => d[b].forEach(id => out.push(_entry(date, b, id, d.note))));
    });
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  /* Tiền 1 ca trực (theo BUỔI) trong ngày đó — null = ngày chưa có quy chế Kho */
  function rateOn(date, buoi) {
    return (window.BONUS && window.BONUS.khoTrucRateOn) ? window.BONUS.khoTrucRateOn(date, buoi || 'sang') : null;
  }
  const hasPolicy = date => rateOn(date, 'sang') != null;
  /* Tiền của cả 1 ngày (mọi ca) — dùng cho tooltip + toast */
  function dayAmount(date, d) {
    if (!hasPolicy(date)) return 0;
    return d.sang.length * (rateOn(date, 'sang') || 0) + d.chieu.length * (rateOn(date, 'chieu') || 0);
  }

  /* ===== Thống kê 1 tháng ===== */
  function monthStats(month) {
    const entries = bonusEntriesMonth(month);
    const byStaff = {};
    const daysSet = new Set();
    let total = 0, noPolicy = 0;
    let nSang = 0, nChieu = 0;
    entries.forEach(e => {
      const rate = rateOn(e.date, e.buoi);
      const amt = rate == null ? 0 : rate;
      if (rate == null) noPolicy++;
      total += amt;
      daysSet.add(e.date);
      if (e.buoi === 'chieu') nChieu++; else nSang++;
      const b = byStaff[e.staffId] || (byStaff[e.staffId] = { staffId: e.staffId, name: e.staffName, shifts: 0, sang: 0, chieu: 0, days: new Set(), amount: 0 });
      b.shifts++; b[e.buoi === 'chieu' ? 'chieu' : 'sang']++; b.days.add(e.date); b.amount += amt;
    });
    const rows = Object.values(byStaff)
      .map(b => ({ ...b, days: b.days.size }))
      .sort((a, b) => b.amount - a.amount || b.shifts - a.shifts);
    return { entries, rows, totalDays: daysSet.size, totalShifts: entries.length, nSang, nChieu, total, noPolicy };
  }
  /* Số ngày có người trực trong 1 tháng (cho dải 12 tháng) */
  function dutyDaysIn(y, m) {
    const pre = `${y}-${String(m).padStart(2, '0')}`;
    const r = getRoster();
    return dateKeys(r).filter(d => d.slice(0, 7) === pre && dayCount(dayOf(d)) > 0).length;
  }

  /* ===== STATE ===== */
  let _month = null;
  const _iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  /* ===== RENDER TAB ===== */
  function renderDutyTab(month) {
    migrateLegacy();
    if (month) _month = month;
    if (!_month) _month = (document.getElementById('payMonth') || {}).value || (window.todayISO ? window.todayISO().slice(0, 7) : '2026-07');
    const host = document.getElementById('payView');
    if (!host) return;
    const [y, m] = _month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    const st = monthStats(_month);
    const today = (window.todayISO ? window.todayISO() : new Date().toISOString()).slice(0, 10);
    const rSang = rateOn(_iso(y, m, 1), 'sang');
    const rChieu = rateOn(_iso(y, m, 1), 'chieu');

    /* Lưới ngày (tuần bắt đầu Thứ 2) */
    const first = new Date(y, m - 1, 1).getDay();
    const startCol = (first + 6) % 7;
    const cells = [];
    for (let i = 0; i < startCol; i++) cells.push(0);
    for (let d = 1; d <= last; d++) cells.push(d);
    while (cells.length % 7) cells.push(0);

    const CORNER = {
      tl: 'top:4px;left:5px;text-align:left', tr: 'top:4px;right:5px;text-align:right',
      bl: 'bottom:4px;left:5px;text-align:left', br: 'bottom:4px;right:5px;text-align:right',
    };
    const corner = (name, pos, color) =>
      `<span title="${esc(name)}" style="position:absolute;${CORNER[pos]};font-size:9px;font-weight:700;color:${color};max-width:47%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.1">${esc(shortName(name))}</span>`;

    const dowNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    let grid = `<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px">`;
    grid += dowNames.map((n, i) => `<div style="text-align:center;font-weight:700;font-size:11px;color:${i === 5 ? '#B45309' : i === 6 ? '#DC2626' : 'var(--muted)'};padding:2px 0 4px">${n}</div>`).join('');
    cells.forEach(d => {
      if (!d) { grid += `<div></div>`; return; }
      const date = _iso(y, m, d);
      const day = dayOf(date);
      const n = dayCount(day);
      const over = peopleCount(day) > MAX_PER_DAY;
      const isToday = date === today;
      const wd = new Date(y, m - 1, d).getDay();

      const bg = over ? '#FEF2F2' : n ? '#F0FDF4' : '#fff';
      const bd = over ? '#FCA5A5' : n ? '#BBF7D0' : (isToday ? '#15803D' : '#EDF1EC');
      const numCol = over ? '#B91C1C' : n ? '#15803D' : (wd === 0 ? '#DC2626' : wd === 6 ? '#B45309' : '#9AA5A0');

      const sNames = day.sang.map(id => staffById(id).name || id);
      const cNames = day.chieu.map(id => staffById(id).name || id);
      let corners = '';
      if (sNames[0]) corners += corner(sNames[0], 'tl', '#B45309');
      if (sNames[1]) corners += corner(sNames[1], 'tr', '#B45309');
      if (cNames[0]) corners += corner(cNames[0], 'bl', '#1E40AF');
      if (cNames[1]) corners += corner(cNames[1], 'br', '#1E40AF');
      const extra = Math.max(0, sNames.length - 2) + Math.max(0, cNames.length - 2);

      const amt = dayAmount(date, day);
      const tip = n
        ? [...sNames.map(x => '🌅 ' + x), ...cNames.map(x => '🌇 ' + x)].join(' · ') + (amt ? ' — ' + fmt(amt) + 'đ' : '')
        : 'Chưa xếp trực — bấm để xếp';

      grid += `<div onclick="window.KHODUTY.openDay('${date}')" title="${esc(tip)}"
        onmouseover="this.style.boxShadow='0 2px 10px rgba(21,128,61,.16)'" onmouseout="this.style.boxShadow='none'"
        style="position:relative;background:${bg};border:1.5px solid ${bd};border-radius:9px;min-height:58px;cursor:pointer;transition:box-shadow .12s">
        ${corners}
        <div style="position:absolute;inset:0;display:grid;place-items:center;pointer-events:none">
          <div style="text-align:center;line-height:1.05">
            <div style="font-weight:700;font-size:15px;color:${numCol}">${d}</div>
            ${n ? `<div style="font-size:8.5px;font-weight:700;color:#15803D;margin-top:1px">${n} ca</div>` : ''}
          </div>
        </div>
        ${day.note ? `<span style="position:absolute;top:3px;left:50%;transform:translateX(-50%);font-size:9px;line-height:1">📝</span>` : ''}
        ${extra ? `<span style="position:absolute;bottom:3px;left:50%;transform:translateX(-50%);font-size:8px;color:#B91C1C;font-weight:700;line-height:1">+${extra}</span>` : ''}
      </div>`;
    });
    grid += `</div>`;

    /* Dải 12 tháng — 6 cột × 2 hàng cho gọn */
    const yr = Array.from({ length: 12 }, (_, i) => {
      const dd = dutyDaysIn(y, i + 1);
      const cur = (i + 1) === m;
      return `<button onclick="window.setPayMonth('${y}-${String(i + 1).padStart(2, '0')}')" title="${dd} ngày có trực"
        style="border:1.5px solid ${cur ? '#15803D' : dd ? '#BBF7D0' : '#EDF1EC'};background:${cur ? '#DCFCE7' : '#fff'};border-radius:7px;padding:5px 2px;cursor:pointer;text-align:center;line-height:1.2">
        <div style="font-weight:700;font-size:11.5px;color:${cur ? '#15803D' : 'var(--navy)'}">Th${i + 1}</div>
        <div style="font-size:9.5px;color:${dd ? '#15803D' : 'var(--muted)'}">${dd || '–'}</div>
      </button>`;
    }).join('');

    const staffRows = st.rows.length ? st.rows.map(r => `<tr>
        <td style="padding:6px 8px"><b>${esc(r.name || r.staffId)}</b></td>
        <td class="num" style="padding:6px 8px">${r.days}</td>
        <td class="num" style="padding:6px 8px" title="${r.sang} ca sáng · ${r.chieu} ca chiều">
          ${r.shifts}<div style="font-size:9.5px;color:var(--muted);font-weight:400">${r.sang}S·${r.chieu}C</div></td>
        <td class="num" style="padding:6px 8px;font-weight:700;color:#15803D;white-space:nowrap">${fmt(r.amount)}đ</td>
      </tr>`).join('')
      : `<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--muted);font-size:12.5px">Chưa xếp trực tháng này.<br>Bấm vào 1 ngày để xếp.</td></tr>`;

    const kpi = (label, val, sub, col) => `<div style="flex:1;min-width:96px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:9px 12px">
        <div style="font-size:10.5px;color:var(--muted);text-transform:uppercase;font-weight:600;letter-spacing:.2px">${label}</div>
        <div style="font-size:21px;font-weight:800;color:${col || 'var(--navy)'};line-height:1.25">${val}</div>
        <div style="font-size:10.5px;color:var(--muted)">${sub}</div>
      </div>`;

    host.innerHTML = `
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">

        <div style="flex:3 1 430px;min-width:0">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
            ${kpi('Ngày trực', st.totalDays, `tháng ${m}/${y}`)}
            ${kpi('Ca trực', st.totalShifts, `${st.nSang} sáng · ${st.nChieu} chiều`, '#1E40AF')}
            ${kpi('Tổng thưởng', fmt(st.total), 'tự vào phiếu lương', '#15803D')}
          </div>

          ${st.noPolicy ? `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:8px 11px;margin-bottom:9px;font-size:12px;color:#B91C1C">
            ⚠ <b>${st.noPolicy} ca</b> rơi vào ngày không thuộc quy chế Kho → tính <b>0đ</b>. Khai ở <b>🎁 Thưởng hỗ trợ → ⚙ Quy chế thưởng → 📦 Kho</b>.
          </div>` : ''}

          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11.5px;color:var(--muted);margin-bottom:8px">
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#B45309;vertical-align:middle"></span> góc trên = <b style="color:#B45309">ca sáng</b>${rSang != null ? ` (${fmt(rSang)}đ)` : ''}</span>
            <span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:#1E40AF;vertical-align:middle"></span> góc dưới = <b style="color:#1E40AF">ca chiều</b>${rChieu != null ? ` (${fmt(rChieu)}đ)` : ''}</span>
            <span>·</span><span>tối đa <b>${MAX_PER_DAY} người/ngày</b>, hơn thì phải ghi chú</span>
          </div>

          ${grid}

          <div style="font-size:11px;color:var(--muted);margin-top:8px">Mức <b>/buổi</b> lấy theo <b>quy chế Kho</b> hiệu lực NGÀY đó → sửa quy chế không làm đổi tiền giai đoạn trước.</div>
        </div>

        <div style="flex:2 1 290px;min-width:270px">
          <div style="font-size:12.5px;font-weight:700;color:var(--navy);margin-bottom:7px">👤 Trực theo nhân sự — tháng ${m}/${y}</div>
          <div style="border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff">
            <table class="mini-table" style="width:100%;border-collapse:separate;border-spacing:0">
              <thead><tr style="background:#F9FAFB">
                <th style="text-align:left;padding:7px 8px">Nhân sự</th>
                <th class="num" style="padding:7px 8px" title="Số ngày có trực">Ngày</th>
                <th class="num" style="padding:7px 8px" title="Số buổi trực">Ca</th>
                <th class="num" style="padding:7px 8px">Thưởng</th>
              </tr></thead>
              <tbody>${staffRows}</tbody>
              ${st.rows.length ? `<tfoot><tr style="background:#F0FDF4;font-weight:700">
                <td style="padding:7px 8px">TỔNG</td>
                <td class="num" style="padding:7px 8px">${st.totalDays}</td>
                <td class="num" style="padding:7px 8px">${st.totalShifts}</td>
                <td class="num" style="padding:7px 8px;color:#15803D;white-space:nowrap">${fmt(st.total)}đ</td>
              </tr></tfoot>` : ''}
            </table>
          </div>

          <div style="font-size:12.5px;font-weight:700;color:var(--navy);margin:12px 0 7px">🗓️ Cả năm ${y} <span style="font-weight:400;color:var(--muted);font-size:11px">— số ngày có trực</span></div>
          <div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px">${yr}</div>
        </div>
      </div>`;
  }

  /* ===== MODAL: xếp trực 1 ngày ===== */
  function openDay(date) {
    /* Chưa nạp xong lịch từ máy chủ → các ô tick sẽ hiện SAI (rỗng), user lưu là ghi đè nhầm. */
    if (S().kvReady && !S().kvReady('khoDuty')) {
      window.toast?.('⏳ Đang tải lịch trực từ máy chủ — mở lại sau 1–2 giây', 'warn');
      return;
    }
    migrateLegacy();          /* nếu chưa migrate mà lưu đè ngày này → mất ca trực cũ */
    const d = dayOf(date);
    const rSang = rateOn(date, 'sang');
    const rChieu = rateOn(date, 'chieu');
    const active = khoStaff();
    /* Người ĐÃ được xếp trực nhưng nay đã nghỉ / chuyển phòng vẫn phải hiện (đang tick),
       nếu không thì lần lưu sau sẽ ÂM THẦM XOÁ họ khỏi lịch → mất tiền trực đã làm. */
    const assigned = d.sang.concat(d.chieu);
    const extra = Array.from(new Set(assigned))
      .filter(id => !active.some(s => s.id === id))
      .map(id => { const st = staffById(id); return { id, name: st.name || id, _off: true }; });
    const list = active.concat(extra);
    const chip = (s, buoi) => {
      const on = d[buoi].indexOf(s.id) >= 0;
      return `<label class="kd-chip" data-buoi="${buoi}" title="${s._off ? 'NV đã nghỉ / chuyển bộ phận — vẫn giữ để không mất công trực đã làm' : ''}" style="display:inline-flex;align-items:center;gap:5px;border:1.5px solid ${on ? '#15803D' : 'var(--line)'};background:${on ? '#DCFCE7' : '#fff'};border-radius:99px;padding:4px 10px;margin:0 5px 5px 0;cursor:pointer;font-size:12px${s._off ? ';opacity:.75' : ''}">
        <input type="checkbox" class="kd-${buoi}" value="${s.id}" ${on ? 'checked' : ''} onchange="window.KHODUTY._sync()" style="margin:0">
        <span>${esc(s.name)}${s._off ? ' <span style="font-size:9px;color:#B45309">(đã nghỉ)</span>' : ''}</span>
      </label>`;
    };
    const ddmm = date.split('-').reverse().join('/');
    window.openModal(`🏭 Trực kho — ${ddmm}`, `
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px;line-height:1.6">
        Chọn người trực từng buổi. Mỗi buổi trực = <b>1 lần thưởng</b>${rSang == null
          ? ' — <b style="color:#B91C1C">⚠ ngày này chưa có quy chế Kho → 0đ</b>'
          : ` — 🌅 sáng <b style="color:#B45309">${fmt(rSang)}đ</b> · 🌇 chiều <b style="color:#1E40AF">${fmt(rChieu)}đ</b> (theo quy chế của ngày).`}
        Trực cả 2 buổi thì nhận cả 2 mức.
      </div>

      <div style="border:1px solid #FDE68A;background:#FFFBEB;border-radius:9px;padding:10px 12px;margin-bottom:10px">
        <div style="font-weight:800;color:#B45309;font-size:12.5px;margin-bottom:7px">🌅 Ca sáng${rSang != null ? ` <span style="font-weight:600">· ${fmt(rSang)}đ/người</span>` : ''}</div>
        <div>${list.map(s => chip(s, 'sang')).join('')}</div>
      </div>
      <div style="border:1px solid #BFDBFE;background:#EFF6FF;border-radius:9px;padding:10px 12px;margin-bottom:10px">
        <div style="font-weight:800;color:#1E40AF;font-size:12.5px;margin-bottom:7px">🌇 Ca chiều${rChieu != null ? ` <span style="font-weight:600">· ${fmt(rChieu)}đ/người</span>` : ''}</div>
        <div>${list.map(s => chip(s, 'chieu')).join('')}</div>
      </div>

      <div id="kdSummary" style="border-radius:9px;padding:9px 12px;font-size:12.5px;margin-bottom:10px"></div>

      <div>
        <label style="font-size:11.5px;font-weight:600;color:var(--muted)">Ghi chú lý do <span id="kdNoteReq" style="color:#B91C1C;display:none">(bắt buộc khi &gt; ${MAX_PER_DAY} người)</span></label>
        <input id="kdNote" value="${esc(d.note)}" placeholder="VD: hàng về đột xuất, cần thêm người phụ kho"
          oninput="window.KHODUTY._sync()" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:7px;box-sizing:border-box">
      </div>
    `, {
      width: '620px',
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Huỷ</button>
               ${dayCount(d) ? `<button class="btn btn-ghost" style="color:#B91C1C" onclick="window.KHODUTY._clear('${date}')">🗑 Xoá lịch ngày này</button>` : ''}
               <button class="btn btn-primary" onclick="window.KHODUTY._save('${date}')">💾 Lưu lịch trực</button>`,
    });
    _openDate = date;
    _sync();
  }

  let _openDate = null;
  const _picked = buoi => Array.from(document.querySelectorAll('.kd-' + buoi + ':checked')).map(x => x.value);

  /* Cập nhật viền chip + ô tổng kết + hiện/ẩn "bắt buộc ghi chú" */
  function _sync() {
    document.querySelectorAll('.kd-chip').forEach(l => {
      const cb = l.querySelector('input');
      l.style.border = '1.5px solid ' + (cb.checked ? '#15803D' : 'var(--line)');
      l.style.background = cb.checked ? '#DCFCE7' : '#fff';
    });
    const s = _picked('sang'), c = _picked('chieu');
    const n = s.length + c.length;                       /* số CA */
    const people = new Set(s.concat(c)).size;            /* số NGƯỜI — quy định "tối đa 2 NGƯỜI/ngày" */
    const over = people > MAX_PER_DAY;
    const req = document.getElementById('kdNoteReq');
    if (req) req.style.display = over ? '' : 'none';
    const box = document.getElementById('kdSummary');
    if (!box) return;
    box.style.background = over ? '#FEF2F2' : n ? '#F0FDF4' : '#F9FAFB';
    box.style.border = '1px solid ' + (over ? '#FECACA' : n ? '#BBF7D0' : 'var(--line)');
    box.style.color = over ? '#B91C1C' : n ? '#15803D' : 'var(--muted)';
    const dupe = s.filter(x => c.indexOf(x) >= 0).map(x => staffById(x).name);
    const rS = _openDate ? (rateOn(_openDate, 'sang') || 0) : 0;
    const rC = _openDate ? (rateOn(_openDate, 'chieu') || 0) : 0;
    const money = s.length * rS + c.length * rC;
    box.innerHTML = !n
      ? 'Chưa chọn ai trực ngày này.'
      : `<b>${people} người</b> · <b>${n} ca</b> (sáng ${s.length} · chiều ${c.length})`
        + (money ? ` · tổng <b>${fmt(money)}đ</b>` : '')
        + (dupe.length ? ` · <b>${esc(dupe.join(', '))}</b> trực cả 2 buổi → nhận cả 2 mức` : '')
        + (over ? ` — <b>vượt ${MAX_PER_DAY} người/ngày, phải ghi chú lý do.</b>` : '');
  }

  function _save(date) {
    const sang = _picked('sang');
    const chieu = _picked('chieu');
    const note = (document.getElementById('kdNote') || {}).value || '';
    const n = sang.length + chieu.length;                     /* số CA (dùng tính tiền) */
    const people = new Set(sang.concat(chieu)).size;         /* số NGƯỜI (dùng cho quy định ≤ 2) */
    if (people > MAX_PER_DAY && !note.trim()) {
      window.toast?.(`Có ${people} người trực (> ${MAX_PER_DAY}) — bắt buộc ghi chú lý do`, 'warn');
      return;
    }
    setDay(date, n ? { sang, chieu, note: note.trim() } : null);
    window.closeModal?.();
    const money = hasPolicy(date) ? (sang.length * (rateOn(date, 'sang') || 0) + chieu.length * (rateOn(date, 'chieu') || 0)) : null;
    window.toast?.(!n ? '✓ Đã xoá lịch trực ngày ' + date.split('-').reverse().join('/')
      : `✓ Lưu ${n} ca trực${money == null ? ' (⚠ ngày chưa có quy chế Kho → 0đ)' : ' · ' + fmt(money) + 'đ'}`,
      money == null && n ? 'warn' : 'success');
    rerender();
  }
  async function _clear(date) {
    if (!await window.uiConfirm('Xoá toàn bộ lịch trực ngày này?')) return;
    setDay(date, null);
    window.closeModal?.();
    window.toast?.('✓ Đã xoá lịch trực', 'success');
    rerender();
  }

  /* Vẽ lại tab đang mở (render() của payroll.js tự điều hướng đúng tab) */
  function rerender() {
    if (window.renderPayrollPublic) window.renderPayrollPublic();
    else if (document.getElementById('payView')) renderDutyTab();
  }

  window.KHODUTY = {
    /* saveRoster (ghi cả khối lịch) đã BỎ — dùng setDay, nó áp lên bản cloud mới nhất */
    getRoster, setDay, dayOf, khoStaff, peopleCount, migrateLegacy,
    bonusEntries, bonusEntriesMonth, monthStats, dutyDaysIn, rateOn, dayAmount, hasPolicy,
    renderDutyTab, openDay, rerender,
    setMonth: m => { _month = m; },
    MAX_PER_DAY,
    _sync, _save, _clear,
  };
  console.log('[NSTT] ✓ Kho duty roster ready');
})();
