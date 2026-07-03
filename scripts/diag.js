/* =========================================================
   NSTT — Chẩn đoán tải dữ liệu (TẠM THỜI, gỡ sau khi tìm ra lỗi)
   Hiện 1 bảng góc dưới-trái để user chụp gửi Claude.
   ========================================================= */
(function () {
  async function run() {
    const L = [];
    const P = (k, v) => L.push(k + ': ' + v);
    const lcCount = (k) => { try { const a = JSON.parse(localStorage.getItem('vty_' + k) || '[]'); return Array.isArray(a) ? a.length : String(typeof a); } catch (e) { return 'lỗi-parse'; } };
    try {
      P('APP', (window.APP_VERSION || '?'));
      P('mode', (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.mode) || '?');
      P('SB_DATA', window.SB_DATA ? 'CÓ' : 'THIẾU');
      P('supabase client', (window.SB_CLIENT || (window.SB_DATA && window.SB_DATA._client)) ? 'có' : '(ẩn)');

      /* localStorage tổng + key lớn */
      let total = 0; const big = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i); const v = localStorage.getItem(key) || '';
        total += key.length + v.length;
        if (v.length > 40000) big.push(key.replace(/^vty_/, '') + '≈' + Math.round(v.length / 1024) + 'KB');
      }
      P('localStorage TỔNG', Math.round(total / 1024) + ' KB');
      P('key lớn', big.join(' · ') || '(không)');
      P('LS vty_orders', lcCount('orders'));
      P('LS vty_customers', lcCount('customers'));
      P('RAM orders', ((window.STORE && window.STORE.get('orders', [])) || []).length);
      P('RAM customers', ((window.STORE && window.STORE.get('customers', [])) || []).length);

      /* Test quota: thử ghi 4MB */
      let quota = 'OK (còn chỗ)';
      try { localStorage.setItem('__qtest__', new Array(4 * 1024 * 1024).join('x')); localStorage.removeItem('__qtest__'); }
      catch (e) { quota = 'ĐẦY! ' + (e.name || e.message); }
      P('Quota test 4MB', quota);

      /* getAll trực tiếp — customers (nhẹ) */
      if (window.SB_DATA && window.SB_DATA.getAll) {
        let t = (window.performance ? performance.now() : Date.now());
        try {
          const rows = await window.SB_DATA.getAll('customers');
          const ms = Math.round((window.performance ? performance.now() : Date.now()) - t);
          P('getAll(customers)', (Array.isArray(rows) ? rows.length + ' dòng' : 'NULL/LỖI') + ' · ' + ms + 'ms');
        } catch (e) { P('getAll(customers)', 'THROW ' + (e.message || e)); }
      } else {
        P('getAll(customers)', 'KHÔNG chạy được (SB_DATA thiếu)');
      }
    } catch (e) { P('DIAG-ERR', e && e.message); }

    let box = document.getElementById('__diagbox');
    if (!box) {
      box = document.createElement('div');
      box.id = '__diagbox';
      box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;background:#0b1220;color:#7CFC98;font:12px/1.5 ui-monospace,Menlo,monospace;padding:11px 13px;border-radius:9px;max-width:560px;white-space:pre-wrap;box-shadow:0 6px 22px rgba(0,0,0,.5);border:1px solid #234';
      document.body.appendChild(box);
    }
    box.textContent = '🔍 CHẨN ĐOÁN TẢI DỮ LIỆU\n' + L.join('\n') + '\n\n(chụp màn hình gửi Claude · bấm để ẩn)';
    box.onclick = () => box.remove();
  }
  window.__runDiag = run;
  (window.requestIdleCallback ? requestIdleCallback(() => setTimeout(run, 2200)) : setTimeout(run, 2500));
})();
