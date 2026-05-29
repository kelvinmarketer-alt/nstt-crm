/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Usage Tracker
   ─────────────────────────────────────────────────────────
   Theo dõi tài nguyên consumed để tránh vượt Supabase Free tier:
   - Poll count + egress estimate
   - AI tokens per model + estimated cost
   - Storage size estimate

   Cách dùng:
   - window.USAGE.trackPoll(bytesDownloaded)
   - window.USAGE.trackAI(model, tokensIn, tokensOut)
   - window.USAGE.getReport()  // { polls, egressMB, aiCalls, tokens, ... }
   - window.USAGE.resetMonth() // reset count khi sang tháng mới

   Data lưu trong STORE key 'usage_stats' → sync cloud qua kv_store
   ========================================================= */
(function () {
  const KEY = 'usage_stats';

  /* Giá tham khảo USD per token (2026-05) — input + output khác nhau */
  const PRICING = {
    /* Gemini Flash 2.0/2.5 — FREE tier 1500 calls/day, sau đó: */
    'gemini-flash':    { in: 0.0000001,  out: 0.0000004 },
    'gemini-flash-1.5':{ in: 0.0000001,  out: 0.0000004 },
    'gemini-flash-2.0':{ in: 0.0000001,  out: 0.0000004 },
    /* Claude */
    'claude-haiku':    { in: 0.0000008,  out: 0.0000040 },
    'claude-haiku-4-5':{ in: 0.0000008,  out: 0.0000040 },
    'claude-sonnet':   { in: 0.0000030,  out: 0.0000150 },
    /* OpenAI */
    'openai-gpt-4o-mini': { in: 0.00000015, out: 0.0000006 },
    'openai-gpt-4o':      { in: 0.0000025,  out: 0.000010 },
    'openai-gpt-4-turbo': { in: 0.000010,   out: 0.000030 },
    'openai-gpt-3.5-turbo': { in: 0.0000005, out: 0.0000015 },
  };
  function getPrice(model) {
    if (PRICING[model]) return PRICING[model];
    /* Fuzzy match — vd "openai-gpt-4o-mini" → prefix match */
    const key = Object.keys(PRICING).find(k => model.startsWith(k) || model.includes(k.split('-')[1] || ''));
    return key ? PRICING[key] : { in: 0, out: 0 };
  }
  function computeCostByModel(byModel) {
    const out = {};
    let total = 0;
    Object.entries(byModel).forEach(([m, d]) => {
      const p = getPrice(m);
      const cost = (d.in || 0) * p.in + (d.out || 0) * p.out;
      out[m] = cost.toFixed(4);
      total += cost;
    });
    out.TOTAL = total.toFixed(4);
    return out;
  }
  /* Expose computePrice cho settings.html dùng */
  window.USAGE_PRICING = { getPrice, computeCostByModel };
  /* Auto-reset monthly */
  function _ensureCurrentMonth() {
    const s = window.STORE.get(KEY, {}) || {};
    const thisMonth = new Date().toISOString().slice(0, 7); /* "2026-05" */
    if (s.month !== thisMonth) {
      /* Lưu tháng cũ vào history */
      const history = s.history || [];
      if (s.month) history.unshift({
        month: s.month, polls: s.polls || 0,
        egressMB: s.egressMB || 0, aiCalls: s.aiCalls || 0,
        tokensIn: s.tokensIn || 0, tokensOut: s.tokensOut || 0,
        byModel: s.byModel || {},
      });
      if (history.length > 12) history.length = 12;
      const fresh = {
        month: thisMonth, polls: 0, egressMB: 0,
        aiCalls: 0, tokensIn: 0, tokensOut: 0,
        byModel: {}, history,
      };
      window.STORE.set(KEY, fresh);
      return fresh;
    }
    return s;
  }

  window.USAGE = {
    trackPoll(bytesDownloaded) {
      const s = _ensureCurrentMonth();
      s.polls = (s.polls || 0) + 1;
      s.egressMB = (s.egressMB || 0) + (bytesDownloaded / 1024 / 1024);
      /* Throttle save: chỉ save mỗi 30s tránh write storm */
      const now = Date.now();
      if (!this._lastSave || now - this._lastSave > 30000) {
        window.STORE.set(KEY, s);
        this._lastSave = now;
      } else {
        /* Update cache only */
        window.STORE.get(KEY, {});  /* trigger cache sync */
      }
    },
    trackAI(model, tokensIn, tokensOut) {
      const s = _ensureCurrentMonth();
      s.aiCalls = (s.aiCalls || 0) + 1;
      s.tokensIn = (s.tokensIn || 0) + (tokensIn || 0);
      s.tokensOut = (s.tokensOut || 0) + (tokensOut || 0);
      s.byModel = s.byModel || {};
      const m = s.byModel[model] = s.byModel[model] || { calls: 0, in: 0, out: 0 };
      m.calls++;
      m.in += (tokensIn || 0);
      m.out += (tokensOut || 0);
      window.STORE.set(KEY, s);
    },
    getReport() {
      const s = _ensureCurrentMonth();
      const dayOfMonth = new Date().getDate();
      const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate();
      const polls = s.polls || 0;
      const egressMB = s.egressMB || 0;
      /* Forecast cuối tháng */
      const forecast = {
        polls: Math.round(polls / dayOfMonth * daysInMonth),
        egressMB: +(egressMB / dayOfMonth * daysInMonth).toFixed(1),
      };
      return {
        month: s.month,
        polls, egressMB: +egressMB.toFixed(1),
        aiCalls: s.aiCalls || 0,
        tokensIn: s.tokensIn || 0,
        tokensOut: s.tokensOut || 0,
        byModel: s.byModel || {},
        history: s.history || [],
        forecast,
        /* Cost estimate USD theo giá tham khảo cho mọi model */
        costUSD: computeCostByModel(s.byModel || {}),
        /* Free tier limits */
        limits: {
          supabase_egress_GB: 5,
          supabase_db_MB: 500,
          gemini_flash_rpd: 1500,  /* requests per day free */
        },
      };
    },
    resetMonth() {
      _ensureCurrentMonth();
      const s = window.STORE.get(KEY, {});
      Object.assign(s, { polls: 0, egressMB: 0, aiCalls: 0, tokensIn: 0, tokensOut: 0, byModel: {} });
      window.STORE.set(KEY, s);
    },
  };

  /* Auto-track poll: monkey-patch SB_DATA.getAll để đếm */
  if (window.SB_DATA && !window.SB_DATA._usageWrapped) {
    const _origGetAll = window.SB_DATA.getAll;
    window.SB_DATA.getAll = async function (table) {
      const data = await _origGetAll.call(this, table);
      try {
        /* Ước tính bytes: mỗi record ~500 bytes (trung bình) */
        const bytes = (Array.isArray(data) ? data.length : 0) * 500;
        window.USAGE.trackPoll(bytes);
      } catch (e) {}
      return data;
    };
    window.SB_DATA._usageWrapped = true;
  }

  console.log('[USAGE] Tracker ready');
})();
