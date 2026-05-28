/* =========================================================
   CustSearchBox — Component autocomplete dùng chung
   ─────────────────────────────────────────────────────────
   Vấn đề: select dropdown 28+ KH rất khó tìm → cần input search
   + suggest list match theo tên/SĐT/mã/địa chỉ.

   Cách dùng (1 dòng):
     <div id="custBox"></div>
     CustSearchBox.mount('custBox', {
       onSelect: (cust) => { ... },
       initialId: 'KH001',  // optional
       placeholder: 'Tìm KH...',
     });

   API:
   - CustSearchBox.mount(elId, opts) → tạo widget
   - CustSearchBox.getValue(elId) → trả về custId đã chọn
   - CustSearchBox.setValue(elId, custId) → set programmatically
   ========================================================= */
(function () {
  /* ============ Inject CSS 1 lần ============ */
  if (!document.getElementById('custSearchBoxCSS')) {
    const s = document.createElement('style');
    s.id = 'custSearchBoxCSS';
    s.textContent = `
      .csb-wrap{position:relative}
      .csb-input{
        width:100%;border:1px solid var(--line);border-radius:7px;
        padding:8px 12px 8px 32px;font-size:13px;outline:none;
        background-image:url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3e%3ccircle cx='11' cy='11' r='7'/%3e%3cpath d='m21 21-4.3-4.3'/%3e%3c/svg%3e");
        background-repeat:no-repeat;background-position:10px center;
      }
      .csb-input:focus{border-color:#16A34A;box-shadow:0 0 0 3px rgba(22,163,74,0.1)}
      .csb-input.has-value{background:#F0FDF4;font-weight:600;color:#15803D}
      .csb-clear{
        position:absolute;right:8px;top:50%;transform:translateY(-50%);
        background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:14px;
        width:24px;height:24px;border-radius:50%;display:none;
      }
      .csb-clear:hover{background:rgba(0,0,0,0.05);color:#DC2626}
      .csb-wrap.has-value .csb-clear{display:grid;place-items:center}

      .csb-dropdown{
        position:fixed;
        background:#fff;border:1px solid #E5E7EB;border-radius:8px;
        box-shadow:0 8px 24px rgba(0,0,0,0.18);
        max-height:320px;overflow-y:auto;
        z-index:100001;        /* > modal (.modal-bg thường 100) + drawer */
        display:none;
        min-width:300px;
      }
      .csb-dropdown.open{display:block}
      .csb-item{
        display:flex;align-items:center;gap:10px;padding:8px 12px;
        cursor:pointer;border-bottom:1px solid #F8FAFC;font-size:12.5px;
      }
      .csb-item:last-child{border-bottom:none}
      .csb-item:hover, .csb-item.kbd-hover{background:#F0FDF4}
      .csb-item .av{
        width:30px;height:30px;border-radius:6px;color:#fff;
        display:grid;place-items:center;font-weight:700;font-size:11px;flex-shrink:0
      }
      .csb-item .info{flex:1;min-width:0}
      .csb-item .n1{font-weight:600;color:#1F2937;line-height:1.25}
      .csb-item .n1 mark{background:#FEF3C7;color:#92400E;padding:0 2px;border-radius:2px}
      .csb-item .n2{font-size:11px;color:#6B7280;line-height:1.3;margin-top:1px}
      .csb-item .badge{font-size:10px;background:#E0F2FE;color:#0369A1;padding:2px 6px;border-radius:99px;font-weight:600;flex-shrink:0}
      .csb-item .badge.vip{background:#FEF3C7;color:#92400E}
      .csb-item .badge.new{background:#F3E8FF;color:#7C3AED}

      .csb-empty{padding:18px 16px;text-align:center;color:#9CA3AF;font-size:12px}
      .csb-empty button{
        margin-top:8px;background:#16A34A;color:#fff;border:none;
        padding:6px 12px;border-radius:6px;cursor:pointer;font-size:11.5px;font-weight:600;
      }
      .csb-hint{
        padding:6px 12px;background:#F8FAFC;font-size:10.5px;color:#9CA3AF;
        border-top:1px solid #E5E7EB;letter-spacing:0.2px;
      }
    `;
    document.head.appendChild(s);
  }

  /* ============ Helpers ============ */
  function norm(s) {
    return (s || '').toString().toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  }

  function highlight(text, query) {
    if (!query) return text;
    const nText = norm(text);
    const nQuery = norm(query);
    const idx = nText.indexOf(nQuery);
    if (idx < 0) return text;
    return text.slice(0, idx) + '<mark>' + text.slice(idx, idx + query.length) + '</mark>' + text.slice(idx + query.length);
  }

  function avatarColor(seed) {
    if (window.avatarColor) return window.avatarColor(seed);
    return '#16A34A';
  }
  function initials(name) {
    if (window.initials) return window.initials(name);
    return (name || '?').slice(0, 2).toUpperCase();
  }

  /* ============ State per widget ============ */
  const instances = {};

  function search(query, limit) {
    const customers = window.STORE.get('customers', window.CUSTOMERS || []) || [];
    if (!query || query.length === 0) {
      /* Empty query → top 10 most recent / VIP */
      return customers
        .slice()
        .sort((a, b) => {
          if (a.group === 'VIP' && b.group !== 'VIP') return -1;
          if (b.group === 'VIP' && a.group !== 'VIP') return 1;
          return (b.revenue || 0) - (a.revenue || 0);
        })
        .slice(0, limit || 8);
    }
    const q = norm(query);
    const matched = customers.filter(c => {
      const hay = norm(c.name + ' ' + c.code + ' ' + (c.phone||'') + ' ' + (c.address||'') + ' ' + (c.contact||''));
      return hay.includes(q);
    });
    /* Rank: tên match đầu > code match > others */
    matched.sort((a, b) => {
      const aName = norm(a.name);
      const bName = norm(b.name);
      const aStart = aName.startsWith(q) ? 0 : aName.includes(q) ? 1 : 2;
      const bStart = bName.startsWith(q) ? 0 : bName.includes(q) ? 1 : 2;
      if (aStart !== bStart) return aStart - bStart;
      return (b.revenue || 0) - (a.revenue || 0);
    });
    return matched.slice(0, limit || 12);
  }

  const CustSearchBox = {

    mount(elId, opts) {
      opts = opts || {};
      const host = typeof elId === 'string' ? document.getElementById(elId) : elId;
      if (!host) return;

      const wrap = document.createElement('div');
      wrap.className = 'csb-wrap';
      wrap.innerHTML = `
        <input type="text" class="csb-input" placeholder="${opts.placeholder || 'Gõ tên KH / SĐT / mã KH để tìm...'}" autocomplete="off">
        <button type="button" class="csb-clear" title="Xóa lựa chọn">✕</button>
        <div class="csb-dropdown"></div>
      `;
      host.innerHTML = '';
      host.appendChild(wrap);

      const input = wrap.querySelector('.csb-input');
      const dropdown = wrap.querySelector('.csb-dropdown');
      const clearBtn = wrap.querySelector('.csb-clear');

      const state = {
        selectedId: null,
        kbdIdx: -1,
        lastResults: [],
        opts,
      };
      instances[elId] = state;

      /* Position dropdown theo input — dùng position:fixed nên cần re-tính khi scroll/resize */
      const positionDropdown = () => {
        const r = input.getBoundingClientRect();
        dropdown.style.top = (r.bottom + 4) + 'px';
        dropdown.style.left = r.left + 'px';
        dropdown.style.width = r.width + 'px';
        /* Nếu sát đáy viewport → hiển thị bên trên input */
        const dropH = Math.min(dropdown.scrollHeight || 320, 320);
        if (r.bottom + dropH + 10 > window.innerHeight) {
          dropdown.style.top = (r.top - dropH - 4) + 'px';
        }
      };

      const render = (query) => {
        const results = search(query, 12);
        state.lastResults = results;
        state.kbdIdx = -1;

        if (!results.length) {
          dropdown.innerHTML = `<div class="csb-empty">
            Không có KH nào khớp <b>"${query}"</b>
            ${opts.allowQuickAdd !== false ? `<br><button onclick="window._csbQuickAdd('${elId}', \`${query.replace(/`/g,'\\`')}\`)">+ Thêm KH mới "${query.slice(0,30)}"</button>` : ''}
          </div>`;
          return;
        }

        dropdown.innerHTML = results.map((c, i) => {
          const badge = c.group === 'VIP' ? '<span class="badge vip">⭐ VIP</span>'
                      : c.group === 'Mới' ? '<span class="badge new">✨ Mới</span>'
                      : c.debt > 0 ? `<span class="badge" style="background:#FEE2E2;color:#B91C1C">📉 Nợ ${Math.round(c.debt/1e6)}tr</span>` : '';
          return `<div class="csb-item" data-id="${c.id}" data-idx="${i}">
            <div class="av" style="background:${avatarColor(c.id)}">${initials(c.name)}</div>
            <div class="info">
              <div class="n1">${highlight(c.name, query)}</div>
              <div class="n2">${c.code} · ${c.phone || '—'} · ${(c.address||'').split(',')[0]}</div>
            </div>
            ${badge}
          </div>`;
        }).join('') + `<div class="csb-hint">↑↓ chọn · Enter xác nhận · Esc đóng · ${results.length} kết quả</div>`;

        dropdown.querySelectorAll('.csb-item').forEach(item => {
          item.onclick = () => doSelect(item.dataset.id);
        });
      };

      const doSelect = (custId) => {
        const customers = window.STORE.get('customers', window.CUSTOMERS || []) || [];
        const c = customers.find(x => x.id === custId);
        if (!c) return;
        state.selectedId = custId;
        input.value = `${c.name} (${c.code})`;
        input.classList.add('has-value');
        wrap.classList.add('has-value');
        dropdown.classList.remove('open');
        if (opts.onSelect) opts.onSelect(c);
      };

      const doClear = () => {
        state.selectedId = null;
        input.value = '';
        input.classList.remove('has-value');
        wrap.classList.remove('has-value');
        dropdown.classList.remove('open');
        if (opts.onSelect) opts.onSelect(null);
        input.focus();
      };

      input.addEventListener('focus', () => {
        if (state.selectedId) {
          input.select();   /* Cho phép user gõ tìm lại */
        }
        render(input.value);
        dropdown.classList.add('open');
        positionDropdown();
      });

      input.addEventListener('input', () => {
        if (state.selectedId) {
          /* User đang gõ lại — clear selection */
          state.selectedId = null;
          input.classList.remove('has-value');
          wrap.classList.remove('has-value');
        }
        render(input.value);
        dropdown.classList.add('open');
        positionDropdown();
      });

      /* Re-position khi scroll trong modal/page */
      window.addEventListener('scroll', () => {
        if (dropdown.classList.contains('open')) positionDropdown();
      }, true);
      window.addEventListener('resize', () => {
        if (dropdown.classList.contains('open')) positionDropdown();
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { dropdown.classList.remove('open'); return; }
        const items = dropdown.querySelectorAll('.csb-item');
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          state.kbdIdx = Math.min(items.length - 1, state.kbdIdx + 1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          state.kbdIdx = Math.max(0, state.kbdIdx - 1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const target = state.kbdIdx >= 0 ? items[state.kbdIdx] : items[0];
          if (target) doSelect(target.dataset.id);
          return;
        } else return;
        items.forEach(it => it.classList.remove('kbd-hover'));
        if (items[state.kbdIdx]) {
          items[state.kbdIdx].classList.add('kbd-hover');
          items[state.kbdIdx].scrollIntoView({ block: 'nearest' });
        }
      });

      clearBtn.onclick = doClear;

      /* Click outside → close */
      document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target)) dropdown.classList.remove('open');
      });

      /* Initial value */
      if (opts.initialId) {
        const customers = window.STORE.get('customers', window.CUSTOMERS || []) || [];
        const c = customers.find(x => x.id === opts.initialId);
        if (c) doSelect(opts.initialId);
      }

      return state;
    },

    getValue(elId) {
      return instances[elId]?.selectedId || null;
    },

    setValue(elId, custId) {
      const state = instances[elId];
      if (!state) return;
      const customers = window.STORE.get('customers', window.CUSTOMERS || []) || [];
      const c = customers.find(x => x.id === custId);
      const host = document.getElementById(elId);
      const input = host?.querySelector('.csb-input');
      if (c && input) {
        state.selectedId = custId;
        input.value = `${c.name} (${c.code})`;
        input.classList.add('has-value');
        host.querySelector('.csb-wrap')?.classList.add('has-value');
        if (state.opts.onSelect) state.opts.onSelect(c);
      }
    },
  };

  /* Quick-add hook (chỉ khi caller cho phép) */
  window._csbQuickAdd = function (elId, name) {
    if (typeof window.openAddCustomerModal === 'function') {
      window.openAddCustomerModal({ prefilledName: name, onSaved: (c) => {
        CustSearchBox.setValue(elId, c.id);
      }});
    } else {
      window.toast && window.toast('Chuyển sang trang KH để thêm mới','info');
      window.location.href = 'customers.html';
    }
  };

  window.CustSearchBox = CustSearchBox;
})();
