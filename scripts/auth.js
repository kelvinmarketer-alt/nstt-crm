/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Auth System
   - Supabase Auth (production)
   - Fallback mock USERS khi Supabase chưa sẵn sàng
   ========================================================= */
(function () {

  /* Mock users (fallback) — sẽ override khi Supabase Auth sẵn sàng */
  const MOCK_USERS = [
    { email:'admin@nongsantuantu.com', password:'admin123', staffId:'NV001',
      name:'Tuấn Tú', role:'Chủ doanh nghiệp', dept:'Ban giám đốc',
      avatar:'TT', avatarColor:'#339B21', permissions:['Tất cả'], status:'active' },
    { email:'sales@nongsantuantu.com', password:'sales123', staffId:'NV002',
      name:'Trần Lan', role:'Trưởng phòng Sales/CSKH', dept:'Sales',
      avatar:'TL', avatarColor:'#1B5E20',
      permissions:['Dashboard','Khách hàng','Đơn hàng','Công nợ','Hóa đơn','Báo cáo'], status:'active' },
    { email:'hung@nongsantuantu.com', password:'sales123', staffId:'NV003',
      name:'Phạm Hùng', role:'Nhân viên Sales', dept:'Sales',
      avatar:'PH', avatarColor:'#7C3AED',
      permissions:['Dashboard','Khách hàng','Đơn hàng','Báo cáo'], status:'active' },
    { email:'cskh@nongsantuantu.com', password:'cskh123', staffId:'NV004',
      name:'Hoàng Mai', role:'NV CSKH B2C / Last-mile', dept:'CSKH',
      avatar:'HM', avatarColor:'#E8A33D',
      permissions:['Dashboard','Khách hàng','Đơn hàng'], status:'active' },
    { email:'kt@nongsantuantu.com', password:'kt123', staffId:'NV005',
      name:'Lê Thị Phương', role:'Kế toán', dept:'Kế toán',
      avatar:'LP', avatarColor:'#15803D',
      permissions:['Dashboard','Kế toán','Công nợ','Hóa đơn','Báo cáo',
                   /* Kế toán được xem giá vốn + lợi nhuận + lương tất cả NV */
                   'reports.profit','products.editCost','payroll.viewAll'], status:'active' },
  ];

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
    'customers.html':  'customers.view',
    'customers-360.html':'customers.view',
    'products.html':   'products.view',
    'shippers.html':   'shippers.view',
    'accounting.html': 'accounting.view',
    'debt.html':       'debt.view',
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

  /* Lấy staff record từ Supabase qua user_id (đã link sẵn) */
  async function getStaffByUserId(userId) {
    if (!window.SB) return null;
    try {
      const { data, error } = await window.SB.from('staff').select('*').eq('user_id', userId).single();
      if (error) { console.warn('[AUTH] staff lookup', error.message); return null; }
      return {
        staffId: data.id,
        name: data.name,
        role: data.role,
        dept: data.dept,
        permissions: data.permissions || [],
        avatar: data.avatar || data.name.split(' ').map(x => x[0]).slice(-2).join(''),
        avatarColor: data.avatar_color || '#1B5E20',
      };
    } catch (e) {
      console.warn('[AUTH] getStaffByUserId', e);
      return null;
    }
  }

  window.AUTH = {
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

      /* Fallback mock — cho phép demo accounts hoạt động khi Supabase chưa có user */
      const u = MOCK_USERS.find(x => x.email.toLowerCase() === email.toLowerCase() && x.password === password);
      if (!u) {
        const msg = supabaseError?.message || '';
        if (msg && !msg.toLowerCase().includes('invalid')) {
          return { success: false, error: msg };
        }
        return { success: false, error: 'Email hoặc mật khẩu không đúng.' };
      }
      if (u.status === 'off') return { success: false, error: 'Tài khoản đã bị khóa.' };
      const session = {
        staffId: u.staffId, email: u.email, name: u.name, role: u.role, dept: u.dept,
        permissions: u.permissions || [], avatar: u.avatar, avatarColor: u.avatarColor,
        loginAt: new Date().toISOString(),
        expiresAt: remember
          ? new Date(Date.now() + 7*24*60*60*1000).toISOString()
          : new Date(Date.now() + 4*60*60*1000).toISOString(),
      };
      window.STORE.set('currentUser', session);
      this.logActivity(u.staffId, 'login', 'Đăng nhập (mock fallback)');
      return { success: true, user: session };
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
        /* Push to Supabase */
        if (isSupabaseAuthMode() && window.SB) {
          window.SB.from('activity_logs').insert(entry).then(() => {}).catch(() => {});
        }
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
