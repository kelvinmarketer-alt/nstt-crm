/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Auth System
   - Supabase Auth (production)
   - Fallback mock USERS khi Supabase chưa sẵn sàng
   ========================================================= */
(function () {

  /* =========================================================
     5 TÀI KHOẢN THẬT — gắn với NV thật trong DB (staff table)
     Đăng nhập qua MOCK_USERS fallback (Supabase Auth chưa tạo user).
     ⚠ Mật khẩu mặc định — đổi sau khi đăng nhập lần đầu.
     ========================================================= */
  /* TÀI KHOẢN ADMIN dự phòng (luôn đăng nhập được — tránh bị khoá ngoài).
     Nhân viên thật đăng nhập bằng SĐT + mật khẩu mặc định (xem staffLogin bên dưới). */
  const _FINANCE_PERMS = ['dashboard.view','accounting.view','accounting.edit','debt.view','debt.collect','invoices.view','invoices.create','adspend.view','adspend.edit','suppliers.view','products.view','orders.view','reports.view','reports.profit','reports.daily','reports.export','payroll.viewSelf','payroll.viewAll'];
  const MOCK_USERS = [
    /* ADMIN / SẾP — luôn đăng nhập được (chống khoá ngoài).
       Tên đăng nhập (sep@nstt.vn) + mật khẩu (Nstt@2026) GIỮ NGUYÊN. */
    { email:'sep@nstt.vn', password:'Nstt@2026', staffId:'NV001',
      name:'Trịnh Xuân Quang', role:'Leader Marketing', dept:'Ban giám đốc',
      avatar:'XQ', avatarColor:'#339B21',
      permissions:['all'], status:'active' },
    /* CEO — đăng nhập bằng email (KHÔNG dùng SĐT) */
    { email:'ceo@nstt.vn', password:'Nstt@2026', staffId:'CEO',
      name:'CEO — Giám đốc điều hành', role:'CEO', dept:'Ban giám đốc',
      avatar:'CE', avatarColor:'#1B5E20',
      permissions:['all'], status:'active' },
    /* CFO — đăng nhập bằng email (KHÔNG dùng SĐT) */
    { email:'cfo@nstt.vn', password:'Nstt@2026', staffId:'CFO',
      name:'CFO — Giám đốc tài chính', role:'CFO', dept:'Ban giám đốc',
      avatar:'CF', avatarColor:'#15803D',
      permissions:_FINANCE_PERMS, status:'active' },
  ];

  /* ===== Mật khẩu mặc định + phân quyền theo VỊ TRÍ (cho login bằng bản ghi staff) ===== */
  const PWD_LEADER = 'Nstt@2026';   /* admin / CEO / CFO */
  const PWD_STAFF  = 'Tuantu@2026'; /* tất cả nhân viên còn lại */

  function _isLeaderRole(role, dept) {
    const r = ((role || '') + ' ' + (dept || '')).toLowerCase();
    return ['sếp', 'ceo', 'cfo', 'chủ doanh', 'giám đốc', 'tổng giám', 'admin', 'ban giám đốc'].some(k => r.includes(k));
  }
  /* Quyền chi tiết theo vị trí (role) / phòng ban (dept) */
  function presetPerms(role, dept) {
    const r = ((role || '') + ' ' + (dept || '')).toLowerCase();
    const has = (...kw) => kw.some(k => r.includes(k));
    /* CFO / Giám đốc tài chính / Kế toán trưởng → tài chính (KIỂM TRA TRƯỚC 'giám đốc' chung) */
    if (has('cfo', 'kế toán trưởng') || (has('giám đốc') && has('tài chính')) || (has('tài chính') && !has('giám đốc') && !has('ceo')))
      return ['dashboard.view', 'accounting.view', 'accounting.edit', 'debt.view', 'debt.collect', 'invoices.view', 'invoices.create', 'adspend.view', 'adspend.edit', 'suppliers.view', 'products.view', 'orders.view', 'reports.view', 'reports.profit', 'reports.daily', 'reports.export', 'payroll.viewSelf', 'payroll.viewAll'];
    /* Sếp / CEO / Tổng giám đốc / Giám đốc điều hành → toàn quyền */
    if (has('sếp', 'ceo', 'chủ doanh', 'giám đốc', 'tổng giám', 'admin', 'ban giám đốc')) return ['all'];
    if (has('kế toán'))
      return ['dashboard.view', 'customers.view', 'accounting.view', 'accounting.edit', 'debt.view', 'debt.collect', 'invoices.view', 'invoices.create', 'adspend.view', 'products.view', 'orders.view', 'reports.view', 'reports.daily', 'payroll.viewSelf'];
    if (has('nhân sự', 'tuyển dụng', 'hr', 'hcns', 'hành chính'))
      return ['dashboard.view', 'customers.view', 'staff.view', 'staff.edit', 'payroll.viewSelf', 'payroll.viewAll', 'payroll.edit', 'payroll.upload', 'payroll.calc', 'payroll.submit', 'reports.view'];
    if (has('marketing', 'mkt', 'digital', 'ads', 'content', 'truyền thông'))
      return ['dashboard.view', 'marketing.send', 'adspend.view', 'adspend.edit', 'customers.view', 'products.view', 'reports.view', 'reports.sales', 'payroll.viewSelf'];
    if (has('kho'))
      return ['dashboard.view', 'inventory.view', 'inventory.adjust', 'suppliers.view', 'suppliers.edit', 'purchases.view', 'purchases.create', 'returns.view', 'returns.process', 'products.view', 'orders.view', 'payroll.viewSelf'];
    if (has('shipper', 'giao hàng', 'tài xế'))
      return ['dashboard.view', 'orders.view', 'shippers.view', 'payroll.viewSelf'];
    if (has('sale', 'kinh doanh', 'cskh', 'bán hàng', 'chăm sóc'))
      return ['dashboard.view', 'orders.view', 'orders.create', 'orders.edit', 'orders.print', 'customers.view', 'customers.create', 'customers.edit', 'customers.debt', 'products.view', 'quotes.view', 'quotes.create', 'recurring.view', 'recurring.edit', 'leads.view', 'leads.edit', 'reports.view', 'reports.sales', 'payroll.viewSelf'];
    return ['dashboard.view', 'payroll.viewSelf'];
  }
  /* === MẬT KHẨU CÁ NHÂN (NV tự đổi) ===
     Lưu HASH SHA-256 (salt theo staffId) trong kv 'staffAuth' — KHÔNG bao giờ lưu mật khẩu thô.
     Đăng nhập: nếu NV đã đặt mật khẩu riêng → so hash; chưa đặt → dùng mặc định Tuantu@2026. */
  async function _hashPwd(staffId, pwd) {
    const salt = 'nstt::' + (staffId || '') + '::';
    const bytes = new TextEncoder().encode(salt + (pwd || ''));
    try {
      if (window.crypto && window.crypto.subtle) {
        const buf = await window.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* fallthrough */ }
    /* Fallback khi không có crypto.subtle (http/file) — hash đơn giản, vẫn không lưu thô */
    let h = 0; const s = salt + (pwd || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return 'x' + (h >>> 0).toString(16);
  }
  function _getStaffAuth() {
    try { return (window.STORE && window.STORE.get('staffAuth', {})) || {}; } catch (e) { return {}; }
  }

  /* Đăng nhập bằng bản ghi nhân viên: SĐT (hoặc email/mã NV) + mật khẩu mặc định.
     async vì trên máy mới (login page chưa cache staff) phải fetch từ Supabase. */
  async function staffLogin(username, password) {
    let list = (window.STORE && window.STORE.get('staff', window.STAFFS || [])) || [];
    if ((!list || !list.length) && window.SB_DATA && window.SB_DATA.getAll) {
      try { const cloud = await window.SB_DATA.getAll('staff'); if (Array.isArray(cloud) && cloud.length) list = cloud; } catch (e) { console.warn('[AUTH staffLogin fetch]', e && e.message); }
    }
    const norm = s => (s || '').toString().replace(/\s+/g, '').toLowerCase();
    const dig = s => (s || '').toString().replace(/\D/g, '');
    const uin = norm(username), ud = dig(username);
    const st = list.find(s =>
      (ud && dig(s.phone) === ud) ||
      (uin && norm(s.email) === uin) ||
      (uin && (norm(s.code) === uin || norm(s.id) === uin)));
    if (!st) return null;
    if (st.status === 'inactive' || st.status === 'off' || st.status === 'nghỉ') return { _locked: true };
    const sid = st.id || st.code;
    const custom = _getStaffAuth()[sid];
    if (custom && custom.hash) {
      /* NV đã đặt mật khẩu riêng → so hash (mặc định KHÔNG còn dùng được) */
      if ((await _hashPwd(sid, password)) !== custom.hash) return null;
    } else {
      /* Chưa đặt → mật khẩu mặc định theo vị trí */
      const expect = st.pwd || (_isLeaderRole(st.role, st.dept) ? PWD_LEADER : PWD_STAFF);
      if (password !== expect) return null;
    }
    return {
      staffId: st.id || st.code,
      email: st.email || dig(st.phone),
      name: st.name,
      role: st.role,
      dept: st.dept,
      permissions: presetPerms(st.role, st.dept),
      avatar: st.avatar || (st.name || '?').trim().split(/\s+/).slice(-2).map(x => x[0]).join('').toUpperCase(),
      avatarColor: st.avatarColor || '#1B5E20',
    };
  }

  /* ============================================================
     PERM_GROUPS — phân quyền chi tiết theo từng tính năng
     Sensitive perm (🔒) = tính năng nhạy cảm: lương, giá vốn, lợi nhuận, settings.
     Mỗi perm có id ngắn (vd 'reports.profit') + label hiển thị.
     ============================================================ */
  const PERM_GROUPS = [
    { id:'dashboard', label:'📊 Tổng quan', perms:[
      { id:'dashboard.view', label:'Xem Dashboard' },
    ]},
    { id:'orders', label:'📦 Đơn hàng', perms:[
      { id:'orders.view',   label:'Xem danh sách đơn' },
      { id:'orders.create', label:'Tạo đơn mới' },
      { id:'orders.edit',   label:'Sửa / chuyển trạng thái đơn' },
      { id:'orders.cancel', label:'Hủy đơn', sensitive:true },
      { id:'orders.print',  label:'In phiếu giao hàng' },
    ]},
    { id:'customers', label:'👥 Khách hàng', perms:[
      { id:'customers.view',   label:'Xem danh sách KH' },
      { id:'customers.create', label:'Thêm KH mới' },
      { id:'customers.edit',   label:'Sửa thông tin KH' },
      { id:'customers.delete', label:'Xóa KH', sensitive:true },
      { id:'customers.debt',   label:'Xem công nợ của KH' },
    ]},
    { id:'products', label:'🥬 Sản phẩm & Giá', perms:[
      { id:'products.view',     label:'Xem catalog + bảng giá' },
      { id:'products.editSell', label:'Sửa giá bán' },
      { id:'products.editCost', label:'Sửa giá nhập (giá vốn)', sensitive:true },
      { id:'products.crud',     label:'Thêm / xóa sản phẩm' },
      { id:'products.bulkAi',   label:'Nhập hàng loạt + nhập bằng ảnh AI' },
    ]},
    { id:'shippers', label:'🛵 Shipper', perms:[
      { id:'shippers.view', label:'Xem shipper' },
      { id:'shippers.edit', label:'Sửa thông tin shipper' },
    ]},
    { id:'finance', label:'💰 Tài chính', perms:[
      { id:'accounting.view', label:'Xem sổ quỹ kế toán' },
      { id:'accounting.edit', label:'Ghi nhận thu / chi', sensitive:true },
      { id:'debt.view',       label:'Xem công nợ' },
      { id:'debt.collect',    label:'Ghi nhận thu nợ' },
      { id:'invoices.view',   label:'Xem hóa đơn' },
      { id:'invoices.create', label:'Tạo hóa đơn' },
      { id:'adspend.view',    label:'Xem chi phí quảng cáo' },
      { id:'adspend.edit',    label:'Nhập chi phí ads' },
    ]},
    { id:'reports', label:'📈 Báo cáo', perms:[
      { id:'reports.view',   label:'Xem báo cáo cơ bản (doanh thu / KH / công nợ)' },
      { id:'reports.sales',  label:'Xem hiệu quả NV kinh doanh' },
      { id:'reports.daily',  label:'Xem + gửi báo cáo ngày Telegram' },
      { id:'reports.profit', label:'🔒 Xem báo cáo LỢI NHUẬN (giá vốn, lãi gộp/ròng)', sensitive:true },
      { id:'reports.export', label:'Xuất Excel / In báo cáo' },
    ]},
    { id:'hr', label:'🧑‍💼 Nhân sự & Lương', perms:[
      { id:'staff.view',       label:'Xem danh sách NV' },
      { id:'staff.edit',       label:'Sửa NV / phân quyền', sensitive:true },
      { id:'payroll.viewSelf', label:'Xem lương cá nhân mình' },
      { id:'payroll.viewAll',  label:'🔒 Xem chấm công + lương TẤT CẢ NV', sensitive:true },
      { id:'payroll.edit',     label:'Chấm công + chỉnh thưởng/khấu trừ', sensitive:true },
      { id:'payroll.upload',   label:'Upload Excel chấm công từ máy chấm công' },
    ]},
    { id:'inventory', label:'📥 Kho & Mua hàng', perms:[
      { id:'inventory.view',   label:'Xem tồn kho' },
      { id:'inventory.adjust', label:'Kiểm kê / điều chỉnh tồn', sensitive:true },
      { id:'suppliers.view',   label:'Xem nhà cung cấp' },
      { id:'suppliers.edit',   label:'Sửa NCC + ghi thanh toán', sensitive:true },
      { id:'purchases.view',   label:'Xem phiếu nhập' },
      { id:'purchases.create', label:'Tạo / nhận phiếu nhập' },
      { id:'returns.view',     label:'Xem trả hàng' },
      { id:'returns.process',  label:'Xử lý hoàn tiền trả hàng', sensitive:true },
    ]},
    { id:'sales-extra', label:'📝 Báo giá · Đơn định kỳ · Lead', perms:[
      { id:'quotes.view',     label:'Xem báo giá' },
      { id:'quotes.create',   label:'Tạo / gửi báo giá' },
      { id:'recurring.view',  label:'Xem đơn định kỳ' },
      { id:'recurring.edit',  label:'Tạo / sửa mẫu định kỳ' },
      { id:'leads.view',      label:'Xem Lead funnel' },
      { id:'leads.edit',      label:'Sửa / chốt Lead' },
    ]},
    { id:'marketing', label:'📨 Marketing & Loyalty', perms:[
      { id:'marketing.send',    label:'Gửi marketing blast hàng loạt', sensitive:true },
      { id:'loyalty.view',      label:'Xem rule chiết khấu' },
      { id:'loyalty.edit',      label:'Sửa rule chiết khấu', sensitive:true },
    ]},
    { id:'system', label:'⚙️ Hệ thống', perms:[
      { id:'settings.view', label:'Xem cài đặt' },
      { id:'settings.edit', label:'Sửa cài đặt + tích hợp Telegram/AI', sensitive:true },
      { id:'audit.view',    label:'Xem nhật ký hoạt động', sensitive:true },
      { id:'backup.manage', label:'Tạo / phục hồi snapshot', sensitive:true },
      { id:'all',           label:'👑 SUPER ADMIN — Toàn quyền', sensitive:true },
    ]},
  ];

  /* Tập hợp id để check tồn tại */
  const PERM_IDS = new Set();
  PERM_GROUPS.forEach(g => g.perms.forEach(p => PERM_IDS.add(p.id)));

  /* Implication: perm "mạnh hơn" → tự kéo theo các perm "yếu hơn".
     VD: ai xem được lương tất cả NV thì đương nhiên xem được lương cá nhân. */
  const PERM_IMPLIES = {
    'payroll.viewAll':   ['payroll.viewSelf'],
    'payroll.edit':      ['payroll.viewSelf', 'payroll.viewAll'],
    'reports.profit':    ['reports.view'],
    'products.editCost': ['products.view'],
    'products.editSell': ['products.view'],
    'products.crud':     ['products.view'],
    'products.bulkAi':   ['products.view'],
    'orders.create':     ['orders.view'],
    'orders.edit':       ['orders.view'],
    'orders.cancel':     ['orders.view'],
    'orders.print':      ['orders.view'],
    'customers.create':  ['customers.view'],
    'customers.edit':    ['customers.view'],
    'customers.delete':  ['customers.view'],
    'customers.debt':    ['customers.view'],
    'accounting.edit':   ['accounting.view'],
    'debt.collect':      ['debt.view'],
    'invoices.create':   ['invoices.view'],
    'adspend.edit':      ['adspend.view'],
    'reports.export':    ['reports.view'],
    'reports.sales':     ['reports.view'],
    'reports.daily':     ['reports.view'],
    'staff.edit':        ['staff.view'],
    'shippers.edit':     ['shippers.view'],
    'settings.edit':     ['settings.view'],
  };

  /* Map legacy label cũ ('Đơn hàng', 'Báo cáo'...) → list perm id mới
     Để session/staff record cũ vẫn dùng được sau khi nâng cấp. */
  const LEGACY_MAP = {
    'Tất cả':     ['all'],
    'Dashboard':  ['dashboard.view'],
    'Đơn hàng':   ['orders.view','orders.create','orders.edit','orders.cancel','orders.print'],
    'Khách hàng': ['customers.view','customers.create','customers.edit','customers.debt'],
    'Sản phẩm':   ['products.view','products.editSell','products.crud','products.bulkAi'],
    'Shipper':    ['shippers.view','shippers.edit'],
    'Kế toán':    ['accounting.view','accounting.edit'],
    'Công nợ':    ['debt.view','debt.collect'],
    'Hóa đơn':    ['invoices.view','invoices.create'],
    'Quảng cáo':  ['adspend.view','adspend.edit'],
    'Nhân viên':  ['staff.view','staff.edit'],
    /* CHÚ Ý: 'Lương' legacy KHÔNG bao gồm payroll.viewAll/edit theo mặc định.
       Chỉ payroll.viewSelf + upload — admin phải bật riêng viewAll/edit cho NV cần. */
    'Lương':      ['payroll.viewSelf','payroll.upload'],
    /* CHÚ Ý: 'Báo cáo' legacy KHÔNG bao gồm reports.profit — phải tick riêng. */
    'Báo cáo':    ['reports.view','reports.sales','reports.daily','reports.export'],
  };

  /* Mọi page → perm id mới (fine-grained). Page nào cần quyền cao hơn để xem
     1 phần thì check trong JS của page (vd: payroll page mở được bằng viewSelf
     nhưng tab 'tất cả NV' cần viewAll). */
  const PAGE_PERMS = {
    'dashboard.html':  'dashboard.view',
    'orders.html':     'orders.view',
    'orders-hub.html': 'orders.view',
    'web-orders.html': 'orders.view',
    'order-samples.html': 'orders.view',
    'customers.html':  'customers.view',
    'customers-360.html':'customers.view',
    'products.html':   'products.view',
    'shippers.html':   'shippers.view',
    'finance.html':    'accounting.view',
    'accounting.html': 'accounting.view',
    'debt.html':       'debt.view',
    'cong-no-tong-hop.html': 'debt.view',
    'invoices.html':   'invoices.view',
    'adspend.html':    'adspend.view',
    'staff.html':      'staff.view',
    'payroll.html':    'payroll.viewSelf',
    'reports.html':    'reports.view',
    /* Modules mới */
    'inventory.html':  'inventory.view',
    'suppliers.html':  'suppliers.view',
    'purchases.html':  'purchases.view',
    'quotes.html':     'quotes.view',
    'recurring.html':  'recurring.view',
    'returns.html':    'returns.view',
    'leads.html':      'leads.view',
    'loyalty.html':    'loyalty.view',
    'marketing.html':  'marketing.send',
    'audit.html':      'audit.view',
    'tg-bot.html':     'settings.edit',
    'settings.html':   null,
    'docs.html':       null,
    'login.html':      null,
  };

  function isSupabaseAuthMode() {
    return window.SUPABASE_CONFIG?.mode === 'supabase' && !!window.SB_AUTH;
  }

  /* Lấy staff record từ Supabase qua user_id (đã link sẵn).
     Schema NSTT: column tên `perms` (KHÔNG phải `permissions`). */
  async function getStaffByUserId(userId) {
    if (!window.SB) return null;
    try {
      const { data, error } = await window.SB.from('staff').select('*').eq('user_id', userId).single();
      if (error) { console.warn('[AUTH] staff lookup', error.message); return null; }
      /* Expand wildcard '*' (admin) → mọi quyền */
      let perms = data.perms || data.permissions || [];
      if (perms.includes('*') || perms.includes('all')) {
        perms = ['all']; // hasPermission() check includes('all') để bypass tất cả
      }
      return {
        staffId: data.id,
        name: data.name,
        role: data.role,
        dept: data.dept,
        permissions: perms,
        avatar: data.avatar || data.name.split(' ').map(x => x[0]).slice(-2).join(''),
        avatarColor: data.avatar_color || '#1B5E20',
      };
    } catch (e) {
      console.warn('[AUTH] getStaffByUserId', e);
      return null;
    }
  }

  window.AUTH = {
    /* Helper cho màn "Xuất danh sách tài khoản" */
    presetPerms,
    isLeaderRole: _isLeaderRole,
    staffDefaultPassword(role, dept) { return _isLeaderRole(role, dept) ? PWD_LEADER : PWD_STAFF; },
    fixedAccounts() { return MOCK_USERS.map(u => ({ email: u.email, password: u.password, name: u.name, role: u.role, dept: u.dept, permissions: u.permissions })); },

    /* === Row-level scope KHÁCH HÀNG ===
       TRUE  = thấy TẤT CẢ KH của mọi sale (admin/sếp/CEO, kế toán, nhân sự, marketing)
       FALSE = chỉ thấy KH mình phụ trách (Sale, CSKH, và vai trò khác)
       Dùng cho customers list + chi tiết + dropdown chọn KH khi tạo đơn. */
    seesAllCustomers() {
      const u = this.currentUser(); if (!u) return false;
      const perms = u.permissions || [];
      if (perms.includes('all') || perms.includes('Tất cả')) return true;   /* admin / CEO / sếp */
      const r = ((u.role || '') + ' ' + (u.dept || '')).toLowerCase();
      return ['kế toán', 'ke toan', 'nhân sự', 'nhan su', 'tuyển dụng', 'tuyen dung',
              'hành chính', 'hanh chinh', 'marketing', 'mkt', 'digital', 'truyền thông', 'truyen thong']
        .some(k => r.includes(k));
    },

    /* === MẬT KHẨU CÁ NHÂN === */
    /* NV tự đổi mật khẩu: nhập mật khẩu hiện tại + mật khẩu mới */
    async changeMyPassword(currentPwd, newPwd, confirmPwd) {
      const u = this.currentUser();
      if (!u || !u.staffId) return { success: false, error: 'Chưa đăng nhập.' };
      if (!newPwd || newPwd.length < 6) return { success: false, error: 'Mật khẩu mới tối thiểu 6 ký tự.' };
      if (confirmPwd != null && newPwd !== confirmPwd) return { success: false, error: 'Xác nhận mật khẩu không khớp.' };
      const sid = u.staffId;
      const map = _getStaffAuth();
      /* Xác minh mật khẩu hiện tại */
      let curOk = false;
      const cur = map[sid];
      if (cur && cur.hash) {
        curOk = (await _hashPwd(sid, currentPwd)) === cur.hash;
      } else {
        const mock = MOCK_USERS.find(x => x.staffId === sid);
        const def = mock ? mock.password : (_isLeaderRole(u.role, u.dept) ? PWD_LEADER : PWD_STAFF);
        curOk = (currentPwd === def);
      }
      if (!curOk) return { success: false, error: 'Mật khẩu hiện tại không đúng.' };
      if (newPwd === currentPwd) return { success: false, error: 'Mật khẩu mới phải khác mật khẩu cũ.' };
      map[sid] = { hash: await _hashPwd(sid, newPwd), updatedAt: new Date().toISOString() };
      window.STORE.set('staffAuth', map);
      this.logActivity(sid, 'password.change', 'Đổi mật khẩu cá nhân');
      return { success: true };
    },
    /* Admin đặt mật khẩu mới cho 1 NV */
    async setStaffPassword(staffId, newPwd) {
      if (!staffId) return { success: false, error: 'Thiếu mã NV.' };
      if (!newPwd || newPwd.length < 6) return { success: false, error: 'Mật khẩu tối thiểu 6 ký tự.' };
      const map = _getStaffAuth();
      map[staffId] = { hash: await _hashPwd(staffId, newPwd), updatedAt: new Date().toISOString() };
      window.STORE.set('staffAuth', map);
      const me = this.currentUser();
      this.logActivity(me && me.staffId, 'password.adminset', 'Admin đặt mật khẩu cho ' + staffId);
      return { success: true };
    },
    /* Admin reset 1 NV về mật khẩu mặc định (Tuantu@2026) — xoá mật khẩu cá nhân */
    resetStaffAuth(staffId) {
      const map = _getStaffAuth();
      if (map[staffId]) { delete map[staffId]; window.STORE.set('staffAuth', map); }
      const me = this.currentUser();
      this.logActivity(me && me.staffId, 'password.reset', 'Reset mật khẩu NV ' + staffId + ' về mặc định');
      return { success: true };
    },
    /* NV này đã đặt mật khẩu riêng chưa? (để hiển thị trạng thái) */
    hasCustomPassword(staffId) {
      const c = _getStaffAuth()[staffId];
      return !!(c && c.hash);
    },

    /* === Login === */
    async login(email, password, remember) {
      /* Supabase Auth */
      let supabaseError = null;
      if (isSupabaseAuthMode()) {
        try {
          const { data, error } = await window.SB_AUTH.signIn(email, password);
          if (!error && data?.user) {
            const staff = await getStaffByUserId(data.user.id);
            if (!staff) {
              await window.SB_AUTH.signOut();
              return { success: false, error: 'Tài khoản chưa được link với NV nội bộ. Liên hệ admin.' };
            }
            const session = {
              staffId: staff.staffId,
              email,
              name: staff.name,
              role: staff.role,
              dept: staff.dept,
              permissions: staff.permissions,
              avatar: staff.avatar,
              avatarColor: staff.avatarColor,
              loginAt: new Date().toISOString(),
              expiresAt: remember
                ? new Date(Date.now() + 7*24*60*60*1000).toISOString()
                : new Date(Date.now() + 4*60*60*1000).toISOString(),
              supabaseUserId: data.user.id,
            };
            window.STORE.set('currentUser', session);
            this.logActivity(staff.staffId, 'login', 'Đăng nhập (Supabase)');
            return { success: true, user: session };
          }
          supabaseError = error;
          console.warn('[AUTH] Supabase signIn fail:', error?.message);
        } catch (e) {
          console.error('[AUTH login exception]', e);
          supabaseError = e;
        }
      }

      const _exp = () => remember
        ? new Date(Date.now() + 7*24*60*60*1000).toISOString()
        : new Date(Date.now() + 4*60*60*1000).toISOString();

      /* 1) Admin dự phòng (MOCK_USERS) — chấp nhận mật khẩu CỨNG (cứu hộ, chống khoá ngoài)
            HOẶC mật khẩu cá nhân đã đặt (staffAuth). */
      const mu = MOCK_USERS.find(x => x.email.toLowerCase() === (email||'').toLowerCase());
      let u = null;
      if (mu) {
        let ok = (mu.password === password);
        if (!ok) {
          const custom = _getStaffAuth()[mu.staffId];
          if (custom && custom.hash && (await _hashPwd(mu.staffId, password)) === custom.hash) ok = true;
        }
        if (ok) u = mu;
      }
      if (u) {
        if (u.status === 'off') return { success: false, error: 'Tài khoản đã bị khóa.' };
        const session = {
          staffId: u.staffId, email: u.email, name: u.name, role: u.role, dept: u.dept,
          permissions: u.permissions || [], avatar: u.avatar, avatarColor: u.avatarColor,
          loginAt: new Date().toISOString(), expiresAt: _exp(),
        };
        window.STORE.set('currentUser', session);
        this.logActivity(u.staffId, 'login', 'Đăng nhập (admin)');
        return { success: true, user: session };
      }

      /* 2) Nhân viên: SĐT (hoặc email/mã NV) + mật khẩu mặc định, quyền theo vị trí */
      const sres = await staffLogin(email, password);
      if (sres && sres._locked) return { success: false, error: 'Tài khoản nhân viên đã bị khóa / nghỉ việc.' };
      if (sres) {
        const session = { ...sres, loginAt: new Date().toISOString(), expiresAt: _exp() };
        window.STORE.set('currentUser', session);
        this.logActivity(sres.staffId, 'login', 'Đăng nhập (NV · ' + (sres.role || '') + ')');
        return { success: true, user: session };
      }

      /* 3) Sai thông tin */
      const msg = supabaseError?.message || '';
      if (msg && !msg.toLowerCase().includes('invalid')) return { success: false, error: msg };
      return { success: false, error: 'SĐT/email hoặc mật khẩu không đúng.' };
    },

    /* === Đăng ký user mới (admin only) === */
    async signUp(email, password, staffId) {
      if (!isSupabaseAuthMode()) {
        return { success: false, error: 'Chưa cấu hình Supabase Auth' };
      }
      try {
        const { data, error } = await window.SB_AUTH.signUp(email, password, { staffId });
        if (error) return { success: false, error: error.message };
        /* Link với staff record nếu có staffId */
        if (staffId && data.user) {
          await window.SB.from('staff').update({ user_id: data.user.id }).eq('id', staffId);
        }
        return { success: true, user: data.user };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },

    /* === Reset password (email) === */
    async resetPassword(email) {
      if (!isSupabaseAuthMode()) {
        return { success: false, error: 'Tính năng cần Supabase Auth. Liên hệ chủ DN reset thủ công.' };
      }
      try {
        const { error } = await window.SB_AUTH.resetPassword(email);
        if (error) return { success: false, error: error.message };
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },

    /* === Logout === */
    async logout() {
      const u = this.currentUser();
      if (u) this.logActivity(u.staffId, 'logout', 'Đăng xuất');
      if (isSupabaseAuthMode()) {
        try { await window.SB_AUTH.signOut(); } catch (e) {}
      }
      window.STORE.set('currentUser', null);
      const isInPages = location.pathname.includes('/pages/');
      window.location.href = isInPages ? 'login.html' : 'pages/login.html';
    },

    currentUser() {
      const s = window.STORE?.get('currentUser', null);
      if (!s) return null;
      if (s.expiresAt && new Date(s.expiresAt) < new Date()) {
        window.STORE.set('currentUser', null);
        return null;
      }
      if (!s.permissions || !Array.isArray(s.permissions)) {
        console.warn('[AUTH] Session thiếu permissions — xoá');
        window.STORE.set('currentUser', null);
        return null;
      }
      return s;
    },

    isLoggedIn() { return !!this.currentUser(); },

    /* === Expose perm catalog cho UI === */
    PERM_GROUPS,
    LEGACY_MAP,

    /* hasPerm(permId) — kiểm tra perm fine-grained mới.
       Truthy nếu: user có 'all' / 'Tất cả' / chính permId, hoặc 1 legacy label nào
       mà ánh xạ chứa permId. */
    hasPerm(permId) {
      const u = this.currentUser();
      if (!u) return false;
      if (!permId) return true;
      const perms = u.permissions || [];
      if (perms.includes('all') || perms.includes('Tất cả')) return true;
      /* direct match */
      if (perms.includes(permId)) return true;
      /* legacy label → fine-grained id */
      for (const p of perms) {
        const mapped = LEGACY_MAP[p];
        if (mapped && mapped.includes(permId)) return true;
      }
      /* perm mạnh hơn implies perm này */
      for (const p of perms) {
        const implies = PERM_IMPLIES[p];
        if (implies && implies.includes(permId)) return true;
        /* qua legacy + implies */
        const mapped = LEGACY_MAP[p] || [];
        for (const m of mapped) {
          const mi = PERM_IMPLIES[m];
          if (mi && mi.includes(permId)) return true;
        }
      }
      return false;
    },

    /* Backward-compat: chấp nhận cả legacy label cũ ('Báo cáo', 'Đơn hàng'...)
       lẫn perm id mới. */
    hasPermission(perm) {
      const u = this.currentUser();
      if (!u) return false;
      if (!perm) return true;
      const perms = u.permissions || [];
      if (perms.includes('all') || perms.includes('Tất cả')) return true;
      /* perm id mới */
      if (PERM_IDS.has(perm)) return this.hasPerm(perm);
      /* legacy label cũ → true nếu user có chính label đó hoặc bất kỳ perm
         fine-grained nào trong mapping */
      if (LEGACY_MAP[perm]) {
        if (perms.includes(perm)) return true;
        return LEGACY_MAP[perm].some(id => this.hasPerm(id));
      }
      /* custom string lạ → exact match */
      return perms.includes(perm);
    },

    requireAuth() {
      const isInPages = location.pathname.includes('/pages/');
      const loginPath = isInPages ? 'login.html' : 'pages/login.html';
      if (!this.isLoggedIn()) {
        try { sessionStorage.setItem('vty_redirect_after_login', location.pathname); } catch (e) {}
        window.location.replace(loginPath);
        return false;
      }
      /* Trang nhúng iframe (?embed=1) — trang gộp cha đã kiểm soát quyền, bỏ qua check ở đây
         để tránh iframe tự redirect khi user thiếu perm con. */
      try { if (new URLSearchParams(location.search).get('embed') === '1') return true; } catch (e) {}
      const pageName = (location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();
      const requiredPerm = PAGE_PERMS[pageName];
      if (requiredPerm && !this.hasPermission(requiredPerm)) {
        const allowed = this.getAllowedMenu();
        const fallback = allowed[0] || 'login.html';
        if (fallback === pageName) {
          alert('⚠️ Tài khoản không có quyền truy cập module nào.\nĐang đăng xuất...');
          this.logout();
          return false;
        }
        alert('⚠️ Bạn không có quyền vào trang này (' + requiredPerm + ').\nChuyển sang: ' + fallback);
        window.location.replace(fallback);
        return false;
      }
      return true;
    },

    logActivity(staffId, action, detail) {
      try {
        const logs = window.STORE.get('activityLogs', []);
        const entry = {
          id: 'L' + Date.now(),
          staff_id: staffId,
          action, detail,
          at_time: new Date().toISOString(),
        };
        logs.unshift({ ...entry, at: new Date().toLocaleString('vi-VN'), staffId });
        if (logs.length > 200) logs.length = 200;
        window.STORE.set('activityLogs', logs);
        /* KHÔNG push lên bảng activity_logs (schema cloud lệch → lỗi bigint).
           Audit chính đã có window.audit → kv_store('audit_log'). */
      } catch (e) { console.warn('Activity log', e); }
    },

    getAllowedMenu() {
      const u = this.currentUser();
      if (!u) return [];
      return Object.entries(PAGE_PERMS)
        .filter(([page]) => page !== 'login.html')
        .filter(([page, perm]) => !perm || this.hasPerm(perm))
        .map(([page]) => page);
    },

    forceLogout() {
      window.STORE.set('currentUser', null);
      if (isSupabaseAuthMode()) { try { window.SB_AUTH.signOut(); } catch (e) {} }
      const isInPages = location.pathname.includes('/pages/');
      window.location.replace(isInPages ? 'login.html' : 'pages/login.html');
    },
  };

  /* Set CURRENT_USER cho mọi page */
  const cu = window.AUTH.currentUser();
  if (cu) {
    window.CURRENT_USER = {
      name: cu.name,
      initials: cu.avatar,
      role: cu.role,
      avatarColor: cu.avatarColor,
    };
  }
})();
