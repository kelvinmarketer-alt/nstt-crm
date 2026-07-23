/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — System core
   ─────────────────────────────────────────────────────────
   Gom 4 hệ thống xuyên suốt app:

   1. AUDIT LOG (window.audit.log/list) — truy vết ai làm gì
   2. AUTO BACKUP (window.AutoBackup) — snapshot hằng ngày tự động
   3. GLOBAL SEARCH (Ctrl+K) — tìm khắp KH/đơn/SP/NV
   4. AI CHAT ASSISTANT (floating bubble góc dưới phải)

   Mỗi feature đều có help-tip hoặc help-banner giải thích.
   ========================================================= */
(function () {

  /* =====================================================
     1. AUDIT LOG — ghi mọi thao tác CRUD quan trọng
     ===================================================== */
  window.audit = {
    /* Ghi 1 entry. action vd: 'order.create' / 'customer.delete' / 'product.editPrice'
       Tự kèm user + thời gian. detail nên ngắn gọn. */
    log(action, detail, meta) {
      try {
        const list = window.STORE.get('audit_log', []) || [];
        const user = window.CURRENT_USER || {};
        list.push({
          id: 'AL' + Date.now().toString(36),
          ts: new Date().toISOString(),
          action,
          detail: detail || '',
          user: user.name || 'Hệ thống',
          role: user.role || '',
          meta: meta || null,
        });
        /* Cap 5000 entries để không phình localStorage */
        if (list.length > 5000) list.splice(0, list.length - 5000);
        window.STORE.set('audit_log', list);
      } catch (e) { console.warn('[audit]', e); }
    },
    list(filter) {
      const all = window.STORE.get('audit_log', []) || [];
      if (!filter) return all;
      return all.filter(e =>
        (!filter.action || e.action.includes(filter.action)) &&
        (!filter.user   || (e.user||'').includes(filter.user)) &&
        (!filter.from   || e.ts >= filter.from) &&
        (!filter.to     || e.ts <= filter.to)
      );
    },
    clear() { window.STORE.set('audit_log', []); },
  };

  /* =====================================================
     2. AUTO BACKUP — snapshot tự động theo lịch
     ───────────────────────────────────────────────────
     - Lưu vào STORE.snapshots theo dạng [{id, ts, label, size, data}]
     - Tần suất mặc định: 1 lần/ngày khi user mở app
     - Giữ tối đa 14 snapshot gần nhất
     ===================================================== */
  window.AutoBackup = {
    /* Thiếu key = mất là mất HẲN (khoDuty từng bị xoá sạch mà snapshot không cứu được).
       Nhóm lương/công/thưởng đều là JSONB nhỏ → thêm vào không làm phình snapshot đáng kể. */
    KEYS_TO_BACKUP: ['customers','orders','products','staff','drivers',
                     'timesheet','adspend','paymentAccounts','cashEntries',
                     'invoices','partners','audit_log','inventory','suppliers',
                     'purchases','recurring_orders','quotes','contracts','returns',
                     /* + tiền & công (v416–v424) */
                     'timesheetMeta','payrollExtra','payrollConfig','payrollStaffCfg',
                     'latePolicy','bonusRules','bonusLog','khoDuty','staffAliases'],

    create(label) {
      const data = {};
      this.KEYS_TO_BACKUP.forEach(k => {
        const v = window.STORE.get(k, null);
        if (v != null) data[k] = v;
      });
      const json = JSON.stringify(data);
      const snap = {
        id: 'SNAP' + Date.now().toString(36),
        ts: new Date().toISOString(),
        label: label || 'Snapshot tự động',
        size: json.length,
        data,
      };
      const list = window.STORE.get('snapshots', []) || [];
      list.unshift(snap);
      /* Giữ 2 cái mới nhất — mỗi bản copy TOÀN BỘ data (rất nặng ~MB) nên KHÔNG giữ nhiều
         (đã gây ĐẦY quota localStorage → gãy nạp KH/đơn). Backup thật đã có ở cloud. */
      while (list.length > 2) list.pop();
      window.STORE.set('snapshots', list);
      window.audit.log('backup.create', `Snapshot "${snap.label}" (${(json.length/1024).toFixed(1)} KB)`);
      return snap;
    },

    list() { return window.STORE.get('snapshots', []) || []; },

    restore(id) {
      const snap = this.list().find(s => s.id === id);
      if (!snap) throw new Error('Snapshot không tồn tại');
      Object.keys(snap.data).forEach(k => window.STORE.set(k, snap.data[k]));
      window.audit.log('backup.restore', `Phục hồi snapshot "${snap.label}"`);
      return snap;
    },

    delete(id) {
      const list = this.list().filter(s => s.id !== id);
      window.STORE.set('snapshots', list);
      window.audit.log('backup.delete', `Xoá snapshot ${id}`);
    },

    download(id) {
      const snap = this.list().find(s => s.id === id);
      if (!snap) return;
      const blob = new Blob([JSON.stringify(snap.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nstt-backup-${snap.ts.slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },

    /* Chạy auto-backup khi user mở app: nếu lần cuối > 24h thì tạo mới */
    runScheduledCheck() {
      try {
        const cfg = window.STORE.get('cfg_autobackup', { enabled: true, intervalHours: 24 });
        if (!cfg.enabled) return;
        const last = window.STORE.get('last_autobackup_ts', 0);
        const diffH = (Date.now() - last) / 3600000;
        if (diffH >= (cfg.intervalHours || 24)) {
          this.create('Auto · ' + new Date().toLocaleString('vi-VN'));
          window.STORE.set('last_autobackup_ts', Date.now());
        }
      } catch (e) { console.warn('[AutoBackup scheduled]', e); }
    },
  };

  /* Chạy mỗi khi load page */
  setTimeout(() => window.AutoBackup.runScheduledCheck(), 2000);


  /* =====================================================
     3. GLOBAL SEARCH (Ctrl+K)
     ───────────────────────────────────────────────────
     - Hook tất cả ô .search-global trong topbar
     - Mở dropdown kết quả tìm: orders, customers, products, staff
     - Click → đi tới page tương ứng
     ===================================================== */
  function gsNorm(s) {
    return (s || '').toString().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  }

  function buildResults(q) {
    if (!q || q.length < 2) return [];
    const Q = gsNorm(q);
    const out = [];

    /* Đơn hàng */
    (window.STORE.get('orders', window.ORDERS || []) || []).forEach(o => {
      const hay = gsNorm(o.code + ' ' + o.custName + ' ' + (o.custPhone||'') + ' ' + (o.drop||''));
      if (hay.includes(Q)) out.push({
        type: 'order', icon: '📦', label: o.code + ' · ' + o.custName,
        sub: window.fmt(o.freight||0) + ' ₫ · ' + (o.date||''),
        href: 'orders.html?focus=' + encodeURIComponent(o.code),
      });
    });

    /* Khách hàng — Sale chỉ tìm được KH mình phụ trách (row-level scope) */
    let _gsCusts = window.STORE.get('customers', window.CUSTOMERS || []) || [];
    try {
      const A = window.AUTH;
      if (A && typeof A.seesAllCustomers === 'function' && !A.seesAllCustomers()) {
        const u = A.currentUser && A.currentUser();
        const mine = ((u && u.name) || '').toString().trim().toLowerCase();
        _gsCusts = _gsCusts.filter(c => (c.staffOwner || '').toString().trim().toLowerCase() === mine);
      }
    } catch (e) {}
    _gsCusts.forEach(c => {
      const hay = gsNorm(c.code + ' ' + c.name + ' ' + (c.phone||'') + ' ' + (c.address||''));
      if (hay.includes(Q)) out.push({
        type: 'customer', icon: '👥', label: c.name,
        sub: c.code + ' · ' + (c.phone||'—') + ' · ' + (c.group||''),
        href: 'customers.html?focus=' + encodeURIComponent(c.code),
      });
    });

    /* Sản phẩm */
    (window.STORE.get('products', window.PRODUCTS || []) || []).forEach(p => {
      const hay = gsNorm(p.id + ' ' + p.name + ' ' + (p.category||''));
      if (hay.includes(Q)) out.push({
        type: 'product', icon: '🥬', label: p.name,
        sub: p.id + ' · ' + (p.category||'') + ' · ' + (p.unit||''),
        href: 'products.html?focus=' + encodeURIComponent(p.id),
      });
    });

    /* Nhân viên */
    (window.STORE.get('staff', window.STAFFS || []) || []).forEach(s => {
      const hay = gsNorm(s.id + ' ' + s.name + ' ' + (s.phone||'') + ' ' + (s.email||''));
      if (hay.includes(Q)) out.push({
        type: 'staff', icon: '🧑‍💼', label: s.name,
        sub: s.id + ' · ' + (s.position||'') + ' · ' + (s.department||''),
        href: 'staff.html?focus=' + encodeURIComponent(s.id),
      });
    });

    return out.slice(0, 25);
  }

  function renderGSDropdown(input, results, q) {
    let dd = document.getElementById('gs-dropdown');
    if (!dd) {
      dd = document.createElement('div');
      dd.id = 'gs-dropdown';
      dd.style.cssText = `position:absolute;top:42px;left:0;right:0;
        background:#fff;border:1px solid var(--line);border-radius:10px;
        box-shadow:0 8px 32px rgba(0,0,0,0.12);
        max-height:480px;overflow:auto;z-index:9999;
        font-size:13px`;
      input.parentElement.style.position = 'relative';
      input.parentElement.appendChild(dd);
    }
    if (!q || q.length < 2) {
      dd.innerHTML = `<div style="padding:18px 16px;color:var(--muted);font-size:12.5px">
        💡 <b>Mẹo:</b> Gõ tối thiểu 2 ký tự. Tìm mã đơn (NSTT-...), tên KH, SĐT, tên SP, mã NV.
        <div style="margin-top:6px;font-size:11.5px">Phím tắt: <kbd style="background:#F1F5F9;padding:1px 5px;border-radius:3px">Ctrl/⌘ + K</kbd></div>
      </div>`;
      return;
    }
    if (!results.length) {
      dd.innerHTML = `<div style="padding:18px 16px;color:var(--muted)">Không tìm thấy "<b>${q}</b>"</div>`;
      return;
    }
    /* Group by type */
    const groups = { order:[], customer:[], product:[], staff:[] };
    const labels = { order:'📦 Đơn hàng', customer:'👥 Khách hàng', product:'🥬 Sản phẩm', staff:'🧑‍💼 Nhân viên' };
    results.forEach(r => groups[r.type].push(r));

    let html = '';
    Object.keys(groups).forEach(k => {
      if (!groups[k].length) return;
      html += `<div style="padding:8px 14px;font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;font-weight:700;background:#FAFAFB;border-top:1px solid #F1F5F9">${labels[k]} · ${groups[k].length}</div>`;
      groups[k].forEach(r => {
        html += `<a href="${r.href}" style="display:flex;align-items:center;gap:10px;padding:9px 14px;color:var(--text);text-decoration:none;border-top:1px solid #F8FAFC">
          <div style="font-size:18px;width:24px;text-align:center">${r.icon}</div>
          <div style="flex:1;min-width:0;line-height:1.3">
            <div style="font-weight:600">${r.label}</div>
            <div style="font-size:11.5px;color:var(--muted)">${r.sub}</div>
          </div>
          <span style="color:var(--muted)">›</span>
        </a>`;
      });
    });
    dd.innerHTML = html;
    /* Hover effect */
    dd.querySelectorAll('a').forEach(a => {
      a.onmouseenter = () => a.style.background = '#F8FAFC';
      a.onmouseleave = () => a.style.background = '';
    });
  }

  function wireGlobalSearch() {
    document.querySelectorAll('.search-global input').forEach(inp => {
      if (inp.dataset.gsWired) return;
      inp.dataset.gsWired = '1';
      inp.placeholder = 'Tìm KH / đơn (NSTT-...) / SĐT / SP / NV — Ctrl+K';

      const onInput = () => {
        const q = inp.value.trim();
        const res = buildResults(q);
        renderGSDropdown(inp, res, q);
      };
      inp.addEventListener('focus', onInput);
      inp.addEventListener('input', onInput);
      inp.addEventListener('blur', () => setTimeout(() => {
        const dd = document.getElementById('gs-dropdown'); if (dd) dd.remove();
      }, 200));
    });
  }

  /* Ctrl+K shortcut */
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const inp = document.querySelector('.search-global input');
      if (inp) inp.focus();
    }
  });

  /* Hook vào shell render */
  setTimeout(wireGlobalSearch, 200);
  setInterval(wireGlobalSearch, 2000);


  /* =====================================================
     4. AI CHAT ASSISTANT
     ───────────────────────────────────────────────────
     ĐÃ TÁCH RA scripts/ai-chat.js với 4 tầng MEMORY:
     - Tầng 1: Working memory (10 turns nguyên văn)
     - Tầng 2: Episodic summary (tự tóm tắt khi dài)
     - Tầng 3: Semantic facts (nhớ qua nhiều session)
     - Tầng 4: Live data snapshot
     Code dưới đây là phiên bản CŨ — disabled. Không xoá để fallback.
     ===================================================== */
  /* === KHÔNG dùng nữa — đã thay bằng ai-chat.js có 4 tầng memory === */

})();
