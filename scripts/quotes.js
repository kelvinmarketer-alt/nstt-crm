/* =========================================================
   Quotes (Báo giá) — tạo / gửi / convert sang Order
   ========================================================= */
(function () {
  function getQ() { return window.STORE.get('quotes', window.QUOTES || []) || []; }
  function getCusts() { return window.STORE.get('customers', window.CUSTOMERS || []) || []; }
  function getProds() { return window.STORE.get('products', window.PRODUCTS || []) || []; }
  const ST_LAB = { draft:'📋 Nháp', sent:'📤 Đã gửi', accepted:'✓ KH duyệt', rejected:'✕ KH từ chối', expired:'⏰ Hết hạn' };
  const ST_COLOR = { draft:'#475569', sent:'#1E40AF', accepted:'#15803D', rejected:'#B91C1C', expired:'#92400E' };
  const ST_BG    = { draft:'#F1F5F9', sent:'#DBEAFE', accepted:'#DCFCE7', rejected:'#FEE2E2', expired:'#FEF3C7' };

  function renderKpis() {
    const list = getQ();
    const sent = list.filter(q => q.status === 'sent').length;
    const accept = list.filter(q => q.status === 'accepted').length;
    const reject = list.filter(q => q.status === 'rejected' || q.status === 'expired').length;
    const tot = list.length;
    const rate = tot ? Math.round((accept / tot) * 100) : 0;
    document.getElementById('qtKpis').innerHTML = `
      <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">Tổng báo giá</div><div style="font-size:22px;font-weight:800;color:var(--navy);margin-top:4px">${tot}</div></div>
      <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">📤 Đã gửi chờ duyệt ${window.helpTip('Đã gửi cho KH, đang chờ phản hồi. Theo dõi sát để follow-up — gọi/Zalo lại sau 2-3 ngày.')}</div><div style="font-size:22px;font-weight:800;color:#1E40AF;margin-top:4px">${sent}</div></div>
      <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">✓ Đã duyệt</div><div style="font-size:22px;font-weight:800;color:var(--ok);margin-top:4px">${accept}</div></div>
      <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">✕ Từ chối / Hết hạn</div><div style="font-size:22px;font-weight:800;color:#DC2626;margin-top:4px">${reject}</div></div>
      <div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">🎯 Tỷ lệ chốt ${window.helpTip('= Số duyệt / Tổng báo giá. Trong ngành nông sản, tỷ lệ 30-50% là tốt.')}</div><div style="font-size:22px;font-weight:800;color:${rate>=30?'var(--ok)':'#D97706'};margin-top:4px">${rate}%</div></div>
    `;
  }

  function render() {
    renderKpis();
    const q = (document.getElementById('qtQ').value || '').toLowerCase();
    const st = document.getElementById('qtSt').value;
    let rows = getQ().slice().reverse();
    if (q) rows = rows.filter(x => (x.id+' '+x.custName).toLowerCase().includes(q));
    if (st) rows = rows.filter(x => x.status === st);
    const tb = document.getElementById('qtBody');
    if (!rows.length) { tb.innerHTML = `<tr><td colspan="8" style="padding:36px;text-align:center;color:var(--muted)">Không có báo giá.</td></tr>`; return; }
    tb.innerHTML = rows.map(q => `<tr>
      <td><b style="font-family:monospace">${q.id}</b></td>
      <td>${q.custName}</td>
      <td>${q.date}</td>
      <td>${q.validUntil}</td>
      <td class="num"><b>${window.fmt(q.total)}</b></td>
      <td><span class="staff-pill">${q.staffOwner||'—'}</span></td>
      <td>
        <select onchange="window.qtChangeStatus('${q.id}', this.value)"
          style="appearance:none;-webkit-appearance:none;border:1px solid ${ST_COLOR[q.status]};background:${ST_BG[q.status]};color:${ST_COLOR[q.status]};font-weight:700;font-size:11px;padding:3px 22px 3px 8px;border-radius:99px;cursor:pointer;background-image:url(&quot;data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(ST_COLOR[q.status])}' stroke-width='3'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e&quot;);background-repeat:no-repeat;background-position:right 6px center">
          ${Object.keys(ST_LAB).map(s => `<option value="${s}" ${s===q.status?'selected':''}>${ST_LAB[s]}</option>`).join('')}
        </select>
        ${q.approvedBy ? `<div style="font-size:10px;color:var(--muted);margin-top:3px">👤 ${q.approvedBy}${q.approvedAt ? ' · ' + q.approvedAt.split(' ')[1] : ''}</div>` : ''}
      </td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="window.openQtDrawer('${q.id}')" title="Xem chi tiết">👁</button>
        <button class="btn btn-ghost btn-sm" onclick="window.qtPrint('${q.id}')" title="In PDF báo giá">🖨</button>
      </td>
    </tr>`).join('');
  }

  /* === Đổi status từ dropdown — ghi approver tự động === */
  window.qtChangeStatus = function(id, newSt) {
    const list = getQ();
    const i = list.findIndex(x => x.id === id);
    if (i < 0) return;
    const oldSt = list[i].status;
    if (oldSt === newSt) return;
    const q = list[i];
    if (newSt === 'accepted' && !q.convertedOrderId) {
      if (!confirm(`KH "${q.custName}" duyệt báo giá ${q.id} (${window.fmt(q.total)} ₫)?\n\n→ Hệ thống sẽ tự tạo Đơn hàng mới với items + giá đã báo.`)) {
        render(); return;
      }
      const orders = window.STORE.get('orders', []) || [];
      const code = 'NSTT-' + String(orders.length + 400).padStart(6,'0');
      const c = getCusts().find(x => x.id === q.custId);
      orders.push({
        code, custId: q.custId, cust: q.custId, custName: q.custName,
        custPhone: c?.phone || '', drop: c?.address || '',
        date: '18/05/2026', status: 'confirmed',
        items: q.items.map(it => ({ name: it.name, qty: it.qty, price: it.price, total: it.total })),
        freight: q.total, cod: q.total, staff: window.CURRENT_USER?.name || q.staffOwner,
        source: 'quote', note: 'Từ báo giá ' + q.id,
      });
      window.STORE.set('orders', orders);
      q.convertedOrderId = code;
      window.toast(`✓ Đã tạo đơn ${code}`,'success');
    }
    if (newSt === 'rejected') {
      const reason = prompt('Lý do KH từ chối (để rút kinh nghiệm):');
      if (reason === null) { render(); return; }
      q.rejectReason = reason;
    }
    q.status = newSt;
    q.approvedBy = window.CURRENT_USER?.name || '?';
    q.approvedAt = new Date().toLocaleString('vi-VN');
    q.statusHistory = q.statusHistory || [];
    q.statusHistory.push({ from: oldSt, to: newSt, by: q.approvedBy, at: q.approvedAt });
    window.STORE.set('quotes', list);
    window.audit && window.audit.log('quote.statusChange', `${id}: ${oldSt} → ${newSt} (bởi ${q.approvedBy})`);
    window.toast(`✓ ${id}: ${ST_LAB[oldSt]} → ${ST_LAB[newSt]}`, 'success');
  };

  window.openQtDrawer = function (id) {
    const q = getQ().find(x => x.id === id);
    if (!q) return;
    const dc = document.getElementById('drawerContent');
    dc.innerHTML = `
      <div style="background:linear-gradient(135deg,#3B82F6 0%,#1B5E20 100%);color:#fff;padding:20px;position:relative">
        <button onclick="closeDrawer()" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.15);border:none;color:#fff;width:30px;height:30px;border-radius:6px;cursor:pointer">✕</button>
        <h2 style="margin:0;font-size:18px">${q.id}</h2>
        <div style="opacity:0.85;font-size:12.5px;margin-top:2px">${q.custName} · ${q.date}</div>
      </div>
      <div style="padding:18px 20px">
        <!-- Status dropdown lớn -->
        <div style="background:${ST_BG[q.status]};border-left:4px solid ${ST_COLOR[q.status]};padding:11px 14px;border-radius:0 7px 7px 0;margin-bottom:14px">
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700;margin-bottom:4px">Trạng thái hiện tại ${window.helpTip('Đổi trạng thái khi: gửi cho KH, KH duyệt, KH từ chối... Ai bấm đổi sẽ được ghi vào lịch sử để truy vết sau này.')}</div>
          <select onchange="window.qtChangeStatus('${q.id}', this.value)"
            style="width:100%;border:1px solid ${ST_COLOR[q.status]};background:#fff;color:${ST_COLOR[q.status]};font-weight:800;font-size:14px;padding:8px 12px;border-radius:6px;cursor:pointer">
            ${Object.keys(ST_LAB).map(s => `<option value="${s}" ${s===q.status?'selected':''}>${ST_LAB[s]}</option>`).join('')}
          </select>
          ${q.approvedBy ? `<div style="font-size:11.5px;color:${ST_COLOR[q.status]};margin-top:6px"><b>👤 ${q.approvedBy}</b> đổi lúc ${q.approvedAt || ''}</div>` : ''}
          ${q.rejectReason ? `<div style="font-size:11px;color:#B91C1C;margin-top:4px;font-style:italic">Lý do từ chối: "${q.rejectReason}"</div>` : ''}
          ${q.convertedOrderId ? `<a href="orders.html" style="display:inline-block;margin-top:6px;font-size:11.5px;color:#15803D;font-weight:600">→ Đã tạo đơn: ${q.convertedOrderId}</a>` : ''}
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px">
          <thead><tr style="background:#FAFBFC"><th style="text-align:left;padding:6px 8px;font-size:11px">SP</th><th style="text-align:right;padding:6px 8px;font-size:11px">SL</th><th style="text-align:right;padding:6px 8px;font-size:11px">Đơn giá</th><th style="text-align:right;padding:6px 8px;font-size:11px">Thành tiền</th></tr></thead>
          <tbody>
            ${(q.items||[]).map(it => `<tr style="border-top:1px solid #F1F5F9"><td style="padding:6px 8px">${it.name}</td><td style="text-align:right;padding:6px 8px">${it.qty} ${it.unit||''}</td><td style="text-align:right;padding:6px 8px">${window.fmt(it.price)}</td><td style="text-align:right;padding:6px 8px;font-weight:600">${window.fmt(it.total)}</td></tr>`).join('')}
            <tr style="background:#FAFBFC;font-weight:700"><td colspan="3" style="padding:8px;text-align:right">TỔNG</td><td style="text-align:right;padding:8px">${window.fmt(q.total)} ₫</td></tr>
          </tbody>
        </table>
        <div style="background:#FAFBFC;padding:10px;border-radius:7px;font-size:12.5px;line-height:1.6">
          <div><b>Hết hạn:</b> ${q.validUntil}</div>
          <div><b>NV phụ trách (người lập):</b> ${q.staffOwner}</div>
          <div><b>Ghi chú:</b> ${q.note||'—'}</div>
        </div>

        ${q.statusHistory && q.statusHistory.length ? `
          <div style="margin-top:14px">
            <h4 style="font-size:11px;color:var(--navy);text-transform:uppercase;font-weight:700;margin:0 0 6px">📜 Lịch sử đổi trạng thái ${window.helpTip('Mọi lần đổi trạng thái đều ghi: ai đổi, lúc nào. Dùng để truy vết khi có tranh chấp giữa Sale.')}</h4>
            <div style="background:#FAFBFC;padding:8px 12px;border-radius:6px;font-size:11.5px;line-height:1.7">
              ${q.statusHistory.slice().reverse().map(h => `<div>• <b>${h.by}</b> đổi <span style="color:${ST_COLOR[h.from]}">${ST_LAB[h.from]}</span> → <span style="color:${ST_COLOR[h.to]}">${ST_LAB[h.to]}</span> · <span style="color:var(--muted)">${h.at}</span></div>`).join('')}
            </div>
          </div>
        ` : ''}

        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
          <button class="btn btn-primary" style="flex:1" onclick="window.qtPrint('${q.id}')">🖨 In / Save PDF chuẩn brand</button>
          <button class="btn btn-ghost" onclick="window.qtSendZalo('${q.id}')" title="Gửi qua Zalo">💬</button>
          <button class="btn btn-ghost" onclick="window.qtSendEmail('${q.id}')" title="Gửi qua email">✉</button>
        </div>
      </div>`;
    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawerBg').classList.add('open');
  };

  window.closeDrawer = function () {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawerBg').classList.remove('open');
  };

  /* Gửi qua Zalo / Email — link tới SĐT / email của KH */
  window.qtSendZalo = function(id) {
    const q = getQ().find(x => x.id === id);
    const c = getCusts().find(x => x.id === q.custId);
    if (!c?.phone) { window.toast('KH chưa có SĐT','warn'); return; }
    const phone = c.phone.replace(/\s/g,'');
    const msg = `Kính gửi ${c.name},\n\nBên Tuấn Tú gửi báo giá ${q.id} (hiệu lực đến ${q.validUntil}):\n\n${q.items.map(it => `• ${it.name} ${it.qty}${it.unit||''} × ${window.fmt(it.price)} = ${window.fmt(it.total)}`).join('\n')}\n\n📊 Tổng: ${window.fmt(q.total)} ₫\n\nXin phản hồi giúp em. Cảm ơn ạ!`;
    window.open(`https://zalo.me/${phone}?txt=${encodeURIComponent(msg)}`,'_blank');
    if (q.status === 'draft') window.qtChangeStatus(id, 'sent');
  };
  window.qtSendEmail = function(id) {
    const q = getQ().find(x => x.id === id);
    const c = getCusts().find(x => x.id === q.custId);
    if (!c?.email) { window.toast('KH chưa có email — cập nhật trước','warn'); return; }
    const subject = `[Tuấn Tú] Báo giá ${q.id} - ${q.custName}`;
    const body = `Kính gửi ${c.name},\n\nBên Tuấn Tú gửi báo giá ${q.id} (hiệu lực đến ${q.validUntil}).\nTổng giá trị: ${window.fmt(q.total)} ₫\n\nFile PDF kèm theo (anh/chị tải xuống từ link gửi kèm).\n\nXin phản hồi giúp em.\nTrân trọng!`;
    window.open(`mailto:${c.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,'_blank');
    if (q.status === 'draft') window.qtChangeStatus(id, 'sent');
  };

  /* Legacy wrappers — vẫn giữ để drawer cũ tương thích nhưng đều redirect qua qtChangeStatus */
  window.qtSend = function (id) {
    window.qtChangeStatus(id, 'sent');
    window.closeDrawer && window.closeDrawer();
  };

  window.qtAccept = function (id) {
    window.qtChangeStatus(id, 'accepted');
    window.closeDrawer && window.closeDrawer();
  };
  window.qtReject = function (id) {
    window.qtChangeStatus(id, 'rejected');
    window.closeDrawer && window.closeDrawer();
  };

  /* ============================================================
     PDF Báo giá — chuẩn nhận diện thương hiệu TUẤN TÚ FARM
     A4 portrait · logo + header + items + tổng + chữ ký + watermark
     ============================================================ */
  window.qtPrint = function (id) {
    const q = getQ().find(x => x.id === id);
    if (!q) return;
    const c = getCusts().find(x => x.id === q.custId) || {};
    const comp = window.STORE.get('company', {
      name: 'Nông Sản Tuấn Tú Hà Nội',
      addr: '36 Tân Mai, Hoàng Mai, Hà Nội',
      phone: '0903 111 222',
      email: 'support@nongsantuantuhanoi.com',
      website: 'nongsantuantuhanoi.com',
      tax: '0123456789',
      bank: 'VCB · 0123456789 · NÔNG SẢN TUẤN TÚ HÀ NỘI',
    });
    const totalQty = q.items.reduce((s,it) => s+(+it.qty||0), 0);
    const subtotal = q.total;
    const vat = Math.round(subtotal * 0.08);
    const grand = subtotal + vat;
    /* Đọc số thành chữ — đơn giản (chỉ format) */
    function numToVnText(n) {
      if (n >= 1_000_000_000) return (n/1_000_000_000).toFixed(2).replace(/\.?0+$/,'') + ' tỷ đồng';
      if (n >= 1_000_000)     return (n/1_000_000).toFixed(2).replace(/\.?0+$/,'') + ' triệu đồng';
      if (n >= 1_000)         return (n/1_000).toFixed(0) + ' nghìn đồng';
      return n + ' đồng';
    }
    const LOGO_SVG = `<svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg" style="width:78px;height:54px"><g><circle cx="100" cy="46" r="40" fill="#E8F5E2"/><circle cx="100" cy="46" r="40" fill="none" stroke="#1B5E20" stroke-width="3.5"/><circle cx="91" cy="50" r="20" fill="#4EB83C"/><path d="M91 30 C 79 37 76 53 85 66" fill="none" stroke="#1B5E20" stroke-width="2.2" stroke-linecap="round"/><path d="M91 30 C 103 37 106 53 97 66" fill="none" stroke="#1B5E20" stroke-width="2.2" stroke-linecap="round"/><path d="M72 50 C 84 48 98 48 110 50" fill="none" stroke="#1B5E20" stroke-width="2.2" stroke-linecap="round"/><circle cx="91" cy="50" r="6" fill="#1B5E20"/><g transform="rotate(30 118 54)"><path d="M114 48 L122 48 L118 72 Z" fill="#E8862E"/><path d="M114 48 C 111 40 117 38 118 44 C 119 38 125 40 122 48 Z" fill="#1B5E20"/></g></g></svg>`;

    /* Lookup products để lấy ảnh + EN name. Map theo productId hoặc fuzzy theo name */
    const products = window.STORE.get('products', window.PRODUCTS || []) || [];
    function findProd(it) {
      if (it.productId) {
        const p = products.find(x => x.id === it.productId);
        if (p) return p;
      }
      const n = (it.name||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d');
      return products.find(x => {
        const xn = (x.name||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d');
        return xn === n || xn.includes(n) || n.includes(xn);
      });
    }

    /* Convert relative path "../assets/products/SP001.jpg" → absolute (cho popup window) */
    const baseUrl = location.origin + location.pathname.replace(/\/pages\/[^\/]+$/, '/');
    function fixImgUrl(img) {
      if (!img) return '';
      if (img.startsWith('http') || img.startsWith('data:')) return img;
      if (img.startsWith('../')) return baseUrl + img.replace(/^\.\.\//, '');
      if (img.startsWith('/')) return baseUrl.replace(/\/$/, '') + img;
      return baseUrl + img;
    }

    /* Placeholder SVG nếu SP không có ảnh */
    const PLACEHOLDER_IMG = 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect fill="#F0FDF4" width="48" height="48" rx="6"/><text x="24" y="32" text-anchor="middle" font-family="Arial" font-size="28">🥬</text></svg>`);

    /* Ưu tiên PRODUCT_IMAGES embed (luôn có, offline-safe) trước khi fallback fixImgUrl */
    const EMBED = window.PRODUCT_IMAGES || {};
    const itemsHtml = q.items.map((it, i) => {
      const prod = findProd(it);
      const imgSrc = (prod && EMBED[prod.id])
        ? EMBED[prod.id]
        : (prod?.img ? fixImgUrl(prod.img) : PLACEHOLDER_IMG);
      const en = prod?.en ? `<div style="font-size:9.5px;color:#9CA3AF;font-style:italic;margin-top:1px">${prod.en}</div>` : '';
      return `
      <tr>
        <td style="text-align:center;color:#6B7280;width:24px">${i+1}</td>
        <td style="width:54px;padding:4px"><img src="${imgSrc}" onerror="this.src='${PLACEHOLDER_IMG}'" style="width:46px;height:46px;object-fit:cover;border-radius:5px;border:1px solid #E5E7EB" alt="${it.name}"></td>
        <td><b>${it.name}</b>${en}</td>
        <td style="text-align:center">${it.unit || 'kg'}</td>
        <td class="num">${window.fmt(it.qty)}</td>
        <td class="num">${window.fmt(it.price)}</td>
        <td class="num"><b>${window.fmt(it.total)}</b></td>
      </tr>
      `;
    }).join('');

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Báo giá ${q.id} · ${comp.name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{color:#1F2937;font-size:13px;line-height:1.55;background:#fff;position:relative;overflow-x:hidden}
  @page{size:A4 portrait;margin:14mm}
  @media print{body{padding:0}.no-print{display:none}}
  .no-print{position:fixed;top:10px;right:10px;z-index:99}

  /* WATERMARK */
  .watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:120px;font-weight:900;color:#16A34A;opacity:0.04;letter-spacing:8px;pointer-events:none;z-index:0;white-space:nowrap}

  /* HEADER */
  .doc{max-width:185mm;margin:0 auto;padding:0 6mm;position:relative;z-index:1}
  .top-band{height:8px;background:linear-gradient(90deg,#1B5E20 0%,#16A34A 50%,#E8A33D 100%);border-radius:4px;margin-bottom:14px}

  .hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:3px double #1B5E20;padding-bottom:14px;margin-bottom:18px}
  .hdr-left{display:flex;align-items:flex-start;gap:14px;flex:1}
  .hdr-text h1{font-size:20px;color:#1B5E20;font-weight:900;letter-spacing:0.4px;line-height:1.15}
  .hdr-text .slogan{font-size:11.5px;color:#16A34A;font-style:italic;margin-top:2px;letter-spacing:0.2px}
  .hdr-text .contact{font-size:11px;color:#475569;margin-top:6px;line-height:1.55}
  .hdr-text .contact b{color:#0F172A}
  .doc-meta{text-align:right;font-size:10.5px;color:#6B7280;line-height:1.5;flex-shrink:0}
  .doc-meta .num-box{background:#1B5E20;color:#fff;padding:6px 14px;border-radius:6px;font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:800;margin-bottom:4px;display:inline-block;letter-spacing:0.5px}

  /* TITLE */
  .title-row{text-align:center;margin:8px 0 20px;position:relative}
  .title-row h2{font-size:24px;color:#1B5E20;font-weight:900;letter-spacing:3px;display:inline-block;padding:0 20px;background:#fff;position:relative;z-index:2}
  .title-row::before{content:'';position:absolute;left:0;right:0;top:50%;height:2px;background:#1B5E20;z-index:1}
  .title-row .sub-title{font-size:11px;color:#6B7280;margin-top:6px;letter-spacing:0.5px;text-transform:uppercase}

  /* TO/FROM box */
  .ref-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}
  .ref-card{background:#FAFBFC;border-left:4px solid #1B5E20;padding:11px 14px;border-radius:0 6px 6px 0}
  .ref-card .lab{font-size:10px;color:#6B7280;text-transform:uppercase;letter-spacing:0.8px;font-weight:800;margin-bottom:4px}
  .ref-card .v1{font-weight:700;font-size:14px;color:#0F172A;line-height:1.3}
  .ref-card .v2{font-size:11.5px;color:#475569;margin-top:3px;line-height:1.5}

  .meta-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;font-size:11.5px}
  .meta-cell{background:#fff;border:1px solid #E5E7EB;padding:7px 10px;border-radius:5px;text-align:center}
  .meta-cell .lab{font-size:9.5px;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;font-weight:700}
  .meta-cell .val{font-weight:700;color:#1B5E20;margin-top:2px}

  /* TABLE */
  table.items{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,0.04);border-radius:6px;overflow:hidden}
  table.items thead{background:linear-gradient(135deg,#1B5E20 0%,#16A34A 100%);color:#fff}
  table.items th{padding:9px 8px;text-align:left;font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:0.5px}
  table.items th.num{text-align:right}
  table.items td{padding:9px 8px;border-bottom:1px solid #E5E7EB;vertical-align:top}
  table.items td.num{text-align:right;font-variant-numeric:tabular-nums}
  table.items tr:nth-child(even) td{background:#FAFBFC}
  table.items tr:hover td{background:#F0FDF4}

  /* TOTALS */
  .totals{display:flex;justify-content:flex-end;margin-bottom:14px}
  .totals-box{min-width:280px;font-size:12.5px}
  .totals-row{display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #E5E7EB}
  .totals-row .lab{color:#475569;font-weight:600}
  .totals-row .val{font-variant-numeric:tabular-nums;font-weight:700;color:#0F172A}
  .totals-row.grand{background:linear-gradient(135deg,#1B5E20 0%,#16A34A 100%);color:#fff;border-radius:6px;padding:11px 14px;border:0;margin-top:6px;font-size:14px}
  .totals-row.grand .lab,.totals-row.grand .val{color:#fff;font-weight:800}
  .totals-row.grand .val{font-size:18px}
  .amount-text{font-size:11.5px;color:#6B7280;font-style:italic;text-align:right;margin-top:4px;padding-right:14px}

  /* TERMS */
  .terms{background:#FEF3C7;border-left:3px solid #D97706;padding:10px 14px;border-radius:0 5px 5px 0;margin:14px 0;font-size:11.5px;color:#92400E;line-height:1.6}
  .terms b{color:#0F172A}
  .terms ul{margin:4px 0 0 16px;padding:0}

  .note-card{background:#EFF6FF;border-left:3px solid #1E40AF;padding:9px 13px;border-radius:0 5px 5px 0;margin:10px 0;font-size:11.5px;color:#1E40AF;line-height:1.6}

  /* SIGNATURE */
  .sig-grid{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:24px}
  .sig-block{text-align:center;font-size:11px}
  .sig-block .title{font-size:11.5px;font-weight:800;color:#0F172A;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px}
  .sig-block .hint{font-size:9.5px;color:#9CA3AF;font-style:italic;margin-bottom:55px;letter-spacing:0.2px}
  .sig-block .name{font-weight:600;color:#1F2937}

  /* FOOTER */
  .footer{margin-top:18px;padding-top:10px;border-top:2px solid #E5E7EB;text-align:center;font-size:10px;color:#9CA3AF;line-height:1.55}
  .footer b{color:#1B5E20}

  /* QR placeholder */
  .qr-block{position:absolute;bottom:60px;right:6mm;width:80px;text-align:center;font-size:9px;color:#9CA3AF}
  .qr-block .qr{width:80px;height:80px;background:#fff;border:1px solid #1B5E20;border-radius:5px;display:grid;place-items:center;font-size:9px;color:#1B5E20;text-align:center;padding:8px;line-height:1.2}
</style>
</head><body>

<!-- WATERMARK -->
<div class="watermark">TUẤN TÚ FARM</div>

<button class="no-print" onclick="window.print()" style="background:#16A34A;color:#fff;border:0;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:700">🖨 In / Save PDF</button>

<div class="doc">

  <div class="top-band"></div>

  <!-- HEADER -->
  <div class="hdr">
    <div class="hdr-left">
      ${LOGO_SVG}
      <div class="hdr-text">
        <h1>${comp.name.toUpperCase()}</h1>
        <div class="slogan">"Rau sạch — tới bếp tươi mỗi sớm"</div>
        <div class="contact">
          📍 <b>${comp.addr}</b><br>
          ☎ ${comp.phone} · ✉ ${comp.email || ''}${comp.tax ? ' · MST ' + comp.tax : ''}<br>
          🌐 ${comp.website || ''}
        </div>
      </div>
    </div>
    <div class="doc-meta">
      <div class="num-box">${q.id}</div>
      <div>Ngày báo giá:<br><b style="color:#1B5E20;font-size:12px">${q.date}</b></div>
      <div style="margin-top:4px">Hiệu lực đến:<br><b style="color:#D97706;font-size:12px">${q.validUntil}</b></div>
    </div>
  </div>

  <!-- TITLE -->
  <div class="title-row">
    <h2>BẢNG BÁO GIÁ</h2>
    <div class="sub-title">QUOTATION · CHO ĐƠN HÀNG NÔNG SẢN B2B</div>
  </div>

  <!-- TO/FROM -->
  <div class="ref-grid">
    <div class="ref-card">
      <div class="lab">📍 BÊN BÁN (Seller)</div>
      <div class="v1">${comp.name}</div>
      <div class="v2">${comp.addr}<br>SĐT: ${comp.phone}${comp.tax?' · MST: '+comp.tax:''}</div>
    </div>
    <div class="ref-card" style="border-left-color:#D97706">
      <div class="lab">🎯 KÍNH GỬI (Buyer)</div>
      <div class="v1">${c.name || q.custName}${c.code ? ' <span style="color:#6B7280;font-weight:500">('+c.code+')</span>' : ''}</div>
      <div class="v2">${c.contact ? c.contact + ' · ' : ''}${c.phone || '—'}<br>${c.address || '—'}${c.tax ? '<br>MST: '+c.tax : ''}</div>
    </div>
  </div>

  <!-- META STRIP -->
  <div class="meta-strip">
    <div class="meta-cell"><div class="lab">NV phụ trách</div><div class="val">${q.staffOwner || '—'}</div></div>
    <div class="meta-cell"><div class="lab">Số mặt hàng</div><div class="val">${q.items.length}</div></div>
    <div class="meta-cell"><div class="lab">Tổng SL</div><div class="val">${window.fmt(totalQty)} kg</div></div>
    <div class="meta-cell"><div class="lab">Trạng thái</div><div class="val" style="color:${q.status==='accepted'?'#16A34A':q.status==='rejected'?'#DC2626':'#1E40AF'}">${ST_LAB[q.status]}</div></div>
  </div>

  <!-- ITEMS TABLE -->
  <table class="items">
    <thead><tr>
      <th style="width:24px;text-align:center">#</th>
      <th style="width:54px;text-align:center">Ảnh</th>
      <th>Tên sản phẩm</th>
      <th style="width:38px;text-align:center">ĐVT</th>
      <th class="num" style="width:52px">SL</th>
      <th class="num" style="width:82px">Đơn giá</th>
      <th class="num" style="width:100px">Thành tiền</th>
    </tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <!-- TOTALS -->
  <div class="totals">
    <div class="totals-box">
      <div class="totals-row"><div class="lab">Tổng tiền hàng (Subtotal)</div><div class="val">${window.fmt(subtotal)} ₫</div></div>
      <div class="totals-row"><div class="lab">VAT 8% (ước tính)</div><div class="val">${window.fmt(vat)} ₫</div></div>
      <div class="totals-row grand"><div class="lab">🎯 TỔNG THANH TOÁN</div><div class="val">${window.fmt(grand)} ₫</div></div>
      <div class="amount-text">(Bằng chữ: ${numToVnText(grand)})</div>
    </div>
  </div>

  <!-- TERMS -->
  <div class="terms">
    <b>⚠️ ĐIỀU KHOẢN BÁO GIÁ</b>
    <ul>
      <li>Báo giá có hiệu lực đến <b>${q.validUntil}</b>. Quá ngày này giá có thể thay đổi theo thị trường.</li>
      <li>Giá đã bao gồm <b>vận chuyển nội thành Hà Nội</b>. Tỉnh khác phí giao tính riêng.</li>
      <li>Thanh toán: COD hoặc CK trong vòng 7 ngày sau giao hàng.</li>
      <li>Rau giao buổi sáng (trước 7h) hoặc theo lịch thỏa thuận.</li>
    </ul>
  </div>

  ${q.note ? `<div class="note-card"><b>📝 Ghi chú riêng:</b> ${q.note}</div>` : ''}

  <!-- BANK -->
  ${comp.bank ? `<div style="background:#F0FDF4;border:1px dashed #16A34A;padding:9px 13px;border-radius:5px;font-size:11.5px;margin:10px 0;color:#15803D">
    🏦 <b>Thông tin chuyển khoản:</b> ${comp.bank}<br>
    📝 Nội dung CK: <b>${q.id} - ${(c.name||q.custName).slice(0,40)}</b>
  </div>` : ''}

  <!-- SIGNATURES -->
  <div class="sig-grid">
    <div class="sig-block">
      <div class="title">KHÁCH HÀNG XÁC NHẬN</div>
      <div class="hint">(Ký, ghi rõ họ tên + đóng dấu nếu có)</div>
      <div class="name">${c.contact || '....................................'}</div>
    </div>
    <div class="sig-block">
      <div class="title">ĐẠI DIỆN BÊN BÁN</div>
      <div class="hint">Hà Nội, ngày ${q.date}</div>
      <div class="name">${q.staffOwner || '....................................'}</div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <b>${comp.name}</b> · ${comp.addr}<br>
    Cảm ơn quý khách đã tin tưởng. Mọi thắc mắc xin liên hệ ${comp.phone} hoặc ${comp.email||''}<br>
    <span style="color:#1B5E20;font-weight:600">🌱 Rau sạch — tới bếp tươi mỗi sớm 🌱</span>
  </div>

  <!-- QR placeholder -->
  <div class="qr-block">
    <div class="qr">QR<br>Quét xem<br>online</div>
    <div style="margin-top:4px">${q.id}</div>
  </div>

</div>

<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
</body></html>`;

    const w = window.open('','_blank','width=900,height=1100');
    if (!w) { window.toast && window.toast('Bật pop-up rồi thử lại','warn'); return; }
    w.document.write(html);
    w.document.close();
    w.document.title = 'Báo giá ' + q.id;
    window.audit && window.audit.log('quote.print', q.id);
  };

  window.openQuoteModal = function () {
    const nextId = 'BG-2026-' + String(getQ().length + 1).padStart(4,'0');
    const custs = getCusts();
    const prods = getProds();
    window.openModal('+ Tạo báo giá', `
      <div style="background:#EFF6FF;color:#1E40AF;padding:9px 12px;border-radius:7px;font-size:12px;margin-bottom:12px">
        💡 <b>Quy trình:</b> Tạo báo giá (status: Nháp) → bấm "📤 Gửi" để chuyển sang Đã gửi → khi KH duyệt, bấm "✓" để tự tạo đơn hàng thật.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div><label style="font-size:12px;color:var(--muted)">Mã BG</label><input id="qf_id" value="${nextId}" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px;font-family:monospace"></div>
        <div><label style="font-size:12px;color:var(--muted)">Hiệu lực đến ${window.helpTip('Quá ngày này báo giá tự chuyển trạng thái "Hết hạn". Thường để 7 ngày.')}</label><input id="qf_valid" type="date" value="2026-05-25" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"></div>
        <div style="grid-column:span 2"><label style="font-size:12px;color:var(--muted)">Khách hàng * ${window.helpTip ? window.helpTip('Gõ tên/SĐT/mã KH — danh sách tự lọc.') : ''}</label>
          <div id="qf_cust_box"></div>
          <input type="hidden" id="qf_cust" value="">
        </div>
      </div>
      <label style="font-size:12px;color:var(--muted);font-weight:600">Mặt hàng báo giá</label>
      <div id="qf_items"></div>
      <button class="btn btn-ghost btn-sm" onclick="window._qfAdd()" style="margin-top:5px">+ Thêm SP</button>
      <div style="display:flex;justify-content:flex-end;margin-top:10px;font-size:13px">Tổng: <b style="margin-left:8px" id="qf_total">0</b> ₫</div>
      <label style="font-size:12px;color:var(--muted);margin-top:8px;display:block">Ghi chú</label>
      <textarea id="qf_note" rows="2" style="width:100%;border:1px solid var(--line);border-radius:6px;padding:7px;font-size:13px"></textarea>
    `, {
      footer:`<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
              <button class="btn btn-primary" onclick="window._qfSave()">Lưu (Nháp)</button>`,
      width:'600px'
    });
    window._qfPRODS = prods;
    window._qfAdd();

    /* Mount autocomplete KH */
    if (window.CustSearchBox) {
      window._qfSelectedCust = null;
      window.CustSearchBox.mount('qf_cust_box', {
        placeholder: 'Gõ tên KH / SĐT / mã KH...',
        onSelect: (c) => {
          window._qfSelectedCust = c;
          document.getElementById('qf_cust').value = c ? c.id : '';
        },
      });
    }
  };

  window._qfAdd = function () {
    const host = document.getElementById('qf_items');
    const prods = window._qfPRODS || [];
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:2fr 60px 80px 100px 28px;gap:5px;margin-bottom:4px';
    row.innerHTML = `
      <select class="qi_pid"><option value="">— SP —</option>${prods.map(p => `<option value="${p.id}" data-name="${p.name}" data-unit="${p.unit||'kg'}">${p.name}</option>`).join('')}</select>
      <input type="number" placeholder="SL" class="qi_qty" min="0" step="0.1">
      <input type="number" placeholder="Giá" class="qi_price" min="0">
      <input type="text" placeholder="Tiền" class="qi_total" readonly style="background:#FAFBFC">
      <button onclick="this.parentElement.remove();window._qfRecalc()" style="background:none;border:none;cursor:pointer;color:var(--danger)">✕</button>
    `;
    row.querySelectorAll('select,input').forEach(el => { el.style.cssText = 'border:1px solid var(--line);border-radius:5px;padding:5px;font-size:12px;width:100%'; });
    row.querySelector('.qi_total').style.background = '#FAFBFC';
    host.appendChild(row);
    row.querySelectorAll('input,select').forEach(el => el.oninput = window._qfRecalc);
    /* Auto fill giá từ priceOn */
    row.querySelector('.qi_pid').onchange = (e) => {
      const pid = e.target.value;
      if (pid && window.priceOn) {
        row.querySelector('.qi_price').value = window.priceOn(pid, '2026-05-18');
        window._qfRecalc();
      }
    };
  };
  window._qfRecalc = function () {
    let total = 0;
    document.querySelectorAll('#qf_items > div').forEach(r => {
      const q = parseFloat(r.querySelector('.qi_qty').value) || 0;
      const p = parseFloat(r.querySelector('.qi_price').value) || 0;
      const t = q * p; r.querySelector('.qi_total').value = window.fmt(t);
      total += t;
    });
    document.getElementById('qf_total').textContent = window.fmt(total);
  };
  window._qfSave = function () {
    const items = [];
    document.querySelectorAll('#qf_items > div').forEach(r => {
      const s = r.querySelector('.qi_pid');
      const pid = s.value;
      if (!pid) return;
      const q = parseFloat(r.querySelector('.qi_qty').value) || 0;
      const p = parseFloat(r.querySelector('.qi_price').value) || 0;
      if (q && p) items.push({ productId:pid, name: s.options[s.selectedIndex].dataset.name, unit: s.options[s.selectedIndex].dataset.unit, qty:q, price:p, total:q*p });
    });
    if (!items.length) { window.toast('Thêm ít nhất 1 SP','warn'); return; }
    const custId = document.getElementById('qf_cust').value;
    if (!custId) { window.toast('Chọn KH','warn'); return; }
    const c = window._qfSelectedCust || (window.STORE.get('customers', []) || []).find(x => x.id === custId);
    const dt = document.getElementById('qf_valid').value;
    const m = dt.match(/(\d+)-(\d+)-(\d+)/);
    const obj = {
      id: document.getElementById('qf_id').value,
      custId: custId, custName: c ? c.name : '',
      date: '18/05/2026',
      validUntil: m ? `${m[3]}/${m[2]}/${m[1]}` : '25/05/2026',
      status: 'draft', total: items.reduce((s,i) => s+i.total, 0),
      items, staffOwner: window.CURRENT_USER?.name || '',
      note: document.getElementById('qf_note').value,
    };
    const list = getQ();
    list.push(obj);
    window.STORE.set('quotes', list);
    window.audit && window.audit.log('quote.create', `${obj.id} cho ${obj.custName} (${window.fmt(obj.total)} ₫)`);
    window.toast('✓ Đã lưu báo giá (status: Nháp)','success');
    window.closeModal();
  };

  /* Auto expire */
  setTimeout(() => {
    const list = getQ();
    const today = new Date(2026, 4, 18);
    let changed = false;
    list.forEach(q => {
      if (q.status === 'sent') {
        const m = (q.validUntil||'').match(/(\d+)\/(\d+)\/(\d+)/);
        if (m) {
          const exp = new Date(+m[3], +m[2]-1, +m[1]);
          if (exp < today) { q.status = 'expired'; changed = true; }
        }
      }
    });
    if (changed) window.STORE.set('quotes', list);
  }, 1000);

  /* Init */
  window.renderAppShell('quotes', 'Báo giá');
  document.getElementById('hbHost').innerHTML = window.helpBanner(
    '📝 Quy trình Báo giá → Đơn hàng',
    'Trước khi KH B2B đặt thật, họ thường xin báo giá (rất quan trọng với nhà hàng/khách sạn). <b>Nháp</b> → <b>Đã gửi</b> → KH duyệt → 1-click <b>Convert sang Đơn hàng</b>. Tỷ lệ chốt báo giá là chỉ số quan trọng đánh giá năng lực Sales.',
    {id:'hb-qt', icon:'📝'}
  );
  document.getElementById('hbT').innerHTML = window.helpTip('Báo giá khác Đơn hàng: BG là cam kết giá trong thời hạn nhất định, chưa thực sự bán. Khi KH duyệt mới chuyển thành Đơn.', {size:'lg'});

  ['qtQ','qtSt'].forEach(id => document.getElementById(id).oninput = render);
  window.STORE.subscribe('quotes', render);
  render();

  /* Pre-fill từ customer drawer */
  setTimeout(() => {
    const pending = sessionStorage.getItem('_pendingQuote');
    if (pending) {
      try {
        const p = JSON.parse(pending);
        sessionStorage.removeItem('_pendingQuote');
        window.openQuoteModal();
        setTimeout(() => {
          if (window.CustSearchBox && p.custId) window.CustSearchBox.setValue('qf_cust_box', p.custId);
        }, 200);
      } catch (e) {}
    }
  }, 500);
})();
