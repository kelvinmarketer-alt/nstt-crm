/* =========================================================
   RFM Segmentation — Recency / Frequency / Monetary
   ─────────────────────────────────────────────────────────
   Phân nhóm KH dựa trên 3 chỉ số:
   - R (Recency)    : ngày cuối đặt — gần đây = tốt
   - F (Frequency)  : số đơn 90 ngày — nhiều = tốt
   - M (Monetary)   : doanh thu 90 ngày — cao = tốt

   Mỗi chỉ số chia 5 bậc (1-5). Auto-tag segment:
   - Champions     R5F5M5  : KH best — chăm sóc đặc biệt
   - Loyal         RxF4-5M3-5 : KH trung thành
   - Potential     R4-5F2-3 : tiềm năng (mới + active)
   - At-Risk       R1-2F4-5 : đang trôi đi
   - Lost          R1F1    : mất hẳn
   - New           R5F1    : mới đặt 1 lần
   ========================================================= */
window.RFM = (function () {
  const TODAY = new Date(2026, 4, 18);

  function parseVi(s) { const m=(s||'').match(/(\d+)\/(\d+)\/(\d+)/); return m?new Date(+m[3],+m[2]-1,+m[1]):null; }

  function calc(custId) {
    const orders = window.STORE.get('orders', []) || [];
    const ords = orders.filter(o => o.custId === custId && o.status !== 'cancelled');
    if (!ords.length) return { R:1, F:1, M:1, recencyDays:999, freq:0, money:0, segment:'inactive' };
    /* Lấy đơn trong 90 ngày gần nhất */
    const last90 = ords.filter(o => {
      const d = parseVi(o.date); return d && ((TODAY - d)/86400000) <= 90;
    });
    const lastOrder = ords.map(o => parseVi(o.date)).filter(Boolean).sort((a,b)=>b-a)[0];
    const recencyDays = lastOrder ? Math.floor((TODAY - lastOrder)/86400000) : 999;
    const freq = last90.length;
    const money = last90.reduce((s,o) => s + (o.freight||0), 0);
    /* Score 1-5 — fixed bins for stability */
    const R = recencyDays <= 3 ? 5 : recencyDays <= 7 ? 4 : recencyDays <= 14 ? 3 : recencyDays <= 30 ? 2 : 1;
    const F = freq >= 20 ? 5 : freq >= 10 ? 4 : freq >= 5 ? 3 : freq >= 2 ? 2 : 1;
    const M = money >= 50_000_000 ? 5 : money >= 20_000_000 ? 4 : money >= 8_000_000 ? 3 : money >= 2_000_000 ? 2 : 1;
    return { R, F, M, recencyDays, freq, money, segment: classify(R,F,M) };
  }

  function classify(R, F, M) {
    if (R >= 4 && F >= 4 && M >= 4) return 'champion';
    if (F >= 4 && M >= 3) return 'loyal';
    if (R >= 4 && F === 1) return 'new';
    if (R >= 4 && F >= 2) return 'potential';
    if (R <= 2 && F >= 3) return 'at_risk';
    if (R === 1 && F === 1) return 'lost';
    if (R === 1) return 'hibernating';
    return 'normal';
  }

  const SEG_META = {
    champion:    {label:'🏆 Champion',  color:'#16A34A', desc:'KH cốt lõi — đặt thường xuyên, chi nhiều, gần đây. Chăm sóc đặc biệt — ưu đãi VIP, thăm hỏi trực tiếp.'},
    loyal:       {label:'⭐ Trung thành',color:'#0EA5E9', desc:'Đặt đều đặn, chi ổn định. Giữ chân bằng chương trình loyalty.'},
    new:         {label:'✨ Mới',        color:'#7C3AED', desc:'Mới đặt 1 lần gần đây. Cần gọi follow-up, nuôi để đặt tiếp.'},
    potential:   {label:'🌱 Tiềm năng', color:'#A16207', desc:'Active nhưng tần suất chưa cao. Cross-sell, gợi ý món mới.'},
    at_risk:     {label:'⚠️ Đang trôi', color:'#D97706', desc:'Từng đặt nhiều nhưng giờ ít. Liên hệ ngay — hỏi lý do, ưu đãi quay lại.'},
    hibernating: {label:'💤 Ngủ đông',  color:'#6B7280', desc:'Lâu rồi không đặt. Gửi tin nhắn winback + ưu đãi mạnh.'},
    lost:        {label:'❌ Mất',       color:'#B91C1C', desc:'Có thể đã chuyển sang NCC khác. Khảo sát + chiến dịch winback.'},
    normal:      {label:'• Bình thường',color:'#475569', desc:'Hoạt động cơ bản. Theo dõi, không cần ưu tiên.'},
    inactive:    {label:'⏸ Chưa có đơn',color:'#9CA3AF', desc:'Chưa từng phát sinh đơn. Cần re-engagement.'},
  };

  function segMeta(s) { return SEG_META[s] || SEG_META.normal; }

  function badge(custId) {
    const r = calc(custId);
    const m = segMeta(r.segment);
    return `<span class="tag" style="background:${m.color}1f;color:${m.color};font-weight:600">${m.label}</span>`;
  }

  function panel(custId) {
    const r = calc(custId);
    const m = segMeta(r.segment);
    const bars = (n, total=5) => Array(total).fill(0).map((_,i)=>`<div style="flex:1;height:6px;border-radius:3px;background:${i<n?m.color:'#E5E7EB'}"></div>`).join('');
    return `<div style="background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="font-size:13px;font-weight:700;color:var(--navy);text-transform:uppercase">📊 Phân tích RFM ${window.helpTip ? window.helpTip('RFM = Recency (gần đây) · Frequency (tần suất) · Monetary (chi tiêu). Chuẩn ngành để phân nhóm KH B2B. Càng cao mỗi điểm (1-5) càng tốt.') : ''}</div>
        <div style="flex:1"></div>
        ${badge(custId)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">
        <div>
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">R · Gần đây ${window.helpTip ? window.helpTip('Recency = số ngày kể từ lần đặt cuối. 1-3 ngày=5đ. 4-7=4đ. 8-14=3đ. 15-30=2đ. >30=1đ.') : ''}</div>
          <div style="display:flex;gap:2px;margin:5px 0">${bars(r.R)}</div>
          <div style="font-size:11px;color:var(--muted)">${r.recencyDays} ngày · ${r.R}/5</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">F · Tần suất ${window.helpTip ? window.helpTip('Frequency = số đơn trong 90 ngày. ≥20=5đ. ≥10=4đ. ≥5=3đ. ≥2=2đ. 1=1đ.') : ''}</div>
          <div style="display:flex;gap:2px;margin:5px 0">${bars(r.F)}</div>
          <div style="font-size:11px;color:var(--muted)">${r.freq} đơn / 90d · ${r.F}/5</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--muted);text-transform:uppercase;font-weight:700">M · Chi tiêu ${window.helpTip ? window.helpTip('Monetary = doanh thu 90 ngày. ≥50tr=5đ. ≥20tr=4đ. ≥8tr=3đ. ≥2tr=2đ. <2tr=1đ.') : ''}</div>
          <div style="display:flex;gap:2px;margin:5px 0">${bars(r.M)}</div>
          <div style="font-size:11px;color:var(--muted)">${window.fmtShort(r.money)} / 90d · ${r.M}/5</div>
        </div>
      </div>
      <div style="background:${m.color}0d;border-left:3px solid ${m.color};padding:9px 12px;border-radius:6px;font-size:12px;line-height:1.5;color:#0F172A">
        <b>${m.label}:</b> ${m.desc}
      </div>
    </div>`;
  }

  return { calc, classify, segMeta, badge, panel, SEG_META };
})();
