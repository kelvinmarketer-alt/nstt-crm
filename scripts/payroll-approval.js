/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Phiếu duyệt lương (Boss approval)
   ─────────────────────────────────────────────────────────
   Drawer chi tiết theo định dạng "BẢNG LƯƠNG tháng X" của NSTT.
   Boss xem từng dòng thưởng/phạt + edit số tiền + duyệt.

   Workflow: draft → approved → paid
   - draft:    nháp, ai cũng sửa được
   - approved: đã duyệt, lock không sửa được nữa (trừ admin)
   - paid:     đã trả, tạo phiếu chi vào cashEntries
   ========================================================= */
(function () {

  if (!window.PayrollFormula) {
    console.warn('[Payroll] Cần payroll-formula.js load trước');
    return;
  }

  const PF = window.PayrollFormula;

  /* === Lưu/lấy phiếu lương từ STORE === */
  function getPayslips()      { return window.STORE.get('payrollExtra', []) || []; }
  function savePayslips(list) { window.STORE.set('payrollExtra', list); }

  /* === Tìm phiếu theo NV + tháng === */
  function findPayslip(staffId, month) {
    return getPayslips().find(p => p.staffId === staffId && p.month === month);
  }

  /* === Tạo hoặc lấy phiếu cho NV trong tháng === */
  function getOrCreatePayslip(staffId, month) {
    const existing = findPayslip(staffId, month);
    if (existing) return existing;
    const staff = (window.STORE.get('staff', []) || []).find(s => s.id === staffId) || {};
    return {
      id: 'PR-' + month + '-' + staffId,
      month,
      staffId,
      staffName: staff.name || '?',
      dept: staff.dept || 'VP',
      role: staff.role || '',
      contractType: staff.contractType || 'official',
      basicSalary: staff.salary || 0,
      workActual: 0,
      workStandardOverride: null,
      allowanceOverride: null,
      bonuses: [],
      penalties: [],
      bhxh: staff.hasBHXH ? 578000 : 0,
      advance: 0,
      notes: '',
      status: 'draft',
      createdAt: new Date().toISOString(),
      approvedBy: null,
      approvedAt: null,
      paidAt: null,
    };
  }

  /* === Render drawer phiếu duyệt === */
  window.openPayslipDrawer = function (staffId, month) {
    month = month || '2026-' + String(new Date().getMonth()+1).padStart(2,'0');
    const p = getOrCreatePayslip(staffId, month);
    const computed = PF.computePayslip(p);

    const isLocked = p.status === 'approved' || p.status === 'paid';
    const canEdit = !isLocked || (window.AUTH && window.AUTH.hasPerm('all'));

    const statusBadge = p.status === 'draft'
      ? '<span style="background:#FEF3C7;color:#854D0E;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700">📝 NHÁP</span>'
      : p.status === 'approved'
      ? '<span style="background:#DCFCE7;color:#15803D;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700">✓ ĐÃ DUYỆT</span>'
      : '<span style="background:#DBEAFE;color:#1E40AF;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700">💵 ĐÃ TRẢ</span>';

    const drawer = document.getElementById('drawer');
    const dc = document.getElementById('drawerContent');
    if (!drawer || !dc) {
      window.toast?.('Page này chưa có drawer container', 'warn');
      return;
    }

    /* Render bonus + penalty rows editable */
    function bonusRows(arr) {
      return (arr || []).map((b, i) => `
        <div class="ps-line ps-bonus" data-idx="${i}" style="display:grid;grid-template-columns:1fr 140px 32px;gap:8px;padding:6px 0;border-bottom:1px dashed var(--line)">
          <input class="ps-bonus-name" data-idx="${i}" value="${(b.name||'').replace(/"/g,'&quot;')}" placeholder="VD: Doanh số 3% nhà X" ${canEdit?'':'readonly'} style="border:1px solid var(--line);border-radius:6px;padding:5px 8px;font-size:12.5px">
          <input class="ps-bonus-amount num" data-idx="${i}" type="number" value="${b.amount||0}" placeholder="0" ${canEdit?'':'readonly'} style="border:1px solid var(--line);border-radius:6px;padding:5px 8px;text-align:right;font-size:12.5px;font-weight:700;color:#15803D">
          ${canEdit ? `<button onclick="window._psRemoveBonus(${i})" style="background:transparent;border:none;color:#DC2626;cursor:pointer;font-size:16px">×</button>` : '<span></span>'}
        </div>
      `).join('') || `<div style="padding:8px;color:var(--muted);text-align:center;font-size:12px">Chưa có khoản thưởng</div>`;
    }
    function penaltyRows(arr) {
      return (arr || []).map((p, i) => `
        <div class="ps-line ps-pen" data-idx="${i}" style="display:grid;grid-template-columns:1fr 140px 32px;gap:8px;padding:6px 0;border-bottom:1px dashed var(--line)">
          <input class="ps-pen-name" data-idx="${i}" value="${(p.name||'').replace(/"/g,'&quot;')}" placeholder="VD: Đi muộn > 10p × 3 ngày" ${canEdit?'':'readonly'} style="border:1px solid var(--line);border-radius:6px;padding:5px 8px;font-size:12.5px">
          <input class="ps-pen-amount num" data-idx="${i}" type="number" value="${p.amount||0}" placeholder="0" ${canEdit?'':'readonly'} style="border:1px solid var(--line);border-radius:6px;padding:5px 8px;text-align:right;font-size:12.5px;font-weight:700;color:#DC2626">
          ${canEdit ? `<button onclick="window._psRemovePenalty(${i})" style="background:transparent;border:none;color:#DC2626;cursor:pointer;font-size:16px">×</button>` : '<span></span>'}
        </div>
      `).join('') || `<div style="padding:8px;color:var(--muted);text-align:center;font-size:12px">Không có khoản phạt</div>`;
    }

    /* === HTML drawer === */
    dc.innerHTML = `
      <div style="background:linear-gradient(135deg,#1B5E20 0%,#15803D 100%);color:#fff;padding:18px 22px;position:relative">
        <button onclick="closeDrawer()" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,0.15);border:none;color:#fff;width:30px;height:30px;border-radius:6px;cursor:pointer">✕</button>
        <h2 style="margin:0 0 4px;font-size:18px">💼 PHIẾU DUYỆT LƯƠNG</h2>
        <div style="font-size:12.5px;opacity:0.9">Tháng ${p.month} · ${statusBadge}</div>
      </div>

      <div style="padding:14px 18px;border-bottom:1px solid var(--line);background:#FAFBFC">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px">
          <div><b style="color:var(--navy)">${p.staffName}</b><div style="color:var(--muted);font-size:11.5px">${p.role || '—'}</div></div>
          <div style="text-align:right"><span style="background:#EFF6FF;color:#1E40AF;padding:3px 9px;border-radius:5px;font-size:11.5px;font-weight:600">${p.dept}</span></div>
        </div>
      </div>

      <div style="padding:14px 18px;overflow-y:auto;max-height:calc(100vh - 180px)">

        <!-- Cấu hình cơ bản -->
        <div class="section-h" style="margin-bottom:8px">⚙ Cấu hình lương</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
          <div>
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">Lương cơ bản (₫)</label>
            <input id="psBasic" type="number" value="${p.basicSalary}" ${canEdit?'':'readonly'} style="width:100%;padding:7px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px;text-align:right;font-weight:700">
          </div>
          <div>
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">Loại HĐ</label>
            <select id="psContract" ${canEdit?'':'disabled'} style="width:100%;padding:7px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px">
              <option value="official"  ${p.contractType==='official'?'selected':''}>Chính thức (100%)</option>
              <option value="probation" ${p.contractType==='probation'?'selected':''}>Thử việc (85%)</option>
              <option value="intern"    ${p.contractType==='intern'?'selected':''}>Thực tập (100%)</option>
              <option value="parttime"  ${p.contractType==='parttime'?'selected':''}>Part-time (100%)</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">Công thực tế</label>
            <input id="psWorkActual" type="number" step="0.05" value="${p.workActual}" ${canEdit?'':'readonly'} style="width:100%;padding:7px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px;text-align:right">
          </div>
          <div>
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">Công chuẩn (mặc định ${computed.workStandard})</label>
            <input id="psWorkStd" type="number" value="${p.workStandardOverride || ''}" placeholder="${computed.workStandard}" ${canEdit?'':'readonly'} style="width:100%;padding:7px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px;text-align:right">
          </div>
        </div>

        <!-- Khoản TÍNH -->
        <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:12px 14px;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <b style="color:#15803D;font-size:13px">① Lương theo công</b>
            <span style="font-size:15px;font-weight:800;color:#15803D" id="psBaseSalary">${PF.formatVND(computed.baseSalary)} ₫</span>
          </div>
          <div style="font-size:11px;color:#15803D;opacity:0.8" id="psBaseFormula">${computed.breakdown.baseSalaryDetail}</div>
        </div>

        <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:12px 14px;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div>
              <b style="color:#1E40AF;font-size:13px">② Phụ cấp</b>
              <span style="font-size:11px;color:#1E40AF;opacity:0.7;margin-left:6px">
                Mặc định ${PF.formatVND(computed.allowanceMonthly)} ₫/tháng
              </span>
            </div>
            <span style="font-size:15px;font-weight:800;color:#1E40AF" id="psAllowance">${PF.formatVND(computed.allowance)} ₫</span>
          </div>
          ${canEdit ? `<input id="psAllowanceOverride" type="number" placeholder="Ghi đè mức phụ cấp (để trống = dùng mặc định)" value="${p.allowanceOverride||''}" style="width:100%;padding:6px 10px;font-size:12px;border:1px solid #BFDBFE;border-radius:6px;background:#fff">` : ''}
        </div>

        <!-- THƯỞNG -->
        <div class="section-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span>③ Thưởng <span style="color:var(--ok);font-weight:700" id="psBonusTotal">+ ${PF.formatVND(computed.totalBonus)} ₫</span></span>
          ${canEdit ? '<button class="btn btn-ghost btn-sm" onclick="window._psAddBonus()">➕ Thêm khoản thưởng</button>' : ''}
        </div>
        <div id="psBonusList" style="background:#FAFBFC;border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin-bottom:14px">
          ${bonusRows(p.bonuses)}
        </div>

        <!-- PHẠT -->
        <div class="section-h" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span>④ Phạt/Trừ <span style="color:var(--danger);font-weight:700" id="psPenaltyTotal">− ${PF.formatVND(computed.totalPenalty)} ₫</span></span>
          ${canEdit ? '<button class="btn btn-ghost btn-sm" onclick="window._psAddPenalty()">➕ Thêm khoản trừ</button>' : ''}
        </div>
        <div id="psPenaltyList" style="background:#FAFBFC;border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin-bottom:14px">
          ${penaltyRows(p.penalties)}
        </div>

        <!-- BHXH + TẠM ỨNG -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
          <div>
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">🛡 BHXH (₫/tháng)</label>
            <input id="psBhxh" type="number" value="${p.bhxh}" placeholder="0 hoặc 578000" ${canEdit?'':'readonly'} style="width:100%;padding:7px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px;text-align:right">
          </div>
          <div>
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">💵 Tạm ứng đã ứng (₫)</label>
            <input id="psAdvance" type="number" value="${p.advance}" ${canEdit?'':'readonly'} style="width:100%;padding:7px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px;text-align:right">
          </div>
        </div>

        <!-- GHI CHÚ -->
        <div style="margin-bottom:14px">
          <label style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:600">📝 Ghi chú</label>
          <textarea id="psNotes" placeholder="VD: Mỗi tháng 1 ngày nghỉ có lương; Trừ 578k BHXH..." ${canEdit?'':'readonly'} style="width:100%;padding:8px 10px;font-size:13px;border:1px solid var(--line);border-radius:6px;resize:vertical;min-height:60px">${p.notes||''}</textarea>
        </div>

        <!-- TỔNG -->
        <div style="background:linear-gradient(135deg,#1B5E20,#15803D);color:#fff;padding:18px 20px;border-radius:12px;text-align:center">
          <div style="font-size:13px;opacity:0.9;margin-bottom:6px">TỔNG THỰC LĨNH</div>
          <div style="font-size:28px;font-weight:800" id="psTotal">${PF.formatVND(computed.total)} ₫</div>
          <div style="font-size:11px;opacity:0.85;margin-top:6px">
            ${PF.formatVND(computed.baseSalary)} + ${PF.formatVND(computed.allowance)} + ${PF.formatVND(computed.totalBonus)} − ${PF.formatVND(computed.totalPenalty)} − ${PF.formatVND(computed.bhxh)} − ${PF.formatVND(computed.advance)}
          </div>
        </div>

      </div>

      <!-- Footer actions -->
      <div style="padding:12px 18px;border-top:1px solid var(--line);background:#fff;display:flex;gap:8px;flex-wrap:wrap">
        ${canEdit ? '<button class="btn btn-ghost" onclick="window._psSave()">💾 Lưu nháp</button>' : ''}
        ${p.status === 'draft' && canEdit ? '<button class="btn btn-navy" onclick="window._psApprove()">✓ Duyệt phiếu</button>' : ''}
        ${p.status === 'approved' ? '<button class="btn btn-primary" onclick="window._psPay()">💵 Đã trả lương</button>' : ''}
        ${p.status === 'paid' ? '<span style="color:var(--ok);padding:8px 14px;font-weight:600">✓ Đã hoàn tất</span>' : ''}
        <div style="flex:1"></div>
        <button class="btn btn-ghost" onclick="closeDrawer()">Đóng</button>
      </div>
    `;

    /* === Wire live recalculate khi user gõ === */
    window._psCurrentDraft = JSON.parse(JSON.stringify(p));

    function collect() {
      const d = window._psCurrentDraft;
      d.basicSalary = +(document.getElementById('psBasic')?.value || 0);
      d.contractType = document.getElementById('psContract')?.value || 'official';
      d.workActual = +(document.getElementById('psWorkActual')?.value || 0);
      const wsv = document.getElementById('psWorkStd')?.value;
      d.workStandardOverride = wsv ? +wsv : null;
      const ao = document.getElementById('psAllowanceOverride')?.value;
      d.allowanceOverride = ao ? +ao : null;
      d.bhxh = +(document.getElementById('psBhxh')?.value || 0);
      d.advance = +(document.getElementById('psAdvance')?.value || 0);
      d.notes = document.getElementById('psNotes')?.value || '';
      /* Collect bonus/penalty từ DOM */
      d.bonuses = Array.from(document.querySelectorAll('.ps-bonus')).map(el => ({
        name: el.querySelector('.ps-bonus-name')?.value || '',
        amount: +(el.querySelector('.ps-bonus-amount')?.value || 0),
      })).filter(b => b.amount > 0 || b.name);
      d.penalties = Array.from(document.querySelectorAll('.ps-pen')).map(el => ({
        name: el.querySelector('.ps-pen-name')?.value || '',
        amount: +(el.querySelector('.ps-pen-amount')?.value || 0),
      })).filter(p => p.amount > 0 || p.name);
      return d;
    }
    function refreshComputed() {
      const d = collect();
      const c = PF.computePayslip(d);
      document.getElementById('psBaseSalary').textContent = PF.formatVND(c.baseSalary) + ' ₫';
      document.getElementById('psBaseFormula').textContent = c.breakdown.baseSalaryDetail;
      document.getElementById('psAllowance').textContent = PF.formatVND(c.allowance) + ' ₫';
      document.getElementById('psBonusTotal').textContent = '+ ' + PF.formatVND(c.totalBonus) + ' ₫';
      document.getElementById('psPenaltyTotal').textContent = '− ' + PF.formatVND(c.totalPenalty) + ' ₫';
      document.getElementById('psTotal').textContent = PF.formatVND(c.total) + ' ₫';
    }

    /* Bind inputs */
    dc.querySelectorAll('input, select, textarea').forEach(el => {
      el.addEventListener('input', refreshComputed);
      el.addEventListener('change', refreshComputed);
    });

    /* === Action helpers (expose to window) === */
    window._psAddBonus = function () {
      const d = collect();
      d.bonuses.push({ name:'', amount: 0 });
      window._psCurrentDraft = d;
      const list = document.getElementById('psBonusList');
      list.innerHTML = bonusRows(d.bonuses);
      list.querySelectorAll('input').forEach(el => {
        el.addEventListener('input', refreshComputed);
        el.addEventListener('change', refreshComputed);
      });
    };
    window._psRemoveBonus = function (idx) {
      const d = collect();
      d.bonuses.splice(idx, 1);
      window._psCurrentDraft = d;
      const list = document.getElementById('psBonusList');
      list.innerHTML = bonusRows(d.bonuses);
      list.querySelectorAll('input').forEach(el => {
        el.addEventListener('input', refreshComputed);
        el.addEventListener('change', refreshComputed);
      });
      refreshComputed();
    };
    window._psAddPenalty = function () {
      const d = collect();
      d.penalties.push({ name:'', amount: 0 });
      window._psCurrentDraft = d;
      const list = document.getElementById('psPenaltyList');
      list.innerHTML = penaltyRows(d.penalties);
      list.querySelectorAll('input').forEach(el => {
        el.addEventListener('input', refreshComputed);
        el.addEventListener('change', refreshComputed);
      });
    };
    window._psRemovePenalty = function (idx) {
      const d = collect();
      d.penalties.splice(idx, 1);
      window._psCurrentDraft = d;
      const list = document.getElementById('psPenaltyList');
      list.innerHTML = penaltyRows(d.penalties);
      list.querySelectorAll('input').forEach(el => {
        el.addEventListener('input', refreshComputed);
        el.addEventListener('change', refreshComputed);
      });
      refreshComputed();
    };

    window._psSave = function () {
      const d = collect();
      const c = PF.computePayslip(d);
      const final = { ...d, baseSalary: c.baseSalary, allowance: c.allowance, total: c.total };
      const list = getPayslips();
      const i = list.findIndex(x => x.id === final.id);
      if (i >= 0) list[i] = final; else list.push(final);
      savePayslips(list);
      window.toast?.('✓ Đã lưu phiếu nháp', 'success');
    };

    window._psApprove = function () {
      if (!confirm('Duyệt phiếu lương cho ' + p.staffName + '?\n\nSau khi duyệt sẽ KHÔNG sửa được (trừ admin).')) return;
      const d = collect();
      const c = PF.computePayslip(d);
      const user = (window.AUTH && window.AUTH.currentUser()) || {};
      const final = {
        ...d,
        baseSalary: c.baseSalary, allowance: c.allowance, total: c.total,
        status: 'approved',
        approvedBy: user.name || user.email || 'sếp',
        approvedAt: new Date().toISOString(),
      };
      const list = getPayslips();
      const i = list.findIndex(x => x.id === final.id);
      if (i >= 0) list[i] = final; else list.push(final);
      savePayslips(list);
      window.toast?.('✓ Đã duyệt phiếu lương ' + PF.formatVND(c.total) + ' ₫', 'success');
      closeDrawer();
    };

    window._psPay = function () {
      if (!confirm('Đánh dấu đã TRẢ lương cho ' + p.staffName + '?\n\nSẽ tự tạo phiếu chi vào Sổ quỹ.')) return;
      const d = collect();
      const final = { ...d, paid: true, status: 'paid', paidAt: new Date().toISOString() };
      const list = getPayslips();
      const i = list.findIndex(x => x.id === final.id);
      if (i >= 0) list[i] = final; else list.push(final);
      savePayslips(list);
      /* cross-module-hooks.js subscribe 'payrollExtra' sẽ tự tạo cashEntries */
      window.toast?.('✓ Đã trả lương + tạo phiếu chi Sổ quỹ', 'success');
      closeDrawer();
    };

    /* Show drawer */
    drawer.classList.add('open');
    document.querySelector('.drawer-bg')?.classList.add('open');
  };

  console.log('[NSTT] ✓ Payroll approval drawer ready — window.openPayslipDrawer(staffId, month)');
})();
