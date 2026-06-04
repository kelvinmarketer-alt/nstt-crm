/* =========================================================
   Quản lý danh mục sản phẩm — đổi BIỂU TƯỢNG (icon) / tên / màu,
   thêm / xóa danh mục. Lưu vào master_data (Supabase) → áp dụng
   cả app CRM lẫn website (web sync đọc cùng nguồn).
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
        onclick="this.closest('.cm-row').remove()">🗑</button>
    </div>`;
  }

  window.openCategoryManager = function () {
    var list = window.PRODUCT_CATEGORIES || [];
    var html = `<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">
        Sửa <b>biểu tượng</b>, tên, màu cho từng danh mục. Bấm Lưu → áp dụng cho <b>cả app và website</b>.</div>
      <div id="cmList">${list.map(rowHtml).join('')}</div>
      <button class="btn btn-ghost" style="margin-top:4px" onclick="window.cmAddRow()">+ Thêm danh mục</button>
      <div style="font-size:11.5px;color:var(--muted);margin-top:10px">
        💡 Gõ hoặc dán emoji vào ô biểu tượng (vd 🍎 🥕 🌸 🥬 🍄). Mở bảng emoji trên Mac: <b>Ctrl + Cmd + Space</b>.</div>`;
    window.openModal('🏷️ Quản lý danh mục sản phẩm', html, {
      width: '540px',
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window.cmSave()">💾 Lưu</button>`,
    });
  };

  window.cmAddRow = function () {
    document.getElementById('cmList').insertAdjacentHTML('beforeend', rowHtml({ id: '', icon: '📦', color: '#15803D' }));
  };

  window.cmSave = function () {
    var orig = (window.PRODUCT_CATEGORIES || []).slice();
    var rows = Array.prototype.slice.call(document.querySelectorAll('#cmList .cm-row'));
    var arr = [];
    var ids = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var label = r.querySelector('.cm-label').value.trim();
      if (!label) continue;
      var id = (r.querySelector('.cm-id').value || '').trim() || slugify(label);
      if (ids[id]) { id = id + '-' + i; }   // tránh trùng id
      ids[id] = 1;
      var prev = orig.find(function (x) { return x.id === id; }) || {};
      arr.push(Object.assign({}, prev, {
        id: id,
        label: label,
        icon: r.querySelector('.cm-icon').value.trim() || '📦',
        color: r.querySelector('.cm-color').value || '#15803D',
      }));
    }
    if (!arr.length) { window.toast && window.toast('Cần ít nhất 1 danh mục', 'warn'); return; }

    // Mutate TẠI CHỖ để CATS (const đã capture trong products.js) thấy thay đổi ngay.
    var PC = window.PRODUCT_CATEGORIES || (window.PRODUCT_CATEGORIES = []);
    PC.length = 0;
    arr.forEach(function (c) { PC.push(c); });

    // Lưu → localStorage (vty_md_product_categories) + Supabase master_data → web sync đọc cùng nguồn.
    if (window.STORE) { window.STORE.set('md_product_categories', arr); }

    window.closeModal();
    window.toast && window.toast('✓ Đã lưu danh mục — áp dụng cả app & web', 'success');
    if (window.filterCat) { window.filterCat(null); }   // render lại danh sách
  };
})();
