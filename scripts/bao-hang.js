/* =========================================================
   PHIẾU BÁO HÀNG — DANH SÁCH BÁO HÀNG (theo mẫu giấy)
   - Branded Nông Sản Tuấn Tú Hà Nội
   - Chỉ liệt kê sản phẩm CÓ trong đơn (gộp SL theo từng SP)
   - Xuất HTML/PDF (print window) + gửi Telegram group kho/bếp
   ========================================================= */
(function () {
  function company() {
    const ci = window.STORE.get('companyInfo', null) || {};
    const origin = (typeof location !== 'undefined' && location.origin && location.origin !== 'null') ? location.origin : 'https://app.nongsantuantuhanoi.vn';
    return {
      /* Tên thương hiệu ngắn (KHÔNG dùng tên pháp nhân dài) */
      name: 'NÔNG SẢN TUẤN TÚ HÀ NỘI',
      addr: ci.address || '36/147A Tân Mai, Hoàng Mai, Hà Nội',
      phone: ci.hotline || '0836 676 086',
      website: ci.website || 'nongsantuantuhanoi.com',
      logo: ci.logo || (origin + '/assets/logo-icon.png?v=485'),
    };
  }

  /* Gộp items cùng tên → tổng số lượng */
  function groupItems(o) {
    const items = Array.isArray(o.items) ? o.items : [];
    const norm = s => (s || '').toString().trim().toLowerCase();
    const map = new Map();
    items.forEach(it => {
      const k = norm(it.name);
      if (!k) return;
      if (!map.has(k)) map.set(k, { name: it.name, qty: 0, unit: it.unit || 'kg' });
      map.get(k).qty += (+it.qty || 0);
    });
    return [...map.values()];
  }
  const fmtQty = q => (+q || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');

  /* ====== HTML branded để in / lưu PDF ====== */
  window.buildBaoHangHTML = function (o) {
    const c = company();
    const groups = groupItems(o);
    const totalQty = groups.reduce((s, g) => s + g.qty, 0);
    const d = (o.date || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    const dd = d ? d[1] : '......', mm = d ? d[2] : '......', yy = d ? d[3] : '2026';
    /* Chia 2 cột cho gọn nếu nhiều mã */
    const rowsHtml = groups.map((g, i) => `<tr>
        <td class="stt">${i + 1}</td>
        <td class="sp">${g.name}</td>
        <td class="sl">${fmtQty(g.qty)}</td>
      </tr>`).join('');
    return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>DANH SÁCH BÁO HÀNG</title>
<style>
  @page{size:A4;margin:14mm 12mm}
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif}
  body{color:#1a1a1a;font-size:13px;background:#fff}
  .wrap{max-width:780px;margin:0 auto;padding:6px 4px}
  .top{display:flex;align-items:center;gap:16px;border-bottom:3px solid #1B5E20;padding-bottom:12px;margin-bottom:4px}
  .top img.logo{width:74px;height:74px;object-fit:contain;flex:0 0 auto}
  .brand{flex:1;min-width:0}
  .brand h1{font-size:21px;color:#1B5E20;font-weight:800;letter-spacing:.4px;line-height:1.15}
  .brand .sub{font-size:11.5px;color:#555;margin-top:5px}
  .title{text-align:center;font-size:23px;font-weight:800;color:#1B5E20;letter-spacing:1.5px;margin:16px 0 2px}
  .ca{text-align:center;font-size:12.5px;color:#444;margin-bottom:8px}
  .metabox{border:1px solid #CBD9C4;border-radius:8px;padding:10px 14px;margin:6px 0 10px;background:#F7FBF5}
  .meta{display:flex;justify-content:space-between;gap:18px;font-size:12.5px;line-height:1.9}
  .meta b{color:#1B5E20}
  .note{text-align:center;font-size:12.5px;font-weight:700;color:#15803D;margin:10px 0 12px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{border:1px solid #B6C9B0;padding:7px 10px}
  th{background:#1B5E20;color:#fff;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.4px}
  td.stt{text-align:center;width:48px;color:#777;font-weight:600}
  td.sl{text-align:center;width:120px;font-weight:700;color:#1B5E20}
  td.sp{font-weight:600}
  tbody tr:nth-child(even){background:#F4FAF2}
  tfoot td{background:#E8F5E9;font-weight:800;color:#1B5E20;border-top:2px solid #1B5E20}
  .sig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:34px;text-align:center;font-size:11.5px;color:#333}
  .sig .role{font-weight:700;color:#1B5E20}
  .sig .small{font-size:9.5px;color:#999;font-weight:400}
  .sig .l{margin-top:46px;border-top:1px dotted #aaa}
</style></head><body><div class="wrap">
  <div class="top">
    <img class="logo" src="${c.logo}" alt="" onerror="this.style.display='none'">
    <div class="brand">
      <h1>${c.name}</h1>
      <div class="sub">${c.addr} · ☎ ${c.phone} · ${c.website}</div>
    </div>
  </div>
  <div class="title">DANH SÁCH BÁO HÀNG</div>
  <div class="ca">Giao hàng ca ............</div>
  <div class="metabox">
    <div class="meta">
      <div><b>Nhà hàng:</b> ${o.custName || '............'}</div>
      <div><b>Thời gian:</b> Ngày ....... Tháng ....... Năm .......</div>
    </div>
    <div class="meta">
      <div><b>Địa chỉ:</b> ${o.drop || '............'}</div>
      <div><b>SĐT:</b> ${o.custPhone || '............'}</div>
    </div>
  </div>
  <div class="note">TẤT CẢ CÁC MÃ HÀNG ĐỀU ĐƯỢC TÍNH ĐƠN VỊ LÀ KG (KILOGRAM)</div>
  <table>
    <thead><tr><th style="width:48px">STT</th><th>Sản phẩm</th><th style="width:120px">Số lượng</th></tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="3" style="text-align:center;color:#999;padding:18px">Đơn chưa có mặt hàng</td></tr>'}</tbody>
    <tfoot><tr><td colspan="2" style="text-align:right">TỔNG SẢN LƯỢNG</td><td style="text-align:center">${fmtQty(totalQty)} kg</td></tr></tfoot>
  </table>
</div>
</body></html>`;
  };

  /* ====== In / xuất PDF — qua iframe cùng origin (không còn "about:blank") ====== */
  window.printBaoHang = async function (code) {
    const o = (window.STORE.get('orders', []) || []).find(x => x.code === code);
    if (!o) { window.toast?.('Không tìm thấy đơn ' + code, 'warn'); return; }
    if (window.STORE.ensureOrderItems && !(Array.isArray(o.items) && o.items.length)) { try { await window.STORE.ensureOrderItems(code); } catch (e) {} }
    const html = window.buildBaoHangHTML(o);
    const old = document.getElementById('baoHangPrintFrame');
    if (old) old.remove();
    const f = document.createElement('iframe');
    f.id = 'baoHangPrintFrame';
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const doc = f.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    const fire = () => {
      try { f.contentWindow.focus(); f.contentWindow.print(); }
      catch (e) { window.toast?.('Không in được: ' + e.message, 'warn'); }
    };
    /* Đợi logo load xong rồi mới in (tránh in thiếu ảnh) */
    const img = doc.querySelector('img.logo');
    if (img && !img.complete) { img.onload = () => setTimeout(fire, 120); img.onerror = () => setTimeout(fire, 120); }
    else setTimeout(fire, 250);
    window.toast?.('📋 Mở hộp in — bỏ tick "Headers and footers" để ẩn ngày/URL · Đích in chọn "Save as PDF"', 'info');
  };

  /* ====== Nội dung Telegram ====== */
  window.buildBaoHangTgMsg = function (o) {
    const groups = groupItems(o);
    const totalQty = groups.reduce((s, g) => s + g.qty, 0);
    const lines = groups.map((g, i) => `${String(i + 1).padStart(2, ' ')}. ${g.name} — ${fmtQty(g.qty)} kg`).join('\n');
    return `📋 DANH SÁCH BÁO HÀNG — ${o.code}
🍽 Nhà hàng: ${o.custName || '—'}
📍 Giao đến: ${o.drop || '—'}
📅 ${o.date || ''} · Ca sáng
👤 NV: ${o.staff || ''}
─────────────
${lines || '(chưa có mặt hàng)'}
─────────────
📦 Tổng: ${groups.length} mã · ${fmtQty(totalQty)} kg
⚖️ Đơn vị: KILOGRAM (KG)

— CRM Nông Sản Tuấn Tú`;
  };

  /* ====== Gửi Telegram group kho/bếp (purpose: bao_hang) ======
     silent=true: dùng khi auto-gửi lúc tạo đơn (không toast cảnh báo nếu chưa cấu hình). */
  window.sendBaoHangTelegram = async function (code, silent) {
    const o = (window.STORE.get('orders', []) || []).find(x => x.code === code);
    if (!o) return { ok: false };
    if (window.STORE.ensureOrderItems && !(Array.isArray(o.items) && o.items.length)) { try { await window.STORE.ensureOrderItems(code); } catch (e) {} }
    if (!window.sendTgMessage) { if (!silent) window.toast?.('Chưa nạp Telegram', 'warn'); return { ok: false }; }
    const ch = window.getTgChannel && window.getTgChannel('bao_hang');
    if (!ch) {
      if (!silent) window.toast?.('Chưa cấu hình kênh "Phiếu báo hàng" — vào Cài đặt → Telegram → định tuyến', 'warn');
      return { ok: false, error: 'no-channel' };
    }
    const r = await window.sendTgMessage('bao_hang', window.buildBaoHangTgMsg(o));
    if (r.ok && !silent) window.toast?.('✅ Đã gửi phiếu báo hàng vào "' + r.channel + '"', 'success');
    else if (!r.ok && !silent) window.toast?.('Gửi phiếu báo hàng lỗi: ' + (r.error || ''), 'warn');
    return r;
  };
})();
