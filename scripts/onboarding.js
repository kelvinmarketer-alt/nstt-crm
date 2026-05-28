/* =========================================================
   Onboarding Wizard — Tour first-login
   ─────────────────────────────────────────────────────────
   Hiển thị 1 popover bước-by-bước cho user MỚI lần đầu vào app.
   Lưu STORE.onboarding_done = true để không hiện lại.
   Click "Bỏ qua" hoặc "Hoàn thành" để dismiss.
   ========================================================= */
(function () {
  /* Inject CSS */
  if (!document.getElementById('onboardCSS')) {
    const s = document.createElement('style');
    s.id = 'onboardCSS';
    s.textContent = `
      .ob-overlay{position:fixed;inset:0;background:rgba(15,23,42,0.7);z-index:99996;display:none}
      .ob-overlay.show{display:block}
      .ob-card{position:fixed;background:#fff;border-radius:12px;padding:18px 20px;width:380px;max-width:90vw;
        box-shadow:0 16px 48px rgba(0,0,0,0.3);z-index:99997;
        animation:obIn 0.25s ease}
      @keyframes obIn{from{transform:scale(0.92);opacity:0}to{transform:scale(1);opacity:1}}
      .ob-card .ob-step{font-size:11px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;font-weight:700}
      .ob-card h3{margin:6px 0 8px;color:var(--navy);font-size:18px}
      .ob-card .ob-body{font-size:13px;line-height:1.55;color:var(--text)}
      .ob-card .ob-foot{display:flex;justify-content:space-between;align-items:center;margin-top:16px}
      .ob-card .ob-progress{display:flex;gap:3px}
      .ob-card .ob-dot{width:6px;height:6px;border-radius:50%;background:#E5E7EB}
      .ob-card .ob-dot.active{background:#16A34A;width:18px;border-radius:3px}
    `;
    document.head.appendChild(s);
  }

  const STEPS = [
    { title: '👋 Chào mừng đến Nông Sản Tuấn Tú!',
      body: 'Tour ngắn 5 bước (~30 giây) giúp bạn nắm các tính năng chính. Có thể bỏ qua bất cứ lúc nào — vào <b>Cài đặt</b> chạy lại.' },
    { title: '📊 Dashboard — Tổng quan',
      body: 'Trang đầu là Dashboard — sếp xem tất cả KPI 5 phòng ban một chỗ. Số liệu cập nhật real-time từ data.' },
    { title: '🤖 TUTÚ — Trợ lý AI',
      body: 'Bong bóng 🤖 dưới-phải là chatbot AI. Hỏi bất cứ điều gì về app hoặc dữ liệu — TUTÚ sẽ trả lời. Cần cấu hình API key ở Settings → Tích hợp.' },
    { title: '🔍 Tìm kiếm Ctrl+K',
      body: 'Bấm <kbd style="background:#F1F5F9;padding:1px 5px;border-radius:3px">Ctrl/⌘+K</kbd> bất kỳ trang nào để tìm KH/đơn/SP/NV ngay lập tức.' },
    { title: '❓ Help-tip xuất hiện khắp nơi',
      body: 'Thấy icon ❓ nhỏ cạnh tính năng? Hover/click để xem giải thích nhanh. Mọi feature đều có hướng dẫn để ai dùng cũng hiểu.' },
    { title: '✓ Sẵn sàng!',
      body: 'Tour hoàn tất. Còn lúng túng? Vào trang <b>📖 Hướng dẫn</b> trong menu hoặc hỏi TUTÚ.\n\nChúc làm việc hiệu quả! 🌱' },
  ];

  let cur = 0;

  function show() {
    /* Remove existing */
    document.querySelectorAll('.ob-overlay, .ob-card').forEach(x => x.remove());

    const ov = document.createElement('div');
    ov.className = 'ob-overlay show';
    document.body.appendChild(ov);

    const card = document.createElement('div');
    card.className = 'ob-card';
    card.style.cssText = 'top:50%;left:50%;transform:translate(-50%,-50%)';
    const s = STEPS[cur];
    card.innerHTML = `
      <div class="ob-step">Bước ${cur+1}/${STEPS.length}</div>
      <h3>${s.title}</h3>
      <div class="ob-body">${s.body}</div>
      <div class="ob-foot">
        <div class="ob-progress">${STEPS.map((_,i)=>`<div class="ob-dot ${i===cur?'active':''}"></div>`).join('')}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="window.Onboarding.dismiss()">Bỏ qua</button>
          ${cur < STEPS.length-1
            ? `<button class="btn btn-primary btn-sm" onclick="window.Onboarding.next()">Tiếp →</button>`
            : `<button class="btn btn-primary btn-sm" onclick="window.Onboarding.done()">Hoàn thành ✓</button>`}
        </div>
      </div>
    `;
    document.body.appendChild(card);
  }

  window.Onboarding = {
    start() { cur = 0; show(); },
    next() { cur++; show(); },
    dismiss() { document.querySelectorAll('.ob-overlay, .ob-card').forEach(x => x.remove()); },
    done() {
      window.STORE.set('onboarding_done', true);
      window.audit && window.audit.log('onboarding.done', 'User hoàn thành tour');
      this.dismiss();
      window.toast && window.toast('✓ Hoàn tất tour. Chúc làm việc hiệu quả!', 'success');
    },
  };

  /* === Auto-popup ĐÃ TẮT theo yêu cầu user (gây phiền) ===
     User vẫn có thể chạy lại tour thủ công bằng cách gọi window.Onboarding.start()
     hoặc bấm nút "Xem hướng dẫn nhanh" trong Settings (nếu sau này thêm).
     Mặc định set onboarding_done=true để chắc chắn không hiện. */
  try {
    if (window.STORE) window.STORE.set('onboarding_done', true);
  } catch (e) {}
})();
