/* =========================================================
   Suppliers (Nhà cung cấp) — CRUD + công nợ NCC + lịch sử nhập
   ========================================================= */
(function () {
  function getSup() { return window.STORE.get('suppliers', window.SUPPLIERS || []) || []; }
  function getPur() { return window.STORE.get('purchases', window.PURCHASES || []) || []; }
  const CATS = { 'rau-ta':'Rau ta', 'rau-dalat':'Rau Đà Lạt', 'nam':'Nấm',
                 'rau-vung-mien':'Rau vùng miền', 'rau-gia-vi':'Rau gia vị', 'hai-san':'Hải sản' };

  function stars(r) {
    const full = Math.floor(r);
    const half = (r - full) >= 0.5;
    let s = '';
    for (let i = 0; i < full; i++) s += '★';
    if (half) s += '✬';
    while (s.length < 5) s += '☆';
    return s.slice(0, 5);
  }

  function renderKpis() {
    const list = getSup();
    const active = list.filter(s => s.active).length;
    const totalDebt = list.reduce((s, x) => s + (x.debt || 0), 0);
    const totalSpend = list.reduce((s, x) => s + (x.totalSpend || 0), 0);
    const overdue = list.filter(s => s.debt > 0 && s.paymentTerm !== 'COD').length;
    const wrap = document.getElementById('supKpis');
    wrap.innerHTML = `
      <div class="ik-kpi" style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">Đang hợp tác ${window.helpTip('NCC bạn đang lấy hàng định kỳ.')}</div><div style="font-size:24px;font-weight:800;color:var(--navy);margin-top:4px">${active}/${list.length}</div></div>
      <div class="ik-kpi" style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">💸 Công nợ phải trả ${window.helpTip('Tổng tiền hàng đã nhập nhưng chưa thanh toán NCC. Càng cao càng "kẹt" vốn — nên thanh toán dần.')}</div><div style="font-size:24px;font-weight:800;color:#DC2626;margin-top:4px">${window.fmtShort(totalDebt)}</div><div style="font-size:11.5px;color:var(--muted)">${overdue} NCC đang nợ</div></div>
      <div class="ik-kpi" style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">📊 Tổng chi NCC (lifetime) ${window.helpTip('Tổng tiền đã chi cho tất cả NCC từ khi tạo hệ thống đến nay.')}</div><div style="font-size:24px;font-weight:800;color:var(--ok);margin-top:4px">${window.fmtShort(totalSpend)}</div></div>
      <div class="ik-kpi" style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">⭐ NCC top ${window.helpTip('NCC có lifetime spend cao nhất — đối tác chiến lược.')}</div><div style="font-size:14px;font-weight:700;color:var(--navy);margin-top:4px;line-height:1.3">${list.slice().sort((a,b)=>(b.totalSpend||0)-(a.totalSpend||0))[0]?.name || '—'}</div></div>
    `;
  }

  function render() {
    renderKpis();
    const list = getSup();
    const q = (document.getElementById('supQ').value || '').toLowerCase();
    const cat = document.getElementById('supCat').value;
    const st = document.getElementById('supStatus').value;
    let rows = list;
    if (q) rows = rows.filter(s => (s.name+' '+s.contact+' '+s.phone+' '+s.id).toLowerCase().includes(q));
    if (cat) rows = rows.filter(s => (s.category||[]).includes(cat));
    if (st === 'active') rows = rows.filter(s => s.active);
    if (st === 'inactive') rows = rows.filter(s => !s.active);

    const host = document.getElementById('supList');
    if (!rows.length) {
      host.innerHTML = `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:40px;text-align:center;color:var(--muted)">Không có NCC nào khớp bộ lọc.</div>`;
      return;
    }
    const pur = getPur();
    host.innerHTML = rows.map(s => {
      const numPur = pur.filter(p => p.supplierId === s.id).length;
      /* Hiển thị SẢN PHẨM cung cấp (ưu tiên) — fallback nhóm hàng cũ */
      const prodList = Array.isArray(s.products) ? s.products : [];
      const cats = prodList.length
        ? prodList.slice(0, 3).map(p => `<span class="tag" style="background:#F0FDF4;color:#15803D">${p.name}</span>`).join(' ') + (prodList.length > 3 ? ` <span class="tag" style="background:#F1F5F9;color:#64748B">+${prodList.length - 3} SP</span>` : '')
        : (s.category||[]).map(c => `<span class="tag" style="background:#F0FDF4;color:#15803D">${CATS[c]||c}</span>`).join(' ');
      const termClr = { 'COD':'#16A34A', 'NET 7':'#0EA5E9', 'NET 14':'#A16207', 'NET 30':'#DC2626' };
      const empty = '<span style="color:var(--muted);opacity:.55;font-style:italic">chưa có</span>';
      const has = v => v && String(v).trim() && String(v).trim().toLowerCase() !== 'null';
      return `<div class="sup-card" data-id="${s.id}" onclick="window.openSupDrawer('${s.id}')" style="cursor:pointer">
        <div class="checkbox" onclick="event.stopPropagation();this.classList.toggle('on')" style="position:absolute;top:16px;left:14px;z-index:2"></div>
        <div class="sup-head">
          <div class="sup-av" style="background:${window.avatarColor(s.id)}">${window.initials(s.name)}</div>
          <div class="sup-info">
            <div class="n1"><span data-field="name" title="Click để sửa tên NCC">${has(s.name)?s.name:'(chưa đặt tên)'}</span>${s.active ? '' : '<span class="tag" style="background:#F1F5F9;color:#64748B;font-weight:600">Ngưng</span>'}</div>
            <div class="sup-meta">
              <span title="Người liên hệ">👤 <span data-field="contact" title="Click để sửa người liên hệ">${has(s.contact)?s.contact:empty}</span></span>
              <span title="Số điện thoại">📞 <span data-field="phone" title="Click để sửa SĐT">${has(s.phone)?s.phone:empty}</span></span>
              <span title="Địa chỉ">📍 <span data-field="address" title="Click để sửa địa chỉ">${has(s.address)?s.address:empty}</span></span>
            </div>
          </div>
          <div class="rating-stars" title="Đánh giá">${stars(s.rating)}</div>
        </div>
        <div class="sup-foot">
          <div class="sup-tags">${cats}
            <span class="tag" data-field="paymentTerm" title="Click để đổi điều khoản TT" style="background:${termClr[s.paymentTerm]||'#F1F5F9'}1f;color:${termClr[s.paymentTerm]||'#475569'};font-weight:700">${s.paymentTerm||'—'}</span>
          </div>
          <div class="sup-stat">
            <div class="v">${window.fmtShort(s.totalSpend)} ₫</div>
            ${s.debt > 0 ? `<div class="s" style="color:#DC2626;font-weight:700">Nợ ${window.fmtShort(s.debt)} ₫</div>` : `<div class="s" style="color:var(--ok)">✓ ${numPur} phiếu · đã TT</div>`}
          </div>
        </div>
      </div>`;
    }).join('');

    /* Bulk + Inline edit */
    if (!host.id) host.id = 'supList';

    if (window.attachBulkOps) {
      window.attachBulkOps({
        tableSelector: '#' + host.id,
        store: 'suppliers',
        label: 'NCC',
        actions: {
          changeStatus: {
            label: '🔄 Đổi điều khoản',
            field: 'paymentTerm',
            options: ['COD', 'NET 7', 'NET 14', 'NET 30']
          }
        }
      });
    }

    /* Inline edit (click cell = sửa nhanh) */
    if (window.attachInlineEdit) {
      window.attachInlineEdit('#' + host.id, {
        store: 'suppliers',
        fields: {
          name:        { type: 'text', format: (v, row) => `${v} ${row?.active ? '' : '<span style="color:var(--muted);font-weight:500;font-size:11px">· Ngưng</span>'}` },
          contact:     { type: 'text' },
          phone:       { type: 'text' },
          address:     { type: 'text' },
          paymentTerm: { type: 'select',
                         options: () => ['COD', 'NET 7', 'NET 14', 'NET 30'],
                         format: v => v },
        }
      });
    }
  }

  window.openSupDrawer = function (id) {
    const s = getSup().find(x => x.id === id);
    if (!s) return;
    const pur = getPur().filter(p => p.supplierId === id);
    const drawer = document.getElementById('drawer');
    const dc = document.getElementById('drawerContent');
    dc.innerHTML = `
      <div style="background:linear-gradient(135deg,${window.avatarColor(s.id)} 0%,#1B5E20 100%);color:#fff;padding:20px;position:relative">
        <button onclick="closeDrawer()" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.15);border:none;color:#fff;width:30px;height:30px;border-radius:6px;cursor:pointer">✕</button>
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:54px;height:54px;border-radius:11px;background:rgba(255,255,255,0.2);display:grid;place-items:center;font-size:22px;font-weight:800">${window.initials(s.name)}</div>
          <div>
            <h2 style="margin:0;font-size:18px">${s.name}</h2>
            <div style="opacity:0.85;font-size:12.5px;margin-top:2px">${s.id} · ${s.contact} · ${s.phone}</div>
          </div>
        </div>
      </div>
      <div style="padding:18px 20px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
          <div style="padding:10px;background:#F0FDF4;border-radius:8px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">Lifetime Spend</div><div style="font-size:16px;font-weight:800;color:var(--ok)">${window.fmt(s.totalSpend)} ₫</div></div>
          <div style="padding:10px;background:${s.debt>0?'#FEE2E2':'#F0FDF4'};border-radius:8px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">Công nợ phải trả ${window.helpTip('Tiền bạn còn nợ NCC này (chưa thanh toán phiếu nhập NET).')}</div><div style="font-size:16px;font-weight:800;color:${s.debt>0?'#DC2626':'var(--ok)'}">${s.debt ? window.fmt(s.debt) + ' ₫' : '— Hết nợ'}</div></div>
        </div>

        <h3 style="margin:14px 0 8px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">📋 Thông tin chi tiết</h3>
        <div style="background:#FAFBFC;padding:12px;border-radius:8px;font-size:13px;line-height:1.7">
          <div><b>Địa chỉ:</b> ${s.address}</div>
          <div><b>Điều khoản TT:</b> <span class="tag" style="background:#DBEAFE;color:#1E40AF">${s.paymentTerm}</span> ${window.helpTip('COD = trả ngay khi nhận hàng. NET X = thanh toán trong X ngày.')}</div>
          <div><b>Đánh giá:</b> <span class="rating-stars">${stars(s.rating)}</span> ${s.rating}/5</div>
          <div><b>Ghi chú:</b> ${s.note || '—'}</div>
        </div>

        <h3 style="margin:18px 0 8px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">🥬 Sản phẩm cung cấp (${(s.products||[]).length})</h3>
        <div style="background:#FAFBFC;border-radius:8px;overflow:hidden">
          ${(s.products||[]).length ? (s.products||[]).map(p => `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid #F1F5F9;font-size:12.5px">
            <span style="flex:1"><b>${p.name}</b></span>
            <span style="color:${p.price?'var(--navy)':'var(--muted)'};font-weight:${p.price?'700':'400'}">${p.price?window.fmt(p.price)+' ₫':'— chưa có giá nhập'}</span>
          </div>`).join('') : '<div style="padding:14px;text-align:center;color:var(--muted);font-size:12px">Chưa gán sản phẩm — bấm "✏️ Sửa NCC" để chọn SP cung cấp</div>'}
        </div>

        <h3 style="margin:18px 0 8px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">📦 Lịch sử nhập hàng (${pur.length})</h3>
        <div style="background:#FAFBFC;border-radius:8px;overflow:hidden">
          ${pur.length ? pur.map(p => `<a href="purchases.html?focus=${p.id}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #F1F5F9;text-decoration:none;color:inherit;font-size:12.5px">
            <div style="flex:1"><b>${p.id}</b><div style="font-size:11px;color:var(--muted)">${p.date} · ${(p.items||[]).length} mặt hàng · ${p.status==='received'?'✓ Đã nhận':'⏳ Đang chờ'}</div></div>
            <div style="font-weight:700;color:var(--navy)">${window.fmt(p.total)} ₫</div>
          </a>`).join('') : '<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px">Chưa có phiếu nhập nào</div>'}
        </div>

        <div style="display:flex;gap:8px;margin-top:18px">
          <button class="btn btn-ghost" style="flex:1" onclick="window.openSupModal('${s.id}')">✏️ Sửa NCC</button>
          <button class="btn btn-primary" style="flex:1" onclick="window.location.href='purchases.html?createForSup=${s.id}'">+ Tạo phiếu nhập</button>
        </div>
        ${s.debt > 0 ? `<button class="btn btn-ghost" style="width:100%;margin-top:8px;color:var(--ok)" onclick="window.paySupplier('${s.id}')">💰 Ghi thanh toán NCC ${window.helpTip('Mở phiếu chi để trả NCC này — số dư công nợ sẽ giảm tương ứng.')}</button>` : ''}
      </div>
    `;
    drawer.classList.add('open');
    document.getElementById('drawerBg').classList.add('open');
  };

  window.closeDrawer = function () {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawerBg').classList.remove('open');
  };

  window.openSupModal = function (id) {
    const s = id ? getSup().find(x => x.id === id) : { id:'NCC' + String(getSup().length+1).padStart(3,'0'),
      name:'', contact:'', phone:'', address:'', category:[], paymentTerm:'COD', debt:0, totalSpend:0, rating:4.5, note:'', active:true };
    const isEdit = !!id;
    const prods = window.STORE.get('products', window.PRODUCTS || []) || [];
    const esc = v => String(v == null ? '' : v).replace(/"/g, '&quot;');
    const normN = v => String(v || '').toLowerCase();
    window.openModal((isEdit?'✏️ Sửa':'+ Thêm') + ' Nhà cung cấp', `
      <div style="background:#EFF6FF;color:#1E40AF;padding:9px 12px;border-radius:7px;font-size:12px;margin-bottom:12px">
        💡 NCC là đối tác cung cấp đầu vào (rau/nấm/hải sản...). Sau khi tạo, vào tab "Phiếu nhập" để ghi nhận từng đợt lấy hàng.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label style="font-size:12px;color:var(--muted)">Mã NCC</label><input id="sf_id" value="${s.id}" ${isEdit?'disabled':''} style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"></div>
        <div><label style="font-size:12px;color:var(--muted)">Tên NCC *</label><input id="sf_name" value="${s.name}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"></div>
        <div><label style="font-size:12px;color:var(--muted)">Người liên hệ</label><input id="sf_contact" value="${s.contact}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"></div>
        <div><label style="font-size:12px;color:var(--muted)">SĐT</label><input id="sf_phone" value="${s.phone}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"></div>
        <div style="grid-column:span 2"><label style="font-size:12px;color:var(--muted)">Địa chỉ</label><input id="sf_addr" value="${s.address}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"></div>
        <div><label style="font-size:12px;color:var(--muted)">Điều khoản TT ${window.helpTip('COD=trả ngay · NET 7/14/30 = trả trong 7/14/30 ngày sau nhận hàng.')}</label><select id="sf_term" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"><option ${s.paymentTerm==='COD'?'selected':''}>COD</option><option ${s.paymentTerm==='NET 7'?'selected':''}>NET 7</option><option ${s.paymentTerm==='NET 14'?'selected':''}>NET 14</option><option ${s.paymentTerm==='NET 30'?'selected':''}>NET 30</option></select></div>
        <div><label style="font-size:12px;color:var(--muted)">Đánh giá (1-5)</label><input id="sf_rating" type="number" step="0.1" min="1" max="5" value="${s.rating}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"></div>
        <div style="grid-column:span 2"><label style="font-size:12px;color:var(--muted)">Sản phẩm cung cấp <span style="color:var(--navy);font-weight:600">(${prods.length} SP từ "Sản phẩm &amp; Giá")</span> ${window.helpTip('Danh sách này LẤY TRỰC TIẾP từ module Sản phẩm & Giá. Thêm/bớt SP ở đó thì danh sách này tự cập nhật. Tick SP + nhập giá nhập riêng nếu muốn.')}</label>
          <input id="sf_prodSearch" placeholder="🔍 Gõ tên SP để lọc nhanh..." oninput="window._supFilterProds(this.value)" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px;margin-top:4px">
          <div id="sf_prodList" style="max-height:210px;overflow:auto;border:1px solid var(--line);border-radius:6px;margin-top:6px;padding:4px">
            ${prods.length ? prods.map(p => {
              const sel = (s.products || []).find(x => x.id === p.id);
              return `<label class="sf-prow" data-name="${esc(normN(p.name))}" style="display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:5px;font-size:12.5px;cursor:pointer">
                <input type="checkbox" data-prod="${p.id}" data-pname="${esc(p.name)}" ${sel?'checked':''}>
                <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name} <span style="color:var(--muted);font-size:11px">/${p.unit||'kg'}</span></span>
                <input type="number" min="0" step="100" data-pprice="${p.id}" value="${sel&&sel.price?sel.price:''}" placeholder="giá nhập" onclick="event.stopPropagation()" style="width:96px;text-align:right;border:1px solid var(--line);border-radius:5px;padding:3px 6px;font-size:12px">
              </label>`;
            }).join('') : '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px">Chưa có sản phẩm nào trong danh mục. Vào "Sản phẩm & Giá" để thêm.</div>'}
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px">Tick SP mà NCC này cung cấp · nhập <b>giá nhập riêng</b> từng SP nếu có. <span id="sf_prodCount"></span></div>
        </div>
        <div style="grid-column:span 2"><label style="font-size:12px;color:var(--muted)">Ghi chú</label><textarea id="sf_note" rows="2" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px">${s.note||''}</textarea></div>
        <div style="grid-column:span 2"><label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" id="sf_active" ${s.active?'checked':''}> Đang hợp tác</label></div>
      </div>
    `, {
      footer:`<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
              <button class="btn btn-primary" onclick="window._supSave(${isEdit?'true':'false'})">${isEdit?'Lưu':'Thêm NCC'}</button>`,
      width:'640px'
    });
  };

  /* Lọc nhanh danh sách SP trong form NCC */
  window._supFilterProds = function (q) {
    const nq = (q || '').toLowerCase().trim();
    document.querySelectorAll('#sf_prodList .sf-prow').forEach(row => {
      row.style.display = (!nq || (row.dataset.name || '').includes(nq)) ? '' : 'none';
    });
  };

  window._supSave = function (isEdit) {
    /* Đọc sản phẩm NCC cung cấp + giá nhập riêng từng SP */
    const products = [...document.querySelectorAll('#sf_prodList input[data-prod]:checked')].map(cb => {
      const pid = cb.dataset.prod;
      const priceEl = document.querySelector('#sf_prodList [data-pprice="' + pid + '"]');
      return { id: pid, name: cb.dataset.pname, price: +(priceEl && priceEl.value) || 0 };
    });
    const obj = {
      id: document.getElementById('sf_id').value,
      name: document.getElementById('sf_name').value.trim(),
      contact: document.getElementById('sf_contact').value.trim(),
      phone: document.getElementById('sf_phone').value.trim(),
      address: document.getElementById('sf_addr').value.trim(),
      products: products,
      paymentTerm: document.getElementById('sf_term').value,
      rating: parseFloat(document.getElementById('sf_rating').value) || 5,
      note: document.getElementById('sf_note').value,
      active: document.getElementById('sf_active').checked,
    };
    if (!obj.name) { window.toast('Nhập tên NCC','warn'); return; }
    const list = getSup();
    if (isEdit) {
      const idx = list.findIndex(x => x.id === obj.id);
      if (idx < 0) {
        /* Không tìm thấy (id lệch) → thêm mới thay vì ghi list[-1] */
        obj.debt = obj.debt || 0; obj.totalSpend = obj.totalSpend || 0;
        list.push(obj);
      } else {
        list[idx] = { ...list[idx], ...obj };
      }
    } else {
      obj.debt = 0; obj.totalSpend = 0;
      list.push(obj);
    }
    window.STORE.set('suppliers', list);
    if (window.audit) window.audit.log(isEdit ? 'supplier.update' : 'supplier.create', obj.name);
    window.toast(isEdit ? '✓ Đã cập nhật NCC' : '✓ Đã thêm NCC', 'success');
    window.closeModal();
    if (typeof closeDrawer === 'function') closeDrawer();
    render();
  };

  window.paySupplier = function (id) {
    const s = getSup().find(x => x.id === id);
    if (!s || !s.debt) return;
    if (!confirm(`Ghi thanh toán ${window.fmt(s.debt)} ₫ cho ${s.name}?`)) return;
    const list = getSup();
    const idx = list.findIndex(x => x.id === id);
    list[idx].debt = 0;
    window.STORE.set('suppliers', list);
    /* Ghi phiếu chi */
    const cash = window.STORE.get('cashEntries', []) || [];
    cash.unshift({
      no: 'PC' + String(cash.length+1).padStart(4,'0'),
      date: '18/05/2026', type: 'expense', amount: s.debt,
      account: 'Tiền mặt', counterparty: s.name,
      description: 'Thanh toán công nợ NCC ' + s.id,
    });
    window.STORE.set('cashEntries', cash);
    if (window.audit) window.audit.log('supplier.pay', `Trả ${window.fmt(s.debt)} ₫ cho ${s.name}`);
    window.toast('✓ Đã ghi phiếu chi', 'success');
    window.closeDrawer();
  };

  window.exportSupCsv = function () {
    const list = getSup();
    const head = 'Mã,Tên,Liên hệ,SĐT,Địa chỉ,Nhóm hàng,Điều khoản,Nợ,Lifetime spend,Đánh giá,Ghi chú\n';
    const rows = list.map(s => [s.id, `"${s.name}"`, `"${s.contact}"`, s.phone, `"${s.address}"`, `"${(s.category||[]).join(';')}"`, s.paymentTerm, s.debt, s.totalSpend, s.rating, `"${(s.note||'').replace(/"/g,'""')}"`].join(','));
    const blob = new Blob(['﻿'+head+rows.join('\n')], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `nha-cung-cap-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  /* Init */
  window.renderAppShell('suppliers', 'Nhà cung cấp');
  document.getElementById('hbHost').innerHTML = window.helpBanner(
    '🏭 Module Nhà cung cấp làm gì?',
    'Quản lý danh bạ NCC đầu vào (HTX rau, trang trại, vựa hải sản...). Theo dõi <b>công nợ phải trả</b> + lịch sử nhập + đánh giá chất lượng. Khi tạo phiếu nhập, công nợ tự cộng — khi ghi thanh toán, công nợ tự trừ.',
    {id:'hb-sup', icon:'🏭'}
  );
  document.getElementById('hbTitle').innerHTML = window.helpTip('NCC khác Khách hàng: NCC là người bán cho mình, KH là người mua từ mình. Mã NCC bắt đầu bằng NCC.', {size:'lg'});

  ['supQ','supCat','supStatus'].forEach(id => document.getElementById(id).oninput = render);
  ['suppliers','purchases'].forEach(k => window.STORE.subscribe(k, render));
  /* Preload SẢN PHẨM (cho bộ chọn SP trong form NCC) — lấy từ module Sản phẩm & Giá.
     Gọi sớm để cloud sync xong trước khi user mở form. */
  window.STORE.get('products', window.PRODUCTS || []);
  window.STORE.subscribe('products', () => {});  /* giữ products cache cập nhật realtime */
  render();

  /* ============ BULK IMPORT NCC ============ */
  function _supSaveImported(records, src) {
    const list = getSup();
    let added = 0;
    records.forEach((r, i) => {
      if (!r.name || !String(r.name).trim()) return;
      list.push({
        id: 'NCC' + String(list.length + 1 + i).padStart(3, '0'),
        name: r.name, contact: r.contact || '', phone: r.phone || '',
        address: r.address || '',
        category: r.category ? String(r.category).split(/[,;]/).map(s=>s.trim()).filter(Boolean) : [],
        paymentTerm: r.paymentTerm || 'COD',
        debt: 0, totalSpend: 0,
        rating: parseFloat(r.rating) || 4.5,
        note: r.note || ('Import từ ' + src),
        active: true,
      });
      added++;
    });
    window.STORE.set('suppliers', list);
    window.audit && window.audit.log('supplier.bulkImport', `+${added} NCC từ ${src}`);
    window.toast(`✓ Đã thêm ${added} NCC từ ${src}`, 'success');
  }

  window.supImportExcel = function() {
    window.BulkImport.fromExcel({
      entityName: 'Nhà cung cấp',
      templateColumns: ['name','contact','phone','address','category','paymentTerm','rating','note'],
      templateRow: ['HTX Rau Vân Nội','Anh Hùng','0912000001','Đông Anh, Hà Nội','rau-ta','NET 7','4.8','NCC chính rau ta'],
      mapRow: (row, headers) => ({
        name:row[0], contact:row[1], phone:row[2], address:row[3],
        category:row[4], paymentTerm:row[5] || 'COD',
        rating:row[6], note:row[7]
      }),
      onParsed: (recs) => _supSaveImported(recs, 'Excel'),
    });
  };
  window.supImportAI = function() {
    window.BulkImport.fromImage({
      entityName: 'Nhà cung cấp',
      promptHint: 'danh thiếp NCC / list contact / màn hình chat với NCC',
      fields: ['name','contact','phone','address','category','paymentTerm','note'],
      aiTask: 'customer',
      onParsed: (recs) => _supSaveImported(recs, 'Ảnh AI'),
    });
  };
})();
