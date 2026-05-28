/* =========================================================
   Nông Sản Tuấn Tú — Auto Telegram bảng giá hằng ngày
   ─────────────────────────────────────────────────────────
   Quy tắc nghiệp vụ:
   1. NV cập nhật giá trong app → bấm "💾 Lưu bảng giá ngày"
   2. Mỗi ngày đúng giờ X (vd 8:00 sáng), app tự gửi bảng giá lên Telegram
   3. CHỈ GỬI khi giá hôm nay khác giá hôm trước
      → Nếu copy nguyên giá hôm qua → KHÔNG GỬI (tránh spam KH)
   4. Đã gửi 1 lần/ngày — không gửi trùng cùng ngày

   Cấu hình lưu STORE.priceAutoSend = {
     enabled: true,
     hour: 8,           // 0-23
     minute: 0,         // 0-59
     channelPurpose: 'price_update',  // map qua getTgChannel()
     lastSentDate: '2026-05-26',      // YYYY-MM-DD
     lastSentSignature: 'hash giá',   // để check thay đổi
   }
   ========================================================= */
(function () {
  const KEY = 'priceAutoSend';

  /* === Default config === */
  function getCfg() {
    return window.STORE.get(KEY, {
      enabled: false,
      hour: 8,
      minute: 0,
      channelPurpose: 'price_update',
      lastSentDate: '',
      lastSentSignature: '',
    });
  }
  function setCfg(c) { window.STORE.set(KEY, c); }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function yesterdayISO() {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  /* === Tính "signature" giá ngày X — để so sánh nhanh === */
  function priceSignature(dateISO) {
    const products = window.STORE.get('products', window.PRODUCTS || []) || [];
    const prices = [];
    products.forEach(p => {
      const h = p.priceHistory || [];
      const sorted = [...h].sort((a, b) => a.date < b.date ? -1 : 1);
      let chosen = null;
      for (const e of sorted) { if (e.date <= dateISO) chosen = e; }
      if (chosen) prices.push(`${p.id}:${chosen.sell}`);
    });
    return prices.sort().join('|');
  }

  /* === So sánh giá hôm nay vs hôm qua === */
  function diffPrices() {
    const today = todayISO();
    const yest = yesterdayISO();
    const products = window.STORE.get('products', window.PRODUCTS || []) || [];
    const changes = [];
    products.forEach(p => {
      const h = p.priceHistory || [];
      const sorted = [...h].sort((a, b) => a.date < b.date ? -1 : 1);
      let todayE = null, yestE = null;
      for (const e of sorted) {
        if (e.date <= today) todayE = e;
        if (e.date <= yest) yestE = e;
      }
      const todayP = todayE ? todayE.sell : 0;
      const yestP = yestE ? yestE.sell : 0;
      if (todayP && todayP !== yestP) {
        changes.push({
          id: p.id,
          name: p.name,
          unit: p.unit || 'kg',
          old: yestP,
          new: todayP,
          delta: todayP - yestP,
          deltaPct: yestP ? ((todayP - yestP) / yestP * 100) : 0,
        });
      }
    });
    return {
      today, yest,
      hasChange: changes.length > 0,
      changes,
      todaySignature: priceSignature(today),
      yestSignature: priceSignature(yest),
    };
  }

  /* === Build message tóm tắt thay đổi giá === */
  function buildChangeMessage(diff) {
    const up = diff.changes.filter(c => c.delta > 0);
    const down = diff.changes.filter(c => c.delta < 0);
    let msg = `📊 *BẢNG GIÁ TUẤN TÚ — ${diff.today.split('-').reverse().join('/')}*\n\n`;
    msg += `Có *${diff.changes.length}* mặt hàng đổi giá so với hôm qua:\n`;
    if (up.length) {
      msg += `\n📈 *Tăng (${up.length}):*\n`;
      up.slice(0, 10).forEach(c => {
        msg += `• ${c.name}: ${(c.old/1000).toFixed(1)}k → *${(c.new/1000).toFixed(1)}k* (+${c.deltaPct.toFixed(0)}%)\n`;
      });
      if (up.length > 10) msg += `... và ${up.length - 10} SP nữa\n`;
    }
    if (down.length) {
      msg += `\n📉 *Giảm (${down.length}):*\n`;
      down.slice(0, 10).forEach(c => {
        msg += `• ${c.name}: ${(c.old/1000).toFixed(1)}k → *${(c.new/1000).toFixed(1)}k* (${c.deltaPct.toFixed(0)}%)\n`;
      });
      if (down.length > 10) msg += `... và ${down.length - 10} SP nữa\n`;
    }
    msg += `\n📎 File báo giá đầy đủ đính kèm bên dưới.`;
    msg += `\n📞 Đặt hàng: 0836 676 086`;
    return msg;
  }

  /* === Gửi Telegram: text summary + file HTML báo giá === */
  async function doSend(reason) {
    if (!window.getTgChannel || !window.PriceCatalogue) {
      console.warn('[PriceAutoSend] Thiếu module Telegram hoặc PriceCatalogue');
      return { ok: false, error: 'Thiếu module' };
    }
    const cfg = getCfg();
    const ch = window.getTgChannel(cfg.channelPurpose);
    if (!ch) {
      return { ok: false, error: 'Chưa cấu hình channel "Cập nhật bảng giá"' };
    }
    const diff = diffPrices();
    if (!diff.hasChange) {
      return { ok: false, skip: true, error: 'Giá không thay đổi — không gửi (tránh spam KH)' };
    }

    /* 1. Gửi text summary trước */
    try {
      const msg = buildChangeMessage(diff);
      await fetch(`https://api.telegram.org/bot${ch.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ch.chatId,
          text: msg,
          parse_mode: 'Markdown',
        }),
      });
    } catch (e) {
      console.warn('[PriceAutoSend] Gửi text fail:', e);
    }

    /* 2. Gửi file HTML báo giá đầy đủ (qua PriceCatalogue.export sendOnly) */
    try {
      await window.PriceCatalogue.export(diff.today, { sendOnly: true });
    } catch (e) {
      console.warn('[PriceAutoSend] Gửi file fail:', e);
      return { ok: false, error: 'Gửi file lỗi: ' + e.message };
    }

    /* 3. Update lastSent */
    cfg.lastSentDate = diff.today;
    cfg.lastSentSignature = diff.todaySignature;
    setCfg(cfg);

    if (window.audit) window.audit.log('price.autoSend', `[${reason||'manual'}] Gửi bảng giá ${diff.today} · ${diff.changes.length} SP đổi`);

    return { ok: true, changeCount: diff.changes.length, diff };
  }

  /* === Scheduler: chạy mỗi phút, kiểm tra giờ đã tới chưa === */
  function tickScheduler() {
    const cfg = getCfg();
    if (!cfg.enabled) return;
    const now = new Date();
    const todayStr = todayISO();
    /* Đã gửi hôm nay rồi? */
    if (cfg.lastSentDate === todayStr) return;
    /* Đã tới giờ chưa? */
    const targetMinutes = cfg.hour * 60 + cfg.minute;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (nowMinutes < targetMinutes) return;
    /* Đến giờ → check giá đổi → gửi */
    doSend('scheduled').then(r => {
      if (r.ok) {
        window.toast && window.toast(`📤 Đã tự gửi bảng giá lên Telegram · ${r.changeCount} SP đổi`, 'success');
      } else if (r.skip) {
        /* Đánh dấu lastSent để không check lại trong hôm nay */
        const c = getCfg();
        c.lastSentDate = todayStr;
        setCfg(c);
        console.log('[PriceAutoSend]', r.error);
      } else {
        console.warn('[PriceAutoSend] Gửi tự động lỗi:', r.error);
      }
    });
  }

  /* === Public API === */
  window.PriceAutoSend = {
    getCfg, setCfg, diffPrices, doSend,

    /* Manual: "Kiểm tra & gửi ngay nếu giá đổi" */
    async sendNowIfChanged() {
      const r = await doSend('manual');
      if (r.ok) {
        window.toast && window.toast(`✓ Đã gửi bảng giá · ${r.changeCount} SP đổi`, 'success');
      } else if (r.skip) {
        window.toast && window.toast('💤 Giá KHÔNG đổi so với hôm qua — không gửi (đúng quy tắc)', 'info');
      } else {
        window.toast && window.toast('❌ ' + r.error, 'warn');
      }
      return r;
    },

    /* Preview thay đổi (không gửi) */
    previewDiff() {
      const diff = diffPrices();
      let html = '';
      if (!diff.hasChange) {
        html = `<div style="background:#F0FDF4;color:#15803D;padding:14px;border-radius:8px;font-size:13px">
          💤 <b>Giá hôm nay (${diff.today}) GIỐNG HỆT hôm qua (${diff.yest})</b><br>
          → Nếu tự gửi, app sẽ <b>BỎ QUA</b> không spam KH.
        </div>`;
      } else {
        const up = diff.changes.filter(c => c.delta > 0);
        const down = diff.changes.filter(c => c.delta < 0);
        html = `<div style="background:#FEF3C7;color:#92400E;padding:10px 13px;border-radius:7px;font-size:12.5px;margin-bottom:10px">
          📊 <b>${diff.changes.length} SP đổi giá</b> · 📈 ${up.length} tăng · 📉 ${down.length} giảm
        </div>`;
        html += `<table style="width:100%;font-size:12px;border-collapse:collapse">
          <thead><tr style="background:#FAFBFC">
            <th style="text-align:left;padding:6px">SP</th>
            <th style="text-align:right;padding:6px">Hôm qua</th>
            <th style="text-align:right;padding:6px">Hôm nay</th>
            <th style="text-align:right;padding:6px">Đổi</th>
          </tr></thead><tbody>`;
        diff.changes.slice(0, 30).forEach(c => {
          const color = c.delta > 0 ? '#DC2626' : '#16A34A';
          const arrow = c.delta > 0 ? '↑' : '↓';
          html += `<tr style="border-top:1px solid #F1F5F9">
            <td style="padding:5px"><b>${c.name}</b></td>
            <td style="text-align:right;padding:5px;color:#6B7280">${(c.old/1000).toFixed(1)}k</td>
            <td style="text-align:right;padding:5px;font-weight:700">${(c.new/1000).toFixed(1)}k</td>
            <td style="text-align:right;padding:5px;color:${color};font-weight:700">${arrow} ${Math.abs(c.deltaPct).toFixed(0)}%</td>
          </tr>`;
        });
        html += `</tbody></table>`;
        if (diff.changes.length > 30) html += `<div style="text-align:center;color:#6B7280;font-size:11px;padding:6px">... còn ${diff.changes.length - 30} SP nữa</div>`;
      }
      window.openModal('🔍 Preview thay đổi giá hôm nay vs hôm qua', html, {
        footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>
                 ${diff.hasChange ? '<button class="btn btn-primary" onclick="window.closeModal();window.PriceAutoSend.sendNowIfChanged()">📤 Gửi ngay</button>' : ''}`,
        width: '620px',
      });
    },

    /* Mở modal cấu hình auto-send */
    openConfig() {
      const c = getCfg();
      const channels = (window.STORE.get('telegramChannels', []) || []);
      const tgPurposes = window.TG_PURPOSES || [
        {id:'price_update', label:'📋 Cập nhật bảng giá'},
        {id:'boss_report', label:'👔 Báo cáo sếp'},
      ];
      window.openModal('⚙️ Cấu hình tự động gửi bảng giá Telegram', `
        <div style="background:#EFF6FF;color:#1E40AF;padding:11px 14px;border-radius:8px;font-size:12.5px;margin-bottom:14px;line-height:1.6">
          🤖 <b>Cách hoạt động:</b><br>
          1. NV cập nhật giá trong app, bấm "💾 Lưu bảng giá ngày"<br>
          2. Mỗi ngày đúng <b>giờ X</b>, app tự kiểm tra: nếu giá hôm nay khác hôm qua → tự gửi Telegram<br>
          3. Nếu giá GIỮ NGUYÊN → <b>KHÔNG gửi</b> (tránh spam khách hàng)<br>
          4. App chạy khi bạn mở trình duyệt — nên giữ tab Tuấn Tú mở vào giờ đó (hoặc PWA install)
        </div>

        <label style="display:flex;align-items:center;gap:10px;padding:10px;background:#FAFBFC;border-radius:7px;margin-bottom:12px;cursor:pointer">
          <input type="checkbox" id="paEnabled" ${c.enabled?'checked':''} style="width:18px;height:18px;cursor:pointer">
          <div style="flex:1">
            <b style="font-size:13.5px;color:var(--navy)">Bật tự động gửi hằng ngày</b>
            <div style="font-size:11.5px;color:var(--muted);margin-top:2px">Khi tắt — phải bấm "Gửi ngay" thủ công</div>
          </div>
        </label>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
          <div>
            <label style="font-size:12px;color:var(--muted);font-weight:600">⏰ Giờ gửi mỗi ngày</label>
            <input type="time" id="paTime" value="${String(c.hour).padStart(2,'0')}:${String(c.minute).padStart(2,'0')}" style="width:100%;border:1px solid var(--line);border-radius:7px;padding:8px;font-size:14px;font-weight:700">
            <div style="font-size:10.5px;color:var(--muted);margin-top:3px">Khuyên: 7:30 - 8:30 sáng (trước giờ bếp nhận đơn)</div>
          </div>
          <div>
            <label style="font-size:12px;color:var(--muted);font-weight:600">📨 Channel Telegram</label>
            <select id="paChannel" style="width:100%;border:1px solid var(--line);border-radius:7px;padding:8px;font-size:13px">
              ${tgPurposes.map(p => `<option value="${p.id}" ${c.channelPurpose===p.id?'selected':''}>${p.label}</option>`).join('')}
            </select>
            <div style="font-size:10.5px;color:var(--muted);margin-top:3px">Cấu hình channel ở: Cài đặt → Telegram Bot</div>
          </div>
        </div>

        <div style="background:#FAFBFC;padding:10px 13px;border-radius:7px;margin-bottom:10px;font-size:12px">
          <div style="color:var(--muted);font-size:11px;text-transform:uppercase;font-weight:700;margin-bottom:4px">📊 TRẠNG THÁI HIỆN TẠI</div>
          <div>Lần gửi tự động gần nhất: <b>${c.lastSentDate || 'Chưa gửi lần nào'}</b></div>
          <div style="margin-top:3px">Số SP có thay đổi giá hôm nay so với hôm qua: <b id="paDiffCnt">đang tính...</b></div>
        </div>

        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" style="flex:1" onclick="window.PriceAutoSend.previewDiff()">🔍 Xem thay đổi giá</button>
          <button class="btn btn-primary" style="flex:1" onclick="window.PriceAutoSend.sendNowIfChanged()">📤 Gửi ngay (nếu giá đổi)</button>
        </div>
      `, {
        footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
                 <button class="btn btn-primary" onclick="window._paSaveCfg()">💾 Lưu cài đặt</button>`,
        width: '560px',
      });
      /* Async update diff count */
      setTimeout(() => {
        try {
          const d = diffPrices();
          const el = document.getElementById('paDiffCnt');
          if (el) {
            if (d.hasChange) el.innerHTML = `<span style="color:#D97706">${d.changes.length} SP</span> · sẽ gửi`;
            else el.innerHTML = `<span style="color:#15803D">0 SP · giữ nguyên</span> · sẽ KHÔNG gửi`;
          }
        } catch(e) {}
      }, 100);
    },
  };

  window._paSaveCfg = function() {
    const cfg = getCfg();
    cfg.enabled = document.getElementById('paEnabled').checked;
    const time = document.getElementById('paTime').value.split(':');
    cfg.hour = parseInt(time[0]) || 8;
    cfg.minute = parseInt(time[1]) || 0;
    cfg.channelPurpose = document.getElementById('paChannel').value;
    setCfg(cfg);
    window.audit && window.audit.log('priceAutoSend.config', `enabled=${cfg.enabled} time=${cfg.hour}:${cfg.minute}`);
    window.toast && window.toast(`✓ Lưu cài đặt: ${cfg.enabled?'BẬT':'TẮT'} · ${cfg.hour}:${String(cfg.minute).padStart(2,'0')} hằng ngày`, 'success');
    window.closeModal();
  };

  /* Start scheduler — check mỗi 60s */
  setTimeout(tickScheduler, 5000);
  setInterval(tickScheduler, 60000);
})();
