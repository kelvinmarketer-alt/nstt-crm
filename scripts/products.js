/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Sản phẩm & Bảng giá ngày
   - Bảng giá hôm nay: chỉnh giá bán theo ngày, so % với hôm qua, gửi Telegram.
   - Danh mục: CRUD sản phẩm (tên, nhóm, ĐVT, giá nhập/bán hôm nay).
   ========================================================= */
(function () {
  const CATS = window.PRODUCT_CATEGORIES || [];
  const catMeta = id => CATS.find(c => c.id === id) || { label: id, icon: '📦', color: '#666' };

  let currentCat = null;          // lọc danh mục
  let boardDate = maxDate();      // ngày đang xem ở bảng giá

  function products() { return window.STORE.get('products', window.PRODUCTS || []); }

  function maxDate() {
    let m = window.todayISO();
    products().forEach(p => (p.priceHistory || []).forEach(h => { if (h.date > m) m = h.date; }));
    return m;
  }
  /* Ngày có giá liền trước boardDate (để so sánh "hôm qua") */
  function prevEntry(p, dateISO) {
    const sorted = [...(p.priceHistory || [])].sort((a, b) => a.date < b.date ? -1 : 1);
    let prev = null;
    for (const e of sorted) { if (e.date < dateISO) prev = e; }
    return prev;
  }
  function entryExactlyOn(p, dateISO) {
    return (p.priceHistory || []).find(h => h.date === dateISO) || null;
  }
  function fmtD(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

  /* ============ TABS ============ */
  window.switchPView = function (e, view) {
    document.querySelectorAll('.pv-tab').forEach(t => t.classList.remove('active'));
    e.currentTarget.classList.add('active');
    document.getElementById('boardView').style.display = view === 'board' ? '' : 'none';
    document.getElementById('mktView').style.display = view === 'mkt' ? '' : 'none';
    document.getElementById('catalogView').style.display = view === 'catalog' ? '' : 'none';
    if (view === 'board') renderBoard();
    else if (view === 'mkt') renderMkt();
    else renderCatalog();
  };

  /* ============ BẢNG GIÁ HÔM NAY ============ */
  function renderBoard() {
    const ps = products();
    const rows = ps.map(p => {
      const cat = catMeta(p.cat);
      const cur = entryExactlyOn(p, boardDate);
      const todaySell = cur ? cur.sell : (window.priceEntryOn(p, boardDate)?.sell ?? 0);
      const prev = prevEntry(p, boardDate);
      const prevSell = prev ? prev.sell : null;
      let delta = '';
      if (prevSell != null && prevSell > 0) {
        const pct = Math.round((todaySell - prevSell) / prevSell * 100);
        const col = pct > 0 ? 'var(--danger)' : pct < 0 ? 'var(--ok)' : 'var(--muted)';
        const arr = pct > 0 ? '▲' : pct < 0 ? '▼' : '–';
        delta = `<span style="color:${col};font-weight:600">${arr} ${pct > 0 ? '+' : ''}${pct}%</span>`;
      } else {
        delta = `<span style="color:var(--muted)">mới</span>`;
      }
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:8px">
          ${p.img ? `<img src="${p.img}" alt="" loading="lazy" style="width:34px;height:34px;object-fit:cover;border-radius:6px;background:#eef3ee;flex:none" onerror="this.style.visibility='hidden'">` : ''}
          <b>${p.name}</b></div></td>
        <td><span class="tag" style="background:${cat.color}20;color:${cat.color}">${cat.icon} ${cat.label}</span></td>
        <td style="color:var(--muted)">/${p.unit}</td>
        <td class="num" style="color:var(--muted)">${prevSell != null ? window.fmt(prevSell) : '—'}</td>
        <td class="num"><input class="bprice" data-id="${p.id}" type="number" value="${todaySell}" style="width:110px;text-align:right;padding:6px 8px;border:1px solid var(--line);border-radius:6px"></td>
        <td class="num">${delta}</td>
      </tr>`;
    }).join('');

    const tg = window.STORE.get('int_telegram', {});
    const tgOn = !!(tg.botToken && tg.chatId);
    const lastSent = window.STORE.get('priceBoardLastSent', null);
    const tgBanner = `
      <div class="chart-card" style="margin-bottom:14px;border-left:4px solid ${tgOn ? 'var(--ok)' : 'var(--warn)'}">
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <div style="font-size:22px">${tgOn ? '📨' : '🔔'}</div>
          <div style="flex:1;min-width:200px">
            <div style="font-weight:700;color:${tgOn ? 'var(--ok)' : 'var(--warn)'}">${tgOn ? 'Thông báo giá qua Telegram: ĐÃ KẾT NỐI' : 'Thông báo giá qua Telegram: CHƯA KẾT NỐI'}</div>
            <div style="font-size:12.5px;color:var(--muted);margin-top:2px">${tgOn
              ? 'Bấm "Tạo & gửi" → app dựng <b>file báo giá đẹp (đúng mẫu, kèm ảnh)</b>, tải về máy <b>VÀ tự gửi Telegram</b> dạng file đính kèm.' + (lastSent ? ' · Gần nhất: <b>' + lastSent + '</b>' : ' · Chưa gửi lần nào.')
              : '⚠️ Telegram chưa cấu hình → app vẫn tạo <b>file báo giá (đúng mẫu)</b> để bạn tải về & gửi Zalo. Bấm "Cấu hình Telegram" để điền Bot Token + Chat ID, app sẽ tự gửi lần sau.'}</div>
          </div>
          ${tgOn ? `
          <button class="btn btn-sm btn-ghost" onclick="window.PriceAutoSend && window.PriceAutoSend.openConfig()" title="Bật/tắt tự động gửi mỗi sáng + cấu hình giờ. Chỉ gửi khi giá đổi so hôm qua.">🤖 Auto hằng ngày</button>
          <button class="btn btn-sm btn-ghost" onclick="window.PriceAutoSend && window.PriceAutoSend.sendNowIfChanged()" title="Kiểm tra giá đổi và gửi ngay (skip nếu không đổi để tránh spam)">📤 Gửi ngay (nếu đổi)</button>
          <button class="btn btn-sm btn-ghost" onclick="window.exportPriceBoardPDF()" title="Mở cửa sổ in → chọn Save as PDF để lưu file PDF">🖨 Xuất PDF</button>
          <button class="btn btn-sm btn-primary" onclick="window.sendPriceBoard()" title="Tải file HTML (có ảnh embed) + tự gửi Telegram">📥 Tải HTML + gửi TG</button>
          ` : `
          <button class="btn btn-sm btn-ghost" onclick="window.location.href='settings.html'">⚙️ Cấu hình Telegram</button>
          <button class="btn btn-sm btn-ghost" onclick="window.exportPriceBoardPDF()" title="Mở cửa sổ in → Save as PDF">🖨 Xuất PDF</button>
          <button class="btn btn-sm btn-primary" onclick="window.sendPriceBoard()" title="Tải file HTML có ảnh embed — gửi Zalo / mở offline">📥 Tải HTML</button>
          `}
        </div>
      </div>`;
    document.getElementById('boardView').innerHTML = tgBanner + `
      <div class="chart-card" style="margin-bottom:14px">
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <div><label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px">Ngày áp dụng</label>
            <input type="date" id="boardDateInp" value="${boardDate}" style="padding:7px 10px;border:1px solid var(--line);border-radius:7px"></div>
          <div style="flex:1"></div>
          <button class="btn btn-ghost btn-sm" onclick="window.aiFillPrices()">📷 Cập nhật giá bằng ảnh (AI)</button>
          <button class="btn btn-ghost btn-sm" onclick="window.copyYesterday()">📋 Sao chép giá hôm qua</button>
          <button class="btn btn-ghost btn-sm" onclick="window.copyPriceText()" title="Copy text gọn dán Zalo">📋 Copy text</button>
          <button class="btn btn-ghost btn-sm" onclick="window.PriceAutoSend && window.PriceAutoSend.previewDiff()" title="Xem nhanh SP nào đổi giá so hôm qua">🔍 So sánh giá</button>
          <button class="btn btn-ghost btn-sm" onclick="window.exportPriceBoardPDF()" title="Mở popup print → Save as PDF">🖨 Xuất PDF</button>
          <button class="btn btn-ghost btn-sm" onclick="window.sendPriceBoard()" title="Tải HTML có ảnh embed + auto gửi Telegram">📥 Xuất HTML</button>
          <button class="btn btn-primary btn-sm" onclick="window.savePriceBoard()">💾 Lưu bảng giá ${fmtD(boardDate)}</button>
        </div>
      </div>
      <div class="chart-card">
        <table class="mini-table">
          <thead><tr>
            <th>Sản phẩm</th><th>Nhóm</th><th>ĐVT</th>
            <th class="num">Giá bán hôm qua</th><th class="num">Giá bán ${fmtD(boardDate)}</th><th class="num">Thay đổi</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    document.getElementById('boardDateInp').addEventListener('change', e => {
      boardDate = e.target.value || window.todayISO();
      renderBoard();
    });
  }

  /* ============ BẢNG GIÁ MARKETING ============
     Giá riêng để CHÀO HÀNG / CHẠY ADS — KHÔNG ảnh hưởng giá đơn hàng.
     Giá MKT = giá bán thật ± offset (chỉnh hàng loạt theo "giá"=1.000đ)
               hoặc override tay từng SP.
     Lưu kv_store('mktPrices') = { offset, override:{id:price} } */
  function mktCfg() {
    const c = window.STORE.get('mktPrices', { offset: 0, override: {} }) || {};
    return { offset: +c.offset || 0, override: c.override || {} };
  }
  function saveMkt(c) { window.STORE.set('mktPrices', c); }
  function realPrice(p) {
    return (window.priceEntryOn ? (window.priceEntryOn(p, window.todayISO())?.sell) : null) ?? p.price ?? 0;
  }
  function mktPriceOf(p, c) {
    c = c || mktCfg();
    if (c.override && c.override[p.id] != null) return +c.override[p.id];
    return Math.max(0, realPrice(p) + (c.offset || 0));
  }

  function renderMkt() {
    const ps = products();
    const c = mktCfg();
    const giaK = (c.offset || 0) / 1000;
    const rows = ps.map(p => {
      const cat = catMeta(p.cat);
      const real = realPrice(p);
      const mkt = mktPriceOf(p, c);
      const isOverride = c.override && c.override[p.id] != null;
      const diff = mkt - real;
      const diffTxt = diff === 0 ? '<span style="color:var(--muted)">=</span>'
        : `<span style="color:${diff>0?'#DC2626':'#15803D'};font-weight:600">${diff>0?'+':''}${window.fmt(diff)}</span>`;
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:8px">
          ${p.img ? `<img src="${p.img}" alt="" loading="lazy" style="width:32px;height:32px;object-fit:cover;border-radius:6px;background:#eef3ee;flex:none" onerror="this.style.visibility='hidden'">` : ''}
          <b>${p.name}</b></div></td>
        <td><span class="tag" style="background:${cat.color}20;color:${cat.color}">${cat.icon} ${cat.label}</span></td>
        <td style="color:var(--muted)">/${p.unit}</td>
        <td class="num" style="color:var(--muted)">${window.fmt(real)}</td>
        <td class="num">
          <input class="mktprice" data-id="${p.id}" type="number" value="${mkt}" style="width:110px;text-align:right;padding:6px 8px;border:1px solid ${isOverride?'#A16207':'var(--line)'};border-radius:6px;background:${isOverride?'#FEF9C3':'#fff'}" title="${isOverride?'Đã sửa tay':'Tự tính = giá thật + offset'}">
          ${isOverride ? `<button onclick="window._mktClearOne('${p.id}')" title="Bỏ sửa tay, về công thức" style="background:none;border:none;color:#A16207;cursor:pointer;font-size:11px">↺</button>` : ''}
        </td>
        <td class="num">${diffTxt}</td>
      </tr>`;
    }).join('');

    document.getElementById('mktView').innerHTML = `
      <div class="chart-card" style="margin-bottom:14px;border-left:4px solid #7C3AED;background:#FaF5FF">
        📣 <b style="color:#6D28D9">Bảng giá Marketing</b> — giá đi <b>chào hàng / chạy quảng cáo</b>.
        <b style="color:#DC2626">KHÔNG dùng cho đơn hàng</b> (đơn vẫn lấy giá bán thật ở tab "Bảng giá hôm nay").
      </div>

      <div class="chart-card" style="margin-bottom:14px">
        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:6px">Công thức hàng loạt — cộng/trừ <b>"giá"</b> so với giá bán thật <small>(1 giá = 1.000đ)</small></label>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="window._mktQuick(-2)" style="${c.offset===-2000?'background:#7C3AED;color:#fff':''}">−2 giá</button>
          <button class="btn btn-ghost btn-sm" onclick="window._mktQuick(-1)" style="${c.offset===-1000?'background:#7C3AED;color:#fff':''}">−1 giá</button>
          <button class="btn btn-ghost btn-sm" onclick="window._mktQuick(0)" style="${c.offset===0?'background:#15803D;color:#fff':''}">= Giá thật</button>
          <button class="btn btn-ghost btn-sm" onclick="window._mktQuick(1)" style="${c.offset===1000?'background:#7C3AED;color:#fff':''}">+1 giá</button>
          <button class="btn btn-ghost btn-sm" onclick="window._mktQuick(2)" style="${c.offset===2000?'background:#7C3AED;color:#fff':''}">+2 giá</button>
          <button class="btn btn-ghost btn-sm" onclick="window._mktQuick(5)" style="${c.offset===5000?'background:#7C3AED;color:#fff':''}">+5 giá</button>
          <span style="color:var(--muted);margin:0 4px">hoặc</span>
          <select id="mktOp" style="padding:7px 8px;border:1px solid var(--line);border-radius:7px;font-size:13px">
            <option value="1">+ Cộng</option><option value="-1">− Trừ</option>
          </select>
          <input type="number" id="mktGia" min="0" step="1" placeholder="số giá" oninput="document.getElementById('mktPrev').textContent='= '+( (parseFloat(this.value)||0)*1000 ).toLocaleString('vi-VN')+'đ'" style="width:80px;padding:7px 8px;border:1px solid var(--line);border-radius:7px;text-align:right;font-weight:700">
          <span style="font-size:12px;color:var(--muted)">giá <b id="mktPrev" style="color:#6D28D9">= 0đ</b></span>
          <button class="btn btn-primary btn-sm" onclick="window._mktApplyBulk()">⚡ Áp dụng</button>
          <div style="flex:1"></div>
          <button class="btn btn-ghost btn-sm" onclick="window._mktReset()" title="Về đúng giá bán thật">↺ Reset</button>
        </div>
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="window._mktCopyText()" title="Copy text dán Zalo/FB">📋 Copy text</button>
          <button class="btn btn-ghost btn-sm" onclick="window._mktExportPDF()" title="Xuất PDF bảng giá MKT (mẫu đẹp, kèm ảnh)">🖨 Xuất PDF</button>
          <button class="btn btn-ghost btn-sm" onclick="window._mktExportHTML()" title="Tải file HTML bảng giá MKT (gửi Zalo / mở offline)">📥 Xuất HTML</button>
          ${c.offset!==0 ? `<div style="flex:1;text-align:right;font-size:12px;color:#6D28D9;align-self:center">Đang áp: <b>giá thật ${c.offset>0?'+':'−'} ${Math.abs(giaK)} giá</b> (${c.offset>0?'+':''}${window.fmt(c.offset)}đ)</div>` : ''}
        </div>
      </div>

      <div class="chart-card">
        <table class="mini-table">
          <thead><tr>
            <th>Sản phẩm</th><th>Nhóm</th><th>ĐVT</th>
            <th class="num">Giá bán thật</th><th class="num" style="background:#F5F3FF">Giá Marketing</th><th class="num">Chênh</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    /* Wire sửa tay từng SP */
    document.querySelectorAll('.mktprice').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        const val = parseInt(e.target.value, 10) || 0;
        const cfg = mktCfg();
        cfg.override = cfg.override || {};
        cfg.override[id] = val;
        saveMkt(cfg);
        renderMkt();
      });
    });
  }

  window._mktQuick = function (giaNum) {
    const cfg = mktCfg();
    cfg.offset = Math.round(giaNum * 1000);
    saveMkt(cfg);
    renderMkt();
    window.toast(giaNum === 0 ? '↺ Giá MKT = giá thật' : `⚡ Giá MKT = giá thật ${giaNum>0?'+':'−'} ${Math.abs(giaNum)} giá`, 'success');
  };
  window._mktApplyBulk = function () {
    const op = parseInt(document.getElementById('mktOp').value, 10) || 1;
    const gia = parseFloat(document.getElementById('mktGia').value) || 0;
    if (gia > 50) { if (!confirm(`Bạn nhập ${gia} giá = ${(gia*1000).toLocaleString('vi-VN')}đ — số khá lớn. Chắc chắn?`)) return; }
    const cfg = mktCfg();
    cfg.offset = op * Math.round(gia * 1000);
    saveMkt(cfg);
    renderMkt();
    window.toast(`⚡ Đã áp dụng giá MKT = giá thật ${op>0?'+':'−'} ${gia} giá`, 'success');
  };
  /* Xuất PDF / HTML bảng giá MKT — tái dùng template báo giá, truyền priceFn */
  window._mktExportPDF = async function () {
    if (!window.PriceCatalogue) { window.toast('Chưa tải module báo giá', 'warn'); return; }
    const c = mktCfg();
    try { await window.PriceCatalogue.exportPDF(window.todayISO(), { priceFn: (p) => mktPriceOf(p, c) }); }
    catch (e) { window.toast('Lỗi tạo PDF: ' + e.message, 'warn'); }
  };
  window._mktExportHTML = async function () {
    if (!window.PriceCatalogue) { window.toast('Chưa tải module báo giá', 'warn'); return; }
    const c = mktCfg();
    window.toast('Đang tạo file HTML bảng giá Marketing…', 'info');
    try { await window.PriceCatalogue.export(window.todayISO(), { priceFn: (p) => mktPriceOf(p, c) }); }
    catch (e) { window.toast('Lỗi tạo file: ' + e.message, 'warn'); }
  };
  window._mktReset = function () {
    if (!confirm('Reset bảng giá Marketing về đúng giá bán thật? (xóa công thức + mọi sửa tay)')) return;
    saveMkt({ offset: 0, override: {} });
    renderMkt();
    window.toast('↺ Đã reset giá MKT = giá thật', 'success');
  };
  window._mktClearOne = function (id) {
    const cfg = mktCfg();
    if (cfg.override) delete cfg.override[id];
    saveMkt(cfg);
    renderMkt();
  };
  window._mktCopyText = function () {
    const c = mktCfg();
    const lines = products().map(p => `• ${p.name}: ${window.fmt(mktPriceOf(p, c))}đ/${p.unit}`);
    const txt = `📣 BẢNG GIÁ ${window.todayISO ? fmtD(window.todayISO()) : ''}\n` + lines.join('\n');
    navigator.clipboard?.writeText(txt).then(
      () => window.toast('📋 Đã copy bảng giá Marketing', 'success'),
      () => window.toast('Không copy được — bôi đen thủ công', 'warn')
    );
  };
  /* Expose để module khác (ads) dùng giá MKT nếu cần — KHÔNG ảnh hưởng đơn */
  window.mktPriceOf = function (productId) {
    const p = products().find(x => x.id === productId);
    return p ? mktPriceOf(p) : 0;
  };

  /* ====== AI: cập nhật giá từ ảnh bảng giá ====== */
  window.aiFillPrices = function () {
    if (!window.AI) { window.toast('Chưa tải module AI', 'warn'); return; }
    window.AI.openFillModal({
      task: 'product',
      title: '📷 Cập nhật giá bằng ảnh (AI)',
      guideHtml: 'Đính kèm <b>ảnh bảng giá</b> (viết tay / Excel / Zalo...). AI đọc tên sản phẩm + giá bán và tự điền vào cột giá hôm nay cho các SP khớp tên. Kiểm tra rồi bấm <b>Lưu bảng giá</b>.<br><b>Cấu trúc gợi ý:</b> mỗi dòng = "Tên sản phẩm — giá/kg".',
      prompt: 'Đọc ảnh bảng giá nông sản (tiếng Việt). Trả về JSON mảng: [{"name":"tên sản phẩm tiếng Việt","price": số tiền VND dạng số nguyên (bỏ dấu chấm và đơn vị)}]. Chỉ lấy GIÁ BÁN. Bỏ qua dòng không rõ giá. CHỈ trả JSON, không giải thích.',
      onResult: applyAIPrices,
    });
  };
  function applyAIPrices(data) {
    const list = Array.isArray(data) ? data : (data.products || data.items || data.data || []);
    if (!list.length) { window.toast('Không đọc được sản phẩm nào từ ảnh', 'warn'); return; }
    const ps = products();
    let matched = 0; const miss = [];
    list.forEach(it => {
      const nm = window.AI.norm(it.name);
      const price = parseInt(String(it.price == null ? '' : it.price).replace(/[^0-9]/g, ''), 10) || 0;
      if (!nm || !price) return;
      let p = ps.find(x => window.AI.norm(x.name) === nm)
        || ps.find(x => { const xn = window.AI.norm(x.name); return xn.includes(nm) || nm.includes(xn); });
      if (p) { const inp = document.querySelector('.bprice[data-id="' + p.id + '"]'); if (inp) { inp.value = price; matched++; } }
      else miss.push(it.name);
    });
    window.toast(`✓ AI đã điền ${matched} giá${miss.length ? ' · chưa khớp: ' + miss.slice(0, 4).join(', ') : ''} — kiểm tra rồi bấm "Lưu bảng giá".`, matched ? 'success' : 'warn');
  }

  window.copyYesterday = function () {
    document.querySelectorAll('.bprice').forEach(inp => {
      const p = window.productById(inp.dataset.id);
      const prev = prevEntry(p, boardDate);
      if (prev) inp.value = prev.sell;
    });
    window.toast('Đã điền giá hôm qua — chỉnh lại rồi bấm Lưu', 'info');
  };

  window.savePriceBoard = function () {
    let n = 0;
    document.querySelectorAll('.bprice').forEach(inp => {
      const id = inp.dataset.id;
      const sell = parseInt(inp.value, 10) || 0;
      const p = window.productById(id);
      if (!p) return;
      const hist = [...(p.priceHistory || [])];
      const existing = hist.find(h => h.date === boardDate);
      const lastBuy = (window.priceEntryOn(p, boardDate)?.buy) ?? 0;
      if (existing) { existing.sell = sell; }
      else { hist.push({ date: boardDate, buy: lastBuy, sell }); }
      window.STORE.update('products', id, { priceHistory: hist });
      n++;
    });
    window.toast(`✓ Đã lưu bảng giá ${fmtD(boardDate)} cho ${n} sản phẩm`, 'success');
    renderBoard();
  };

  /* ============ GỬI BẢNG GIÁ (Telegram / clipboard) ============ */
  function buildPriceMessage() {
    const ps = products();
    let msg = `🥬 BẢNG GIÁ NÔNG SẢN TUẤN TÚ — ${fmtD(boardDate)}\n(Giá bán, ĐVT, có thể thay đổi theo ngày)\n`;
    CATS.forEach(cat => {
      const items = ps.filter(p => p.cat === cat.id);
      if (!items.length) return;
      msg += `\n${cat.icon} ${cat.label.toUpperCase()}\n`;
      items.forEach(p => {
        const sell = window.priceEntryOn(p, boardDate)?.sell ?? 0;
        msg += `• ${p.name}: ${window.fmt(sell)}đ/${p.unit}\n`;
      });
    });
    msg += `\n📞 Đặt hàng: 0836 676 086 — Nông Sản Tuấn Tú Hà Nội`;
    return msg;
  }

  /* === Xuất HTML — file gửi Zalo / mở offline (self-contained có ảnh base64) === */
  window.sendPriceBoard = async function () {
    if (!window.PriceCatalogue) { window.toast('Chưa tải module báo giá', 'warn'); return; }
    window.toast('Đang tạo file HTML báo giá (kèm ảnh sản phẩm)…', 'info');
    try {
      await window.PriceCatalogue.export(boardDate);
      window.STORE.set('priceBoardLastSent', new Date().toLocaleString('vi-VN'));
      renderBoard();
    } catch (e) { window.toast('Lỗi tạo file: ' + e.message, 'warn'); }
  };

  /* === Xuất PDF — mở popup window có nút In / Save as PDF === */
  window.exportPriceBoardPDF = async function () {
    if (!window.PriceCatalogue) { window.toast('Chưa tải module báo giá', 'warn'); return; }
    try {
      await window.PriceCatalogue.exportPDF(boardDate);
    } catch (e) { window.toast('Lỗi tạo PDF: ' + e.message, 'warn'); }
  };

  /* Chỉ gửi Telegram (không tải file về máy) — dùng khi đã có Telegram cấu hình */
  window.sendPriceBoardOnly = async function () {
    if (!window.PriceCatalogue) { window.toast('Chưa tải module báo giá', 'warn'); return; }
    try {
      await window.PriceCatalogue.export(boardDate, { sendOnly: true });
      window.STORE.set('priceBoardLastSent', new Date().toLocaleString('vi-VN'));
      renderBoard();
    } catch (e) { window.toast('Lỗi gửi Telegram: ' + e.message, 'warn'); }
  };

  /* Tùy chọn: copy bảng giá dạng TEXT để dán nhanh Zalo */
  window.copyPriceText = async function () {
    const msg = buildPriceMessage();
    try { await navigator.clipboard.writeText(msg); window.toast('✓ Đã copy bảng giá (text) — dán vào Zalo', 'success'); }
    catch (e) { window.openModal('📋 Bảng giá (text)', `<textarea rows="14" style="width:100%;font-family:ui-monospace,monospace;font-size:12px;padding:10px;border:1px solid var(--line);border-radius:8px">${msg}</textarea>`, { footer: `<button class="btn btn-primary" onclick="closeModal()">Đóng</button>`, width: '560px' }); }
  };

  /* ============ DANH MỤC SẢN PHẨM ============ */
  function renderCatalog() {
    const ps = products();
    const counts = { all: ps.length };
    ps.forEach(p => counts[p.cat] = (counts[p.cat] || 0) + 1);
    const chips = `<button class="chip ${!currentCat ? 'active' : ''}" onclick="window.filterCat(null)">Tất cả <span class="cnt">${counts.all}</span></button>` +
      CATS.map(c => `<button class="chip ${currentCat === c.id ? 'active' : ''}" onclick="window.filterCat('${c.id}')" style="${currentCat === c.id ? 'background:' + c.color + ';color:#fff;border-color:' + c.color : ''}">${c.icon} ${c.label} <span class="cnt">${counts[c.id] || 0}</span></button>`).join('');

    const list = ps.filter(p => !currentCat || p.cat === currentCat);
    const rows = list.map(p => {
      const cat = catMeta(p.cat);
      const e = window.priceEntryOn(p, window.todayISO());
      const buy = e ? e.buy : 0, sell = e ? e.sell : 0;
      const margin = sell - buy;
      return `<tr data-id="${p.id}">
        <td onclick="event.stopPropagation()"><div class="checkbox" onclick="this.classList.toggle('on')"></div></td>
        <td>${p.img ? `<img src="${p.img}" alt="" loading="lazy" style="width:42px;height:42px;object-fit:cover;border-radius:7px;background:#eef3ee" onerror="this.style.visibility='hidden'">` : ''}</td>
        <td data-field="name" title="Click để sửa tên SP"><b>${p.name}</b><div style="color:var(--muted);font-size:11px">${p.en || p.note || ''}</div></td>
        <td data-field="cat" title="Click để đổi nhóm"><span class="tag" style="background:${cat.color}20;color:${cat.color}">${cat.icon} ${cat.label}</span></td>
        <td data-field="unit" title="Click để sửa đơn vị tính" style="color:var(--muted)">/${p.unit}</td>
        <td class="num"><input class="cat-price" data-id="${p.id}" data-field="buy" type="number" value="${buy}" style="width:96px;text-align:right;padding:5px 7px;border:1px solid var(--line);border-radius:6px;color:var(--muted)"></td>
        <td class="num"><input class="cat-price" data-id="${p.id}" data-field="sell" type="number" value="${sell}" style="width:100px;text-align:right;padding:5px 7px;border:1px solid var(--line);border-radius:6px;font-weight:700"></td>
        <td class="num cat-margin" data-id="${p.id}" style="color:${margin > 0 ? 'var(--ok)' : 'var(--muted)'}">${window.fmt(margin)}</td>
        <td class="num">
          <button class="icon-btn" title="Sửa chi tiết SP (tên/nhóm/đvt)" onclick="window.editProduct('${p.id}')">✏️</button>
          <button class="icon-btn" title="Xóa sản phẩm" style="color:var(--danger)" onclick="window.deleteProduct('${p.id}')">🗑</button>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="9" style="padding:30px;text-align:center;color:var(--muted)">Chưa có sản phẩm.</td></tr>`;

    document.getElementById('catalogView').innerHTML = `
      <div class="chart-card" style="margin-bottom:14px">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div style="font-size:12.5px;color:var(--muted);flex:1;min-width:180px">💡 <b>Chỉnh giá trực tiếp</b> ở ô bên dưới (lưu tự động vào bảng giá hôm nay), hoặc nhập hàng loạt / từ ảnh:</div>
          <button class="btn btn-ghost btn-sm" onclick="window.aiFillCatalog()">📷 Cập nhật giá bằng ảnh (AI)</button>
          <button class="btn btn-ghost btn-sm" onclick="window.openBulkPriceImport()">📥 Nhập hàng loạt (paste Excel)</button>
        </div>
      </div>
      <div class="quick-chips" style="margin-bottom:14px">${chips}</div>
      <div class="chart-card">
        <table class="mini-table">
          <thead><tr>
            <th style="width:32px"><div class="checkbox" onclick="this.classList.toggle('on')" title="Chọn tất cả"></div></th>
            <th style="width:50px">Ảnh</th><th>Tên sản phẩm</th><th>Nhóm</th><th>ĐVT</th><th class="num">Giá nhập</th><th class="num">Giá bán</th><th class="num">Lãi/ĐV</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    /* Wire inline edit cho giá (input có sẵn) */
    document.querySelectorAll('#catalogView .cat-price').forEach(inp => {
      inp.addEventListener('change', () => savePriceInline(inp.dataset.id, inp.dataset.field, parseInt(inp.value, 10) || 0));
    });

    /* Bulk operations cho sản phẩm */
    if (window.attachBulkOps) {
      const tbl = document.querySelector('#catalogView .mini-table');
      if (tbl) {
        if (!tbl.id) tbl.id = 'tblProducts';
        window.attachBulkOps({
          tableSelector: '#' + tbl.id,
          store: 'products',
          label: 'SP',
          actions: {
            changeStatus: {
              label: '🔄 Đổi nhóm',
              field: 'cat',
              options: [
                {id:'rau-ta', label:'🥬 Rau ta'},
                {id:'rau-dalat', label:'🥗 Rau Đà Lạt'},
                {id:'nam', label:'🍄 Nấm'},
                {id:'rau-gia-vi', label:'🌶 Rau gia vị'},
                {id:'thit-lon', label:'🐖 Thịt lợn'},
                {id:'thit-ga', label:'🐓 Thịt gà'},
                {id:'thit-bo', label:'🥩 Thịt bò'},
                {id:'hang-khac', label:'🧺 Hàng khác'},
              ]
            }
          }
        });
      }
    }

    /* Inline edit cho name/cat/unit (click cell = sửa) */
    if (window.attachInlineEdit) {
      const tbl = document.querySelector('#catalogView .mini-table');
      if (tbl) {
        if (!tbl.id) tbl.id = 'tblProducts';
        window.attachInlineEdit('#' + tbl.id, {
          store: 'products',
          fields: {
            name: { type: 'text',
                    format: (v, row) => `<b>${v}</b><div style="color:var(--muted);font-size:11px">${row?.en || row?.note || ''}</div>` },
            cat:  { type: 'select',
                    options: () => window.MD.get('services').map(s => ({ value: s.id, label: (s.icon||'') + ' ' + s.label })),
                    format: v => { const m = catMeta(v); return `<span class="tag" style="background:${m.color}20;color:${m.color}">${m.icon} ${m.label}</span>`; } },
            unit: { type: 'select',
                    options: () => window.MD.get('units').map(u => u.id),
                    format: v => `/${v}` },
          }
        });
      }
    }
  }

  /* Lưu giá inline → cập nhật priceHistory hôm nay */
  function savePriceInline(id, field, val) {
    const p = window.productById(id); if (!p) return;
    const today = window.todayISO();
    const hist = [...(p.priceHistory || [])];
    const last = window.priceEntryOn(p, today) || { buy: 0, sell: 0 };
    const ex = hist.find(h => h.date === today);
    if (ex) ex[field] = val;
    else hist.push({ date: today, buy: field === 'buy' ? val : (last.buy || 0), sell: field === 'sell' ? val : (last.sell || 0) });
    window.STORE.update('products', id, { priceHistory: hist });
    const cur = hist.find(h => h.date === today);
    const m = (cur.sell || 0) - (cur.buy || 0);
    const mc = document.querySelector(`.cat-margin[data-id="${id}"]`);
    if (mc) { mc.textContent = window.fmt(m); mc.style.color = m > 0 ? 'var(--ok)' : 'var(--muted)'; }
    window.toast('✓ Đã lưu giá: ' + p.name, 'success');
  }

  /* ====== Nhập hàng loạt từ paste Excel ====== */
  window.openBulkPriceImport = function () {
    window.openModal('📥 Nhập hàng loạt giá sản phẩm', `
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">
        Copy từ Excel/Google Sheets <b>3 cột</b>: <code>Tên SP</code> · <code>Giá nhập</code> · <code>Giá bán</code> → dán vào ô dưới.
        Hệ thống tự khớp tên (bỏ dấu) → cập nhật giá hôm nay. Bỏ qua dòng không khớp.
      </div>
      <textarea id="bulkText" rows="10" style="width:100%;font-family:ui-monospace,monospace;font-size:12px;padding:10px;border:1px solid var(--line);border-radius:8px" placeholder="Cải thìa	15000	22000\nCà chua đại	18000	26000\nThịt ba chỉ	95000	125000"></textarea>
    `, {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window.applyBulkPrice()">📥 Áp dụng</button>`,
      width: '560px',
    });
  };

  window.applyBulkPrice = function () {
    const txt = document.getElementById('bulkText').value || '';
    const lines = txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) { window.toast('Chưa có dữ liệu', 'warn'); return; }
    const ps = products(); let n = 0; const miss = [];
    lines.forEach(ln => {
      const parts = ln.split(/\t|,|;|\|/).map(s => s.trim());
      if (parts.length < 2) return;
      const name = parts[0];
      const buy = parseInt(String(parts[1]).replace(/[^0-9]/g, ''), 10) || 0;
      const sell = parseInt(String(parts[2] || parts[1]).replace(/[^0-9]/g, ''), 10) || 0;
      const nm = window.AI ? window.AI.norm(name) : name.toLowerCase();
      const p = ps.find(x => (window.AI ? window.AI.norm(x.name) : x.name.toLowerCase()) === nm)
        || ps.find(x => { const xn = window.AI ? window.AI.norm(x.name) : x.name.toLowerCase(); return xn.includes(nm) || nm.includes(xn); });
      if (!p) { miss.push(name); return; }
      const today = window.todayISO();
      const hist = [...(p.priceHistory || [])];
      const ex = hist.find(h => h.date === today);
      if (ex) { if (buy) ex.buy = buy; if (sell) ex.sell = sell; }
      else { const last = window.priceEntryOn(p, today) || { buy: 0, sell: 0 }; hist.push({ date: today, buy: buy || last.buy, sell: sell || last.sell }); }
      window.STORE.update('products', p.id, { priceHistory: hist });
      n++;
    });
    window.closeModal();
    window.toast(`✓ Cập nhật ${n} SP${miss.length ? ' · chưa khớp: ' + miss.slice(0, 4).join(', ') : ''}`, n ? 'success' : 'warn');
    renderCatalog();
  };

  /* ====== AI điền giá vào catalog (cả buy + sell) ====== */
  window.aiFillCatalog = function () {
    if (!window.AI) { window.toast('Chưa tải module AI', 'warn'); return; }
    window.AI.openFillModal({
      task: 'product',
      title: '📷 Cập nhật giá catalog bằng ảnh (AI)',
      guideHtml: 'Đính kèm <b>ảnh bảng giá</b> (viết tay / Excel / Zalo / báo giá NCC). AI đọc tên SP + giá nhập + giá bán (nếu có) → tự cập nhật vào catalog hôm nay.',
      prompt: 'Đọc ảnh bảng giá nông sản (tiếng Việt). Trả JSON mảng: [{"name":"tên SP","buy": giá nhập VND nguyên (0 nếu không có), "sell": giá bán VND nguyên}]. Số bỏ dấu chấm/đơn vị. CHỈ trả JSON.',
      onResult: (data) => {
        const list = Array.isArray(data) ? data : (data.products || data.items || []);
        if (!list.length) { window.toast('Không đọc được SP từ ảnh', 'warn'); return; }
        const ps = products(); let n = 0; const miss = [];
        list.forEach(it => {
          const nm = window.AI.norm(it.name);
          const buy = parseInt(String(it.buy == null ? '' : it.buy).replace(/[^0-9]/g, ''), 10) || 0;
          const sell = parseInt(String(it.sell == null ? '' : it.sell).replace(/[^0-9]/g, ''), 10) || 0;
          const p = ps.find(x => window.AI.norm(x.name) === nm) || ps.find(x => { const xn = window.AI.norm(x.name); return xn.includes(nm) || nm.includes(xn); });
          if (!p || (!buy && !sell)) { if (!p) miss.push(it.name); return; }
          const today = window.todayISO();
          const hist = [...(p.priceHistory || [])];
          const ex = hist.find(h => h.date === today);
          if (ex) { if (buy) ex.buy = buy; if (sell) ex.sell = sell; }
          else { const last = window.priceEntryOn(p, today) || { buy: 0, sell: 0 }; hist.push({ date: today, buy: buy || last.buy, sell: sell || last.sell }); }
          window.STORE.update('products', p.id, { priceHistory: hist });
          n++;
        });
        window.toast(`🤖 AI đã cập nhật ${n} SP${miss.length ? ' · chưa khớp: ' + miss.slice(0, 4).join(', ') : ''}`, n ? 'success' : 'warn');
        renderCatalog();
      },
    });
  };

  window.filterCat = function (id) { currentCat = id; renderCatalog(); };

  function productForm(p) {
    const catOpts = CATS.map(c => `<option value="${c.id}" ${p && p.cat === c.id ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('');
    const unitOpts = window.MD.get('units').map(u => `<option ${p && p.unit === u.label.toLowerCase() ? 'selected' : ''}>${u.label}</option>`).join('');
    const e = p ? window.priceEntryOn(p, window.todayISO()) : null;
    return `
      <div class="form-row">
        <div><label>Tên sản phẩm *</label><input id="pName" value="${p ? p.name : ''}" placeholder="VD: Cải thìa"></div>
        <div><label>Nhóm hàng *</label><select id="pCat">${catOpts}</select></div>
      </div>
      <div class="form-row">
        <div><label>Đơn vị tính</label><select id="pUnit">${unitOpts}</select></div>
        <div><label>Ghi chú</label><input id="pNote" value="${p ? (p.note || '') : ''}" placeholder="VD: Mộc Châu"></div>
      </div>
      <div class="form-row">
        <div><label>Giá nhập hôm nay (₫)</label><input id="pBuy" type="number" value="${e ? e.buy : ''}" placeholder="0"></div>
        <div><label>Giá bán hôm nay (₫) *</label><input id="pSell" type="number" value="${e ? e.sell : ''}" placeholder="0"></div>
      </div>`;
  }

  window.openAddProduct = function () {
    window.openModal('+ Thêm sản phẩm', productForm(null), {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window.submitProduct()">💾 Lưu</button>`,
    });
  };

  window.editProduct = function (id) {
    const p = window.productById(id);
    if (!p) return;
    window.openModal('Sửa: ' + p.name, productForm(p), {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window.submitProduct('${id}')">💾 Cập nhật</button>`,
    });
  };

  window.submitProduct = function (id) {
    const name = window.formVal('#pName');
    const sell = parseInt(window.formVal('#pSell'), 10) || 0;
    if (!name) { window.toast('Nhập tên sản phẩm', 'warn'); return; }
    if (!sell) { window.toast('Nhập giá bán', 'warn'); return; }
    const cat = window.formVal('#pCat');
    const unit = (window.formVal('#pUnit') || 'kg').toLowerCase();
    const note = window.formVal('#pNote');
    const buy = parseInt(window.formVal('#pBuy'), 10) || 0;
    const today = window.todayISO();

    if (id) {
      const p = window.productById(id);
      const hist = [...(p.priceHistory || [])];
      const ex = hist.find(h => h.date === today);
      if (ex) { ex.buy = buy; ex.sell = sell; } else { hist.push({ date: today, buy, sell }); }
      window.STORE.update('products', id, { name, cat, unit, note, priceHistory: hist });
      window.toast('✓ Đã cập nhật ' + name, 'success');
    } else {
      window.STORE.add('products', {
        id: window.STORE.nextId('products', 'SP', 3),
        name, cat, unit, note,
        priceHistory: [{ date: today, buy, sell }],
      });
      window.toast('✓ Đã thêm ' + name, 'success');
    }
    window.closeModal();
    renderCatalog();
  };

  window.deleteProduct = function (id) {
    const p = window.productById(id);
    window.confirmDelete('Xóa sản phẩm "' + (p ? p.name : id) + '"?', () => {
      window.STORE.remove('products', id);
      window.toast('Đã xóa', 'danger');
      renderCatalog();
    });
  };

  /* ============ BULK IMPORT SP ============ */
  function _prodSaveImported(records, src) {
    const list = window.STORE.get('products', window.PRODUCTS || []) || [];
    const today = (new Date()).toISOString().slice(0,10);
    let added = 0;
    records.forEach((r, i) => {
      if (!r.name || !String(r.name).trim()) return;
      const nextNo = String(list.length + 1 + i).padStart(3, '0');
      const buy = parseInt(r.buyPrice) || 0;
      const sell = parseInt(r.sellPrice) || Math.round(buy * 1.55);
      list.push({
        id: 'SP' + nextNo,
        name: r.name,
        en: r.en || '',
        cat: r.cat || 'rau-ta',
        unit: r.unit || 'kg',
        img: '',
        priceHistory: buy ? [{ date: today, buy, sell }] : [],
      });
      added++;
    });
    window.STORE.set('products', list);
    window.audit && window.audit.log('product.bulkImport', `+${added} SP từ ${src}`);
    window.toast(`✓ Đã thêm ${added} SP từ ${src}`, 'success');
  }

  window.prodImportExcel = function() {
    window.BulkImport.fromExcel({
      entityName: 'Sản phẩm',
      templateColumns: ['name','en','cat','unit','buyPrice','sellPrice'],
      templateRow: ['Cải bó xôi','Spinach','rau-ta','kg','15000','22000'],
      mapRow: (row, headers) => ({
        name:row[0], en:row[1], cat:row[2]||'rau-ta', unit:row[3]||'kg',
        buyPrice:row[4], sellPrice:row[5]
      }),
      onParsed: (recs) => _prodSaveImported(recs, 'Excel'),
    });
  };
  window.prodImportAI = function() {
    window.BulkImport.fromImage({
      entityName: 'Sản phẩm',
      promptHint: 'ảnh bảng giá / catalog SP với cột Tên + Giá nhập + Giá bán',
      fields: ['name','unit','buyPrice','sellPrice','cat'],
      aiTask: 'product',
      customPrompt: `Đọc ảnh chứa danh sách sản phẩm nông sản (tiếng Việt) với giá. Trả JSON: {"items":[{"name":"tên SP","unit":"kg","buyPrice":15000,"sellPrice":22000,"cat":"rau-ta"}]}
Quy tắc:
- cat: 1 trong [rau-ta, rau-dalat, nam, rau-vung-mien, rau-gia-vi, hai-san, hoa-qua, khac]
- buyPrice / sellPrice: số nguyên VND, KHÔNG dấu chấm/phẩy
- unit: kg/g/quả/bó/...
CHỈ TRẢ JSON.`,
      onParsed: (recs) => _prodSaveImported(recs, 'Ảnh AI'),
    });
  };

  /* === Init === */
  window.STORE.subscribe('products', () => {
    if (document.getElementById('boardView').style.display !== 'none') renderBoard();
    else renderCatalog();
  });
  window.renderAppShell('products', 'Sản phẩm & Giá');
  renderBoard();
})();
