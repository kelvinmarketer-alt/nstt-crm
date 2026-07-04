/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Nhân viên (Full CRUD)
   ========================================================= */
(function () {
  let staffs = window.STORE.get('staff', window.STAFFS || []);
  let curDept = 'all';

  /* Chuẩn hoá tên phòng ban để gộp các giá trị lưu lộn xộn (slug vs nhãn) — CHỈ để hiển thị/lọc, KHÔNG sửa data gốc */
  function _normDept(d) {
    const x = (d || '').toString().trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
    if (!x) return 'Khác';
    const M = {
      'ban gd': 'Ban giám đốc', 'ban giam doc': 'Ban giám đốc', 'ban giám đốc': 'Ban giám đốc', 'bgd': 'Ban giám đốc', 'giam doc': 'Ban giám đốc', 'giám đốc': 'Ban giám đốc', 'ceo': 'Ban giám đốc',
      'sale': 'Sale', 'sales': 'Sale', 'kinh doanh': 'Sale', 'cskh': 'Sale', 'cham soc khach hang': 'Sale', 'chăm sóc khách hàng': 'Sale',
      'ke toan': 'Kế toán', 'kế toán': 'Kế toán', 'ketoan': 'Kế toán',
      'kho': 'Kho & Ship', 'kho van': 'Kho & Ship', 'kho ship': 'Kho & Ship', 'kho & ship': 'Kho & Ship', 'van hanh': 'Kho & Ship', 'vận hành': 'Kho & Ship', 'giao hang': 'Kho & Ship', 'giao hàng': 'Kho & Ship', 'shipper': 'Kho & Ship', 'ship': 'Kho & Ship',
      'thu mua': 'Thu Mua', 'mua hang': 'Thu Mua', 'mua hàng': 'Thu Mua', 'procurement': 'Thu Mua',
      'hcns': 'Nhân sự', 'nhan su': 'Nhân sự', 'nhân sự': 'Nhân sự', 'tuyen dung': 'Nhân sự', 'tuyển dụng': 'Nhân sự', 'hanh chinh': 'Nhân sự', 'hr': 'Nhân sự',
      'mkt': 'Marketing', 'marketing': 'Marketing', 'digital marketing': 'Marketing', 'truyen thong': 'Marketing',
    };
    return M[x] || ((d || '').toString().trim());
  }

  function render() {
    staffs = window.STORE.get('staff', window.STAFFS || []);
    const q = document.getElementById('qSearch').value.trim().toLowerCase();
    const st = document.getElementById('fStatus').value;
    const rows = staffs.filter(s =>
      (curDept === 'all' || _normDept(s.dept) === curDept) &&
      (!q || [s.name, s.phone, s.code, s.id].some(x => (x||'').toLowerCase().includes(q))) &&
      (!st || s.status === st)
    );
    document.getElementById('rowCount').textContent = `${rows.length} / ${staffs.length} nhân viên`;
    /* === KPI cards + chips động từ data thật === */
    (function updateStaffKpis() {
      const active = staffs.filter(s => s.status === 'active');
      const off = staffs.filter(s => s.status !== 'active');
      const depts = new Set(staffs.map(s => _normDept(s.dept)).filter(Boolean));
      const shippers = staffs.filter(s => /giao hàng|shipper|vận hành/i.test((s.dept||'') + ' ' + (s.role||'')));
      const salarySum = staffs.reduce((sum, s) => sum + (+s.salary || 0), 0);
      const f = window.fmtShort || (n => n);
      const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      set('kpiStaffTotal', staffs.length);
      set('kpiStaffDept', depts.size + ' phòng ban');
      set('kpiStaffActive', active.length);
      set('kpiStaffOff', off.length + ' nghỉ/khóa');
      set('kpiStaffShipper', shippers.length);
      set('kpiStaffSalary', f(salarySum) + ' ₫');
      set('staffSubHead', `${staffs.length} nhân viên · ${depts.size} phòng ban · phân quyền truy cập module`);
    })();
    buildDeptChips(staffs);
    const aliasMap = window.STORE.get('staffAliases', {}) || {};
    document.getElementById('stTbody').innerHTML = rows.map(s => {
      const col = window.avatarColor(s.id);
      const kpiNum = s.kpi ? parseInt(s.kpi) : null;
      const kpiCls = kpiNum && kpiNum < 85 ? 'warn' : '';
      const perms = (s.permissions||[]).slice(0,2).map(p => `<span class="perm-pill">${p}</span>`).join('')
                  + ((s.permissions||[]).length > 2 ? `<span class="perm-pill">+${s.permissions.length-2}</span>` : '');
      return `<tr data-id="${s.id}">
        <td class="hide-xs"><b>${s.code || s.id || '—'}</b></td>
        <td data-field="name">
          <div class="cust-cell">
            <div class="cust-ava" style="background:${col}">${s.avatar || window.initials(s.name)}</div>
            <div class="cust-info">
              <div class="n1">${s.name}</div>
              <div class="n2">${s.role}</div>
            </div>
          </div>
        </td>
        <td class="hide-sm" data-field="alias" onclick="event.stopPropagation()">
          <input value="${(aliasMap[s.id] || '').replace(/"/g, '&quot;')}" placeholder="(chưa gán)" onchange="window.stSaveAlias('${s.id}', this.value)" title="Tên NV hiển thị trong máy chấm công — sửa để khớp file chấm công · để trống = xoá" style="width:100%;max-width:130px;padding:4px 7px;border:1px solid var(--line);border-radius:6px;font-size:12px">
        </td>
        <td class="hide-sm" data-field="dept"><span class="staff-pill">${s.dept}</span></td>
        <td class="hide-md" data-field="phone" style="font-size:12px">${s.phone || '—'}</td>
        <td class="hide-xs" style="font-size:11.5px">${perms}</td>
        <td class="hide-sm">${kpiNum ? `<div style="display:flex;align-items:center;gap:4px"><div class="kpi-bar ${kpiCls}"><div style="width:${kpiNum}%"></div></div><b style="font-size:11px;color:var(--${kpiCls==='warn'?'warn':'ok'})">${s.kpi}</b></div>` : '—'}</td>
        <td class="num hide-md">${s.salary ? window.fmt(s.salary) : '—'}</td>
        <td data-field="status"><span class="status-pill ${s.status==='active'?'st-delivered':'st-cancelled'}">${s.status==='active'?'✓ Đi làm':'⏸ Nghỉ'}</span></td>
        <td class="hide-xs" onclick="event.stopPropagation()">
          <div class="row-actions">
            <button class="ra-zalo" data-act="zalo" data-id="${s.id}" title="Nhắn Zalo cho NV">Z</button>
            <button class="ra-call" data-act="call" data-id="${s.id}" title="Gọi điện cho NV">📞</button>
            <button data-act="edit" data-id="${s.id}" title="Sửa thông tin NV (họ tên, SĐT, lương, phân quyền)">✏️</button>
            <button data-act="toggle" data-id="${s.id}" title="${s.status==='active'?'Cho NV nghỉ (tạm khóa đăng nhập)':'Cho NV đi làm lại (mở khóa)'}">${s.status==='active'?'⏸':'▶'}</button>
            ${s.role !== 'Chủ doanh nghiệp' ? `<button data-act="del" data-id="${s.id}" style="color:var(--danger)" title="Xóa NV khỏi hệ thống">🗑</button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="10" style="padding:40px;text-align:center;color:var(--muted)">Không có NV nào khớp.</td></tr>`;

    document.querySelectorAll('#stTbody tr[data-id]').forEach(tr => {
      tr.onclick = () => openStaff(tr.dataset.id);
    });
    document.querySelectorAll('#stTbody button[data-act]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const s = staffs.find(x => x.id === btn.dataset.id);
        if (!s) return;
        const act = btn.dataset.act;
        if (act === 'zalo') { window.open('https://zalo.me/' + s.phone.replace(/\s/g,''),'_blank'); window.toast('Zalo ' + s.name, 'info'); }
        else if (act === 'call') { window.location.href = 'tel:' + s.phone.replace(/\s/g,''); }
        else if (act === 'edit') openStaff(s.id);
        else if (act === 'toggle') {
          const newStatus = s.status === 'active' ? 'off' : 'active';
          window.STORE.update('staff', s.id, { status: newStatus });
          window.toast(s.name + ': ' + (newStatus==='active'?'✓ Bật':'⏸ Tắt'), 'info');
        }
        else if (act === 'del') {
          window.confirmDelete('Xóa NV ' + s.name + '?', () => {
            window.STORE.remove('staff', s.id);
            window.toast('Đã xóa NV', 'danger');
          });
        }
      };
    });
  }

  /* ============================================================
     CẤU HÌNH LƯƠNG — 4 loại công thức linh hoạt per NV
     - fixed       : Cố định theo công (mặc định)
     - commission  : Cố định + % doanh thu của các đơn NV phụ trách
     - perOrder    : Cố định + thưởng cho mỗi đơn giao thành công (driver)
     - kpi         : Cố định + thưởng KPI khi đạt mục tiêu
     - custom      : Tự nhập note (chỉ ghi chú, không auto compute)
     ============================================================ */
  function salaryConfigHTML(cfg, prefix) {
    cfg = cfg || { type: 'fixed', commissionPct: 0, perOrderBonus: 0, kpiTarget: 0, kpiBonus: 0, customNote: '' };
    const t = cfg.type || 'fixed';
    return `
      <div class="form-row wide">
        <label>Loại công thức tính lương</label>
        <select id="${prefix}SalType" onchange="window.onSalaryTypeChange('${prefix}', this.value)" style="width:100%">
          <option value="fixed"      ${t==='fixed'?'selected':''}>💼 Cố định — chỉ tính theo công ngày</option>
          <option value="commission" ${t==='commission'?'selected':''}>📈 Cố định + % Doanh thu (Sales / CSKH)</option>
          <option value="perOrder"   ${t==='perOrder'?'selected':''}>🛵 Cố định + Thưởng / đơn giao (Shipper)</option>
          <option value="kpi"        ${t==='kpi'?'selected':''}>🎯 Cố định + Thưởng KPI (đạt mục tiêu DT/đơn)</option>
          <option value="custom"     ${t==='custom'?'selected':''}>✍️ Tự ghi chú công thức riêng</option>
        </select>
      </div>
      <div id="${prefix}SalFields">${salaryFieldsHTML(t, cfg, prefix)}</div>
      <div style="font-size:11.5px;color:var(--muted);padding:8px 12px;background:#FAFAFB;border-left:3px solid var(--navy);border-radius:6px;margin-top:8px">
        💡 Công thức được áp dụng tự động trong <b>Chấm công & Lương → Bảng lương</b>.
        Lương cơ bản = lương theo công. Phần thêm theo loại đã chọn = cộng vào "Thực lĩnh".
      </div>
    `;
  }

  function salaryFieldsHTML(type, cfg, prefix) {
    if (type === 'commission') {
      return `<div class="form-row">
        <div><label>% Doanh thu được hưởng</label>
          <input type="number" id="${prefix}CommPct" step="0.1" min="0" max="100" value="${cfg.commissionPct || 0}" placeholder="VD: 1.5 (= 1.5% doanh thu)">
        </div>
        <div><label>Áp dụng cho</label>
          <select id="${prefix}CommScope">
            <option value="ownedCusts" ${cfg.commissionScope==='ownedCusts'?'selected':''}>Đơn của KH NV này phụ trách</option>
            <option value="ownOrders"  ${cfg.commissionScope==='ownOrders'?'selected':''}>Đơn NV này tạo trực tiếp</option>
            <option value="allOrders"  ${cfg.commissionScope==='allOrders'?'selected':''}>TẤT CẢ đơn (GĐ / TP)</option>
          </select>
        </div>
      </div>`;
    }
    if (type === 'perOrder') {
      return `<div class="form-row">
        <div><label>Thưởng / đơn giao thành công (₫)</label>
          <input type="number" id="${prefix}PerOrd" value="${cfg.perOrderBonus || 0}" placeholder="VD: 20000 (= 20k/đơn delivered)">
        </div>
        <div><label>Áp dụng trạng thái</label>
          <select id="${prefix}PerOrdStatus">
            <option value="delivered" ${cfg.perOrderStatus==='delivered'?'selected':''}>Đã giao (delivered)</option>
            <option value="reconciled" ${(cfg.perOrderStatus||'reconciled')==='reconciled'?'selected':''}>Đã đối soát (reconciled)</option>
          </select>
        </div>
      </div>`;
    }
    if (type === 'kpi') {
      return `<div class="form-row">
        <div><label>Mục tiêu doanh thu tháng (₫)</label>
          <input type="number" id="${prefix}KpiTgt" value="${cfg.kpiTarget || 0}" placeholder="VD: 50000000 = 50tr/tháng">
        </div>
        <div><label>Thưởng nếu đạt KPI (₫)</label>
          <input type="number" id="${prefix}KpiBon" value="${cfg.kpiBonus || 0}" placeholder="VD: 2000000 = 2tr thưởng">
        </div>
      </div>
      <div style="font-size:11.5px;color:var(--muted);padding:6px 0">Đạt 100% mục tiêu → thưởng full · ≥80% → thưởng 50% · &lt;80% → không thưởng.</div>`;
    }
    if (type === 'custom') {
      return `<div class="form-row wide">
        <label>Ghi chú công thức / điều khoản đặc biệt</label>
        <textarea id="${prefix}CustNote" rows="3" style="width:100%" placeholder="VD: Lương = 10tr + 0.5% doanh thu nếu vượt 100tr/tháng + thưởng quý 5tr. Tự tay tính & nhập Thưởng/Khấu trừ ở Bảng lương.">${cfg.customNote || ''}</textarea>
      </div>`;
    }
    return `<div style="font-size:12px;color:var(--muted);padding:10px 0">Không có cấu hình thêm — chỉ tính lương theo công × lương ngày.</div>`;
  }

  window.onSalaryTypeChange = function (prefix, type) {
    const target = document.getElementById(prefix + 'SalFields');
    if (target) target.innerHTML = salaryFieldsHTML(type, {}, prefix);
  };

  function collectSalaryConfig(prefix) {
    const type = document.getElementById(prefix + 'SalType').value;
    const cfg = { type };
    if (type === 'commission') {
      cfg.commissionPct = parseFloat(document.getElementById(prefix + 'CommPct').value) || 0;
      cfg.commissionScope = document.getElementById(prefix + 'CommScope').value;
    } else if (type === 'perOrder') {
      cfg.perOrderBonus = parseInt(document.getElementById(prefix + 'PerOrd').value, 10) || 0;
      cfg.perOrderStatus = document.getElementById(prefix + 'PerOrdStatus').value;
    } else if (type === 'kpi') {
      cfg.kpiTarget = parseInt(document.getElementById(prefix + 'KpiTgt').value, 10) || 0;
      cfg.kpiBonus = parseInt(document.getElementById(prefix + 'KpiBon').value, 10) || 0;
    } else if (type === 'custom') {
      cfg.customNote = document.getElementById(prefix + 'CustNote').value;
    }
    return cfg;
  }

  /* === Phân quyền chi tiết: render theo PERM_GROUPS từ auth.js ===
     - Group theo module
     - Sensitive perm (🔒) viền đỏ + tooltip cảnh báo
     - Legacy label cũ ('Báo cáo', 'Đơn hàng'...) auto-tick các perm con tương ứng
     - 'Tất cả' = SUPER ADMIN: tick + khóa hết các ô khác */
  function expandLegacy(current) {
    const out = new Set(current || []);
    const LM = (window.AUTH && window.AUTH.LEGACY_MAP) || {};
    (current || []).forEach(p => {
      const m = LM[p];
      if (m) m.forEach(id => out.add(id));
    });
    return out;
  }

  function permCheckHTML(current) {
    const groups = (window.AUTH && window.AUTH.PERM_GROUPS) || [];
    const set = expandLegacy(current);
    const isAdmin = set.has('all') || set.has('Tất cả');
    return groups.map(g => {
      const items = g.perms.map(p => {
        const checked = isAdmin || set.has(p.id);
        const sens = p.sensitive ? ' perm-sensitive' : '';
        const dis = (isAdmin && p.id !== 'all') ? 'disabled' : '';
        const tip = p.sensitive
          ? 'title="🔒 Nhạy cảm — chỉ cấp cho người tin cậy"'
          : '';
        return `<label class="check-item${sens}" ${tip}>
          <input type="checkbox" class="perm-cb" value="${p.id}" ${checked?'checked':''} ${dis}
                 ${p.id==='all'?'onchange="window.togglePermAll(this)"':''}>
          <span>${p.label}</span>
        </label>`;
      }).join('');
      return `<div class="perm-group">
        <div class="perm-group-h">${g.label}</div>
        <div class="check-grid cols-2">${items}</div>
      </div>`;
    }).join('');
  }

  /* Khi tick 'Super Admin (all)' → tick + disable hết các ô khác */
  window.togglePermAll = function (el) {
    const on = el.checked;
    document.querySelectorAll('.perm-cb').forEach(cb => {
      if (cb.value === 'all') return;
      cb.checked = on; cb.disabled = on;
    });
  };

  window.openStaff = function(id) {
    const s = staffs.find(x => x.id === id);
    if (!s) return;
    const permsHTML = permCheckHTML(s.permissions || []);
    window.openModal('👤 ' + s.name + ' (' + s.code + ')', `
      <div class="form-row">
        <div><label>Họ tên *</label><input id="sName" value="${s.name}"></div>
        <div><label>Phòng ban</label>
          <select id="sDept">
            ${['Ban giám đốc','Kế toán','Marketing','Kho & Ship','Nhân sự','Sale','Thu Mua'].map(d=>`<option ${s.dept===d?'selected':''}>${d}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row">
        <div><label>Vị trí</label><input id="sRole" value="${s.role}"></div>
        <div><label>Trạng thái</label>
          <select id="sStatus">
            <option value="active" ${s.status==='active'?'selected':''}>✓ Đi làm</option>
            <option value="off" ${s.status==='off'?'selected':''}>⏸ Nghỉ</option>
          </select></div>
      </div>
      <div class="form-row">
        <div><label>SĐT</label><input id="sPhone" value="${s.phone}"></div>
        <div><label>Email</label><input id="sEmail" value="${s.email||''}" type="email"></div>
      </div>
      <div class="form-row">
        <div><label>Lương cơ bản (₫)</label><input id="sSalary" type="number" value="${s.salary||0}"></div>
        <div><label>KPI</label><input id="sKpi" value="${s.kpi||''}" placeholder="VD: 90%"></div>
      </div>
      <div class="form-row wide"><label>Địa chỉ</label><input id="sAddress" value="${s.address||''}"></div>

      <div class="section-h" style="margin-top:14px">💰 Cấu hình lương — tùy chỉnh công thức</div>
      ${salaryConfigHTML(s.salaryConfig, 's')}

      <div class="section-h" style="margin-top:14px">🔐 Phân quyền chi tiết (theo tính năng)</div>
      <div style="font-size:11.5px;color:var(--muted);margin-bottom:6px">Tick từng quyền NV được phép thực hiện. Quyền <span style="background:#FEF3C7;color:#DC2626;padding:1px 5px;border-radius:3px;font-weight:600">🔒 nhạy cảm</span> (lương, giá vốn, lợi nhuận) chỉ cấp cho người tin cậy.</div>
      <div id="sPerms" style="max-height:340px;overflow-y:auto;padding:4px 2px">${permsHTML}</div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
               <button class="btn btn-ghost" onclick="window.resetStaffPassword('${id}','${s.email||''}','${s.name}')">🔑 Reset MK</button>
               <button class="btn btn-ghost" onclick="window.toggleStaffStatus('${id}','${s.status}')" style="color:${s.status==='active'?'var(--warn)':'var(--ok)'}">${s.status==='active'?'⏸ Khóa TK':'▶ Mở khóa TK'}</button>
               <button class="btn btn-primary" onclick="window.submitEditStaff('${id}')">💾 Lưu thay đổi</button>`,
      width:'680px'
    });
  };

  /* === Reset mật khẩu === */
  /* === Admin: đặt / reset mật khẩu cho NV (dùng mật khẩu cá nhân hash, KHÔNG cần Supabase Auth) === */
  window.resetStaffPassword = async function(staffId, email, name) {
    const has = window.AUTH && window.AUTH.hasCustomPassword && window.AUTH.hasCustomPassword(staffId);
    const safeName = (name || staffId || '').replace(/['"\\]/g, '');
    window.openModal('🔑 Mật khẩu — ' + (name || staffId), `
      <div style="font-size:13px;margin-bottom:12px">
        Trạng thái: ${has
          ? '<b style="color:var(--navy)">NV đã đặt mật khẩu riêng</b>'
          : '<b style="color:var(--warn)">Đang dùng mật khẩu mặc định <code>Tuantu@2026</code></b>'}
      </div>
      <label style="font-size:12px;font-weight:600;color:var(--navy)">Đặt mật khẩu mới cho NV (tối thiểu 6 ký tự)</label>
      <input id="admNewPw" type="text" placeholder="VD: NSTT2026abc" autocomplete="off"
             style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:7px;font-size:13px;margin-top:6px;box-sizing:border-box">
      <div style="font-size:11.5px;color:var(--muted);margin-top:8px">NV sẽ dùng SĐT/Gmail + mật khẩu này để đăng nhập. Báo lại mật khẩu cho NV.</div>
    `, {
      footer: `
        <button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
        ${has ? `<button class="btn btn-ghost" onclick="window._resetStaffToDefault('${staffId}','${safeName}')">↩ Về mặc định</button>` : ''}
        <button class="btn btn-primary" onclick="window._adminSetStaffPw('${staffId}','${safeName}')">💾 Đặt mật khẩu</button>`,
      width: '460px'
    });
  };
  window._adminSetStaffPw = async function(staffId, name) {
    const pw = (document.getElementById('admNewPw') || {}).value || '';
    if (!pw || pw.length < 6) { window.toast('Mật khẩu tối thiểu 6 ký tự', 'warn'); return; }
    const r = await window.AUTH.setStaffPassword(staffId, pw);
    if (r.success) { window.closeModal(); window.toast('✓ Đã đặt mật khẩu cho ' + (name || staffId) + '. Báo NV đăng nhập bằng: ' + pw, 'success'); }
    else window.toast('❌ ' + (r.error || 'Lỗi'), 'danger');
  };
  window._resetStaffToDefault = function(staffId, name) {
    if (!confirm('Reset mật khẩu của ' + (name || staffId) + ' về mặc định Tuantu@2026?')) return;
    window.AUTH.resetStaffAuth(staffId);
    window.closeModal();
    window.toast('✓ Đã reset về mặc định. NV đăng nhập bằng Tuantu@2026', 'success');
  };

  /* === Toggle khóa/mở tài khoản === */
  window.toggleStaffStatus = function(staffId, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'off' : 'active';
    const verb = newStatus === 'active' ? 'MỞ KHÓA' : 'KHÓA';
    if (!confirm(`${verb} tài khoản này?\n\n${newStatus === 'off' ? 'NV sẽ KHÔNG đăng nhập được nữa cho đến khi mở khóa lại.' : 'NV có thể đăng nhập lại bình thường.'}`)) return;
    window.STORE.update('staff', staffId, { status: newStatus });
    window.closeModal();
    window.toast(`✓ Đã ${verb.toLowerCase()} tài khoản`, newStatus === 'active' ? 'success' : 'warn');
  };

  function collectPerms(rootSel) {
    const all = Array.from(document.querySelectorAll(rootSel + ' input.perm-cb:checked')).map(x => x.value);
    /* Nếu tick 'all' → lưu duy nhất ['all'] (super admin) cho gọn */
    return all.includes('all') ? ['all'] : all;
  }
  window.submitEditStaff = function(id) {
    const perms = collectPerms('#sPerms');
    const salaryConfig = collectSalaryConfig('s');
    window.STORE.update('staff', id, {
      name: window.formVal('#sName'),
      dept: window.formVal('#sDept'),
      role: window.formVal('#sRole'),
      status: window.formVal('#sStatus'),
      phone: window.formVal('#sPhone'),
      email: window.formVal('#sEmail'),
      salary: parseInt(window.formVal('#sSalary'), 10) || 0,
      kpi: window.formVal('#sKpi'),
      address: window.formVal('#sAddress'),
      permissions: perms,
      salaryConfig,
    });
    window.closeModal();
    window.toast('✓ Đã cập nhật NV + công thức lương', 'success');
  };

  /* Build chips phòng ban động từ data thật */
  let _chipsBuilt = false;
  function buildDeptChips(staffs) {
    const box = document.getElementById('staffChips');
    if (!box) return;
    /* đảm bảo bố cục đúng: bọc dòng, có khoảng cách, không chồng */
    box.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 14px';
    const counts = {};
    staffs.forEach(s => { const d = _normDept(s.dept); counts[d] = (counts[d] || 0) + 1; });
    const depts = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    box.innerHTML =
      `<button class="chip ${curDept==='all'?'active':''}" data-q="all">Tất cả <span class="cnt">${staffs.length}</span></button>` +
      depts.map(d => `<button class="chip ${curDept===d?'active':''}" data-q="${(d||'').replace(/"/g,'&quot;')}">${d} <span class="cnt">${counts[d]}</span></button>`).join('');
    box.querySelectorAll('.chip').forEach(c => {
      c.addEventListener('click', () => {
        curDept = c.dataset.q;
        render();
      });
    });
    /* MOBILE: đổ cùng dữ liệu vào dropdown phòng ban (song song với chip) */
    const sel = document.getElementById('staffDeptSelect');
    if (sel) {
      sel.innerHTML =
        `<option value="all">Tất cả phòng ban (${staffs.length})</option>` +
        depts.map(d => `<option value="${(d||'').replace(/"/g,'&quot;')}">${d} (${counts[d]})</option>`).join('');
      sel.value = curDept;
    }
    _chipsBuilt = true;
  }

  /* Lọc phòng ban từ dropdown (mobile) — dùng chung state với chip */
  window.setStaffDept = function (v) {
    curDept = v;
    render();
  };

  /* Lưu / XOÁ tên viết tắt máy chấm công cho 1 NV (sửa inline ở bảng NV). Để trống = xoá. */
  window.stSaveAlias = function (id, val) {
    val = String(val || '').trim();
    if (window.STORE.rmwKv) window.STORE.rmwKv('staffAliases', m => { m = (m && typeof m === 'object' && !Array.isArray(m)) ? m : {}; if (val) m[id] = val; else delete m[id]; return m; });
    else { const m = window.STORE.get('staffAliases', {}) || {}; if (val) m[id] = val; else delete m[id]; window.STORE.set('staffAliases', m); }
    window.toast?.(val ? '✓ Đã lưu tên viết tắt' : '✓ Đã xoá tên viết tắt', 'success');
  };

  window.formNv = function() {
    const nextCode = window.STORE.nextId('staff', 'NV');
    /* Sinh password ngẫu nhiên 8 ký tự */
    const randomPass = 'NSTT' + Math.random().toString(36).slice(2, 8);
    return `
      <div class="form-row">
        <div><label>Mã NV</label><input id="nCode" value="${nextCode}" readonly style="background:#FAFAFB"></div>
        <div><label>Họ tên *</label><input id="nName" placeholder="Nguyễn Văn..."></div>
      </div>
      <div class="form-row">
        <div><label>Phòng ban</label>
          <select id="nDept">
            <option>Ban giám đốc</option><option>Kế toán</option><option>Marketing</option>
            <option>Kho &amp; Ship</option><option>Nhân sự</option><option>Sale</option><option>Thu Mua</option>
          </select></div>
        <div><label>Vị trí</label><input id="nRole" placeholder="VD: Nhân viên sales"></div>
      </div>
      <div class="form-row wide">
        <label>Tên viết tắt (máy chấm công) <span style="color:var(--muted);font-weight:400;font-size:11px">— tên NV hiển thị trong máy vân tay, để khớp khi up file chấm công</span></label>
        <input id="nAlias" placeholder="VD: quang kho, thế trung, chị bích...">
      </div>
      <div class="form-row">
        <div><label>SĐT *</label><input id="nPhone" placeholder="0912 xxx xxx"></div>
        <div><label>Vào làm</label><input id="nJoin" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="form-row">
        <div><label>Lương cơ bản (₫)</label><input id="nSalary" type="number" placeholder="10000000"></div>
        <div><label>Địa chỉ</label><input id="nAddress" placeholder="Quận, TP"></div>
      </div>

      <div class="section-h" style="margin-top:18px;color:var(--red);border-bottom-color:var(--red)">
        🔐 Tài khoản đăng nhập app
      </div>
      <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:10px 14px;font-size:12px;color:var(--warn);margin-bottom:12px">
        Tick <b>"Tạo tài khoản"</b> để NV này có thể login app. Bạn cấp email + mật khẩu — NV nhận thông tin và đổi mật khẩu sau khi login lần đầu.
      </div>
      <div class="form-row wide">
        <label class="check-item" style="font-weight:600">
          <input type="checkbox" id="nCreateAuth" checked onchange="document.getElementById('authFields').style.display=this.checked?'':'none'">
          <span>✅ Tạo tài khoản đăng nhập cho NV này</span>
        </label>
      </div>
      <div id="authFields">
        <div class="form-row">
          <div><label>Email đăng nhập *</label><input id="nEmail" type="email" placeholder="ten.nhanvien@nongsantuantu.com"></div>
          <div>
            <label>Mật khẩu cấp *</label>
            <div class="input-with-help">
              <input id="nPassword" type="text" value="${randomPass}" placeholder="Tối thiểu 6 ký tự">
              <button class="help-btn" type="button" onclick="document.getElementById('nPassword').value='NSTT'+Math.random().toString(36).slice(2,8)" title="Sinh lại pass">🎲</button>
            </div>
          </div>
        </div>
        <div class="form-row wide">
          <label>Tên đăng nhập (tuỳ chọn)</label>
          <input id="nUsername" placeholder="VD: quang.tx — NV có thể đăng nhập bằng Email / SĐT / username">
        </div>
      </div>

      <div class="section-h" style="margin-top:18px">🔐 Phân quyền chi tiết (theo tính năng)</div>
      <div style="font-size:11.5px;color:var(--muted);margin-bottom:6px">Tick từng quyền NV được phép thực hiện. Quyền <span style="background:#FEF3C7;color:#DC2626;padding:1px 5px;border-radius:3px;font-weight:600">🔒 nhạy cảm</span> (lương, giá vốn, lợi nhuận) chỉ cấp cho người tin cậy.</div>
      <div id="nPerms" style="max-height:340px;overflow-y:auto;padding:4px 2px">${permCheckHTML([])}</div>
    `;
  };
  window.footNv = function() {
    return `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
            <button class="btn btn-primary" onclick="window.submitAddStaff()">💾 Lưu NV + Tạo tài khoản</button>`;
  };
  window.submitAddStaff = async function() {
    const name = window.formVal('#nName');
    const phone = window.formVal('#nPhone');
    if (!name) { window.toast('Nhập tên NV', 'warn'); return; }
    if (!phone) { window.toast('Nhập SĐT', 'warn'); return; }

    const createAuth = document.getElementById('nCreateAuth').checked;
    const email = window.formVal('#nEmail');
    const password = window.formVal('#nPassword');

    if (createAuth) {
      if (!email) { window.toast('Nhập email đăng nhập', 'warn'); return; }
      if (!password || password.length < 6) { window.toast('Mật khẩu tối thiểu 6 ký tự', 'warn'); return; }
    }

    const perms = collectPerms('#nPerms');
    const code = window.formVal('#nCode');
    const newNV = {
      id: code,
      code: code,
      name, phone,
      role: window.formVal('#nRole') || 'Nhân viên',
      dept: window.formVal('#nDept'),
      email: createAuth ? email : '',
      avatar: window.initials(name),
      permissions: perms,
      salary: parseInt(window.formVal('#nSalary'), 10) || 0,
      kpi: null, status: 'active',
      joinDate: new Date(window.formVal('#nJoin')).toLocaleDateString('vi-VN'),
      address: window.formVal('#nAddress') || '',
    };

    /* Tạo staff record */
    window.STORE.add('staff', newNV);
    /* Tên viết tắt máy chấm công (nếu nhập) → staffAliases để khớp file chấm công về sau */
    const _alias = window.formVal('#nAlias');
    if (_alias && _alias.trim() && window.STORE.rmwKv) window.STORE.rmwKv('staffAliases', m => { m = (m && typeof m === 'object' && !Array.isArray(m)) ? m : {}; m[code] = _alias.trim(); return m; });

    /* Đặt MẬT KHẨU đăng nhập = hash 'staffAuth' (cái mà staffLogin THỰC SỰ kiểm) →
       NV login được NGAY bằng SĐT/Email + mật khẩu này, không phụ thuộc Supabase Auth.
       Supabase Auth (nếu có cấu hình) chỉ là phụ — lỗi KHÔNG chặn việc tạo NV. */
    if (createAuth) {
      const btn = document.querySelector('.modal-foot .btn-primary');
      if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Đang tạo tài khoản...'; }
      if (window.AUTH?.setStaffPassword) {
        try { await window.AUTH.setStaffPassword(code, password); } catch (e) { console.warn('[addStaff setPwd]', e); }
      }
      const uname = window.formVal('#nUsername');
      if (uname && window.AUTH?.setStaffUsername) {
        const ru = await window.AUTH.setStaffUsername(code, uname);
        if (!ru.success) window.toast('⚠ Username: ' + ru.error, 'warn');
      }
      if (window.AUTH?.signUp) { try { await window.AUTH.signUp(email, password, code); } catch (e) { /* phụ, bỏ qua */ } }
    }

    window.closeModal();

    /* Hiển thị popup thông tin để admin gửi cho NV */
    if (createAuth) {
      setTimeout(() => {
        window.openModal('🎉 Đã tạo tài khoản cho ' + name, `
          <div style="text-align:center;padding:10px 0 20px">
            <div style="font-size:48px;margin-bottom:8px">✅</div>
            <div style="font-size:16px;color:var(--ok);font-weight:700">NV đã sẵn sàng login app</div>
          </div>
          <div style="background:#FAFAFB;border:1px solid var(--line);border-radius:10px;padding:16px">
            <div style="font-size:11.5px;color:var(--muted);text-transform:uppercase;font-weight:700;margin-bottom:8px">📤 Gửi thông tin này cho NV:</div>
            <div style="font-family:ui-monospace,monospace;font-size:13.5px;line-height:1.8">
              🌐 URL app:   <b style="color:var(--navy)">${location.host}</b><br>
              📧 Email:     <b style="color:var(--navy)">${email}</b><br>
              🔑 Mật khẩu:  <b style="color:var(--red);background:#FEF3C7;padding:1px 8px;border-radius:4px">${password}</b><br>
              👤 Vai trò:   <b style="color:var(--navy)">${newNV.role}</b><br>
              🔓 Quyền:     <b>${perms.length} module</b>
            </div>
          </div>
          <div style="margin-top:14px;padding:10px 12px;background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;font-size:12px;color:var(--warn)">
            💡 Khuyến nghị: NV đổi mật khẩu ở lần login đầu tiên (Settings → Bảo mật).
          </div>
        `, {
          footer: `<button class="btn btn-ghost" onclick="window.copyAuthInfo('${email}','${password}','${name}')">📋 Copy thông tin</button>
                   <button class="btn btn-navy" onclick="window.sendAuthZalo('${phone}','${email}','${password}')">💬 Gửi Zalo</button>
                   <button class="btn btn-primary" onclick="closeModal()">Đã hiểu</button>`,
          width:'520px'
        });
      }, 300);
    } else {
      window.toast('✓ Đã thêm NV ' + name + ' (không có tài khoản login)', 'success');
    }
  };

  /* Helpers cho popup tạo tài khoản */
  window.copyAuthInfo = function(email, pass, name) {
    const text = `Nông Sản Tuấn Tú Hà Nội — Thông tin đăng nhập của ${name}\n\n🌐 URL: https://app.nongsantuantuhanoi.vn\n📧 Email: ${email}\n🔑 Mật khẩu: ${pass}\n\nVui lòng đổi mật khẩu sau khi login lần đầu.`;
    navigator.clipboard.writeText(text).then(() => window.toast('✓ Đã copy vào clipboard', 'success'));
  };
  window.sendAuthZalo = function(phone, email, pass) {
    const cleanPhone = phone.replace(/\s/g, '');
    window.open('https://zalo.me/' + cleanPhone, '_blank');
    window.toast('Đã mở Zalo NV — copy thông tin từ nút bên trái để gửi', 'info');
  };

  /* ============================================================
     NHẬP EXCEL HÀNG LOẠT — kèm download template + hướng dẫn
     ============================================================ */
  const TEMPLATE_HEADERS = ['Mã NV','Họ tên *','Phòng ban','Vị trí','SĐT *','Email','Lương cơ bản (₫)','Vào làm (dd/mm/yyyy)','Địa chỉ','Quyền (cách nhau dấu ;)'];
  const TEMPLATE_SAMPLES = [
    ['NV010','Nguyễn Văn Demo','Sales','Nhân viên Sales','0912345678','demo@nongsantuantu.com','10000000','01/06/2026','Hà Nội','Dashboard;Khách hàng;Đơn hàng;Báo cáo'],
    ['NV011','Trần Thị Demo','CSKH','NV CSKH','0987654321','cskh2@nongsantuantu.com','9000000','15/06/2026','Hà Nội','Dashboard;Khách hàng;Đơn hàng'],
    ['','Lê Văn Demo (mã trống = auto gen)','Vận hành','Tài xế','0901111111','','9500000','','Hà Nội','Đơn hàng;Shipper'],
  ];

  window.downloadStaffTemplate = function () {
    if (!window.XLSX) { window.toast('SheetJS chưa load — reload trang', 'warn'); return; }
    const ws_data = [
      TEMPLATE_HEADERS,
      ...TEMPLATE_SAMPLES,
    ];
    const ws = window.XLSX.utils.aoa_to_sheet(ws_data);
    /* Column widths */
    ws['!cols'] = [{wch:8},{wch:25},{wch:14},{wch:22},{wch:14},{wch:25},{wch:14},{wch:14},{wch:22},{wch:40}];
    /* Bold header row */
    for (let i = 0; i < TEMPLATE_HEADERS.length; i++) {
      const cell = ws[window.XLSX.utils.encode_cell({r:0,c:i})];
      if (cell) cell.s = { font: { bold: true } };
    }
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Nhân viên');
    /* Tạo sheet "Hướng dẫn" */
    const guide = window.XLSX.utils.aoa_to_sheet([
      ['HƯỚNG DẪN NHẬP DANH SÁCH NHÂN VIÊN'],
      [''],
      ['1. Cột "Mã NV": Để trống → app tự sinh (NV001, NV002...). Nếu nhập, phải duy nhất.'],
      ['2. Cột "Họ tên *" và "SĐT *": BẮT BUỘC. Thiếu sẽ bị bỏ qua.'],
      ['3. Cột "Phòng ban": Ban giám đốc / Kế toán / Marketing / Kho & Ship / Nhân sự / Sale / Thu Mua.'],
      ['4. Cột "Lương cơ bản": Số nguyên VNĐ (vd: 10000000 = 10 triệu).'],
      ['5. Cột "Vào làm": Định dạng dd/mm/yyyy (vd: 01/06/2026).'],
      ['6. Cột "Quyền": Danh sách quyền cách nhau dấu chấm phẩy ;'],
      ['   Các quyền hợp lệ:'],
      ['     - Tất cả (Super Admin)'],
      ['     - Dashboard, Đơn hàng, Khách hàng, Sản phẩm, Shipper'],
      ['     - Kế toán, Công nợ, Hóa đơn, Quảng cáo'],
      ['     - Nhân viên, Lương, Báo cáo'],
      ['     - Perm chi tiết: reports.profit, payroll.viewAll, products.editCost...'],
      [''],
      ['7. Mã NV đã tồn tại → app sẽ CẬP NHẬT (giữ data cũ + ghi đè field có giá trị mới).'],
      ['8. Mã NV mới hoàn toàn → app sẽ THÊM mới.'],
      [''],
      ['SAU KHI ĐIỀN XONG, LƯU FILE VÀ UPLOAD LẠI QUA NÚT "📥 NHẬP EXCEL".'],
    ]);
    guide['!cols'] = [{wch:90}];
    window.XLSX.utils.book_append_sheet(wb, guide, 'Hướng dẫn');
    window.XLSX.writeFile(wb, 'mau-nhap-nhan-vien-NSTT.xlsx');
    window.toast('⬇ Đã tải file mẫu — điền xong upload lại', 'success');
  };

  window.openImportStaffExcel = function () {
    window.openModal('📥 Nhập danh sách nhân viên từ Excel', `
      <div style="font-size:13px;line-height:1.6;margin-bottom:14px">
        Upload file <code style="background:#FAFAFB;padding:1px 6px;border-radius:3px">.xlsx</code> /
        <code style="background:#FAFAFB;padding:1px 6px;border-radius:3px">.xls</code> /
        <code style="background:#FAFAFB;padding:1px 6px;border-radius:3px">.csv</code> theo mẫu.
        Sheet đầu tiên sẽ được đọc.
      </div>

      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:12px 14px;margin-bottom:14px">
        <div style="font-weight:700;font-size:13px;color:#15803D;margin-bottom:6px">📋 Bước 1: Tải file mẫu</div>
        <div style="font-size:12.5px;color:var(--muted);margin-bottom:8px">File mẫu có sẵn header + 3 dòng demo + 1 sheet "Hướng dẫn" chi tiết.</div>
        <button class="btn btn-navy btn-sm" onclick="window.downloadStaffTemplate()">⬇ Tải mau-nhap-nhan-vien-NSTT.xlsx</button>
      </div>

      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:12px 14px;margin-bottom:14px">
        <div style="font-weight:700;font-size:13px;color:#A16207;margin-bottom:6px">📤 Bước 2: Upload file đã điền</div>
        <input type="file" id="impStaffFile" accept=".xlsx,.xls,.csv" style="display:block;width:100%;padding:8px;border:1px solid var(--line);border-radius:7px;font-size:13px;background:#fff">
      </div>

      <div id="impStaffPreview" style="font-size:12.5px;min-height:30px"></div>

      <div style="font-size:11.5px;color:var(--muted);margin-top:10px;padding:8px 10px;background:#FAFAFB;border-radius:6px">
        💡 <b>Lưu ý:</b><br>
        • <b>Họ tên</b> + <b>SĐT</b>: bắt buộc — thiếu sẽ bỏ qua<br>
        • Mã NV đã tồn tại → <b>cập nhật</b> field có giá trị mới<br>
        • Mã NV mới hoàn toàn → <b>thêm mới</b><br>
        • Cột Quyền: phân cách bằng dấu chấm phẩy <code>;</code> (vd: "Dashboard;Khách hàng;Báo cáo")
      </div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
               <button class="btn btn-primary" id="impStaffApply" onclick="window.applyImportStaff()" disabled>📥 Nhập danh sách</button>`,
      width: '620px',
    });
    document.getElementById('impStaffFile').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!window.XLSX) {
        document.getElementById('impStaffPreview').innerHTML = '<div style="color:var(--danger)">❌ SheetJS chưa load — reload trang</div>';
        return;
      }
      try {
        const buf = await f.arrayBuffer();
        const wb = window.XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        window._impStaffData = data;
        const preview = data.slice(0, 6).map(r => '<tr>' + r.slice(0, 6).map(c => `<td style="padding:4px 8px;border:1px solid var(--line);font-size:11.5px">${String(c || '').slice(0, 30)}</td>`).join('') + '</tr>').join('');
        document.getElementById('impStaffPreview').innerHTML = `
          <div style="font-weight:700;color:var(--ok);margin-bottom:6px">✓ Đọc được ${data.length} dòng (${(data[0]||[]).length} cột)</div>
          <div style="overflow:auto;max-height:200px;border:1px solid var(--line);border-radius:6px">
            <table style="width:100%;border-collapse:collapse;font-family:ui-monospace,monospace">${preview}</table>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:6px">Preview 6 dòng đầu, 6 cột đầu. Toàn bộ sẽ được import.</div>`;
        document.getElementById('impStaffApply').disabled = false;
      } catch (err) {
        document.getElementById('impStaffPreview').innerHTML = '<div style="color:var(--danger)">❌ Lỗi đọc file: ' + err.message + '</div>';
      }
    });
  };

  window.applyImportStaff = function () {
    const data = window._impStaffData;
    if (!data || data.length < 2) { window.toast('File rỗng hoặc thiếu dữ liệu', 'warn'); return; }
    const header = data[0].map(h => String(h || '').toLowerCase().trim());
    const ix = (keys) => header.findIndex(h => keys.some(k => h.includes(k)));
    const C = {
      code: ix(['mã nv','mã','code']),
      name: ix(['họ tên','tên','name']),
      dept: ix(['phòng ban','dept']),
      role: ix(['vị trí','chức','role']),
      phone: ix(['sđt','phone','điện thoại']),
      email: ix(['email']),
      salary: ix(['lương']),
      joinDate: ix(['vào làm','join','ngày bắt đầu']),
      address: ix(['địa chỉ','address']),
      perms: ix(['quyền','perm']),
    };
    if (C.name < 0) { window.toast('CSV phải có cột "Họ tên"', 'danger'); return; }

    const all = window.STORE.get('staff', window.STAFFS || []).slice();
    const nextCode = () => {
      let max = 0;
      all.forEach(s => { const n = parseInt((s.code || s.id || '').replace(/\D/g, ''), 10); if (n > max) max = n; });
      return 'NV' + String(max + 1).padStart(3, '0');
    };

    let added = 0, updated = 0, skipped = 0;
    for (let r = 1; r < data.length; r++) {
      const row = data[r]; if (!row || !row.length) continue;
      const name = String(row[C.name] || '').trim();
      const phone = C.phone >= 0 ? String(row[C.phone] || '').trim() : '';
      if (!name || !phone) { skipped++; continue; }
      const code = (C.code >= 0 && String(row[C.code] || '').trim()) || nextCode();
      const existing = all.find(s => s.code === code || s.id === code);
      const permStr = C.perms >= 0 ? String(row[C.perms] || '').trim() : '';
      const perms = permStr ? permStr.split(/[;,]/).map(p => p.trim()).filter(Boolean) : (existing?.permissions || []);
      const data_ = {
        id: code, code, name, phone,
        dept: C.dept >= 0 ? (String(row[C.dept] || '').trim() || existing?.dept || 'Vận hành') : (existing?.dept || 'Vận hành'),
        role: C.role >= 0 ? (String(row[C.role] || '').trim() || existing?.role || 'Nhân viên') : (existing?.role || 'Nhân viên'),
        email: C.email >= 0 ? (String(row[C.email] || '').trim() || existing?.email || '') : (existing?.email || ''),
        salary: C.salary >= 0 ? (parseInt(String(row[C.salary]).replace(/\D/g, ''), 10) || existing?.salary || 0) : (existing?.salary || 0),
        joinDate: C.joinDate >= 0 ? (String(row[C.joinDate] || '').trim() || existing?.joinDate || new Date().toLocaleDateString('vi-VN')) : (existing?.joinDate || new Date().toLocaleDateString('vi-VN')),
        address: C.address >= 0 ? (String(row[C.address] || '').trim() || existing?.address || '') : (existing?.address || ''),
        avatar: existing?.avatar || window.initials(name),
        permissions: perms,
        status: existing?.status || 'active',
        kpi: existing?.kpi || null,
      };
      if (existing) { Object.assign(existing, data_); updated++; }
      else { all.push(data_); added++; }
    }
    window.STORE.set('staff', all);
    staffs = window.STORE.get('staff');
    window.closeModal();
    window.toast(`✓ Nhập thành công: ${added} NV mới · ${updated} cập nhật · ${skipped} bỏ qua`, 'success');
  };

  /* ============================================================
     AI: THÊM NV TỪ ẢNH (danh thiếp / list NV chụp ảnh)
     ============================================================ */
  window.aiAddStaff = function () {
    if (!window.AI) { window.toast('Chưa tải module AI', 'warn'); return; }
    window.AI.openFillModal({
      task: 'customer',
      title: '📷 Thêm nhân viên từ ảnh (AI)',
      guideHtml: 'Đính kèm <b>ảnh danh thiếp</b> hoặc <b>ảnh chụp danh sách NV</b> (giấy/Excel). AI đọc tên, SĐT, email, chức danh, phòng ban → mở form điền sẵn.<br><b>Cấu trúc gợi ý:</b> Tên · SĐT · Email · Chức vụ · Phòng ban.',
      prompt: 'Đọc ảnh chứa thông tin nhân viên (tiếng Việt, có thể nhiều NV trong 1 ảnh). Trả JSON: {"staffs":[{"name":"","phone":"","email":"","role":"chức danh","dept":"Sales/CSKH/Kế toán/Vận hành/Ban giám đốc","address":""}]}. Nếu chỉ 1 NV thì array có 1 phần tử. Field thiếu để rỗng. CHỈ trả JSON.',
      onResult: applyAIStaffs,
    });
  };

  function applyAIStaffs(d) {
    const arr = (d && d.staffs) || (d && d.name ? [d] : []);
    if (!arr.length) { window.toast('AI không đọc được NV nào', 'warn'); return; }
    if (arr.length === 1) {
      /* 1 NV → mở form đã điền */
      const s = arr[0];
      window.openModal('+ Thêm nhân viên (AI parsed)', window.formNv(), { footer: window.footNv(), width: '560px' });
      setTimeout(() => {
        const setVal = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };
        setVal('nName', s.name);
        setVal('nPhone', s.phone);
        setVal('nEmail', s.email);
        setVal('nRole', s.role);
        setVal('nAddress', s.address);
        const deptSel = document.getElementById('nDept');
        if (deptSel && s.dept) {
          for (const opt of deptSel.options) if (opt.value.toLowerCase().includes(s.dept.toLowerCase().slice(0, 4))) { deptSel.value = opt.value; break; }
        }
        window.toast('✓ AI đã điền — kiểm tra rồi lưu', 'success');
      }, 200);
    } else {
      /* Nhiều NV → import hàng loạt confirm */
      const list = arr.map((s, i) => `<tr>
        <td style="padding:6px 10px;border:1px solid var(--line)">${i + 1}</td>
        <td style="padding:6px 10px;border:1px solid var(--line)"><b>${s.name || ''}</b></td>
        <td style="padding:6px 10px;border:1px solid var(--line)">${s.phone || ''}</td>
        <td style="padding:6px 10px;border:1px solid var(--line)">${s.dept || '—'}</td>
        <td style="padding:6px 10px;border:1px solid var(--line)">${s.role || '—'}</td>
      </tr>`).join('');
      window._aiStaffsBatch = arr;
      window.openModal(`📷 AI đọc được ${arr.length} nhân viên`, `
        <div style="font-size:13px;color:var(--muted);margin-bottom:10px">Kiểm tra danh sách → bấm Thêm để import toàn bộ.</div>
        <div style="max-height:340px;overflow-y:auto;border:1px solid var(--line);border-radius:7px">
          <table style="width:100%;border-collapse:collapse;font-size:12.5px">
            <thead><tr style="background:#FAFAFB;font-weight:700"><th style="padding:8px 10px;text-align:left">#</th><th style="padding:8px 10px;text-align:left">Tên</th><th style="padding:8px 10px;text-align:left">SĐT</th><th style="padding:8px 10px;text-align:left">Phòng</th><th style="padding:8px 10px;text-align:left">Vị trí</th></tr></thead>
            <tbody>${list}</tbody>
          </table>
        </div>
      `, {
        footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
                 <button class="btn btn-primary" onclick="window.confirmAIStaffsBatch()">➕ Thêm ${arr.length} NV</button>`,
        width: '720px',
      });
    }
  }

  window.confirmAIStaffsBatch = function () {
    const arr = window._aiStaffsBatch || [];
    const all = window.STORE.get('staff', window.STAFFS || []).slice();
    const nextCode = () => {
      let max = 0;
      all.forEach(s => { const n = parseInt((s.code || s.id || '').replace(/\D/g, ''), 10); if (n > max) max = n; });
      return 'NV' + String(max + 1).padStart(3, '0');
    };
    let added = 0;
    arr.forEach(s => {
      if (!s.name || !s.phone) return;
      const code = nextCode();
      all.push({
        id: code, code, name: s.name, phone: s.phone,
        email: s.email || '', role: s.role || 'Nhân viên',
        dept: s.dept || 'Vận hành', address: s.address || '',
        avatar: window.initials(s.name),
        permissions: ['Dashboard'],
        salary: 0, kpi: null, status: 'active',
        joinDate: new Date().toLocaleDateString('vi-VN'),
      });
      added++;
    });
    window.STORE.set('staff', all);
    staffs = window.STORE.get('staff');
    window.closeModal();
    window.toast(`✓ Đã thêm ${added} NV từ ảnh AI`, 'success');
  };

  /* ===== Xuất danh sách TẤT CẢ tài khoản đăng nhập (admin + sếp + CEO/CFO + NV) ===== */
  window.exportAllUsers = function () {
    const staff = window.STORE.get('staff', window.STAFFS || []) || [];
    const A = window.AUTH || {};
    const fixed = A.fixedAccounts ? A.fixedAccounts() : [];
    const esc = v => String(v == null ? '' : v).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    const pwOf = s => s.pwd || (A.staffDefaultPassword ? A.staffDefaultPassword(s.role, s.dept) : 'Tuantu@2026');
    const permsOf = s => { const p = A.presetPerms ? A.presetPerms(s.role, s.dept) : []; return p.includes('all') ? 'Toàn quyền' : p.join(', '); };
    const today = (window.todayDate ? window.todayDate() : new Date());
    const dstr = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()}`;

    const fixedRows = fixed.map(u => `<tr class="lead"><td>—</td><td><b>${esc(u.name)}</b></td><td>${esc(u.role)}</td><td>${esc(u.dept)}</td><td><code>${esc(u.email)}</code></td><td><code>${esc(u.password)}</code></td><td>${(u.permissions || []).includes('all') ? 'Toàn quyền' : esc((u.permissions || []).join(', '))}</td></tr>`).join('');
    const staffRows = staff.map(s => `<tr><td>${esc(s.code || s.id || '')}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.role || '')}</td><td>${esc(s.dept || '')}</td><td><code>${esc((s.phone || '').replace(/\s/g, ''))}</code></td><td><code>${esc(pwOf(s))}</code></td><td class="pm">${esc(permsOf(s))}</td></tr>`).join('') || `<tr><td colspan="7" style="text-align:center;color:#888;padding:20px">Chưa có nhân viên trong hệ thống.</td></tr>`;

    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Danh sách tài khoản đăng nhập — Nông Sản Tuấn Tú Hà Nội</title>
<style>*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',system-ui,Arial,sans-serif}body{background:#F7FAF7;color:#1F2937;padding:24px}
h1{color:#1B5E20;font-size:22px}.sub{color:#6B7280;font-size:13px;margin:4px 0 16px}
h2{color:#1B5E20;font-size:16px;margin:22px 0 8px}
table{width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)}
th,td{border:1px solid #E5E7EB;padding:7px 9px;text-align:left;vertical-align:top}
th{background:#1B5E20;color:#fff;font-size:11px;text-transform:uppercase}
tr:nth-child(even) td{background:#FAFBFA}
tr.lead td{background:#FEF9E7}
code{background:#EEF2EE;padding:1px 6px;border-radius:4px;font-family:ui-monospace,monospace;font-weight:700;color:#15803D}
.pm{font-size:10.5px;color:#6B7280;max-width:340px}
.note{background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:11px 14px;font-size:12.5px;color:#854D0E;margin:16px 0;line-height:1.6}
@media print{th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
<h1>🔑 Danh sách tài khoản đăng nhập</h1>
<div class="sub">Nông Sản Tuấn Tú Hà Nội · xuất ngày ${dstr} · ${fixed.length} tài khoản quản trị + ${staff.length} nhân viên</div>
<div class="note">🔒 <b>TÀI LIỆU MẬT</b> — chỉ chia sẻ nội bộ. Admin/CEO/CFO đăng nhập bằng <b>email</b>; nhân viên đăng nhập bằng <b>số điện thoại</b>. Mỗi người nên đổi mật khẩu sau lần đăng nhập đầu (Cài đặt → Tài khoản).</div>
<h2>① Quản trị (Admin · CEO · CFO) — đăng nhập bằng email</h2>
<table><thead><tr><th>Mã</th><th>Họ tên</th><th>Vị trí</th><th>Phòng ban</th><th>Tài khoản</th><th>Mật khẩu</th><th>Quyền</th></tr></thead><tbody>${fixedRows}</tbody></table>
<h2>② Nhân viên — đăng nhập bằng số điện thoại</h2>
<table><thead><tr><th>Mã NV</th><th>Họ tên</th><th>Vị trí</th><th>Phòng ban</th><th>Tài khoản (SĐT)</th><th>Mật khẩu</th><th>Quyền (theo vị trí)</th></tr></thead><tbody>${staffRows}</tbody></table>
<div class="note" style="margin-top:18px">💡 Quyền được gán <b>tự động theo vị trí</b>. Nếu một nhân viên cần quyền khác, chỉnh trong module Nhân sự hoặc báo IT cập nhật. In: Ctrl/Cmd + P.</div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tai-khoan-dang-nhap-NSTT.html';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    window.toast(`✓ Đã xuất ${fixed.length} TK quản trị + ${staff.length} NV`, 'success');
  };

  window.STORE.subscribe('staff', render);
  window.renderAppShell('staff', 'Nhân viên');
  ['qSearch','fStatus'].forEach(id => document.getElementById(id)?.addEventListener('input', render));
  render();
})();
