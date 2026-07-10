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
  function saveRoster(r) { S().set('khoDuty', r); }
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
    const r = getRosterRaw();
    if (r[MIG_KEY]) { _migDone = true; return; }          /* đã migrate ở máy khác → thôi */
    const log = S().get('bonusLog', []) || [];
    const legacy = log.filter(e => e && e.task === 'kho-truc' && e.staffId && DATE_RE.test(String(e.date || '')));
    if (!legacy.length) return;                            /* CHƯA latch: dữ liệu cloud có thể về muộn */
    let added = 0;
    legacy.forEach(e => {
      const d = r[e.date] || (r[e.date] = { sang: [], chieu: [], note: '' });
      const b = e.buoi === 'chieu' ? 'chieu' : 'sang';
      if (!Array.isArray(d[b])) d[b] = [];
      if (d[b].indexOf(e.staffId) < 0) { d[b].push(e.staffId); added++; }
    });
    r[MIG_KEY] = true;                                     /* cờ: đừng hồi sinh người đã bị gỡ khỏi lịch */
    _migDone = true;
    saveRoster(r);
    console.log(`[NSTT] ✓ Chuyển ${added}/${legacy.length} ca trực kho cũ (bonusLog) → Lịch trực kho`);
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
  /* Tiền 1 ca trực trong ngày đó (null = ngày chưa có quy chế Kho) */
  function rateOn(date) {
    return (window.BONUS && window.BONUS.khoTrucRateOn) ? window.BONUS.khoTrucRateOn(date) : null;
  }

  /* ===== Thống kê 1 tháng ===== */
  function monthStats(month) {
    const entries = bonusEntriesMonth(month);
    const byStaff = {};
    const daysSet = new Set();
    let total = 0, noPolicy = 0;
    entries.forEach(e => {
      const rate = rateOn(e.date);
      const amt = rate == null ? 0 : rate;
      if (rate == null) noPolicy++;
      total += amt;
      daysSet.add(e.date);
      const b = byStaff[e.staffId] || (byStaff[e.staffId] = { staffId: e.staffId, name: e.staffName, shifts: 0, days: new Set(), amount: 0 });
      b.shifts++; b.days.add(e.date); b.amount += amt;
    });
    const rows = Object.values(byStaff)
      .map(b => ({ ...b, days: b.days.size }))
      .sort((a, b) => b.amount - a.amount || b.shifts - a.shifts);
    return { entries, rows, totalDays: daysSet.size, totalShifts: entries.length, total, noPolicy };
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
    if (month) _month = month;
    if (!_month) _month = (document.getElementById('payMonth') || {}).value || (window.todayISO ? window.todayISO().slice(0, 7) : '2026-07');
    const host = document.getElementById('payView');
    if (!host) return;
    const [y, m] = _month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    const st = monthStats(_month);

    /* Lưới ngày (tuần bắt đầu Thứ 2) */
    const first = new Date(y, m - 1, 1).getDay();
    const startCol = (first + 6) % 7;
    const cells = [];
    for (let i = 0; i < startCol; i++) cells.push(0);
    for (let d = 1; d <= last; d++) cells.push(d);
    while (cells.length % 7) cells.push(0);

    const corner = (name, pos, color) => {
      const style = {
        tl: 'top:3px;left:4px', tr: 'top:3px;right:4px',
        bl: 'bottom:3px;left:4px', br: 'bottom:3px;right:4px',
      }[pos];
      return `<span title="${esc(name)}" style="position:absolute;${style};font-size:8.5px;font-weight:700;color:${color};max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(shortName(name))}</span>`;
    };

    const dowNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    let grid = `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;max-width:560px">`;
    grid += dowNames.map((n, i) => `<div style="text-align:center;font-weight:700;font-size:11.5px;color:${i === 5 ? '#B45309' : i === 6 ? '#DC2626' : 'var(--muted)'};padding:3px 0">${n}</div>`).join('');
    cells.forEach(d => {
      if (!d) { grid += `<div></div>`; return; }
      const date = _iso(y, m, d);
      const day = dayOf(date);
      const n = dayCount(day);                 /* ca */
      const over = peopleCount(day) > MAX_PER_DAY;
      const wd = new Date(y, m - 1, d).getDay();
      const bg = over ? '#FEF2F2' : n ? '#F0FDF4' : (wd === 0 ? '#FAFAFA' : '#fff');
      const bd = over ? '#FCA5A5' : n ? '#BBF7D0' : '#E6ECE4';

      const sNames = day.sang.map(id => staffById(id).name || id);
      const cNames = day.chieu.map(id => staffById(id).name || id);
      let corners = '';
      if (sNames[0]) corners += corner(sNames[0], 'tl', '#B45309');
      if (sNames[1]) corners += corner(sNames[1], 'tr', '#B45309');
      if (cNames[0]) corners += corner(cNames[0], 'bl', '#1E40AF');
      if (cNames[1]) corners += corner(cNames[1], 'br', '#1E40AF');
      const extra = Math.max(0, sNames.length - 2) + Math.max(0, cNames.length - 2);

      grid += `<div onclick="window.KHODUTY.openDay('${date}')" title="${n ? esc([...sNames.map(x => 'S: ' + x), ...cNames.map(x => 'C: ' + x)].join(' · ')) : 'Chưa xếp trực — bấm để xếp'}"
        style="position:relative;background:${bg};border:1px solid ${bd};border-radius:8px;min-height:62px;cursor:pointer;display:grid;place-items:center">
        ${corners}
        <div style="text-align:center">
          <div style="font-weight:700;font-size:14px;color:var(--navy);line-height:1.1">${d}</div>
          ${n ? `<div style="font-size:8.5px;color:#15803D;font-weight:700">${n} ca</div>` : ''}
        </div>
        ${day.note ? `<span style="position:absolute;top:2px;left:50%;transform:translateX(-50%);font-size:9px" title="${esc(day.note)}">📝</span>` : ''}
        ${extra ? `<span style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);font-size:8px;color:#B91C1C;font-weight:700">+${extra}</span>` : ''}
      </div>`;
    });
    grid += `</div>`;

    /* Dải 12 tháng */
    const yr = Array.from({ length: 12 }, (_, i) => {
      const dd = dutyDaysIn(y, i + 1);
      const cur = (i + 1) === m;
      return `<button onclick="window.setPayMonth('${y}-${String(i + 1).padStart(2, '0')}')" title="${dd} ngày có trực"
        style="border:1.5px solid ${cur ? '#15803D' : '#E6ECE4'};background:${cur ? '#DCFCE7' : '#fff'};border-radius:8px;padding:6px 4px;cursor:pointer;text-align:center">
        <div style="font-weight:700;font-size:12px;color:${cur ? '#15803D' : 'var(--navy)'}">Th${i + 1}</div>
        <div style="font-size:10px;color:var(--muted)">${dd} ngày</div>
      </button>`;
    }).join('');

    /* Bảng bên phải */
    const staffRows = st.rows.length ? st.rows.map(r => `<tr>
        <td style="padding:6px 8px"><b>${esc(r.name || r.staffId)}</b></td>
        <td class="num" style="padding:6px 8px">${r.days}</td>
        <td class="num" style="padding:6px 8px">${r.shifts}</td>
        <td class="num" style="padding:6px 8px;font-weight:700;color:#15803D;white-space:nowrap">${fmt(r.amount)}đ</td>
      </tr>`).join('')
      : `<tr><td colspan="4" style="padding:22px;text-align:center;color:var(--muted)">Chưa xếp trực tháng này. Bấm vào 1 ngày để xếp.</td></tr>`;

    host.innerHTML = `
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start">
        <div style="flex:1;min-width:320px">
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
            <div class="kpi" style="flex:1;min-width:110px"><div class="kpi-label">Tổng ngày trực</div><div class="kpi-value">${st.totalDays}</div><div class="kpi-trend">tháng ${m}/${y}</div><div class="kpi-icon">🏭</div></div>
            <div class="kpi" style="flex:1;min-width:110px"><div class="kpi-label">Tổng ca trực</div><div class="kpi-value" style="color:#1E40AF">${st.totalShifts}</div><div class="kpi-trend">sáng + chiều</div></div>
            <div class="kpi" style="flex:1;min-width:130px"><div class="kpi-label" style="color:#15803D">Tổng thưởng</div><div class="kpi-value" style="color:#15803D">${fmt(st.total)}</div><div class="kpi-trend">tự vào phiếu lương</div></div>
          </div>
          ${st.noPolicy ? `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:9px;padding:10px 13px;margin-bottom:10px;font-size:12.5px;color:#B91C1C">
            ⚠ <b>${st.noPolicy} ca</b> rơi vào ngày <b>không thuộc quy chế Kho</b> nào → tính <b>0đ</b>.
            Khai bổ sung ở tab <b>🎁 Thưởng hỗ trợ → ⚙ Quy chế thưởng → 📦 Kho</b>.
          </div>` : ''}
          <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:9px;padding:10px 13px;margin-bottom:12px;font-size:12.5px;color:#15803D">
            Bấm vào 1 ngày để xếp người trực. Góc trên = <b style="color:#B45309">ca sáng</b>, góc dưới = <b style="color:#1E40AF">ca chiều</b>.
            Tối đa <b>${MAX_PER_DAY} người/ngày</b> — nhiều hơn phải <b>ghi chú lý do</b>.
          </div>
          ${grid}
          <div style="font-size:11.5px;color:var(--muted);margin-top:10px">
            Mức thưởng <b>/buổi</b> lấy theo <b>quy chế Kho</b> đang hiệu lực NGÀY đó → sửa quy chế không làm đổi tiền giai đoạn trước.
          </div>
        </div>

        <div style="width:340px;min-width:280px;flex:0 1 340px">
          <div style="font-size:12.5px;font-weight:700;color:var(--navy);margin-bottom:8px">👤 Trực theo nhân sự — tháng ${m}/${y}</div>
          <div style="border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff">
            <table class="mini-table" style="width:100%;border-collapse:separate;border-spacing:0">
              <thead><tr style="background:#F9FAFB">
                <th style="text-align:left;padding:8px">Nhân sự</th>
                <th class="num" style="padding:8px" title="Số ngày có trực">Ngày</th>
                <th class="num" style="padding:8px" title="Số buổi trực (sáng/chiều)">Ca</th>
                <th class="num" style="padding:8px">Thưởng</th>
              </tr></thead>
              <tbody>${staffRows}</tbody>
              ${st.rows.length ? `<tfoot><tr style="background:#F0FDF4;font-weight:700">
                <td style="padding:7px 8px">TỔNG</td>
                <td class="num" style="padding:7px 8px">${st.totalDays}</td>
                <td class="num" style="padding:7px 8px">${st.totalShifts}</td>
                <td class="num" style="padding:7px 8px;color:#15803D">${fmt(st.total)}đ</td>
              </tr></tfoot>` : ''}
            </table>
          </div>

          <div style="font-size:12.5px;font-weight:700;color:var(--navy);margin:14px 0 8px">🗓️ Cả năm ${y}</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">${yr}</div>
        </div>
      </div>`;
  }

  /* ===== MODAL: xếp trực 1 ngày ===== */
  function openDay(date) {
    const d = dayOf(date);
    const active = khoStaff();
    /* Người ĐÃ được xếp trực nhưng nay đã nghỉ / chuyển phòng vẫn phải hiện (đang tick),
       nếu không thì lần lưu sau sẽ ÂM THẦM XOÁ họ khỏi lịch → mất tiền trực đã làm. */
    const assigned = d.sang.concat(d.chieu);
    const extra = Array.from(new Set(assigned))
      .filter(id => !active.some(s => s.id === id))
      .map(id => { const st = staffById(id); return { id, name: st.name || id, _off: true }; });
    const list = active.concat(extra);
    const rate = rateOn(date);
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
        Chọn người trực từng buổi. Mỗi buổi trực = <b>1 lần thưởng</b>${rate == null
          ? ' — <b style="color:#B91C1C">⚠ ngày này chưa có quy chế Kho → 0đ</b>'
          : ` (<b style="color:#15803D">${fmt(rate)}đ</b>/buổi theo quy chế của ngày)`}.
      </div>

      <div style="border:1px solid #FDE68A;background:#FFFBEB;border-radius:9px;padding:10px 12px;margin-bottom:10px">
        <div style="font-weight:800;color:#B45309;font-size:12.5px;margin-bottom:7px">🌅 Ca sáng</div>
        <div>${list.map(s => chip(s, 'sang')).join('')}</div>
      </div>
      <div style="border:1px solid #BFDBFE;background:#EFF6FF;border-radius:9px;padding:10px 12px;margin-bottom:10px">
        <div style="font-weight:800;color:#1E40AF;font-size:12.5px;margin-bottom:7px">🌇 Ca chiều</div>
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
    _sync();
  }

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
    box.innerHTML = !n
      ? 'Chưa chọn ai trực ngày này.'
      : `<b>${people} người</b> · <b>${n} ca</b> (sáng ${s.length} · chiều ${c.length})`
        + (dupe.length ? ` · <b>${esc(dupe.join(', '))}</b> trực cả 2 buổi → được thưởng 2 lần` : '')
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
    const r = getRoster();
    if (!n) delete r[date];
    else r[date] = { sang, chieu, note: note.trim() };
    saveRoster(r);
    window.closeModal?.();
    const rate = rateOn(date);
    window.toast?.(!n ? '✓ Đã xoá lịch trực ngày ' + date.split('-').reverse().join('/')
      : `✓ Lưu ${n} ca trực${rate == null ? ' (⚠ ngày chưa có quy chế Kho → 0đ)' : ' · ' + fmt(n * rate) + 'đ'}`,
      rate == null && n ? 'warn' : 'success');
    rerender();
  }
  function _clear(date) {
    if (!confirm('Xoá toàn bộ lịch trực ngày này?')) return;
    const r = getRoster(); delete r[date]; saveRoster(r);
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
    getRoster, saveRoster, dayOf, khoStaff, peopleCount, migrateLegacy,
    bonusEntries, bonusEntriesMonth, monthStats, dutyDaysIn, rateOn,
    renderDutyTab, openDay, rerender,
    setMonth: m => { _month = m; },
    MAX_PER_DAY,
    _sync, _save, _clear,
  };
  console.log('[NSTT] ✓ Kho duty roster ready');
})();
