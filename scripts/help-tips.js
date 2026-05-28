/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Help-Tip System
   ─────────────────────────────────────────────────────────
   Mục đích: gắn icon ❓ hoặc "?" mini cạnh bất kỳ feature nào.
   Hover/click sẽ hiện popover giải thích "tính năng này làm gì".

   CÁCH DÙNG (3 cách):

   1. HTML attribute (tự động):
      <button data-help="Xuất file Excel chứa toàn bộ KH...">⬇ Xuất Excel</button>
      → Help-tip sẽ tự gắn icon ❓ phía sau

   2. Inline HTML helper:
      ${window.helpTip('Giải thích...')}
      → Trả về chuỗi HTML <span class="help-tip">❓<tooltip/></span>

   3. JS programmatic:
      window.attachHelp(element, 'Giải thích...')

   ========================================================= */
(function () {
  /* ============ CSS injection (1 lần) ============ */
  if (!document.getElementById('helpTipStyles')) {
    const css = document.createElement('style');
    css.id = 'helpTipStyles';
    css.textContent = `
      .help-tip{
        display:inline-flex;align-items:center;justify-content:center;
        width:16px;height:16px;border-radius:50%;
        background:#E5E7EB;color:#6B7280;
        font-size:10px;font-weight:700;cursor:help;
        margin-left:5px;vertical-align:middle;
        font-family:'Segoe UI',Arial,sans-serif;
        transition:all 0.15s;position:relative;
        user-select:none;line-height:1;
      }
      .help-tip:hover{background:var(--navy);color:#fff;transform:scale(1.15)}
      .help-tip .help-pop{
        position:absolute;bottom:calc(100% + 8px);left:50%;
        transform:translateX(-50%);
        background:#1F2937;color:#fff;
        padding:10px 13px;border-radius:8px;
        font-size:12px;font-weight:500;line-height:1.5;
        white-space:normal;width:max-content;max-width:280px;
        text-align:left;
        opacity:0;visibility:hidden;
        transition:all 0.18s;pointer-events:none;
        z-index:99999;
        box-shadow:0 8px 24px rgba(0,0,0,0.18);
      }
      .help-tip .help-pop::after{
        content:'';position:absolute;top:100%;left:50%;
        transform:translateX(-50%);
        border:6px solid transparent;border-top-color:#1F2937;
      }
      .help-tip:hover .help-pop,
      .help-tip.is-open .help-pop{opacity:1;visibility:visible;transform:translateX(-50%) translateY(-2px)}

      /* Variant lớn: cho headers / section title */
      .help-tip.tip-lg{width:20px;height:20px;font-size:12px;margin-left:8px}

      /* Help banner — block giải thích lớn dùng đầu module */
      .help-banner{
        background:linear-gradient(135deg,#EFF6FF 0%,#F0FDF4 100%);
        border:1px solid #BFDBFE;border-radius:10px;
        padding:12px 16px;margin-bottom:14px;
        display:flex;align-items:flex-start;gap:12px;
        font-size:13px;line-height:1.55;color:#1E40AF;
      }
      .help-banner .hb-ic{font-size:20px;flex-shrink:0;margin-top:1px}
      .help-banner .hb-body{flex:1;min-width:0}
      .help-banner .hb-body b{color:#1E3A8A}
      .help-banner .hb-close{
        background:none;border:none;cursor:pointer;
        color:#94A3B8;font-size:18px;line-height:1;
        padding:2px 6px;border-radius:4px;flex-shrink:0;
      }
      .help-banner .hb-close:hover{background:rgba(0,0,0,0.05);color:#475569}

      /* Tooltip hiển thị bên dưới (cho nút ở topbar) */
      .help-tip.tip-bot .help-pop{bottom:auto;top:calc(100% + 8px)}
      .help-tip.tip-bot .help-pop::after{top:auto;bottom:100%;border-top-color:transparent;border-bottom-color:#1F2937}

      /* Auto-attach: ẩn tooltip native */
      [data-help]{position:relative}
    `;
    document.head.appendChild(css);
  }

  /* ============ Tạo HTML cho help-tip inline ============ */
  window.helpTip = function (text, opts) {
    opts = opts || {};
    const cls = ['help-tip'];
    if (opts.size === 'lg') cls.push('tip-lg');
    if (opts.position === 'bottom') cls.push('tip-bot');
    const safe = String(text || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return `<span class="${cls.join(' ')}" data-tip-text="${safe}" onclick="event.stopPropagation();this.classList.toggle('is-open')">?<span class="help-pop">${text}</span></span>`;
  };

  /* ============ Help banner — block lớn đầu page ============ */
  window.helpBanner = function (title, body, opts) {
    opts = opts || {};
    const id = opts.id || ('hb-' + Math.random().toString(36).slice(2, 8));
    /* Nếu user đã đóng → không render */
    const dismissed = window.STORE && window.STORE.get('hb_dismissed', []);
    if (dismissed && dismissed.includes(id)) return '';
    return `<div class="help-banner" id="${id}">
      <div class="hb-ic">${opts.icon || '💡'}</div>
      <div class="hb-body"><b>${title}</b> — ${body}</div>
      <button class="hb-close" title="Đã hiểu, ẩn đi" onclick="window.dismissHelpBanner('${id}')">✕</button>
    </div>`;
  };

  window.dismissHelpBanner = function (id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
    if (window.STORE) {
      const list = window.STORE.get('hb_dismissed', []) || [];
      if (!list.includes(id)) {
        list.push(id);
        window.STORE.set('hb_dismissed', list);
      }
    }
  };

  /* ============ Programmatic attach ============ */
  window.attachHelp = function (el, text) {
    if (!el) return;
    el.insertAdjacentHTML('beforeend', window.helpTip(text));
  };

  /* ============ Auto-attach: scan DOM cho data-help ============ */
  function autoAttach() {
    document.querySelectorAll('[data-help]:not([data-help-attached])').forEach(el => {
      const txt = el.getAttribute('data-help');
      el.setAttribute('data-help-attached', '1');
      el.insertAdjacentHTML('beforeend', ' ' + window.helpTip(txt));
    });
  }

  /* Auto-scan khi DOM ready + sau khi render */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoAttach);
  } else {
    autoAttach();
  }
  /* Re-scan định kỳ cho các phần render động */
  window.helpTipsRescan = autoAttach;
  setInterval(autoAttach, 1500);

  /* Click outside đóng popover đang mở */
  document.addEventListener('click', e => {
    if (!e.target.closest('.help-tip')) {
      document.querySelectorAll('.help-tip.is-open').forEach(x => x.classList.remove('is-open'));
    }
  });
})();
