/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Tạo FILE BÁO GIÁ (đúng template catalogue)
   Dựng 1 file HTML self-contained (ảnh nhúng base64) y hệt mẫu báo giá,
   chỉ thay GIÁ theo bảng giá ngày. Tải về máy + gửi Telegram dạng document.
   window.PriceCatalogue.export(dateISO)
   ========================================================= */
(function () {
  const CSS = `
*{box-sizing:border-box;margin:0;padding:0;
  -webkit-print-color-adjust:exact !important;
  print-color-adjust:exact !important;
  color-adjust:exact !important}
body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1c2b22;background:#f4f7f3;line-height:1.45;
  -webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}
.wrap{max-width:1180px;margin:0 auto;padding:0 16px 60px}
header{background:linear-gradient(135deg,#1f7a3d,#2fae5a);color:#fff;padding:22px 0;margin-bottom:18px;box-shadow:0 2px 14px rgba(0,0,0,.12)}
header .wrap{padding-bottom:0}
.hwrap{display:flex;align-items:center;gap:20px}
.logo{width:96px;height:96px;border-radius:50%;flex:none;background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.logo img{width:100%;height:100%;border-radius:50%;display:block}
.hbody{flex:1;min-width:0}
.brand{font-size:21px;font-weight:800;letter-spacing:.3px;color:#fff}
.brand .en{font-size:13.5px;font-weight:600;opacity:1;display:block;margin-top:3px;font-style:normal;color:#FFE082 !important;letter-spacing:.6px;text-shadow:0 1px 2px rgba(0,0,0,0.2)}
.meta{display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:11px;font-size:13px}
.badge{background:rgba(255,255,255,.18);padding:5px 12px;border-radius:20px;font-weight:600}
a.badge{color:#fff;text-decoration:none}
.note{margin-top:11px;font-size:12.5px;background:rgba(255,255,255,.12);padding:8px 12px;border-radius:8px}
.intro{background:#fff;border:1px solid #e6ece6;border-radius:14px;padding:18px 20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.intro .lead{font-size:14px;color:#3a4b40}
.vat{margin-top:14px;background:#f3f9f4;border:1px solid #d8ebdd;border-radius:12px;padding:14px 16px}
.vat h3{font-size:15px;color:#1f7a3d;margin-bottom:10px}
.vatgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.vatcard{background:#fff;border:1px solid #e2ece4;border-radius:10px;padding:10px 14px}
.vh{font-weight:800;color:#16261c;font-size:13.5px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px dashed #d8ebdd}
.vatcard ul{list-style:none}
.vatcard li{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px;color:#3a4b40;padding:5px 0}
.vatcard li b{font-size:13px;padding:2px 11px;border-radius:20px;color:#fff;flex:none}
.t0{background:#2c8a48}.t5{background:#0277bd}.t8{background:#d0491f}
.vatnote{font-size:12.5px;color:#5a6b60;margin-top:10px;font-style:italic}
@media(max-width:560px){.vatgrid{grid-template-columns:1fr}.logo{width:74px;height:74px}.brand{font-size:18px}}
.toolbar{position:sticky;top:0;z-index:20;background:#f4f7f3;padding:12px 0;display:flex;flex-wrap:wrap;gap:10px;align-items:center;border-bottom:1px solid #e0e7e0}
#q{flex:1;min-width:200px;padding:10px 14px;border:1px solid #cdd8cd;border-radius:10px;font-size:14px;outline:none}
.nav{display:flex;flex-wrap:wrap;gap:6px}
.nav a{font-size:12.5px;text-decoration:none;color:#1f7a3d;border:1px solid #bfe0c8;padding:6px 11px;border-radius:20px;white-space:nowrap}
.nav a:hover{background:#1f7a3d;color:#fff}
h2.sec{font-size:18px;color:#fff;background:#2c8a48;padding:10px 16px;border-radius:10px;margin:26px 0 12px;display:flex;align-items:baseline;gap:10px}
h2.sec span{font-weight:500;opacity:.85;font-size:13px}
h2.sec i{margin-left:auto;font-style:normal;font-size:12px;font-weight:600;background:rgba(255,255,255,.22);padding:2px 10px;border-radius:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px}
.card{background:#fff;border:1px solid #e6ece6;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.imgwrap{position:relative;aspect-ratio:1/1;background:#eef3ee;overflow:hidden}
.imgwrap img{width:100%;height:100%;object-fit:cover;display:block}
.noimg{display:flex;align-items:center;justify-content:center;height:100%;color:#9bb0a0;font-size:12px}
.stt{position:absolute;top:8px;left:8px;background:rgba(31,122,61,.92);color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px}
.info{padding:10px 12px 12px;display:flex;flex-direction:column;gap:2px;flex:1}
.vn{font-weight:700;font-size:13.5px;color:#16261c}
.en{font-size:12px;color:#1565c0;font-weight:600;font-style:italic;flex:1}
.price{margin-top:6px;display:flex;align-items:baseline;gap:6px}
.price b{font-size:16px;color:#d0491f;font-weight:800}
.price .unit{font-size:11px;color:#8a9a8e}
.price .old{font-size:11.5px;color:#9aa;text-decoration:line-through}
footer{margin-top:34px;font-size:12.5px;color:#4a5b50;background:#fff;border:1px solid #e6ece6;border-radius:14px;padding:18px}
footer b{color:#1f7a3d}
.empty{text-align:center;color:#8a9a8e;padding:40px;display:none}
@media(max-width:520px){.grid{grid-template-columns:repeat(auto-fill,minmax(46%,1fr))}}`;

  const CAT_MAP = {
    'rau-ta': ['HÀNG RAU TA', 'LOCAL VEGETABLES'],
    'rau-dalat': ['RAU ĐÀ LẠT', 'DALAT VEGETABLES'],
    'nam': ['HÀNG NẤM', 'MUSHROOM'],
    'rau-vung-mien': ['RAU VÙNG MIỀN', 'REGIONAL VEGETABLES'],
    'rau-gia-vi': ['RAU GIA VỊ', 'HERBS & SPICES'],
    'rau-la': ['RAU LÁ', 'LEAFY VEGETABLES'],
    'hang-khac': ['HÀNG KHÁC', 'OTHER'],
    'thit-lon': ['THỊT LỢN', 'PORK'],
    'thit-ga': ['THỊT GÀ', 'CHICKEN'],
    'thit-bo': ['THỊT BÒ', 'BEEF'],
    'khac': ['KHÁC', 'OTHER'],
  };

  /* LOGO TUẤN TÚ FARM — ưu tiên PNG thật của user (data/brand-logo.js)
     Fallback SVG đơn giản nếu chưa load */
  function getLogo() {
    /* Logo thương hiệu chính thức (assets/logo.png) — dùng chung mọi hoá đơn. */
    return window.BRAND_LOGO_DATAURL || ((location.origin || '') + '/assets/logo-icon.png?v=485');
  }

  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fmt = n => (n || 0).toLocaleString('vi-VN');
  const fmtD = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
  const ddmmyy = iso => { const [y, m, d] = iso.split('-'); return `${d}-${m}-${y}`; };

  function entryOn(p, dateISO) {
    const h = p.priceHistory || []; if (!h.length) return null;
    const s = [...h].sort((a, b) => a.date < b.date ? -1 : 1); let c = null;
    for (const e of s) if (e.date <= dateISO) c = e; return c || s[0];
  }
  function prevOn(p, dateISO) {
    const s = [...(p.priceHistory || [])].sort((a, b) => a.date < b.date ? -1 : 1); let pr = null;
    for (const e of s) if (e.date < dateISO) pr = e; return pr;
  }
  /* ============ Convert ảnh → data URL ============
     Chiến lược 2 tầng để chống mọi loại lỗi:
     1. Image + Canvas (robust, work cả http/file/blob) — compress JPEG 0.75 để file nhỏ
     2. Fallback fetch + blob nếu canvas tainted (CORS) — chỉ dùng khi 1 fail
     Ảnh nén từ ~80KB → ~25KB · file HTML 120 SP còn ~3MB (gửi Telegram OK)
  ============================================================ */
  function imgViaCanvas(url, maxSize) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const M = maxSize || 320;
          const ratio = Math.min(1, M / Math.max(img.width, img.height));
          const w = Math.round(img.width * ratio);
          const h = Math.round(img.height * ratio);
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          /* Compress JPEG 0.75 — tốt cho ảnh SP */
          const data = c.toDataURL('image/jpeg', 0.75);
          resolve(data && data.length > 100 ? data : null);
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  async function imgViaFetch(url) {
    try {
      const r = await fetch(url, { cache: 'reload' });
      if (!r.ok) return null;
      const b = await r.blob();
      if (!b || !b.size) return null;
      return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); });
    } catch (e) { return null; }
  }

  async function imgDataURL(url) {
    /* Resolve relative URL về absolute để Image load đúng */
    let abs = url;
    if (url && !url.startsWith('http') && !url.startsWith('data:')) {
      const base = location.origin + location.pathname.replace(/\/pages\/[^\/]+$/, '/');
      abs = url.startsWith('../') ? base + url.slice(3) : base + url;
    }
    /* Tầng 1: Image + Canvas (robust nhất) */
    let data = await imgViaCanvas(abs);
    if (data) return data;
    /* Tầng 2: fetch + blob */
    data = await imgViaFetch(abs);
    return data;
  }
  /* Fetch song song có GIỚI HẠN (browser cap ~6/origin) — ưu tiên PRODUCT_IMAGES embed trước */
  async function fetchImagesPooled(products, concurrency, onProgress) {
    const map = {}; let done = 0, fail = 0;
    const queue = [];
    /* === TẦNG 0: dùng PRODUCT_IMAGES (base64 embed sẵn) — instant, không fetch ===
       Lazy-load nếu chưa có (tránh block 3.8MB sync trên page load). */
    const embedded = window.PRODUCT_IMAGES
      || (window.loadProductImages ? await window.loadProductImages() : {});
    products.forEach(p => {
      if (embedded[p.id]) {
        map[p.id] = embedded[p.id];   /* HIT — không cần fetch */
      } else if (p.img) {
        queue.push(p);                /* MISS — fetch sau */
      }
    });
    /* Báo progress lần đầu cho embedded */
    done = Object.keys(map).length;
    if (onProgress) onProgress(done, products.length, 0);

    async function worker() {
      while (queue.length) {
        const p = queue.shift();
        const data = await imgDataURL(p.img);
        if (data) map[p.id] = data; else fail++;
        done++;
        if (onProgress) onProgress(done, products.length, fail);
      }
    }
    const workers = Array.from({ length: concurrency }, worker);
    await Promise.all(workers);
    return { map, done, fail };
  }

  async function buildHTML(dateISO, opts) {
    opts = opts || {};
    const products = window.STORE.get('products', window.PRODUCTS || []);
    const cats = window.PRODUCT_CATEGORIES || window.SERVICE_TYPES || [];
    const { map: imgMap, done, fail } = await fetchImagesPooled(products, 8, opts.onProgress);
    if (fail) console.warn(`[PriceCatalogue] ${fail}/${products.length} ảnh không tải được — card sẽ hiện "No image"`);
    if (opts.onProgress) opts.onProgress(done, products.length, fail, true);

    const end = new Date(dateISO); end.setDate(end.getDate() + 6);
    const range = `${fmtD(dateISO)} – ${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}/${end.getFullYear()}`;

    let stt = 0;
    const sections = cats.map((cat, ci) => {
      const items = products.filter(p => p.cat === cat.id);
      if (!items.length) return '';
      const [vn, en] = CAT_MAP[cat.id] || [(cat.label || cat.id).toUpperCase(), ''];
      const cards = items.map(p => {
        stt++;
        const cur = entryOn(p, dateISO);
        /* opts.priceFn(p) override giá (vd bảng giá Marketing) — KHÔNG đụng giá đơn */
        const sell = opts.priceFn ? (opts.priceFn(p) || 0) : (cur ? cur.sell : 0);
        const prev = prevOn(p, dateISO); const old = (!opts.priceFn && prev && prev.sell !== sell) ? prev.sell : null;
        const img = imgMap[p.id];
        const imgEl = img ? `<img loading="lazy" src="${img}" alt="${esc(p.name)}">` : `<div class="noimg">No image</div>`;
        return `<div class="card" data-s="${esc((p.name + ' ' + (p.en || '')).toLowerCase())}"><div class="imgwrap">${imgEl}<span class="stt">${stt}</span></div><div class="info"><div class="vn">${esc(p.name)}</div><div class="en">${esc(p.en || '')}</div><div class="price">${old ? `<span class="old">${fmt(old)}</span>` : ''}<b>${fmt(sell)}</b><span class="unit">đ/${esc(p.unit || 'kg')}</span></div></div></div>`;
      }).join('');
      return `<h2 class="sec" id="cat${ci}">${vn} <span>${en}</span><i>${items.length}</i></h2><div class="grid">${cards}</div>`;
    }).join('');

    const nav = cats.map((c, ci) => products.some(p => p.cat === c.id)
      ? `<a href="#cat${ci}">${(CAT_MAP[c.id] || [(c.label || c.id).toUpperCase()])[0]}</a>` : '').join('');

    const SEARCH_JS = `const q=document.getElementById('q'),cards=[...document.querySelectorAll('.card')],empty=document.getElementById('empty');q.addEventListener('input',()=>{const t=q.value.trim().toLowerCase();let n=0;cards.forEach(c=>{const m=!t||c.dataset.s.includes(t);c.style.display=m?'':'none';if(m)n++;});empty.style.display=n?'none':'block';});`;

    const FAV = window.NSTT_FAVICON_DATAURL || '';
    return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Báo giá Nông sản — Tuấn Tú Hà Nội ${fmtD(dateISO)}</title>${FAV ? `<link rel="icon" type="image/svg+xml" href="${FAV}">` : ''}<style>${CSS}</style></head><body>
<header><div class="wrap hwrap">
<div class="logo"><img src="${getLogo()}" alt="Tuấn Tú Farm"></div>
<div class="hbody">
<div class="brand">CÔNG TY TNHH XUẤT NHẬP KHẨU – NÔNG SẢN TUẤN TÚ HÀ NỘI<span class="en">TUAN TU HANOI AGRICULTURAL IMPORT-EXPORT CO., LTD.</span></div>
<div class="meta">
<span class="badge">Mã số thuế / Tax Code: 0110302211</span>
<span class="badge">Bảng giá áp dụng / Valid: ${range}</span>
<span class="badge">${products.length} sản phẩm / items</span>
${opts.tierName ? `<span class="badge" style="background:#1B5E20;color:#fff">Bảng giá: ${opts.tierName}</span>` : ''}
<a class="badge" href="https://nongsantuantuhanoi.com" target="_blank" rel="noopener">🌐 nongsantuantuhanoi.com</a>
</div>
<div class="note">📌 Tất cả các mã hàng đều được tính đơn vị là KG. &nbsp;|&nbsp; All items are priced per KILOGRAM (KG).</div>
</div></div></header>
<div class="wrap">
<section class="intro">
<p class="lead"><b>Nông sản Tuấn Tú Hà Nội</b> chuyên cung cấp nông sản tươi sống & thực phẩm thiết yếu — rau củ quả, thịt, nấm, gạo… phục vụ bếp ăn, nhà hàng và khách hàng cá nhân tại Hà Nội.</p>
<div class="vat"><h3>🧾 Thuế suất khi xuất hóa đơn VAT</h3>
<div class="vatgrid">
<div class="vatcard"><div class="vh">Doanh nghiệp</div><ul>
<li><span>Rau củ – nông sản, Thịt, Trứng, Gạo</span> <b class="t0">0%</b></li>
<li><span>Sản phẩm chế biến (Bún, Phở)</span> <b class="t8">8%</b></li></ul></div>
<div class="vatcard"><div class="vh">Hộ kinh doanh</div><ul>
<li><span>Rau củ – nông sản, Thịt, Trứng, Gạo</span> <b class="t5">5%</b></li>
<li><span>Sản phẩm chế biến (Bún, Phở)</span> <b class="t8">8%</b></li></ul></div>
</div>
<p class="vatnote">Giá có thể thay đổi theo ngày. Vui lòng liên hệ để được báo giá & hỗ trợ hóa đơn nhanh nhất.</p></div>
</section>
<div class="toolbar"><input id="q" type="search" placeholder="🔍 Tìm sản phẩm / Search product (VN hoặc EN)…"><nav class="nav">${nav}</nav></div>
${sections}
<div class="empty" id="empty">Không tìm thấy sản phẩm.</div>
<footer>📞 Đặt hàng / Order: <b>0836 676 086</b> &nbsp;|&nbsp; ✉️ nongsantuantuhanoi@gmail.com &nbsp;|&nbsp; 📍 36/147A Tân Mai, Hoàng Mai, Hà Nội<br>🌐 <b>nongsantuantuhanoi.com</b> — Bảng giá ${fmtD(dateISO)}, hiệu lực ${range}.</footer>
</div>
<script>${SEARCH_JS}</script>
</body></html>`;
  }

  window.PriceCatalogue = {
    build: buildHTML,

    /* ============ Xuất PDF — mở print window + window.print() ============
       Khác export HTML: KHÔNG download file .html, mà mở popup print →
       browser sẽ hiện dialog Print → user chọn "Save as PDF" → có file PDF.
       Ưu điểm: chuẩn PDF, gửi mail/in trực tiếp được, không cần Microsoft.
    ============================================================ */
    async exportPDF(dateISO, opts) {
      opts = opts || {};
      dateISO = dateISO || (window.todayISO ? window.todayISO() : '2026-05-18');
      let progEl = null;
      const onProgress = (done, total, fail, finalCall) => {
        if (!progEl) {
          window.toast(`⏳ Đang dựng PDF (0/${total} ảnh)…`, 'info');
          const c = document.getElementById('toast-container');
          progEl = c && c.lastElementChild;
        }
        if (progEl) {
          const lbl = progEl.querySelector('.lbl') || progEl;
          lbl.innerHTML = `⏳ PDF: nhúng ảnh <b>${done}/${total}</b>${fail?' · '+fail+' lỗi':''}${finalCall?' ✓':''}`;
          if (finalCall) setTimeout(() => progEl && progEl.remove(), 800);
        }
      };
      const html = await buildHTML(dateISO, { onProgress, forPrint: true, priceFn: opts.priceFn, tierName: opts.tierName });
      /* Inject print CSS — ÉP GIỮ MÀU NỀN + bố cục đẹp khi in PDF */
      const printCss = `<style>
        @page { size: A4; margin: 8mm 6mm; }

        /* === TOP-LEVEL: ép browser GIỮ background color/image khi in === */
        *, *::before, *::after {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        html, body {
          background: #fff !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        @media print {
          .toolbar { display: none !important; }
          .no-print { display: none !important; }

          /* HEADER — giữ gradient xanh */
          header {
            background: linear-gradient(135deg,#1f7a3d,#2fae5a) !important;
            color: #fff !important;
            padding: 14px 0 !important;
            margin-bottom: 10px !important;
            -webkit-print-color-adjust: exact !important;
            page-break-after: avoid !important;
          }
          header * { color: #fff !important; }
          /* Chữ EN brand: vàng nhạt nổi trên xanh — KHÔNG override bằng #fff */
          .brand .en {
            color: #FFE082 !important;
            opacity: 1 !important;
            font-weight: 600 !important;
            text-shadow: 0 1px 2px rgba(0,0,0,0.25) !important;
          }
          .badge {
            background: rgba(255,255,255,.22) !important;
            color: #fff !important;
            -webkit-print-color-adjust: exact !important;
          }
          .note {
            background: rgba(255,255,255,.15) !important;
            -webkit-print-color-adjust: exact !important;
          }
          .logo {
            background: #fff !important;
            box-shadow: 0 4px 12px rgba(0,0,0,.2) !important;
          }

          /* VAT box xanh nhạt */
          .vat { background: #f3f9f4 !important; border: 1px solid #d8ebdd !important; }
          .vatcard { background: #fff !important; border: 1px solid #e2ece4 !important; }
          .t0 { background: #2c8a48 !important; color: #fff !important; }
          .t5 { background: #0277bd !important; color: #fff !important; }
          .t8 { background: #d0491f !important; color: #fff !important; }

          /* Section header xanh */
          h2.sec {
            background: #2c8a48 !important;
            color: #fff !important;
            padding: 8px 14px !important;
            margin: 14px 0 8px !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          h2.sec * { color: #fff !important; }
          h2.sec i {
            background: rgba(255,255,255,.25) !important;
            color: #fff !important;
          }

          /* Grid 6 cột — dồn 8 trang, B2B gọn nhất */
          .grid {
            grid-template-columns: repeat(6, 1fr) !important;
            gap: 4px !important;
          }
          .card {
            background: #fff !important;
            border: 1px solid #c9d8c9 !important;
            border-radius: 5px !important;
            box-shadow: 0 1px 2px rgba(0,0,0,.05) !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            overflow: hidden !important;
          }
          .imgwrap {
            background: #eef3ee !important;
            aspect-ratio: 1/1 !important;
            position: relative !important;
          }
          .stt {
            background: #1f7a3d !important;
            color: #fff !important;
            font-size: 8.5px !important;
            padding: 1px 5px !important;
            top: 3px !important; left: 3px !important;
            -webkit-print-color-adjust: exact !important;
          }
          .info { padding: 4px 5px 5px !important; gap: 0 !important; }
          .vn {
            font-size: 9.5px !important;
            font-weight: 700 !important;
            color: #16261c !important;
            line-height: 1.15 !important;
            min-height: 22px !important;
          }
          .en {
            font-size: 8px !important;
            color: #1565c0 !important;
            font-style: italic !important;
            line-height: 1.1 !important;
            min-height: 18px !important;
            margin-top: 1px !important;
          }
          .price {
            margin-top: 2px !important;
            display: flex !important;
            align-items: baseline !important;
            gap: 2px !important;
            flex-wrap: wrap !important;
          }
          .price b { font-size: 11px !important; color: #d0491f !important; font-weight: 800 !important; }
          .price .unit { font-size: 7.5px !important; color: #8a9a8e !important; }
          .price .old { font-size: 8px !important; color: #aaa !important; }

          /* Intro card — gọn lại để khỏi đẩy footer xuống trang riêng */
          .intro {
            background: #fff !important;
            border: 1px solid #e6ece6 !important;
            padding: 12px 14px !important;
            margin-bottom: 10px !important;
          }
          .intro .lead { font-size: 12px !important; line-height: 1.4 !important; }
          .vat { padding: 10px 12px !important; margin-top: 10px !important; }
          .vat h3 { font-size: 13px !important; margin-bottom: 8px !important; }
          .vatcard li { padding: 3px 0 !important; font-size: 11.5px !important; }
          .vatnote { font-size: 11px !important; margin-top: 8px !important; }

          /* Section heading nhỏ lại */
          h2.sec {
            font-size: 14px !important;
            padding: 7px 12px !important;
            margin: 14px 0 8px !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          h2.sec span { font-size: 11px !important; }
          h2.sec i { font-size: 10.5px !important; padding: 1px 7px !important; }

          /* Toolbar/nav ẨN khi in — không cần thiết */
          .toolbar { display: none !important; }

          /* Footer — gom vào trang trước, KHÔNG bao giờ tách riêng */
          footer {
            background: #fff !important;
            border: 1px solid #e6ece6 !important;
            padding: 12px 14px !important;
            margin-top: 14px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            font-size: 11px !important;
            line-height: 1.5 !important;
          }
          footer b { color: #1f7a3d !important; }

          /* Section cuối + footer: yêu cầu giữ chung với nội dung trước nếu có thể */
          .grid:last-of-type { page-break-after: avoid !important; }
          .grid:last-of-type + footer,
          .grid + footer { page-break-before: avoid !important; }

          /* Bỏ khoảng trắng dư */
          .wrap { padding: 0 8px !important; }
          body { margin: 0 !important; padding: 0 !important; }

          /* Tránh trang trắng cuối: chặn ::after dư */
          html, body { height: auto !important; }
        }

        /* Toolbar nhỏ gọn góc dưới phải — không che nội dung header */
        .no-print {
          position: fixed; bottom: 16px; right: 16px; z-index: 9999;
          display: flex; gap: 8px;
        }
        /* Toast tự ẩn sau 5s — hint Background graphics */
        .pdf-toast {
          position: fixed; bottom: 70px; right: 16px; z-index: 9998;
          background: #1F2937; color: #fff;
          padding: 10px 14px; border-radius: 8px;
          font-size: 12px; line-height: 1.5;
          max-width: 320px; box-shadow: 0 8px 24px rgba(0,0,0,0.3);
          animation: slideUp 0.3s ease, fadeOut 0.5s ease 5s forwards;
        }
        .pdf-toast b { color: #FCD34D; }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeOut { to { opacity: 0; transform: translateY(20px); pointer-events: none; } }
        @media print { .pdf-toast { display: none !important; } }
      </style>
      <div class="no-print">
        <button onclick="window.print()" style="background:#16A34A;color:#fff;border:0;padding:11px 20px;border-radius:8px;cursor:pointer;font-weight:700;font-size:14px;box-shadow:0 4px 14px rgba(22,163,74,0.35);display:inline-flex;align-items:center;gap:6px">🖨 In / Save PDF</button>
        <button onclick="window.close()" style="background:#fff;color:#475569;border:1px solid #CBD5E1;padding:11px 16px;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px">✕ Đóng</button>
      </div>
      <!-- Toast nhỏ tự ẩn sau 5s -->
      <div class="pdf-toast" id="pdfToast">
        💡 Trong Print dialog → <b>More settings</b> → tick <b>"Background graphics"</b> để có màu nền đầy đủ. <span style="opacity:0.6;font-size:10px;display:block;margin-top:4px">(Tự ẩn sau 5s)</span>
      </div>
      <script>
      /* Auto-print SAU KHI tất cả ảnh decode xong — tránh PDF mất ảnh ở SP cuối */
      (function(){
        function waitImagesReady(){
          var imgs = Array.prototype.slice.call(document.images);
          var total = imgs.length;
          if (!total) return Promise.resolve();
          /* Cập nhật toast tiến độ decode */
          var t = document.getElementById('pdfToast');
          var done = 0;
          function bump(){
            done++;
            if (t) t.innerHTML = '⏳ Đang decode ảnh <b>'+done+'/'+total+'</b>… Auto-in khi xong.';
          }
          return Promise.all(imgs.map(function(img){
            var p;
            if (img.complete && img.naturalWidth > 0) {
              p = img.decode ? img.decode().catch(function(){}) : Promise.resolve();
            } else {
              p = new Promise(function(res){
                img.addEventListener('load', function(){
                  (img.decode ? img.decode().catch(function(){}) : Promise.resolve()).then(res);
                });
                img.addEventListener('error', res);
              });
            }
            return p.then(bump);
          }));
        }
        window.addEventListener('load', function(){
          waitImagesReady().then(function(){
            var t = document.getElementById('pdfToast');
            if (t) t.innerHTML = '✓ Sẵn sàng in. Mở Print dialog…';
            /* Delay nhỏ để layout reflow trước khi in */
            setTimeout(function(){ try { window.focus(); window.print(); } catch(e){} }, 400);
          });
        });
      })();
      </script>`;

      /* === Dùng Blob URL thay vì document.write ===
         Lý do: HTML với 120 ảnh base64 (~3.8MB) khi viết qua document.write có thể
         bị browser truncate hoặc treo → mất ảnh SP27+ trong PDF.
         Blob URL load như file thật → ổn định, đủ ảnh, in PDF chuẩn. */
      const fullHtml = html.replace('</head>', printCss + '</head>');
      const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const w = window.open(blobUrl, '_blank', 'width=1100,height=1300');
      if (!w) {
        URL.revokeObjectURL(blobUrl);
        window.toast('Trình duyệt chặn popup — cho phép popup rồi thử lại','warn');
        return;
      }
      /* Revoke URL sau 120s — đủ thời gian load + decode + print với 120 ảnh */
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
      /* Popup tự gọi window.print() SAU KHI tất cả ảnh decode xong
         (logic nằm trong <script> của printCss) → không cần setTimeout cứng ở parent */
      if (window.audit) window.audit.log('catalogue.print', 'Xuất PDF bảng giá ' + ddmmyy(dateISO));
      window.toast('✓ Đã mở cửa sổ in (đợi 2-3s cho ảnh load). Trong dialog chọn "Save as PDF" + tick "Background graphics".','success');
    },

    async export(dateISO, opts) {
      opts = opts || {};
      dateISO = dateISO || (window.todayISO ? window.todayISO() : '2026-05-18');
      /* Báo tiến độ tải ảnh qua toast (cập nhật cùng phần tử) */
      let progEl = null;
      const onProgress = (done, total, fail, finalCall) => {
        if (!progEl) {
          window.toast(`⏳ Đang dựng file báo giá (0/${total} ảnh)…`, 'info');
          /* lấy phần tử toast vừa tạo (cuối container) */
          const c = document.getElementById('toast-container');
          progEl = c && c.lastElementChild;
        }
        if (progEl) {
          const lbl = progEl.querySelector('.lbl') || progEl;
          lbl.innerHTML = `⏳ Đang nhúng ảnh: <b>${done}/${total}</b>${fail ? ' · ' + fail + ' lỗi' : ''}${finalCall ? ' ✓' : ''}`;
          if (finalCall) setTimeout(() => progEl && progEl.remove(), 800);
        }
      };
      const html = await buildHTML(dateISO, { onProgress, priceFn: opts.priceFn, tierName: opts.tierName });
      const filename = `BangGia-TuanTu-${ddmmyy(dateISO)}.html`;
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      /* tải về máy (trừ khi sendOnly) */
      if (!opts.sendOnly) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
      /* gửi Telegram dạng document — dùng kênh opts.channelPurpose (mặc định 'price_update') nếu có.
         noSend: KHÔNG auto-gửi (vd bảng giá Marketing không được gửi vào kênh khách) */
      const ch = (window.getTgChannel && !opts.noSend) ? window.getTgChannel(opts.channelPurpose || 'price_update') : null;
      if (ch) {
        window.toast(`Đang gửi file báo giá → ${ch.channelName || 'Telegram'}…`, 'info');
        try {
          const fd = new FormData();
          fd.append('chat_id', ch.chatId);
          fd.append('caption', `🥬 BẢNG GIÁ NÔNG SẢN TUẤN TÚ — ${fmtD(dateISO)} (file đính kèm). ĐT: 0836 676 086`);
          fd.append('document', blob, filename);
          const r = await fetch(`https://api.telegram.org/bot${ch.botToken}/sendDocument`, { method: 'POST', body: fd });
          const j = await r.json();
          if (j.ok) window.toast(opts.sendOnly ? `✓ Đã gửi FILE báo giá → ${ch.channelName}` : `✓ Đã gửi FILE báo giá → ${ch.channelName} + tải về máy`, 'success');
          else window.toast('Telegram lỗi: ' + (j.description || '?') + (opts.sendOnly ? '' : ' (đã tải file về máy)'), 'warn');
        } catch (e) { window.toast('Không gửi được Telegram: ' + (e.message || 'lỗi mạng') + (opts.sendOnly ? '' : ' (đã tải file về máy)'), 'warn'); }
      } else if (opts.sendOnly) {
        window.toast('⚠️ Chưa cấu hình Telegram. Vào Cài đặt → Telegram Bot → cấu hình kênh "Cập nhật bảng giá".', 'warn');
      } else {
        window.toast('✓ Đã tạo & tải FILE báo giá. Cấu hình Telegram để gửi tự động.', 'success');
      }
      return filename;
    },
  };
})();
