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
    KEYS_TO_BACKUP: ['customers','orders','products','staff','drivers',
                     'timesheet','adspend','paymentAccounts','cashEntries',
                     'invoices','partners','audit_log','inventory','suppliers',
                     'purchases','recurring_orders','quotes','contracts','returns'],

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
      /* Giữ 14 cái mới nhất */
      while (list.length > 14) list.pop();
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

    /* Khách hàng */
    (window.STORE.get('customers', window.CUSTOMERS || []) || []).forEach(c => {
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
  const AICHAT_LEGACY_DISABLED = {
    open: false,
    hist: [],

    historyKey() {
      const u = window.CURRENT_USER || {};
      return 'chatHistory_' + (u.id || u.email || 'guest');
    },
    loadHist() {
      this.hist = window.STORE.get(this.historyKey(), []) || [];
    },
    saveHist() {
      try { window.STORE.set(this.historyKey(), this.hist.slice(-50)); } catch(e){}
    },

    systemPrompt() {
      const u = window.CURRENT_USER || {};
      const page = (location.pathname.split('/').pop() || '').replace('.html','');
      return `Bạn là TUTÚ — trợ lý AI nội bộ của app CRM "Nông Sản Tuấn Tú Hà Nội" (B2B nông sản cho nhà hàng).
App có 14 modules: Dashboard, Đơn hàng, Khách hàng, Sản phẩm+Bảng giá, Shipper, Kế toán, Công nợ, Hóa đơn VAT, Nhân viên, Chấm công+Lương, Báo cáo, Chi phí Ads, Cài đặt, Hướng dẫn.
Người dùng đang là: ${u.name||'Khách'} (${u.role||'?'}), đang xem trang: ${page||'?'}.
Trả lời tiếng Việt, ngắn gọn (3-6 câu), thực tế. Nếu user hỏi về tính năng app, chỉ rõ vào trang nào, bấm nút gì. Nếu user hỏi gợi ý kinh doanh, dựa vào dữ liệu thật (số đơn, doanh thu, KH...) — nói "Tôi xem dữ liệu trong app thấy..." rồi gợi ý.
KHÔNG bịa số liệu — nếu chưa rõ thì hỏi lại hoặc bảo user vào page cụ thể để xem.`;
    },

    /* Gọi AI text (không có ảnh) — chọn provider Gemini Flash mặc định */
    async ask(question) {
      if (!window.AI || !window.AI.ready()) {
        return '⚠️ Chưa có API key AI. Vào **Cài đặt → Tích hợp → AI Form Filler** dán key (Gemini FREE 1500 lượt/ngày).';
      }
      const p = window.AI.pickFor('chat');
      const cfg = window.STORE.get('int_ai-engine', {});
      const provider = p || (cfg.providers||[]).find(x => x.enabled !== false);
      if (!provider) return '⚠️ Chưa có provider AI nào enabled.';

      const sys = this.systemPrompt();
      const fullPrompt = sys + '\n\nNgười dùng hỏi: ' + question;

      try {
        if (provider.provider === 'gemini') {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${provider.model || 'gemini-2.0-flash'}:generateContent?key=${encodeURIComponent(provider.apiKey)}`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ contents:[{parts:[{text:fullPrompt}]}], generationConfig:{temperature:0.4} }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error?.message || 'Gemini ' + r.status);
          return (j.candidates?.[0]?.content?.parts || []).map(x=>x.text).join('') || '(không có trả lời)';
        }
        if (provider.provider === 'claude') {
          const r = await fetch('https://api.anthropic.com/v1/messages', {
            method:'POST',
            headers:{'Content-Type':'application/json','x-api-key':provider.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
            body: JSON.stringify({ model: provider.model || 'claude-haiku-4-5', max_tokens: 1024, system: sys, messages:[{role:'user', content: question}] }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error?.message || 'Claude ' + r.status);
          return j.content?.[0]?.text || '';
        }
        /* OpenAI */
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer ' + provider.apiKey},
          body: JSON.stringify({ model: provider.model || 'gpt-4o-mini', temperature: 0.4,
            messages:[{role:'system',content:sys},{role:'user',content:question}] }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error?.message || 'OpenAI ' + r.status);
        return j.choices?.[0]?.message?.content || '';
      } catch (e) {
        return '❌ Lỗi: ' + e.message;
      }
    },

    inject() {
      if (document.getElementById('aiChatBubble')) return;
      const bubble = document.createElement('div');
      bubble.id = 'aiChatBubble';
      bubble.innerHTML = `
        <style>
          #aiChatBubble{position:fixed;bottom:18px;right:18px;z-index:9998;font-family:inherit}
          #aiChatBtn{
            width:54px;height:54px;border-radius:50%;
            background:linear-gradient(135deg,#16A34A 0%,#1B5E20 100%);
            color:#fff;border:none;cursor:pointer;font-size:24px;
            box-shadow:0 6px 18px rgba(22,163,74,0.35);
            display:grid;place-items:center;transition:all 0.2s;
            position:relative;
          }
          #aiChatBtn:hover{transform:scale(1.06);box-shadow:0 8px 22px rgba(22,163,74,0.45)}
          #aiChatBtn .badge{
            position:absolute;top:-2px;right:-2px;
            background:#F59E0B;color:#fff;font-size:9px;font-weight:700;
            padding:2px 5px;border-radius:99px;
          }
          #aiChatPanel{
            position:fixed;bottom:84px;right:18px;
            width:380px;max-width:calc(100vw - 36px);
            height:560px;max-height:calc(100vh - 110px);
            background:#fff;border-radius:14px;
            box-shadow:0 16px 48px rgba(0,0,0,0.18);
            display:none;flex-direction:column;overflow:hidden;
            border:1px solid #E5E7EB;
          }
          #aiChatPanel.open{display:flex}
          .aic-head{
            background:linear-gradient(135deg,#16A34A 0%,#1B5E20 100%);
            color:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px;
          }
          .aic-head .av{width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.2);display:grid;place-items:center;font-size:16px}
          .aic-head .ti{flex:1;line-height:1.2}
          .aic-head .t1{font-weight:700;font-size:14px}
          .aic-head .t2{font-size:11px;opacity:0.85}
          .aic-head .cl{background:rgba(255,255,255,0.18);border:none;color:#fff;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:14px}
          .aic-body{flex:1;overflow-y:auto;padding:14px;background:#FAFBFC;display:flex;flex-direction:column;gap:10px}
          .aic-msg{padding:9px 12px;border-radius:11px;font-size:13px;line-height:1.5;max-width:85%;word-wrap:break-word}
          .aic-msg.user{align-self:flex-end;background:#16A34A;color:#fff;border-bottom-right-radius:3px}
          .aic-msg.bot{align-self:flex-start;background:#fff;color:#1F2937;border:1px solid #E5E7EB;border-bottom-left-radius:3px}
          .aic-msg.bot b{color:#1B5E20}
          .aic-quick{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 6px}
          .aic-quick button{background:#F0FDF4;border:1px solid #BBF7D0;color:#15803D;padding:5px 9px;border-radius:99px;font-size:11.5px;cursor:pointer;font-weight:500}
          .aic-quick button:hover{background:#DCFCE7}
          .aic-foot{padding:10px 12px;border-top:1px solid #E5E7EB;background:#fff;display:flex;gap:6px}
          .aic-foot input{flex:1;border:1px solid #D1D5DB;border-radius:20px;padding:8px 14px;font-size:13px;outline:none}
          .aic-foot input:focus{border-color:#16A34A}
          .aic-foot button{background:#16A34A;color:#fff;border:none;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:16px;display:grid;place-items:center}
          .aic-foot button:disabled{opacity:0.5;cursor:not-allowed}
          .aic-typing{font-size:11.5px;color:var(--muted);font-style:italic;padding:0 4px}
        </style>
        <button id="aiChatBtn" title="TUTÚ — trợ lý AI">🤖<span class="badge">AI</span></button>
        <div id="aiChatPanel">
          <div class="aic-head">
            <div class="av">🤖</div>
            <div class="ti"><div class="t1">TUTÚ — Trợ lý AI</div><div class="t2">Hỏi gì về app/dữ liệu cũng được</div></div>
            <button class="cl" onclick="window.AiChat.toggle()" title="Đóng">✕</button>
          </div>
          <div class="aic-body" id="aicBody"></div>
          <div class="aic-quick" id="aicQuick"></div>
          <div class="aic-foot">
            <input id="aicInp" placeholder="Nhập câu hỏi... (Enter để gửi)" onkeydown="if(event.key==='Enter')window.AiChat.send()">
            <button onclick="window.AiChat.send()" id="aicSendBtn" title="Gửi">➤</button>
          </div>
        </div>
      `;
      document.body.appendChild(bubble);
      document.getElementById('aiChatBtn').onclick = () => this.toggle();
      this.loadHist();
      this.render();
      this.renderQuick();
    },

    toggle() {
      this.open = !this.open;
      const p = document.getElementById('aiChatPanel');
      if (p) p.classList.toggle('open', this.open);
      if (this.open) {
        setTimeout(() => document.getElementById('aicInp')?.focus(), 100);
        this.scrollBottom();
      }
    },

    render() {
      const body = document.getElementById('aicBody');
      if (!body) return;
      if (!this.hist.length) {
        body.innerHTML = `<div class="aic-msg bot">
          👋 Chào ${window.CURRENT_USER?.name || 'sếp'}! Tôi là <b>TUTÚ</b>, trợ lý AI của app Nông Sản Tuấn Tú.
          <br><br>Tôi có thể:
          <br>• Trả lời "tính năng X ở đâu?", "cách làm Y?"
          <br>• Tóm tắt báo cáo / KPI tháng
          <br>• Gợi ý hành động (KH nào cần đôn nợ, SP nào bán chậm...)
          <br><br>Hỏi gì cũng được nhé!
        </div>`;
        return;
      }
      body.innerHTML = this.hist.map(m => `
        <div class="aic-msg ${m.role}">${this.fmtMsg(m.content)}</div>
      `).join('');
    },

    fmtMsg(s) {
      /* Markdown light: **bold** + line breaks */
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\n/g, '<br>');
    },

    renderQuick() {
      const q = document.getElementById('aicQuick');
      if (!q) return;
      const page = (location.pathname.split('/').pop() || '').replace('.html','');
      const PROMPTS = {
        dashboard: ['Tóm tắt KPI hôm nay', 'KH nào cần đôn nợ?', 'SP nào bán chạy nhất tháng?'],
        orders: ['Đơn nào đang chậm giao?', 'Tỷ lệ đơn huỷ ra sao?', 'Cách đổi trạng thái đơn?'],
        customers: ['KH VIP nào lâu chưa đặt?', 'Cách thêm KH từ ảnh?', 'KH nào nợ quá hạn?'],
        products: ['SP nào sắp hết hàng?', 'Cách điều chỉnh giá theo ngày?', 'Top 5 SP có biên lãi cao'],
        payroll: ['Tổng lương tháng này?', 'NV nào đi muộn nhiều?', 'Cách upload chấm công Excel?'],
        reports: ['Lãi ròng tháng vs tháng trước?', 'Xuất báo cáo PDF được không?', 'Cách gửi báo cáo Telegram?'],
        default: ['App có những tính năng gì?', 'Cách phân quyền NV?', 'Hướng dẫn cài Telegram bot'],
      };
      const list = PROMPTS[page] || PROMPTS.default;
      q.innerHTML = list.map(p => `<button onclick="window.AiChat.askQuick('${p.replace(/'/g,'\\\'')}')">${p}</button>`).join('');
    },

    askQuick(text) {
      document.getElementById('aicInp').value = text;
      this.send();
    },

    async send() {
      const inp = document.getElementById('aicInp');
      const text = inp.value.trim();
      if (!text) return;
      this.hist.push({ role:'user', content: text, ts: Date.now() });
      inp.value = '';
      this.render(); this.scrollBottom();

      /* Typing indicator */
      const body = document.getElementById('aicBody');
      const t = document.createElement('div');
      t.className = 'aic-typing'; t.id = 'aicTyping';
      t.textContent = '🤖 TUTÚ đang suy nghĩ...';
      body.appendChild(t); this.scrollBottom();

      document.getElementById('aicSendBtn').disabled = true;
      const reply = await this.ask(text);
      document.getElementById('aicSendBtn').disabled = false;

      this.hist.push({ role:'bot', content: reply, ts: Date.now() });
      this.saveHist();
      document.getElementById('aicTyping')?.remove();
      this.render(); this.scrollBottom();
      window.audit.log('aichat.message', text.slice(0, 80));
    },

    scrollBottom() {
      const b = document.getElementById('aicBody');
      if (b) b.scrollTop = b.scrollHeight;
    },

    clear() {
      this.hist = [];
      this.saveHist();
      this.render();
    },
  };
  /* === KHÔNG dùng nữa — đã thay bằng ai-chat.js có 4 tầng memory === */
  /* window.AiChat = AICHAT_LEGACY_DISABLED; */
  /* if (document.readyState === 'complete') AICHAT_LEGACY_DISABLED.inject(); */

})();
