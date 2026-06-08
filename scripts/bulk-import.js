/* =========================================================
   BulkImport — helper chung cho nhập Excel + Ảnh AI
   ─────────────────────────────────────────────────────────
   Dùng pattern này cho mọi module cần nhập hàng loạt:

   window.BulkImport.fromExcel({
     templateColumns: ['Tên', 'SĐT', 'Địa chỉ', 'Email', ...],
     templateRow:     ['Nhà hàng ABC', '0912345678', 'Hà Nội', 'abc@example.com'],
     mapRow: (row, headers) => ({ name: row[0], phone: row[1], ... }),
     onParsed: (records) => { ... },
   });

   window.BulkImport.fromImage({
     entityName: 'Lead',                  // hiển thị trong modal
     promptHint: 'list KH tiềm năng...',  // hint nội dung ảnh
     fields: ['name', 'phone', 'source'], // schema mong đợi
     aiTask: 'customer',                  // routing AI provider
     onParsed: (records) => { ... },
   });

   Có sẵn:
   - Template Excel auto-generate (download)
   - Preview rows trước khi import
   - Validation cơ bản
   ========================================================= */
(function () {

  function downloadTemplate(opts) {
    if (!window.XLSX) {
      window.toast && window.toast('SheetJS chưa load, reload trang', 'warn');
      return;
    }
    const data = [opts.templateColumns, opts.templateRow || opts.templateColumns.map(() => '')];
    const ws = window.XLSX.utils.aoa_to_sheet(data);
    /* Set col widths */
    ws['!cols'] = opts.templateColumns.map(c => ({ wch: Math.max(c.length + 2, 14) }));
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, opts.sheetName || 'Template');
    window.XLSX.writeFile(wb, opts.fileName || 'template.xlsx');
  }

  function parseExcelFile(file, opts) {
    return new Promise(async (resolve, reject) => {
      try {
        const buf = await file.arrayBuffer();
        const wb = window.XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (data.length < 2) return reject(new Error('File trống hoặc chỉ có header'));
        const headers = data[0].map(h => String(h || '').trim());
        const rows = data.slice(1).filter(r => r.some(c => String(c || '').trim()));
        const records = rows.map(r => opts.mapRow(r, headers)).filter(Boolean);
        resolve({ headers, records, totalRows: rows.length });
      } catch (e) { reject(e); }
    });
  }

  function previewRecords(records, opts) {
    if (!records.length) {
      window.toast && window.toast('Không có dòng dữ liệu nào', 'warn');
      return;
    }
    const fields = Object.keys(records[0]);
    const previewLimit = Math.min(records.length, 20);

    window.openModal(`✓ Xem trước ${records.length} dòng — xác nhận import?`, `
      <div style="background:#EFF6FF;color:#1E40AF;padding:9px 12px;border-radius:7px;font-size:12px;margin-bottom:12px">
        💡 Xem nhanh ${previewLimit}/${records.length} dòng đầu. Sau khi import — vào danh sách kiểm tra + xoá dòng sai (nếu có).
      </div>
      <div style="max-height:380px;overflow:auto;border:1px solid var(--line);border-radius:6px">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#FAFBFC">
            ${fields.map(f => `<th style="text-align:left;padding:6px 8px;font-size:10.5px;color:var(--muted);text-transform:uppercase;border-bottom:1px solid var(--line)">${f}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${records.slice(0, previewLimit).map(r => `<tr>
              ${fields.map(f => `<td style="padding:6px 8px;border-bottom:1px solid #F1F5F9">${String(r[f]||'').slice(0,50)}</td>`).join('')}
            </tr>`).join('')}
            ${records.length > previewLimit ? `<tr><td colspan="${fields.length}" style="padding:8px;text-align:center;color:var(--muted);font-style:italic">… còn ${records.length-previewLimit} dòng nữa</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    `, {
      footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Hủy</button>
               <button class="btn btn-primary" onclick="window._biConfirmImport()">✓ Import ${records.length} dòng</button>`,
      width: '720px',
      stack: true,   /* xếp chồng — KHÔNG xoá form (vd phiếu nhập) đang mở bên dưới */
    });
    window._biPendingRecords = records;
    window._biPendingOpts = opts;
  }

  window._biConfirmImport = function() {
    const records = window._biPendingRecords;
    const opts = window._biPendingOpts;
    if (!records || !opts) return;
    window.closeModal();
    opts.onParsed(records);
    if (window.audit) window.audit.log('bulk.import', `${opts.entityName||'records'} × ${records.length}`);
    delete window._biPendingRecords;
    delete window._biPendingOpts;
  };

  window.BulkImport = {

    /* ===== Excel import workflow ===== */
    fromExcel(opts) {
      window.openModal(`📥 Nhập ${opts.entityName || 'dữ liệu'} bằng Excel`, `
        <div style="background:#EFF6FF;color:#1E40AF;padding:10px 12px;border-radius:8px;font-size:12.5px;margin-bottom:12px;line-height:1.55">
          💡 <b>Cách dùng:</b>
          <br>1. Bấm <b>"Tải template"</b> → mở Excel điền vào theo cột mẫu
          <br>2. Lưu lại → bấm <b>"Chọn file"</b> upload
          <br>3. Xem preview → xác nhận import
        </div>
        <div style="background:#FAFBFC;padding:10px 12px;border-radius:7px;font-size:12px;margin-bottom:12px">
          <b>Các cột bắt buộc:</b><br>
          <code style="background:#fff;padding:3px 7px;border-radius:4px;display:inline-block;margin-top:4px;font-size:11px">${opts.templateColumns.join(' · ')}</code>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-ghost" style="flex:1" onclick="window._biDownloadTpl()">⬇ Tải template Excel</button>
          <button class="btn btn-primary" style="flex:1" onclick="document.getElementById('_biFile').click()">📂 Chọn file đã điền</button>
        </div>
        <input type="file" id="_biFile" accept=".xlsx,.xls,.csv" style="display:none">
      `, {
        footer: `<button class="btn btn-ghost" onclick="window.closeModal()">Đóng</button>`,
        width: '500px',
      });
      window._biCurrentOpts = opts;
      window._biDownloadTpl = () => downloadTemplate({
        templateColumns: opts.templateColumns,
        templateRow: opts.templateRow,
        fileName: `template-${(opts.entityName||'data').toLowerCase().replace(/\s+/g,'-')}.xlsx`,
        sheetName: opts.entityName || 'Data',
      });
      document.getElementById('_biFile').onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try {
          const { records, totalRows } = await parseExcelFile(f, opts);
          window.closeModal();
          window.toast && window.toast(`📊 Parse được ${records.length}/${totalRows} dòng`, 'info');
          setTimeout(() => previewRecords(records, opts), 200);
        } catch (err) {
          window.toast && window.toast('❌ Lỗi: ' + err.message, 'warn');
        }
      };
    },

    /* ===== Image AI import workflow ===== */
    fromImage(opts) {
      if (!window.AI || !window.AI.openFillModal) {
        window.toast && window.toast('AI module chưa load', 'warn'); return;
      }
      const fieldsList = (opts.fields || []).join(', ');
      const prompt = opts.customPrompt || `Đọc ảnh và trích xuất danh sách ${opts.entityName || 'records'}.
Mỗi record có các trường: ${fieldsList}.
Trả JSON: {"items":[{${(opts.fields||[]).map(f => `"${f}":"giá trị"`).join(', ')}}, ...]}
Nếu thiếu trường → để chuỗi rỗng. CHỈ TRẢ JSON.`;

      window.AI.openFillModal({
        task: opts.aiTask || 'customer',
        title: `📷 Nhập ${opts.entityName || 'dữ liệu'} từ ảnh (AI)`,
        guideHtml: `Chụp / upload ảnh chứa <b>${opts.promptHint || 'danh sách records'}</b>. AI sẽ đọc và trích xuất các trường: <code>${fieldsList}</code>. Sau đó bạn xem preview và xác nhận.`,
        prompt,
        onResult: (d) => {
          const items = (d && (d.items || d.records || d.data)) || [];
          if (!items.length) {
            window.toast && window.toast('AI không đọc được dữ liệu', 'warn'); return;
          }
          window.toast && window.toast(`🤖 AI đọc được ${items.length} record`, 'success');
          setTimeout(() => previewRecords(items, opts), 200);
        },
      });
    },
  };

})();
