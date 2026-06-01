/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Kế toán (Full CRUD)
   ========================================================= */
(function () {
  const INITIAL_ENTRIES = [
    { no:'PT-526045', date:'16/05/2026', type:'in', party:'KH004 · Shop Mẹ&Bé', desc:'COD đơn NSTT-526045', account:'Tiền mặt', amount:1_250_000, staff:'Trần Lan' },
    { no:'PT-526044', date:'16/05/2026', type:'in', party:'KH017 · Tech 88', desc:'COD đơn NSTT-526044', account:'Vietcombank', amount:8_400_000, staff:'Trần Lan' },
    { no:'PC-526010', date:'16/05/2026', type:'out', party:'Petrolimex Cầu Giấy', desc:'Đổ xăng xe 29C-99988', account:'Tiền mặt', amount:2_200_000, staff:'Phạm Hùng' },
    { no:'PT-526040', date:'15/05/2026', type:'in', party:'KH025 · Chị Hoa', desc:'COD đơn NSTT-526040', account:'MB Bank', amount:380_000, staff:'Hoàng Mai' },
    { no:'PC-526009', date:'15/05/2026', type:'out', party:'Garage Long Biên', desc:'Bảo dưỡng xe 29C-33344', account:'Vietcombank', amount:8_400_000, staff:'Tuấn Tú' },
    { no:'PT-526033', date:'15/05/2026', type:'in', party:'KH001 · An Phát', desc:'TT công nợ T4', account:'Vietcombank', amount:48_500_000, staff:'Trần Lan' },
    { no:'PC-526008', date:'14/05/2026', type:'out', party:'NV Nguyễn Văn A', desc:'Lương tuần 1+2 T5', account:'Tiền mặt', amount:5_200_000, staff:'Tuấn Tú' },
    { no:'PT-526012', date:'14/05/2026', type:'in', party:'KH014 · Chị Mai', desc:'Cước HN→HP', account:'Tiền mặt', amount:350_000, staff:'Hoàng Mai' },
    { no:'PC-526006', date:'14/05/2026', type:'out', party:'Văn phòng phẩm Hồng Hà', desc:'Mua giấy in + hóa đơn', account:'Tiền mặt', amount:450_000, staff:'Hoàng Mai' },
    { no:'PT-525988', date:'13/05/2026', type:'in', party:'KH002 · HN Foods', desc:'TT đơn NSTT-525972', account:'Vietcombank', amount:3_200_000, staff:'Tuấn Tú' },
    { no:'PC-526005', date:'13/05/2026', type:'out', party:'Bảo hiểm PVI', desc:'Phí BH xe 29C-99988', account:'Vietcombank', amount:14_800_000, staff:'Tuấn Tú' },
    { no:'PT-525981', date:'12/05/2026', type:'in', party:'KH012 · Chị Hằng', desc:'Cước 8 đơn nội thành', account:'MB Bank', amount:640_000, staff:'Hoàng Mai' },
  ];

  const INITIAL_ACCOUNTS = [
    { id:'A1', kind:'cash', name:'Quỹ tiền mặt văn phòng', detail:'Tủ sắt phòng Kế toán', balance:42_000_000, keeper:'Lê Thị Phương', active:true },
    { id:'A2', kind:'bank', name:'Vietcombank · 1021xxxxxx', detail:'CN Cầu Giấy', balance:128_400_000, keeper:'Tuấn Tú', active:true },
    { id:'A3', kind:'bank', name:'MB Bank · 0312xxxxxx', detail:'CN Hà Nội', balance:42_800_000, keeper:'Tuấn Tú', active:true },
    { id:'A4', kind:'bank', name:'Techcombank · 1903xxxxxx', detail:'TK dự phòng', balance:14_800_000, keeper:'Tuấn Tú', active:true },
    { id:'A5', kind:'ewallet', name:'MoMo · 0903 111 222', detail:'Thu COD KH nhỏ', balance:1_200_000, keeper:'Hoàng Mai', active:true },
    { id:'A6', kind:'ewallet', name:'ViettelPay · 0903 111 222', detail:'Dự phòng', balance:0, keeper:'Hoàng Mai', active:false },
  ];

  let entries = window.STORE.get('cashEntries', INITIAL_ENTRIES);
  let accounts = window.STORE.get('paymentAccounts', INITIAL_ACCOUNTS);

  function render() {
    entries = window.STORE.get('cashEntries', INITIAL_ENTRIES);
    /* === KPI cards động từ sổ quỹ thật === */
    (function updateAccKpis() {
      const ins = entries.filter(e => e.type === 'in');
      const outs = entries.filter(e => e.type === 'out');
      const sumIn = ins.reduce((s, e) => s + (+e.amount || 0), 0);
      const sumOut = outs.reduce((s, e) => s + (+e.amount || 0), 0);
      const cash = entries.filter(e => (e.account || '').toLowerCase().includes('tiền mặt'))
        .reduce((s, e) => s + (e.type === 'in' ? 1 : -1) * (+e.amount || 0), 0);
      const f = window.fmtShort || (n => n);
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set('kpiAccIn', f(sumIn) + ' ₫');
      set('kpiAccOut', f(sumOut) + ' ₫');
      set('kpiAccNet', f(sumIn - sumOut) + ' ₫');
      set('kpiAccCash', f(cash) + ' ₫');
      set('kpiAccCount', entries.length);
    })();
    const q = document.getElementById('qSearch').value.trim().toLowerCase();
    const t = document.getElementById('fType').value;
    const a = document.getElementById('fAccount').value;
    const rows = entries.filter(e =>
      (!q || [e.no, e.party, e.desc].some(x => x.toLowerCase().includes(q))) &&
      (!t || e.type === t) &&
      (!a || e.account === a)
    );
    document.getElementById('cashTbody').innerHTML = rows.map(e => `
      <tr style="cursor:pointer" data-no="${e.no}">
        <td><b>${e.no}</b></td>
        <td style="font-size:12px;color:var(--muted)">${e.date}</td>
        <td><span class="status-pill ${e.type==='in'?'st-delivered':'st-cancelled'}">${e.type==='in'?'+ Thu':'- Chi'}</span></td>
        <td>${e.party}</td>
        <td style="font-size:12px">${e.desc}</td>
        <td><span class="staff-pill">${e.account}</span></td>
        <td class="num type-${e.type}"><b>${e.type==='in'?'+':'-'}${window.fmt(e.amount)}</b></td>
        <td style="font-size:12px;color:var(--muted)">${e.staff}</td>
      </tr>
    `).join('') || `<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--muted)">Không có phiếu nào.</td></tr>`;

    document.querySelectorAll('#cashTbody tr[data-no]').forEach(tr => {
      tr.onclick = () => window.openCashEntryDetail(tr.dataset.no);
    });
  }

  /* === Modal chi tiết phiếu thu / chi — có in & xóa === */
  window.openCashEntryDetail = function(no) {
    const e = entries.find(x => x.no === no);
    if (!e) { window.toast('Không tìm thấy phiếu ' + no, 'warn'); return; }
    const isThu = e.type === 'in';
    const color = isThu ? 'var(--ok)' : 'var(--danger)';
    const bg = isThu ? 'var(--ok-bg)' : 'var(--danger-bg)';
    const tit = isThu ? '+ Phiếu Thu' : '- Phiếu Chi';
    window.openModal(`${isThu?'📥':'📤'} Chi tiết ${e.no}`, `
      <div style="background:${bg};color:${color};padding:14px;border-radius:10px;margin-bottom:14px;text-align:center">
        <div style="font-size:11.5px;letter-spacing:1px;font-weight:700;opacity:0.85">${tit.toUpperCase()}</div>
        <div style="font-size:26px;font-weight:800;margin-top:4px">${isThu?'+':'-'}${window.fmt(e.amount)} ₫</div>
      </div>
      <table class="mini-table">
        <tr><td style="width:130px">Số phiếu</td><td><b style="font-family:ui-monospace,monospace">${e.no}</b></td></tr>
        <tr><td>Ngày</td><td>${e.date}</td></tr>
        <tr><td>${isThu?'Người nộp':'Người nhận'}</td><td><b>${e.party}</b></td></tr>
        <tr><td>Tài khoản</td><td><span class="staff-pill">${e.account}</span></td></tr>
        <tr><td>Diễn giải</td><td>${e.desc || '—'}</td></tr>
        <tr><td>NV lập phiếu</td><td>${e.staff || '—'}</td></tr>
      </table>
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>
               <button class="btn btn-ghost" onclick="window.printCashEntry('${no}')" title="In phiếu ra giấy / PDF">🖨 In phiếu</button>
               <button class="btn btn-ghost" onclick="window.deleteCashEntry('${no}')" style="color:var(--danger)" title="Xóa phiếu (không thể hoàn tác)">🗑 Xóa phiếu</button>`,
      width: '480px',
    });
  };

  window.deleteCashEntry = function(no) {
    window.confirmDelete && window.confirmDelete('Xóa phiếu ' + no + '?', () => {
      window.STORE.remove('cashEntries', no);
      window.closeModal();
      window.toast('Đã xóa phiếu ' + no, 'danger');
    });
  };

  /* In phiếu thu/chi đơn giản */
  window.printCashEntry = function(no) {
    const e = entries.find(x => x.no === no);
    if (!e) return;
    const isThu = e.type === 'in';
    const comp = window.STORE.get('companyInfo', { name:'Nông Sản Tuấn Tú Hà Nội', address:'36/147A Tân Mai, Hoàng Mai, Hà Nội', tax:'0110302211' });
    const w = window.open('', '_blank', 'width=700,height=900');
    if (!w) { window.toast('Bật popup cho domain để in', 'warn'); return; }
    const FAV = window.NSTT_FAVICON_DATAURL || '';
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${isThu?'Phiếu Thu':'Phiếu Chi'} ${e.no}</title>${FAV ? `<link rel="icon" type="image/svg+xml" href="${FAV}">` : ''}
      <style>body{font-family:'Times New Roman',serif;max-width:600px;margin:30px auto;padding:20px;font-size:13.5px;color:#000}
        h1{text-align:center;font-size:22px;color:${isThu?'#15803D':'#B91C1C'};margin:14px 0;letter-spacing:1px}
        .h{text-align:center;font-size:11.5px;margin-bottom:10px}
        .h b{font-size:13px}
        .meta{margin:10px 0;font-size:12.5px}
        .row{display:flex;border-bottom:1px dotted #999;padding:6px 0;gap:14px}
        .row .lab{width:160px;font-weight:600;color:#555}
        .row .val{flex:1;font-weight:600;color:#000}
        .amt{margin:18px 0;padding:14px;background:#FEF3C7;border:2px solid #1B5E20;border-radius:8px;text-align:center}
        .amt .lab{font-size:11.5px;color:#444}
        .amt .val{font-size:24px;font-weight:800;color:${isThu?'#15803D':'#B91C1C'};margin-top:4px}
        .sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:50px;text-align:center;font-size:12.5px}
        .sign .role{font-weight:700}
        .sign .ghi{font-style:italic;color:#666;font-size:11px;padding-bottom:55px}
        @media print{body{margin:0}.noprint{display:none}}
      </style></head><body>
      <div class="h"><b>${comp.name}</b><br>${comp.address}<br>MST: ${comp.tax}</div>
      <h1>${isThu?'PHIẾU THU':'PHIẾU CHI'}</h1>
      <div class="meta">
        <div class="row"><div class="lab">Số phiếu:</div><div class="val">${e.no}</div></div>
        <div class="row"><div class="lab">Ngày:</div><div class="val">${e.date}</div></div>
        <div class="row"><div class="lab">${isThu?'Người nộp:':'Người nhận:'}</div><div class="val">${e.party}</div></div>
        <div class="row"><div class="lab">Tài khoản:</div><div class="val">${e.account}</div></div>
        <div class="row"><div class="lab">Diễn giải:</div><div class="val">${e.desc||'—'}</div></div>
      </div>
      <div class="amt"><div class="lab">${isThu?'Số tiền THU':'Số tiền CHI'} (VNĐ)</div><div class="val">${isThu?'+':'-'}${window.opener.fmt(e.amount)} ₫</div>
        <div style="font-style:italic;font-size:11.5px;margin-top:6px;color:#333">Bằng chữ: ${window.opener.numberToWords ? window.opener.numberToWords(e.amount) : ''}</div></div>
      <div class="sign">
        <div><div class="role">${isThu?'Người nộp tiền':'Người nhận tiền'}</div><div class="ghi">(Ký, ghi rõ họ tên)</div></div>
        <div><div class="role">Kế toán</div><div class="ghi">(Ký, ghi rõ họ tên)</div><div>${e.staff||''}</div></div>
        <div><div class="role">Giám đốc</div><div class="ghi">(Ký, đóng dấu)</div></div>
      </div>
      <div class="noprint" style="margin-top:30px;text-align:center"><button onclick="window.print()" style="background:#1B5E20;color:#fff;border:0;padding:10px 24px;border-radius:8px;cursor:pointer;font-weight:700">🖨 In</button>
        <button onclick="window.close()" style="margin-left:8px;background:#fff;color:#475569;border:1px solid #CBD5E1;padding:10px 24px;border-radius:8px;cursor:pointer">Đóng</button></div>
      <script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script>
    </body></html>`);
    w.document.close();
    if (window.audit) window.audit.log('cash.print', `In ${isThu?'phiếu thu':'phiếu chi'} ${e.no}`);
  };

  /* === Form phiếu thu / chi === */
  function buildForm(type, no) {
    const activeAccounts = accounts.filter(a => a.active);
    const accOpts = activeAccounts.map(a => `<option>${a.name}</option>`).join('');
    return `
      <div class="form-row">
        <div><label>Ngày *</label><input id="pDate" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div><label>Số phiếu</label><input id="pNo" value="${no}" readonly style="background:#FAFAFB"></div>
      </div>
      <div class="form-row">
        <div><label>${type==='in'?'Người nộp':'Người nhận'} *</label><input id="pParty" placeholder="${type==='in'?'KH / NV nộp tiền':'Đối tác / NV nhận'}"></div>
        <div><label>Tài khoản *</label><select id="pAccount">${accOpts}</select></div>
      </div>
      <div class="form-row">
        <div><label>Số tiền (₫) *</label><input id="pAmount" type="number" placeholder="0"></div>
        <div><label>Đơn liên quan</label><input id="pRef" placeholder="NSTT-XXXXXX (tùy chọn)"></div>
      </div>
      <div class="form-row wide"><label>Diễn giải</label><textarea id="pDesc" rows="2" placeholder="${type==='in'?'COD đơn / TT công nợ / Nạp quỹ...':'Đổ xăng / Bảo dưỡng / Lương / Văn phòng...'}"></textarea></div>
    `;
  }
  window.formThu = () => buildForm('in', 'PT-' + nextPNo('PT'));
  window.formChi = () => buildForm('out', 'PC-' + nextPNo('PC'));
  function nextPNo(prefix) {
    const filtered = entries.filter(e => e.no.startsWith(prefix));
    const max = filtered.reduce((m, e) => {
      const n = parseInt(e.no.split('-')[1], 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 526000);
    return max + 1;
  }
  window.footThu = () => `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
    <button class="btn btn-primary" onclick="window.submitPhieu('in')">💾 Lưu phiếu thu</button>`;
  window.footChi = () => `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
    <button class="btn btn-navy" onclick="window.submitPhieu('out')">💾 Lưu phiếu chi</button>`;

  window.submitPhieu = function(type) {
    const amount = parseInt(window.formVal('#pAmount'), 10) || 0;
    const party = window.formVal('#pParty');
    if (!amount) { window.toast('Nhập số tiền', 'warn'); return; }
    if (!party)  { window.toast('Nhập đối tượng', 'warn'); return; }

    const dateInput = window.formVal('#pDate');
    const date = dateInput ? new Date(dateInput).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN');
    const newEntry = {
      no: window.formVal('#pNo'),
      date, type, party,
      desc: window.formVal('#pDesc') || (type==='in'?'Thu tiền':'Chi tiền'),
      account: window.formVal('#pAccount'),
      amount,
      staff: window.CURRENT_USER.name,
    };
    window.STORE.add('cashEntries', newEntry);

    /* Cập nhật số dư account */
    const acc = accounts.find(a => a.name === newEntry.account);
    if (acc) {
      const newBalance = acc.balance + (type === 'in' ? amount : -amount);
      window.STORE.update('paymentAccounts', acc.id, { balance: newBalance });
      accounts = window.STORE.get('paymentAccounts');
    }
    window.closeModal();
    window.toast(`✓ Đã ${type==='in'?'thu':'chi'} ${window.fmt(amount)} ₫`, 'success');
  };

  /* ============ Cài đặt tài khoản thanh toán ============ */
  window.openAccountSettings = function() {
    accounts = window.STORE.get('paymentAccounts', INITIAL_ACCOUNTS);
    const kindIcon = { cash:'💵', bank:'🏦', ewallet:'📱' };
    const kindLabel = { cash:'Tiền mặt', bank:'Ngân hàng', ewallet:'Ví điện tử' };
    const total = accounts.filter(a => a.active).reduce((s, a) => s + a.balance, 0);
    const activeCount = accounts.filter(a => a.active).length;
    const rows = accounts.map(a => `
      <div class="acc-card-row" data-id="${a.id}" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--line);border-radius:8px;margin-bottom:8px;${a.active?'':'opacity:0.55'}">
        <div style="width:40px;height:40px;border-radius:8px;background:var(--bg);display:grid;place-items:center;font-size:20px">${kindIcon[a.kind]}</div>
        <div style="flex:1;line-height:1.3">
          <div style="font-weight:700">${a.name}</div>
          <div style="font-size:11.5px;color:var(--muted)">${a.detail} · Người giữ: ${a.keeper}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800;color:var(--navy);font-variant-numeric:tabular-nums">${window.fmt(a.balance)} ₫</div>
          <div style="font-size:11px;color:var(--muted)">${kindLabel[a.kind]}</div>
        </div>
        <label class="toggle"><input type="checkbox" ${a.active?'checked':''} data-toggle="${a.id}"><span class="slider"></span></label>
        <button class="btn btn-sm btn-ghost" data-edit="${a.id}">✏️</button>
        <button class="btn btn-sm btn-ghost" data-del="${a.id}" style="color:var(--danger)">🗑</button>
      </div>
    `).join('');

    window.openModal('⚙️ Cài đặt tài khoản thanh toán', `
      <div style="font-size:12px;color:var(--muted);margin-bottom:12px">
        Quản lý tất cả TK thu tiền. TK bị tắt không hiển thị trong dropdown phiếu thu/chi.
      </div>
      <div style="display:flex;gap:10px;margin-bottom:14px;padding:10px 12px;background:#FAFAFB;border-radius:8px">
        <div style="flex:1"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Tổng tài sản</div>
          <div style="font-size:18px;font-weight:800;color:var(--navy)">${window.fmtVND(total)}</div></div>
        <div style="flex:1"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:600">TK đang dùng</div>
          <div style="font-size:18px;font-weight:800;color:var(--ok)">${activeCount} / ${accounts.length}</div></div>
      </div>
      ${rows}
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn btn-navy" style="flex:1" onclick="window.openAddAccount('cash')">+ Tiền mặt</button>
        <button class="btn btn-navy" style="flex:1" onclick="window.openAddAccount('bank')">+ Ngân hàng</button>
        <button class="btn btn-navy" style="flex:1" onclick="window.openAddAccount('ewallet')">+ Ví điện tử</button>
      </div>
    `, {
      footer: `<button class="btn btn-primary" onclick="closeModal()">Đóng</button>`,
      width: '680px'
    });

    /* Bind toggles & edit/del */
    document.querySelectorAll('[data-toggle]').forEach(t => {
      t.onchange = () => {
        window.STORE.update('paymentAccounts', t.dataset.toggle, { active: t.checked });
        accounts = window.STORE.get('paymentAccounts');
        window.toast(t.checked ? 'Đã bật TK' : 'Đã tắt TK', 'info');
      };
    });
    document.querySelectorAll('[data-edit]').forEach(b => {
      b.onclick = () => {
        const a = accounts.find(x => x.id === b.dataset.edit);
        window.openAddAccount(a.kind, a);
      };
    });
    document.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => {
        const a = accounts.find(x => x.id === b.dataset.del);
        window.confirmDelete('Xóa TK ' + a.name + '?', () => {
          window.STORE.remove('paymentAccounts', b.dataset.del);
          window.toast('Đã xóa TK', 'danger');
          window.openAccountSettings();
        });
      };
    });
  };

  window.openAddAccount = function(kind, existing) {
    const kindLabel = { cash:'Tiền mặt', bank:'Ngân hàng', ewallet:'Ví điện tử' };
    const isEdit = !!existing;
    const a = existing || { kind, name:'', detail:'', balance:0, keeper:'', active:true };
    const nextId = 'A' + (accounts.length + 1);
    window.openModal((isEdit?'✏️ Sửa ':'+ Thêm ') + kindLabel[kind], `
      <div class="form-row wide"><label>Tên TK *</label>
        <input id="aName" value="${a.name}" placeholder="${kind==='cash'?'VD: Quỹ tiền mặt văn phòng':kind==='bank'?'VD: Vietcombank · 1021xxxxxx':'VD: MoMo · 0903xxx'}"></div>
      <div class="form-row wide"><label>Mô tả / Chi tiết</label>
        <input id="aDetail" value="${a.detail}" placeholder="${kind==='cash'?'Vị trí cất':kind==='bank'?'Chi nhánh':'Số điện thoại / tài khoản'}"></div>
      <div class="form-row">
        <div><label>Số dư hiện tại (₫)</label><input id="aBalance" type="number" value="${a.balance||0}"></div>
        <div><label>Người giữ / quản lý</label>
          <select id="aKeeper">
            <option ${a.keeper==='Tuấn Tú'?'selected':''}>Tuấn Tú</option>
            <option ${a.keeper==='Lê Thị Phương'?'selected':''}>Lê Thị Phương</option>
            <option ${a.keeper==='Trần Lan'?'selected':''}>Trần Lan</option>
            <option ${a.keeper==='Phạm Hùng'?'selected':''}>Phạm Hùng</option>
            <option ${a.keeper==='Hoàng Mai'?'selected':''}>Hoàng Mai</option>
          </select></div>
      </div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.openAccountSettings()">Hủy</button>
               <button class="btn btn-primary" onclick="window.submitAccount('${isEdit?a.id:nextId}','${kind}',${isEdit})">💾 Lưu</button>`
    });
  };

  window.submitAccount = function(id, kind, isEdit) {
    const data = {
      id, kind,
      name: window.formVal('#aName'),
      detail: window.formVal('#aDetail'),
      balance: parseInt(window.formVal('#aBalance'), 10) || 0,
      keeper: window.formVal('#aKeeper'),
      active: true,
    };
    if (!data.name) { window.toast('Nhập tên TK', 'warn'); return; }
    if (isEdit) window.STORE.update('paymentAccounts', id, data);
    else        window.STORE.add('paymentAccounts', data);
    accounts = window.STORE.get('paymentAccounts');
    window.toast('✓ Đã ' + (isEdit?'cập nhật':'thêm') + ' TK', 'success');
    window.openAccountSettings();
  };

  /* === LỊCH SỬ QUỸ — full list theo loại + KH === */
  window.openCashHistory = function () {
    const data = window.STORE.get('cashEntries', INITIAL_ENTRIES).slice();
    /* Tóm tắt */
    const totalIn = data.filter(e => e.type === 'in').reduce((s, e) => s + (e.amount || 0), 0);
    const totalOut = data.filter(e => e.type === 'out').reduce((s, e) => s + (e.amount || 0), 0);
    const html = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
        <div style="padding:10px 12px;background:#DCFCE7;border-radius:8px;border-left:3px solid var(--ok)">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">Tổng thu</div>
          <div style="font-size:18px;font-weight:800;color:var(--ok)">+${(totalIn).toLocaleString('vi-VN')} ₫</div>
        </div>
        <div style="padding:10px 12px;background:#FEE2E2;border-radius:8px;border-left:3px solid var(--danger)">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">Tổng chi</div>
          <div style="font-size:18px;font-weight:800;color:var(--danger)">-${(totalOut).toLocaleString('vi-VN')} ₫</div>
        </div>
        <div style="padding:10px 12px;background:#FAFAFB;border-radius:8px;border-left:3px solid var(--navy)">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">Số dư ròng</div>
          <div style="font-size:18px;font-weight:800;color:var(--navy)">${(totalIn - totalOut).toLocaleString('vi-VN')} ₫</div>
        </div>
      </div>
      <div style="margin-bottom:10px">
        <input id="histSearch" placeholder="🔍 Tìm số phiếu / đối tượng..." style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:7px;font-size:13px">
      </div>
      <div style="max-height:480px;overflow-y:auto">
        <table class="mini-table" id="histTable" style="width:100%">
          <thead><tr><th>Ngày</th><th>Số phiếu</th><th>Loại</th><th>Đối tượng</th><th>Nội dung</th><th class="num">Số tiền</th><th>TK</th></tr></thead>
          <tbody id="histBody"></tbody>
        </table>
      </div>`;
    window.openModal('💵 Lịch sử quỹ — Toàn bộ phiếu thu/chi (' + data.length + ' phiếu)', html, {
      footer: `<button class="btn btn-ghost" onclick="window.exportCashbookCsv()">⬇ Xuất CSV</button>
               <button class="btn btn-primary" onclick="window.closeModal()">Đóng</button>`,
      width: '900px',
    });
    function renderHistRows(q) {
      const filt = data.filter(e => !q || [e.no, e.party, e.desc].some(x => (x||'').toLowerCase().includes(q.toLowerCase())));
      document.getElementById('histBody').innerHTML = filt.map(e => `<tr>
        <td style="font-size:12px">${e.date || ''}</td>
        <td><b>${e.no || ''}</b></td>
        <td>${e.type === 'in' ? '<span style="color:var(--ok);font-weight:600">+ Thu</span>' : '<span style="color:var(--danger);font-weight:600">- Chi</span>'}</td>
        <td>${e.party || ''}</td>
        <td style="font-size:12px;color:var(--muted);max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(e.desc||'').replace(/"/g,'&quot;')}">${e.desc || ''}</td>
        <td class="num" style="font-weight:700;color:${e.type==='in'?'var(--ok)':'var(--danger)'}">${e.type==='in'?'+':'-'}${(e.amount||0).toLocaleString('vi-VN')}</td>
        <td><span class="staff-pill" style="font-size:10px">${e.account || ''}</span></td>
      </tr>`).join('') || '<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--muted)">Không có phiếu nào khớp.</td></tr>';
    }
    renderHistRows('');
    document.getElementById('histSearch').addEventListener('input', e => renderHistRows(e.target.value));
  };

  /* === ĐỐI SOÁT NGÂN HÀNG === */
  window.openBankReconcile = function () {
    const accs = window.STORE.get('paymentAccounts', INITIAL_ACCOUNTS).filter(a => a.type === 'bank');
    if (!accs.length) { window.toast('Chưa có TK ngân hàng để đối soát', 'warn'); return; }
    const html = `
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:12px">
        Nhập số dư thực tế từ sao kê ngân hàng. App so với số dư trong sổ + tạo phiếu điều chỉnh nếu chênh lệch.
      </div>
      <table class="mini-table" style="width:100%">
        <thead><tr><th>Tài khoản</th><th class="num">Số dư sổ (₫)</th><th class="num">Số dư thực tế (₫)</th><th class="num">Chênh lệch</th></tr></thead>
        <tbody>
          ${accs.map(a => `<tr data-acc="${a.id}">
            <td><b>${a.name}</b><div style="font-size:11px;color:var(--muted)">${a.no || ''}</div></td>
            <td class="num" id="bal_${a.id}" data-bal="${a.balance||0}">${(a.balance||0).toLocaleString('vi-VN')}</td>
            <td class="num"><input type="number" class="bnk-actual" data-acc="${a.id}" placeholder="${(a.balance||0).toLocaleString('vi-VN')}" style="width:140px;text-align:right;padding:6px 8px;border:1px solid var(--line);border-radius:6px"></td>
            <td class="num" id="diff_${a.id}" style="font-weight:700">—</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="margin-top:12px;padding:10px 12px;background:#FEF3C7;border-radius:6px;font-size:11.5px;color:var(--warn)">
        💡 Nếu chênh lệch ≠ 0 → app tạo phiếu điều chỉnh "Đối soát NH ${new Date().toLocaleDateString('vi-VN')}" để cập nhật số dư.
      </div>`;
    window.openModal('🔍 Đối soát ngân hàng', html, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window.applyBankReconcile()">💾 Ghi nhận đối soát</button>`,
      width: '760px',
    });
    document.querySelectorAll('.bnk-actual').forEach(inp => {
      inp.addEventListener('input', () => {
        const id = inp.dataset.acc;
        const bal = parseInt(document.getElementById('bal_' + id).dataset.bal, 10);
        const actual = parseInt(inp.value, 10) || 0;
        const diff = actual - bal;
        const cell = document.getElementById('diff_' + id);
        cell.textContent = (diff > 0 ? '+' : '') + diff.toLocaleString('vi-VN');
        cell.style.color = diff === 0 ? 'var(--muted)' : (diff > 0 ? 'var(--ok)' : 'var(--danger)');
      });
    });
  };

  window.applyBankReconcile = function () {
    const accs = window.STORE.get('paymentAccounts', INITIAL_ACCOUNTS);
    let entries = window.STORE.get('cashEntries', INITIAL_ENTRIES).slice();
    let nextNo = entries.length + 1;
    let changes = 0;
    document.querySelectorAll('.bnk-actual').forEach(inp => {
      const id = inp.dataset.acc;
      const actual = parseInt(inp.value, 10);
      if (isNaN(actual)) return;
      const acc = accs.find(a => a.id === id); if (!acc) return;
      const bal = acc.balance || 0;
      const diff = actual - bal;
      if (diff === 0) return;
      const isPlus = diff > 0;
      const entry = {
        id: 'CE' + Date.now() + Math.random().toString(36).slice(2, 4),
        no: 'PT' + String(nextNo++).padStart(5, '0'),
        date: new Date().toLocaleDateString('vi-VN'),
        type: isPlus ? 'in' : 'out',
        party: 'Đối soát ngân hàng',
        desc: `Đối soát ${acc.name}: sổ ${bal.toLocaleString('vi-VN')} → thực tế ${actual.toLocaleString('vi-VN')}`,
        amount: Math.abs(diff),
        account: acc.name,
        staff: (window.CURRENT_USER && window.CURRENT_USER.name) || 'Tôi',
      };
      entries.unshift(entry);
      window.STORE.update('paymentAccounts', id, { balance: actual });
      changes++;
    });
    if (!changes) { window.toast('Không có thay đổi để đối soát', 'info'); window.closeModal(); return; }
    window.STORE.set('cashEntries', entries);
    window.closeModal();
    window.toast(`✓ Đã đối soát ${changes} TK + tạo ${changes} phiếu điều chỉnh`, 'success');
  };

  /* === Export sổ quỹ ra CSV === */
  window.exportCashbookCsv = function () {
    const data = window.STORE.get('cashEntries', INITIAL_ENTRIES);
    const rows = [['Ngày','Số phiếu','Loại','Đối tượng','Nội dung','Số tiền (₫)','Tài khoản','NV ghi sổ']];
    data.forEach(e => rows.push([
      e.date || '', e.no || '',
      e.type === 'in' ? 'Thu' : 'Chi',
      e.party || '', e.desc || '',
      (e.type === 'in' ? '+' : '-') + (e.amount || 0),
      e.account || '', e.staff || '',
    ]));
    const csv = rows.map(r => r.map(x => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'SoQuy-NSTT-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    window.toast('⬇ Đã xuất ' + data.length + ' phiếu (CSV mở bằng Excel)', 'success');
  };

  window.STORE.subscribe('cashEntries', render);
  window.renderAppShell('accounting', 'Kế toán');
  ['qSearch','fType','fAccount','fFrom','fTo'].forEach(id => document.getElementById(id)?.addEventListener('input', render));
  render();
})();
