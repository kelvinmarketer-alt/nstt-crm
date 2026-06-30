/* =========================================================
   Nông Sản Tuấn Tú — TRANG QUẢN LÝ TÀI KHOẢN ĐĂNG NHẬP
   Liệt kê toàn bộ NV: đăng nhập bằng Email / SĐT / Username + mật khẩu.
   Đặt/reset mật khẩu, đặt username, khóa/mở tài khoản, reset hàng loạt.
   Dùng lại API trong auth.js (staffAuth hash + staffUsernames KV).
   ========================================================= */
(function () {
  const S = () => window.STORE;
  function staffList() { return (S().get('staff', window.STAFFS || []) || []).slice(); }
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const norm = s => (s || '').toString().replace(/\s+/g, '').toLowerCase();

  function init() {
    if (window.renderAppShell) window.renderAppShell('tai-khoan', 'Tài khoản đăng nhập');
    /* dropdown phòng ban */
    const depts = [...new Set(staffList().map(s => s.dept).filter(Boolean))];
    const sel = document.getElementById('akDept');
    if (sel) depts.forEach(d => { const o = document.createElement('option'); o.value = d; o.textContent = d; sel.appendChild(o); });
    window.akRender();
    /* cập nhật khi staff đổi (đa máy) */
    if (S().subscribe) S().subscribe('staff', () => window.akRender());
  }

  window.akRender = function () {
    const all = staffList();
    const q = norm(document.getElementById('akSearch') && document.getElementById('akSearch').value);
    const fd = (document.getElementById('akDept') || {}).value || '';
    const fs = (document.getElementById('akStatus') || {}).value || '';
    const A = window.AUTH || {};
    const rows = all.filter(s => {
      if (fd && s.dept !== fd) return false;
      const locked = (s.status === 'off' || s.status === 'inactive' || s.status === 'nghỉ');
      if (fs === 'active' && locked) return false;
      if (fs === 'off' && !locked) return false;
      if (q) {
        const un = A.getStaffUsername ? A.getStaffUsername(s.id || s.code) : '';
        const hay = norm([s.name, s.id, s.code, s.email, s.phone, un].join(' '));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const tb = document.getElementById('akTbody');
    if (!rows.length) { tb.innerHTML = '<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--muted)">Không có nhân viên nào khớp.</td></tr>'; }
    else tb.innerHTML = rows.map(s => {
      const sid = s.id || s.code;
      const locked = (s.status === 'off' || s.status === 'inactive' || s.status === 'nghỉ');
      const hasPw = A.hasCustomPassword && A.hasCustomPassword(sid);
      const uname = A.getStaffUsername ? A.getStaffUsername(sid) : '';
      const col = window.avatarColor ? window.avatarColor(sid) : '#1B5E20';
      const logins = [
        s.email ? `📧 ${esc(s.email)}` : '',
        s.phone ? `📱 ${esc(s.phone)}` : '',
        uname ? `👤 <b>${esc(uname)}</b>` : '<span style="color:#B45309">+ thêm username</span>',
      ].filter(Boolean).join('<br>');
      return `<tr>
        <td data-field="cb"><input type="checkbox" class="ak-cb" data-id="${esc(sid)}"></td>
        <td data-field="name"><div style="display:flex;align-items:center;gap:9px">
          <div class="cust-ava" style="background:${col};flex:none">${esc(window.initials ? window.initials(s.name) : '?')}</div>
          <div><div style="font-weight:600">${esc(s.name)}</div><div class="id-mono">${esc(sid)}</div></div>
        </div></td>
        <td data-field="logins" style="font-size:12px;line-height:1.7">${logins}</td>
        <td data-field="role" style="font-size:12px">${esc(s.role || '')}<div style="color:var(--muted)">${esc(s.dept || '')}</div></td>
        <td data-field="pw">${hasPw ? '<span class="pill pill-cust">Đã đặt riêng</span>' : '<span class="pill pill-def">Mặc định</span>'}</td>
        <td data-field="status">${locked ? '<span class="pill pill-off">🔒 Đã khóa</span>' : '<span class="pill pill-on">✓ Hoạt động</span>'}</td>
        <td data-field="act" class="acc-act" style="white-space:nowrap">
          <button onclick="window.akSetPw('${esc(sid)}')" title="Đặt / đổi mật khẩu">🔑 Mật khẩu</button>
          <button onclick="window.akSetUser('${esc(sid)}')" title="Đặt tên đăng nhập">👤 Username</button>
          <button onclick="window.akToggleLock('${esc(sid)}')" title="${locked ? 'Mở khóa' : 'Khóa'} tài khoản">${locked ? '▶ Mở' : '⏸ Khóa'}</button>
        </td>
      </tr>`;
    }).join('');
    const sum = document.getElementById('akSummary');
    if (sum) {
      const locked = all.filter(s => s.status === 'off' || s.status === 'inactive').length;
      sum.innerHTML = `<b>${all.length}</b> tài khoản · ${all.length - locked} hoạt động · ${locked} khóa`;
    }
  };

  window.akToggleAll = function (on) { document.querySelectorAll('.ak-cb').forEach(cb => cb.checked = on); };

  /* === Đặt / đổi mật khẩu === */
  window.akSetPw = function (sid) {
    const s = staffList().find(x => (x.id || x.code) === sid) || {};
    const A = window.AUTH || {};
    const has = A.hasCustomPassword && A.hasCustomPassword(sid);
    window.openModal('🔑 Mật khẩu — ' + (s.name || sid), `
      <div style="font-size:13px;margin-bottom:12px">Trạng thái: ${has ? '<b style="color:var(--navy)">Đã đặt mật khẩu riêng</b>' : '<b style="color:#92400E">Đang dùng mặc định <code>Tuantu@2026</code></b>'}</div>
      <label style="font-size:12px;font-weight:600;color:var(--navy)">Mật khẩu mới (≥ 6 ký tự)</label>
      <div style="display:flex;gap:6px;margin-top:6px">
        <input id="akPw" type="text" value="NSTT${Math.random().toString(36).slice(2, 8)}" style="flex:1;padding:9px 11px;border:1px solid var(--line);border-radius:7px;font-size:13px">
        <button class="btn btn-ghost" onclick="document.getElementById('akPw').value='NSTT'+Math.random().toString(36).slice(2,8)">🎲</button>
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:8px">Báo lại mật khẩu này cho NV. NV đăng nhập bằng Email/SĐT/Username + mật khẩu.</div>`, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
        ${has ? `<button class="btn btn-ghost" onclick="window.akResetDefault('${sid}')">↩ Về mặc định</button>` : ''}
        <button class="btn btn-primary" onclick="window.akSavePw('${sid}')">💾 Lưu mật khẩu</button>`,
      width: '440px',
    });
  };
  window.akSavePw = async function (sid) {
    const pw = (document.getElementById('akPw') || {}).value || '';
    if (pw.length < 6) { window.toast('Mật khẩu tối thiểu 6 ký tự', 'warn'); return; }
    const r = await window.AUTH.setStaffPassword(sid, pw);
    if (r.success) { window.closeModal(); window.akRender(); window.toast('✓ Đã đặt mật khẩu. NV đăng nhập bằng: ' + pw, 'success'); }
    else window.toast('❌ ' + (r.error || 'Lỗi'), 'danger');
  };
  window.akResetDefault = async function (sid) {
    await window.AUTH.resetStaffAuth(sid);
    window.closeModal(); window.akRender();
    window.toast('✓ Đã về mặc định Tuantu@2026', 'success');
  };

  /* === Đặt tên đăng nhập === */
  window.akSetUser = function (sid) {
    const s = staffList().find(x => (x.id || x.code) === sid) || {};
    const cur = (window.AUTH && window.AUTH.getStaffUsername) ? window.AUTH.getStaffUsername(sid) : '';
    window.openModal('👤 Tên đăng nhập — ' + (s.name || sid), `
      <label style="font-size:12px;font-weight:600;color:var(--navy)">Username (3–30 ký tự: chữ, số, . _ -)</label>
      <input id="akUser" value="${esc(cur)}" placeholder="VD: quang.tx" style="width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:7px;font-size:13px;margin-top:6px;box-sizing:border-box">
      <div style="font-size:11.5px;color:var(--muted);margin-top:8px">Để TRỐNG = bỏ username (NV vẫn đăng nhập bằng Email/SĐT). NV đăng nhập được bằng <b>1 trong 3</b>.</div>`, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
        <button class="btn btn-primary" onclick="window.akSaveUser('${sid}')">💾 Lưu</button>`,
      width: '420px',
    });
  };
  window.akSaveUser = async function (sid) {
    const u = (document.getElementById('akUser') || {}).value || '';
    const r = await window.AUTH.setStaffUsername(sid, u);
    if (r.success) { window.closeModal(); window.akRender(); window.toast(u ? '✓ Đã đặt username: ' + u : '✓ Đã bỏ username', 'success'); }
    else window.toast('❌ ' + (r.error || 'Lỗi'), 'danger');
  };

  /* === Khóa / Mở khóa === */
  window.akToggleLock = function (sid) {
    const s = staffList().find(x => (x.id || x.code) === sid) || {};
    const locked = (s.status === 'off' || s.status === 'inactive');
    const next = locked ? 'active' : 'off';
    if (!confirm((locked ? 'Mở khóa' : 'Khóa') + ' tài khoản "' + (s.name || sid) + '"?\n' + (locked ? 'NV đăng nhập lại bình thường.' : 'NV sẽ KHÔNG đăng nhập được cho đến khi mở khóa.'))) return;
    window.STORE.update('staff', sid, { status: next });
    window.akRender();
    window.toast(locked ? '✓ Đã mở khóa' : '✓ Đã khóa tài khoản', locked ? 'success' : 'warn');
  };

  /* === Reset mật khẩu hàng loạt về Tuantu@2026 (xoá mật khẩu riêng → dùng mặc định) === */
  window.akBulkReset = async function () {
    const ids = [...document.querySelectorAll('.ak-cb:checked')].map(cb => cb.getAttribute('data-id'));
    if (!ids.length) { window.toast('Chọn ít nhất 1 NV (tick ô đầu dòng)', 'warn'); return; }
    if (!confirm('Đặt lại mật khẩu MẶC ĐỊNH (Tuantu@2026) cho ' + ids.length + ' NV đã chọn?')) return;
    for (const sid of ids) { try { await window.AUTH.resetStaffAuth(sid); } catch (e) {} }
    window.akRender();
    window.toast('✓ Đã reset ' + ids.length + ' tài khoản về Tuantu@2026', 'success');
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
