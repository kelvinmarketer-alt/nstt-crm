/* =========================================================
   TUTÚ — AI Chat Assistant với 4 TẦNG MEMORY
   ─────────────────────────────────────────────────────────
   Giải quyết vấn đề "bot quên" của LLM bằng kiến trúc memory chuẩn:

   ┌─────────────────────────────────────────────────────────┐
   │ TẦNG 1: WORKING MEMORY (ngắn hạn)                       │
   │   Gửi N=10 turn gần nhất NGUYÊN VĂN qua messages[]      │
   │   → Bot nhớ mọi thứ trong cuộc trò chuyện hiện tại      │
   ├─────────────────────────────────────────────────────────┤
   │ TẦNG 2: EPISODIC SUMMARY (trung hạn)                    │
   │   Khi hist > 20 → AI tự tóm tắt đoạn cũ thành 1 đoạn    │
   │   → Bot vẫn nhớ "ý chính" các cuộc trò chuyện dài       │
   ├─────────────────────────────────────────────────────────┤
   │ TẦNG 3: SEMANTIC FACTS (dài hạn)                        │
   │   AI tự extract fact: "User tên X", "DN kinh doanh Y"   │
   │   Lưu STORE.chat_facts_<userId> — đẩy vào system prompt │
   │   → Bot nhớ user qua nhiều session khác nhau            │
   ├─────────────────────────────────────────────────────────┤
   │ TẦNG 4: LIVE DATA SNAPSHOT                              │
   │   Mỗi câu hỏi, bơm KPI hiện tại + lịch sử order... vào  │
   │   → Bot trả lời số liệu THẬT, không bịa                 │
   └─────────────────────────────────────────────────────────┘

   BONUS: Multi-conversation — list, đổi tên, xoá, export
   ========================================================= */
(function () {

  const WORKING_TURNS = 10;        /* Số turn nguyên văn gửi lên */
  const SUMMARIZE_AT = 20;         /* Khi hist > X turn → summarize */

  /* ============================================================
     CORE: STATE & STORAGE
     ============================================================ */
  const AICHAT = {
    open: false,
    activeConvId: null,             /* Id cuộc trò chuyện đang mở */
    hist: [],                       /* Array tin nhắn cuộc hiện tại */
    isSummarizing: false,

    /* === Keys lưu trữ === */
    userId() {
      const u = window.CURRENT_USER || {};
      return u.id || u.email || u.name || 'guest';
    },
    convListKey() { return 'aic_convs_' + this.userId(); },
    convKey(id) { return 'aic_conv_' + this.userId() + '_' + id; },
    factsKey() { return 'aic_facts_' + this.userId(); },

    /* === Conversation list === */
    listConvs() { return window.STORE.get(this.convListKey(), []) || []; },
    saveConvList(list) { window.STORE.set(this.convListKey(), list); },

    /* === Active conversation hist === */
    loadConv(id) {
      const obj = window.STORE.get(this.convKey(id), null);
      if (obj) {
        this.hist = obj.messages || [];
        this.activeConvId = id;
        return true;
      }
      return false;
    },
    saveConv() {
      if (!this.activeConvId) return;
      const list = this.listConvs();
      const meta = list.find(c => c.id === this.activeConvId);
      const firstUser = this.hist.find(m => m.role === 'user');
      const title = meta?.title || (firstUser ? firstUser.content.slice(0, 50) : 'Cuộc mới');
      window.STORE.set(this.convKey(this.activeConvId), {
        id: this.activeConvId,
        title,
        messages: this.hist,
        summary: this._summary || '',
        updatedAt: Date.now(),
      });
      /* Update meta in list */
      if (!meta) {
        list.unshift({ id: this.activeConvId, title, updatedAt: Date.now() });
      } else {
        meta.title = title; meta.updatedAt = Date.now();
        list.sort((a, b) => b.updatedAt - a.updatedAt);
      }
      this.saveConvList(list);
    },

    newConversation() {
      this.activeConvId = 'C' + Date.now().toString(36);
      this.hist = [];
      this._summary = '';
      this.render(); this.renderConvList();
    },

    /* === Facts (semantic memory) === */
    getFacts() { return window.STORE.get(this.factsKey(), []) || []; },
    saveFacts(f) { window.STORE.set(this.factsKey(), f.slice(0, 40)); },  /* Cap 40 facts */

    /* ============================================================
       TẦNG 4: LIVE DATA SNAPSHOT — bơm số liệu thật vào prompt
       ============================================================ */
    /* === Helper: check perms của user hiện tại === */
    _can(perm) {
      const u = window.CURRENT_USER || {};
      const perms = u.perms || [];
      return perms.includes('all') || perms.includes('*') || perms.includes(perm);
    },

    liveDataSnapshot() {
      try {
        const can = (p) => this._can(p);
        const u = window.CURRENT_USER || {};
        const myName = u.name || '';

        const orders = window.STORE.get('orders', []) || [];
        const customers = window.STORE.get('customers', []) || [];
        const products = window.STORE.get('products', []) || [];
        const staff = window.STORE.get('staff', []) || [];
        const ads = window.STORE.get('adspend', []) || [];
        const inv = window.STORE.get('inventory', []) || [];

        const TODAY = window.todayVN();
        /* Sales/CSKH chỉ thấy KH+đơn mình phụ trách. Admin/all → full */
        const mineFilter = (arr, ownerField) =>
          can('all') ? arr : arr.filter(x => (x[ownerField]||'').includes(myName) || !x[ownerField]);
        const visibleCusts  = can('customers') ? mineFilter(customers, 'staffOwner') : [];
        const visibleOrders = can('orders')    ? mineFilter(orders,    'staff') : [];

        const todayOrders = visibleOrders.filter(o => (o.date||'').startsWith(TODAY) && o.status !== 'cancelled');
        const monthOrders = visibleOrders.filter(o => (o.date||'').includes('/05/2026') && o.status !== 'cancelled');
        const monthRev = monthOrders.reduce((s,o)=>s+(o.freight||0),0);

        const out = [];
        out.push(`📊 DỮ LIỆU THẬT HIỆN TẠI (chỉ trong PHẠM VI ${u.role||'user'} của ${myName||'user'}):`);

        if (can('orders')) {
          out.push(`- Hôm nay (${TODAY}): ${todayOrders.length} đơn · DT ${(todayOrders.reduce((s,o)=>s+(o.freight||0),0)/1e6).toFixed(1)}tr`);
          out.push(`- Tháng 5/2026: ${monthOrders.length} đơn · DT ${(monthRev/1e6).toFixed(1)}tr`);
        }
        if (can('customers')) {
          const vipCusts = visibleCusts.filter(c => c.group === 'VIP').length;
          out.push(`- KH (trong phạm vi): ${visibleCusts.length} tổng (${vipCusts} VIP)`);
        }
        if (can('debt') || can('accounting') || can('all')) {
          const totalDebt = visibleCusts.reduce((s,c)=>s+(c.debt||0),0);
          const overdueDebt = visibleCusts.reduce((s,c)=>s+(c.debtOverdue||0),0);
          const overdueCusts = visibleCusts.filter(c => c.debtOverdue > 0).sort((a,b)=>b.debtOverdue-a.debtOverdue).slice(0,3);
          out.push(`- Σ công nợ ${(totalDebt/1e6).toFixed(1)}tr (${(overdueDebt/1e6).toFixed(1)}tr QUÁ HẠN)`);
          if (overdueCusts.length) out.push(`- KH nợ QH cần đôn: ${overdueCusts.map(c=>`${c.name}(${(c.debtOverdue/1e6).toFixed(1)}tr)`).join(', ')}`);
        }
        if (can('adspend')) {
          const monthAds = ads.filter(a => (a.date||'').startsWith('2026-05')).reduce((s,a)=>s+(a.spend||0),0);
          out.push(`- Chi phí Ads T5: ${(monthAds/1e6).toFixed(1)}tr`);
        }
        if (can('inventory')) {
          const lowStock = inv.filter(i => i.stock < i.minStock).length;
          const outStock = inv.filter(i => i.stock <= 0).length;
          out.push(`- Kho: ${products.length} SP, ${outStock} HẾT HÀNG, ${lowStock} dưới ngưỡng`);
        }
        if (can('staff') || can('payroll')) {
          const activeStaff = staff.filter(s => s.status === 'active').length;
          out.push(`- Nhân sự: ${activeStaff} NV active`);
        }
        /* Lợi nhuận, giá vốn, lương — CHỈ admin (perms='all') */
        if (can('all')) {
          const cogs = monthOrders.reduce((s,o)=>{
            return s + (o.items||[]).reduce((ss,it) => {
              const p = products.find(x=>x.id===it.id);
              const buy = p && p.priceHistory ? (p.priceHistory[p.priceHistory.length-1]?.buy || 0) : 0;
              return ss + buy * (it.qty||0);
            },0);
          },0);
          const grossProfit = monthRev - cogs;
          const totalSalary = staff.reduce((s,x)=>s+(x.salary||0),0);
          out.push(`- 💼 LỢI NHUẬN T5 (admin-only): gộp ${(grossProfit/1e6).toFixed(1)}tr (sau giá vốn ${(cogs/1e6).toFixed(1)}tr)`);
          out.push(`- 💼 Quỹ lương tháng (admin-only): ${(totalSalary/1e6).toFixed(1)}tr`);
        }
        return out.join('\n');
      } catch (e) {
        return '(không lấy được data snapshot)';
      }
    },

    /* ============================================================
       SYSTEM PROMPT — gộp facts + summary + live data
       ============================================================ */
    systemPrompt() {
      const u = window.CURRENT_USER || {};
      const page = (location.pathname.split('/').pop() || '').replace('.html','');
      const facts = this.getFacts();
      const factsBlock = facts.length
        ? '\n🧠 FACTS VỀ USER NÀY (nhớ qua nhiều session):\n' + facts.map(f => `- ${f.text}`).join('\n')
        : '';
      const summaryBlock = this._summary
        ? '\n📜 TÓM TẮT CÁC TRÒ CHUYỆN TRƯỚC ĐÓ TRONG SESSION NÀY:\n' + this._summary
        : '';
      const dataBlock = '\n\n' + this.liveDataSnapshot();

      /* === Tính permission block động === */
      const perms = u.perms || [];
      const isAdmin = perms.includes('all') || perms.includes('*');
      const allowed = [];
      const blocked = [];
      const PERM_LABELS = {
        orders: 'Đơn hàng', customers: 'Khách hàng', leads: 'Lead', shippers: 'Shipper',
        products: 'Sản phẩm', inventory: 'Kho', suppliers: 'NCC', purchases: 'Phiếu nhập',
        invoices: 'Hóa đơn', debt: 'Công nợ', accounting: 'Kế toán',
        adspend: 'Chi phí Ads', staff: 'Nhân viên', payroll: 'Lương', reports: 'Báo cáo',
        settings: 'Cài đặt', marketing: 'Marketing', returns: 'Trả hàng',
        quotes: 'Báo giá', recurring: 'Đơn định kỳ',
      };
      if (isAdmin) {
        allowed.push('TẤT CẢ (admin)');
      } else {
        for (const [k, lbl] of Object.entries(PERM_LABELS)) {
          if (perms.includes(k)) allowed.push(lbl); else blocked.push(lbl);
        }
      }
      const permsBlock = `
🔒 PHÂN QUYỀN USER (NGHIÊM NGẶT — KHÔNG ĐƯỢC PHÉP VƯỢT):
- Được phép: ${allowed.join(', ')}
${blocked.length ? '- KHÔNG được phép: ' + blocked.join(', ') : ''}
${!isAdmin ? `- KHÔNG được tiết lộ lợi nhuận, giá vốn, lương NV, doanh thu toàn công ty (chỉ phạm vi mình phụ trách)` : ''}`;

      return `Bạn là TUTÚ — trợ lý AI nội bộ của app CRM "Nông Sản Tuấn Tú Hà Nội" (B2B nông sản cho nhà hàng Hà Nội).

📦 APP CÓ 22 MODULES: Dashboard · Đơn hàng · Báo giá · Đơn định kỳ · Khách hàng · KH 360/RFM · Lead funnel · Shipper · Kho · Nhà cung cấp · Phiếu nhập · Trả hàng+POD · Sản phẩm+Giá ngày · Loyalty · Kế toán · Công nợ · Hóa đơn VAT · Chi phí Ads · Nhân viên · Chấm công+Lương · Marketing blast · Báo cáo · Audit log · TG Bot 2 chiều · Cài đặt.

👤 USER ĐANG ĐĂNG NHẬP: ${u.name||'Khách'} (vai trò: ${u.role||'?'}), đang xem trang: ${page||'?'}
${permsBlock}
${factsBlock}
${summaryBlock}
${dataBlock}

🎯 NGUYÊN TẮC TRẢ LỜI:
1. Tiếng Việt tự nhiên, ngắn gọn (3-6 câu), thực tế — không dài dòng
2. Khi user hỏi số liệu → DÙNG số trong DỮ LIỆU THẬT phía trên, KHÔNG BỊA
3. Khi user hỏi "làm thế nào" → chỉ rõ vào trang nào, bấm nút gì
4. Tham chiếu các cuộc trò chuyện trước (trong SUMMARY/FACTS) khi liên quan
5. Khi không chắc → hỏi lại thay vì đoán
6. Có thể dùng **bold** + emoji + xuống dòng cho dễ đọc
7. **NẾU USER HỎI VƯỢT QUYỀN** → trả lời lịch sự: "Anh/chị không có quyền xem [chủ đề]. Vui lòng liên hệ admin (chủ DN) để được hỗ trợ." KHÔNG được tiết lộ số liệu`;
    },

    /* ============================================================
       TẦNG 2: SUMMARIZE đoạn cũ khi hist quá dài
       ============================================================ */
    async summarizeOldTurns() {
      if (this.hist.length <= SUMMARIZE_AT) return;
      if (this.isSummarizing) return;
      this.isSummarizing = true;
      try {
        const old = this.hist.slice(0, this.hist.length - WORKING_TURNS);
        const text = old.map(m => `${m.role === 'user' ? 'USER' : 'TUTÚ'}: ${m.content}`).join('\n');
        const prompt = `Tóm tắt cuộc trò chuyện dưới đây thành 3-5 câu ngắn, GHI RÕ các fact + quyết định + chủ đề chính. Tiếng Việt, không bullet. Bắt đầu trực tiếp, không "Tóm tắt:" gì cả.

${this._summary ? 'TÓM TẮT TRƯỚC: ' + this._summary + '\n\nĐOẠN MỚI:\n' : ''}${text}`;
        const reply = await this._callAI(prompt, []);
        this._summary = (reply || '').trim().slice(0, 1200);
        /* Cắt history còn WORKING_TURNS */
        this.hist = this.hist.slice(-WORKING_TURNS);
        this.saveConv();
      } catch (e) {
        console.warn('[AICHAT] Summarize failed:', e);
      }
      this.isSummarizing = false;
    },

    /* ============================================================
       TẦNG 3: EXTRACT FACTS sau mỗi K turn (background)
       ============================================================ */
    async maybeExtractFacts() {
      /* Chạy mỗi 4 turn user */
      const userTurns = this.hist.filter(m => m.role === 'user').length;
      if (userTurns % 4 !== 0 || userTurns === 0) return;

      const recent = this.hist.slice(-8).map(m => `${m.role}: ${m.content}`).join('\n');
      const existing = this.getFacts().map(f => f.text).join('\n');

      const prompt = `Đọc cuộc trò chuyện gần đây dưới đây + danh sách fact đã biết. NHIỆM VỤ: phát hiện FACT MỚI về user (tên, vai trò, sở thích, mục tiêu KD, quyết định...).
TRẢ JSON: {"newFacts": ["fact 1 ngắn gọn", "fact 2 ngắn gọn", ...]}
- Mỗi fact 1 câu ngắn (≤ 80 ký tự)
- KHÔNG lặp fact đã có
- Nếu không có fact mới đáng nhớ → {"newFacts":[]}

FACT ĐÃ BIẾT:
${existing || '(chưa có)'}

CUỘC TRÒ CHUYỆN GẦN ĐÂY:
${recent}`;

      try {
        const reply = await this._callAI(prompt, [], { jsonMode: true });
        const j = JSON.parse(reply.match(/\{[\s\S]*\}/)?.[0] || '{}');
        if (j.newFacts && j.newFacts.length) {
          const facts = this.getFacts();
          j.newFacts.forEach(text => {
            if (text && !facts.some(f => f.text === text)) {
              facts.push({ text, ts: Date.now() });
            }
          });
          this.saveFacts(facts);
          console.log('[AICHAT] Học fact mới:', j.newFacts);
        }
      } catch (e) {
        console.warn('[AICHAT] Extract facts failed:', e);
      }
    },

    /* ============================================================
       TẦNG 1: WORKING MEMORY — gọi AI với history multi-turn
       ============================================================ */
    async _callAI(question, recentMessages, opts) {
      opts = opts || {};
      if (!window.AI || !window.AI.ready()) {
        return '⚠️ Chưa có API key AI. Vào **Cài đặt → Tích hợp → AI Form Filler** dán key (Gemini FREE 1500 lượt/ngày).';
      }
      const provider = window.AI.pickFor('chat')
        || (window.STORE.get('int_ai-engine', {}).providers || []).find(x => x.enabled !== false);
      if (!provider || !provider.apiKey) return '⚠️ Chưa có provider AI nào enabled.';

      const sys = this.systemPrompt();
      const msgs = (recentMessages || []).map(m => ({
        role: m.role === 'bot' ? 'assistant' : 'user',
        content: m.content,
      }));
      msgs.push({ role: 'user', content: question });

      try {
        if (provider.provider === 'claude') {
          /* Claude: dùng system + messages[] đúng chuẩn */
          const r = await fetch('https://api.anthropic.com/v1/messages', {
            method:'POST',
            headers:{
              'Content-Type':'application/json',
              'x-api-key': provider.apiKey,
              'anthropic-version':'2023-06-01',
              'anthropic-dangerous-direct-browser-access':'true'
            },
            body: JSON.stringify({
              model: provider.model || 'claude-haiku-4-5',
              max_tokens: 1024,
              system: sys,
              messages: msgs,
            }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error?.message || 'Claude ' + r.status);
          return j.content?.[0]?.text || '';
        }

        if (provider.provider === 'gemini') {
          /* Gemini: contents[] với role 'user'/'model' */
          const contents = msgs.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          }));
          const body = {
            systemInstruction: { parts: [{ text: sys }] },
            contents,
            generationConfig: {
              temperature: 0.4,
              ...(opts.jsonMode ? { response_mime_type: 'application/json' } : {}),
            },
          };
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${provider.model || 'gemini-2.0-flash'}:generateContent?key=${encodeURIComponent(provider.apiKey)}`,
            { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) }
          );
          const j = await r.json();
          if (!r.ok) throw new Error(j.error?.message || 'Gemini ' + r.status);
          return (j.candidates?.[0]?.content?.parts || []).map(x=>x.text).join('') || '';
        }

        /* OpenAI: messages[] với system + alternating user/assistant */
        const oaMsgs = [{ role:'system', content: sys }, ...msgs];
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer ' + provider.apiKey},
          body: JSON.stringify({
            model: provider.model || 'gpt-4o-mini',
            temperature: 0.4,
            messages: oaMsgs,
            ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error?.message || 'OpenAI ' + r.status);
        return j.choices?.[0]?.message?.content || '';
      } catch (e) {
        return '❌ Lỗi gọi AI: ' + e.message;
      }
    },

    /* High-level: ask 1 câu, dùng WORKING_TURNS gần nhất làm context */
    async ask(question) {
      const recent = this.hist.slice(-WORKING_TURNS);
      return this._callAI(question, recent);
    },

    /* ============================================================
       UI INJECTION
       ============================================================ */
    inject() {
      if (document.getElementById('aiChatBubble')) return;
      const bubble = document.createElement('div');
      bubble.id = 'aiChatBubble';
      bubble.innerHTML = `
        <style>
          #aiChatBubble{position:fixed;bottom:18px;right:18px;z-index:9998;font-family:inherit}
          #aiChatBtn{
            width:56px;height:56px;border-radius:50%;
            background:linear-gradient(135deg,#16A34A 0%,#1B5E20 100%);
            color:#fff;border:none;cursor:pointer;font-size:26px;
            box-shadow:0 6px 18px rgba(22,163,74,0.4);
            display:grid;place-items:center;transition:all 0.2s;
            position:relative;
          }
          #aiChatBtn:hover{transform:scale(1.08);box-shadow:0 10px 26px rgba(22,163,74,0.5)}
          #aiChatBtn .badge{
            position:absolute;top:-2px;right:-2px;
            background:#F59E0B;color:#fff;font-size:9px;font-weight:700;
            padding:2px 6px;border-radius:99px;
          }
          #aiChatPanel{
            position:fixed;bottom:88px;right:18px;
            width:420px;max-width:calc(100vw - 36px);
            height:620px;max-height:calc(100vh - 110px);
            background:#fff;border-radius:14px;
            box-shadow:0 16px 48px rgba(0,0,0,0.2);
            display:none;flex-direction:column;overflow:hidden;
            border:1px solid #E5E7EB;
          }
          #aiChatPanel.open{display:flex}
          .aic-head{
            background:linear-gradient(135deg,#16A34A 0%,#1B5E20 100%);
            color:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px;
          }
          .aic-head .av{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,0.2);display:grid;place-items:center;font-size:18px}
          .aic-head .ti{flex:1;line-height:1.2;min-width:0}
          .aic-head .t1{font-weight:700;font-size:14px}
          .aic-head .t2{font-size:11px;opacity:0.85;display:flex;align-items:center;gap:6px}
          .aic-head .t2 .mem-dot{width:6px;height:6px;border-radius:50%;background:#A7F3D0;animation:pulse 2s infinite}
          @keyframes pulse{0%,100%{opacity:0.6}50%{opacity:1}}
          .aic-head .iconbtn{background:rgba(255,255,255,0.18);border:none;color:#fff;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:13px;display:grid;place-items:center;transition:0.15s}
          .aic-head .iconbtn:hover{background:rgba(255,255,255,0.3)}

          .aic-body{flex:1;overflow-y:auto;padding:14px;background:#FAFBFC;display:flex;flex-direction:column;gap:10px}
          .aic-msg{padding:10px 13px;border-radius:11px;font-size:13px;line-height:1.5;max-width:88%;word-wrap:break-word}
          .aic-msg.user{align-self:flex-end;background:#16A34A;color:#fff;border-bottom-right-radius:3px}
          .aic-msg.bot{align-self:flex-start;background:#fff;color:#1F2937;border:1px solid #E5E7EB;border-bottom-left-radius:3px}
          .aic-msg.bot b{color:#1B5E20}
          .aic-msg .ts{font-size:9.5px;opacity:0.55;margin-top:3px;font-style:italic}
          .aic-empty{text-align:center;color:var(--muted);padding:20px;font-size:12.5px;line-height:1.6}
          .aic-empty .ie{font-size:36px;margin-bottom:6px}

          .aic-quick{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 6px}
          .aic-quick button{background:#F0FDF4;border:1px solid #BBF7D0;color:#15803D;padding:5px 10px;border-radius:99px;font-size:11.5px;cursor:pointer;font-weight:500}
          .aic-quick button:hover{background:#DCFCE7}

          .aic-foot{padding:10px 12px;border-top:1px solid #E5E7EB;background:#fff;display:flex;gap:6px;align-items:center}
          .aic-foot input{flex:1;border:1px solid #D1D5DB;border-radius:20px;padding:9px 14px;font-size:13px;outline:none}
          .aic-foot input:focus{border-color:#16A34A}
          .aic-foot button.send{background:#16A34A;color:#fff;border:none;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:16px;display:grid;place-items:center}
          .aic-foot button.send:disabled{opacity:0.5;cursor:not-allowed}
          .aic-typing{font-size:11.5px;color:var(--muted);font-style:italic;padding:0 4px;display:flex;align-items:center;gap:4px}

          /* Drawer trái: list conversations */
          .aic-drawer{
            position:absolute;top:0;left:0;bottom:0;width:240px;
            background:#fff;border-right:1px solid #E5E7EB;
            transform:translateX(-100%);transition:transform 0.2s;
            display:flex;flex-direction:column;z-index:5;
          }
          .aic-drawer.open{transform:translateX(0)}
          .aic-drawer .dh{padding:12px;border-bottom:1px solid #E5E7EB;display:flex;align-items:center;gap:8px;background:#FAFBFC}
          .aic-drawer .dh button.new{flex:1;background:#16A34A;color:#fff;border:none;padding:7px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600}
          .aic-drawer .convlist{flex:1;overflow-y:auto;padding:4px}
          .aic-conv{padding:8px 10px;cursor:pointer;border-radius:6px;font-size:12px;margin-bottom:2px;display:flex;align-items:center;gap:8px}
          .aic-conv:hover{background:#FAFBFC}
          .aic-conv.active{background:#E8F5E2;color:#1B5E20;font-weight:600}
          .aic-conv .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
          .aic-conv .x{opacity:0;color:#DC2626;font-weight:700}
          .aic-conv:hover .x{opacity:1}

          /* Memory inspector panel */
          .aic-mem{
            position:absolute;top:60px;left:10px;right:10px;
            background:#fff;border:1px solid #E5E7EB;border-radius:10px;
            box-shadow:0 8px 24px rgba(0,0,0,0.15);
            padding:14px;z-index:6;display:none;max-height:80%;overflow:auto;font-size:12px;
          }
          .aic-mem.open{display:block}
          .aic-mem h4{font-size:12px;color:#1B5E20;margin:10px 0 6px;text-transform:uppercase;letter-spacing:0.4px}
          .aic-mem h4:first-child{margin-top:0}
          .aic-mem .fact-item{background:#F0FDF4;color:#15803D;padding:5px 9px;border-radius:5px;margin-bottom:4px;font-size:11.5px;display:flex;align-items:center;gap:6px}
          .aic-mem .fact-item .x{margin-left:auto;cursor:pointer;color:#DC2626;opacity:0.6}
          .aic-mem .fact-item .x:hover{opacity:1}
          .aic-mem .empty{color:var(--muted);font-style:italic;padding:8px;text-align:center;font-size:11.5px}
        </style>
        <button id="aiChatBtn" title="TUTÚ — trợ lý AI (nhớ tất cả)">🤖<span class="badge">AI</span></button>
        <div id="aiChatPanel">
          <div class="aic-head">
            <button class="iconbtn" onclick="window.AiChat.toggleDrawer()" title="Lịch sử cuộc trò chuyện">☰</button>
            <div class="av">🤖</div>
            <div class="ti">
              <div class="t1">TUTÚ — Trợ lý AI</div>
              <div class="t2"><span class="mem-dot"></span> <span id="memInfo">Đang nhớ...</span></div>
            </div>
            <button class="iconbtn" onclick="window.AiChat.toggleMemView()" title="Xem bộ nhớ AI nhớ về bạn">🧠</button>
            <button class="iconbtn" onclick="window.AiChat.exportConv()" title="Tải về">📥</button>
            <button class="iconbtn" onclick="window.AiChat.toggle()" title="Đóng">✕</button>
          </div>

          <div class="aic-drawer" id="aicDrawer">
            <div class="dh">
              <button class="new" onclick="window.AiChat.newConversation();window.AiChat.toggleDrawer()">+ Cuộc mới</button>
              <button class="iconbtn" style="background:#F1F5F9;color:#475569" onclick="window.AiChat.toggleDrawer()" title="Đóng">✕</button>
            </div>
            <div class="convlist" id="aicConvList"></div>
          </div>

          <div class="aic-mem" id="aicMemView"></div>

          <div class="aic-body" id="aicBody"></div>
          <div class="aic-quick" id="aicQuick"></div>
          <div class="aic-foot">
            <input id="aicInp" placeholder="Hỏi TUTÚ... (tôi nhớ mọi thứ)" onkeydown="if(event.key==='Enter')window.AiChat.send()">
            <button class="send" onclick="window.AiChat.send()" id="aicSendBtn" title="Gửi">➤</button>
          </div>
        </div>
      `;
      document.body.appendChild(bubble);
      document.getElementById('aiChatBtn').onclick = () => this.toggle();

      /* Load: conversation gần nhất hoặc tạo mới */
      const list = this.listConvs();
      if (list.length) {
        this.loadConv(list[0].id);
      } else {
        this.newConversation();
      }
      this.render();
      this.renderConvList();
      this.renderQuick();
      this.renderMemInfo();
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

    toggleDrawer() {
      document.getElementById('aicDrawer')?.classList.toggle('open');
      document.getElementById('aicMemView')?.classList.remove('open');
    },

    toggleMemView() {
      const mv = document.getElementById('aicMemView');
      if (!mv) return;
      const willOpen = !mv.classList.contains('open');
      mv.classList.toggle('open', willOpen);
      document.getElementById('aicDrawer')?.classList.remove('open');
      if (willOpen) this.renderMemView();
    },

    renderMemView() {
      const facts = this.getFacts();
      const mv = document.getElementById('aicMemView');
      if (!mv) return;
      mv.innerHTML = `
        <h4>🧠 4 TẦNG BỘ NHỚ CỦA TUTÚ</h4>
        <div style="background:#F0FDF4;padding:8px 10px;border-radius:6px;font-size:11px;line-height:1.55;color:#15803D;margin-bottom:8px">
          <b>Tầng 1 · Working memory:</b> ${this.hist.length} tin nhắn nguyên văn (gửi ${Math.min(this.hist.length, WORKING_TURNS)} cái mới nhất)<br>
          <b>Tầng 2 · Summary:</b> ${this._summary ? this._summary.length + ' ký tự' : 'chưa cần (hist < ' + SUMMARIZE_AT + ')'}<br>
          <b>Tầng 3 · Facts:</b> ${facts.length} fact đã nhớ về bạn<br>
          <b>Tầng 4 · Live data:</b> bơm KPI hiện tại MỖI câu hỏi
        </div>

        ${this._summary ? `<h4>📜 Tóm tắt session này</h4><div style="background:#FEF3C7;padding:8px 10px;border-radius:6px;font-size:11.5px;line-height:1.5;color:#92400E">${this._summary}</div>` : ''}

        <h4>🧬 Facts về bạn (nhớ qua nhiều session)</h4>
        ${facts.length ? facts.map((f, i) => `<div class="fact-item">📌 ${f.text}<span class="x" onclick="window.AiChat.delFact(${i})" title="Xoá fact">✕</span></div>`).join('') : '<div class="empty">Chưa có fact nào. AI sẽ tự học khi bạn trò chuyện.</div>'}

        <h4>⚙ Hành động</h4>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="window.AiChat.addFactManual()">+ Tự thêm fact</button>
          <button class="btn btn-ghost btn-sm" style="color:#DC2626" onclick="window.AiChat.clearFacts()">🗑 Xoá toàn bộ fact</button>
          <button class="btn btn-ghost btn-sm" style="color:#DC2626" onclick="window.AiChat.clearCurrent()">🗑 Xoá cuộc này</button>
        </div>
      `;
    },

    renderMemInfo() {
      const el = document.getElementById('memInfo');
      if (!el) return;
      const facts = this.getFacts().length;
      const convs = this.listConvs().length;
      el.innerHTML = `Nhớ ${this.hist.length}msg · ${facts} fact · ${convs} cuộc`;
    },

    renderConvList() {
      const host = document.getElementById('aicConvList');
      if (!host) return;
      const list = this.listConvs();
      if (!list.length) {
        host.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px;font-size:11.5px">Chưa có cuộc nào</div>';
        return;
      }
      host.innerHTML = list.map(c => {
        const d = new Date(c.updatedAt);
        const ts = `${d.getDate()}/${d.getMonth()+1} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        return `<div class="aic-conv ${c.id===this.activeConvId?'active':''}" onclick="window.AiChat.switchConv('${c.id}')">
          <div class="t">${c.title || '(chưa tên)'}<div style="font-size:10px;color:var(--muted);font-weight:400">${ts}</div></div>
          <span class="x" onclick="event.stopPropagation();window.AiChat.delConv('${c.id}')">✕</span>
        </div>`;
      }).join('');
    },

    switchConv(id) {
      this.saveConv();
      this.loadConv(id);
      const conv = window.STORE.get(this.convKey(id), null);
      this._summary = conv?.summary || '';
      this.render();
      this.renderConvList();
      this.renderMemInfo();
      this.toggleDrawer();
    },

    delConv(id) {
      if (!confirm('Xoá cuộc trò chuyện này?')) return;
      const list = this.listConvs().filter(c => c.id !== id);
      this.saveConvList(list);
      localStorage.removeItem('vty_' + this.convKey(id));
      if (id === this.activeConvId) this.newConversation();
      this.renderConvList();
      this.renderMemInfo();
    },

    clearCurrent() {
      if (!confirm('Xoá hết tin nhắn trong cuộc trò chuyện hiện tại?')) return;
      this.hist = []; this._summary = '';
      this.saveConv();
      this.render(); this.renderMemView(); this.renderMemInfo();
    },

    clearFacts() {
      if (!confirm('Xoá toàn bộ facts AI đã học về bạn? AI sẽ "quên" bạn là ai.')) return;
      this.saveFacts([]);
      this.renderMemView(); this.renderMemInfo();
    },

    delFact(idx) {
      const facts = this.getFacts();
      facts.splice(idx, 1);
      this.saveFacts(facts);
      this.renderMemView(); this.renderMemInfo();
    },

    addFactManual() {
      const text = prompt('Thêm fact AI cần nhớ về bạn (vd "Tôi là chủ DN Tuấn Tú Farm, tập trung B2B nhà hàng"):');
      if (!text) return;
      const facts = this.getFacts();
      facts.push({ text, ts: Date.now(), manual: true });
      this.saveFacts(facts);
      this.renderMemView(); this.renderMemInfo();
      window.toast && window.toast('✓ Đã thêm fact', 'success');
    },

    render() {
      const body = document.getElementById('aicBody');
      if (!body) return;
      if (!this.hist.length) {
        const facts = this.getFacts().length;
        body.innerHTML = `<div class="aic-empty">
          <div class="ie">🤖</div>
          <b style="color:#1B5E20;font-size:14px">Chào ${window.CURRENT_USER?.name || 'bạn'}!</b>
          <br>Tôi là <b>TUTÚ</b> — trợ lý AI có <b style="color:#16A34A">4 tầng bộ nhớ</b>.
          <br><br>${facts ? `🧠 Tôi đã biết <b>${facts} fact</b> về bạn từ các cuộc trước.` : '🆕 Cuộc đầu — tôi sẽ học dần về bạn.'}
          <br><br>Hỏi gì cũng được — tôi nhớ mọi thứ trong session này, tham chiếu được dữ liệu thật.
        </div>`;
        return;
      }
      body.innerHTML = this.hist.map(m => {
        const d = new Date(m.ts || Date.now());
        const ts = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        return `<div class="aic-msg ${m.role}">${this.fmtMsg(m.content)}<div class="ts">${ts}</div></div>`;
      }).join('');
    },

    fmtMsg(s) {
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.05);padding:1px 5px;border-radius:3px;font-size:12px">$1</code>')
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
        reports: ['Lãi ròng tháng vs tháng trước?', 'Xuất báo cáo PDF được không?', 'Dự báo 3 tháng tới?'],
        inventory: ['SP nào hết hàng?', 'Tồn kho tổng giá trị bao nhiêu?', 'Cách kiểm kê?'],
        default: ['App có những tính năng gì?', 'Cách phân quyền NV?', 'Hôm nay có gì quan trọng?'],
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

      const body = document.getElementById('aicBody');
      const t = document.createElement('div');
      t.className = 'aic-typing'; t.id = 'aicTyping';
      t.innerHTML = `🤖 TUTÚ đang nhớ + suy nghĩ... <span style="color:var(--muted)">(dùng ${Math.min(this.hist.length, WORKING_TURNS)} tin nhắn gần nhất + ${this.getFacts().length} fact + live data)</span>`;
      body.appendChild(t); this.scrollBottom();

      document.getElementById('aicSendBtn').disabled = true;
      const reply = await this.ask(text);
      document.getElementById('aicSendBtn').disabled = false;

      this.hist.push({ role:'bot', content: reply, ts: Date.now() });
      this.saveConv();
      document.getElementById('aicTyping')?.remove();
      this.render(); this.scrollBottom();
      this.renderMemInfo();
      this.renderConvList();
      window.audit && window.audit.log('aichat.message', text.slice(0, 80));

      /* Async: summarize nếu quá dài + extract facts */
      setTimeout(() => this.summarizeOldTurns(), 100);
      setTimeout(() => this.maybeExtractFacts(), 500);
    },

    scrollBottom() {
      const b = document.getElementById('aicBody');
      if (b) b.scrollTop = b.scrollHeight;
    },

    exportConv() {
      const out = {
        conversationId: this.activeConvId,
        exportedAt: new Date().toISOString(),
        messages: this.hist,
        summary: this._summary,
        userFacts: this.getFacts(),
      };
      const blob = new Blob([JSON.stringify(out, null, 2)], { type:'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tutu-chat-${(new Date()).toISOString().slice(0,10)}.json`;
      a.click();
      window.toast && window.toast('✓ Đã tải về JSON', 'success');
    },
  };

  /* Disable old AICHAT in system-core if it exists */
  if (window.AiChat && window.AiChat.inject !== AICHAT.inject) {
    /* Remove old bubble if any */
    document.getElementById('aiChatBubble')?.remove();
  }
  window.AiChat = AICHAT;

  /* Inject after app shell ready */
  function tryInject() {
    if (document.querySelector('.app') && window.STORE && window.CURRENT_USER) {
      /* Remove cũ trước khi inject mới */
      document.getElementById('aiChatBubble')?.remove();
      AICHAT.inject();
    } else {
      setTimeout(tryInject, 400);
    }
  }
  if (document.readyState === 'complete') tryInject();
  else window.addEventListener('load', tryInject);

})();
