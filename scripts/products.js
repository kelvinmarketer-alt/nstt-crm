/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Sản phẩm & Bảng giá ngày
   - Bảng giá hôm nay: chỉnh giá bán theo ngày, so % với hôm qua, gửi Telegram.
   - Danh mục: CRUD sản phẩm (tên, nhóm, ĐVT, giá nhập/bán hôm nay).
   ========================================================= */
(function () {
  const CATS = window.PRODUCT_CATEGORIES || [];
  const catMeta = id => CATS.find(c => c.id === id) || { label: id, icon: '📦', color: '#666' };

  /* ============ NHÓM BẢNG GIÁ (price tiers theo nhóm KH) ============
     Mỗi nhóm: markup % so với giá gốc + override giá riêng từng SP.
     boardTier = 0 → bảng giá GỐC; >0 → id nhóm. */
  const TIER_ICONS = ['①','②','③','④','⑤','⑥','⑦','⑧'];
  /* 8 nhóm mặc định: Nhóm 1 … Nhóm 8 (markup % so với GỐC) */
  const DEFAULT_TIERS = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: 'Nhóm ' + (i + 1), markup: 0, overrides: {} }));
  const _OLD_DEFAULT_NAMES = ['Giá lẻ', 'Giá sỉ', 'Giá VIP'];
  let boardTier = 0;
  function getTiers() {
    let t = window.STORE.get('priceTiers', null);
    /* Migrate bộ mặc định CŨ (Giá lẻ/sỉ/VIP) chưa chỉnh → thay bằng Nhóm 1-8 */
    if (Array.isArray(t) && t.length === 3 &&
        t.every((x, i) => x.name === _OLD_DEFAULT_NAMES[i] && (!x.overrides || !Object.keys(x.overrides).length))) {
      t = null;
    }
    return (Array.isArray(t) && t.length) ? t : DEFAULT_TIERS.map(x => ({ ...x, overrides: {} }));
  }
  /* % giá GỐC so với giá nhập (link toàn hệ thống) */
  function getBaseMarkup() { const v = window.STORE.get('priceBaseMarkup', null); return v == null ? 30 : v; }
  function saveTiers(tiers) { window.STORE.set('priceTiers', tiers); }
  function tierById(id) { return getTiers().find(t => t.id === +id); }
  function tierIcon(t) { return TIER_ICONS[(t.id - 1) % 8] || '#'; }
  /* Giá hiệu lực của SP trong 1 nhóm: override riêng → dùng; không thì giá gốc ±% */
  function tierPriceOf(tier, productId, baseSell) {
    if (tier.overrides && tier.overrides[productId] != null) return tier.overrides[productId];
    return Math.round((baseSell || 0) * (1 + (tier.markup || 0) / 100));
  }
  window.PriceTiers = { getTiers, tierById, tierPriceOf, tierIcon };

  function tierBarHTML() {
    const tiers = getTiers();
    let s = `<div class="chart-card" style="margin-bottom:14px"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-size:12.5px;color:var(--muted);font-weight:700">📊 Nhóm bảng giá:</span>
      <button class="btn btn-sm ${boardTier === 0 ? 'btn-primary' : 'btn-ghost'}" onclick="window.boardSwitchTier(0)">📋 Gốc</button>`;
    tiers.forEach(t => {
      s += `<button class="btn btn-sm ${boardTier === t.id ? 'btn-primary' : 'btn-ghost'}" onclick="window.boardSwitchTier(${t.id})">${tierIcon(t)} ${t.name} <span style="opacity:.7">(${t.markup >= 0 ? '+' : ''}${t.markup}%)</span></button>`;
    });
    if (tiers.length < 8) s += `<button class="btn btn-sm btn-ghost" style="border-style:dashed" onclick="window.tierAdd()">＋ Thêm nhóm</button>`;
    s += `<button class="btn btn-sm btn-ghost" onclick="window.tierManage()" title="Đổi tên / % / xóa nhóm">⚙ Quản lý nhóm</button></div>`;
    const tier = boardTier ? tierById(boardTier) : null;
    if (!tier) {
      /* Gốc: link toàn hệ thống — đặt giá = giá nhập + % */
      s += `<div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:9px 12px">
        <span style="font-size:13px;font-weight:700;color:var(--navy)">📋 Bảng giá GỐC — dùng cho toàn hệ thống (đơn hàng, website)</span>
        <label style="font-size:12px;color:var(--muted)">Giá gốc = Giá nhập + <input id="baseMarkup" type="number" value="${getBaseMarkup()}" style="width:64px;text-align:right;padding:4px 6px;border:1px solid var(--line);border-radius:5px"> %</label>
        <button class="btn btn-sm btn-primary" onclick="window.baseApplyMarkup()">⚙ Áp dụng cho tất cả SP</button>
        <span style="flex:1"></span>
        <span style="font-size:11.5px;color:var(--muted)">💡 Áp dụng sẽ tính lại giá bán = giá nhập × (1+%). Vẫn sửa tay từng ô được. Nhớ bấm 💾 Lưu.</span>
      </div>`;
    }
    if (tier) {
      s += `<div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:9px 12px">
        <span style="font-size:13px;font-weight:700;color:var(--navy)">${tierIcon(tier)} ${tier.name}</span>
        <label style="font-size:12px;color:var(--muted)">% so giá gốc: <input id="tierMarkup" type="number" value="${tier.markup}" style="width:64px;text-align:right;padding:4px 6px;border:1px solid var(--line);border-radius:5px"> %</label>
        <button class="btn btn-sm btn-primary" onclick="window.tierApplyMarkup()">Áp dụng %</button>
        <span style="flex:1"></span>
        <span style="font-size:11.5px;color:var(--muted)">💡 Giá = giá gốc ±%. Sửa tay 1 ô = ghi đè riêng SP đó (nền vàng), ↺ để bỏ ghi đè.</span>
      </div>`;
    }
    s += `</div>`;
    return s;
  }

  window.boardSwitchTier = function (id) { boardTier = +id; renderBoard(); };
  /* GỐC: đặt giá bán = giá nhập × (1+%) cho tất cả SP (link toàn hệ thống) */
  window.baseApplyMarkup = function () {
    const x = parseFloat(document.getElementById('baseMarkup').value);
    if (isNaN(x)) { window.toast('Nhập % hợp lệ', 'warn'); return; }
    if (!confirm(`Đặt GIÁ BÁN GỐC = giá nhập + ${x}% cho TẤT CẢ sản phẩm (ngày ${fmtD(boardDate)})?\nSP chưa có giá nhập sẽ bỏ qua. Vẫn sửa tay lại được.`)) return;
    window.STORE.set('priceBaseMarkup', x);
    const ps = products();
    let n = 0;
    const newPs = ps.map(p => {
      const last = window.priceEntryOn(p, boardDate) || { buy: 0, sell: 0 };
      const buy = last.buy || 0;
      if (!buy) return p;
      const sell = Math.round(buy * (1 + x / 100));
      const hist = (p.priceHistory || []).map(h => ({ ...h }));
      const ex = hist.find(h => h.date === boardDate);
      if (ex) { if (ex.sell === sell) return p; ex.sell = sell; } else hist.push({ date: boardDate, buy, sell });
      n++;
      return { ...p, priceHistory: hist };
    });
    window.STORE.set('products', newPs);
    renderBoard();
    window.toast(`✓ Đã đặt giá gốc = giá nhập +${x}% cho ${n} SP`, 'success');
  };
  window.tierApplyMarkup = function () {
    if (!boardTier) return;
    const v = parseFloat(document.getElementById('tierMarkup').value);
    if (isNaN(v)) { window.toast('Nhập % hợp lệ', 'warn'); return; }
    const tiers = getTiers(); const t = tiers.find(x => x.id === boardTier); if (!t) return;
    t.markup = v; saveTiers(tiers);
    window.toast(`✓ ${t.name}: giá gốc ${v >= 0 ? '+' : ''}${v}%`, 'success');
    renderBoard();
  };
  window.tierResetOverride = function (pid) {
    if (!boardTier) return;
    const tiers = getTiers(); const t = tiers.find(x => x.id === boardTier); if (!t) return;
    if (t.overrides) delete t.overrides[pid];
    saveTiers(tiers); renderBoard();
  };
  window.tierAdd = function () {
    const tiers = getTiers();
    if (tiers.length >= 8) { window.toast('Tối đa 8 nhóm', 'warn'); return; }
    const id = (tiers.reduce((m, t) => Math.max(m, t.id), 0) || 0) + 1;
    const name = prompt('Tên nhóm bảng giá mới:', 'Nhóm ' + id);
    if (name == null) return;
    tiers.push({ id, name: name.trim() || ('Nhóm ' + id), markup: 0, overrides: {} });
    saveTiers(tiers); boardTier = id; renderBoard();
    window.toast('✓ Đã thêm nhóm ' + (name.trim() || id), 'success');
  };
  window.tierManage = function () {
    const tiers = getTiers();
    const rows = tiers.map(t => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:16px">${tierIcon(t)}</span>
        <input value="${(t.name || '').replace(/"/g, '&quot;')}" data-tid="${t.id}" class="tm-name" style="flex:1;border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-size:13px">
        <input type="number" value="${t.markup}" data-tid="${t.id}" class="tm-mk" style="width:70px;text-align:right;border:1px solid var(--line);border-radius:6px;padding:6px" title="% so giá gốc"> %
        <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="window.tierDelete(${t.id})" title="Xóa nhóm">🗑</button>
      </div>`).join('');
    window.openModal('⚙ Quản lý nhóm bảng giá', `
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">Mỗi nhóm = 1 mức giá riêng cho 1 nhóm khách. Khách gán nhóm nào sẽ nhận bảng giá đó. % là điều chỉnh so với giá gốc.</div>
      ${rows || '<div style="color:var(--muted)">Chưa có nhóm.</div>'}
      ${tiers.length < 8 ? `<button class="btn btn-ghost btn-sm" onclick="window.closeModal();window.tierAdd()">＋ Thêm nhóm</button>` : ''}
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button><button class="btn btn-primary" onclick="window.tierSaveManage()">💾 Lưu</button>`,
      width: '480px'
    });
  };
  window.tierSaveManage = function () {
    const tiers = getTiers();
    document.querySelectorAll('.tm-name').forEach(inp => { const t = tiers.find(x => x.id === +inp.dataset.tid); if (t) t.name = inp.value.trim() || t.name; });
    document.querySelectorAll('.tm-mk').forEach(inp => { const t = tiers.find(x => x.id === +inp.dataset.tid); if (t) { const v = parseFloat(inp.value); if (!isNaN(v)) t.markup = v; } });
    saveTiers(tiers); window.closeModal(); renderBoard();
    window.toast('✓ Đã lưu nhóm bảng giá', 'success');
  };
  window.tierDelete = function (id) {
    if (!confirm('Xóa nhóm bảng giá này? (giá gốc + nhóm khác không ảnh hưởng)')) return;
    let tiers = getTiers().filter(t => t.id !== +id);
    saveTiers(tiers); if (boardTier === +id) boardTier = 0;
    window.closeModal(); renderBoard();
  };

  let currentCat = null;          // lọc danh mục
  let catQuery = '';              // tìm SP theo tên trong Danh mục
  const _catNorm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').trim();
  /* CHỈ cập nhật LƯỚI — KHÔNG dựng lại ô input (giữ bộ gõ tiếng Việt + focus) */
  window.catSearchInput = function (v) {
    catQuery = v;
    if (window.renderCatalogGrid) window.renderCatalogGrid();
  };
  function _syncCatSearchUI() {
    const clr = document.getElementById('catSearchClear');
    const cnt = document.getElementById('catSearchCount');
    const chips = document.getElementById('catChips');
    const q = _catNorm(catQuery);
    if (clr) clr.style.display = catQuery ? '' : 'none';
    if (chips) chips.style.display = q ? 'none' : '';
    if (cnt) {
      if (q) { cnt.style.display = ''; cnt.innerHTML = `🔍 Tìm "<b>${(catQuery || '').replace(/</g, '&lt;')}</b>" trên toàn bộ — <b>${(window._catLastCount || 0)}</b> kết quả`; }
      else cnt.style.display = 'none';
    }
  }
  let boardDate = maxDate();      // ngày đang xem ở bảng giá

  /* Lọc + sắp xếp cho bảng giá (board + marketing) */
  let boardSearch = '', boardCat = '', boardSort = { col: '', dir: 1 };
  const _norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  function applyBoardFilter(list) {
    let out = list.slice();
    if (boardSearch) { const q = _norm(boardSearch); out = out.filter(p => _norm(p.name).includes(q)); }
    if (boardCat) out = out.filter(p => p.cat === boardCat);
    if (boardSort.col === 'name') out.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi') * boardSort.dir);
    else if (boardSort.col === 'cat') out.sort((a, b) => (catMeta(a.cat).label || '').localeCompare(catMeta(b.cat).label || '', 'vi') * boardSort.dir || (a.name || '').localeCompare(b.name || '', 'vi'));
    return out;
  }
  const _sortArrow = col => boardSort.col === col ? (boardSort.dir > 0 ? ' ▲' : ' ▼') : ' ⇅';
  window.boardSortBy = function (col) {
    if (boardSort.col === col) boardSort.dir = -boardSort.dir; else { boardSort.col = col; boardSort.dir = 1; }
    const v = document.getElementById('boardView');
    if (v && v.style.display !== 'none') renderBoard(); else renderMkt();
  };
  function boardToolbarHTML() {
    const opts = `<option value="">Tất cả nhóm</option>` + CATS.map(c => `<option value="${c.id}" ${boardCat === c.id ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('');
    return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
        <input id="boardSearch" placeholder="🔍 Tìm tên sản phẩm..." value="${boardSearch.replace(/"/g, '&quot;')}" style="flex:1;min-width:200px;border:1px solid var(--line);border-radius:7px;padding:7px 11px;font-size:13px">
        <select id="boardCatSel" style="border:1px solid var(--line);border-radius:7px;padding:7px 11px;font-size:13px">${opts}</select>
        ${(boardSearch || boardCat || boardSort.col) ? `<button class="btn btn-ghost btn-sm" onclick="window.boardClearFilter()">✕ Xóa lọc</button>` : ''}
      </div>`;
  }
  function wireBoardToolbar(rerender) {
    const s = document.getElementById('boardSearch');
    if (s) s.oninput = (e) => { boardSearch = e.target.value; const p = s.selectionStart; rerender(); const s2 = document.getElementById('boardSearch'); if (s2) { s2.focus(); try { s2.setSelectionRange(p, p); } catch (e) {} } };
    const c = document.getElementById('boardCatSel');
    if (c) c.onchange = (e) => { boardCat = e.target.value; rerender(); };
  }
  window.boardClearFilter = function () {
    boardSearch = ''; boardCat = ''; boardSort = { col: '', dir: 1 };
    const v = document.getElementById('boardView');
    if (v && v.style.display !== 'none') renderBoard(); else renderMkt();
  };

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
    const tier = boardTier ? tierById(boardTier) : null;
    const rows = applyBoardFilter(ps).map(p => {
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
      /* Cột giá: GỐC = input bprice; NHÓM = giá nhóm (override hoặc gốc±%) */
      let priceCell, lastCell;
      if (!tier) {
        priceCell = `<input class="bprice" data-id="${p.id}" type="number" value="${todaySell}" style="width:110px;text-align:right;padding:6px 8px;border:1px solid var(--line);border-radius:6px">`;
        lastCell = `<td class="num">${delta}</td>`;
      } else {
        const hasOv = tier.overrides && tier.overrides[p.id] != null;
        const tp = tierPriceOf(tier, p.id, todaySell);
        priceCell = `<input class="tprice" data-id="${p.id}" type="number" value="${tp}" title="${hasOv ? 'Giá ghi đè riêng' : 'Giá gốc ' + (tier.markup >= 0 ? '+' : '') + tier.markup + '%'}" style="width:110px;text-align:right;padding:6px 8px;border:1px solid ${hasOv ? '#F59E0B' : 'var(--line)'};border-radius:6px;${hasOv ? 'background:#FEF9C3;font-weight:700' : ''}">`;
        lastCell = `<td class="num">${hasOv ? `<button class="btn btn-ghost btn-sm" title="Bỏ ghi đè, về giá gốc ±%" onclick="window.tierResetOverride('${p.id}')">↺</button>` : `<span style="color:var(--muted);font-size:11px">theo %</span>`}</td>`;
      }
      return `<tr data-id="${p.id}">
        <td><div class="checkbox" onclick="this.classList.toggle('on')"></div></td>
        <td><div style="display:flex;align-items:center;gap:8px">
          ${p.img ? `<img src="${p.img}" alt="" loading="lazy" style="width:34px;height:34px;object-fit:cover;border-radius:6px;background:#eef3ee;flex:none" onerror="this.style.visibility='hidden'">` : ''}
          <b>${p.name}</b></div></td>
        <td><span class="tag" style="background:${cat.color}20;color:${cat.color}">${cat.icon} ${cat.label}</span></td>
        <td style="color:var(--muted)">/${p.unit}</td>
        <td class="num" style="color:var(--muted)">${tier ? window.fmt(todaySell) : (prevSell != null ? window.fmt(prevSell) : '—')}</td>
        <td class="num">${priceCell}</td>
        ${lastCell}
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
          <button class="btn btn-sm btn-ghost" onclick="window.openExportTierPicker('pdf')" title="Mở cửa sổ in → chọn Save as PDF để lưu file PDF">🖨 Xuất PDF</button>
          <button class="btn btn-sm btn-primary" onclick="window.openExportTierPicker('html')" title="Tải file HTML (có ảnh embed) + tự gửi Telegram">📥 Tải HTML + gửi TG</button>
          ` : `
          <button class="btn btn-sm btn-ghost" onclick="window.location.href='settings.html'">⚙️ Cấu hình Telegram</button>
          <button class="btn btn-sm btn-ghost" onclick="window.openExportTierPicker('pdf')" title="Mở cửa sổ in → Save as PDF">🖨 Xuất PDF</button>
          <button class="btn btn-sm btn-primary" onclick="window.openExportTierPicker('html')" title="Tải file HTML có ảnh embed — gửi Zalo / mở offline">📥 Tải HTML</button>
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
          <button class="btn btn-ghost btn-sm" onclick="window.openExportTierPicker('pdf')" title="Mở popup print → Save as PDF">🖨 Xuất PDF</button>
          <button class="btn btn-ghost btn-sm" onclick="window.openExportTierPicker('html')" title="Tải HTML có ảnh embed + auto gửi Telegram">📥 Xuất HTML</button>
          <button class="btn btn-primary btn-sm" onclick="window.savePriceBoard()">💾 Lưu bảng giá ${fmtD(boardDate)}</button>
        </div>
      </div>
      ${tierBarHTML()}
      <div class="chart-card">
        ${boardToolbarHTML()}
        <table class="mini-table">
          <thead><tr>
            <th style="width:32px"><div id="boardSelectAll" class="checkbox" onclick="this.classList.toggle('on')" title="Chọn tất cả"></div></th>
            <th onclick="window.boardSortBy('name')" style="cursor:pointer;user-select:none" title="Bấm để sắp xếp theo tên">Sản phẩm${_sortArrow('name')}</th>
            <th onclick="window.boardSortBy('cat')" style="cursor:pointer;user-select:none" title="Bấm để sắp xếp theo nhóm">Nhóm${_sortArrow('cat')}</th><th>ĐVT</th>
            <th class="num">${tier ? 'Giá gốc' : 'Giá bán hôm qua'}</th><th class="num">${tier ? (tierIcon(tier) + ' ' + tier.name) : ('Giá bán ' + fmtD(boardDate))}</th><th class="num">${tier ? '' : 'Thay đổi'}</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">Không có SP nào khớp bộ lọc</td></tr>'}</tbody>
        </table>
        <div style="font-size:11.5px;color:var(--muted);margin-top:6px">Hiển thị ${applyBoardFilter(ps).length}/${ps.length} sản phẩm · tick để xóa / đổi nhóm / đặt giá hàng loạt</div>
      </div>`;

    document.getElementById('boardDateInp').addEventListener('change', e => {
      boardDate = e.target.value || window.todayISO();
      renderBoard();
    });
    /* Bulk ops cho bảng giá: chọn / đổi nhóm / đặt giá / xóa hàng loạt */
    if (window.attachBulkOps) {
      const tbl = document.querySelector('#boardView .mini-table');
      if (tbl) {
        if (!tbl.id) tbl.id = 'tblBoard';
        window.attachBulkOps({
          tableSelector: '#tblBoard',
          selectAllSelector: '#boardSelectAll',
          store: 'products',
          label: 'SP',
          actions: {
            changeStatus: { label: '🔄 Đổi nhóm', field: 'cat', options: CATS.map(c => ({ id: c.id, label: (c.icon || '') + ' ' + c.label })) },
            buttons: [{ label: boardTier ? '💲 Đặt giá nhóm' : '💲 Đặt giá bán', handler: (ids) => window.bulkSetBoardPrice(ids) }],
          }
        });
      }
    }
    /* Sửa tay giá nhóm → ghi đè riêng SP đó (auto-lưu) */
    document.querySelectorAll('.tprice').forEach(inp => {
      inp.addEventListener('change', () => {
        if (!boardTier) return;
        const tiers = getTiers(); const t = tiers.find(x => x.id === boardTier); if (!t) return;
        t.overrides = t.overrides || {};
        t.overrides[inp.dataset.id] = parseInt(inp.value, 10) || 0;
        saveTiers(tiers); renderBoard();
        window.toast('✓ Đã ghi đè giá nhóm cho SP', 'success');
      });
    });
    wireBoardToolbar(renderBoard);
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
    const rows = applyBoardFilter(ps).map(p => {
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
        ${boardToolbarHTML()}
        <table class="mini-table">
          <thead><tr>
            <th onclick="window.boardSortBy('name')" style="cursor:pointer;user-select:none" title="Sắp xếp theo tên">Sản phẩm${_sortArrow('name')}</th>
            <th onclick="window.boardSortBy('cat')" style="cursor:pointer;user-select:none" title="Sắp xếp theo nhóm">Nhóm${_sortArrow('cat')}</th><th>ĐVT</th>
            <th class="num">Giá bán thật</th><th class="num" style="background:#F5F3FF">Giá Marketing</th><th class="num">Chênh</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">Không có SP nào khớp bộ lọc</td></tr>'}</tbody>
        </table>
        <div style="font-size:11.5px;color:var(--muted);margin-top:6px">Hiển thị ${applyBoardFilter(ps).length}/${ps.length} sản phẩm</div>
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
    wireBoardToolbar(renderMkt);
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
      prompt: 'Đọc ảnh bảng giá nông sản (tiếng Việt). Trả về JSON mảng: [{"name":"tên sản phẩm tiếng Việt","price": số tiền VND dạng số nguyên (bỏ dấu chấm và đơn vị)}]. Chỉ lấy GIÁ BÁN.\n\n⚠️ ĐỌC ĐẦY ĐỦ: liệt kê HẾT MỌI DÒNG từ trên xuống dưới, KHÔNG bỏ sót dòng nào — kể cả chữ viết tay/mờ/nhiều cột. Nếu bảng có 50 dòng thì mảng phải đủ ~50 phần tử. Chỉ bỏ qua dòng KHÔNG rõ giá. CHỈ trả JSON, không giải thích.',
      onResult: applyAIPrices,
    });
  };
  function applyAIPrices(data) {
    const list = Array.isArray(data) ? data : (data.products || data.items || data.data || []);
    if (!list.length) { window.toast('Không đọc được sản phẩm nào từ ảnh', 'warn'); return; }
    const ps = products();
    let matched = 0; const miss = [];
    list.forEach(it => {
      const price = parseInt(String(it.price == null ? '' : it.price).replace(/[^0-9]/g, ''), 10) || 0;
      if (!it.name || !price) return;
      /* Matcher CHẶT — không khớp nhầm sang SP khác */
      const p = window.matchProductSmart ? window.matchProductSmart(it.name, ps)
        : ps.find(x => window.AI.norm(x.name) === window.AI.norm(it.name));
      if (p) { const inp = document.querySelector('.bprice[data-id="' + p.id + '"]'); if (inp) { inp.value = price; matched++; } }
      else miss.push(it.name);
    });
    window.toast(`✓ AI điền ${matched} giá${miss.length ? ' · ⚠️ ' + miss.length + ' SP chưa có trong DM: ' + miss.slice(0, 4).join(', ') + (miss.length > 4 ? '…' : '') : ''} — kiểm tra rồi bấm "Lưu bảng giá".`, matched ? 'success' : 'warn');
    if (miss.length) console.warn('[AI giá] SP chưa khớp DM:', miss);
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
  /* priceFn + tên cho 1 nhóm (0 = Gốc) → dùng khi xuất/gửi báo giá */
  function tierExportOpts(tierId) {
    const tier = tierId ? tierById(tierId) : null;
    if (!tier) return {};
    return {
      priceFn: (p) => { const e = window.priceEntryOn(p, boardDate); return tierPriceOf(tier, p.id, e ? e.sell : 0); },
      tierName: tierIcon(tier) + ' ' + tier.name,
    };
  }
  /* Bộ chọn nhóm giá trước khi xuất PDF / HTML */
  window.openExportTierPicker = function (mode) {
    const tiers = getTiers();
    let btns = `<button class="btn btn-ghost" style="justify-content:flex-start" onclick="window._doExport('${mode}',0)">📋 Gốc — giá hệ thống</button>`;
    tiers.forEach(t => btns += `<button class="btn btn-ghost" style="justify-content:flex-start" onclick="window._doExport('${mode}',${t.id})">${tierIcon(t)} ${t.name} <span style="opacity:.7">(${t.markup >= 0 ? '+' : ''}${t.markup}%)</span></button>`);
    window.openModal(mode === 'pdf' ? '🖨 Xuất PDF — chọn nhóm giá' : '📥 Xuất / Gửi HTML — chọn nhóm giá', `
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">Chọn bảng giá theo nhóm khách để xuất file (giá đã tính theo % / ghi đè của nhóm):</div>
      <div style="display:flex;flex-direction:column;gap:8px">${btns}</div>
    `, { footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>`, width: '440px' });
  };
  window._doExport = function (mode, tierId) {
    window.closeModal();
    if (mode === 'pdf') window.exportPriceBoardPDF(+tierId);
    else window.sendPriceBoard(+tierId);
  };

  window.sendPriceBoard = async function (tierId) {
    if (!window.PriceCatalogue) { window.toast('Chưa tải module báo giá', 'warn'); return; }
    window.toast('Đang tạo file HTML báo giá (kèm ảnh sản phẩm)…', 'info');
    try {
      await window.PriceCatalogue.export(boardDate, tierExportOpts(tierId));
      window.STORE.set('priceBoardLastSent', new Date().toLocaleString('vi-VN'));
      renderBoard();
    } catch (e) { window.toast('Lỗi tạo file: ' + e.message, 'warn'); }
  };

  /* === Xuất PDF — mở popup window có nút In / Save as PDF === */
  window.exportPriceBoardPDF = async function (tierId) {
    if (!window.PriceCatalogue) { window.toast('Chưa tải module báo giá', 'warn'); return; }
    try {
      await window.PriceCatalogue.exportPDF(boardDate, tierExportOpts(tierId));
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

  /* Đặt GIÁ BÁN hàng loạt trong Bảng giá — Gốc: set giá bán; Nhóm: ghi đè giá nhóm */
  window.bulkSetBoardPrice = function (ids) {
    const tier = boardTier ? tierById(boardTier) : null;
    const val = prompt(`Đặt ${tier ? 'GIÁ NHÓM "' + tier.name + '"' : 'GIÁ BÁN'} cho ${ids.length} SP đã chọn (đ):`, '');
    if (val == null) return;
    const v = parseInt(String(val).replace(/[^\d]/g, ''), 10);
    if (isNaN(v) || v < 0) { window.toast('Nhập số hợp lệ', 'warn'); return; }
    if (tier) {
      const tiers = getTiers(); const t = tiers.find(x => x.id === boardTier); if (!t) return;
      t.overrides = t.overrides || {};
      ids.forEach(id => { t.overrides[id] = v; });
      saveTiers(tiers);
    } else {
      ids.forEach(id => {
        const p = window.productById(id); if (!p) return;
        const last = window.priceEntryOn(p, boardDate) || { buy: 0, sell: 0 };
        const hist = (p.priceHistory || []).map(h => ({ ...h }));
        const ex = hist.find(h => h.date === boardDate);
        if (ex) ex.sell = v; else hist.push({ date: boardDate, buy: last.buy || 0, sell: v });
        window.STORE.update('products', id, { priceHistory: hist });
      });
    }
    if (window._bulkClear_products) window._bulkClear_products();
    renderBoard();
    window.toast(`✓ Đã đặt giá ${window.fmt(v)} cho ${ids.length} SP`, 'success');
  };

  /* Đặt GIÁ NHẬP hàng loạt cho các SP đã chọn (ngày hôm nay) */
  window.bulkSetBuyPrice = function (ids) {
    const val = prompt(`Đặt GIÁ NHẬP cho ${ids.length} SP đã chọn (đ/đvt):`, '');
    if (val == null) return;
    const v = parseInt(String(val).replace(/[^\d]/g, ''), 10);
    if (isNaN(v) || v < 0) { window.toast('Nhập số hợp lệ', 'warn'); return; }
    const today = window.todayISO();
    let n = 0;
    ids.forEach(id => {
      const p = window.productById(id); if (!p) return;
      const last = window.priceEntryOn(p, today) || { buy: 0, sell: 0 };
      const hist = (p.priceHistory || []).map(h => ({ ...h }));
      const ex = hist.find(h => h.date === today);
      if (ex) ex.buy = v; else hist.push({ date: today, buy: v, sell: last.sell || 0 });
      window.STORE.update('products', id, { priceHistory: hist }); n++;
    });
    if (window._bulkClear_products) window._bulkClear_products();
    renderCatalog();
    window.toast(`✓ Đã đặt giá nhập ${window.fmt(v)} cho ${n} SP`, 'success');
  };

  /* ============ DANH MỤC SẢN PHẨM ============ */
  /* Build danh sách SP card (theo nhóm hoặc theo từ khoá tìm) — dùng chung */
  function _catRows(ps) {
    ps = ps || products();
    const catOrder = {};
    CATS.forEach((c, i) => catOrder[c.id] = i);
    const q = _catNorm(catQuery);
    const list = ps.filter(p => q ? (_catNorm(p.name).includes(q) || _catNorm(p.id).includes(q)) : (!currentCat || p.cat === currentCat))
      .sort((a, b) => {
        const ca = catOrder[a.cat] ?? 999, cb = catOrder[b.cat] ?? 999;
        if (ca !== cb) return ca - cb;
        return (a.name || '').localeCompare(b.name || '', 'vi');
      });
    window._catLastCount = list.length;
    const rows = list.map(p => {
      const cat = catMeta(p.cat);
      const e = window.priceEntryOn(p, window.todayISO());
      const buy = e ? e.buy : 0, sell = e ? e.sell : 0;
      return `<div class="cat-card" data-id="${p.id}" style="display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:#fff">
        <div class="checkbox" onclick="this.classList.toggle('on')" style="flex:none"></div>
        <div onclick="event.stopPropagation();window.quickEditProductImage('${p.id}')" title="Bấm để đổi ảnh trực tiếp" style="position:relative;width:42px;height:42px;cursor:pointer;flex:none">
          ${p.img ? `<img src="${p.img}" alt="" loading="lazy" style="width:42px;height:42px;object-fit:cover;border-radius:7px;background:#eef3ee" onerror="this.parentElement.querySelector('.ph')?(this.style.display='none'):null">` : ''}
          ${p.img ? '' : `<div class="ph" style="width:42px;height:42px;border-radius:7px;background:#eef3ee;display:grid;place-items:center;color:#9CA3AF;font-size:15px">📷</div>`}
          <span style="position:absolute;right:-4px;bottom:-4px;background:var(--navy);color:#fff;border-radius:50%;width:17px;height:17px;display:grid;place-items:center;font-size:9px;box-shadow:0 1px 3px rgba(0,0,0,.3)">✎</span>
        </div>
        <div style="flex:1;min-width:0">
          <div data-field="name" title="Click để sửa tên SP" style="line-height:1.3"><b>${p.name}</b><div style="color:var(--muted);font-size:11px">${p.en || p.note || ''}</div></div>
          <div style="display:flex;align-items:center;gap:7px;margin-top:4px;flex-wrap:wrap">
            <span data-field="cat" title="Click để đổi nhóm"><span class="tag" style="background:${cat.color}20;color:${cat.color}">${cat.icon} ${cat.label}</span></span>
            <span data-field="unit" title="Click để sửa đơn vị tính" style="color:var(--muted);font-size:11.5px">/${p.unit}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex:none">
          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px">Giá nhập</div>
          <input class="cat-price" data-id="${p.id}" data-field="buy" type="number" value="${buy}" style="width:110px;text-align:right;padding:5px 8px;border:1px solid var(--line);border-radius:6px;font-weight:700">
          <div style="display:flex;gap:2px">
            <button class="icon-btn" title="Sửa chi tiết SP (tên/nhóm/đvt)" onclick="event.stopPropagation();window.editProduct('${p.id}')">✏️</button>
            <button class="icon-btn" title="Xóa sản phẩm" style="color:var(--danger)" onclick="event.stopPropagation();window.deleteProduct('${p.id}')">🗑</button>
          </div>
        </div>
      </div>`;
    }).join('') || `<div style="grid-column:1/-1;padding:30px;text-align:center;color:var(--muted)">${_catNorm(catQuery) ? 'Không tìm thấy SP nào khớp.' : 'Chưa có sản phẩm.'}</div>`;
    return { rows, count: list.length };
  }
  /* Chỉ cập nhật lưới + đếm — KHÔNG đụng ô input (bộ gõ tiếng Việt an toàn) */
  window.renderCatalogGrid = function () {
    const g = document.getElementById('catalogGrid');
    if (!g) { renderCatalog(); return; }
    g.innerHTML = _catRows().rows;
    _syncCatSearchUI();
  };

  function renderCatalog() {
    const ps = products();
    const counts = { all: ps.length };
    ps.forEach(p => counts[p.cat] = (counts[p.cat] || 0) + 1);
    const chips = `<button class="chip ${!currentCat ? 'active' : ''}" onclick="window.filterCat(null)">Tất cả <span class="cnt">${counts.all}</span></button>` +
      CATS.map(c => `<button class="chip ${currentCat === c.id ? 'active' : ''}" onclick="window.filterCat('${c.id}')" style="${currentCat === c.id ? 'background:' + c.color + ';color:#fff;border-color:' + c.color : ''}">${c.icon} ${c.label} <span class="cnt">${counts[c.id] || 0}</span></button>`).join('') +
      `<button class="chip" onclick="window.openCategoryManager && window.openCategoryManager()" style="border-style:dashed;color:var(--navy)" title="Đổi biểu tượng / tên danh mục">🏷️ Quản lý danh mục</button>`;

    const { rows } = _catRows(ps);
    document.getElementById('catalogView').innerHTML = `
      <div class="chart-card" style="margin-bottom:14px">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div style="font-size:12.5px;color:var(--muted);flex:1;min-width:180px">💡 <b>Chỉnh giá trực tiếp</b> ở ô bên dưới (lưu tự động vào bảng giá hôm nay), hoặc nhập hàng loạt / từ ảnh:</div>
          <button class="btn btn-ghost btn-sm" onclick="window.aiFillCatalog()">📷 Cập nhật giá bằng ảnh (AI)</button>
          <button class="btn btn-ghost btn-sm" onclick="window.openBulkPriceImport()">📥 Nhập hàng loạt (paste Excel)</button>
        </div>
      </div>
      <div style="margin-bottom:10px;position:relative">
        <input id="catSearch" oninput="window.catSearchInput(this.value)" placeholder="🔍 Tìm sản phẩm theo tên / mã (vd: cà chua, SP243)..." autocomplete="off" style="width:100%;border:1px solid var(--line);border-radius:9px;padding:10px 38px 10px 14px;font-size:13.5px;outline:none">
        <button id="catSearchClear" onclick="window.catSearchInput('')" title="Xoá tìm" style="display:none;position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:16px">✕</button>
      </div>
      <div id="catSearchCount" style="font-size:12px;color:#15803D;font-weight:600;margin-bottom:10px;display:none"></div>
      <div class="quick-chips" id="catChips" style="margin-bottom:14px">${chips}</div>
      <div style="display:flex;align-items:center;gap:9px;margin-bottom:10px;padding:8px 12px;background:#fff;border:1px solid var(--line);border-radius:9px">
        <div id="catSelectAll" class="checkbox" onclick="this.classList.toggle('on')" title="Chọn / bỏ tất cả"></div>
        <span style="font-size:12.5px;color:var(--muted)">Chọn tất cả · tick từng SP để <b>sửa nhóm / xóa hàng loạt</b> (thanh thao tác hiện ở dưới)</span>
      </div>
      <div id="catalogGrid" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">${rows}</div>`;
    /* khôi phục giá trị ô tìm sau khi dựng lại view (đổi tab/nhóm) */
    const se = document.getElementById('catSearch'); if (se) se.value = catQuery || '';
    _syncCatSearchUI();

    /* Wire inline edit cho giá (input có sẵn) */
    document.querySelectorAll('#catalogView .cat-price').forEach(inp => {
      inp.addEventListener('change', () => savePriceInline(inp.dataset.id, inp.dataset.field, parseInt(inp.value, 10) || 0));
    });

    /* Bulk operations cho sản phẩm */
    if (window.attachBulkOps) {
      const tbl = document.getElementById('catalogGrid');
      if (tbl) {
        
        window.attachBulkOps({
          tableSelector: '#' + tbl.id,
          selectAllSelector: '#catSelectAll',
          store: 'products',
          label: 'SP',
          actions: {
            changeStatus: {
              label: '🔄 Đổi nhóm',
              field: 'cat',
              options: CATS.map(c => ({ id: c.id, label: (c.icon || '') + ' ' + c.label }))
            },
            buttons: [
              { label: '💲 Đặt giá nhập', handler: (ids) => window.bulkSetBuyPrice(ids) },
            ]
          }
        });
      }
    }

    /* Inline edit cho name/cat/unit (click cell = sửa) */
    if (window.attachInlineEdit) {
      const tbl = document.getElementById('catalogGrid');
      if (tbl) {
        
        window.attachInlineEdit('#' + tbl.id, {
          store: 'products',
          fields: {
            name: { type: 'text',
                    format: (v, row) => `<b>${v}</b><div style="color:var(--muted);font-size:11px">${row?.en || row?.note || ''}</div>` },
            cat:  { type: 'select',
                    options: () => CATS.map(c => ({ value: c.id, label: (c.icon||'') + ' ' + c.label })),
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
    const ps = products(); let n = 0, created = 0; const today = window.todayISO();
    lines.forEach(ln => {
      const parts = ln.split(/\t|,|;|\|/).map(s => s.trim());
      if (parts.length < 2) return;
      const name = parts[0];
      const buy = parseInt(String(parts[1]).replace(/[^0-9]/g, ''), 10) || 0;
      const sell = parseInt(String(parts[2] || parts[1]).replace(/[^0-9]/g, ''), 10) || 0;
      const nm = window.AI ? window.AI.norm(name) : name.toLowerCase();
      const p = ps.find(x => (window.AI ? window.AI.norm(x.name) : x.name.toLowerCase()) === nm)
        || ps.find(x => { const xn = window.AI ? window.AI.norm(x.name) : x.name.toLowerCase(); return xn.includes(nm) || nm.includes(xn); });
      if (!p) {
        /* Chưa khớp → TẠO SP MỚI (nhóm Khác, chưa ảnh) → hiện trong Danh mục để thêm ảnh */
        window.STORE.add('products', { id: window.STORE.nextId('products', 'SP', 3), name, cat: 'khac', unit: 'kg', img: '', priceHistory: [{ date: today, buy, sell: sell || buy }] });
        created++;
        return;
      }
      const hist = [...(p.priceHistory || [])];
      const ex = hist.find(h => h.date === today);
      if (ex) { if (buy) ex.buy = buy; if (sell) ex.sell = sell; }
      else { const last = window.priceEntryOn(p, today) || { buy: 0, sell: 0 }; hist.push({ date: today, buy: buy || last.buy, sell: sell || last.sell }); }
      window.STORE.update('products', p.id, { priceHistory: hist });
      n++;
    });
    window.closeModal();
    window.toast(`✓ Cập nhật ${n} SP${created ? ` · ➕ tạo mới ${created} SP (nhóm Khác — vào Danh mục thêm ảnh)` : ''}`, 'success');
    renderCatalog();
  };

  /* ====== AI điền giá vào catalog (cả buy + sell) ====== */
  window.aiFillCatalog = function () {
    if (!window.AI) { window.toast('Chưa tải module AI', 'warn'); return; }
    window.AI.openFillModal({
      task: 'product',
      title: '📷 Cập nhật giá catalog bằng ảnh (AI)',
      guideHtml: 'Đính kèm <b>ảnh bảng giá</b> (viết tay / Excel / Zalo / báo giá NCC). AI đọc tên SP + giá nhập + giá bán (nếu có) → tự cập nhật vào catalog hôm nay.',
      prompt: 'Đọc ảnh bảng giá nông sản (tiếng Việt). Trả JSON mảng: [{"name":"tên SP","buy": giá nhập VND nguyên (0 nếu không có), "sell": giá bán VND nguyên}]. Số bỏ dấu chấm/đơn vị.\n\n⚠️ ĐỌC ĐẦY ĐỦ: liệt kê HẾT MỌI DÒNG từ trên xuống dưới, KHÔNG bỏ sót dòng nào — kể cả chữ viết tay/mờ/nhiều cột. Nếu bảng có 50 dòng thì mảng phải đủ ~50 phần tử. CHỈ trả JSON.',
      onResult: (data) => {
        const list = Array.isArray(data) ? data : (data.products || data.items || []);
        if (!list.length) { window.toast('Không đọc được SP từ ảnh', 'warn'); return; }
        const ps = products(); let n = 0, created = 0; const today = window.todayISO();
        list.forEach(it => {
          const buy = parseInt(String(it.buy == null ? '' : it.buy).replace(/[^0-9]/g, ''), 10) || 0;
          const sell = parseInt(String(it.sell == null ? '' : it.sell).replace(/[^0-9]/g, ''), 10) || 0;
          /* Matcher CHẶT — không khớp nhầm; không khớp = tạo SP mới (đúng ý đồ catalog) */
          const p = window.matchProductSmart ? window.matchProductSmart(it.name, ps)
            : ps.find(x => window.AI.norm(x.name) === window.AI.norm(it.name));
          if (!p) {
            if (!it.name || !String(it.name).trim()) return;
            window.STORE.add('products', { id: window.STORE.nextId('products', 'SP', 3), name: String(it.name).trim(), cat: 'khac', unit: 'kg', img: '', priceHistory: (buy || sell) ? [{ date: today, buy, sell: sell || buy }] : [] });
            created++;
            return;
          }
          if (!buy && !sell) return;
          const hist = [...(p.priceHistory || [])];
          const ex = hist.find(h => h.date === today);
          if (ex) { if (buy) ex.buy = buy; if (sell) ex.sell = sell; }
          else { const last = window.priceEntryOn(p, today) || { buy: 0, sell: 0 }; hist.push({ date: today, buy: buy || last.buy, sell: sell || last.sell }); }
          window.STORE.update('products', p.id, { priceHistory: hist });
          n++;
        });
        window.toast(`🤖 AI cập nhật ${n} SP${created ? ` · ➕ tạo mới ${created} SP (nhóm Khác — vào Danh mục thêm ảnh)` : ''}`, 'success');
        renderCatalog();
      },
    });
  };

  window.filterCat = function (id) { currentCat = id; catQuery = ''; renderCatalog(); };

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
        <div><label>Giá nhập hôm nay (₫) *</label><input id="pBuy" type="number" value="${e ? e.buy : ''}" placeholder="0"></div>
        <div></div>
      </div>
      <div class="form-row wide">
        <label>🖼 Ảnh sản phẩm</label>
        <div style="display:flex;align-items:center;gap:12px">
          <img id="pImgPreview" src="${p && p.img ? p.img : ''}" alt="" style="width:74px;height:74px;object-fit:cover;border-radius:10px;border:1px solid var(--line);background:#f3f7f3;${p && p.img ? '' : 'visibility:hidden'}" onerror="this.style.visibility='hidden'">
          <div style="display:flex;flex-direction:column;gap:6px">
            <input type="file" id="pImgFile" accept="image/*" style="display:none" onchange="window._prodPickImage(this)">
            <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('pImgFile').click()">📷 Chọn / Đổi ảnh</button>
            <button type="button" class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="window._prodClearImage()">🗑 Xóa ảnh</button>
          </div>
          <input type="hidden" id="pImg" value="${p && p.img ? String(p.img).replace(/"/g, '&quot;') : ''}">
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">Ảnh tự nén nhỏ (~400px) lưu kèm SP → đồng bộ mọi máy. Để trống = không có ảnh.</div>
      </div>`;
  }

  /* Chọn ảnh từ máy → nén canvas → base64 vào #pImg */
  window._prodPickImage = function (input) {
    const f = input.files && input.files[0];
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) { window.toast('Ảnh quá lớn (>12MB)', 'warn'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const MAX = 400;
        let w = img.width, h = img.height;
        if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        let data;
        try { data = cv.toDataURL('image/jpeg', 0.82); }
        catch (e) { window.toast('Không đọc được ảnh', 'warn'); return; }
        const fld = document.getElementById('pImg'); if (fld) fld.value = data;
        const pv = document.getElementById('pImgPreview'); if (pv) { pv.src = data; pv.style.visibility = 'visible'; }
        window.toast('✓ Đã chọn ảnh · ' + Math.round(data.length / 1024) + 'KB', 'success');
      };
      img.onerror = () => window.toast('File không phải ảnh hợp lệ', 'warn');
      img.src = ev.target.result;
    };
    reader.readAsDataURL(f);
  };
  window._prodClearImage = function () {
    const fld = document.getElementById('pImg'); if (fld) fld.value = '';
    const pv = document.getElementById('pImgPreview'); if (pv) { pv.src = ''; pv.style.visibility = 'hidden'; }
    const file = document.getElementById('pImgFile'); if (file) file.value = '';
    window.toast('Đã xóa ảnh sản phẩm', 'info');
  };

  /* Nén ảnh file → base64 (~400px) rồi callback */
  function _resizeToBase64(file, cb) {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { window.toast('Ảnh quá lớn (>12MB)', 'warn'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const im = new Image();
      im.onload = () => {
        const MAX = 400; let w = im.width, h = im.height;
        if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(im, 0, 0, w, h);
        try { cb(cv.toDataURL('image/jpeg', 0.82)); } catch (e) { window.toast('Không đọc được ảnh', 'warn'); }
      };
      im.onerror = () => window.toast('File không phải ảnh hợp lệ', 'warn');
      im.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  /* Đổi ảnh SP TRỰC TIẾP từ danh mục (không cần mở form sửa) */
  let _pendingImg = null;
  window.quickEditProductImage = function (id) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      _resizeToBase64(f, data => {
        _pendingImg = { id, data };   // chưa lưu — chờ bấm "Lưu ảnh"
        const p = (products() || []).find(x => x.id === id) || {};
        window.openModal('🖼️ Đổi ảnh sản phẩm',
          `<div style="text-align:center">
             <div style="font-size:13px;color:var(--muted);margin-bottom:8px"><b>${p.name || ''}</b> — xem trước ảnh mới:</div>
             <img src="${data}" alt="" style="max-width:100%;max-height:320px;border-radius:10px;border:1px solid var(--line);object-fit:contain">
             <div style="font-size:12px;color:var(--muted);margin-top:8px">${Math.round(data.length / 1024)}KB · Bấm <b>Lưu ảnh</b> để áp dụng</div>
           </div>`,
          { width: '440px',
            footer: `<button class="btn btn-ghost" onclick="window.cancelProductImage()">Hủy</button>
                     <button class="btn btn-primary" onclick="window.saveProductImage()">💾 Lưu ảnh</button>` });
      });
    };
    inp.click();
  };
  window.cancelProductImage = function () { _pendingImg = null; window.closeModal(); };
  window.saveProductImage = function () {
    if (!_pendingImg) return;
    window.STORE.update('products', _pendingImg.id, { img: _pendingImg.data });
    const kb = Math.round(_pendingImg.data.length / 1024);
    _pendingImg = null;
    window.closeModal();
    window.toast('✓ Đã lưu ảnh · ' + kb + 'KB', 'success');
    renderCatalog();
  };

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
    if (!name) { window.toast('Nhập tên sản phẩm', 'warn'); return; }
    const cat = window.formVal('#pCat');
    const unit = (window.formVal('#pUnit') || 'kg').toLowerCase();
    const note = window.formVal('#pNote');
    const buy = parseInt(window.formVal('#pBuy'), 10) || 0;
    const imgEl = document.getElementById('pImg');
    const img = imgEl ? imgEl.value : '';
    const today = window.todayISO();

    if (id) {
      const p = window.productById(id);
      const hist = [...(p.priceHistory || [])];
      const ex = hist.find(h => h.date === today);
      /* Chỉ cập nhật giá nhập — giữ nguyên giá bán đã có (không ghi đè về 0) */
      if (ex) { ex.buy = buy; } else {
        const prevSell = (window.priceEntryOn(p, today) || {}).sell || 0;
        hist.push({ date: today, buy, sell: prevSell });
      }
      window.STORE.update('products', id, { name, cat, unit, note, priceHistory: hist, img });
      window.toast('✓ Đã cập nhật ' + name, 'success');
    } else {
      window.STORE.add('products', {
        id: window.STORE.nextId('products', 'SP', 3),
        name, cat, unit, note, img,
        priceHistory: [{ date: today, buy, sell: 0 }],
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
    const today = window.todayISO();
    let added = 0;
    records.forEach((r) => {
      if (!r.name || !String(r.name).trim()) return;
      const buy = parseInt(r.buyPrice) || 0;
      const sell = parseInt(r.sellPrice) || Math.round(buy * 1.55);
      /* STORE.add → insert thẳng lên cloud (không dính bug same-reference của set) */
      window.STORE.add('products', {
        id: window.STORE.nextId('products', 'SP', 3),
        name: String(r.name).trim(),
        en: r.en || '',
        cat: r.cat || 'khac',
        unit: r.unit || 'kg',
        img: '',
        priceHistory: buy ? [{ date: today, buy, sell }] : [],
      });
      added++;
    });
    window.audit && window.audit.log('product.bulkImport', `+${added} SP từ ${src}`);
    window.toast(`✓ Đã thêm ${added} SP từ ${src} — vào Danh mục để thêm ảnh`, 'success');
    renderCatalog();
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
