/* =========================================================
   Quản lý danh mục sản phẩm — đổi BIỂU TƯỢNG (icon) / tên / màu,
   thêm / xóa danh mục. TỰ ĐỘNG LƯU (không cần bấm nút) vào
   master_data (Supabase) → áp dụng cả app CRM lẫn website.
   ========================================================= */
(function () {
  function esc(s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function slugify(s) {
    return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function rowHtml(c) {
    return `<div class="cm-row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <input class="cm-icon" value="${esc(c.icon || '📦')}" maxlength="4" title="Biểu tượng (emoji)"
        style="width:54px;text-align:center;font-size:19px;padding:6px;border:1px solid var(--line);border-radius:8px">
      <input class="cm-label" value="${esc(c.label || '')}" placeholder="Tên danh mục"
        style="flex:1;padding:7px 9px;border:1px solid var(--line);border-radius:8px">
      <input class="cm-color" type="color" value="${esc(c.color || '#15803D')}" title="Màu"
        style="width:40px;height:34px;border:1px solid var(--line);border-radius:8px;background:none;cursor:pointer">
      <input class="cm-id" type="hidden" value="${esc(c.id || '')}">
      <button class="icon-btn" title="Xóa danh mục" style="color:var(--danger)"
        onclick="window.cmDelRow(this)">🗑</button>
    </div>`;
  }

  /* Đọc các dòng → mảng danh mục (đồng thời ghi lại id ổn định vào ô ẩn). */
  function collect() {
    var orig = (window.PRODUCT_CATEGORIES || []).slice();
    var rows = Array.prototype.slice.call(document.querySelectorAll('#cmList .cm-row'));
    var arr = [], ids = {};
    rows.forEach(function (r, i) {
      var label = r.querySelector('.cm-label').value.trim();
      if (!label) return;
      var idEl = r.querySelector('.cm-id');
      var id = (idEl.value || '').trim() || slugify(label);
      if (ids[id]) { id = id + '-' + i; }
      ids[id] = 1;
      idEl.value = id;                         // giữ id ổn định cho lần sửa sau
      var prev = orig.find(function (x) { return x.id === id; }) || {};
      arr.push(Object.assign({}, prev, {
        id: id, label: label,
        icon: r.querySelector('.cm-icon').value.trim() || '📦',
        color: r.querySelector('.cm-color').value || '#15803D',
      }));
    });
    return arr;
  }

  function flagSaved() {
    var el = document.getElementById('cmStatus');
    if (!el) return;
    el.textContent = '✓ Đã lưu';
    el.style.color = 'var(--ok, #15803D)';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.textContent = 'Tự động lưu'; el.style.color = 'var(--muted)'; }, 1500);
  }

  function persist() {
    var arr = collect();
    if (!arr.length) return;                   // chưa có danh mục hợp lệ → khoan lưu
    var PC = window.PRODUCT_CATEGORIES || (window.PRODUCT_CATEGORIES = []);
    PC.length = 0; arr.forEach(function (c) { PC.push(c); });
    if (window.STORE) { window.STORE.set('md_product_categories', arr); }  // localStorage + Supabase
    flagSaved();
    if (window.filterCat) { window.filterCat(window.__cmCurCat || null); } // render lại chip nền
  }

  var _t;
  function autoSave() { clearTimeout(_t); _t = setTimeout(persist, 500); }

  window.cmDelRow = function (btn) {
    var row = btn.closest('.cm-row');
    if (row) { row.remove(); persist(); }
  };
  window.cmAddRow = function () {
    document.getElementById('cmList').insertAdjacentHTML('beforeend', rowHtml({ id: '', icon: '📦', color: '#15803D' }));
  };

  window.openCategoryManager = function () {
    var list = window.PRODUCT_CATEGORIES || [];
    var html = `<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">
        Sửa <b>biểu tượng</b>, tên, màu từng danh mục — <b>tự động lưu</b>, áp dụng cả app & website.</div>
      <div id="cmList">${list.map(rowHtml).join('')}</div>
      <button class="btn btn-ghost" style="margin-top:4px" onclick="window.cmAddRow()">+ Thêm danh mục</button>
      <div style="font-size:11.5px;color:var(--muted);margin-top:10px">
        💡 Gõ/dán emoji vào ô biểu tượng (vd 🍎 🥕 🌸 🥬 🍄). Bảng emoji Mac: <b>Ctrl + Cmd + Space</b>.</div>`;
    window.openModal('🏷️ Quản lý danh mục sản phẩm', html, {
      width: '540px',
      footer: `<span id="cmStatus" style="font-size:12px;color:var(--muted);margin-right:auto">Tự động lưu</span>
               <button class="btn btn-primary" onclick="window.closeModal()">Đóng</button>`,
    });
    // Tự lưu khi sửa: 'input' cho gõ/màu (debounce), 'change' cho commit ngay.
    var box = document.getElementById('cmList');
    if (box) {
      box.addEventListener('input', autoSave);
      box.addEventListener('change', persist);
    }
  };
})();
