/* =========================================================
   UX Improvements
   ─────────────────────────────────────────────────────────
   1. Undo toast — sau mỗi xoá/đổi quan trọng
   2. Form validation helpers (regex SĐT/email)
   3. Responsive table wrapper (auto overflow-x)
   4. Bulk select rows (checkbox toàn cục)
   5. Confirm dialog đẹp hơn alert()
   ========================================================= */
(function () {

  /* ============ Inject CSS ============ */
  if (!document.getElementById('uxImprovementsCSS')) {
    const s = document.createElement('style');
    s.id = 'uxImprovementsCSS';
    s.textContent = `
      /* Responsive: bảng tự overflow trên mobile */
      @media (max-width: 720px) {
        table.t-responsive,
        .table-wrap table,
        .au-table, .inv-table, .pn-table, .qt-table {
          min-width: 600px;
        }
        .table-wrap,
        .au-card > div[style*="overflow-x"],
        div[style*="overflow-x:auto"] {
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch;
        }
        /* Hide ít quan trọng trên mobile */
        .hide-sm-mobile { display: none !important; }
        h1 { font-size: 18px !important; }
        .kpi { padding: 10px !important; }
        .kpi-value { font-size: 18px !important; }
      }

      /* Undo toast */
      .undo-toast {
        position: fixed; bottom: 80px; right: 18px;
        background: #1F2937; color: #fff;
        padding: 10px 14px; border-radius: 9px;
        font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,0.25);
        display: flex; align-items: center; gap: 12px;
        z-index: 9999; max-width: 90vw;
        animation: undoIn 0.2s ease;
      }
      .undo-toast button {
        background: #F59E0B; color: #fff; border: none;
        padding: 5px 12px; border-radius: 5px;
        cursor: pointer; font-weight: 700; font-size: 12px;
      }
      .undo-toast button:hover { background: #D97706; }
      @keyframes undoIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

      /* Field validation */
      input.invalid, select.invalid, textarea.invalid {
        border-color: #DC2626 !important;
        background: #FEF2F2;
      }
      .field-error {
        color: #B91C1C; font-size: 11px; margin-top: 3px;
        display: block;
      }
    `;
    document.head.appendChild(s);
  }

  /* ============ Undo helper ============ */
  /* Dùng: window.undo.show('Đã xoá KH001', () => { window.STORE.add('customers', backupObj); }) */
  window.undo = {
    show(msg, restoreFn, timeoutMs) {
      /* Remove existing */
      document.querySelectorAll('.undo-toast').forEach(t => t.remove());
      const t = document.createElement('div');
      t.className = 'undo-toast';
      t.innerHTML = `<span>${msg}</span><button>↶ Khôi phục</button>`;
      document.body.appendChild(t);
      const btn = t.querySelector('button');
      btn.onclick = () => {
        try { restoreFn(); window.toast && window.toast('✓ Đã khôi phục', 'success'); } catch (e) { console.error(e); }
        t.remove();
        clearTimeout(timer);
      };
      const timer = setTimeout(() => t.remove(), timeoutMs || 7000);
    }
  };

  /* ============ Validation ============ */
  window.validate = {
    phone(s) {
      const v = (s||'').replace(/\s/g,'');
      return /^(\+84|0)\d{9,10}$/.test(v);
    },
    email(s) {
      return /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(s||'');
    },
    required(s) { return !!(s && s.trim()); },
    number(s, min, max) {
      const n = parseFloat(s);
      if (isNaN(n)) return false;
      if (min != null && n < min) return false;
      if (max != null && n > max) return false;
      return true;
    },

    /* Apply tới 1 input element: returns true/false + show error */
    field(inputEl, rules) {
      const v = inputEl.value;
      let err = null;
      for (const r of rules) {
        if (r === 'required' && !this.required(v)) err = 'Bắt buộc';
        else if (r === 'phone' && v && !this.phone(v)) err = 'SĐT không hợp lệ (VD: 0912345678)';
        else if (r === 'email' && v && !this.email(v)) err = 'Email không hợp lệ';
        else if (typeof r === 'object' && r.number) {
          if (!this.number(v, r.min, r.max)) err = `Số ${r.min!=null?'≥'+r.min:''}${r.max!=null?'≤'+r.max:''}`;
        }
        if (err) break;
      }
      let nextEl = inputEl.nextElementSibling;
      if (nextEl && nextEl.classList && nextEl.classList.contains('field-error')) nextEl.remove();
      if (err) {
        inputEl.classList.add('invalid');
        const div = document.createElement('div');
        div.className = 'field-error';
        div.textContent = err;
        inputEl.parentNode.insertBefore(div, inputEl.nextSibling);
        return false;
      } else {
        inputEl.classList.remove('invalid');
        return true;
      }
    },

    /* Validate cả 1 form (NodeList các input[data-validate]) */
    form(formEl) {
      let ok = true;
      formEl.querySelectorAll('[data-validate]').forEach(inp => {
        const rules = inp.dataset.validate.split(' ');
        if (!this.field(inp, rules)) ok = false;
      });
      return ok;
    }
  };

  /* Auto-attach blur listener cho input có data-validate */
  document.addEventListener('focusout', e => {
    if (e.target.matches && e.target.matches('[data-validate]')) {
      const rules = e.target.dataset.validate.split(' ');
      window.validate.field(e.target, rules);
    }
  }, true);

  /* ============ Bulk select helper ============ */
  /* Dùng cho bảng có .checkbox-row trong mỗi tr — và .checkbox-all ở thead */
  window.bulk = {
    selected(tableSelector) {
      return [...document.querySelectorAll(tableSelector + ' .checkbox-row.on')].map(c => c.dataset.id);
    },
    wire(tableSelector, onSelectionChange) {
      const all = document.querySelector(tableSelector + ' .checkbox-all');
      if (all) all.onclick = () => {
        all.classList.toggle('on');
        const isOn = all.classList.contains('on');
        document.querySelectorAll(tableSelector + ' .checkbox-row').forEach(c => c.classList[isOn ? 'add' : 'remove']('on'));
        onSelectionChange && onSelectionChange(this.selected(tableSelector));
      };
      document.querySelectorAll(tableSelector + ' .checkbox-row').forEach(c => {
        c.onclick = (e) => {
          e.stopPropagation();
          c.classList.toggle('on');
          onSelectionChange && onSelectionChange(this.selected(tableSelector));
        };
      });
    }
  };

  /* ============ Auto-add t-responsive class to all bảng lớn ============ */
  setInterval(() => {
    document.querySelectorAll('table:not(.t-responsive)').forEach(t => {
      if (t.querySelectorAll('th').length > 5) t.classList.add('t-responsive');
    });
  }, 2000);

})();
