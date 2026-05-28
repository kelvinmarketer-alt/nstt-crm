/* =========================================================
   Demo Seed — bơm dữ liệu cho các bảng KHÔNG có data file riêng
   ─────────────────────────────────────────────────────────
   Chạy 1 lần khi STORE còn rỗng các key sau:
   - cust_prefs (từ điển riêng + lịch sử per KH)
   - audit_log (lịch sử thao tác)
   - aic_facts_* (facts AI Chat nhớ về user)
   - aic_convs_* + aic_conv_* (lịch sử chat sample)
   - marketing_tpls (template đã default trong code)
   - loyalty_rules (rules đã default trong code)
   - notifications (build từ data orders/customers — không cần seed)

   Chạy đầu mỗi page load — chỉ seed nếu key chưa có.
   ========================================================= */
(function () {
  if (!window.STORE) {
    setTimeout(arguments.callee, 200);
    return;
  }

  /* ============ 1. CUSTOMER PREFERENCES — Từ điển riêng + lịch sử ============ */
  function seedCustPrefs() {
    const existing = window.STORE.get('cust_prefs', null);
    if (existing && Object.keys(existing).length) return;

    const TODAY = '2026-05-18';
    /* Aliases mô phỏng pain point thật của B2B nông sản */
    const prefs = {
      'KH001': {  /* Nhà hàng Á Đông — KH quen lâu năm */
        aliases: {
          'hành': 'SP006',          /* "hành" của KH này = Hành tây trắng */
          'cải': 'SP002',           /* "cải" = Cải dưa bẹ to */
          'rau': 'SP020',           /* "rau" = Ngô ngọt (đặc thù bếp Tàu) */
          'cà': 'SP003',            /* "cà" = Cà chua đại */
        },
        defaultQty: { SP006:50, SP002:30, SP003:25, SP005:80, SP020:20 },
        favorites: ['SP005','SP002','SP001','SP006','SP020','SP003'],
        lastOrderItems: [
          {id:'SP005', name:'Khoai tây',     qty:80, unit:'kg', price:14000},
          {id:'SP002', name:'Cải dưa bẹ to', qty:30, unit:'kg', price:10000},
          {id:'SP006', name:'Hành tây trắng',qty:50, unit:'kg', price:8000},
          {id:'SP001', name:'Dưa chuột',     qty:20, unit:'kg', price:15000},
        ],
        history: [
          {date:'2026-05-17', items:[{id:'SP005',qty:80},{id:'SP002',qty:30},{id:'SP006',qty:50},{id:'SP001',qty:20}]},
          {date:'2026-05-16', items:[{id:'SP005',qty:75},{id:'SP002',qty:28},{id:'SP006',qty:55}]},
          {date:'2026-05-15', items:[{id:'SP005',qty:90},{id:'SP002',qty:30},{id:'SP006',qty:50},{id:'SP020',qty:20}]},
        ],
      },
      'KH002': {  /* KS Mường Thanh — bếp Tây, hay đặt rau Đà Lạt */
        aliases: {
          'salad': 'SP046',
          'broccoli': 'SP027',
          'cauliflower': 'SP028',
        },
        defaultQty: { SP046:25, SP027:15, SP028:12, SP032:10 },
        favorites: ['SP027','SP028','SP032','SP046','SP030'],
        lastOrderItems: [
          {id:'SP027', name:'Lơ xanh',     qty:15, unit:'kg', price:28000},
          {id:'SP028', name:'Lơ trắng',    qty:12, unit:'kg', price:29000},
          {id:'SP046', name:'Xà lách xoăn',qty:25, unit:'kg', price:30000},
          {id:'SP030', name:'Ớt chuông đỏ',qty:8,  unit:'kg', price:55000},
        ],
        history: [
          {date:'2026-05-17', items:[{id:'SP027',qty:15},{id:'SP028',qty:12},{id:'SP046',qty:25},{id:'SP030',qty:8}]},
          {date:'2026-05-14', items:[{id:'SP027',qty:18},{id:'SP028',qty:10},{id:'SP046',qty:30}]},
        ],
      },
      'KH005': {  /* Phở Thìn Bờ Hồ — chỉ rau gia vị */
        aliases: {
          'hành': 'SP047',          /* "hành" của KH này = Hành lá (khác KH001!) */
          'mùi': 'SP049',
          'húng': 'SP048',
        },
        defaultQty: { SP047:8, SP049:3, SP048:2 },
        favorites: ['SP047','SP049','SP048'],
        lastOrderItems: [
          {id:'SP047', name:'Hành lá', qty:8, unit:'kg', price:20000},
          {id:'SP049', name:'Mùi ta',  qty:3, unit:'kg', price:20000},
        ],
        history: [
          {date:'2026-05-17', items:[{id:'SP047',qty:8},{id:'SP049',qty:3}]},
          {date:'2026-05-16', items:[{id:'SP047',qty:9},{id:'SP049',qty:3},{id:'SP048',qty:2}]},
          {date:'2026-05-15', items:[{id:'SP047',qty:7},{id:'SP049',qty:2.5}]},
        ],
      },
      'KH003': {  /* Bếp Canteen FPT — số lượng lớn */
        aliases: {},
        defaultQty: { SP008:40, SP005:50, SP011:15 },
        favorites: ['SP008','SP005','SP011','SP004'],
        lastOrderItems: [
          {id:'SP008', name:'Bắp cải',  qty:40, unit:'kg', price:10000},
          {id:'SP005', name:'Khoai tây',qty:50, unit:'kg', price:14000},
          {id:'SP011', name:'Đậu cove', qty:15, unit:'kg', price:40000},
        ],
        history: [
          {date:'2026-05-17', items:[{id:'SP008',qty:40},{id:'SP005',qty:50},{id:'SP011',qty:15}]},
        ],
      },
    };
    window.STORE.set('cust_prefs', prefs);
    console.log('[DemoSeed] cust_prefs seeded for 4 KH');
  }

  /* ============ 2. AUDIT LOG — lịch sử thao tác mẫu ============ */
  function seedAuditLog() {
    const existing = window.STORE.get('audit_log', null);
    if (existing && existing.length > 5) return;

    const now = Date.now();
    const M = 60_000; /* ms 1 phút */
    const H = 3600_000;
    const log = [
      /* === Hôm nay 18/5 (mới nhất) === */
      {action:'aichat.message',     detail:'Hỏi: KPI hôm nay thế nào?',         user:'Tuấn Tú',   role:'Chủ DN',     ts: now - 3*M},
      {action:'order.statusChange', detail:'NSTT-000142 → delivered (TG bot)', user:'Bùi Văn C', role:'Shipper',    ts: now - 5*M},
      {action:'order.create',       detail:'Tạo NSTT-000148 cho Nhà hàng Á Đông (8.5 tr ₫)', user:'Trần Lan', role:'Sale',  ts: now - 12*M},
      {action:'pod.upload',         detail:'Ảnh POD cho NSTT-000142',           user:'Bùi Văn C', role:'Shipper',    ts: now - 18*M},
      {action:'inventory.adjust',   detail:'SP005 (Khoai tây): 250 → 240 (-10) · Kiểm kê định kỳ', user:'Tuấn Tú', role:'Chủ DN', ts: now - 35*M},
      {action:'product.editPrice',  detail:'Rau muống 18.000 → 20.000 ₫/kg (T5/18)', user:'Tuấn Tú', role:'Chủ DN', ts: now - 1*H},
      {action:'payroll.edit',       detail:'Chấm công ngày 18/05 cho 9 NV',     user:'Tuấn Tú',   role:'Chủ DN',     ts: now - 1.5*H},
      {action:'customer.create',    detail:'Thêm KH KH028: Nhà hàng Pizza 4P\'s', user:'Trần Lan', role:'Sale',     ts: now - 2*H},
      {action:'purchase.receive',   detail:'Nhận PN-2026-0142 (8.75 tr ₫) từ HTX Vân Nội', user:'Tuấn Tú', role:'Chủ DN', ts: now - 3*H},
      {action:'quote.send',         detail:'BG-2026-0042 → Nhà hàng Sen Tây Hồ', user:'Tuấn Tú', role:'Chủ DN',    ts: now - 4*H},
      {action:'auth.login',         detail:'Đăng nhập từ Chrome / macOS',       user:'Tuấn Tú',   role:'Chủ DN',     ts: now - 5*H},
      /* === Hôm qua 17/5 === */
      {action:'recurring.run',      detail:'Tự sinh 3 đơn từ mẫu định kỳ',      user:'Hệ thống',  role:'',           ts: now - 24*H},
      {action:'backup.create',      detail:'Snapshot tự động (38.2 KB)',        user:'Hệ thống',  role:'',           ts: now - 25*H},
      {action:'quote.convert',      detail:'BG-2026-0041 → NSTT-000142',         user:'Trần Lan',  role:'Sale',       ts: now - 26*H},
      {action:'supplier.pay',       detail:'Trả 5.2 tr ₫ cho Cty Nấm Mộc Châu', user:'Tuấn Tú',   role:'Chủ DN',     ts: now - 28*H},
      {action:'lead.create',        detail:'Bếp ăn Vsip BN (35tr/tháng)',       user:'Hoàng Mai', role:'Marketing',  ts: now - 30*H},
      {action:'marketing.blast',    detail:'zalo → 7 KH VIP (segment)',         user:'Hoàng Mai', role:'Marketing',  ts: now - 32*H},
      /* === 2 ngày trước === */
      {action:'return.refund',      detail:'RT001: hoàn 80k cho Nhà hàng Á Đông', user:'Trần Lan', role:'Sale',     ts: now - 48*H},
      {action:'custpref.addAlias',  detail:'KH001: "hành" → SP006 (Hành tây trắng)', user:'Trần Lan', role:'Sale', ts: now - 52*H},
      {action:'order.statusChange.tg', detail:'NSTT-000128 → delivered (qua TG bot)', user:'Bùi Văn C', role:'Shipper', ts: now - 54*H},
    ];
    /* Convert sang format chuẩn */
    const formatted = log.map((e, i) => ({
      id: 'AL' + (now + i).toString(36),
      ts: new Date(e.ts).toISOString(),
      action: e.action,
      detail: e.detail,
      user: e.user,
      role: e.role,
      meta: null,
    }));
    window.STORE.set('audit_log', formatted);
    console.log('[DemoSeed] audit_log seeded with', formatted.length, 'entries');
  }

  /* ============ 3. AI CHAT — Facts + Conversation samples ============ */
  function seedAiChat() {
    const u = window.CURRENT_USER || {};
    const userId = u.id || u.email || u.name || 'guest';
    const factsKey = 'aic_facts_' + userId;
    const convListKey = 'aic_convs_' + userId;

    const existingFacts = window.STORE.get(factsKey, null);
    if (existingFacts && existingFacts.length) return;

    /* Seed facts AI đã "học" về user qua các session trước */
    const facts = [
      {text: 'User là chủ DN Nông Sản Tuấn Tú Hà Nội (B2B nông sản cho nhà hàng)', ts: Date.now() - 3*86400000},
      {text: 'DN có 9 NV: 2 Sale (Trần Lan, Hoàng Mai), 4 Shipper, 1 Kế toán (Phương), 1 KPI manager (Phạm Đức)', ts: Date.now() - 3*86400000},
      {text: 'Doanh thu mục tiêu T5/2026: 500 tr ₫', ts: Date.now() - 2*86400000},
      {text: 'KH chính là nhà hàng + khách sạn + bếp ăn canteen ở nội thành HN', ts: Date.now() - 2*86400000},
      {text: 'Đang test rule giảm 5% cho KH VIP từ tuần trước', ts: Date.now() - 1*86400000},
      {text: 'Quan tâm tối ưu chi phí Ads bán hàng (FB + Google), không quan tâm tuyển dụng', ts: Date.now() - 1*86400000},
      {text: 'Sếp prefer câu trả lời ngắn, dứt khoát, kèm số liệu cụ thể', ts: Date.now() - 12*3600000},
    ];
    window.STORE.set(factsKey, facts);

    /* Seed 2 conversation samples */
    const conv1Id = 'C' + (Date.now() - 86400000).toString(36);
    const conv2Id = 'C' + Date.now().toString(36);

    window.STORE.set('aic_conv_' + userId + '_' + conv1Id, {
      id: conv1Id,
      title: 'Tóm tắt KPI hôm qua + đôn nợ KH',
      updatedAt: Date.now() - 12*3600000,
      summary: 'User hỏi KPI tổng quan ngày 17/5. TUTÚ báo cáo: 14 đơn, DT 12.4tr, 2 KH cần đôn nợ (Á Đông 8tr, Mường Thanh 5tr). User quyết định gọi Á Đông trước, set rule giảm 5% test cho VIP.',
      messages: [
        {role:'user', content:'KPI hôm qua thế nào?', ts: Date.now() - 13*3600000},
        {role:'bot', content:'Hôm qua (17/5) DN có **14 đơn**, doanh thu **12.4 tr ₫**, đã giao 11 đơn (79%). 3 KPI nổi bật:\n• Top SP: Khoai tây (320kg)\n• Top NV bán: Trần Lan (5/14 đơn)\n• Cảnh báo: 2 KH có công nợ quá hạn — Á Đông 8tr, Mường Thanh 5tr', ts: Date.now() - 13*3600000 + 30000},
        {role:'user', content:'KH nào nên gọi đôn nợ trước?', ts: Date.now() - 13*3600000 + 90000},
        {role:'bot', content:'Theo dữ liệu, em đề xuất gọi **Nhà hàng Á Đông** trước vì:\n• Nợ 8tr quá hạn (cao nhất)\n• Là KH VIP, LTV 220tr — quan hệ tốt nên không sợ mất\n• Chưa liên hệ 6 ngày (lastContact 12/5)\n\nMường Thanh nợ 5tr nhưng vừa thanh toán 1 đợt tuần trước — có thể đợi đến tuần sau.', ts: Date.now() - 13*3600000 + 130000},
      ],
    });

    window.STORE.set('aic_conv_' + userId + '_' + conv2Id, {
      id: conv2Id,
      title: 'Setup AI alias cho KH Á Đông',
      updatedAt: Date.now() - 3600000,
      summary: '',
      messages: [
        {role:'user', content:'KH Á Đông hay nhắn "hành 50kg" — AI nên hiểu là hành gì?', ts: Date.now() - 3600000 - 60000},
        {role:'bot', content:'Theo lịch sử đơn của KH Á Đông (KH001), 5 đơn gần nhất họ luôn lấy **"Hành tây trắng" (SP006)** với SL trung bình 50kg. Em đã tự thêm alias `"hành" → SP006` vào từ điển riêng của KH này. Lần sau khi đọc ảnh đơn của Á Đông, AI sẽ tự match đúng.', ts: Date.now() - 3600000 - 30000},
        {role:'user', content:'Tốt. KH khác như Phở Thìn thì sao?', ts: Date.now() - 3000000},
        {role:'bot', content:'Phở Thìn (KH005) khác hẳn — họ chỉ lấy rau gia vị nhỏ lẻ. Khi họ nhắn "hành" → là **Hành lá (SP047)** (8kg/lần), KHÔNG phải hành tây. Em đã thêm alias riêng cho Phở Thìn vào từ điển của họ. Mỗi KH có 1 từ điển riêng — không bị nhầm.', ts: Date.now() - 3000000 + 30000},
      ],
    });

    window.STORE.set(convListKey, [
      {id: conv2Id, title: 'Setup AI alias cho KH Á Đông', updatedAt: Date.now() - 3600000},
      {id: conv1Id, title: 'Tóm tắt KPI hôm qua + đôn nợ KH', updatedAt: Date.now() - 12*3600000},
    ]);
    console.log('[DemoSeed] AI Chat facts + 2 conversation samples seeded');
  }

  /* ============ 4. SNAPSHOTS — lịch sử backup mẫu ============ */
  function seedSnapshots() {
    const existing = window.STORE.get('snapshots', null);
    if (existing && existing.length) return;
    const now = Date.now();
    const list = [
      {id:'SNAP'+now.toString(36), ts: new Date(now - 6*3600000).toISOString(),
       label:'Auto · ' + new Date(now - 6*3600000).toLocaleString('vi-VN'),
       size: 38_245, data: {}},
      {id:'SNAP'+(now-1).toString(36), ts: new Date(now - 30*3600000).toISOString(),
       label:'Auto · ' + new Date(now - 30*3600000).toLocaleString('vi-VN'),
       size: 37_120, data: {}},
      {id:'SNAP'+(now-2).toString(36), ts: new Date(now - 7*86400000).toISOString(),
       label:'Trước khi update T5/2026',
       size: 34_500, data: {}},
    ];
    window.STORE.set('snapshots', list);
    window.STORE.set('last_autobackup_ts', now - 6*3600000);
    console.log('[DemoSeed] snapshots seeded');
  }

  /* ============ 5. BUDGET — Plan T5/2026 ============ */
  function seedBudget() {
    const existing = window.STORE.get('budget_2026', null);
    if (existing && existing.monthlyRevTarget) return;
    window.STORE.set('budget_2026', {
      monthlyRevTarget:    500_000_000,
      monthlyCogsBudget:   325_000_000,
      monthlyAdsBudget:     25_000_000,
      monthlySalaryBudget:  80_000_000,
    });
    console.log('[DemoSeed] budget_2026 seeded');
  }

  /* ============ 6. POD PHOTOS — placeholder cho 3 đơn === */
  function seedPodPhotos() {
    const existing = window.STORE.get('pod_photos', null);
    if (existing && Object.keys(existing).length) return;
    /* Dùng SVG inline base64 nhỏ làm placeholder */
    const placeholder = 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 240 180"><rect fill="#F0FDF4" width="240" height="180"/><text x="120" y="80" text-anchor="middle" font-family="Arial" font-size="18" fill="#16A34A" font-weight="700">POD Photo</text><text x="120" y="105" text-anchor="middle" font-family="Arial" font-size="11" fill="#475569">Demo placeholder</text><text x="120" y="125" text-anchor="middle" font-family="Arial" font-size="10" fill="#9CA3AF">Replace với ảnh chụp thật khi shipper giao</text></svg>`);
    const pods = {
      'NSTT-000142': [{dataURL: placeholder, ts: new Date().toLocaleString('vi-VN'), user:'Bùi Văn C'}],
      'NSTT-000128': [{dataURL: placeholder, ts: new Date(Date.now()-86400000).toLocaleString('vi-VN'), user:'Lê Văn B'}],
      'NSTT-000115': [{dataURL: placeholder, ts: new Date(Date.now()-2*86400000).toLocaleString('vi-VN'), user:'Phạm Đức'}],
    };
    window.STORE.set('pod_photos', pods);
    console.log('[DemoSeed] pod_photos seeded for 3 orders');
  }

  /* === Run all seeds after STORE + CURRENT_USER ready === */
  setTimeout(() => {
    try {
      seedCustPrefs();
      seedAuditLog();
      seedAiChat();
      seedSnapshots();
      seedBudget();
      seedPodPhotos();
    } catch (e) { console.warn('[DemoSeed] error', e); }
  }, 800);
})();
