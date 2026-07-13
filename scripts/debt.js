/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Công nợ (Full CRUD)
   ========================================================= */
(function () {
  const STAFF_MAP = {
    KH001:'Trần Lan', KH002:'Tuấn Tú', KH003:'Trần Lan', KH004:'Hoàng Mai',
    KH005:'Phạm Hùng', KH006:'Phạm Hùng', KH007:'Tuấn Tú', KH008:'Phạm Hùng',
    KH009:'Trần Lan', KH010:'Phạm Hùng',
  };
  const LAST_CONTACT_MAP = {
    KH001:'12/05/2026', KH002:'15/05/2026', KH003:'14/05/2026', KH004:'16/05/2026',
    KH005:'10/05/2026', KH006:'08/05/2026', KH007:'11/05/2026', KH008:'14/05/2026',
    KH009:'10/01/2026', KH010:'15/05/2026',
  };

  function loadDebtors() {
    return (window.STORE.get('customers', (window.CUSTOMERS||[]).map(c => ({...c}))))
      .map(c => ({
        ...c,
        staffOwner: c.staffOwner || STAFF_MAP[c.id] || 'Hoàng Mai',
        lastContact: c.lastContact || LAST_CONTACT_MAP[c.id] || c.lastOrder,
      }))
      .filter(c => c.debt > 0);
  }

  /* Quá hạn THẬT theo hạn công nợ của KH (3/7/15 ngày) + sổ nợ — không còn hardcode */
  function overdueDays(c) {
    return (c && window.debtOverdueDays) ? window.debtOverdueDays(c.id) : 0;
  }

  /* === Cập nhật aging cards + tổng + bar (động từ data thật) === */
  function updateAging(debtors) {
    const f = window.fmtShort || (n => n);
    const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const bucket = { b1: 0, b2: 0, b3: 0, b4: 0, b5: 0 };
    const cnt = { b1: 0, b2: 0, b3: 0, b4: 0 };
    let total = 0;
    debtors.forEach(c => {
      const d = +c.debt || 0; total += d;
      const ov = overdueDays(c);
      if (c.badDebt) { bucket.b5 += d; return; }
      /* Mốc theo CHÍNH SÁCH công nợ (3/7/15 ngày). ov = số ngày QUÁ hạn (đã trừ hạn nợ KH). */
      if (ov <= 0) { bucket.b1 += d; cnt.b1++; }       /* trong hạn */
      else if (ov <= 7) { bucket.b2 += d; cnt.b2++; }  /* 1–7 ngày quá hạn */
      else if (ov <= 15) { bucket.b3 += d; cnt.b3++; } /* 8–15 ngày quá hạn */
      else { bucket.b4 += d; cnt.b4++; }                /* > 15 ngày quá hạn */
    });
    setTxt('agB1', f(bucket.b1) + ' ₫'); setTxt('agB1s', `Chưa tới hạn · ${cnt.b1} KH`);
    setTxt('agB2', f(bucket.b2) + ' ₫'); setTxt('agB2s', cnt.b2 ? `${cnt.b2} KH` : '—');
    setTxt('agB3', f(bucket.b3) + ' ₫'); setTxt('agB3s', cnt.b3 ? `${cnt.b3} KH` : '—');
    setTxt('agB4', f(bucket.b4) + ' ₫'); setTxt('agB4s', cnt.b4 ? `${cnt.b4} KH` : 'An toàn 🎉');
    setTxt('agB5', f(bucket.b5) + ' ₫');
    setTxt('debtTotal', (total).toLocaleString('vi-VN') + ' ₫');
    const overdueAll = bucket.b2 + bucket.b3 + bucket.b4;
    setTxt('debtSubHead', debtors.length
      ? `${debtors.length} khách đang nợ · tổng ${f(total)} ₫ · trong đó ${f(overdueAll)} ₫ QUÁ HẠN`
      : 'Chưa có công nợ');
    /* Bar widths */
    const bar = document.getElementById('debtBar');
    const pct = (v) => total > 0 ? (v / total * 100) : 0;
    if (bar) {
      const segs = bar.querySelectorAll('div');
      if (segs[0]) segs[0].style.width = pct(bucket.b1).toFixed(1) + '%';
      if (segs[1]) segs[1].style.width = pct(bucket.b2).toFixed(1) + '%';
      if (segs[2]) segs[2].style.width = (pct(bucket.b3) + pct(bucket.b4)).toFixed(1) + '%';
    }
    const legend = document.getElementById('debtBarLegend');
    if (legend) legend.innerHTML =
      `<span>🟢 Trong hạn ${pct(bucket.b1).toFixed(1)}%</span>` +
      `<span>🔵 1–7d quá hạn ${pct(bucket.b2).toFixed(1)}%</span>` +
      `<span>🟡 >7d quá hạn ${(pct(bucket.b3)+pct(bucket.b4)).toFixed(1)}%</span>`;
    /* Header count */
    const hc = document.querySelector('.table-card .table-head .count');
    if (hc) hc.textContent = debtors.length ? `${debtors.length} khách đang nợ · sắp xếp theo độ rủi ro giảm dần` : 'Chưa có công nợ';
    /* NV phụ trách dropdown động */
    const sel = document.getElementById('fStaff');
    if (sel && sel.options.length <= 1) {
      const names = [...new Set(debtors.map(c => c.staffOwner).filter(Boolean))];
      names.forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
    }
  }

  function render() {
    const debtors = loadDebtors();
    updateAging(debtors);
    const q = document.getElementById('qSearch').value.trim().toLowerCase();
    const b = document.getElementById('fBucket').value;
    const rows = debtors
      .map(c => ({ ...c, overdue: overdueDays(c) }))
      .sort((a, b) => b.overdue - a.overdue || b.debt - a.debt)
      .filter(c => {
        if (q && ![c.name, c.code, c.staffOwner].some(x => x.toLowerCase().includes(q))) return false;
        if (b === 'ok' && c.overdue > 0) return false;
        if (b === 'warn' && (c.overdue <= 0 || c.overdue > 15)) return false;
        if (b === 'danger' && c.overdue <= 15) return false;
        return true;
      });

    document.getElementById('debtTbody').innerHTML = rows.map(c => {
      const col = window.avatarColor(c.id);
      const ovCls = c.overdue > 15 ? 'danger' : c.overdue > 0 ? 'warn' : 'ok';
      const ovLab = c.overdue === 0 ? '✓ Trong hạn' : c.overdue + ' ngày quá hạn';
      const ovBg = c.overdue > 15 ? 'var(--danger-bg)' : c.overdue > 0 ? 'var(--warn-bg)' : 'var(--ok-bg)';
      const ovFg = c.overdue > 15 ? 'var(--danger)' : c.overdue > 0 ? 'var(--warn)' : 'var(--ok)';
      return `<tr>
        <td data-field="name">
          <div class="cust-cell">
            <div class="cust-ava" style="background:${col}">${window.initials(c.name)}</div>
            <div class="cust-info">
              <div class="n1">${c.name}</div>
              <div class="n2">${c.code} · ${c.phone}</div>
            </div>
          </div>
        </td>
        <td data-field="staffOwner"><span class="staff-pill">${c.staffOwner}</span></td>
        <td class="num" data-field="debt"><b>${window.fmt(c.debt)}</b></td>
        <td class="num debt-cell ${ovCls}" data-field="overdue">${c.debtOverdue ? window.fmt(c.debtOverdue) : '—'}</td>
        <td class="hide-xs"><span class="status-pill" style="background:${ovBg};color:${ovFg}">${ovLab}</span></td>
        <td data-field="bills" style="font-size:12px;color:var(--muted)">${Math.max(1, Math.ceil(c.debt / 10_000_000))} HĐ</td>
        <td class="hide-xs" style="font-size:12px;color:var(--muted)">${c.lastContact || '—'}</td>
        <td class="hide-xs">
          <div class="row-actions">
            <button class="ra-call" title="Gọi nhắc nợ" data-action="call" data-id="${c.id}">📞</button>
            <button class="ra-zalo" title="Nhắc Zalo" data-action="zalo" data-id="${c.id}">Z</button>
            <button title="Phiếu thu nợ" data-action="receipt" data-id="${c.id}">💵</button>
            <button title="Lịch sử nhắc" data-action="history" data-id="${c.id}">📋</button>
          </div>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="8" style="padding:40px;text-align:center;color:var(--muted)">Không có công nợ nào khớp lọc.</td></tr>`;

    document.querySelectorAll('#debtTbody button[data-action]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const debtors = loadDebtors();
        const c = debtors.find(x => x.id === btn.dataset.id);
        if (!c) return;
        switch (btn.dataset.action) {
          case 'call':
            window.location.href = 'tel:' + c.phone.replace(/\s/g,'');
            logReminder(c.id, 'call', 'Gọi điện nhắc nợ');
            window.toast('Đã ghi nhật ký gọi ' + c.name, 'info');
            break;
          case 'zalo':
            openReminderTicket(c, 'zalo');
            break;
          case 'receipt': openReceipt(c); break;
          case 'history': openReminderHistory(c); break;
        }
      };
    });
  }

  function updateLastContact(custId) {
    window.STORE.update('customers', custId, {
      lastContact: new Date().toLocaleDateString('vi-VN'),
    });
  }

  /* === Ghi lịch sử nhắc nợ === */
  function logReminder(custId, channel, message, response) {
    const customers = window.STORE.get('customers', []);
    const c = customers.find(x => x.id === custId);
    if (!c) return;
    const reminders = c.reminders || [];
    reminders.unshift({
      id: 'R' + Date.now(),
      date: new Date().toLocaleString('vi-VN'),
      channel,
      message: message || '(không ghi nội dung)',
      response: response || null,
      by: window.CURRENT_USER.name,
    });
    window.STORE.update('customers', custId, {
      reminders,
      lastContact: new Date().toLocaleDateString('vi-VN'),
      remindCount: (c.remindCount || 0) + 1,
    });
  }

  /* === Modal nhắc nợ cá nhân === */
  function openReminderTicket(c, defaultChannel) {
    const tpl = defaultMessage(c);
    window.openModal('📝 Phiếu nhắc nợ — ' + c.code, `
      <div style="padding:10px 12px;background:#FAFAFB;border-radius:8px;font-size:12px;margin-bottom:14px">
        <b>${c.name}</b> · ${c.phone}<br>
        Nợ: <b style="color:var(--danger)">${window.fmt(c.debt)} ₫</b>
        ${c.debtOverdue ? `· Quá hạn: <b style="color:var(--danger)">${window.fmt(c.debtOverdue)} ₫</b>` : ''}
        ${c.remindCount ? ` · Đã nhắc ${c.remindCount} lần` : ''}
      </div>

      <div class="form-row">
        <div><label>Kênh nhắc *</label>
          <select id="remChannel">
            <option value="call" ${defaultChannel==='call'?'selected':''}>📞 Gọi điện</option>
            <option value="zalo" ${defaultChannel==='zalo'?'selected':''}>💬 Zalo</option>
            <option value="sms" ${defaultChannel==='sms'?'selected':''}>📱 SMS</option>
            <option value="email" ${defaultChannel==='email'?'selected':''}>📧 Email</option>
            <option value="onsite">🚶 Đến tận nơi</option>
          </select></div>
        <div><label>Mức độ</label>
          <select id="remLevel">
            <option value="soft">🟢 Nhắc nhẹ (lần 1-2)</option>
            <option value="medium">🟡 Nhắc trung (lần 3-5)</option>
            <option value="strong">🔴 Cảnh báo mạnh (>5 lần)</option>
          </select></div>
      </div>

      <div class="form-row wide"><label>Nội dung nhắn / nói</label>
        <textarea id="remMsg" rows="4">${tpl}</textarea>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          <button type="button" class="btn btn-sm btn-ghost" onclick="window.useTemplate(1)">Mẫu nhẹ</button>
          <button type="button" class="btn btn-sm btn-ghost" onclick="window.useTemplate(2)">Mẫu trung</button>
          <button type="button" class="btn btn-sm btn-ghost" onclick="window.useTemplate(3)">Mẫu cảnh báo</button>
        </div>
      </div>

      <div class="form-row wide"><label>Phản hồi của khách (sau khi liên hệ)</label>
        <select id="remResponse">
          <option value="">-- Chọn phản hồi --</option>
          <option value="promise">✓ Hứa thanh toán</option>
          <option value="paid">💰 Đã thanh toán ngay</option>
          <option value="negotiate">⚖ Xin gia hạn / chia nhỏ</option>
          <option value="excuse">😶 Đưa lý do trì hoãn</option>
          <option value="no-answer">📵 Không bắt máy / không trả lời</option>
          <option value="refuse">❌ Từ chối / cự cãi</option>
        </select></div>

      <div class="form-row wide">
        <label><input type="checkbox" id="remSend" checked> Mở ${defaultChannel==='zalo'?'Zalo':defaultChannel==='call'?'app gọi':'app liên hệ'} ngay sau khi lưu</label>
      </div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window.submitReminder('${c.id}')">📝 Lưu phiếu nhắc</button>`,
      width: '580px'
    });
  }

  function defaultMessage(c) {
    return `Kính chào ${c.contact || c.name},
Nông Sản Tuấn Tú Hà Nội xin nhắc nhở: hiện quý khách còn công nợ ${window.fmt(c.debt)} ₫${c.debtOverdue?` (trong đó ${window.fmt(c.debtOverdue)} ₫ đã quá hạn)`:''}.
Mong quý khách thu xếp thanh toán sớm. Cảm ơn!
— Nông Sản Tuấn Tú Hà Nội`;
  }

  window.useTemplate = function(lvl) {
    const customers = window.STORE.get('customers', []);
    const c = customers.find(x => x.id === window._currentReminderCust);
    if (!c) return;
    let msg = '';
    if (lvl === 1) msg = `Chào ${c.contact}, em là NV CSKH NSTT. Em xin nhắc anh/chị tổng nợ hiện tại ${window.fmt(c.debt)} ₫ — khi nào tiện giúp em thanh toán nhé. Cảm ơn anh/chị!`;
    else if (lvl === 2) msg = `Chào anh/chị ${c.contact}, NSTT đã 2 lần liên hệ về khoản nợ ${window.fmt(c.debt)} ₫ chưa được phản hồi. Mong anh/chị xác nhận thời gian thanh toán cụ thể trong tuần này.`;
    else msg = `THÔNG BÁO QUAN TRỌNG\nKính gửi ${c.name}, công nợ ${window.fmt(c.debt)} ₫ đã quá hạn nhiều lần. Nếu không nhận được phản hồi trong 3 ngày, NSTT buộc phải chuyển hồ sơ sang bộ phận pháp lý và tạm dừng dịch vụ. Mong anh/chị hợp tác.`;
    document.getElementById('remMsg').value = msg;
  };

  window.submitReminder = function(custId) {
    const channel = window.formVal('#remChannel');
    const msg = window.formVal('#remMsg');
    const response = window.formVal('#remResponse');
    const send = document.getElementById('remSend').checked;
    logReminder(custId, channel, msg, response);

    /* Nếu response = paid → mở phiếu thu luôn */
    if (response === 'paid') {
      window.closeModal();
      const c = window.STORE.get('customers', []).find(x => x.id === custId);
      setTimeout(() => openReceipt(c), 200);
      window.toast('✓ Đã ghi · mở phiếu thu', 'success');
      return;
    }

    /* Mở kênh liên hệ */
    if (send) {
      const c = window.STORE.get('customers', []).find(x => x.id === custId);
      const phone = c.phone.replace(/\s/g,'');
      if (channel === 'zalo') window.open('https://zalo.me/' + phone, '_blank');
      else if (channel === 'call') window.location.href = 'tel:' + phone;
      else if (channel === 'sms') window.location.href = 'sms:' + phone + '?body=' + encodeURIComponent(msg);
      else if (channel === 'email' && c.email) window.location.href = 'mailto:' + c.email + '?subject=Nhắc thanh toán công nợ&body=' + encodeURIComponent(msg);
    }

    window.closeModal();
    window.toast('✓ Đã ghi phiếu nhắc nợ', 'success');
    render();
  };

  /* === Lịch sử nhắc nợ === */
  function openReminderHistory(c) {
    const reminders = c.reminders || [];
    const channelIcon = { call:'📞', zalo:'💬', sms:'📱', email:'📧', onsite:'🚶' };
    const respIcon = { promise:'✓', paid:'💰', negotiate:'⚖', excuse:'😶', 'no-answer':'📵', refuse:'❌' };
    const respLabel = { promise:'Hứa TT', paid:'Đã TT', negotiate:'Xin gia hạn', excuse:'Đưa lý do', 'no-answer':'Không bắt máy', refuse:'Từ chối' };

    window.openModal('📋 Lịch sử nhắc nợ — ' + c.code, `
      <div style="padding:10px 12px;background:#FAFAFB;border-radius:8px;font-size:12px;margin-bottom:14px">
        <b>${c.name}</b> · ${c.phone}<br>
        Tổng đã nhắc: <b>${reminders.length} lần</b> · Nợ hiện tại: <b style="color:var(--danger)">${window.fmt(c.debt)} ₫</b>
      </div>
      ${reminders.length ? `
        <div style="max-height:400px;overflow:auto">
          ${reminders.map((r, i) => `
            <div style="border-left:3px solid var(--navy);padding:10px 14px;background:#FAFAFB;border-radius:0 8px 8px 0;margin-bottom:8px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <span style="font-size:16px">${channelIcon[r.channel]||'📝'}</span>
                <b style="color:var(--navy)">Lần ${reminders.length - i}</b>
                <span style="font-size:11px;color:var(--muted)">· ${r.date} · ${r.by}</span>
                ${r.response ? `<span class="status-pill" style="background:${r.response==='paid'?'var(--ok-bg)':r.response==='promise'?'var(--info-bg)':'var(--warn-bg)'};color:${r.response==='paid'?'var(--ok)':r.response==='promise'?'var(--info)':'var(--warn)'};margin-left:auto">${respIcon[r.response]} ${respLabel[r.response]}</span>` : ''}
              </div>
              <div style="font-size:12.5px;color:var(--text);white-space:pre-wrap;padding:6px 0">${r.message}</div>
            </div>
          `).join('')}
        </div>
      ` : `<div style="text-align:center;padding:30px;color:var(--muted)">Chưa có lịch sử nhắc nợ nào.</div>`}
    `, {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Đóng</button>
               <button class="btn btn-navy" onclick="window._currentReminderCust='${c.id}';closeModal();setTimeout(()=>openReminderTicketGlobal('${c.id}'),100)">📝 Thêm nhắc nợ mới</button>`,
      width: '640px'
    });
    window._currentReminderCust = c.id;
  }

  window.openReminderTicketGlobal = function(custId) {
    const c = window.STORE.get('customers', []).find(x => x.id === custId);
    if (c) openReminderTicket(c, 'call');
  };

  /* === Nhắc nợ hàng loạt === */
  window.openBulkReminder = function() {
    const debtors = loadDebtors().map(c => ({...c, overdue: overdueDays(c)}))
                                  .sort((a,b) => b.overdue - a.overdue);
    if (!debtors.length) {
      window.toast('Không có KH nào đang nợ', 'info');
      return;
    }
    const listHTML = debtors.map(c => `
      <label class="check-item" style="display:flex;align-items:center;gap:10px;padding:10px 12px">
        <input type="checkbox" data-bulk-id="${c.id}" ${c.overdue>0?'checked':''}>
        <div style="flex:1;line-height:1.3">
          <div style="font-weight:600">${c.name} <span style="font-size:11px;color:var(--muted)">· ${c.code} · ${c.phone}</span></div>
          <div style="font-size:11.5px;color:var(--muted)">NV: ${c.staffOwner} · Lần nhắc cuối: ${c.lastContact}${c.remindCount?` · Đã nhắc ${c.remindCount} lần`:''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700;color:var(--danger);font-variant-numeric:tabular-nums">${window.fmt(c.debt)} ₫</div>
          ${c.overdue>0 ? `<div style="font-size:10.5px;color:var(--danger);font-weight:600">⏰ ${c.overdue} ngày</div>` : '<div style="font-size:10.5px;color:var(--ok)">✓ trong hạn</div>'}
        </div>
      </label>
    `).join('');

    const totalOverdue = debtors.filter(c => c.overdue > 0).reduce((s,c) => s+c.debt, 0);
    const totalAll = debtors.reduce((s,c) => s+c.debt, 0);

    window.openModal('📧 Nhắc nợ hàng loạt', `
      <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:12px;font-size:12.5px;color:var(--warn);margin-bottom:14px">
        💡 Mặc định tick sẵn KH <b>quá hạn</b>. Nội dung tin nhắn tự sinh theo template với tên KH + số nợ + ngày quá hạn. Gửi cùng lúc trên kênh đã chọn.
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
        <div style="padding:10px;background:#FEF2F2;border-radius:8px;border-left:4px solid var(--danger)">
          <div style="font-size:11px;color:var(--muted);font-weight:600">QUÁ HẠN</div>
          <div style="font-size:16px;font-weight:800;color:var(--danger)">${window.fmtShort(totalOverdue)}</div>
        </div>
        <div style="padding:10px;background:#F0FDF4;border-radius:8px;border-left:4px solid var(--ok)">
          <div style="font-size:11px;color:var(--muted);font-weight:600">TỔNG NỢ</div>
          <div style="font-size:16px;font-weight:800;color:var(--navy)">${window.fmtShort(totalAll)}</div>
        </div>
        <div style="padding:10px;background:#DBEAFE;border-radius:8px;border-left:4px solid var(--info)">
          <div style="font-size:11px;color:var(--muted);font-weight:600">SỐ KH</div>
          <div style="font-size:16px;font-weight:800;color:var(--info)">${debtors.length}</div>
        </div>
      </div>

      <div class="form-row">
        <div><label>Kênh gửi *</label>
          <select id="bulkChannel">
            <option value="zalo">💬 Zalo (qua bot OA)</option>
            <option value="sms">📱 SMS hàng loạt</option>
            <option value="email">📧 Email</option>
            <option value="telegram">✈️ Telegram (NV nội bộ)</option>
          </select></div>
        <div><label>Mức độ</label>
          <select id="bulkLevel" onchange="window.refreshBulkTemplate()">
            <option value="soft">🟢 Nhắc nhẹ</option>
            <option value="medium" selected>🟡 Nhắc trung</option>
            <option value="strong">🔴 Cảnh báo mạnh</option>
          </select></div>
      </div>

      <div class="form-row wide">
        <label>Mẫu tin nhắn (dùng <code>{name}</code>, <code>{debt}</code>, <code>{days}</code>)</label>
        <textarea id="bulkTemplate" rows="4">Kính gửi {name}, NSTT xin nhắc nhở khoản công nợ {debt} ₫{days} đang chờ thanh toán. Mong quý khách thu xếp sớm. Cảm ơn! — Hotline NSTT 0836 676 086</textarea>
      </div>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <b style="font-size:13px;color:var(--navy)">Chọn KH để nhắc:</b>
        <button class="btn btn-sm btn-ghost" onclick="window.bulkSelectAll(true)">✓ Chọn tất cả</button>
        <button class="btn btn-sm btn-ghost" onclick="window.bulkSelectAll(false)">Bỏ chọn</button>
        <button class="btn btn-sm btn-ghost" onclick="window.bulkSelectOverdue()">Chỉ quá hạn</button>
        <div style="flex:1"></div>
        <span style="font-size:12px;color:var(--muted)" id="bulkCount">${debtors.filter(c=>c.overdue>0).length} / ${debtors.length} KH</span>
      </div>

      <div style="max-height:280px;overflow:auto;border:1px solid var(--line);border-radius:8px">
        ${listHTML}
      </div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
               <button class="btn btn-ghost" onclick="window.bulkPreview()">👁 Xem trước tin 1 KH</button>
               <button class="btn btn-primary" onclick="window.sendBulkReminders()">📤 Gửi nhắc nợ</button>`,
      width: '720px'
    });

    /* Bind count update */
    document.querySelectorAll('[data-bulk-id]').forEach(cb => {
      cb.onchange = () => {
        const checked = document.querySelectorAll('[data-bulk-id]:checked').length;
        document.getElementById('bulkCount').textContent = checked + ' / ' + debtors.length + ' KH';
      };
    });
  };

  /* Đổi mẫu nhắc theo mức độ Nhẹ/Trung/Mạnh */
  window.refreshBulkTemplate = function() {
    const lv = (document.getElementById('bulkLevel') || {}).value || 'medium';
    const tpl = {
      soft:   'Kính gửi {name}, xin nhắc nhẹ khoản công nợ {debt} ₫{days}. Khi rảnh quý khách thu xếp giúp ạ. Cảm ơn! — Hotline NSTT 0836 676 086',
      medium: 'Kính gửi {name}, NSTT xin nhắc nhở khoản công nợ {debt} ₫{days} đang chờ thanh toán. Mong quý khách thu xếp sớm. Cảm ơn! — Hotline NSTT 0836 676 086',
      strong: '⚠️ Kính gửi {name}, khoản nợ {debt} ₫{days} đã quá hạn lâu. Vui lòng thanh toán trước 7 ngày tới để tránh tạm dừng giao hàng. NSTT 0836 676 086',
    };
    const ta = document.getElementById('bulkTemplate');
    if (ta) ta.value = tpl[lv] || tpl.medium;
  };

  window.bulkSelectAll = function(on) {
    document.querySelectorAll('[data-bulk-id]').forEach(cb => cb.checked = on);
    document.getElementById('bulkCount').textContent =
      document.querySelectorAll('[data-bulk-id]:checked').length + ' / ' + document.querySelectorAll('[data-bulk-id]').length + ' KH';
  };
  window.bulkSelectOverdue = function() {
    const debtors = loadDebtors();
    document.querySelectorAll('[data-bulk-id]').forEach(cb => {
      const c = debtors.find(x => x.id === cb.dataset.bulkId);
      cb.checked = c && overdueDays(c) > 0;
    });
    document.getElementById('bulkCount').textContent =
      document.querySelectorAll('[data-bulk-id]:checked').length + ' / ' + document.querySelectorAll('[data-bulk-id]').length + ' KH';
  };

  window.bulkPreview = function() {
    const checked = document.querySelectorAll('[data-bulk-id]:checked');
    if (!checked.length) { window.toast('Tick ít nhất 1 KH', 'warn'); return; }
    const debtors = loadDebtors();
    const c = debtors.find(x => x.id === checked[0].dataset.bulkId);
    if (!c) return;
    const tpl = window.formVal('#bulkTemplate');
    const overd = overdueDays(c);
    const msg = tpl
      .replace(/{name}/g, c.contact || c.name)
      .replace(/{debt}/g, window.fmt(c.debt))
      .replace(/{days}/g, overd > 0 ? ` (quá hạn ${overd} ngày)` : '');
    alert('📤 Tin nhắn mẫu sẽ gửi cho ' + c.name + ':\n\n' + msg);
  };

  window.sendBulkReminders = function() {
    const checked = Array.from(document.querySelectorAll('[data-bulk-id]:checked'));
    if (!checked.length) { window.toast('Tick ít nhất 1 KH', 'warn'); return; }
    const channel = window.formVal('#bulkChannel');
    const tpl = window.formVal('#bulkTemplate');
    const debtors = loadDebtors();
    let count = 0;
    checked.forEach(cb => {
      const c = debtors.find(x => x.id === cb.dataset.bulkId);
      if (!c) return;
      const overd = overdueDays(c);
      const msg = tpl
        .replace(/{name}/g, c.contact || c.name)
        .replace(/{debt}/g, window.fmt(c.debt))
        .replace(/{days}/g, overd > 0 ? ` (quá hạn ${overd} ngày)` : '');
      logReminder(c.id, channel, msg);
      count++;
    });
    window.closeModal();
    window.toast(`✓ Đã gửi ${count} nhắc nợ qua ${channel.toUpperCase()} (simulate)`, 'success');
    render();
  };

  /* === Chọn KH để tạo phiếu thu (khi click + Phiếu thu nợ) === */
  window.openSelectDebtor = function() {
    const debtors = loadDebtors();
    if (!debtors.length) { window.toast('Không có KH nào đang nợ', 'info'); return; }
    const list = debtors.map(c => `
      <button class="check-item dbt-item" data-s="${((c.name || '') + ' ' + (c.code || '') + ' ' + (c.phone || '')).toLowerCase().replace(/"/g, '')}" style="width:100%;text-align:left;border:1px solid var(--line);cursor:pointer;background:#fff" onclick="closeModal();setTimeout(()=>window._openReceiptById('${c.id}'),100)">
        <div style="flex:1">
          <div style="font-weight:600">${c.name}</div>
          <div style="font-size:11px;color:var(--muted)">${c.code} · ${c.phone}</div>
        </div>
        <div style="font-weight:700;color:var(--danger)">${window.fmt(c.debt)} ₫</div>
      </button>
    `).join('');
    const html = `
      <input id="debtorSearch" type="search" placeholder="🔎 Tìm tên / mã KH / SĐT…" autocomplete="off" oninput="window._filterDebtors(this.value)" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--line);border-radius:8px;font-size:14px;margin-bottom:10px">
      <div id="debtorList" style="max-height:60vh;overflow:auto;display:flex;flex-direction:column;gap:6px">${list}</div>
      <div id="debtorEmpty" style="display:none;text-align:center;color:var(--muted);padding:16px;font-size:13px">Không tìm thấy KH khớp.</div>`;
    window.openModal('💵 Chọn KH cần tạo phiếu thu nợ', html, {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Đóng</button>`,
      width: '560px'
    });
    setTimeout(() => { const el = document.getElementById('debtorSearch'); if (el) el.focus(); }, 150);
  };
  window._filterDebtors = function (q) {
    q = (q || '').trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('#debtorList .dbt-item').forEach(b => {
      const ok = !q || (b.getAttribute('data-s') || '').includes(q);
      b.style.display = ok ? '' : 'none'; if (ok) shown++;
    });
    const emp = document.getElementById('debtorEmpty'); if (emp) emp.style.display = shown ? 'none' : 'block';
  };
  window._openReceiptById = function(custId) {
    const c = loadDebtors().find(x => x.id === custId);
    if (c) openReceipt(c);
  };

  /* === Export CSV === */
  window.exportDebtCSV = function() {
    const debtors = loadDebtors().map(c => ({...c, overdue: overdueDays(c)}));
    const rows = [['Mã KH','Tên KH','SĐT','Email','NV PT','Tổng nợ','Quá hạn','Số ngày quá hạn','Lần nhắc cuối','Số lần đã nhắc']];
    debtors.forEach(c => rows.push([
      c.code, c.name, c.phone, c.email||'', c.staffOwner,
      c.debt, c.debtOverdue||0, c.overdue, c.lastContact, c.remindCount||0
    ]));
    const csv = rows.map(r => r.map(x => '"' + String(x).replace(/"/g,'""') + '"').join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type:'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'CongNo-NSTT-' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    window.toast('⬇ Đã xuất ' + debtors.length + ' KH (CSV)', 'success');
  };

  function openReceipt(c) {
    /* Lấy HĐ chưa TT của KH này từ store */
    const invoices = window.STORE.get('invoices', []);
    const custInvoices = invoices.filter(i =>
      (i.cust||'').toLowerCase().includes(c.name.toLowerCase().slice(0,15)) &&
      (i.status === 'pending' || i.status === 'overdue')
    );
    const accounts = window.STORE.get('paymentAccounts', []).filter(a => a.active);
    const accOpts = accounts.map(a => `<option>${a.name}</option>`).join('') || '<option>Tiền mặt</option>';

    const invHtml = custInvoices.length ? custInvoices.map(i => {
      const total = (i.net || 0) + (i.vat || 0);
      return `<label class="check-item" data-inv="${i.no}" data-amount="${total}" style="display:flex;align-items:center;gap:10px">
        <input type="checkbox" data-inv-cb="${i.no}" data-amount="${total}" onchange="window.recalcReceipt()">
        <div style="flex:1">
          <div style="font-weight:600">${i.no}</div>
          <div style="font-size:11px;color:var(--muted)">${i.date} · ${i.desc || 'Cước vận chuyển'} · <span class="alert-badge ${i.status==='overdue'?'danger':'warn'}">${i.status==='overdue'?'Quá hạn':'Chờ TT'}</span></div>
        </div>
        <div style="text-align:right;font-weight:700;color:var(--navy)">${window.fmt(total)} ₫</div>
      </label>`;
    }).join('') : `<div style="padding:14px;text-align:center;color:var(--muted);background:#FAFAFB;border-radius:8px;font-size:12px">
      Không có HĐ chưa TT khớp KH này. Nhập số tiền thu thủ công ở dưới.
    </div>`;

    window.openModal('💵 Phiếu thu công nợ — ' + c.code, `
      <div style="padding:12px;background:#FAFAFB;border-radius:8px;font-size:12px;margin-bottom:14px">
        <div><b>${c.name}</b> · ${c.phone} · NV: ${c.staffOwner}</div>
        <div style="color:var(--muted);margin-top:4px">Tổng nợ: <b style="color:var(--danger)">${window.fmt(c.debt)} ₫</b>
        ${c.debtOverdue ? `· Quá hạn: <b style="color:var(--danger)">${window.fmt(c.debtOverdue)} ₫</b>` : ''}</div>
      </div>

      <div class="section-h" style="margin:0 0 8px">📋 Áp dụng phiếu thu cho HĐ nào? (tick để gộp)</div>
      <div class="check-grid" style="grid-template-columns:1fr;margin-bottom:14px">${invHtml}</div>

      <div class="form-row">
        <div><label>Số phiếu</label><input id="rNo" value="PT-${Date.now().toString(36).toUpperCase()}" readonly style="background:#FAFAFB"></div>
        <div><label>Ngày thu</label><input id="rDate" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="form-row">
        <div><label>Số tiền thu *</label><input id="rAmount" type="number" value="${c.debt}" oninput="window.checkOverpay(${c.debt})"></div>
        <div><label>TK nhận</label>
          <select id="rAccount">${accOpts}</select></div>
      </div>
      <div id="rWarn" style="display:none;font-size:12px;color:var(--warn);background:#FEF3C7;padding:8px 12px;border-radius:7px;margin-bottom:12px">
        ⚠️ Số tiền thu lớn hơn tổng nợ — số dư thừa sẽ ghi nhận như "trả trước".
      </div>
      <div class="form-row wide">
        <label>Diễn giải</label>
        <textarea id="rDesc" rows="2">Thanh toán công nợ ${c.code} ${c.name}</textarea>
      </div>
      <div class="form-row wide">
        <label><input type="checkbox" id="rPrintAfter" checked> Mở phiếu thu để in / gửi KH sau khi lưu</label>
      </div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window.submitDebtReceipt('${c.id}')">💾 Lưu phiếu thu</button>`,
      width: '620px'
    });
  }

  /* Tự cộng tổng tiền khi tick HĐ */
  window.recalcReceipt = function() {
    let total = 0;
    document.querySelectorAll('[data-inv-cb]:checked').forEach(cb => {
      total += parseInt(cb.dataset.amount, 10) || 0;
    });
    if (total > 0) document.getElementById('rAmount').value = total;
  };

  window.checkOverpay = function(maxDebt) {
    const v = parseInt(document.getElementById('rAmount').value, 10) || 0;
    document.getElementById('rWarn').style.display = v > maxDebt ? 'block' : 'none';
  };

  window.submitDebtReceipt = function(custId) {
    if (window.__busyReceipt) return; window.__busyReceipt = true; setTimeout(() => { window.__busyReceipt = false; }, 2500);   /* chống double-click → nuốt phiếu */
    const amount = parseInt(window.formVal('#rAmount'), 10) || 0;
    if (!amount) { window.toast('Nhập số tiền', 'warn'); return; }
    const debtors = loadDebtors();
    const c = debtors.find(x => x.id === custId);
    if (!c) return;

    const dateInput = window.formVal('#rDate');
    const date = dateInput ? new Date(dateInput).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN');
    const account = window.formVal('#rAccount');
    const desc = window.formVal('#rDesc') || 'Thanh toán công nợ';
    const phieuNo = window.formVal('#rNo');

    /* Tìm các HĐ được tick */
    const appliedInvoices = Array.from(document.querySelectorAll('[data-inv-cb]:checked')).map(cb => cb.dataset.invCb);

    /* Update các HĐ → status = paid */
    if (appliedInvoices.length) {
      appliedInvoices.forEach(no => {
        window.STORE.update('invoices', no, { status: 'paid', paidDate: date, paidVia: phieuNo });
      });
    }

    /* Công nợ KH: KHÔNG ghi debt/debtOverdue vào customers (nguồn kép).
       Nguồn duy nhất là addDebtLedger type 'payment' bên dưới → tính qua window.custDebt(). */
    window.STORE.update('customers', custId, {
      lastContact: date,
    });

    /* Ghi sổ quỹ */
    window.STORE.add('cashEntries', {
      no: phieuNo,
      date, type: 'in',
      party: c.code + ' · ' + c.name,
      desc: desc + (appliedInvoices.length ? ' (Gộp ' + appliedInvoices.length + ' HĐ: ' + appliedInvoices.join(', ') + ')' : ''),
      account, amount,
      staff: window.CURRENT_USER.name,
    });

    /* Ghi SỔ CÔNG NỢ (payment) */
    window.addDebtLedger && window.addDebtLedger({
      custId, type: 'payment', amount, ref: phieuNo, date,
      desc: desc + (appliedInvoices.length ? ' (' + appliedInvoices.length + ' HĐ)' : ''),
    });

    /* Số dư TK tính ĐỘNG từ cashEntries (phiếu thu 'in' đã ghi ở trên) — KHÔNG cộng dồn field balance. */

    const printAfter = document.getElementById('rPrintAfter')?.checked;
    window.closeModal();
    window.toast(`✓ Đã thu ${window.fmt(amount)} ₫ từ ${c.name}${appliedInvoices.length?' · '+appliedInvoices.length+' HĐ':''}`, 'success');

    if (printAfter) {
      setTimeout(() => window.printReceipt({
        no: phieuNo, date, custName: c.name, custPhone: c.phone, custCode: c.code,
        amount, account, desc, invoices: appliedInvoices,
        staff: window.CURRENT_USER.name,
      }), 500);
    }
    render();
  };

  /* === In preview phiếu thu === */
  window.printReceipt = function(r) {
    const company = window.STORE.get('companyInfo', null) || {
      name:'Công ty TNHH Nông Sản Tuấn Tú Hà Nội', shortName:'Nông Sản Tuấn Tú Hà Nội',
      address:'Số 88 Trần Duy Hưng, Cầu Giấy, Hà Nội',
      tax:'0110302211', hotline:'0836 676 086', email:'nongsantuantuhanoi@gmail.com'
    };
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Phiếu thu ${r.no}</title>
      <style>
        body{font-family:'Times New Roman',serif;max-width:800px;margin:0 auto;padding:30px;color:#000;font-size:13px}
        .head{display:flex;gap:16px;border-bottom:2px solid #339B21;padding-bottom:14px;margin-bottom:20px}
        .logo{width:70px;height:70px;background:#339B21;color:#fff;border-radius:10px;display:grid;place-items:center;font-weight:800;font-size:22px}
        .info{flex:1}
        .info .n1{font-size:18px;font-weight:700;color:#1B5E20}
        .info .n2{font-size:12px;color:#555;margin-top:3px;line-height:1.5}
        h1{text-align:center;color:#339B21;font-size:24px;margin:20px 0 4px;letter-spacing:1px}
        .subt{text-align:center;color:#666;font-size:13px;margin-bottom:24px}
        .no{text-align:right;font-size:13px;margin-bottom:14px}
        .no b{color:#339B21;font-size:15px}
        table.kv{width:100%;border-collapse:collapse;margin:16px 0}
        table.kv td{padding:8px 12px;border:1px solid #ccc}
        table.kv td:first-child{width:35%;background:#FAFAFB;font-weight:600;color:#1B5E20}
        .amount-box{background:#FEF3C7;border:2px solid #339B21;padding:16px;text-align:center;margin:20px 0;border-radius:8px}
        .amount-box .lab{font-size:12px;color:#555;text-transform:uppercase;letter-spacing:1px;font-weight:700}
        .amount-box .val{font-size:28px;font-weight:800;color:#339B21;margin-top:6px}
        .amount-box .text{font-style:italic;color:#666;margin-top:4px;font-size:13px}
        .applied{margin-top:14px;padding:10px;background:#F0FDF4;border:1px solid #86EFAC;border-radius:6px;font-size:12px}
        .sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:50px;text-align:center;font-size:12px}
        .sign .col{padding-top:10px}
        .sign .role{font-weight:700;text-transform:uppercase;letter-spacing:0.5px}
        .sign .ghi{font-style:italic;font-size:11px;color:#666;margin-bottom:60px}
        @media print { body{padding:20px} .noprint{display:none} }
      </style></head><body>
      <div class="head">
        <div class="logo">NSTT</div>
        <div class="info">
          <div class="n1">${company.name.toUpperCase()}</div>
          <div class="n2">
            📍 ${company.address}<br>
            ☎️ ${company.hotline} · ✉️ ${company.email||''}<br>
            MST: ${company.tax}
          </div>
        </div>
      </div>

      <h1>PHIẾU THU</h1>
      <div class="subt">(Số: ${r.no} — Ngày ${r.date})</div>

      <table class="kv">
        <tr><td>Họ tên người nộp</td><td><b>${r.custName}</b></td></tr>
        <tr><td>Mã khách hàng / SĐT</td><td>${r.custCode} · ${r.custPhone}</td></tr>
        <tr><td>Lý do nộp</td><td>${r.desc}</td></tr>
        <tr><td>Tài khoản nhận</td><td>${r.account}</td></tr>
      </table>

      <div class="amount-box">
        <div class="lab">SỐ TIỀN ĐÃ THU</div>
        <div class="val">${window.fmt(r.amount)} ₫</div>
        <div class="text">(${window.numberToWords ? window.numberToWords(r.amount) : window.fmt(r.amount) + ' đồng'})</div>
      </div>

      ${r.invoices.length ? `<div class="applied">
        <b>📋 Áp dụng cho ${r.invoices.length} hóa đơn:</b>
        ${r.invoices.join(' · ')}
      </div>` : ''}

      <div class="sign">
        <div class="col">
          <div class="role">Người nộp</div>
          <div class="ghi">(Ký, ghi rõ họ tên)</div>
          <div>${r.custName}</div>
        </div>
        <div class="col">
          <div class="role">Kế toán</div>
          <div class="ghi">(Ký, ghi rõ họ tên)</div>
          <div>${r.staff}</div>
        </div>
        <div class="col">
          <div class="role">Thủ quỹ</div>
          <div class="ghi">(Ký, ghi rõ họ tên)</div>
          <div>_____________</div>
        </div>
      </div>

      <div class="noprint" style="margin-top:30px;display:flex;gap:10px;justify-content:center;border-top:1px solid #ccc;padding-top:20px">
        <button onclick="window.print()" style="background:#339B21;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">🖨 In phiếu</button>
        <button onclick="window.close()" style="background:#fff;color:#1B5E20;border:1px solid #1B5E20;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer">Đóng</button>
      </div>
    </body></html>`;
    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
  };

  /* Helper: số → chữ tiếng Việt (đơn giản) */
  window.numberToWords = window.numberToWords || function(n) {
    if (!n) return 'Không đồng';
    const units = ['','một','hai','ba','bốn','năm','sáu','bảy','tám','chín'];
    function below1000(n) {
      const h = Math.floor(n/100), t = Math.floor(n%100/10), o = n%10;
      let s = '';
      if (h) s += units[h] + ' trăm';
      if (t > 1) { s += (s?' ':'') + units[t] + ' mươi'; if (o) s += ' ' + units[o]; }
      else if (t === 1) { s += (s?' ':'') + 'mười'; if (o) s += ' ' + units[o]; }
      else if (t === 0 && o && s) { s += ' lẻ ' + units[o]; }
      else if (o) { s += units[o]; }
      return s;
    }
    const ty = Math.floor(n/1e9), tr = Math.floor(n%1e9/1e6), ng = Math.floor(n%1e6/1e3), dv = n%1e3;
    let r = '';
    if (ty) r += below1000(ty) + ' tỷ ';
    if (tr) r += below1000(tr) + ' triệu ';
    if (ng) r += below1000(ng) + ' nghìn ';
    if (dv) r += below1000(dv);
    return (r.trim() + ' đồng chẵn').replace(/^./, c => c.toUpperCase());
  };

  window.STORE.subscribe('customers', render);
  window.renderAppShell('debt', 'Công nợ');
  ['qSearch', 'fBucket'].forEach(id => document.getElementById(id)?.addEventListener('input', render));
  render();
})();
