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

  /* Ô nhập giá hiển thị định dạng tiền (16.000) — gõ tới đâu format tới đó.
     Đọc lại bằng _pmoney() (bỏ dấu chấm). */
  window.fmtMoneyInput = function (el) {
    const d = String(el.value).replace(/\D/g, '');
    el.value = d ? (+d).toLocaleString('vi-VN') : '';
  };
  const _pmoney = v => parseInt(String(v).replace(/\D/g, ''), 10) || 0;
  const _mfmt = n => (+n || 0).toLocaleString('vi-VN');

  function tierBarHTML() {
    const tiers = getTiers();
    let s = `<div class="chart-card" style="margin-bottom:14px"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-size:12.5px;color:var(--muted);font-weight:700">📊 Nhóm bảng giá:</span>
      <span class="tier-btns" style="display:contents">
      <button class="btn btn-sm ${boardTier === 0 ? 'btn-primary' : 'btn-ghost'}" onclick="window.boardSwitchTier(0)">📋 Gốc</button>`;
    tiers.forEach(t => {
      s += `<button class="btn btn-sm ${boardTier === t.id ? 'btn-primary' : 'btn-ghost'}" onclick="window.boardSwitchTier(${t.id})">${tierIcon(t)} ${t.name} <span style="opacity:.7">(${t.markup >= 0 ? '+' : ''}${t.markup}%)</span></button>`;
    });
    if (tiers.length < 8) s += `<button class="btn btn-sm btn-ghost" style="border-style:dashed" onclick="window.tierAdd()">＋ Thêm nhóm</button>`;
    s += `</span>`;
    /* MOBILE: chọn nhóm bằng dropdown cho gọn (thay hàng nút) */
    s += `<select class="tier-select" onchange="window.boardSwitchTier(this.value)">
      <option value="0" ${boardTier === 0 ? 'selected' : ''}>📋 Gốc (giá bán thật)</option>
      ${tiers.map(t => `<option value="${t.id}" ${boardTier === t.id ? 'selected' : ''}>${tierIcon(t)} ${t.name} (${t.markup >= 0 ? '+' : ''}${t.markup}%)</option>`).join('')}
    </select>`;
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
    const searching = !!boardSearch;
    /* Khi đang tìm: lọc + XẾP HẠNG theo độ khớp (khớp đầu/đúng từ lên trước) — giữ thứ hạng, không sort lại theo tên */
    if (searching) {
      out = window.rankProducts ? window.rankProducts(out, boardSearch)
                                : out.filter(p => _norm(p.name).includes(_norm(boardSearch)));
    }
    if (boardCat) out = out.filter(p => p.cat === boardCat);
    if (!searching) {
      if (boardSort.col === 'name') out.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi') * boardSort.dir);
      else if (boardSort.col === 'cat') out.sort((a, b) => (catMeta(a.cat).label || '').localeCompare(catMeta(b.cat).label || '', 'vi') * boardSort.dir || (a.name || '').localeCompare(b.name || '', 'vi'));
    }
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
        priceCell = `<input class="bprice" data-id="${p.id}" type="text" inputmode="numeric" oninput="window.fmtMoneyInput(this)" value="${todaySell ? _mfmt(todaySell) : ''}" style="width:110px;text-align:right;padding:6px 8px;border:1px solid var(--line);border-radius:6px">`;
        lastCell = `<td class="num hide-xs">${delta}</td>`;
      } else {
        const hasOv = tier.overrides && tier.overrides[p.id] != null;
        const tp = tierPriceOf(tier, p.id, todaySell);
        priceCell = `<input class="tprice" data-id="${p.id}" type="text" inputmode="numeric" oninput="window.fmtMoneyInput(this)" value="${tp ? _mfmt(tp) : ''}" title="${hasOv ? 'Giá ghi đè riêng' : 'Giá gốc ' + (tier.markup >= 0 ? '+' : '') + tier.markup + '%'}" style="width:110px;text-align:right;padding:6px 8px;border:1px solid ${hasOv ? '#F59E0B' : 'var(--line)'};border-radius:6px;${hasOv ? 'background:#FEF9C3;font-weight:700' : ''}">`;
        lastCell = `<td class="num hide-xs">${hasOv ? `<button class="btn btn-ghost btn-sm" title="Bỏ ghi đè, về giá gốc ±%" onclick="window.tierResetOverride('${p.id}')">↺</button>` : `<span style="color:var(--muted);font-size:11px">theo %</span>`}</td>`;
      }
      return `<tr data-id="${p.id}">
        <td class="hide-xs"><div class="checkbox" onclick="this.classList.toggle('on')"></div></td>
        <td data-field="name"><div style="display:flex;align-items:center;gap:8px">
          ${p.img ? `<img class="lazy-prodimg" data-pid="${p.id}" alt="" style="width:34px;height:34px;object-fit:cover;border-radius:6px;background:#eef3ee;flex:none" onerror="this.style.visibility='hidden'">` : ''}
          <b>${p.name}</b></div></td>
        <td data-field="cat"><span class="tag" style="background:${cat.color}20;color:${cat.color}">${cat.icon} ${cat.label}</span></td>
        <td data-field="unit" style="color:var(--muted)">/${p.unit}</td>
        <td data-field="ref" class="num" style="color:var(--muted)">${tier ? window.fmt(todaySell) : (prevSell != null ? window.fmt(prevSell) : '—')}</td>
        <td data-field="price" class="num">${priceCell}</td>
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
            <div class="tg-title" style="font-weight:700;color:${tgOn ? 'var(--ok)' : 'var(--warn)'}">${tgOn ? 'Thông báo giá qua Telegram: ĐÃ KẾT NỐI' : 'Thông báo giá qua Telegram: CHƯA KẾT NỐI'}</div>
            <div class="hide-xs" style="font-size:12.5px;color:var(--muted);margin-top:2px">${tgOn
              ? 'Bấm "Tạo & gửi" → app dựng <b>file báo giá đẹp (đúng mẫu, kèm ảnh)</b>, tải về máy <b>VÀ tự gửi Telegram</b> dạng file đính kèm.' + (lastSent ? ' · Gần nhất: <b>' + lastSent + '</b>' : ' · Chưa gửi lần nào.')
              : '⚠️ Telegram chưa cấu hình → app vẫn tạo <b>file báo giá (đúng mẫu)</b> để bạn tải về & gửi Zalo. Bấm "Cấu hình Telegram" để điền Bot Token + Chat ID, app sẽ tự gửi lần sau.'}</div>
          </div>
          ${tgOn ? `
          <button class="btn btn-sm btn-ghost hide-xs" onclick="window.PriceAutoSend && window.PriceAutoSend.openConfig()" title="Bật/tắt tự động gửi mỗi sáng + cấu hình giờ. Chỉ gửi khi giá đổi so hôm qua.">🤖 Auto hằng ngày</button>
          <button class="btn btn-sm btn-ghost hide-xs" onclick="window.PriceAutoSend && window.PriceAutoSend.sendNowIfChanged()" title="Kiểm tra giá đổi và gửi ngay (skip nếu không đổi để tránh spam)">📤 Gửi ngay (nếu đổi)</button>
          <button class="btn btn-sm btn-ghost" onclick="window.openExportTierPicker('pdf')" title="Mở cửa sổ in → chọn Save as PDF để lưu file PDF">🖨 Xuất PDF</button>
          <button class="btn btn-sm btn-primary hide-xs" onclick="window.openExportTierPicker('html')" title="Tải file HTML (có ảnh embed) + tự gửi Telegram">📥 Tải HTML + gửi TG</button>
          ` : `
          <button class="btn btn-sm btn-ghost" onclick="window.location.href='settings.html'">⚙️ Cấu hình Telegram</button>
          <button class="btn btn-sm btn-ghost" onclick="window.openExportTierPicker('pdf')" title="Mở cửa sổ in → Save as PDF">🖨 Xuất PDF</button>
          <button class="btn btn-sm btn-primary" onclick="window.openExportTierPicker('html')" title="Tải file HTML có ảnh embed — gửi Zalo / mở offline">📥 Tải HTML</button>
          `}
        </div>
      </div>`;
    document.getElementById('boardView').innerHTML = tgBanner + `
      <div class="chart-card" style="margin-bottom:14px">
        <div class="board-toolbar" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <div class="bt-date"><label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px">Ngày áp dụng</label>
            <input type="date" id="boardDateInp" value="${boardDate}" style="padding:7px 10px;border:1px solid var(--line);border-radius:7px"></div>
          <div class="bt-spacer" style="flex:1"></div>
          <button class="btn btn-ghost btn-sm" onclick="window.aiFillPrices()">📷 Cập nhật giá bằng ảnh (AI)</button>
          <button class="btn btn-ghost btn-sm" onclick="window.copyYesterday()">📋 Sao chép giá hôm qua</button>
          <button class="btn btn-ghost btn-sm hide-xs" onclick="window.copyPriceText()" title="Copy text gọn dán Zalo">📋 Copy text</button>
          <button class="btn btn-ghost btn-sm" onclick="window.PriceAutoSend && window.PriceAutoSend.previewDiff()" title="Xem nhanh SP nào đổi giá so hôm qua">🔍 So sánh giá</button>
          <button class="btn btn-ghost btn-sm" onclick="window.openExportTierPicker('pdf')" title="Mở popup print → Save as PDF">🖨 Xuất PDF</button>
          <button class="btn btn-ghost btn-sm hide-xs" onclick="window.openExportTierPicker('html')" title="Tải HTML có ảnh embed + auto gửi Telegram">📥 Xuất HTML</button>
          <button class="btn btn-primary btn-sm" onclick="window.savePriceBoard()">💾 Lưu bảng giá ${fmtD(boardDate)}</button>
        </div>
      </div>
      ${tierBarHTML()}
      <div class="chart-card">
        ${boardToolbarHTML()}
        <table class="mini-table">
          <thead><tr>
            <th class="hide-xs" style="width:32px"><div id="boardSelectAll" class="checkbox" onclick="this.classList.toggle('on')" title="Chọn tất cả"></div></th>
            <th onclick="window.boardSortBy('name')" style="cursor:pointer;user-select:none" title="Bấm để sắp xếp theo tên">Sản phẩm${_sortArrow('name')}</th>
            <th onclick="window.boardSortBy('cat')" style="cursor:pointer;user-select:none" title="Bấm để sắp xếp theo nhóm">Nhóm${_sortArrow('cat')}</th><th>ĐVT</th>
            <th class="num">${tier ? 'Giá gốc' : 'Giá bán hôm qua'}</th><th class="num">${tier ? (tierIcon(tier) + ' ' + tier.name) : ('Giá bán ' + fmtD(boardDate))}</th><th class="num hide-xs">${tier ? '' : 'Thay đổi'}</th>
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
        t.overrides[inp.dataset.id] = _pmoney(inp.value);
        saveTiers(tiers); renderBoard();
        window.toast('✓ Đã ghi đè giá nhóm cho SP', 'success');
      });
    });
    wireBoardToolbar(renderBoard);
    _observeCatImages();
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
        <td data-field="name"><div style="display:flex;align-items:center;gap:8px">
          ${p.img ? `<img class="lazy-prodimg" data-pid="${p.id}" alt="" style="width:32px;height:32px;object-fit:cover;border-radius:6px;background:#eef3ee;flex:none" onerror="this.style.visibility='hidden'">` : ''}
          <b>${p.name}</b></div></td>
        <td data-field="cat"><span class="tag" style="background:${cat.color}20;color:${cat.color}">${cat.icon} ${cat.label}</span></td>
        <td data-field="unit" style="color:var(--muted)">/${p.unit}</td>
        <td data-field="ref" class="num" style="color:var(--muted)">${window.fmt(real)}</td>
        <td data-field="price" class="num">
          <input class="mktprice" data-id="${p.id}" type="text" inputmode="numeric" oninput="window.fmtMoneyInput(this)" value="${mkt ? _mfmt(mkt) : ''}" style="width:110px;text-align:right;padding:6px 8px;border:1px solid ${isOverride?'#A16207':'var(--line)'};border-radius:6px;background:${isOverride?'#FEF9C3':'#fff'}" title="${isOverride?'Đã sửa tay':'Tự tính = giá thật + offset'}">
          ${isOverride ? `<button onclick="window._mktClearOne('${p.id}')" title="Bỏ sửa tay, về công thức" style="background:none;border:none;color:#A16207;cursor:pointer;font-size:11px">↺</button>` : ''}
        </td>
        <td class="num hide-xs">${diffTxt}</td>
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
            <th class="num">Giá bán thật</th><th class="num" style="background:#F5F3FF">Giá Marketing</th><th class="num hide-xs">Chênh</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">Không có SP nào khớp bộ lọc</td></tr>'}</tbody>
        </table>
        <div style="font-size:11.5px;color:var(--muted);margin-top:6px">Hiển thị ${applyBoardFilter(ps).length}/${ps.length} sản phẩm</div>
      </div>`;

    /* Wire sửa tay từng SP */
    document.querySelectorAll('.mktprice').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        const val = _pmoney(e.target.value);
        const cfg = mktCfg();
        cfg.override = cfg.override || {};
        cfg.override[id] = val;
        saveMkt(cfg);
        renderMkt();
      });
    });
    wireBoardToolbar(renderMkt);
    _observeCatImages();
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
      if (p) { const inp = document.querySelector('.bprice[data-id="' + p.id + '"]'); if (inp) { inp.value = _mfmt(price); matched++; } }
      else miss.push(it.name);
    });
    window.toast(`✓ AI điền ${matched} giá${miss.length ? ' · ⚠️ ' + miss.length + ' SP chưa có trong DM: ' + miss.slice(0, 4).join(', ') + (miss.length > 4 ? '…' : '') : ''} — kiểm tra rồi bấm "Lưu bảng giá".`, matched ? 'success' : 'warn');
    if (miss.length) console.warn('[AI giá] SP chưa khớp DM:', miss);
  }

  window.copyYesterday = function () {
    document.querySelectorAll('.bprice').forEach(inp => {
      const p = window.productById(inp.dataset.id);
      const prev = prevEntry(p, boardDate);
      if (prev) inp.value = _mfmt(prev.sell);
    });
    window.toast('Đã điền giá hôm qua — chỉnh lại rồi bấm Lưu', 'info');
  };

  window.savePriceBoard = function () {
    let n = 0;
    document.querySelectorAll('.bprice').forEach(inp => {
      const id = inp.dataset.id;
      const sell = _pmoney(inp.value);
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
    let list;
    if (catQuery && window.rankProducts) {
      /* Đang tìm → xếp theo độ khớp (khớp đầu/đúng từ lên trước) */
      list = window.rankProducts(ps, catQuery);
    } else {
      list = ps.filter(p => q ? (_catNorm(p.name).includes(q) || _catNorm(p.id).includes(q)) : (!currentCat || p.cat === currentCat))
        .sort((a, b) => {
          const ca = catOrder[a.cat] ?? 999, cb = catOrder[b.cat] ?? 999;
          if (ca !== cb) return ca - cb;
          return (a.name || '').localeCompare(b.name || '', 'vi');
        });
    }
    window._catLastCount = list.length;
    const rows = list.map(p => {
      const cat = catMeta(p.cat);
      const e = window.priceEntryOn(p, window.todayISO());
      const buy = e ? e.buy : 0, sell = e ? e.sell : 0;
      return `<div class="cat-card" data-id="${p.id}" style="display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:#fff">
        <div class="checkbox" onclick="this.classList.toggle('on')" style="flex:none"></div>
        <div onclick="event.stopPropagation();window.quickEditProductImage('${p.id}')" title="Bấm để đổi ảnh trực tiếp" style="position:relative;width:42px;height:42px;cursor:pointer;flex:none">
          ${p.img ? `<img class="lazy-prodimg" data-pid="${p.id}" alt="" style="width:42px;height:42px;object-fit:cover;border-radius:7px;background:#eef3ee" onerror="this.style.visibility='hidden'">` : ''}
          ${p.img ? '' : `<div class="ph" style="width:42px;height:42px;border-radius:7px;background:#eef3ee;display:grid;place-items:center;color:#9CA3AF;font-size:15px">📷</div>`}
          <span style="position:absolute;right:-4px;bottom:-4px;background:var(--navy);color:#fff;border-radius:50%;width:17px;height:17px;display:grid;place-items:center;font-size:9px;box-shadow:0 1px 3px rgba(0,0,0,.3)">✎</span>
        </div>
        <div style="flex:1;min-width:0">
          <div data-field="name" title="Click để sửa tên SP" style="line-height:1.3"><b>${p.name}</b><div style="color:var(--muted);font-size:11px">${p.note || ''}</div></div>
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
  /* === LAZY-LOAD ảnh SP: chỉ nạp base64 khi card cuộn tới (tránh nhồi 8MB ảnh vào DOM) === */
  var _catImgObserver = null;   /* var (không let) — tránh TDZ vì renderBoard/Mkt gọi trước dòng này */
  function _observeCatImages() {
    if (_catImgObserver) _catImgObserver.disconnect();
    const imgs = document.querySelectorAll('img.lazy-prodimg[data-pid]');
    if (!imgs.length) return;
    const load = (img) => { const p = window.productById(img.dataset.pid); if (p && p.img) img.src = p.img; };
    if (!('IntersectionObserver' in window)) { imgs.forEach(load); return; }
    _catImgObserver = new IntersectionObserver((entries, obs) => {
      entries.forEach(en => { if (en.isIntersecting) { load(en.target); obs.unobserve(en.target); } });
    }, { rootMargin: '300px' });
    imgs.forEach(img => _catImgObserver.observe(img));
  }

  /* Chỉ cập nhật lưới + đếm — KHÔNG đụng ô input (bộ gõ tiếng Việt an toàn) */
  window.renderCatalogGrid = function () {
    const g = document.getElementById('catalogGrid');
    if (!g) { renderCatalog(); return; }
    g.innerHTML = _catRows().rows;
    _syncCatSearchUI();
    _observeCatImages();
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
          <button class="btn btn-ghost btn-sm" onclick="window.openBulkPriceImport()">📋 Cập nhật giá hàng loạt (duyệt)</button>
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

    /* Lazy-load ảnh SP (chỉ nạp khi cuộn tới) */
    _observeCatImages();

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
                    format: (v, row) => `<b>${v}</b><div style="color:var(--muted);font-size:11px">${row?.note || ''}</div>` },
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

  /* ====== Cập nhật giá bán HÀNG LOẠT — CÓ DUYỆT (khớp → soi/sửa → áp) ======
     Mỗi dòng: "Tên SP <tab> Giá bán". Khớp tự động (matchProductSmart chặt + gợi ý gần đúng),
     hiện bảng cho user sửa cột "SP trong app" rồi mới ghi. Giá ghi thành MỐC GIÁ HÔM NAY (giữ giá vốn cũ). */
  const _bpEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  /* Mẫu sẵn = bảng giá ngày (giá/kg). User sửa/dán đè tuỳ ý. */
  const BULK_SEED = `Dưa chuột ST\t14000\nCải dưa bẹ to\t14000\nCà chua đại\t15000\nCà rốt tỉa hoa\t13000\nKhoai tây\t14000\nHành tây trắng\t11000\nCủ cải MC\t12000\nBắp cải ĐL\t11000\nCải thảo MC\t11000\nLặc lè\t37000\nĐậu cove\t22000\nMướp đắng to\t15000\nCà tím dài\t14000\nCà tím tròn\t14000\nMướp hương ST\t15000\nSu hào\t17000\nBí xanh\t9000\nBí ngô tròn/ dài\t14000\nBầu\t12000\nNgô ngọt\t8000\nCà pháo trắng\t16000\nCà pháo xanh\t19000\nĐậu bắp\t31000\nChanh cốm vỏ mỏng\t23000\nQuất đà lạt quả to\t19000\nQuả su\t14000\nLơ xanh\t28000\nLơ trắng\t28000\nỚt chuông xanh\t30000\nỚt chuông đỏ\t32000\nỚt chuông vàng\t45000\nCà chua bi ST\t33000\nNấm hải sản\t42000\nNấm kim (gói 150g)\t7000\nNấm đùi gà (gói 1kg)\t42000\nNấm hương gói to\t20000\nNấm sò nâu\t60000\nNấm sò trắng\t50000\nNấm mỡ\t150000\nNgọn bò khai\t40000\nNgó xuân\t30000\nNụ bí\t65000\nMăng tây\t90000\nHoa lan vì (1 vỉ 12 cành)\t120000\nMùi tây\t65000\nXL xoăn\t24000\nHành lá NL\t27000\nHúng chó ta\t35000\nMùi ta ĐL\t43000\nMùi tàu to\t35000\nThì là\t50000\nBạc hà\t43000\nTía tô\t25000\nLá lốt to\t45000\nKinh giới lá to\t30000\nCần tỏi\t39000\nNgổ\t24000\nRăm\t25000\nNgải cứu\t22000\nDiếp cá\t27000\nNghệ củ cái\t30000\nỚt kim xanh\t32000\nỚt kim đỏ\t30000\nỚt sừng đỏ\t35000\nỚt sừng xanh\t35000\nHành indo bóc tay\t26000\nTỏi XK bóc tay\t45000\nHành ta bóc tay\t44000\nRiềng củ\t17000\nGừng ta mới\t25000\nGừng tàu\t59000\nSả to\t15000\nNgọn su non\t24000\nCải chíp Đà Lạt\t15000\nCải ngọt\t15000\nCải ngồng\t17000\nCải mơ\t17000\nCải xoăn\t19000\nCải bó xôi\t19000\nMồng tơi lá to (mớ)\t7000\nMuống giòn to\t9000\nRau lang (mớ)\t9000\nRau ngót (mớ)\t13000\nDọc mùng\t15000\nRau dền (mớ)\t8000\nNgọn su nhặt\t49000\nCải xanh NL\t15000\nĐậu mơ\t3000\nBún sợi/ lá\t13000\nPhở cuốn/ sợi\t15000\nTrứng gà\t2700\nHoa chuối thái\t35000\nGiá đỗ\t12000\nDứa to\t15000\nXoài xanh Tứ Quý\t16000\nBa chỉ tề gọn sạch\t155000\nSườn sụn non\t150000\nThịt nạc xay\t120000\nChân giò lọc sạch\t130000\nThịt vai xay\t130000\nSườn thăn bỏ cục\t155000\nGà mái ri sơn tây\t130000\nGà mái ta thịt sẵn\t110000\nGà mía\t108000\nThăn bò\t260000\nBắp bò\t270000\nMông bò\t250000\nMăng lá\t36000\nMăng củ\t36000\nLá nếp\t17000\nVịt làm sạch\t90000\nTrâu file\t265000\nLá chuối\t17000\nChuối xanh\t16000\nĐu đủ xanh\t16000\nBắp cải tím\t25000\nLá dong\t1200\nHoa cúc decor (bó)\t40000\nCải mầm xanh (hộp)\t8000\nCải mầm tím (hộp)\t10000\nLá nhíp\t90000\nNgồng cải bẹ\t24000`;

  window.openBulkPriceImport = function () {
    const ps = products();
    const dl = ps.map(p => `<option value="${_bpEsc(p.name)} (${p.id})"></option>`).join('');
    window.openModal('📋 Cập nhật giá bán hàng loạt (có duyệt)', `
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px">
        Mỗi dòng: <code>Tên SP &lt;tab&gt; Giá bán</code> (dán từ Excel, hoặc sửa danh sách mẫu). Bấm <b>Khớp & xem trước</b> → soi cột <b>"SP trong app"</b>, sửa dòng khớp sai (gõ tên / chọn gợi ý), bỏ tick dòng không muốn. Giá ghi thành <b>mốc giá hôm nay</b> — giữ nguyên giá cũ các ngày trước.
      </div>
      <textarea id="bpText" rows="5" style="width:100%;font-family:ui-monospace,monospace;font-size:11.5px;padding:8px;border:1px solid var(--line);border-radius:8px">${_bpEsc(BULK_SEED)}</textarea>
      <div style="margin-top:6px"><button class="btn btn-ghost btn-sm" onclick="window.bulkPriceMatch()">🔎 Khớp & xem trước</button></div>
      <div id="bpReview" style="margin-top:10px"></div>
      <datalist id="bpProds">${dl}</datalist>
    `, {
      width: '820px',
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
               <button class="btn btn-primary" id="bpApplyBtn" onclick="window.applyBulkPrice()" disabled>✓ Áp dụng giá hôm nay</button>`,
    });
  };

  window.bulkPriceMatch = function () {
    const txt = (document.getElementById('bpText') || {}).value || '';
    const lines = txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) { window.toast('Chưa có dữ liệu', 'warn'); return; }
    const ps = products(); const today = window.todayISO();
    const norm = window._matchNorm;
    const toks = s => new Set(norm(s).split(' ').filter(t => t.length > 1));
    function guess(name) {
      const strict = window.matchProductSmart ? window.matchProductSmart(name, ps) : null;
      if (strict) return { p: strict, conf: 'chắc' };
      const at = toks(name); let bp = null, bs = 0;
      ps.forEach(x => { const xt = toks(x.name); if (!xt.size) return; const inter = [...at].filter(t => xt.has(t)).length; const uni = new Set([...at, ...xt]).size; const j = uni ? inter / uni : 0; if (j > bs) { bs = j; bp = x; } });
      return { p: bs >= 0.34 ? bp : null, conf: bs >= 0.6 ? 'gần' : 'yếu' };
    }
    const rows = lines.map(ln => {
      const parts = ln.split(/\t|;|\|/).map(s => s.trim());   /* KHÔNG tách dấu phẩy (tên có thể chứa) */
      const name = parts[0] || '';
      const sell = parseInt(String(parts[parts.length - 1] || '').replace(/[^0-9]/g, ''), 10) || 0;
      const g = guess(name);
      const cur = g.p ? (window.priceEntryOn(g.p, today) || {}) : {};
      return { name, sell, p: g.p, conf: g.conf, oldSell: cur.sell };
    });
    const fmt = v => v == null ? '—' : (+v).toLocaleString('vi-VN');
    const nC = rows.filter(r => r.conf === 'chắc').length, nG = rows.filter(r => r.conf === 'gần').length, nN = rows.filter(r => !r.p).length;
    const body = rows.map((r, i) => {
      const checked = r.conf === 'chắc' ? 'checked' : '';
      const badge = r.conf === 'chắc' ? '<span style="font-size:9px;background:#DCFCE7;color:#15803D;padding:1px 5px;border-radius:3px;font-weight:700">chắc</span>'
        : r.p ? '<span style="font-size:9px;background:#FEF3C7;color:#92400E;padding:1px 5px;border-radius:3px;font-weight:700">gần đúng</span>'
        : '<span style="font-size:9px;background:#FEE2E2;color:#B91C1C;padding:1px 5px;border-radius:3px;font-weight:700">chưa khớp</span>';
      const pval = r.p ? `${_bpEsc(r.p.name)} (${r.p.id})` : '';
      return `<tr data-i="${i}" data-name="${_bpEsc(r.name)}" style="${r.conf === 'chắc' ? '' : 'background:#FFFDF5'}">
        <td class="num"><input type="checkbox" class="bp-ck" ${checked}></td>
        <td><b>${_bpEsc(r.name)}</b><div>${badge}</div></td>
        <td class="num"><input class="bp-sell" value="${r.sell || ''}" style="width:84px;text-align:right;padding:3px;border:1px solid var(--line);border-radius:5px;font-size:12px"></td>
        <td><input class="bp-prod" list="bpProds" value="${pval}" placeholder="gõ tên SP…" style="width:230px;padding:3px 5px;border:1px solid var(--line);border-radius:5px;font-size:11.5px"></td>
        <td class="num" style="color:var(--muted);font-size:11px">${fmt(r.oldSell)}</td>
      </tr>`;
    }).join('');
    document.getElementById('bpReview').innerHTML = `
      <div style="font-size:12px;margin-bottom:6px">Khớp: <b style="color:#15803D">${nC} chắc</b> · <b style="color:#92400E">${nG} gần đúng</b> · <b style="color:#B91C1C">${nN} chưa khớp</b>
        <span style="color:var(--muted)">— dòng vàng cần soi cột "SP trong app". Sửa xong tick lại rồi Áp dụng.</span></div>
      <div style="max-height:360px;overflow:auto;border:1px solid var(--line);border-radius:8px">
        <table class="mini-table" style="margin:0;font-size:12px;width:100%">
          <thead><tr><th style="width:30px">✓</th><th>Trên bảng giá</th><th class="num">Giá bán mới</th><th>SP trong app (sửa được)</th><th class="num">Giá cũ</th></tr></thead>
          <tbody>${body}</tbody>
        </table></div>`;
    const btn = document.getElementById('bpApplyBtn'); if (btn) btn.disabled = false;
  };

  window.applyBulkPrice = function () {
    const trs = [...document.querySelectorAll('#bpReview tr[data-i]')];
    if (!trs.length) { window.toast('Bấm "Khớp & xem trước" trước', 'warn'); return; }
    const ps = products(); const today = window.todayISO();
    let upd = 0, skip = 0; const miss = [];
    trs.forEach(tr => {
      const ck = tr.querySelector('.bp-ck'); if (!ck || !ck.checked) { skip++; return; }
      const sell = parseInt((tr.querySelector('.bp-sell').value || '').replace(/[^0-9]/g, ''), 10) || 0;
      const pv = (tr.querySelector('.bp-prod').value || '').trim();
      const m = pv.match(/\((SP\d+)\)\s*$/);
      let p = m ? ps.find(x => x.id === m[1]) : null;
      if (!p && pv) p = ps.find(x => window._matchNorm(x.name) === window._matchNorm(pv.replace(/\s*\(SP\d+\)\s*$/, '')));
      if (!p || !sell) { skip++; if (!p) miss.push(tr.getAttribute('data-name')); return; }
      const hist = [...(p.priceHistory || [])];
      const ex = hist.find(h => h.date === today);
      if (ex) ex.sell = sell;
      else { const last = window.priceEntryOn(p, today) || { buy: 0, sell: 0 }; hist.push({ date: today, buy: last.buy || 0, sell }); }
      window.STORE.update('products', p.id, { priceHistory: hist });
      upd++;
    });
    window.closeModal();
    window.toast(`✓ Cập nhật giá ${upd} SP (mốc ${today})${skip ? ` · bỏ qua ${skip}` : ''}${miss.length ? ` · ${miss.length} dòng chưa khớp SP` : ''}`, 'success');
    if (window.renderCatalog) renderCatalog();
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

  /* === KHO ẢNH SP (Supabase Storage) — upload anon, fallback base64 nếu chưa có quyền === */
  async function _uploadProdImgToStorage(blob) {
    const cfg = window.SUPABASE_CONFIG;
    if (!cfg || cfg.mode !== 'supabase' || !cfg.url || !cfg.anonKey) throw new Error('no-supabase');
    const path = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.jpg';
    const res = await fetch(cfg.url + '/storage/v1/object/product-images/' + path, {
      method: 'POST',
      headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
      body: blob,
    });
    if (!res.ok) throw new Error('upload ' + res.status);
    return cfg.url + '/storage/v1/object/public/product-images/' + path;
  }
  /* Nén ảnh ~400px → callback({dataURL, blob}) */
  function _compressProdImage(file, cb) {
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
        let dataURL;
        try { dataURL = cv.toDataURL('image/jpeg', 0.82); }
        catch (e) { window.toast('Không đọc được ảnh', 'warn'); return; }
        cv.toBlob(blob => cb({ dataURL, blob: blob || null }), 'image/jpeg', 0.82);
      };
      im.onerror = () => window.toast('File không phải ảnh hợp lệ', 'warn');
      im.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }
  /* Nén → thử upload kho ảnh → trả LINK; nếu chưa có quyền/ lỗi → trả base64 (vẫn lưu được) */
  function _prepProductImage(file, cb) {
    window.toast('Đang xử lý ảnh…', 'info');
    _compressProdImage(file, ({ dataURL, blob }) => {
      if (!blob) { cb(dataURL); return; }
      _uploadProdImgToStorage(blob).then(url => cb(url)).catch(() => cb(dataURL));
    });
  }

  /* Chọn ảnh từ máy (form thêm/sửa SP) → upload kho → #pImg = link (fallback base64) */
  window._prodPickImage = function (input) {
    const f = input.files && input.files[0];
    if (!f) return;
    _prepProductImage(f, (val) => {
      const fld = document.getElementById('pImg'); if (fld) fld.value = val;
      const pv = document.getElementById('pImgPreview'); if (pv) { pv.src = val; pv.style.visibility = 'visible'; }
      window.toast(/^https?:/.test(val) ? '✓ Đã tải ảnh lên kho' : '✓ Đã chọn ảnh', 'success');
    });
  };
  window._prodClearImage = function () {
    const fld = document.getElementById('pImg'); if (fld) fld.value = '';
    const pv = document.getElementById('pImgPreview'); if (pv) { pv.src = ''; pv.style.visibility = 'hidden'; }
    const file = document.getElementById('pImgFile'); if (file) file.value = '';
    window.toast('Đã xóa ảnh sản phẩm', 'info');
  };

  /* (giữ tương thích) nén ảnh → trả LINK kho hoặc base64 */
  function _resizeToBase64(file, cb) {
    _prepProductImage(file, cb);
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
