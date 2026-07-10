/* =========================================================
   GOM HÀNG → ĐẶT NCC  (Procurement / demand aggregation)
   Quy trình Kho:
     ① Chọn loạt đơn (theo ngày giao) → Gom SL theo từng NCC
     ② Phiếu yêu cầu NCC (in/copy Zalo) — có truy vết đơn nào bao nhiêu
        → nhập SL NCC xác nhận + lý do thiếu
        → phân bổ phần thiếu (ƯU TIÊN ĐƠN ĐẶT TRƯỚC) → ghi về đơn + báo Sale
     ③ Phiếu xuất kho cho shipper (có ca/giờ giao)
   Dữ liệu: kv_store 'procurementRuns'
   ========================================================= */
(function () {
  const S = () => window.STORE;
  const getRuns = () => S().get('procurementRuns', []) || [];
  /* Ghi CẢ danh sách phiên, nhưng KHÔNG ghi đè: upsert theo id lên bản cloud mới nhất, và chỉ
     xoá đúng những phiên user vừa xoá (so với bản đang cầm) → phiên NV khác vừa tạo giữ nguyên.
     Idempotent. Nhờ vậy 16 chỗ gọi saveRuns() cũ tự an toàn, không phải sửa từng chỗ. */
  const saveRuns = (r) => {
    r = Array.isArray(r) ? r : [];
    if (!S().rmwKv) { S().set('procurementRuns', r); return; }
    const keep = new Set(r.map(x => x && x.id));
    const removed = getRuns().map(x => x && x.id).filter(id => id && !keep.has(id));
    S().rmwKv('procurementRuns', arr => {
      arr = Array.isArray(arr) ? arr : [];
      r.forEach(run => { const i = arr.findIndex(x => x && x.id === run.id); if (i >= 0) arr[i] = run; else arr.unshift(run); });
      return removed.length ? arr.filter(x => x && removed.indexOf(x.id) < 0) : arr;
    }, []);
  };
  /* Lưu 1 PHIÊN qua RMW (idempotent upsert theo run.id) → 2 NV sửa 2 phiên cùng lúc KHÔNG đè của nhau.
     Dùng cho các thao tác biết chắc run.id (tạo/gán SL/xác nhận/chốt). saveRuns() giữ cho xóa/bulk. */
  const saveRun = (run) => window.STORE.rmwKv('procurementRuns', arr => {
    arr = Array.isArray(arr) ? arr : [];
    const i = arr.findIndex(x => x.id === run.id);
    if (i >= 0) arr[i] = run; else arr.unshift(run);
    return arr;
  });
  const getOrders = () => S().get('orders', window.ORDERS || []) || [];
  const getSuppliers = () => S().get('suppliers', []) || [];
  const getProducts = () => S().get('products', window.PRODUCTS || []) || [];

  const norm = s => (s || '').toString().trim().toLowerCase();
  const fmtQty = q => (+q || 0).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  const money = n => (window.fmt ? window.fmt(n) : (+n || 0).toLocaleString('vi-VN'));
  const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /* Chuỗi JS đặt trong thuộc tính HTML (onclick="fn(...)").
     `esc` KHÔNG thoát dấu nháy đơn → tên mặt hàng như  Cà chua bi 'Đà Lạt'  sẽ phá vỡ handler
     (im lặng không lưu), tệ hơn là chèn được JS vì tên hàng đến từ đơn web. */
  const jsq = v => "'" + String(v == null ? '' : v)
    .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;')
    .replace(/</g, '\\x3c').replace(/\r/g, '').replace(/\n/g, '\\n') + "'";

  /* Ngày giao → khoá so sánh 'YYYYMMDD' (nhận cả ISO 2026-07-06 lẫn dd/mm/yyyy). Rỗng → '' */
  function _dateKey(v) {
    if (!v) return '';
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);              /* ISO YYYY-MM-DD */
    if (m) return m[1] + m[2] + m[3];
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);        /* dd/mm/yyyy */
    if (m) return m[3] + String(m[2]).padStart(2, '0') + String(m[1]).padStart(2, '0');
    return '';
  }
  const _todayKey = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };

  /* Đơn đủ điều kiện gom: chưa giao/hủy, chưa xuất kho, VÀ ngày giao CHƯA QUA (>= hôm nay).
     Đơn quá ngày giao thì không cần gom/ship nữa → ẩn. includePast=true để đếm số đã ẩn. */
  function eligibleOrders(includePast) {
    const today = _todayKey();
    return getOrders().filter(o => {
      const st = o.status;
      if (st === 'cancelled' || st === 'returned' || st === 'delivered' || st === 'reconciled') return false;
      if (o.whStatus === 'released' || o.whStatus === 'confirmed') return false;
      /* Quá NGÀY GIAO → ẩn (giữ đơn hôm nay + tương lai + đơn chưa đặt ngày giao). */
      if (!includePast) { const dk = _dateKey(o.deliverDate); if (dk && dk < today) return false; }
      /* Danh sách đơn KHÔNG kéo cột `items` (tối ưu tải ~21×) → KHÔNG đòi o.items ở đây,
         nếu không MỌI đơn bị lọc sạch → "không có đơn nào cần gom". Chỉ cần đơn CÓ hàng:
         items (đơn vừa tạo còn trong RAM) HOẶC goods/qty/weight (đơn tải nhẹ từ cloud).
         Items thật sẽ nạp lazy trong buildLines khi bấm Tạo phiên gom. */
      return (Array.isArray(o.items) && o.items.length) ||
        (o.goods && String(o.goods).trim()) || (+o.qty > 0) || (+o.weight > 0);
    });
  }

  /* ===== Loại NCC (sỉ / lẻ / cả hai) + trạng thái nhập — kv 'supplierMeta' ===== */
  const getSupMeta = () => S().get('supplierMeta', {}) || {};
  const supplyTypeOf = (supId) => { const m = getSupMeta()[supId]; return (m && m.type) || 'both'; };
  const supplyStatusOf = (supId) => { const m = getSupMeta()[supId]; return (m && m.status) || 'active'; };
  const isPaused = (supId) => supplyStatusOf(supId) === 'paused';
  const TYPE_LABEL = { si: 'Sỉ', le: 'Lẻ', both: 'Sỉ+Lẻ' };

  /* ===================================================================
     CẤU HÌNH RIÊNG CỦA MODULE KHO — kv 'whProcure'
     { cutoffHour, cutoffByCustomer:{custId:h}, prodSupplier:{pid:supId},
       kgFactor:{pid:n}, buyOutside:[pid] }
     Nhập 1 lần từ sheet "TÊN QUY CHUẨN". Không đụng bảng products/suppliers.
     =================================================================== */
  const WH_DEFAULT = { cutoffHour: 10, cutoffByCustomer: {}, prodSupplier: {}, kgFactor: {}, buyOutside: [] };
  function whCfg() {
    const v = S().get('whProcure', null);
    return Object.assign({}, WH_DEFAULT, (v && typeof v === 'object' && !Array.isArray(v)) ? v : {});
  }
  function whPatch(mutate) {
    S().rmwKv('whProcure', c => {
      c = (c && typeof c === 'object' && !Array.isArray(c)) ? c : JSON.parse(JSON.stringify(WH_DEFAULT));
      Object.keys(WH_DEFAULT).forEach(k => { if (c[k] == null) c[k] = JSON.parse(JSON.stringify(WH_DEFAULT[k])); });
      mutate(c); return c;
    }, JSON.parse(JSON.stringify(WH_DEFAULT)));
  }
  const defaultSupplierOf = pid => whCfg().prodSupplier[pid] || '';
  const kgFactorOf = pid => +whCfg().kgFactor[pid] || 0;
  const isBuyOutside = pid => (whCfg().buyOutside || []).indexOf(pid) >= 0;
  window.whSetDefaultSupplier = (pid, supId) => whPatch(c => { if (supId) c.prodSupplier[pid] = supId; else delete c.prodSupplier[pid]; });
  window.whSetKgFactor = (pid, n) => whPatch(c => { const v = +n || 0; if (v > 0) c.kgFactor[pid] = v; else delete c.kgFactor[pid]; });

  /* ===== R2 — HAI HỆ ĐƠN VỊ, KHÔNG BAO GIỜ CỘNG CHUNG =====
     kg = đơn vị 'kg' cộng thẳng; đơn vị khác nhân hệ số quy đổi (0 = chưa khai → không cộng).
     Trả về { kg, units:{quả:40,...} } — mọi chỗ hiển thị tổng đều dùng hàm này. */
  function kgPair(items) {
    const out = { kg: 0, units: {} };
    (items || []).forEach(it => {
      const q = +it.qty || 0;
      if ((it.unit || 'kg') === 'kg') { out.kg += q; return; }
      out.units[it.unit] = +((out.units[it.unit] || 0) + q).toFixed(2);
      const f = kgFactorOf(it.productId);
      if (f > 0) out.kg += q * f;
    });
    out.kg = +out.kg.toFixed(2);
    return out;
  }
  const pairLabel = p => [p.kg ? fmtQty(p.kg) + ' kg' : '', ...Object.keys(p.units).map(u => fmtQty(p.units[u]) + ' ' + u)].filter(Boolean).join(' · ') || '0';

  /* ===== R1 — CUT-OFF: sau giờ chốt, hàng báo hôm nay là hàng NGÀY MAI ===== */
  function cutoffHourFor(custId) {
    const c = whCfg();
    const h = c.cutoffByCustomer && c.cutoffByCustomer[custId];
    return (h != null && h !== '') ? +h : (+c.cutoffHour || 10);
  }
  /* Ngày giao mà Kho NÊN gom ngay bây giờ (theo giờ chốt mặc định của công ty) */
  function targetDeliverKey() {
    const d = new Date();
    if (d.getHours() >= (+whCfg().cutoffHour || 10)) d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  /* Tất cả NCC cung cấp 1 SP.
     Bỏ ưu tiên theo SAO (đã gỡ khỏi giao diện NCC). Thứ tự mới:
       ① NCC mặc định của SP (nhập từ sheet)  ② giá nhập rẻ hơn  ③ tên
     NCC "ngừng nhập" bị loại, trừ khi đang được phân bổ sẵn trên phiên gom. */
  function suppliersForProduct(productId, productName, keepIds) {
    const keep = new Set(keepIds || []);
    const def = defaultSupplierOf(productId);
    const out = [];
    getSuppliers().filter(s => s.active !== false).forEach(s => {
      if (isPaused(s.id) && !keep.has(s.id)) return;
      const p = (s.products || []).find(pp => (productId && pp.id === productId) || norm(pp.name) === norm(productName));
      const isDef = s.id === def;
      if (p || isDef || keep.has(s.id)) {
        out.push({ id: s.id, name: s.name, price: p ? (+p.price || 0) : 0, type: supplyTypeOf(s.id), isDefault: isDef, hasPrice: !!p });
      }
    });
    return out.sort((a, b) =>
      (b.isDefault - a.isDefault) ||
      (b.hasPrice - a.hasPrice) ||
      (a.price - b.price) ||
      String(a.name).localeCompare(String(b.name), 'vi'));
  }

  /* Auto phân bổ: NCC MẶC ĐỊNH của SP nhận toàn bộ; không có thì lấy NCC rẻ nhất có giá.
     SP "mua ngoài" → cố ý KHÔNG gán NCC (kho tự đi chợ). */
  function autoAllocate(line) {
    if (!Array.isArray(line.allocations)) line.allocations = [];
    if (line.allocations.length) return;
    if (isBuyOutside(line.productId)) { line.buyOutside = true; return; }
    const cands = suppliersForProduct(line.productId, line.name);
    if (!cands.length) return;
    const top = cands[0];
    line.allocations = [{ supplierId: top.id, supplierName: top.name, qty: line.totalQty, unitCost: top.price, confirmedQty: null }];
  }
  const autoStarAllocate = autoAllocate;   /* tên cũ — giữ để không vỡ chỗ gọi khác */
  /* Migrate dòng cũ (supplierId đơn) → allocations[]; đảm bảo luôn có mảng.
     `_normDirty` = có thay đổi thật → chỉ khi đó mới cần ghi lên cloud. */
  let _normDirty = false;
  function normalizeLine(l) {
    if (!Array.isArray(l.allocations)) { l.allocations = []; _normDirty = true; }
    if (!l.allocations.length && l.supplierId) {
      l.allocations = [{ supplierId: l.supplierId, supplierName: l.supplierName || '', qty: l.totalQty,
        unitCost: l.unitCost || 0, confirmedQty: (l.confirmedQty != null ? l.confirmedQty : null) }];
      _normDirty = true;
    }
    return l;
  }
  function normalizeRun(run) { if (run && Array.isArray(run.lines)) run.lines.forEach(normalizeLine); return run; }

  const allocOf = (l) => (l.allocations || []).reduce((s, a) => s + (+a.qty || 0), 0);            /* tổng đã phân bổ NCC */
  const remainOf = (l) => +((l.totalQty || 0) - allocOf(l)).toFixed(2);                            /* còn chưa phân bổ */
  const confirmedOf = (l) => (l.allocations || []).reduce((s, a) => s + (a.confirmedQty != null && a.confirmedQty !== '' ? +a.confirmedQty : (+a.qty || 0)), 0); /* tổng NCC giao thực */

  /* ===== Gom SL nhiều đơn → lines (gom theo MÃ HÀNG) =====
     ASYNC: danh sách đơn không kéo `items` (tối ưu tải) → nạp lazy items cho CÁC ĐƠN ĐƯỢC GOM
     qua getOrderItems (song song). Nếu không có items thì mọi line totalQty = 0 → gom rỗng. */
  async function buildLines(orderCodes) {
    const base = getOrders().filter(o => orderCodes.includes(o.code))
      .sort((a, b) => (a.createdAt || a.date || '') < (b.createdAt || b.date || '') ? -1 : 1);
    const _fail = [];
    const orders = await Promise.all(base.map(async o => {
      let items = (Array.isArray(o.items) && o.items.length) ? o.items : null;
      if (!items && window.SB_DATA && window.SB_DATA.getOrderItems) {
        const its = await window.SB_DATA.getOrderItems(o.code);
        if (Array.isArray(its)) items = its;   /* [] = đơn rỗng thật (hợp lệ) */
        else _fail.push(o.code);               /* null = TẢI LỖI (timeout/mạng) */
      }
      return Object.assign({}, o, { items: items || [] });   /* copy — không đụng STORE */
    }));
    /* Tải lỗi 1 đơn → NÉM để pcMakeRun bắt & báo; KHÔNG âm thầm bỏ SL đơn đó →
       tránh tạo phiên gom THIẾU sản lượng (đặt NCC hụt hàng mà tưởng đã đủ). */
    if (_fail.length) throw new Error('Chưa tải được mặt hàng của đơn: ' + _fail.join(', ') + ' — thử lại (tránh gom thiếu sản lượng).');
    const products = getProducts();
    const prodByName = {};
    products.forEach(p => { prodByName[norm(p.name)] = p; });

    const map = new Map();
    orders.forEach(o => (o.items || []).forEach(it => {
      const prod = prodByName[norm(it.name)];
      const key = prod ? prod.id : 'x:' + norm(it.name);
      if (!map.has(key)) {
        map.set(key, {
          key, productId: prod ? prod.id : '', name: it.name, unit: it.unit || 'kg',
          totalQty: 0, breakdown: [], allocations: [], shortageReason: '', note: ''
        });
      }
      const g = map.get(key);
      g.totalQty = +(g.totalQty + (+it.qty || 0)).toFixed(2);
      g.breakdown.push({ code: o.code, custName: o.custName, qty: +it.qty || 0, createdAt: o.createdAt || o.date || '' });
    }));
    const lines = [...map.values()];
    lines.forEach(autoAllocate);      /* tự gán NCC mặc định của từng mặt hàng */
    return lines;
  }

  /* ===== Phân bổ phần thiếu: ƯU TIÊN ĐƠN ĐẶT TRƯỚC =====
     Tổng giao thực = Σ(giao thực từng NCC). Đơn tạo sớm nhận đủ trước; đơn sau gánh thiếu. */
  function allocateLine(line) {
    const hasAlloc = Array.isArray(line.allocations) && line.allocations.length;
    let avail = hasAlloc ? confirmedOf(line)
      : (line.confirmedQty != null && line.confirmedQty !== '' ? +line.confirmedQty : line.totalQty);
    const sorted = [...line.breakdown].sort((a, b) => (a.createdAt || a.code) < (b.createdAt || b.code) ? -1 : 1);
    return sorted.map(b => {
      const give = Math.min(b.qty, Math.max(0, avail));
      avail = +(avail - give).toFixed(3);
      return { code: b.code, custName: b.custName, want: b.qty, give: +give.toFixed(2), short: +(b.qty - give).toFixed(2) };
    });
  }

  /* ===================================================================
     ③ GỌI HÀNG — thay 2 sheet "GỌI HÀNG LẺ" và "GỌI HÀNG SỈ"

     R4: NCC LẺ chia mô sẵn → gom THEO KHÁCH, sinh cú pháp tin nhắn.
         NCC SỈ giao cả lô  → gom THEO MÃ HÀNG, tách tổng kg khỏi tổng quả/cây.
     =================================================================== */

  /* Gom 1 phiên gom thành dữ liệu 2 pane.
     Dùng LẠI supReqData + _mergeCusts + custSplitForLine đã có (chia khách theo đơn đặt trước, R6)
     — không viết lại logic chia hàng ở đây. */
  function callDataForRun(run) {
    const supIds = new Set();
    (run.lines || []).forEach(l => { normalizeLine(l); (l.allocations || []).forEach(a => { if (a.supplierId && +a.qty) supIds.add(a.supplierId); }); });

    const le = [], si = [];
    supIds.forEach(sid => {
      const { lines, supName } = supReqData(run, sid);
      if (!lines.length) return;
      const type = supplyTypeOf(sid);
      if (type === 'le') {
        const custs = new Map();
        lines.forEach(l => _mergeCusts(l.custs).forEach(b => {
          const arr = custs.get(b.name) || [];
          arr.push({ name: l.name, qty: b.qty, unit: l.unit });
          custs.set(b.name, arr);
        }));
        le.push({ sid, name: supName, custs, paused: isPaused(sid) });
      } else {
        si.push({ sid, name: supName, type, lines, paused: isPaused(sid) });
      }
    });

    /* Mua ngoài: SP khai 'Mua ngoài' trên sheet, HOẶC không NCC nào cung cấp */
    const outside = (run.lines || []).filter(l => isBuyOutside(l.productId) || suppliersForProduct(l.productId, l.name).length === 0);
    const outIds = new Set(outside.map(l => l.key));
    /* Chưa gán NCC: còn sản lượng chưa phân bổ mà KHÔNG phải hàng mua ngoài */
    const unassigned = (run.lines || []).filter(l => !outIds.has(l.key) && remainOf(l) > 0.001);
    return { le, si, unassigned, outside };
  }

  /* Cú pháp tin nhắn NCC LẺ — 1 khối / 1 khách, đúng ô M3 của sheet */
  const leBlock = (cust, items) => cust + '\n' + items.map(it => `${it.name} ${fmtQty(it.qty)} ${it.unit}`).join('\n');
  const leAllText = g => [...g.custs.entries()].map(([c, items]) => leBlock(c, items)).join('\n\n');
  const siText = g => g.lines.map(l => `${l.name} ${pairLabel(kgPair([l]))}`).join('\n');

  window.pcCopy = function (txt, btn) {
    const done = () => { if (!btn) return; const t = btn.textContent; btn.textContent = '✓ Đã chép'; setTimeout(() => btn.textContent = t, 1400); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(done).catch(() => window.toast?.('Không chép được — bôi đen rồi Ctrl+C', 'warn'));
    else window.toast?.('Trình duyệt không hỗ trợ chép tự động', 'warn');
  };
  /* ===================================================================
     ① TỔNG HỢP — bản sao sheet "Tổng hợp" + 2 lệnh gọi hàng, trên MỘT màn hình.

     Luồng cũ bắt kho làm 4 bước mới thấy được lệnh gọi hàng:
       tick đơn → tạo phiên gom → mở phiên → gán NCC từng mã.
     Nhưng lệnh gọi hàng KHÔNG cần phiên gom: NCC đã có mặc định theo sản phẩm.
     Nay: chọn NGÀY GIAO → tự gom mọi đơn của ngày đó → tự gán NCC → hiện luôn.
     Phiên gom chỉ dùng về sau, khi cân hàng thực nhận rồi xuất kho.
     =================================================================== */
  let _sumDate = '';                 /* 'YYYY-MM-DD' */
  let _sumCache = null;              /* { dk, codes, lines } */
  let _sumBusy = false;
  let _sumView = 'prod';             /* 'prod' = theo mã hàng (gọi NCC) · 'order' = theo đơn (hoá đơn gốc) */
  window.pcSumView = function (v) { _sumView = v; renderSummary(); };

  /* Đảo chiều: từ các dòng đã GỘP theo mã hàng → về lại TỪNG ĐƠN.
     Đây là "hoá đơn gốc" của sheet: đơn nào có mặt hàng gì, bao nhiêu, ai giao.
     Gộp mà không đảo lại được thì kho không biết sản lượng nào của đơn nào. */
  function linesToOrders(lines) {
    const orders = getOrders();
    const byCode = new Map();
    (lines || []).forEach(l => {
      const sup = (l.allocations || [])[0] || {};
      (l.breakdown || []).forEach(b => {
        const g = byCode.get(b.code) || { code: b.code, items: [] };
        g.items.push({ name: l.name, unit: l.unit, productId: l.productId, qty: b.qty,
          supName: sup.supplierName || '', supId: sup.supplierId || '', out: isBuyOutside(l.productId) });
        byCode.set(b.code, g);
      });
    });
    return [...byCode.values()].map(g => {
      const o = orders.find(x => x.code === g.code) || {};
      return Object.assign(g, {
        custName: o.custName || g.code,
        addr: o.drop || '', shift: o.shipShift || '', time: o.shipTime || '',
        items: g.items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi')),
      });
    }).sort((a, b) => String(a.custName).localeCompare(String(b.custName), 'vi'));
  }

  const _dkToISO = dk => `${dk.slice(0, 4)}-${dk.slice(4, 6)}-${dk.slice(6, 8)}`;
  const _isoToDk = iso => String(iso || '').replace(/-/g, '');
  const ordersForDate = dk => eligibleOrders().filter(o => _dateKey(o.deliverDate) === dk);

  window.pcSumDate = function (iso) { _sumDate = iso; _sumCache = null; renderSummary(); };
  window.pcSumReload = function () { _sumCache = null; renderSummary(); };

  /* Đổi NCC của 1 mã hàng ngay trên bảng — ghi vào whProcure, dùng lại cho MỌI ngày sau.
     Đây là cột F của sheet, nhưng sửa được và nhớ luôn. */
  window.pcSumSetSup = function (pid, supId) {
    if (!pid) { window.toast?.('Mặt hàng này chưa khớp mã sản phẩm trong app', 'warn'); return; }
    window.whSetDefaultSupplier(pid, supId);
    const s = getSuppliers().find(x => x.id === supId);
    window.toast?.(supId ? `✓ ${s ? s.name : supId} là NCC mặc định của mã này` : '✓ Đã bỏ NCC mặc định', 'success');
    _sumCache = null; renderSummary();
  };

  window.pcSumMakeRun = async function () {
    if (!_sumCache || !_sumCache.codes.length) { window.toast?.('Chưa có đơn nào', 'warn'); return; }
    picked = new Set(_sumCache.codes);
    await window.pcMakeRun();
  };

  async function renderSummary() {
    const host = document.getElementById('pcSum');
    if (!host) return;
    if (!_sumDate) _sumDate = _dkToISO(targetDeliverKey());
    const dk = _isoToDk(_sumDate);
    const cutH = +whCfg().cutoffHour || 10;
    const orders = ordersForDate(dk);

    const head = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <label style="font-size:12.5px;color:var(--muted);font-weight:600">Ngày giao</label>
        <input type="date" value="${_sumDate}" onchange="window.pcSumDate(this.value)"
               style="padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;font-weight:700;color:var(--navy)">
        <span class="tag" style="background:#F1F5F9;color:#475569;font-weight:700">${orders.length} đơn</span>
        <span style="font-size:11.5px;color:var(--muted)">🕙 chốt ${cutH}h</span>
        <button class="btn btn-ghost btn-sm" style="font-size:11.5px;padding:2px 7px" onclick="window.pcEditCutoff()">⚙</button>
        <div style="flex:1"></div>
        <button class="btn btn-ghost btn-sm" onclick="window.pcSumReload()">↻ Tải lại</button>
        <button class="btn btn-primary btn-sm" onclick="window.pcSumMakeRun()" ${orders.length ? '' : 'disabled'}>🧺 Chốt &amp; nhận hàng</button>
      </div>`;

    if (!orders.length) { host.innerHTML = head + _emptyBox(`Không có đơn nào giao ngày <b>${_sumDate.split('-').reverse().join('/')}</b>.`); return; }

    if (!_sumCache || _sumCache.dk !== dk) {
      if (_sumBusy) return;
      _sumBusy = true;
      host.innerHTML = head + _emptyBox('⏳ Đang gom ' + orders.length + ' đơn…');
      try {
        const codes = orders.map(o => o.code);
        _sumCache = { dk, codes, lines: await buildLines(codes) };
      } catch (e) {
        _sumBusy = false;
        host.innerHTML = head + _emptyBox('⚠ ' + esc(e.message || 'Không tải được mặt hàng của đơn'));
        return;
      }
      _sumBusy = false;
    }

    const lines = _sumCache.lines;
    const sups = getSuppliers().filter(s => s.active !== false && !isPaused(s.id))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));

    /* ── Góc nhìn A: THEO MÃ HÀNG (để gọi NCC) ──
       Mỗi mã 1 dòng, nhưng cột "Chia cho đơn" nói rõ sản lượng nào của khách nào.
       Gộp mà mất dấu đơn thì kho không chia hàng được. */
    const rows = lines.map(l => {
      const sup = (l.allocations[0] || {}).supplierId || '';
      const out = isBuyOutside(l.productId);
      const bd = [...(l.breakdown || [])].sort((a, b) => b.qty - a.qty);
      const supCell = out
        ? `<span class="tag" style="background:#FEF3C7;color:#92400E;font-weight:700">Mua ngoài</span>`
        : `<select onchange="window.pcSumSetSup(${jsq(l.productId)},this.value)"
             style="width:100%;max-width:190px;padding:4px 6px;border:1px solid ${sup ? 'var(--line)' : '#FCA5A5'};border-radius:6px;font-size:12px;background:${sup ? '#fff' : '#FEF2F2'}">
             <option value="">— chưa gán NCC —</option>
             ${sups.map(x => `<option value="${x.id}" ${x.id === sup ? 'selected' : ''}>${esc(x.name)} · ${TYPE_LABEL[supplyTypeOf(x.id)]}</option>`).join('')}
           </select>`;
      const split = bd.map(b => `<span title="${esc(b.code)}" style="display:inline-flex;align-items:center;gap:5px;background:#F1F5F9;border:1px solid #E2E8F0;border-radius:6px;padding:2px 7px;font-size:11.5px;white-space:nowrap">
          <span style="color:#475569">${esc(b.custName || b.code)}</span><b style="color:var(--navy)">${fmtQty(b.qty)}</b></span>`).join(' ');
      return `<tr>
        <td style="padding:8px 9px;font-weight:700;color:var(--navy)">${esc(l.name)}</td>
        <td style="padding:8px 9px;color:var(--muted)">${esc(l.unit)}</td>
        <td class="num" style="padding:8px 9px;font-weight:800;font-size:14px">${fmtQty(l.totalQty)}</td>
        <td style="padding:6px 9px"><div style="display:flex;flex-wrap:wrap;gap:4px">${split}</div>
          <div style="font-size:10.5px;color:var(--muted);margin-top:3px">${bd.length} đơn</div></td>
        <td style="padding:5px 9px;vertical-align:middle">${supCell}</td>
      </tr>`;
    }).join('');

    /* ── Góc nhìn B: THEO ĐƠN (bản sao "HÓA ĐƠN GỐC") ── */
    const orderCards = linesToOrders(lines).map(o => {
      const p = kgPair(o.items);
      const its = o.items.map(it => `<tr>
        <td style="padding:5px 8px">${esc(it.name)}</td>
        <td class="num" style="padding:5px 8px;font-weight:700">${fmtQty(it.qty)}</td>
        <td style="padding:5px 8px;color:var(--muted)">${esc(it.unit)}</td>
        <td style="padding:5px 8px;font-size:11.5px">${it.out
            ? '<span style="color:#92400E">🛒 mua ngoài</span>'
            : it.supName ? `${esc(it.supName)} <span style="color:var(--muted)">· ${TYPE_LABEL[supplyTypeOf(it.supId)]}</span>` : '<span style="color:#B91C1C">chưa gán NCC</span>'}</td>
      </tr>`).join('');
      return `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px 14px">
        <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:6px">
          <b style="font-size:14.5px;color:var(--navy)">${esc(o.custName)}</b>
          <span style="font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--muted)">${esc(o.code)}</span>
          <div style="flex:1"></div>
          <span class="tag" style="background:#EFF6FF;color:#1E40AF;font-weight:700">${o.items.length} mã · ${pairLabel(p)}</span>
        </div>
        <div style="font-size:11.5px;color:var(--muted);margin-bottom:8px">
          ${o.shift ? `Ca ${esc(o.shift)}` : ''}${o.time ? ` · ${esc(o.time)}` : ''}${o.addr ? ` · ${esc(o.addr)}` : ''}
        </div>
        <div style="overflow-x:auto;border:1px solid var(--line-soft,#EEF2EE);border-radius:8px">
          <table class="mini-table" style="width:100%;border-collapse:collapse;font-size:12.5px">
            <thead><tr style="background:#FAFBFA">
              <th style="text-align:left;padding:6px 8px">Mặt hàng</th>
              <th class="num" style="padding:6px 8px">SL</th>
              <th style="text-align:left;padding:6px 8px">ĐVT</th>
              <th style="text-align:left;padding:6px 8px">Lấy từ</th>
            </tr></thead><tbody>${its}</tbody>
          </table>
        </div>
      </div>`;
    }).join('');

    const noSup = lines.filter(l => !isBuyOutside(l.productId) && !(l.allocations[0] || {}).supplierId).length;
    const pair = kgPair(lines.map(l => ({ productId: l.productId, unit: l.unit, qty: l.totalQty })));

    const tabBtn = (v, ic, lb, sub) => `<button onclick="window.pcSumView('${v}')"
      style="flex:1;min-width:150px;display:flex;align-items:center;gap:9px;text-align:left;cursor:pointer;
             border:1.5px solid ${_sumView === v ? '#15803D' : 'var(--line)'};background:${_sumView === v ? '#F0FDF4' : '#fff'};
             border-radius:9px;padding:9px 12px">
      <span style="font-size:17px">${ic}</span>
      <span><b style="font-size:13px;color:${_sumView === v ? '#15803D' : 'var(--navy)'};display:block">${lb}</b>
      <span style="font-size:10.5px;color:var(--muted)">${sub}</span></span></button>`;

    const viewProd = `
      <div style="overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:#fff">
        <table class="mini-table" style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#F9FAFB">
            <th style="text-align:left;padding:8px 9px">Mã hàng</th>
            <th style="text-align:left;padding:8px 9px">ĐVT</th>
            <th class="num" style="padding:8px 9px">Tổng</th>
            <th style="text-align:left;padding:8px 9px;min-width:220px">Chia cho đơn nào</th>
            <th style="text-align:left;padding:8px 9px;min-width:180px">Nhà cung cấp</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="section-h" style="margin:18px 0 8px">📞 Gọi hàng</div>
      ${callPanesHTML({ id: 'SUM-' + dk, lines })}`;

    const viewOrder = `
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Đúng như <b>Hoá đơn gốc</b> của sheet — đơn nào có mặt hàng gì, lấy từ nhà nào.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px">${orderCards}</div>`;

    host.innerHTML = head + `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <span class="tag" style="background:#F0FDF4;color:#15803D;font-weight:700">${lines.length} mã hàng</span>
        <span class="tag" style="background:#EFF6FF;color:#1E40AF;font-weight:700">${pairLabel(pair)}</span>
        ${noSup ? `<span class="tag" style="background:#FEE2E2;color:#B91C1C;font-weight:700">⚠ ${noSup} mã chưa gán NCC</span>` : ''}
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        ${tabBtn('prod', '📦', 'Theo mã hàng', 'gom lại để gọi nhà cung cấp')}
        ${tabBtn('order', '🧾', 'Theo đơn khách', 'xem đơn nào có gì — như hoá đơn gốc')}
      </div>

      ${_sumView === 'order' ? viewOrder : viewProd}

      <details style="margin-top:16px">
        <summary style="cursor:pointer;font-weight:600;color:var(--muted);font-size:12.5px">⚙ Chọn đơn thủ công (khi chỉ muốn gom một phần)</summary>
        <div id="pcGather" style="margin-top:10px"></div>
      </details>`;
    renderGather();
  }

  /* Khai hệ số quy đổi kg cho 1 SP ngay tại màn hình Kho (không phải vào trang Sản phẩm) */
  window.pcAskKg = function (pid, name, unit) {
    if (!pid) { window.toast?.('Mặt hàng này chưa khớp mã sản phẩm trong app', 'warn'); return; }
    const cur = kgFactorOf(pid) || '';
    const v = prompt(`1 ${unit} "${name}" = bao nhiêu KG?\n\nVD: 1 cái bánh bao = 0.03 kg. Để trống = không quy đổi.`, cur);
    if (v == null) return;
    window.whSetKgFactor(pid, v);
    window.toast?.(+v > 0 ? `✓ 1 ${unit} = ${v} kg` : '✓ Đã bỏ hệ số quy đổi', 'success');
    renderSummary();
  };

  /* Vẽ 2 pane gọi hàng cho MỘT tập dòng hàng — dùng chung cho màn Tổng hợp và phiên gom */
  function callPanesHTML(run) {
    const d = callDataForRun(run);

    const warn = [];
    if (d.unassigned.length) warn.push(`<span class="tag" style="background:#FEE2E2;color:#B91C1C;font-weight:700">⚠ ${d.unassigned.length} mặt hàng chưa gán NCC</span>`);
    if (d.outside.length) warn.push(`<span class="tag" style="background:#FEF3C7;color:#92400E;font-weight:700">🛒 ${d.outside.length} mặt hàng mua ngoài</span>`);

    /* ── PANE LẺ ── */
    const lePane = d.le.length ? d.le.map(g => {
      const all = leAllText(g);
      const blocks = [...g.custs.entries()].map(([c, items]) => `
        <div style="border:1px solid var(--line);border-radius:8px;padding:9px 11px;background:#fff">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
            <b style="font-size:12.5px;color:var(--navy);flex:1">${esc(c)}</b>
            <button class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:11px" onclick="window.pcCopy(${jsq(leBlock(c, items))},this)">Chép</button>
          </div>
          <div style="font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--muted);line-height:1.65;white-space:pre-wrap">${esc(items.map(it => `${it.name} ${fmtQty(it.qty)} ${it.unit}`).join('\n'))}</div>
        </div>`).join('');
      return `<div style="border:1px solid #BBF7D0;background:#F0FDF4;border-radius:10px;padding:12px;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:9px">
          <b style="color:#15803D;font-size:14px">${esc(g.name)}</b>
          ${g.paused ? '<span class="tag" style="background:#FEE2E2;color:#B91C1C;font-weight:700">Ngừng nhập</span>' : ''}
          <span class="tag" style="background:#DCFCE7;color:#15803D;font-weight:700">Lẻ · ${g.custs.size} khách</span>
          <div style="flex:1"></div>
          <button class="btn btn-primary btn-sm" onclick="window.pcCopy(${jsq(all)},this)">📋 Chép cả ${g.custs.size} khách</button>
        </div>
        <div style="display:grid;gap:8px">${blocks}</div>
      </div>`;
    }).join('') : _emptyBox('Không có mặt hàng nào thuộc NCC lẻ.');

    /* ── PANE SỈ ── */
    const siPane = d.si.length ? d.si.map(g => {
      const rows = g.lines.map(l => {
        const p = kgPair([l]);
        const noFactor = l.unit !== 'kg' && !kgFactorOf(l.productId);
        return `<tr>
          <td style="padding:6px 8px"><b>${esc(l.name)}</b></td>
          <td class="num" style="padding:6px 8px;font-weight:700;color:var(--navy)">${p.kg ? fmtQty(p.kg) + ' kg' : '—'}</td>
          <td class="num" style="padding:6px 8px;color:#1E40AF">${Object.keys(p.units).map(u => fmtQty(p.units[u]) + ' ' + u).join(' · ') || '—'}
            ${noFactor ? `<button title="Chưa khai hệ số quy đổi kg — bấm để khai" onclick="window.pcAskKg(${jsq(l.productId)},${jsq(l.name)},${jsq(l.unit)})" style="border:none;background:none;color:#B45309;cursor:pointer;font-size:13px">⚠</button>` : ''}</td>
        </tr>`;
      }).join('');
      return `<div style="border:1px solid #BFDBFE;background:#EFF6FF;border-radius:10px;padding:12px;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:9px">
          <b style="color:#1E40AF;font-size:14px">${esc(g.name)}</b>
          ${g.paused ? '<span class="tag" style="background:#FEE2E2;color:#B91C1C;font-weight:700">Ngừng nhập</span>' : ''}
          <span class="tag" style="background:#DBEAFE;color:#1E40AF;font-weight:700">${g.type === 'both' ? 'Chưa phân loại sỉ/lẻ' : 'Sỉ'} · ${g.lines.length} mã</span>
          <div style="flex:1"></div>
          <button class="btn btn-primary btn-sm" onclick="window.pcCopy(${jsq(siText(g))},this)">📋 Chép danh sách</button>
        </div>
        <div style="overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:8px">
          <table class="mini-table" style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#F9FAFB">
              <th style="text-align:left;padding:7px 8px">Mã hàng</th>
              <th class="num" style="padding:7px 8px">Tổng kg</th>
              <th class="num" style="padding:7px 8px">Đơn vị khác</th>
            </tr></thead><tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
    }).join('') : _emptyBox('Không có mặt hàng nào thuộc NCC sỉ.');

    const problem = (d.unassigned.length || d.outside.length) ? `
      <div style="border:1px solid #FDE68A;background:#FFFBEB;border-radius:10px;padding:12px;margin-bottom:14px">
        <b style="color:#92400E;font-size:13px">Cần xử lý tay</b>
        ${d.unassigned.length ? `<div style="font-size:12.5px;color:#92400E;margin-top:6px">⚠ <b>Chưa gán NCC:</b> ${d.unassigned.map(l => esc(l.name)).join(', ')} — mở tab <b>② Phiên gom</b> để gán.</div>` : ''}
        ${d.outside.length ? `<div style="font-size:12.5px;color:#92400E;margin-top:6px">🛒 <b>Mua ngoài:</b> ${d.outside.map(l => `${esc(l.name)} ${fmtQty(l.totalQty)} ${esc(l.unit)}`).join(' · ')}</div>` : ''}
      </div>` : '';

    return `${warn.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${warn.join(' ')}</div>` : ''}
      ${problem}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;align-items:start">
        <div><div class="section-h" style="margin-bottom:8px">🛵 NCC lẻ — chia mô sẵn theo khách</div>${lePane}</div>
        <div><div class="section-h" style="margin-bottom:8px">📦 NCC sỉ — giao cả lô, kho tự chia</div>${siPane}</div>
      </div>`;
  }
  const _emptyBox = msg => `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:32px;text-align:center;color:var(--muted);font-size:13px">${msg}</div>`;

  /* ============ SUB-TAB (tab-trong-tab): chỉ hiện 1 pane ============ */
  window.pcSwitch = function (tab) {
    const valid = ['sum', 'runs', 'release', 'history'];
    if (valid.indexOf(tab) < 0) tab = 'sum';
    document.querySelectorAll('.pc-subtab').forEach(b => b.classList.toggle('active', b.dataset.pst === tab));
    document.querySelectorAll('.pc-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab));
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
  };
  function renderAll() { renderSummary(); renderRuns(); renderRunHistory(); renderRelease(); }

  /* ============ ① CHỌN ĐƠN → GOM ============ */
  let picked = new Set();
  window.pcEditCutoff = function () {
    const cur = +whCfg().cutoffHour || 10;
    const v = prompt('Giờ chốt đơn của công ty (0–23).\nSau giờ này, hàng khách báo sẽ giao vào NGÀY MAI.', cur);
    if (v == null) return;
    const h = parseInt(v, 10);
    if (!(h >= 0 && h <= 23)) { window.toast?.('Giờ chốt phải từ 0 đến 23', 'warn'); return; }
    whPatch(c => { c.cutoffHour = h; });
    window.toast?.(`✓ Giờ chốt = ${h}h`, 'success');
    renderAll();
  };

  function renderGather() {
    const host = document.getElementById('pcGather');
    const orders = eligibleOrders();                         /* hôm nay + tương lai + chưa đặt ngày */
    const nPast = eligibleOrders(true).length - orders.length; /* số đơn đã QUÁ ngày giao (ẩn) */
    /* nhóm theo ngày giao */
    const byDate = {};
    orders.forEach(o => { const d = o.deliverDate || '(chưa đặt ngày giao)'; (byDate[d] = byDate[d] || []).push(o); });
    const dates = Object.keys(byDate).sort();
    let html = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <span style="font-size:12.5px;color:var(--muted)">Tick các đơn cùng đợt giao → bấm <b>Tạo phiên gom</b>. Phiên gom mở ra → <b>gán NCC cho từng mặt hàng</b> + xác nhận đủ/thiếu.</span>
        ${nPast ? `<span title="Đơn có ngày giao trước hôm nay — đã qua nên không gom/ship nữa" style="font-size:11.5px;color:#B45309;background:#FEF3C7;padding:3px 9px;border-radius:6px;font-weight:600">🕐 Ẩn ${nPast} đơn quá ngày giao</span>` : ''}
        <div style="flex:1"></div>
        <button class="btn btn-primary btn-sm" id="pcMakeRun" onclick="window.pcMakeRun()" disabled>🧺 Tạo phiên gom (<span id="pcSelN">0</span>)</button>
      </div>`;
    if (!orders.length) {
      html += `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:40px;text-align:center;color:var(--muted)">Không có đơn nào cần gom cho hôm nay trở đi.${nPast ? ` (${nPast} đơn quá ngày giao đã ẩn.)` : ' Đơn mới do Sale tạo sẽ hiện ở đây.'}</div>`;
    } else {
      dates.forEach(d => {
        html += `<div style="margin:14px 0 6px;font-weight:700;color:var(--navy);font-size:13px;display:flex;align-items:center;gap:8px">
          📅 Giao: ${esc(d)} <span style="font-weight:400;color:var(--muted);font-size:12px">(${byDate[d].length} đơn)</span>
          <button class="btn btn-ghost btn-sm" onclick="window.pcPickDate('${esc(d)}')">Chọn cả ngày</button></div>`;
        byDate[d].forEach(o => {
          /* Danh sách đơn không kéo items → đếm mã từ `goods` (phẩy) + kg từ `weight`,
             giống trang Đơn hàng. Đơn vừa tạo (còn items trong RAM) thì dùng items. */
          const hasItems = Array.isArray(o.items) && o.items.length;
          const nItems = hasItems ? o.items.length : (o.goods || '').split(',').filter(s => s.trim()).length;
          const kg = hasItems ? o.items.reduce((s, it) => s + (+it.qty || 0), 0) : (+o.weight || 0);
          html += `<div class="ord-pick ${picked.has(o.code) ? 'sel' : ''}" data-code="${o.code}" onclick="window.pcTogglePick('${o.code}')">
            <input type="checkbox" ${picked.has(o.code) ? 'checked' : ''} style="width:16px;height:16px;pointer-events:none">
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:13px">${o.code} · ${esc(o.custName || '')}</div>
              <div style="font-size:11.5px;color:var(--muted)">${nItems} mã · ${fmtQty(kg)} kg ${o.shipShift ? '· ca ' + esc(o.shipShift) : ''} ${o.shipTime ? '· ' + esc(o.shipTime) : ''}</div>
            </div>
            <span class="tag" style="background:#DBEAFE;color:#1E40AF">${o.whStatus === 'gathering' ? 'Đang gom' : 'Mới'}</span>
          </div>`;
        });
      });
    }
    host.innerHTML = html;
    updatePickBtn();
  }
  function updatePickBtn() {
    const n = picked.size;
    const el = document.getElementById('pcSelN'); if (el) el.textContent = n;
    const btn = document.getElementById('pcMakeRun'); if (btn) btn.disabled = n === 0;
  }
  window.pcTogglePick = function (code) {
    if (picked.has(code)) picked.delete(code); else picked.add(code);
    const row = document.querySelector(`.ord-pick[data-code="${code}"]`);
    if (row) { row.classList.toggle('sel', picked.has(code)); const cb = row.querySelector('input'); if (cb) cb.checked = picked.has(code); }
    updatePickBtn();
  };
  window.pcPickDate = function (d) {
    eligibleOrders().filter(o => (o.deliverDate || '(chưa đặt ngày giao)') === d).forEach(o => picked.add(o.code));
    renderGather();
  };
  window.pcMakeRun = async function () {
    if (!picked.size) return;
    const codes = [...picked];
    const btn = document.getElementById('pcMakeRun');
    if (btn) { btn.disabled = true; btn.dataset._t = btn.textContent; btn.textContent = '⏳ Đang nạp hàng…'; }
    let lines;
    try {
      lines = await buildLines(codes);   /* nạp lazy items cho các đơn được gom */
    } catch (e) {
      console.error('[pcMakeRun buildLines]', e);
      window.toast?.('⚠ Lỗi nạp mặt hàng của đơn: ' + (e.message || 'unknown'), 'warn');
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset._t || '🧺 Tạo phiên gom'; }
      return;
    }
    const noSup = lines.filter(l => remainOf(l) > 0.001);  /* chưa phân bổ đủ NCC */
    const runs = getRuns();
    const seq = String(runs.length + 1).padStart(3, '0');
    const run = {
      id: 'GOM-' + seq,
      createdAt: new Date().toISOString(),
      createdBy: (window.AUTH?.currentUser?.()?.name) || 'Kho',
      orderCodes: codes,
      lines,
      status: 'draft'
    };
    runs.unshift(run);
    saveRun(run);
    /* đánh dấu đơn đang gom */
    const orders = getOrders();
    codes.forEach(c => { const o = orders.find(x => x.code === c); if (o) o.whStatus = 'gathering'; });
    S().set('orders', orders);
    picked.clear();
    window.toast?.(`✓ Tạo ${run.id} · ${codes.length} đơn · ${lines.length} mặt hàng` + (noSup.length ? ` · ⚠ ${noSup.length} SP chưa gán NCC` : ''), noSup.length ? 'warn' : 'success');
    renderGather(); renderRuns();
    window.pcSwitch('runs');
    setTimeout(() => window.pcOpenRun(run.id), 100);
  };

  /* ============ ② PHIÊN GOM (master-detail) ============ */
  /* Phiên ĐÃ CHỐT & phân bổ (applied) hoặc đã xuất kho (closed) → rời danh sách gom, vào "Lịch sử".
     LƯU Ý: 'confirmed' = phiên cũ (đã xác nhận) cũng coi là đã gom → vào lịch sử. */
  const _isDoneRun = (r) => r.status === 'applied' || r.status === 'closed' || r.status === 'confirmed';

  /* ===== Chọn/xoá phiên (đơn lẻ + hàng loạt) ===== */
  window._pcRunSel = window._pcRunSel || new Set();
  /* checkbox + nút xoá trên 1 thẻ phiên */
  function _runCardCtrls(rid) {
    return `<input type="checkbox" class="pc-run-cb" ${window._pcRunSel.has(rid) ? 'checked' : ''} onclick="event.stopPropagation();window._pcToggleRunSel('${rid}',this.checked)" title="Chọn để xoá hàng loạt" style="width:15px;height:15px;flex-shrink:0;cursor:pointer">`;
  }
  function _runDelBtn(rid) {
    return `<button onclick="event.stopPropagation();window.pcDeleteRun('${rid}')" title="Xoá phiên (đơn trả về giai đoạn ①)" style="background:none;border:none;color:#B91C1C;cursor:pointer;font-size:14px">🗑</button>`;
  }
  /* Thanh hành động hàng loạt — hiện khi có phiên được chọn */
  function _bulkBar() {
    const n = window._pcRunSel.size;
    if (!n) return '';
    return `<div style="display:flex;align-items:center;gap:10px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:8px 11px;margin-bottom:8px">
      <span style="font-size:12px;font-weight:700;color:#B91C1C">Đã chọn ${n} phiên</span>
      <div style="flex:1"></div>
      <button class="btn btn-ghost btn-sm" onclick="window._pcClearRunSel()">Bỏ chọn</button>
      <button class="btn btn-sm" style="background:#DC2626;color:#fff" onclick="window.pcBulkDeleteRuns()">🗑 Xoá ${n} phiên đã chọn</button>
    </div>`;
  }
  window._pcToggleRunSel = function (rid, on) { if (on) window._pcRunSel.add(rid); else window._pcRunSel.delete(rid); renderRuns(); renderRunHistory(); };
  window._pcClearRunSel = function () { window._pcRunSel.clear(); renderRuns(); renderRunHistory(); };

  /* Xoá 1 phiên gom → trả các đơn về giai đoạn ① (chọn đơn → gom) */
  window.pcDeleteRun = function (runId, skipConfirm) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    if (!skipConfirm && !confirm(`Xoá phiên ${runId}?\nCác đơn trong phiên sẽ trả về giai đoạn ① (chọn đơn → gom).`)) return;
    const orders = getOrders(); let och = false;
    (run.orderCodes || []).forEach(code => {
      const o = orders.find(x => x.code === code);
      if (o && (o.whStatus === 'gathering' || o.whStatus === 'confirmed')) { o.whStatus = ''; och = true; }
    });
    if (och) S().set('orders', orders);
    saveRuns(runs.filter(r => r.id !== runId));
    window._pcRunSel.delete(runId);
    if (window._pcActiveRun === runId) { window._pcActiveRun = null; window.pcCloseDetail && window.pcCloseDetail(); }
    if (!skipConfirm) { window.toast?.('🗑 Đã xoá phiên ' + runId + ' · đơn trả về giai đoạn ①', 'danger'); renderAll(); }
  };
  window.pcBulkDeleteRuns = function () {
    const ids = [...window._pcRunSel];
    if (!ids.length) return;
    if (!confirm(`Xoá ${ids.length} phiên đã chọn?\nTất cả đơn trong các phiên này sẽ trả về giai đoạn ①.`)) return;
    ids.forEach(id => window.pcDeleteRun(id, true));
    window._pcRunSel.clear();
    window.toast?.(`🗑 Đã xoá ${ids.length} phiên · đơn trả về giai đoạn ①`, 'danger');
    renderAll();
  };
  /* Trả 1 đơn từ ③ Xuất kho về ② Phiên gom (gán lại NCC) */
  window.pcReturnToGom = function (code) {
    const orders = getOrders(); const o = orders.find(x => x.code === code); if (!o) return;
    const runs = getRuns(); const run = runs.find(r => Array.isArray(r.orderCodes) && r.orderCodes.includes(code));
    if (run) {
      if (!confirm(`Trả đơn ${code} về giai đoạn ② (phiên ${run.id}) để gán lại NCC?`)) return;
      run.status = 'draft'; saveRuns(runs);
      o.whStatus = 'gathering';
    } else {
      if (!confirm(`Đơn ${code} không còn thuộc phiên gom nào.\nTrả về giai đoạn ① (chọn đơn → gom)?`)) return;
      o.whStatus = '';
    }
    S().set('orders', orders);
    window.toast?.(run ? `↩ Đã trả ${code} về giai đoạn ② (phiên ${run.id})` : `↩ Đã trả ${code} về giai đoạn ①`, 'info');
    renderAll();
  };

  function renderRunHistory() {
    const host = document.getElementById('pcRunHistory');
    if (!host) return;
    const hist = getRuns().filter(_isDoneRun);
    /* sub-tab điều khiển ẩn/hiện section; ở đây chỉ lo nội dung + empty-state */
    if (!hist.length) {
      host.innerHTML = '<div class="pc-detail-empty" style="border:1px dashed var(--line);border-radius:12px">Chưa có phiên gom nào được chốt &amp; phân bổ.</div>';
      return;
    }
    /* mới chốt lên đầu */
    hist.sort((a, b) => (a.confirmedAt || '') < (b.confirmedAt || '') ? 1 : -1);
    host.innerHTML = _bulkBar() + hist.map(r => {
      normalizeRun(r);
      const totalKg = r.lines.reduce((s, l) => s + l.totalQty, 0);
      const st = r.status === 'closed' ? ['Đã xuất kho', '#1B5E20'] : ['Đã chốt', '#15803D'];
      const when = r.confirmedAt ? new Date(r.confirmedAt).toLocaleString('vi-VN') : '';
      return `<div class="run-card" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;cursor:pointer" onclick="window.pcOpenRun('${r.id}')">
        ${_runCardCtrls(r.id)}
        <div style="font-weight:800;color:var(--navy)">${r.id}</div>
        <span class="tag" style="background:${st[1]}1f;color:${st[1]};font-weight:700;font-size:10.5px">${st[0]}</span>
        <span style="font-size:11.5px;color:var(--muted)">${r.orderCodes.length} đơn · ${r.lines.length} mã · ${fmtQty(totalKg)} kg${when ? ' · ' + when : ''}</span>
        <div style="flex:1"></div>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();window.pcOpenRun('${r.id}')">👁 Xem lại</button>
        ${_runDelBtn(r.id)}
      </div>`;
    }).join('');
  }

  /* ===================================================================
     ② NHẬN HÀNG — NCC giao tới, kho cân rồi ghi SỐ THỰC NHẬN. Chỉ vậy.

     Nguyên tắc: ô số điền SẴN = số đã đặt. Hàng về đủ → không gõ gì, bấm XONG.
     Chỉ mã nào thiếu mới phải sửa. Thiếu bao nhiêu, khách nào bị cắt — hiện ngay
     dưới ô số bằng tiếng Việt, không bắt kho tự suy.
     Mọi thứ nâng cao (chia 1 mã cho 2 nhà, in phiếu đặt) nằm trong ⚙ thu gọn.
     =================================================================== */
  let _recvRunId = null;
  window.pcRecvRun = function (rid) { _recvRunId = rid; renderRuns(); };

  /* Ghi số thực nhận. Bằng số đã đặt → lưu null ("giao đủ"), khỏi bẩn dữ liệu. */
  window.pcRecv = function (runId, key, ai, val) {
    const run = getRuns().find(r => r.id === runId); if (!run) return;
    const l = _line(run, key); if (!l || !l.allocations[ai]) return;
    const a = l.allocations[ai];
    const v = String(val).trim();
    const n = +v;
    /* '' hoặc đúng bằng số đã đặt → null ("giao đủ"). Số âm/không hợp lệ → kẹp về 0. */
    a.confirmedQty = (v === '' || !isFinite(n) || n === +a.qty) ? null : Math.max(0, n);
    saveRun(run); renderRuns();
  };
  /* "Nhận đủ tất cả" — xoá mọi số thực nhận đã gõ, quay về mặc định giao đủ */
  window.pcRecvAllFull = function (runId) {
    const run = getRuns().find(r => r.id === runId); if (!run) return;
    run.lines.forEach(l => (l.allocations || []).forEach(a => { a.confirmedQty = null; }));
    saveRun(run);
    window.toast?.('✓ Đánh dấu nhận đủ tất cả', 'success');
    renderRuns();
  };
  window.pcRecvAdv = function (rid) { window.pcOpenRun(rid); };

  let _runsRendering = false;   /* chống đệ quy: renderRuns → pcOpenRun → saveRuns → subscriber → renderRuns */
  function renderRuns() {
    if (_runsRendering) return;
    _runsRendering = true;
    try { _renderRunsInner(); } finally { _runsRendering = false; }
  }
  function _renderRunsInner() {
    const host = document.getElementById('pcRunList');
    if (!host) return;
    const allRuns = getRuns();
    const runs = allRuns.filter(r => !_isDoneRun(r));
    const det = document.getElementById('pcRunDetail');

    if (!runs.length) {
      host.innerHTML = _emptyBox('Chưa có phiên nào chờ nhận hàng.<br><span style="font-size:12px">Sang tab <b>📞 Tổng hợp &amp; Gọi hàng</b>, gọi hàng xong bấm <b>🧺 Chốt &amp; nhận hàng</b>.</span>');
      if (det) { det.innerHTML = ''; window._pcActiveRun = null; }
      return;
    }
    if (!_recvRunId || !runs.some(r => r.id === _recvRunId)) _recvRunId = runs[0].id;
    const run = normalizeRun(runs.find(r => r.id === _recvRunId));

    const picker = runs.length > 1
      ? `<select onchange="window.pcRecvRun(this.value)" style="padding:7px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;font-weight:700;color:var(--navy)">
           ${runs.map(r => `<option value="${r.id}" ${r.id === _recvRunId ? 'selected' : ''}>${r.id} · ${r.orderCodes.length} đơn</option>`).join('')}
         </select>`
      : `<b style="color:var(--navy);font-size:15px">${run.id}</b>`;

    let nShort = 0, nTyped = 0;
    const cards = run.lines.map(l => {
      const allocs = l.allocations || [];
      const out = isBuyOutside(l.productId);
      /* Không có NCC (mua ngoài / chưa gán) → không có gì để "nhận" từ NCC, đừng báo thiếu */
      const got = allocs.length ? confirmedOf(l) : l.totalQty;
      const short = allocs.length ? +(l.totalQty - got).toFixed(2) : 0;
      if (short > 0.001) nShort++;
      if (allocs.some(a => a.confirmedQty != null)) nTyped++;

      const supChips = allocs.length
        ? allocs.map(a => `<span class="tag" style="background:#F1F5F9;color:#475569;font-weight:600">${esc(a.supplierName || a.supplierId)} · ${TYPE_LABEL[supplyTypeOf(a.supplierId)]}</span>`).join(' ')
        : out ? `<span class="tag" style="background:#FEF3C7;color:#92400E;font-weight:700">🛒 Mua ngoài</span>`
              : `<span class="tag" style="background:#FEE2E2;color:#B91C1C;font-weight:700">Chưa gán NCC</span>`;

      /* Ô số: 1 NCC → 1 ô. Nhiều NCC → mỗi nhà 1 ô (hiếm). */
      const inputs = allocs.length
        ? allocs.map((a, ai) => `<div style="display:flex;align-items:center;gap:6px">
            ${allocs.length > 1 ? `<span style="font-size:11px;color:var(--muted);min-width:80px;text-align:right">${esc(a.supplierName || '')}</span>` : ''}
            <input type="number" step="any" min="0" inputmode="decimal"
              value="${a.confirmedQty != null ? a.confirmedQty : (+a.qty || 0)}"
              onfocus="this.select()" onchange="window.pcRecv(${jsq(run.id)},${jsq(l.key)},${ai},this.value)"
              style="width:96px;padding:9px 10px;font-size:17px;font-weight:800;text-align:right;color:var(--navy);
                     border:2px solid ${a.confirmedQty != null && +a.confirmedQty < +a.qty ? '#FCA5A5' : '#D1D5DB'};border-radius:8px">
            <span style="font-size:13px;color:var(--muted);font-weight:600">${esc(l.unit)}</span>
          </div>`).join('')
        : out ? `<span style="font-size:12px;color:#92400E">Kho tự đi mua</span>`
              : `<span style="font-size:12px;color:#B91C1C">Gán NCC ở tab Tổng hợp</span>`;

      /* Thiếu bao nhiêu → khách nào bị cắt (luật R6: đơn đặt trước nhận đủ trước) */
      let impact = '';
      if (short > 0.001) {
        const cut = allocateLine(l).filter(x => x.short > 0.001);
        impact = `<div style="margin-top:7px;background:#FEF2F2;border:1px solid #FECACA;border-radius:7px;padding:7px 9px;font-size:12px;color:#B91C1C;line-height:1.6">
          <b>Thiếu ${fmtQty(short)} ${esc(l.unit)}</b>${cut.length ? ' → ' + cut.map(x => `${esc(x.custName || x.code)} chỉ nhận <b>${fmtQty(x.give)}/${fmtQty(x.want)}</b>`).join(' · ') : ''}
        </div>`;
      } else if (got > l.totalQty + 0.001) {
        impact = `<div style="margin-top:7px;font-size:12px;color:#15803D">Nhận dư ${fmtQty(got - l.totalQty)} ${esc(l.unit)}</div>`;
      }

      return `<div style="background:${out ? '#FFFDF5' : '#fff'};border:1px solid ${short > 0.001 ? '#FECACA' : out ? '#FDE68A' : 'var(--line)'};border-radius:10px;padding:12px 14px">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:160px">
            <div style="font-weight:800;font-size:15px;color:var(--navy)">${esc(l.name)}</div>
            <div style="font-size:11.5px;color:var(--muted);margin-top:3px">Đặt <b>${fmtQty(l.totalQty)} ${esc(l.unit)}</b> · ${supChips}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">${(l.breakdown || []).map(b =>
              `<span title="${esc(b.code)}" style="background:#F1F5F9;border:1px solid #E2E8F0;border-radius:6px;padding:1px 6px;font-size:11px;white-space:nowrap"><span style="color:#475569">${esc(b.custName || b.code)}</span> <b style="color:var(--navy)">${fmtQty(b.qty)}</b></span>`).join('')}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:10.5px;color:var(--muted);text-transform:uppercase;font-weight:700;letter-spacing:.3px;margin-bottom:4px">Thực nhận</div>
            <div style="display:grid;gap:6px">${inputs}</div>
          </div>
        </div>
        ${impact}
      </div>`;
    }).join('');

    host.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        ${picker}
        <span class="tag" style="background:#F1F5F9;color:#475569;font-weight:700">${run.orderCodes.length} đơn · ${run.lines.length} mã</span>
        ${nShort ? `<span class="tag" style="background:#FEE2E2;color:#B91C1C;font-weight:700">⚠ ${nShort} mã thiếu</span>`
                 : `<span class="tag" style="background:#DCFCE7;color:#15803D;font-weight:700">✓ đủ hàng</span>`}
        <div style="flex:1"></div>
        ${nTyped ? `<button class="btn btn-ghost btn-sm" onclick="window.pcRecvAllFull(${jsq(run.id)})">↺ Nhận đủ tất cả</button>` : ''}
      </div>

      <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:9px;padding:9px 12px;margin-bottom:12px;font-size:12.5px;color:#1E40AF">
        Ô số đã điền sẵn <b>số đã đặt</b>. Hàng về đủ thì <b>không phải gõ gì</b> — bấm thẳng <b>Xong</b>.
        Mã nào thiếu thì sửa lại số, app tự cắt của khách đặt sau.
      </div>

      <div style="display:grid;gap:10px">${cards}</div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;align-items:center">
        <button class="btn btn-primary" style="font-size:15px;padding:11px 24px;font-weight:800" onclick="window.pcApplyAlloc(${jsq(run.id)})">✓ Xong — chốt sản lượng</button>
        <span style="font-size:12px;color:var(--muted)">Chốt xong đơn chuyển sang <b>🚚 Xuất kho</b>.</span>
        <div style="flex:1"></div>
        <button class="btn btn-ghost btn-sm" onclick="window.pcRecvAdv(${jsq(run.id)})" title="Chia 1 mã cho 2 nhà cung cấp · in phiếu đặt · xem chia khách">⚙ Nâng cao</button>
        ${_runDelBtn(run.id)}
      </div>`;
    /* Khối "Nâng cao" chỉ hiện khi user tự bấm mở (pcOpenRun đặt _pcActiveRun) */
    if (det && window._pcActiveRun !== run.id) det.innerHTML = '';
    else if (det && window._pcActiveRun === run.id) window.pcOpenRun(run.id);
  }

  function _supOpts(selId) {
    const sups = getSuppliers().filter(s => s.active !== false);
    return `<option value="">— Chọn NCC —</option>` +
      sups.map(s => `<option value="${s.id}" ${selId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  }

  /* Tổng hợp theo NCC từ allocations (cho phần "đặt hàng theo NCC" + summary) */
  function summarizeBySupplier(run) {
    const bySup = {};            /* supId → { id,name, items:[{name,unit,productId,qty,unitCost}], kg, cost } */
    run.lines.forEach(l => (l.allocations || []).forEach(a => {
      if (!a.supplierId || !(+a.qty)) return;
      const b = bySup[a.supplierId] = bySup[a.supplierId] || { id: a.supplierId, name: a.supplierName || a.supplierId, items: [], kg: 0, cost: 0 };
      b.items.push({ key: l.key, name: l.name, unit: l.unit, productId: l.productId, qty: +a.qty || 0, unitCost: +a.unitCost || 0, breakdown: l.breakdown });
      b.kg += +a.qty || 0; b.cost += (+a.qty || 0) * (+a.unitCost || 0);   /* b.kg = tổng THÔ, chỉ dùng nội bộ; hiển thị dùng kgPair */
    }));
    return bySup;
  }
  /* Mỗi ĐƠN dùng bao nhiêu NCC (distinct suppliers chạm vào mã hàng của đơn) */
  function suppliersPerOrder(run) {
    const res = {};   /* code → Set(supId) */
    run.lines.forEach(l => {
      const custCodes = new Set((l.breakdown || []).map(b => b.code));
      (l.allocations || []).forEach(a => { if (a.supplierId) custCodes.forEach(c => { (res[c] = res[c] || new Set()).add(a.supplierId); }); });
    });
    return res;
  }

  /* Tab trong màn phiên gom: 'assign' = gán NCC theo mã · 'order' = đặt hàng theo NCC.
     Giữ qua các lần re-render (bấm chip → render lại vẫn ở tab đang xem). */
  let _pcDetailTab = 'assign';
  window.pcDetailTab = function (tab) {
    _pcDetailTab = (tab === 'order') ? 'order' : 'assign';
    document.querySelectorAll('.pc-dpane').forEach(p => { p.style.display = (p.dataset.dpane === _pcDetailTab) ? 'block' : 'none'; });
    document.querySelectorAll('.pc-dtab').forEach(b => b.classList.toggle('on', b.dataset.dtab === _pcDetailTab));
    const dc = document.getElementById('pcRunDetail'); if (dc) dc.scrollTop = 0;
  };
  /* Gập/mở phần "chi tiết" của 1 mã (chia NCC / giao thực / lý do thiếu / chia khách).
     Toggle THẲNG trên DOM (không re-render) → không mất trạng thái đang nhập. */
  window.pcToggleAdv = function (btn) {
    const line = btn.closest('.pc-line'); if (!line) return;
    const adv = line.querySelector('.pc-adv'); if (!adv) return;
    const open = adv.style.display !== 'none';
    adv.style.display = open ? 'none' : 'block';
    btn.textContent = open ? '⚙ chi tiết ▾' : '⚙ thu gọn ▲';
  };
  window.pcOpenRun = function (runId) {
    const runs = getRuns();
    const run = normalizeRun(runs.find(r => r.id === runId));
    if (!run) return;
    if (window._pcActiveRun !== runId) _pcDetailTab = 'assign';   /* mở phiên KHÁC → về tab Gán NCC (giữ tab khi re-render cùng phiên) */
    /* CHỈ ghi khi migration thật sự đổi dữ liệu. Ghi vô điều kiện = bắn subscriber
       procurementRuns mỗi lần vẽ → renderRuns gọi lại pcOpenRun → đệ quy vô hạn. */
    if (_normDirty) { _normDirty = false; saveRuns(runs); }
    const sups = getSuppliers().filter(s => s.active !== false);
    const supDL = `<datalist id="pcSupDL">${sups.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist>`;
    const totalKg = run.lines.reduce((s, l) => s + l.totalQty, 0);
    const bySup = summarizeBySupplier(run);
    const perOrder = suppliersPerOrder(run);
    const nSup = Object.keys(bySup).length;
    const nIncomplete = run.lines.filter(l => remainOf(l) > 0.001).length;
    const nExt = run.lines.filter(l => suppliersForProduct(l.productId, l.name).length === 0).length;

    let body = supDL + `
      <style>
        .pc-dtab{flex:1;padding:11px 8px;font-size:12.5px;font-weight:700;cursor:pointer;border:none;background:#F1F5F9;color:#64748B;border-bottom:3px solid transparent;white-space:nowrap}
        .pc-dtab.on{background:#fff;color:#15803D;border-bottom-color:#15803D}
        .pc-dtab .b{display:inline-block;margin-left:5px;font-size:10px;font-weight:700;border-radius:8px;padding:0 6px;vertical-align:middle}
      </style>
      <div style="background:linear-gradient(135deg,#1B5E20,#2E7D32);color:#fff;padding:14px 18px;position:relative">
        <button onclick="window.pcCloseDetail()" title="Đóng" style="position:absolute;top:11px;right:13px;background:rgba(255,255,255,.18);border:none;color:#fff;width:28px;height:28px;border-radius:6px;cursor:pointer">✕</button>
        <h2 style="margin:0;font-size:16px">${run.id} — Phiên gom hàng</h2>
        <div style="opacity:.9;font-size:12px;margin-top:3px">${run.orderCodes.length} đơn · ${run.lines.length} mã hàng · ${fmtQty(totalKg)} kg · ${nSup} NCC</div>
      </div>
      <div class="pc-dtabs" style="display:flex;gap:0;background:#F1F5F9;position:sticky;top:0;z-index:8">
        <button class="pc-dtab${_pcDetailTab === 'assign' ? ' on' : ''}" data-dtab="assign" onclick="window.pcDetailTab('assign')">🧮 Gán NCC theo mã${nIncomplete ? `<span class="b" style="background:#FEF3C7;color:#B45309">${nIncomplete} thiếu</span>` : ''}</button>
        <button class="pc-dtab${_pcDetailTab === 'order' ? ' on' : ''}" data-dtab="order" onclick="window.pcDetailTab('order')">🏭 Đặt hàng NCC<span class="b" style="background:#DCFCE7;color:#15803D">${nSup}</span>${nExt ? `<span class="b" style="background:#FEF3C7;color:#B45309">🛒${nExt}</span>` : ''}</button>
      </div>
      <div style="padding:14px 18px">
      <div class="pc-dpane" data-dpane="assign" style="display:${_pcDetailTab === 'order' ? 'none' : 'block'}">`;

    /* ===== TỔNG QUAN SAU GOM ===== */
    body += `<div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:12px 14px;margin-bottom:14px">
      <div style="font-weight:800;color:#15803D;font-size:12.5px;margin-bottom:8px">📊 TỔNG QUAN SAU GOM</div>
      <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;margin-bottom:8px">
        <div><b style="font-size:16px;color:var(--navy)">${run.lines.length}</b> mã hàng</div>
        <div><b style="font-size:16px;color:var(--navy)">${fmtQty(totalKg)}</b> kg tổng</div>
        <div><b style="font-size:16px;color:var(--navy)">${nSup}</b> nhà cung cấp</div>
        ${nIncomplete ? `<div style="color:#B45309"><b>${nIncomplete}</b> mã chưa phân bổ đủ</div>` : '<div style="color:#15803D">✓ đã phân bổ đủ</div>'}
        ${nExt ? `<div style="color:#B45309">🛒 <b>${nExt}</b> mã thu mua ngoài</div>` : ''}
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-bottom:4px">Số NCC mỗi đơn:</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${run.orderCodes.map(code => {
        const o = getOrders().find(x => x.code === code);
        const n = (perOrder[code] || new Set()).size;
        return `<span class="bd-chip">${code}${o ? ' · ' + esc(o.custName || '') : ''}: <b>${n} NCC</b></span>`;
      }).join('')}</div>
    </div>`;

    /* ===== PHÂN BỔ NCC THEO TỪNG MÃ (chia nhiều NCC được) ===== */
    body += `<div style="font-weight:800;color:var(--navy);font-size:12.5px;margin:4px 0 8px">🧮 PHÂN BỔ NCC THEO TỪNG MÃ <span style="font-weight:400;color:var(--muted)">(1 mã có thể chia cho nhiều NCC)</span></div>`;
    /* ===== THANH CHỌN NHIỀU + GÁN HÀNG LOẠT ===== */
    if (!_isDoneRun(run)) {
      body += `<div class="pc-bulkbar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:12px">
        <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-weight:700;color:#1D4ED8"><input type="checkbox" id="pcChkAll" onclick="window.pcToggleAllLines(this.checked)" style="width:15px;height:15px;cursor:pointer"> Chọn tất cả</label>
        <span id="pcSelCount" style="color:var(--muted)">0 mã chọn</span>
        <div style="flex:1;min-width:8px"></div>
        <button class="btn btn-ghost btn-sm" style="font-size:11.5px;padding:3px 9px" onclick="window.pcAutoStarSelected('${run.id}')" title="Tự gán NCC mặc định của từng mặt hàng — cho mã đã chọn, hoặc TẤT CẢ nếu chưa chọn">↻ Tự gán NCC mặc định</button>
        <select id="pcBulkSup" style="font-size:11.5px;border:1px solid var(--line);border-radius:5px;padding:4px 6px;max-width:180px">
          <option value="">— gán NCC cho mã đã chọn… —</option>
          ${sups.map(s => `<option value="${esc(s.id)}">${esc(s.name)}${isPaused(s.id) ? ' (ngừng nhập)' : ''}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" style="font-size:11.5px;padding:3px 9px" onclick="window.pcBulkAssign('${run.id}')">Gán NCC</button>
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:#1D4ED8;font-size:11px" title="Lưu mã này vào danh sách NCC cung cấp → lần gom sau tự gán"><input type="checkbox" id="pcBulkRemember" checked style="cursor:pointer"> 🧠 Ghi nhớ (lần sau tự gán)</label>
      </div>`;
    }
    run.lines.forEach(l => {
      const cands = suppliersForProduct(l.productId, l.name);
      const alloc = allocateLine(l);
      const totalShort = alloc.reduce((s, a) => s + a.short, 0);
      const done = allocOf(l), remain = remainOf(l);
      const okAlloc = Math.abs(remain) < 0.001;
      const pickedIds = new Set((l.allocations || []).map(a => a.supplierId).filter(Boolean));
      const hasUnassigned = (l.allocations || []).some(a => !a.supplierId);
      /* Mặc định GỌN: chỉ hiện tên+SL+status+chip NCC. Phần "chi tiết" (chia NCC/giao thực/
         lý do thiếu/ghi chú/chia khách) GẬP lại — chỉ tự mở khi CÓ việc (chia ≥2 NCC, thiếu,
         có ghi chú, hoặc đang gõ NCC ngoài DS). */
      const showAdv = (l.allocations && l.allocations.length > 1) || !!l.shortageReason || !!l.note || totalShort > 0 || hasUnassigned;
      /* === THẺ 1 MÃ === */
      body += `<div class="pc-line" style="border:1px solid #E6ECE4;border-radius:9px;padding:9px 11px;margin-bottom:8px;background:#fff">
        <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">
          ${_isDoneRun(run) ? '' : `<input type="checkbox" class="pc-linechk" data-key="${esc(l.key)}" onclick="window.pcUpdateSelCount()" style="width:15px;height:15px;cursor:pointer;flex:none" title="Chọn để gán NCC hàng loạt">`}
          <div style="flex:1;min-width:120px"><b style="font-size:13px">${esc(l.name)}</b> <span style="color:var(--muted);font-size:12px">· ${fmtQty(l.totalQty)} ${l.unit}</span></div>
          <span class="tag" style="background:${okAlloc ? '#DCFCE7' : '#FEF3C7'};color:${okAlloc ? '#15803D' : '#B45309'};font-weight:700;font-size:10.5px;white-space:nowrap">${okAlloc ? '✓ đủ' : `còn ${fmtQty(remain)} ${l.unit}`}</span>
        </div>`;
      /* ===== CHIP chọn NCC (chỉ NCC bán mã này) + nút ⚙ chi tiết ===== */
      if (!_isDoneRun(run)) {
        if (cands.length) {
          body += `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:7px">
            ${cands.map(c => { const on = pickedIds.has(c.id);
              return `<button onclick="window.pcPickAllocSup('${run.id}','${l.key}','${c.id}')" title="Gán ${esc(c.name)} (1 chạm)"
                style="display:inline-flex;align-items:center;gap:5px;border:1.5px solid ${on ? '#15803D' : '#D1D5DB'};background:${on ? '#DCFCE7' : '#fff'};color:${on ? '#166534' : '#374151'};border-radius:16px;padding:4px 11px;font-size:12px;cursor:pointer;font-weight:${on ? '700' : '500'}">
                ${on ? '✓ ' : ''}${esc(c.name)}${c.isDefault ? '<span title="NCC mặc định của mặt hàng này" style="font-size:9px;color:#fff;background:#15803D;border-radius:5px;padding:0 5px;line-height:1.7">mặc định</span>' : ''}${c.price ? `<span style="font-size:10px;color:#6B7280">${money(c.price)}₫</span>` : ''}<span style="font-size:9px;color:#fff;background:${c.type === 'si' ? '#2563EB' : c.type === 'le' ? '#D97706' : '#64748B'};border-radius:5px;padding:0 5px;line-height:1.7">${TYPE_LABEL[c.type]}</span></button>`;
            }).join('')}
            <button onclick="window.pcRevealFreeSup('${run.id}','${l.key}')" title="NCC khác ngoài danh sách" style="border:1px dashed #9CA3AF;background:#fff;color:#6B7280;border-radius:16px;padding:4px 9px;font-size:11.5px;cursor:pointer">＋ khác</button>
            <div style="flex:1;min-width:6px"></div>
            <button onclick="window.pcToggleAdv(this)" style="border:none;background:none;color:#2563EB;font-size:11px;cursor:pointer;white-space:nowrap" title="Chia 2 NCC · báo thiếu · xem chia khách">⚙ ${showAdv ? 'thu gọn ▲' : 'chi tiết ▾'}</button>
          </div>`;
        } else {
          body += `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:7px">
            <span style="font-size:11.5px;color:#B45309">⚠ Chưa NCC nào bán mã này → 🛒 thu mua ngoài</span>
            <button onclick="window.pcRevealFreeSup('${run.id}','${l.key}')" style="border:1px dashed #9CA3AF;background:#fff;color:#6B7280;border-radius:16px;padding:3px 9px;font-size:11.5px;cursor:pointer">＋ gõ tên NCC</button>
          </div>`;
        }
      }
      /* ===== CHI TIẾT (gập) ===== */
      body += `<div class="pc-adv" style="display:${showAdv ? 'block' : 'none'};margin-top:7px;padding-top:7px;border-top:1px dashed #EEF2F0">`;
      (l.allocations || []).forEach((a, ai) => {
        const supField = a.supplierId
          ? `<span style="display:inline-flex;align-items:center;gap:5px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:6px;padding:3px 9px;font-size:12px;font-weight:600;color:#166534">🏭 ${esc(a.supplierName)}${a.unitCost ? ` <span style="font-weight:400;color:#6B7280">${money(a.unitCost)}₫</span>` : ''}</span>`
          : `<input list="pcSupDL" value="${esc(a.supplierName || '')}" placeholder="Gõ tên NCC…" onchange="window.pcSetAllocSup('${run.id}','${l.key}',${ai},this.value)" style="font-size:11.5px;border:1px solid #F59E0B;border-radius:5px;padding:3px 6px;width:160px;background:#FEF9C3">`;
        body += `<div class="pc-alloc" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:3px 0">
          <span style="color:var(--muted);font-size:11px">↳</span>
          ${supField}
          ${l.allocations.length > 1 ? `<input type="number" min="0" step="0.1" value="${a.qty != null ? a.qty : ''}" placeholder="SL" onchange="window.pcSetAllocQty('${run.id}','${l.key}',${ai},this.value)" style="width:60px;text-align:right;font-size:11.5px;border:1px solid var(--line);border-radius:5px;padding:3px 6px" title="Số ${l.unit} NCC này"> <span style="font-size:11px;color:var(--muted)">${l.unit}</span>` : ''}
          <label style="font-size:11px;color:var(--muted)">giao thực: <input type="number" min="0" step="0.1" value="${a.confirmedQty != null ? a.confirmedQty : ''}" placeholder="${fmtQty(a.qty || 0)}" onchange="window.pcSetAllocConf('${run.id}','${l.key}',${ai},this.value)" style="width:56px;text-align:right;font-size:11.5px;border:1px solid var(--line);border-radius:5px;padding:3px 6px"></label>
          <button onclick="window.pcDelAlloc('${run.id}','${l.key}',${ai})" title="Bỏ NCC này" style="background:none;border:none;color:#B91C1C;cursor:pointer;font-size:13px">✕</button>
        </div>`;
      });
      const _addLbl = (l.allocations && l.allocations.length) ? '➕ Chia cho NCC thứ 2' : '＋ Gõ tên NCC';
      body += `<div style="margin:2px 0 5px 0">
          <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 8px" onclick="window.pcAddAlloc('${run.id}','${l.key}')">${_addLbl}</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:2px 0">
          <select data-rkey="${l.key}" class="pc-reason" style="font-size:11.5px;border:1px solid var(--line);border-radius:5px;padding:3px 6px">
            <option value="">— lý do thiếu —</option>
            ${['Trái mùa', 'Sai quy cách', 'Hàng thối/hỏng', 'NCC hết hàng', 'Khác'].map(r => `<option ${l.shortageReason === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
          <input type="text" data-rkey="${l.key}" class="pc-note" value="${esc(l.note || '')}" placeholder="Ghi chú..." style="flex:1;min-width:120px;font-size:11.5px;border:1px solid var(--line);border-radius:5px;padding:3px 8px">
        </div>
        <div style="margin:5px 0 0 0;font-size:11px;color:var(--muted)">Chia khách: ${alloc.map(a => `<span class="bd-chip ${a.short > 0 ? 'short' : ''}">${a.code}: ${fmtQty(a.give)}${a.short > 0 ? ' <b>(-' + fmtQty(a.short) + ')</b>' : ''}</span>`).join(' ')}
          ${totalShort > 0 ? `<span style="color:#B91C1C;font-size:11.5px;font-weight:700;margin-left:6px">⚠ Thiếu ${fmtQty(totalShort)} ${l.unit}</span>` : ''}</div>
      </div></div>`;
    });

    /* ===== Đóng pane "Gán NCC" → mở pane "Đặt hàng NCC" (tab riêng, khỏi lướt dài) ===== */
    body += `</div><div class="pc-dpane" data-dpane="order" style="display:${_pcDetailTab === 'order' ? 'block' : 'none'}">`;
    /* ===== TỔNG HỢP ĐẶT HÀNG THEO NCC ===== */
    if (nSup > 0) {
      body += `<div style="font-weight:800;color:var(--navy);font-size:12.5px;margin:0 0 8px">🏭 ĐẶT HÀNG THEO NHÀ CUNG CẤP <span style="font-weight:400;color:var(--muted);font-size:11px">— bấm 📋 Copy Zalo gửi từng NCC</span></div>`;
      Object.values(bySup).forEach(b => {
        const typ = supplyTypeOf(b.id);
        body += `<div class="sup-block" style="margin-bottom:12px">
          <div class="hd">🏭 ${esc(b.name)} <span style="opacity:.85;font-weight:400;font-size:11px">${isPaused(b.id) ? '⛔ ngừng nhập · ' : ''}${TYPE_LABEL[typ]} · ${b.items.length} mã · ${pairLabel(kgPair(b.items))}${b.cost ? ' · ' + money(b.cost) + '₫' : ''}</span>
            <div style="flex:1"></div>
            <button class="btn btn-ghost btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:none" onclick="window.pcPrintSupReq('${run.id}','${b.id}')">🖨 In phiếu đặt</button>
            <button class="btn btn-ghost btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:none" onclick="window.pcCopySupReq('${run.id}','${b.id}')">📋 Copy Zalo</button>
          </div>
          <div style="padding:8px 12px">
          ${supReqData(run, b.id).lines.map(it => {
            const isLeSup = typ === 'le' || typ === 'both';
            const bags = isLeSup ? _mergeCusts(it.custs) : [];
            return `<div style="font-size:12px;padding:3px 0;border-bottom:1px dashed #EEF2F0">
            <b>${esc(it.name)}</b>: ${isLeSup ? 'tổng ' : ''}${fmtQty(it.qty)} ${it.unit}${it.unitCost ? ` <span style="color:var(--muted)">× ${money(it.unitCost)}₫</span>` : ''}
            ${bags.length ? `<div style="font-size:10.5px;color:var(--muted);margin-top:1px">📦 Túi: ${bags.map(bd => esc(bd.name) + ' - ' + fmtQty(bd.qty) + it.unit).join(' · ')}</div>` : ''}
          </div>`; }).join('')}
          </div>
        </div>`;
      });
    }

    /* ===== THU MUA NGOÀI (mã chưa có NCC) ===== */
    const extData = extReqData(run);
    if (extData.lines.length) {
      const extKg = extData.lines.reduce((s, l) => s + l.qty, 0);
      body += `<div style="font-weight:800;color:#B45309;font-size:12.5px;margin:14px 0 8px">🛒 THU MUA NGOÀI <span style="font-weight:400;color:var(--muted)">(mã chưa NCC nào cung cấp — thu mua đi chợ/ngoài)</span></div>
        <div class="sup-block" style="margin-bottom:12px;border:1px solid #FDE68A">
          <div class="hd" style="background:linear-gradient(135deg,#B45309,#D97706)">🛒 Danh sách thu mua ngoài <span style="opacity:.85;font-weight:400;font-size:11px">${extData.lines.length} mã · ${fmtQty(extKg)}kg</span>
            <div style="flex:1"></div>
            <button class="btn btn-ghost btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:none" onclick="window.pcPrintExtReq('${run.id}')">🖨 In phiếu</button>
            <button class="btn btn-ghost btn-sm" style="background:rgba(255,255,255,.2);color:#fff;border:none" onclick="window.pcCopyExtReq('${run.id}')">📋 Copy Zalo</button>
          </div>
          <div style="padding:8px 12px">
          ${extData.lines.map(it => `<div style="font-size:12px;padding:3px 0;border-bottom:1px dashed #EEF2F0">
            <b>${esc(it.name)}</b>: ${fmtQty(it.qty)} ${it.unit}
            ${it.custs.length ? `<div style="font-size:10.5px;color:var(--muted);margin-top:1px">Cho: ${it.custs.map(b => esc(b.custName || b.code) + ' ' + fmtQty(b.qty) + it.unit).join(' · ')}</div>` : ''}
          </div>`).join('')}
          </div>
          <div style="padding:0 12px 10px;font-size:11px;color:#92400E">💡 Cuối ngày: thu mua nhập phiếu kèm <b>giá thật</b> ở <b>Phiếu nhập → 🛒 Thu mua ngoài</b> (đọc ảnh AI được) → tự vào sổ quỹ kế toán + cập nhật giá vốn.</div>
        </div>`;
    }

    /* Pane Đặt hàng rỗng (chưa gán NCC + không có mã mua ngoài) → nhắc sang tab Gán NCC */
    if (!nSup && !extData.lines.length) body += `<div style="padding:24px;text-align:center;color:var(--muted);font-size:12.5px">Chưa gán NCC cho mã nào.<br>Sang tab <b>🧮 Gán NCC theo mã</b> để chọn NCC → phần đặt hàng sẽ hiện ở đây.</div>`;
    body += `</div>`;   /* đóng pane "Đặt hàng NCC" */

    if (_isDoneRun(run)) {
      /* Phiên đã chốt (xem lại từ Lịch sử) — không cho chốt lại, chỉ xem + in phiếu NCC */
      body += `<div style="position:sticky;bottom:0;background:#fff;padding-top:10px;border-top:1px solid var(--line)">
        <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:10px 12px;font-size:12px;color:#15803D">
          ✓ <b>Phiên đã chốt &amp; phân bổ</b>${run.confirmedAt ? ' lúc ' + new Date(run.confirmedAt).toLocaleString('vi-VN') : ''}. Xem lại phân bổ + in phiếu NCC ở trên. Xuất kho → giao shipper ở <b>bước ③</b>.
        </div>
      </div>
    </div>`;
    } else {
      body += `<div style="position:sticky;bottom:0;background:#fff;padding-top:10px;border-top:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-navy" onclick="window.pcSaveConfirm('${run.id}')">💾 Lưu</button>
        <button class="btn btn-primary" onclick="window.pcApplyAlloc(${jsq(run.id)})">✅ Chốt &amp; phân bổ về đơn + báo Sale</button>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:8px">💡 Bấm <b>chip NCC</b> để gán (chỉ hiện NCC bán mã đó, kèm giá · sỉ/lẻ, NCC mặc định đứng đầu) — 1 chạm. Cần 2 NCC cho 1 mã → <b>➕ Chia cho NCC thứ 2</b> rồi nhập số kg. <b>Tự cân:</b> NCC cuối tự nhận phần dư cho đủ tổng. "Giao thực" để trống = giao đủ.</div>
    </div>`;
    }

    const dc = document.getElementById('pcRunDetail');
    if (dc) dc.innerHTML = body;
    window._pcActiveRun = runId;
    document.querySelectorAll('.run-card[data-runid]').forEach(c => c.classList.toggle('pc-sel', c.dataset.runid === runId));
  };

  window.pcCloseDetail = function () {
    window._pcActiveRun = null;
    const dc = document.getElementById('pcRunDetail');
    if (dc) dc.innerHTML = '';
    document.querySelectorAll('.run-card[data-runid]').forEach(c => c.classList.remove('pc-sel'));
  };

  /* Đọc lý do thiếu + ghi chú từ DOM (giao thực/SL NCC lưu trực tiếp qua onchange của allocation) */
  function readConfirmInputs(run) {
    document.querySelectorAll('.pc-reason').forEach(sel => {
      const l = run.lines.find(x => x.key === sel.dataset.rkey);
      if (l) l.shortageReason = sel.value;
    });
    document.querySelectorAll('.pc-note').forEach(inp => {
      const l = run.lines.find(x => x.key === inp.dataset.rkey);
      if (l) l.note = inp.value;
    });
  }
  const _line = (run, key) => run.lines.find(x => x.key === key);

  /* ===== Thao tác phân bổ NCC cho 1 mã ===== */
  /* Tự gán NCC mặc định của mặt hàng, nhận toàn bộ */
  window.pcAutoStar = function (runId, key) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = _line(run, key); if (!l) return;
    autoStarAllocate(l);
    saveRuns(runs); renderRuns(); window.pcOpenRun(runId);
  };

  /* ===== CHỌN NHIỀU MÃ + GÁN HÀNG LOẠT ===== */
  window.pcUpdateSelCount = function () {
    const all = document.querySelectorAll('.pc-linechk');
    const n = document.querySelectorAll('.pc-linechk:checked').length;
    const el = document.getElementById('pcSelCount'); if (el) el.textContent = n + ' mã chọn';
    const chkAll = document.getElementById('pcChkAll'); if (chkAll) chkAll.checked = n > 0 && n === all.length;
  };
  window.pcToggleAllLines = function (on) {
    document.querySelectorAll('.pc-linechk').forEach(c => { c.checked = on; });
    window.pcUpdateSelCount();
  };
  function _selectedLineKeys() {
    return Array.from(document.querySelectorAll('.pc-linechk:checked')).map(c => c.dataset.key);
  }
  /* Gán 1 NCC (chọn từ dropdown) cho TẤT CẢ mã đã tick — qty = nhu cầu mỗi mã, giá lấy theo NCC nếu có khai */
  window.pcBulkAssign = function (runId) {
    const sel = document.getElementById('pcBulkSup'); const supId = sel && sel.value;
    if (!supId) { window.toast?.('Chọn NCC ở ô bên cạnh để gán', 'warn'); return; }
    const keys = _selectedLineKeys();
    if (!keys.length) { window.toast?.('Chưa tick mã nào — tick các mã cần gán trước', 'warn'); return; }
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const sup = getSuppliers().find(s => s.id === supId); if (!sup) return;
    const remember = !!(document.getElementById('pcBulkRemember') || {}).checked;
    const newProds = Array.isArray(sup.products) ? sup.products.slice() : [];
    let n = 0, learned = 0;
    keys.forEach(k => {
      const l = _line(run, k); if (!l) return;
      const p = (sup.products || []).find(pp => (l.productId && pp.id === l.productId) || norm(pp.name) === norm(l.name));
      l.allocations = [{ supplierId: sup.id, supplierName: sup.name, qty: l.totalQty, unitCost: p ? (+p.price || 0) : 0, confirmedQty: null }];
      n++;
      /* Ghi nhớ mapping NCC↔mã (chỉ khi NCC chưa khai mã này + có productId) → lần sau tự gán */
      if (remember && l.productId && !newProds.some(pp => pp.id === l.productId)) {
        newProds.push({ id: l.productId, name: l.name, price: 0 });
        learned++;
      }
    });
    if (remember && learned) window.STORE.update('suppliers', sup.id, { products: newProds });
    saveRuns(runs); renderRuns(); window.pcOpenRun(runId);
    window.toast?.(`✓ Đã gán NCC "${sup.name}" cho ${n} mã${learned ? ` · 🧠 ghi nhớ ${learned} mã mới` : ''}`, 'success');
  };
  /* Tự gán NCC mặc định cho mã đã tick (không tick → áp dụng cho TẤT CẢ mã) */
  window.pcAutoStarSelected = function (runId) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    let keys = _selectedLineKeys();
    const applyAll = !keys.length;
    if (applyAll) keys = run.lines.map(l => l.key);
    let n = 0, miss = 0;
    keys.forEach(k => {
      const l = _line(run, k); if (!l) return;
      if (suppliersForProduct(l.productId, l.name).length) { autoStarAllocate(l); n++; } else miss++;
    });
    saveRuns(runs); renderRuns(); window.pcOpenRun(runId);
    window.toast?.(`↻ Tự gán ${n} mã${applyAll ? ' (tất cả)' : ''}${miss ? ` · ${miss} mã chưa có NCC → thu mua ngoài` : ''}`, n ? 'success' : 'warn');
  };
  /* Thêm 1 dòng NCC chia phần (qty = phần còn thiếu) */
  window.pcAddAlloc = function (runId, key) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = _line(run, key); if (!l) return;
    if (!Array.isArray(l.allocations)) l.allocations = [];
    l.allocations.push({ supplierId: '', supplierName: '', qty: Math.max(0, remainOf(l)), unitCost: 0, confirmedQty: null });
    saveRuns(runs); window.pcOpenRun(runId);
  };
  window.pcDelAlloc = function (runId, key, ai) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = _line(run, key); if (!l || !l.allocations) return;
    l.allocations.splice(ai, 1);
    saveRuns(runs); window.pcOpenRun(runId);
  };
  window.pcSetAllocSup = function (runId, key, ai, name) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = _line(run, key); if (!l || !l.allocations[ai]) return;
    const s = resolveOrCreateSupplier(name);
    const a = l.allocations[ai];
    a.supplierId = s ? s.id : ''; a.supplierName = s ? s.name : '';
    /* lấy giá nhập của NCC cho mã này (nếu có khai) */
    if (s) { const p = (s.products || []).find(pp => (l.productId && pp.id === l.productId) || norm(pp.name) === norm(l.name)); if (p) a.unitCost = +p.price || a.unitCost || 0; }
    saveRuns(runs); renderRuns(); window.pcOpenRun(runId);
  };
  /* Chip 1-chạm: gán NCC (theo id) cho ô phân bổ ĐẦU của mã. Giá lấy theo khai của NCC. */
  window.pcPickAllocSup = function (runId, key, supId) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = _line(run, key); if (!l) return;
    const s = getSuppliers().find(x => x.id === supId); if (!s) return;
    const p = (s.products || []).find(pp => (l.productId && pp.id === l.productId) || norm(pp.name) === norm(l.name));
    const price = p ? (+p.price || 0) : 0;
    if (!Array.isArray(l.allocations) || !l.allocations.length) {
      l.allocations = [{ supplierId: s.id, supplierName: s.name, qty: l.totalQty, unitCost: price, confirmedQty: null }];
    } else {
      const a = l.allocations[0];
      a.supplierId = s.id; a.supplierName = s.name; a.unitCost = price;
      if (!(+a.qty > 0)) a.qty = l.totalQty;   /* ô đầu chưa có SL → nhận full */
    }
    saveRuns(runs); window.pcOpenRun(runId);
  };
  /* "＋ NCC khác": xoá NCC ở ô đầu → hiện ô GÕ TÊN (gán NCC ngoài danh sách bán mã này). */
  window.pcRevealFreeSup = function (runId, key) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = _line(run, key); if (!l) return;
    if (!Array.isArray(l.allocations) || !l.allocations.length) {
      l.allocations = [{ supplierId: '', supplierName: '', qty: l.totalQty, unitCost: 0, confirmedQty: null }];
    } else { const a = l.allocations[0]; a.supplierId = ''; a.supplierName = ''; }
    saveRuns(runs); window.pcOpenRun(runId);
  };
  window.pcSetAllocQty = function (runId, key, ai, val) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = _line(run, key); if (!l || !l.allocations[ai]) return;
    l.allocations[ai].qty = val === '' ? 0 : +val;
    /* TỰ CÂN: sửa 1 NCC KHÔNG phải dòng cuối → DÒNG CUỐI tự nhận phần dư để đủ tổng.
       (Sửa chính dòng cuối → để dư hiển thị "còn thiếu", chờ thêm NCC mới hấp thụ.) */
    const last = l.allocations.length - 1;
    if (ai < last && l.allocations.length > 1) {
      const sumExceptLast = l.allocations.reduce((s, a, idx) => idx === last ? s : s + (+a.qty || 0), 0);
      l.allocations[last].qty = +Math.max(0, l.totalQty - sumExceptLast).toFixed(2);
    }
    saveRun(run); window.pcOpenRun(runId);
  };
  window.pcSetAllocConf = function (runId, key, ai, val) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = _line(run, key); if (!l || !l.allocations[ai]) return;
    const _n = +val;
    l.allocations[ai].confirmedQty = (val === '' || !isFinite(_n)) ? null : Math.max(0, _n);
    saveRun(run); window.pcOpenRun(runId);
  };

  /* Tìm NCC theo tên (không phân biệt hoa/thường); nếu chưa có → tạo mới luôn */
  function resolveOrCreateSupplier(name) {
    name = (name || '').trim();
    if (!name) return null;
    const sups = getSuppliers();
    let s = sups.find(x => norm(x.name) === norm(name));
    if (!s) {
      s = { id: 'SUP' + Date.now().toString(36), name, active: true, products: [], phone: '', contact: '', address: '' };
      sups.push(s);
      S().set('suppliers', sups);
      window.toast?.('➕ Đã tạo NCC mới: ' + name, 'success');
    }
    return s;
  }

  /* Gán NCC cho 1 dòng SP — nhập tên (autocomplete), tạo mới nếu chưa có */
  window.pcSetLineSupByName = function (runId, key, name) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const l = run.lines.find(x => x.key === key); if (!l) return;
    const s = resolveOrCreateSupplier(name);
    l.supplierId = s ? s.id : ''; l.supplierName = s ? s.name : '';
    saveRuns(runs);
    renderRuns(); window.pcOpenRun(runId);
  };
  /* Giữ tương thích cũ (gán theo id) */
  window.pcSetLineSup = function (runId, key, supId) {
    const sup = getSuppliers().find(s => s.id === supId);
    window.pcSetLineSupByName(runId, key, sup ? sup.name : '');
  };
  /* Gán NCC hàng loạt cho SP chưa gán */
  window.pcBulkAssignSup = function (runId) {
    const inp = document.getElementById('pcBulkSup');
    const s = resolveOrCreateSupplier(inp ? inp.value : '');
    if (!s) { window.toast?.('Nhập tên NCC để gán', 'warn'); return; }
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    let n = 0;
    run.lines.forEach(l => { if (!l.supplierId) { l.supplierId = s.id; l.supplierName = s.name; n++; } });
    saveRuns(runs);
    window.toast?.('✓ Đã gán ' + n + ' SP cho ' + s.name, 'success');
    renderRuns(); window.pcOpenRun(runId);
  };

  window.pcSaveConfirm = function (runId) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    /* CHỈ lưu tiến độ — KHÔNG đổi status (giữ phiên ở danh sách đang gom).
       Chỉ "Chốt & phân bổ" mới đẩy sang Lịch sử. */
    if (_isDoneRun(run)) run.status = 'draft';   /* lỡ ở trạng thái done mà bấm Lưu lại → kéo về active */
    saveRuns(runs);
    window.toast?.('💾 Đã lưu tiến độ gán NCC cho ' + runId, 'success');
    window.pcOpenRun(runId);
  };

  /* Chốt: ghi SL phân bổ về từng đơn + note thiếu + báo Sale */
  const _applyBusy = new Set();   /* chống double-click chốt: pcApplyAlloc async (có await getOrderItems) */
  window.pcApplyAlloc = async function (runId) {
    const runs = getRuns(); const run = runs.find(r => r.id === runId); if (!run) return;
    /* GATE: đơn chưa tải xong từ cloud → KHÔNG ghi (tránh áp phân bổ lên cache rỗng rồi đè cloud). */
    if (!window.STORE.isPreloaded('orders')) {
      window.toast && window.toast('Đang tải dữ liệu đơn, thử lại sau vài giây', 'warn');
      return;
    }
    /* Chống double-click: phiên đang chốt → bỏ lần bấm thứ 2 (nếu không: ghi note thiếu 2 lần
       + gửi Telegram báo thiếu 2 lần, do status chỉ đổi 'applied' SAU await). */
    if (_applyBusy.has(runId)) return;
    _applyBusy.add(runId);
    try {
    readConfirmInputs(run);
    const orders = getOrders();
    /* Danh sách đơn KHÔNG kéo cột `items` (tối ưu tải) → PHẢI nạp items thật cho các đơn của
       phiên TRƯỚC khi ghi. Nếu không: it (line dưới) undefined → không ghi SL phân bổ, và
       freight = Σ items = 0 → XOÁ TIỀN đơn. Nạp lỗi 1 đơn nào đó → HỦY (không ghi sai). */
    const _fail = [];
    await Promise.all((run.orderCodes || []).map(async code => {
      const o = orders.find(x => x.code === code);
      if (!o) return;
      if (Array.isArray(o.items) && o.items.length) return;            /* đã có items (đơn vừa tạo) */
      const its = window.SB_DATA && window.SB_DATA.getOrderItems ? await window.SB_DATA.getOrderItems(code) : null;
      if (Array.isArray(its) && its.length) o.items = its;
      else _fail.push(code);
    }));
    if (_fail.length) {
      window.toast?.('⚠ Chưa tải được mặt hàng của đơn: ' + _fail.join(', ') + ' — thử lại (tránh ghi sai tiền/hàng).', 'warn');
      return;
    }
    const shortByOrder = {};   /* code → [ {name, short, reason} ] */
    run.lines.forEach(l => {
      const alloc = allocateLine(l);
      alloc.forEach(a => {
        const o = orders.find(x => x.code === a.code);
        if (!o) return;
        const it = (o.items || []).find(x => norm(x.name) === norm(l.name));
        if (it) {
          it.qty = a.give;
          it.total = Math.round(a.give * (+it.price || 0));
        }
        if (a.short > 0) {
          (shortByOrder[a.code] = shortByOrder[a.code] || []).push({ name: l.name, short: a.short, unit: l.unit, reason: (l.shortageReason || 'thiếu hàng') + (l.note ? ' — ' + l.note : '') });
        }
      });
    });
    /* cập nhật đơn: tổng tiền, note thiếu, whStatus */
    run.orderCodes.forEach(code => {
      const o = orders.find(x => x.code === code);
      if (!o) return;
      o.freight = (o.items || []).reduce((s, it) => s + (+it.total || 0), 0);
      o.whStatus = 'confirmed';
      const sh = shortByOrder[code];
      if (sh && sh.length) {
        o.shortages = sh;
        const txt = 'THIẾU: ' + sh.map(s => `${s.name} -${fmtQty(s.short)}${s.unit} (${s.reason})`).join('; ');
        o.note = (o.note ? o.note + ' · ' : '') + txt;
      }
    });
    S().set('orders', orders);
    run.status = 'applied';                       /* CHỐT & phân bổ xong → vào Lịch sử đã gom */
    run.confirmedAt = new Date().toISOString();
    saveRun(run);

    /* Báo Sale: gom theo đơn → 1 tin Telegram (kênh 'alert') */
    const shortCodes = Object.keys(shortByOrder);
    if (shortCodes.length && window.sendTgMessage) {
      const msg = `⚠️ BÁO THIẾU HÀNG — phiên ${run.id}\n` + shortCodes.map(code => {
        const o = orders.find(x => x.code === code);
        return `\n📦 ${code} · ${o ? o.custName : ''}\n` + shortByOrder[code].map(s => `   • ${s.name}: thiếu ${fmtQty(s.short)}${s.unit} — ${s.reason}`).join('\n');
      }).join('\n') + `\n\n👉 Sale báo lại khách + điều chỉnh nếu cần.`;
      window.sendTgMessage('alert', msg).then(r => {
        if (r.ok) window.toast?.('📨 Đã báo Sale ' + shortCodes.length + ' đơn thiếu vào "' + r.channel + '"', 'success');
      });
    }
    window.toast?.(`✅ Đã chốt ${run.id}: ghi SL về ${run.orderCodes.length} đơn` + (shortCodes.length ? ` · ${shortCodes.length} đơn thiếu` : ' · đủ hàng') + ' · đã chuyển sang Lịch sử đã gom', 'success');
    /* Phiên rời danh sách đang gom → vào Lịch sử; mở bước ③ để xuất kho */
    window._pcActiveRun = null;
    renderRuns(); renderRunHistory(); renderRelease(); _sumCache = null; renderSummary();
    window.pcCloseDetail && window.pcCloseDetail();
    } finally { _applyBusy.delete(runId); }
  };
  function closeDrawerSoft() { /* giữ drawer mở để xem; no-op */ }

  /* ===== Phiếu yêu cầu NCC ===== */
  /* Chia khách theo từng dòng phân bổ NCC (ưu tiên đơn đặt trước lấp đầy NCC theo thứ tự).
     Trả về mảng cùng index với line.allocations: mỗi phần tử = [{code,custName,qty}] */
  function custSplitForLine(l) {
    const slots = (l.allocations || []).map(a => ({ cap: +a.qty || 0, items: [] }));
    const custs = [...(l.breakdown || [])].sort((a, b) => (a.createdAt || a.code) < (b.createdAt || b.code) ? -1 : 1);
    let ai = 0;
    custs.forEach(c => {
      let need = +c.qty || 0;
      while (need > 0.0001 && ai < slots.length) {
        if (slots[ai].cap <= 0.0001) { ai++; continue; }
        const take = Math.min(need, slots[ai].cap);
        slots[ai].items.push({ code: c.code, custName: c.custName, qty: +take.toFixed(2) });
        slots[ai].cap = +(slots[ai].cap - take).toFixed(3);
        need = +(need - take).toFixed(3);
        if (slots[ai].cap <= 0.0001) ai++;
      }
    });
    return slots.map(s => s.items);
  }
  /* Gộp phần chia theo TÊN khách (1 khách có thể nằm ở >1 slot NCC) → 1 dòng túi/khách */
  function _mergeCusts(custs) {
    const m = new Map();
    (custs || []).forEach(x => { const k = x.custName || x.code || '?'; m.set(k, (m.get(k) || 0) + (+x.qty || 0)); });
    return [...m.entries()].map(([name, qty]) => ({ name, qty: +qty.toFixed(2) }));
  }
  /* Dữ liệu đặt hàng cho 1 NCC: gộp các mã NCC đó cung cấp + chia khách (cho NCC lẻ) */
  function supReqData(run, supId) {
    const sObj = getSuppliers().find(s => s.id === supId) || {};
    const supName = sObj.name || supId;
    const type = supplyTypeOf(supId);
    const items = [];
    run.lines.forEach(l => {
      const splits = custSplitForLine(l);
      let qty = 0, cost = 0; const custs = [];
      (l.allocations || []).forEach((a, ai) => {
        if (a.supplierId !== supId) return;
        qty += +a.qty || 0; cost += (+a.qty || 0) * (+a.unitCost || 0);
        (splits[ai] || []).forEach(x => custs.push(x));
      });
      if (qty > 0.0001) items.push({ name: l.name, unit: l.unit, productId: l.productId, qty: +qty.toFixed(2), unitCost: qty ? cost / qty : 0, custs });
    });
    return { lines: items, supName, type };
  }
  /* ===== THU MUA NGOÀI: các mã KHÔNG NCC nào cung cấp → bộ phận thu mua đi chợ/ngoài ===== */
  function extReqData(run) {
    const lines = (run.lines || [])
      .filter(l => suppliersForProduct(l.productId, l.name).length === 0)
      .map(l => ({
        name: l.name, unit: l.unit, qty: +(+l.totalQty || 0).toFixed(2),
        custs: (l.breakdown || []).map(b => ({ code: b.code, custName: b.custName, qty: +(+b.qty || 0).toFixed(2) })),
      }));
    return { lines };
  }
  window.pcCopyExtReq = function (runId) {
    const run = getRuns().find(r => r.id === runId); if (!run) return;
    const { lines } = extReqData(run);
    if (!lines.length) { window.toast && window.toast('Không có mã thu mua ngoài', 'info'); return; }
    const totalKg = lines.reduce((s, l) => s + l.qty, 0);
    const txt = `🛒 DANH SÁCH THU MUA NGOÀI — ${run.id}\n📅 ${new Date().toLocaleDateString('vi-VN')}\n────────────\n`
      + lines.map((l, i) => `${i + 1}. ${l.name}: ${fmtQty(l.qty)} ${l.unit}` + (l.custs.length ? `\n   Cho: ${l.custs.map(b => (b.custName || b.code) + ' ' + fmtQty(b.qty) + l.unit).join(' · ')}` : '')).join('\n')
      + `\n────────────\n📦 Tổng: ${fmtQty(totalKg)} kg\n⚠ Mua xong GHI RÕ GIÁ từng mã để cuối ngày nhập sổ (Phiếu nhập → Thu mua ngoài). Cảm ơn!\n— Nông Sản Tuấn Tú`;
    copyText(txt, 'danh sách thu mua ngoài');
  };
  window.pcPrintExtReq = function (runId) {
    const run = getRuns().find(r => r.id === runId); if (!run) return;
    const { lines } = extReqData(run);
    if (!lines.length) { window.toast && window.toast('Không có mã thu mua ngoài', 'info'); return; }
    const c = company();
    const today = new Date().toLocaleDateString('vi-VN');
    const rows = lines.map((l, i) => `<tr>
        <td class="stt">${i + 1}</td>
        <td><b>${esc(l.name)}</b></td>
        <td class="num"><b>${fmtQty(l.qty)}</b> ${l.unit}</td>
        <td style="font-size:11px;color:#555">${(l.custs || []).map(b => esc(b.custName || b.code) + ': ' + fmtQty(b.qty)).join(' · ')}</td>
        <td class="num" style="width:120px"></td>
      </tr>`).join('');
    const totalKg = lines.reduce((s, l) => s + l.qty, 0);
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>PHIẾU THU MUA NGOÀI</title>
<style>@page{size:A4;margin:14mm 12mm}*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif}
body{color:#1a1a1a;font-size:13px}.wrap{max-width:780px;margin:0 auto}
.top{display:flex;align-items:center;gap:14px;border-bottom:3px solid #B45309;padding-bottom:10px}
.top img{width:64px;height:64px;object-fit:contain}.brand h1{font-size:19px;color:#B45309;font-weight:800}.brand .sub{font-size:11px;color:#555;margin-top:4px}
.title{text-align:center;font-size:21px;font-weight:800;color:#B45309;letter-spacing:1px;margin:14px 0 2px}
.meta{display:flex;justify-content:space-between;font-size:12.5px;margin:8px 2px}.meta b{color:#B45309}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}th,td{border:1px solid #E5C99B;padding:7px 9px}
th{background:#B45309;color:#fff;font-size:12px;text-transform:uppercase}td.stt{text-align:center;width:40px;color:#777}td.num{text-align:center;font-weight:700;color:#B45309}
tbody tr:nth-child(even){background:#FFFBEB}tfoot td{background:#FEF3C7;font-weight:800;color:#B45309}
.note{font-size:11.5px;color:#555;margin-top:14px;line-height:1.6}</style></head><body><div class="wrap">
<div class="top"><img src="${c.logo}" onerror="this.style.display='none'"><div class="brand"><h1>${c.name}</h1><div class="sub">${esc(c.addr)} · ☎ ${esc(c.phone)}</div></div></div>
<div class="title">PHIẾU THU MUA NGOÀI</div>
<div class="meta"><div><b>Bộ phận:</b> Thu mua (chợ/vãng lai)</div><div><b>Ngày:</b> ${today} · Phiên ${run.id}</div></div>
<table><thead><tr><th style="width:40px">STT</th><th>Sản phẩm</th><th style="width:100px">Cần mua</th><th>Cho khách</th><th style="width:120px">Giá mua (₫/kg)</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="2" style="text-align:right">TỔNG</td><td class="num">${fmtQty(totalKg)} kg</td><td></td><td></td></tr></tfoot></table>
<div class="note">⚖️ Đơn vị tính: KILOGRAM (KG). Đây là các mặt hàng <b>chưa có NCC cố định</b> → mua ngoài.<br><b>Lưu ý:</b> điền GIÁ MUA thực tế từng mã ở cột cuối → cuối ngày nhập vào app (Phiếu nhập → 🛒 Thu mua ngoài) để vào sổ quỹ + tính giá vốn.</div>
</div></body></html>`;
    printViaIframe(html);
  };

  function company() {
    const ci = S().get('companyInfo', {}) || {};
    const origin = (typeof location !== 'undefined' && location.origin && location.origin !== 'null') ? location.origin : 'https://app.nongsantuantuhanoi.vn';
    return { name: 'NÔNG SẢN TUẤN TÚ HÀ NỘI', addr: ci.address || '36/147A Tân Mai, Hoàng Mai, Hà Nội', phone: ci.hotline || '0836 676 086', logo: ci.logo || (origin + '/assets/logo.png') };
  }

  window.pcPrintSupReq = function (runId, supKey) {
    const run = getRuns().find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const { lines, supName, type } = supReqData(run, supKey);
    const c = company();
    const today = new Date().toLocaleDateString('vi-VN');
    const isLe = type === 'le' || type === 'both';
    const colHd = isLe ? 'Túi theo khách (NCC đóng sẵn)' : 'Chi tiết theo đơn';
    const rows = lines.map((l, i) => `<tr>
        <td class="stt">${i + 1}</td>
        <td><b>${esc(l.name)}</b></td>
        <td class="num"><b>${fmtQty(l.qty)}</b> ${l.unit}</td>
        <td style="font-size:11px;color:#555">${isLe
          ? _mergeCusts(l.custs).map(b => esc(b.name) + ' - ' + fmtQty(b.qty) + l.unit).join(' · ')
          : (l.custs || []).map(b => esc(b.code) + ': ' + fmtQty(b.qty)).join(' · ')}</td>
      </tr>`).join('');
    const totalKg = lines.reduce((s, l) => s + l.qty, 0);
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>PHIẾU YÊU CẦU HÀNG</title>
<style>@page{size:A4;margin:14mm 12mm}*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif}
body{color:#1a1a1a;font-size:13px}.wrap{max-width:780px;margin:0 auto}
.top{display:flex;align-items:center;gap:14px;border-bottom:3px solid #1B5E20;padding-bottom:10px}
.top img{width:64px;height:64px;object-fit:contain}.brand h1{font-size:19px;color:#1B5E20;font-weight:800}.brand .sub{font-size:11px;color:#555;margin-top:4px}
.title{text-align:center;font-size:21px;font-weight:800;color:#1B5E20;letter-spacing:1px;margin:14px 0 2px}
.meta{display:flex;justify-content:space-between;font-size:12.5px;margin:8px 2px}.meta b{color:#1B5E20}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}th,td{border:1px solid #B6C9B0;padding:7px 9px}
th{background:#1B5E20;color:#fff;font-size:12px;text-transform:uppercase}td.stt{text-align:center;width:40px;color:#777}td.num{text-align:center;width:110px;font-weight:700;color:#1B5E20}
tbody tr:nth-child(even){background:#F4FAF2}tfoot td{background:#E8F5E9;font-weight:800;color:#1B5E20}
.note{font-size:11.5px;color:#555;margin-top:14px;line-height:1.6}</style></head><body><div class="wrap">
<div class="top"><img src="${c.logo}" onerror="this.style.display='none'"><div class="brand"><h1>${c.name}</h1><div class="sub">${esc(c.addr)} · ☎ ${esc(c.phone)}</div></div></div>
<div class="title">PHIẾU YÊU CẦU HÀNG</div>
<div class="meta"><div><b>Nhà cung cấp:</b> ${esc(supName)} <span style="font-weight:400;color:#555">(${TYPE_LABEL[type]})</span></div><div><b>Ngày:</b> ${today} · Phiên ${run.id}</div></div>
<table><thead><tr><th style="width:40px">STT</th><th>Sản phẩm</th><th style="width:110px">Số lượng</th><th>${colHd}</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="2" style="text-align:right">TỔNG</td><td class="num">${fmtQty(totalKg)} kg</td><td></td></tr></tfoot></table>
<div class="note">⚖️ Đơn vị tính: KILOGRAM (KG). ${isLe ? 'NCC <b>lẻ</b>: đóng gói SẴN theo từng khách như cột bên.' : 'NCC <b>sỉ</b>: đóng 1 lô theo tổng số lượng.'}<br>Đề nghị NCC xác nhận sản lượng có thể giao + báo sớm mặt hàng thiếu (trái mùa / hết hàng).</div>
</div></body></html>`;
    printViaIframe(html);
  };

  window.pcCopySupReq = function (runId, supKey) {
    const run = getRuns().find(r => r.id === runId); if (!run) return;
    readConfirmInputs(run);
    const { lines, supName, type } = supReqData(run, supKey);
    const isLe = type === 'le' || type === 'both';
    const totalKg = lines.reduce((s, l) => s + l.qty, 0);
    /* CÚ PHÁP "cả hai": mỗi SP ghi TỔNG (để NCC cân) + danh sách TÚI theo khách bên dưới
       (NCC lẻ đóng sẵn mỗi túi 1 khách). NCC sỉ: chỉ tổng (đóng 1 lô). */
    const body = lines.map(l => {
      const head = `🔸 ${l.name}: ${isLe ? 'TỔNG ' : ''}${fmtQty(l.qty)}${l.unit}`;
      if (!isLe) return head;
      const bags = _mergeCusts(l.custs).map(b => `   • ${b.name} - ${fmtQty(b.qty)}${l.unit}`).join('\n');
      return bags ? head + '\n' + bags : head;
    }).join('\n');
    const txt = `📋 ĐẶT HÀNG — ${run.id}\n🏭 NCC: ${supName} (${isLe ? 'Lẻ — đóng túi theo khách' : 'Sỉ — gộp tổng'})\n📅 ${new Date().toLocaleDateString('vi-VN')}\n────────────\n`
      + body
      + `\n────────────\n📦 Tổng đơn: ${fmtQty(totalKg)} kg`
      + (isLe ? `\n👉 NCC LẺ đóng gói SẴN theo từng khách (mỗi • = 1 túi).` : `\n👉 NCC SỈ đóng 1 lô theo tổng.`)
      + ` Báo sớm mã thiếu giúp mình. Cảm ơn!\n— Nông Sản Tuấn Tú`;
    copyText(txt, 'tin đặt NCC (Zalo)');
  };

  /* ============ ③ XUẤT KHO → SHIP ============ */
  function renderRelease() {
    const host = document.getElementById('pcRelease');
    /* đơn đã chốt hàng (confirmed) chờ xuất kho */
    const orders = getOrders().filter(o => o.whStatus === 'confirmed' && o.status !== 'cancelled');
    if (!orders.length) { host.innerHTML = `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:40px;text-align:center;color:var(--muted)">Chưa có đơn nào đã chốt hàng. Hoàn tất xác nhận NCC ở tab ② trước.</div>`; return; }
    host.innerHTML = `<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">Đơn đã chốt sản lượng — tạo phiếu xuất kho (có ca/giờ giao) rồi giao shipper.</div>` +
      orders.map(o => {
        /* Danh sách đơn không kéo items → kg từ `weight`, mã từ `goods` (đơn đã chốt) */
        const hasItems = Array.isArray(o.items) && o.items.length;
        const kg = hasItems ? o.items.reduce((s, it) => s + (+it.qty || 0), 0) : (+o.weight || 0);
        const nMa = hasItems ? o.items.length : (o.goods || '').split(',').filter(s => s.trim()).length;
        const hasShort = o.shortages && o.shortages.length;
        return `<div class="run-card" style="cursor:default">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="font-weight:800;color:var(--navy)">${o.code}</div>
            <span style="font-size:12.5px;color:var(--muted)">${esc(o.custName || '')}</span>
            ${o.shipShift ? `<span class="tag" style="background:#FEF3C7;color:#92400E">Ca ${esc(o.shipShift)}${o.shipTime ? ' · ' + esc(o.shipTime) : ''}</span>` : ''}
            ${hasShort ? `<span class="tag" style="background:#FEE2E2;color:#B91C1C">⚠ thiếu ${o.shortages.length} mã</span>` : ''}
            <div style="flex:1"></div>
            <span style="font-size:12px;color:var(--muted)">${nMa} mã · ${fmtQty(kg)} kg</span>
            <button class="btn btn-ghost btn-sm" onclick="window.pcReturnToGom('${o.code}')" title="Trả đơn về giai đoạn ② (gán lại NCC)">↩ Trả về gom</button>
            <button class="btn btn-ghost btn-sm" onclick="window.pcEditOrder('${o.code}')" title="Sửa đơn (nhập sai)">✏️ Sửa</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="window.pcDeleteOrder('${o.code}')" title="Xoá hẳn đơn này">🗑 Xoá</button>
            <button class="btn btn-navy btn-sm" onclick="window.pcPrintRelease('${o.code}')">🖨 Phiếu xuất kho</button>
            <button class="btn btn-primary btn-sm" onclick="window.pcDispatch('${o.code}')">🛵 Giao shipper</button>
          </div>
        </div>`;
      }).join('');
  }

  /* Sửa đơn (nhập sai) → mở chi tiết đơn ở trang Đơn hàng */
  window.pcEditOrder = function (code) {
    window.location.href = 'orders.html?open=' + encodeURIComponent(code);
  };
  /* Xoá hẳn đơn nhập sai — gỡ khỏi mọi phiên gom + xoá khỏi store */
  window.pcDeleteOrder = function (code) {
    const o = getOrders().find(x => x.code === code); if (!o) return;
    if (!confirm(`Xoá HẲN đơn ${code}${o.custName ? ' — ' + o.custName : ''}?\nKhông khôi phục được. Dùng khi đơn nhập sai.`)) return;
    /* gỡ đơn khỏi các phiên gom (orderCodes + breakdown + tính lại totalQty) */
    const runs = getRuns(); let rch = false;
    runs.forEach(r => {
      if (Array.isArray(r.orderCodes) && r.orderCodes.includes(code)) {
        r.orderCodes = r.orderCodes.filter(c => c !== code);
        (r.lines || []).forEach(l => {
          if (Array.isArray(l.breakdown)) {
            const before = l.breakdown.length;
            l.breakdown = l.breakdown.filter(b => b.code !== code);
            if (l.breakdown.length !== before) l.totalQty = +l.breakdown.reduce((s, b) => s + (+b.qty || 0), 0).toFixed(2);
          }
        });
        rch = true;
      }
    });
    if (rch) saveRuns(runs);
    window.STORE.remove('orders', code);
    window.toast?.('🗑 Đã xoá đơn ' + code, 'danger');
    renderAll();
  };

  let _printBusy = false;
  window.pcPrintRelease = async function (code) {
    if (_printBusy) return;   /* chống double-click: async (await getOrderItems) → tránh mở 2 cửa in */
    _printBusy = true;
    try {
    const o = getOrders().find(x => x.code === code); if (!o) return;
    const c = company();
    /* Danh sách đơn không kéo items → nạp lazy để phiếu xuất kho không in rỗng */
    let items = (Array.isArray(o.items) && o.items.length) ? o.items : null;
    if (!items && window.SB_DATA && window.SB_DATA.getOrderItems) {
      const its = await window.SB_DATA.getOrderItems(code);
      items = Array.isArray(its) ? its : [];
    }
    items = items || [];
    const totalKg = items.reduce((s, it) => s + (+it.qty || 0), 0);
    const rows = items.map((it, i) => `<tr><td class="stt">${i + 1}</td><td><b>${esc(it.name)}</b></td><td class="num">${fmtQty(it.qty)} ${it.unit || 'kg'}</td></tr>`).join('');
    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>PHIẾU XUẤT KHO</title>
<style>@page{size:A4;margin:14mm 12mm}*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif}
body{color:#1a1a1a;font-size:13px}.wrap{max-width:780px;margin:0 auto}
.top{display:flex;align-items:center;gap:14px;border-bottom:3px solid #1B5E20;padding-bottom:10px}
.top img{width:64px;height:64px;object-fit:contain}.brand h1{font-size:19px;color:#1B5E20;font-weight:800}.brand .sub{font-size:11px;color:#555;margin-top:4px}
.title{text-align:center;font-size:21px;font-weight:800;color:#1B5E20;letter-spacing:1px;margin:14px 0 2px}
.metabox{border:1px solid #CBD9C4;border-radius:8px;padding:10px 14px;margin:8px 0;background:#F7FBF5}
.meta{display:flex;justify-content:space-between;gap:18px;font-size:12.5px;line-height:1.9}.meta b{color:#1B5E20}
.ship{background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:700;color:#92400E;margin:6px 0 10px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #B6C9B0;padding:7px 10px}
th{background:#1B5E20;color:#fff;font-size:12px;text-transform:uppercase}td.stt{text-align:center;width:46px;color:#777}td.num{text-align:center;width:120px;font-weight:700;color:#1B5E20}
tbody tr:nth-child(even){background:#F4FAF2}tfoot td{background:#E8F5E9;font-weight:800;color:#1B5E20}
.sig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:34px;text-align:center;font-size:11.5px}.sig .role{font-weight:700;color:#1B5E20}.sig .l{margin-top:46px;border-top:1px dotted #aaa}</style></head><body><div class="wrap">
<div class="top"><img src="${c.logo}" onerror="this.style.display='none'"><div class="brand"><h1>${c.name}</h1><div class="sub">${esc(c.addr)} · ☎ ${esc(c.phone)}</div></div></div>
<div class="title">PHIẾU XUẤT KHO</div>
<div class="metabox"><div class="meta"><div><b>Khách hàng:</b> ${esc(o.custName || '')}</div><div><b>Mã đơn:</b> ${o.code}</div></div>
<div class="meta"><div><b>Giao đến:</b> ${esc(o.drop || '')}</div><div><b>SĐT:</b> ${esc(o.custPhone || '')}</div></div></div>
<div class="ship">🚚 Giao: ${esc(o.deliverDate || '...')} · Ca ${esc(o.shipShift || '...')}${o.shipTime ? ' · ' + esc(o.shipTime) : ''} · Shipper: ${esc(o.driverName || '............')}</div>
<table><thead><tr><th style="width:46px">STT</th><th>Sản phẩm</th><th style="width:120px">Số lượng</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td colspan="2" style="text-align:right">TỔNG SẢN LƯỢNG</td><td class="num">${fmtQty(totalKg)} kg</td></tr></tfoot></table>
${o.shortages && o.shortages.length ? `<div style="margin-top:10px;font-size:11.5px;color:#B91C1C"><b>⚠ Lưu ý thiếu:</b> ${o.shortages.map(s => esc(s.name) + ' -' + fmtQty(s.short) + s.unit + ' (' + esc(s.reason) + ')').join('; ')}</div>` : ''}
<div class="sig"><div><div class="role">Thủ kho xuất</div><div class="l"></div></div><div><div class="role">Shipper nhận</div><div class="l"></div></div><div><div class="role">Khách nhận</div><div class="l"></div></div></div>
</div></body></html>`;
    printViaIframe(html);
    } finally { _printBusy = false; }
  };

  window.pcDispatch = function (code) {
    const orders = getOrders(); const o = orders.find(x => x.code === code); if (!o) return;
    o.whStatus = 'released';
    o.status = 'pickup';   /* vào pipeline giao hàng */
    S().set('orders', orders);
    /* CHỈ TẠI ĐÂY (gom xong → giao shipper) mới bắn group + phân đơn shipper.
       Dùng format chung "ĐƠN MỚI CẦN GIAO" (có shipper, chống gửi trùng). */
    if (window.sendShipperDispatch) {
      window.sendShipperDispatch(o).then(r => {
        window.toast?.(r && r.ok ? (r.dup ? '🛵 ' + code + ' đã phân giao trước đó' : '🛵 Đã giao shipper ' + code + ' (đã báo group)') : 'Đã chuyển ' + code + ' sang giao (chưa cấu hình TG shipper)', r && r.ok ? 'success' : 'info');
      });
    } else {
      window.toast?.('Đã chuyển ' + code + ' sang Đang giao', 'success');
    }
    renderRelease();
  };

  /* ===== Helpers in/copy ===== */
  function printViaIframe(html) {
    const old = document.getElementById('pcPrintFrame'); if (old) old.remove();
    const f = document.createElement('iframe');
    f.id = 'pcPrintFrame';
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const doc = f.contentWindow.document; doc.open(); doc.write(html); doc.close();
    const fire = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { } };
    const img = doc.querySelector('img');
    if (img && !img.complete) { img.onload = () => setTimeout(fire, 120); img.onerror = () => setTimeout(fire, 120); }
    else setTimeout(fire, 250);
    window.toast?.('🖨 Mở hộp in — bỏ tick "Headers and footers" để ẩn ngày/URL', 'info');
  }
  function copyText(txt, label) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(() => window.toast?.('📋 Đã copy ' + label + ' — dán vào Zalo/SMS', 'success'))
        .catch(() => fallbackCopy(txt, label));
    } else fallbackCopy(txt, label);
  }
  function fallbackCopy(txt, label) {
    const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); window.toast?.('📋 Đã copy ' + label, 'success'); } catch (e) { window.toast?.('Không copy được — bôi đen thủ công', 'warn'); }
    ta.remove();
  }
  window.closeDrawer = function () {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawerBg').classList.remove('open');
  };

  /* Hook cho bộ test node (scratchpad/test_wh_procure.js). Không dùng lúc chạy thật. */
  window.__whTest = { kgPair, pairLabel, kgFactorOf, whCfg, targetDeliverKey, cutoffHourFor,
    suppliersForProduct, autoAllocate, callDataForRun, leAllText, siText, isBuyOutside, supplyTypeOf, isPaused,
    callPanesHTML, ordersForDate, confirmedOf, allocateLine, linesToOrders };

  /* ===== Init ===== */
  function init() {
    if (window.renderAppShell) window.renderAppShell('procurement', 'Gom hàng → NCC');
    renderAll();
    /* refresh khi STORE đổi (realtime) */
    S().subscribe?.('orders', () => { _sumCache = null; renderSummary(); renderRelease(); });
    S().subscribe?.('procurementRuns', () => { renderRuns(); renderRelease(); });
    S().subscribe?.('whProcure', () => { _sumCache = null; renderSummary(); renderRuns(); });
    S().subscribe?.('supplierMeta', () => { _sumCache = null; renderSummary(); renderRuns(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
