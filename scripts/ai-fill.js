/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — AI điền bằng ảnh (Vision → JSON)
   ─────────────────────────────────────────────────────────
   MULTI-PROVIDER + PER-TASK ROUTING:
   STORE.int_ai-engine = {
     providers: [
       { id:'gemini-flash', provider:'gemini', model:'gemini-2.0-flash', apiKey:'...', enabled:true },
       { id:'claude-haiku', provider:'claude', model:'claude-haiku-4-5', apiKey:'...', enabled:true },
       { id:'gpt4o-mini',  provider:'openai', model:'gpt-4o-mini',      apiKey:'...', enabled:false },
     ],
     routing: {
       customer: 'gemini-flash',   // KH danh thiếp — free đủ dùng
       order:    'gemini-flash',
       product:  'claude-haiku',   // bảng giá — cần chuẩn
       adspend:  'claude-haiku',   // tài chính
       invoice:  'claude-haiku',
     },
     fallback: 'gemini-flash',     // dùng nếu task không map hoặc provider được map đã off
     // Legacy: apiKey + provider (1 cái cũ) vẫn tương thích ngược.
   }
   ========================================================= */
(function () {
  function cfg() { return window.STORE.get('int_ai-engine', {}) || {}; }

  /* === TASK PURPOSES — UI router === */
  window.AI_TASKS = [
    { id: 'customer', icon: '👥', label: 'Thêm khách hàng từ ảnh', desc: 'Danh thiếp, list KH' },
    { id: 'order',    icon: '📦', label: 'Tạo đơn từ ảnh',         desc: 'Tin nhắn đặt hàng, phiếu viết tay' },
    { id: 'product',  icon: '🥬', label: 'Nhập SP / bảng giá',     desc: 'Bảng giá có nhiều cột — cần chuẩn' },
    { id: 'adspend',  icon: '📣', label: 'Nhập chi phí Ads',       desc: 'Screenshot Ads Manager — số tài chính' },
    { id: 'invoice',  icon: '🧾', label: 'Đọc hóa đơn VAT',        desc: 'Hóa đơn nhiều cột, số tiền chuẩn' },
  ];

  /* === MODEL LIBRARY — danh sách model phổ biến để chọn === */
  window.AI_MODELS = [
    /* Gemini */
    { provider:'gemini', model:'gemini-2.0-flash',  label:'Gemini 2.0 Flash',  badge:'FREE 1.5k/ngày', tier:'free' },
    { provider:'gemini', model:'gemini-2.5-flash',  label:'Gemini 2.5 Flash',  badge:'$0.30/M',         tier:'cheap' },
    { provider:'gemini', model:'gemini-2.5-pro',    label:'Gemini 2.5 Pro',    badge:'$1.25/M',         tier:'premium' },
    /* Claude */
    { provider:'claude', model:'claude-haiku-4-5',  label:'Claude Haiku 4.5',  badge:'$1/M',            tier:'cheap' },
    { provider:'claude', model:'claude-sonnet-4-5', label:'Claude Sonnet 4.5', badge:'$3/M',            tier:'premium' },
    /* OpenAI */
    { provider:'openai', model:'gpt-4o-mini',       label:'GPT-4o-mini',       badge:'$0.15/M',         tier:'cheap' },
    { provider:'openai', model:'gpt-4o',            label:'GPT-4o',            badge:'$2.5/M',          tier:'premium' },
  ];

  /* === Helper: lấy provider để dùng cho 1 task === */
  function pickProvider(taskId) {
    const c = cfg();
    /* Migration: nếu chỉ có legacy { apiKey, provider } → coi như 1 provider duy nhất */
    let providers = c.providers || [];
    if (!providers.length && c.apiKey) {
      providers = [{ id: 'legacy', provider: c.provider || 'gemini', model: null, apiKey: c.apiKey, enabled: true }];
    }
    const routing = c.routing || {};
    const fallback = c.fallback;
    const enabled = providers.filter(p => p.enabled !== false && p.apiKey);
    if (!enabled.length) return null;

    /* 1. Theo routing per task */
    if (taskId && routing[taskId]) {
      const p = enabled.find(x => x.id === routing[taskId]);
      if (p) return p;
    }
    /* 2. Theo fallback */
    if (fallback) {
      const p = enabled.find(x => x.id === fallback);
      if (p) return p;
    }
    /* 3. Provider đầu tiên enabled */
    return enabled[0];
  }

  /* === Parsers === */
  function parseJSON(txt) {
    if (!txt) throw new Error('AI không trả về dữ liệu');
    try { return JSON.parse(txt); } catch (e) {}
    const m = txt.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) { try { return JSON.parse(m[1]); } catch (e) {} }
    const m2 = txt.match(/[\[{][\s\S]*[\]}]/);
    if (m2) { try { return JSON.parse(m2[0]); } catch (e) {} }
    throw new Error('AI trả về không đúng định dạng JSON');
  }

  function fileToData(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => {
        const s = fr.result;
        const m = String(s).match(/^data:([^;]+);base64,(.*)$/);
        if (!m) return rej(new Error('Ảnh không hợp lệ'));
        res({ mime: m[1], base64: m[2], dataURL: s });
      };
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }

  /* === Vision API callers — nhận model param + examples (few-shot nhớ nét chữ) ===
     examples: [{ b64, mime, resultText }] — ảnh KH từng viết + kết quả đúng. */
  async function geminiVision(key, model, b64, mime, prompt, examples) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${encodeURIComponent(key)}`;
    const parts = [];
    (examples || []).forEach((ex, i) => {
      if (!ex || !ex.b64) return;
      parts.push({ text: `VÍ DỤ ${i + 1} — ảnh KH này TỪNG viết tay:` });
      parts.push({ inline_data: { mime_type: ex.mime || 'image/jpeg', data: ex.b64 } });
      parts.push({ text: `KẾT QUẢ ĐÚNG (nhân viên đã xác nhận): ${ex.resultText || ''}` });
    });
    if ((examples || []).some(e => e && e.b64)) parts.push({ text: '↑ Học cách viết / nét chữ / từ viết tắt của khách qua các ví dụ trên. BÂY GIỜ đọc ảnh MỚI dưới đây của CÙNG khách:' });
    parts.push({ text: prompt });
    parts.push({ inline_data: { mime_type: mime, data: b64 } });
    const body = {
      contents: [{ parts }],
      generationConfig: { response_mime_type: 'application/json', temperature: 0, maxOutputTokens: 8192 },
    };
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error && j.error.message ? j.error.message : 'Gemini HTTP ' + r.status);
    const txt = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts || []).map(p => p.text).join('');
    return parseJSON(txt);
  }

  async function openaiVision(key, model, b64, mime, prompt, examples) {
    const content = [];
    (examples || []).forEach((ex, i) => {
      if (!ex || !ex.b64) return;
      content.push({ type: 'text', text: `VÍ DỤ ${i + 1} — ảnh KH từng viết:` });
      content.push({ type: 'image_url', image_url: { url: `data:${ex.mime || 'image/jpeg'};base64,${ex.b64}` } });
      content.push({ type: 'text', text: `KẾT QUẢ ĐÚNG: ${ex.resultText || ''}` });
    });
    content.push({ type: 'text', text: prompt });
    content.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } });
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini', temperature: 0, response_format: { type: 'json_object' },
        messages: [{ role: 'user', content }],
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error && j.error.message ? j.error.message : 'OpenAI HTTP ' + r.status);
    return parseJSON(j.choices && j.choices[0] && j.choices[0].message.content);
  }

  async function claudeVision(key, model, b64, mime, prompt, examples) {
    const content = [];
    (examples || []).forEach((ex, i) => {
      if (!ex || !ex.b64) return;
      content.push({ type: 'text', text: `VÍ DỤ ${i + 1} — ảnh KH từng viết:` });
      content.push({ type: 'image', source: { type: 'base64', media_type: ex.mime || 'image/jpeg', data: ex.b64 } });
      content.push({ type: 'text', text: `KẾT QUẢ ĐÚNG: ${ex.resultText || ''}` });
    });
    content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: b64 } });
    content.push({ type: 'text', text: prompt });
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: model || 'claude-haiku-4-5', max_tokens: 8192,
        messages: [{ role: 'user', content }],
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error && j.error.message ? j.error.message : 'Claude HTTP ' + r.status);
    return parseJSON(j.content && j.content[0] && j.content[0].text);
  }

  window.AI = {
    /* Có ít nhất 1 provider enabled? */
    ready() {
      const c = cfg();
      const providers = c.providers || [];
      if (providers.some(p => p.enabled !== false && p.apiKey)) return true;
      return !!c.apiKey;  /* legacy */
    },
    /* Backward compat */
    provider() {
      const c = cfg();
      const p = (c.providers || []).find(x => x.enabled !== false);
      return p ? p.provider : (c.provider || 'gemini');
    },

    /* Pick provider theo taskId — public */
    pickFor(taskId) { return pickProvider(taskId); },

    /* taskId: optional, để chọn provider phù hợp · examples: few-shot ảnh nhớ nét chữ */
    async extract(b64, mime, prompt, taskId, examples) {
      const p = pickProvider(taskId);
      if (!p) throw new Error('NO_KEY');
      if (p.provider === 'openai') return openaiVision(p.apiKey, p.model, b64, mime, prompt, examples);
      if (p.provider === 'claude') return claudeVision(p.apiKey, p.model, b64, mime, prompt, examples);
      return geminiVision(p.apiKey, p.model, b64, mime, prompt, examples);
    },

    /* opts: { title, guideHtml, prompt, onResult(data), task?:'customer'|'order'|'product'|'adspend'|'invoice' }
       LƯU Ý: dùng OVERLAY RIÊNG (id #aiFillOverlay) — KHÔNG gọi window.openModal.
       Vì openModal xoá modal đang mở → nếu mở từ trong form "Tạo đơn" (đang là modal)
       thì form đơn bị huỷ, AI đọc xong không có chỗ ghi kết quả → "không hoạt động trong form".
       Overlay xếp CHỒNG lên modal đơn (z-index cao), đọc xong onResult ghi thẳng vào form đơn. */
    openFillModal(opts) {
      const has = this.ready();
      const taskId = opts.task;
      const picked = pickProvider(taskId);
      const pickedLabel = picked ? `${picked.provider.toUpperCase()} · ${picked.model || 'default'}` : '—';
      /* Xoá overlay AI cũ (nếu còn) — KHÔNG đụng tới #modal-bg của form bên dưới */
      document.getElementById('aiFillOverlay')?.remove();
      const ov = document.createElement('div');
      ov.id = 'aiFillOverlay';
      ov.className = 'modal-bg open';
      ov.style.zIndex = '100060'; /* trên modal đơn (200) + dropdown KH (100001) */
      ov.innerHTML = `
        <div class="modal" style="width:min(520px,94vw);max-width:520px">
          <div class="modal-head">
            <h3>${opts.title || '📷 Điền bằng ảnh (AI)'}</h3>
            <button class="modal-close" onclick="window.AI._cancel()" title="Đóng (Esc)">✕</button>
          </div>
          <div class="modal-body">
            ${opts.guideHtml ? `<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px;line-height:1.5">${opts.guideHtml}</div>` : ''}
            ${has ? `<div style="font-size:11.5px;color:var(--ok);margin-bottom:8px;padding:6px 10px;background:#F0FDF4;border-radius:6px">🤖 Đang dùng: <b>${pickedLabel}</b>${taskId ? ` cho task <code>${taskId}</code>` : ''} <span style="color:var(--muted);font-weight:400">· đổi ở Cài đặt → AI Form Filler</span></div>`
                  : `<div style="background:var(--warn-bg);color:var(--warn);padding:10px 12px;border-radius:8px;font-size:12.5px;margin-bottom:10px">⚠️ Chưa cấu hình AI. Vào <b>Cài đặt → Tích hợp → AI Form Filler</b> dán API key (Gemini FREE 1.500 lượt/ngày).</div>`}
            <div id="aiDrop" style="border:2px dashed var(--line);border-radius:10px;padding:22px 14px;text-align:center;cursor:pointer;background:#FAFBFA">
              <input type="file" id="aiFile" accept="image/*" capture="environment" style="display:none">
              <div id="aiDropText" style="color:var(--muted);font-size:13px;line-height:1.6">📷 Bấm chọn ảnh · kéo-thả · hoặc dán (Ctrl+V)<br><span style="font-size:11px">Chụp bảng giá / tin nhắn khách / danh thiếp / đơn viết tay</span></div>
              <img id="aiPreview" style="display:none;max-width:100%;max-height:240px;border-radius:8px;margin:0 auto">
            </div>
            <div id="aiStatus" style="font-size:12.5px;margin-top:10px;min-height:18px"></div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" onclick="window.AI._cancel()">Hủy</button>
            <button class="btn btn-primary" id="aiRunBtn" ${has ? '' : 'disabled'} onclick="window.AI._run()">🤖 Xử lý bằng AI</button>
          </div>
        </div>`;
      /* Click nền (ngoài modal) → đóng */
      ov.addEventListener('click', (e) => { if (e.target === ov) window.AI._cancel(); });
      document.body.appendChild(ov);
      /* Esc đóng overlay AI (ưu tiên overlay trước modal đơn) */
      this._escHandler = (e) => { if (e.key === 'Escape' && document.getElementById('aiFillOverlay')) { e.stopPropagation(); window.AI._cancel(); } };
      document.addEventListener('keydown', this._escHandler, true);
      this._opts = opts; this._img = null;
      const drop = document.getElementById('aiDrop'), file = document.getElementById('aiFile');
      drop.onclick = () => file.click();
      file.onchange = e => { if (e.target.files[0]) this._setImg(e.target.files[0]); };
      drop.ondragover = e => { e.preventDefault(); drop.style.borderColor = 'var(--red)'; };
      drop.ondragleave = () => { drop.style.borderColor = 'var(--line)'; };
      drop.ondrop = e => { e.preventDefault(); drop.style.borderColor = 'var(--line)'; if (e.dataTransfer.files[0]) this._setImg(e.dataTransfer.files[0]); };
      this._paste = e => { const items = (e.clipboardData && e.clipboardData.items) || []; for (const it of items) { if (it.type.indexOf('image/') === 0) { this._setImg(it.getAsFile()); e.preventDefault(); break; } } };
      document.addEventListener('paste', this._paste);
    },

    async _setImg(file) {
      try {
        this._img = await fileToData(file);
        const img = document.getElementById('aiPreview');
        if (img) { img.src = this._img.dataURL; img.style.display = 'block'; }
        const t = document.getElementById('aiDropText'); if (t) t.style.display = 'none';
        const st = document.getElementById('aiStatus'); if (st) st.innerHTML = '✓ Đã chọn ảnh — bấm "Xử lý bằng AI"';
      } catch (e) { window.toast(e.message, 'warn'); }
    },

    _closeOverlay() {
      document.removeEventListener('paste', this._paste);
      if (this._escHandler) { document.removeEventListener('keydown', this._escHandler, true); this._escHandler = null; }
      document.getElementById('aiFillOverlay')?.remove();
    },

    _cancel() { this._closeOverlay(); },

    async _run() {
      if (!this._img) { window.toast('Chọn/dán ảnh trước', 'warn'); return; }
      const st = document.getElementById('aiStatus'), btn = document.getElementById('aiRunBtn');
      const exN = (this._opts.examples || []).filter(e => e && e.b64).length;
      st.innerHTML = '⏳ AI đang đọc ảnh & trích xuất dữ liệu...' + (exN ? ` <span style="color:var(--ok)">(dùng ${exN} mẫu nét chữ KH)</span>` : ''); btn.disabled = true;
      try {
        const data = await this.extract(this._img.base64, this._img.mime, this._opts.prompt, this._opts.task, this._opts.examples);
        const meta = { dataURL: this._img.dataURL, b64: this._img.base64, mime: this._img.mime };
        this._closeOverlay();
        this._opts.onResult(data, meta);
      } catch (e) {
        btn.disabled = false;
        const msg = e.message === 'NO_KEY' ? 'Chưa có API key (Cài đặt → Tích hợp)' : e.message;
        st.innerHTML = '<span style="color:var(--danger)">❌ ' + msg + '</span>';
      }
    },
  };

  /* Tiện ích match tên (bỏ dấu, lowercase) */
  window.AI.norm = function (s) {
    return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  };
})();
