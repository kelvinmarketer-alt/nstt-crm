/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — THỐNG KÊ HIỆU SUẤT SHIPPER
   Nằm trong module NHÂN SỰ → tab "🛵 Hiệu suất Shipper"
   (KHÔNG để ở Bảng giao hàng vì bảng đó shipper cũng xem được).

   Từ ĐƠN ĐÃ GIAO có gán shipper: mỗi shipper × ngày → số đơn + sản lượng (kg); tổng tháng.
   Xuất Excel (chi tiết từng ngày) + Copy ẢNH (tóm tắt tháng, có logo).
   Dùng chung tháng với bộ lọc "Tháng" của Chấm công & Lương (payMonth).
   ========================================================= */
(function () {
  const S = () => window.STORE;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const _q1 = n => { n = +n || 0; return (n % 1 ? Math.round(n * 10) / 10 : n).toLocaleString('vi-VN'); };

  const _orders = () => (S().get('orders', window.ORDERS || []) || []);
  const _kg = o => +o.weight || (Array.isArray(o.items) ? o.items.reduce((s, it) => s + (+it.qty || 0), 0) : 0);
  const _realDriver = o => { const n = String(o.driverName || o.driver_name || '').trim(); return (n && n !== '—') ? n : ''; };

  let _host = 'payView';   /* id phần tử để render vào (mặc định tab Nhân sự) */
  let _month = null;

  function _data(monthISO) {
    const [y, m] = monthISO.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    const byShip = {};
    _orders().forEach(o => {
      if (o.status !== 'delivered' && o.status !== 'reconciled') return;
      const drv = _realDriver(o); if (!drv) return;
      const iso = window.orderDeliverISO ? window.orderDeliverISO(o) : '';
      if (!iso || iso.slice(0, 7) !== monthISO) return;
      const day = +iso.slice(8, 10); if (!(day >= 1 && day <= last)) return;
      const kg = _kg(o);
      const s = byShip[drv] || (byShip[drv] = { name: drv, daily: {}, totO: 0, totKg: 0 });
      const d = s.daily[day] || (s.daily[day] = { o: 0, kg: 0 });
      d.o++; d.kg += kg; s.totO++; s.totKg += kg;
    });
    return { list: Object.values(byShip).sort((a, b) => b.totO - a.totO), last, y, m };
  }

  /* render vào một phần tử (dùng trong tab Nhân sự — tháng do payMonth điều khiển) */
  function renderInto(hostId, monthISO) {
    _host = hostId || 'payView';
    _month = (monthISO || _month || (window.todayISO ? window.todayISO() : '2026-07')).slice(0, 7);
    const host = document.getElementById(_host);
    if (!host) return;

    const D = _data(_month);
    const days = Array.from({ length: D.last }, (_, i) => i + 1);
    const dow = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const gO = D.list.reduce((s, x) => s + x.totO, 0), gKg = D.list.reduce((s, x) => s + x.totKg, 0);

    const head = `<tr>
      <th style="position:sticky;left:0;background:#1B5E20;color:#fff;padding:7px 10px;text-align:left;z-index:2;min-width:128px">Shipper</th>
      ${days.map(d => { const w = new Date(D.y, D.m - 1, d).getDay(); const we = w === 0; return `<th style="padding:4px 3px;background:${we ? '#FEE2E2' : '#E8F5E2'};color:${we ? '#B91C1C' : '#1B5E20'};min-width:38px;font-size:10px">${d}<div style="font-size:8px;opacity:.7">${dow[w]}</div></th>`; }).join('')}
      <th style="padding:6px 8px;background:#DCFCE7;color:#15803D;min-width:50px">Tổng đơn</th>
      <th style="padding:6px 8px;background:#FEF3C7;color:#B45309;min-width:60px">Tổng kg</th></tr>`;
    const rows = D.list.length ? D.list.map(s => `<tr>
      <td style="position:sticky;left:0;background:#fff;padding:6px 10px;font-weight:700;color:var(--navy);z-index:1;border-right:1px solid var(--line)">🛵 ${esc(s.name)}</td>
      ${days.map(d => { const c = s.daily[d]; return `<td style="padding:3px 2px;text-align:center;border-bottom:1px solid #F1F5F9">${c ? `<div style="font-weight:700;color:#15803D;font-size:12px">${c.o}</div><div style="font-size:9px;color:#94A3B8">${_q1(c.kg)}</div>` : '<span style="color:#E2E8F0">·</span>'}</td>`; }).join('')}
      <td style="padding:6px 8px;text-align:center;font-weight:800;color:#15803D;background:#F0FDF4">${s.totO}</td>
      <td style="padding:6px 8px;text-align:center;font-weight:800;color:#B45309;background:#FFFBEB">${_q1(s.totKg)}</td></tr>`).join('')
      : `<tr><td colspan="${D.last + 3}" style="padding:34px;text-align:center;color:var(--muted)">Chưa có đơn giao nào gán shipper tháng này.<br><span style="font-size:12px">Gán shipper cho đơn ở Bảng giao hàng → giao xong → thống kê tự lên.</span></td></tr>`;
    const foot = D.list.length ? `<tr style="background:#1B5E20;color:#fff;font-weight:800">
      <td style="position:sticky;left:0;background:#1B5E20;padding:6px 10px">TỔNG (${D.list.length})</td>
      ${days.map(d => { let o = 0; D.list.forEach(s => { if (s.daily[d]) o += s.daily[d].o; }); return `<td style="padding:5px 2px;text-align:center;font-size:11px">${o || ''}</td>`; }).join('')}
      <td style="padding:6px 8px;text-align:center">${gO}</td><td style="padding:6px 8px;text-align:center">${_q1(gKg)}</td></tr>` : '';

    host.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
        <div style="font-size:12.5px;color:var(--muted)">Σ <b style="color:#15803D">${gO} đơn</b> · <b style="color:#B45309">${_q1(gKg)} kg</b> · ${D.list.length} shipper — theo <b>tháng đang chọn ở trên</b></div>
        <div style="flex:1"></div>
        <button class="btn btn-ghost" onclick="window.shipStatsImage()" title="Copy ảnh tóm tắt tháng để dán Zalo">📸 Copy ảnh</button>
        <button class="btn btn-primary" onclick="window.shipStatsExcel()">📊 Xuất Excel</button>
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-bottom:8px">Mỗi ô: <b style="color:#15803D">số đơn</b> (trên) · <span style="color:#94A3B8">kg</span> (dưới). Chỉ tính đơn <b>đã giao</b> có gán shipper.</div>
      <div style="overflow:auto;border:1px solid var(--line);border-radius:10px;max-height:64vh">
        <table style="border-collapse:separate;border-spacing:0;font-size:12px;width:max-content;min-width:100%">
          <thead style="position:sticky;top:0;z-index:3">${head}</thead><tbody>${rows}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}
        </table></div>`;
  }

  window.shipStatsExcel = function () {
    if (!window.XLSX) { window.toast && window.toast('Chưa tải thư viện Excel — reload trang', 'warn'); return; }
    const D = _data(_month);
    if (!D.list.length) { window.toast && window.toast('Chưa có dữ liệu để xuất', 'info'); return; }
    const days = Array.from({ length: D.last }, (_, i) => i + 1);
    const aoa = [['THỐNG KÊ HIỆU SUẤT SHIPPER · Tháng ' + _month.slice(5) + '/' + _month.slice(0, 4)],
      ['Shipper', ...days.map(d => 'Ngày ' + d), 'Tổng đơn', 'Tổng kg']];
    D.list.forEach(s => { const row = [s.name]; days.forEach(d => { const c = s.daily[d]; row.push(c ? (c.o + 'đ/' + _q1(c.kg) + 'kg') : ''); }); row.push(s.totO, +(+s.totKg).toFixed(1)); aoa.push(row); });
    aoa.push(['TỔNG', ...days.map(() => ''), D.list.reduce((s, x) => s + x.totO, 0), +D.list.reduce((s, x) => s + x.totKg, 0).toFixed(1)]);
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 20 }, ...days.map(() => ({ wch: 10 })), { wch: 9 }, { wch: 9 }];
    const wb = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb, ws, 'Hiệu suất Ship');
    window.XLSX.writeFile(wb, 'HieuSuat-Shipper_' + _month + '.xlsx');
    window.toast && window.toast('✓ Đã xuất Excel', 'success');
  };

  async function _logoDataURL() {
    try { const r = await fetch((location.origin || '') + '/assets/logo-name.png?v=486'); const b = await r.blob(); return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(''); fr.readAsDataURL(b); }); } catch (e) { return ''; }
  }
  window.shipStatsImage = async function () {
    const D = _data(_month);
    if (!D.list.length) { window.toast && window.toast('Chưa có dữ liệu để copy', 'info'); return; }
    const logo = await _logoDataURL();
    const mLabel = _month.slice(5) + '/' + _month.slice(0, 4);
    const gO = D.list.reduce((s, x) => s + x.totO, 0), gKg = D.list.reduce((s, x) => s + x.totKg, 0);
    const rows = D.list.map((s, i) => `<tr style="background:${i % 2 ? '#F6FBF4' : '#fff'}">
      <td style="padding:9px 14px;border-bottom:1px solid #E5EFE1;font-weight:700;color:#1B5E20">🛵 ${esc(s.name)}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #E5EFE1;text-align:right;font-weight:700;color:#15803D">${s.totO}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #E5EFE1;text-align:right;font-weight:700;color:#B45309">${_q1(s.totKg)} kg</td></tr>`).join('');
    const W = 560;
    const html = `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px;box-sizing:border-box;padding:22px 26px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;background:#fff;color:#1f2937">
      <div style="display:flex;align-items:center;gap:12px;border-bottom:2.5px solid #1B5E20;padding-bottom:11px">
        ${logo ? `<img src="${logo}" style="width:118px;height:auto;object-fit:contain"/>` : '<div style="font-size:34px">🛵</div>'}
        <div><div style="font-size:18px;font-weight:800;color:#1B5E20">HIỆU SUẤT SHIPPER</div><div style="font-size:13px;color:#6B7280">Tháng ${mLabel} · ${D.list.length} shipper</div></div></div>
      <table style="width:100%;border-collapse:collapse;font-size:13.5px;margin-top:15px;border:1px solid #CFE3C7">
        <thead><tr style="background:#E8F5E2;color:#1B5E20;font-size:11.5px;text-transform:uppercase">
          <th style="padding:9px 14px;text-align:left">Shipper</th><th style="padding:9px 14px;text-align:right">Tổng đơn</th><th style="padding:9px 14px;text-align:right">Tổng sản lượng</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="background:#1B5E20;color:#fff;font-weight:800"><td style="padding:10px 14px">TỔNG THÁNG ${mLabel}</td><td style="padding:10px 14px;text-align:right">${gO} đơn</td><td style="padding:10px 14px;text-align:right">${_q1(gKg)} kg</td></tr></tfoot></table>
      <div style="font-size:11px;color:#9CA3AF;margin-top:10px;font-style:italic">Nông Sản Tuấn Tú Hà Nội · thống kê từ bảng giao hàng</div></div>`;
    let H = 600;
    try { const meas = document.createElement('div'); meas.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + W + 'px'; meas.innerHTML = html; document.body.appendChild(meas); H = Math.ceil((meas.firstElementChild || meas).getBoundingClientRect().height) + 4; document.body.removeChild(meas); } catch (e) {}
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
    try {
      if (!(navigator.clipboard && window.ClipboardItem)) throw new Error('no img');
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(0); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
      const sc = 2, cv = document.createElement('canvas'); cv.width = W * sc; cv.height = H * sc;
      const ctx = cv.getContext('2d'); ctx.scale(sc, sc); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0);
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      window.toast && window.toast('📸 Đã copy ảnh — dán vào Zalo', 'success');
    } catch (e) { window.toast && window.toast('Máy không copy ảnh được — dùng Xuất Excel nhé', 'warn'); }
  };

  window.SHIPSTATS = { renderInto, data: _data };
})();
