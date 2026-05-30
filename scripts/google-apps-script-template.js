/* =========================================================
   GOOGLE APPS SCRIPT TEMPLATE — NSTT Sync
   ─────────────────────────────────────────────────────────
   ⚠️ File này CHỈ ĐỂ COPY-PASTE vào Google Apps Script,
       KHÔNG được load trong web app NSTT.
       Đặt ở scripts/ chỉ để dễ tìm thấy + version control.

   📋 HƯỚNG DẪN CÀI ĐẶT (5 phút):

   1. Mở https://sheets.google.com → tạo Sheet mới
      → Đặt tên "NSTT - Báo cáo Kế toán"

   2. Bấm menu Tools → Apps Script (hoặc Extensions → Apps Script)
      → Cửa sổ mới mở ra, có code mặc định

   3. XÓA toàn bộ code mặc định, COPY-PASTE TOÀN BỘ code dưới đây vào.

   4. Bấm 💾 Save (Ctrl+S), đặt tên project "NSTT Sync"

   5. Bấm Deploy (góc trên phải) → New deployment
      - Type: Web app
      - Description: NSTT v1
      - Execute as: Me (your email)
      - Who has access: Anyone   ← ⚠️ QUAN TRỌNG: chọn Anyone
      → Deploy

   6. Google sẽ xin quyền → bấm Authorize → chọn account → Advanced
      → Go to NSTT Sync (unsafe) → Allow

   7. Copy "Web app URL" (dạng https://script.google.com/macros/s/.../exec)

   8. Vào NSTT app → Settings → Tích hợp → Google Sheets → Cấu hình
      → Paste URL vào ô "Apps Script Web App URL" → Lưu → Test

   ✅ XONG! Mọi đơn/KH/sổ quỹ/HĐ tạo trong NSTT sẽ tự đồng bộ Sheets.
   ========================================================= */

// ========== CODE PASTE VÀO APPS SCRIPT ==========

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheetName = data.sheet || 'Default';
    const rows = data.rows || [];
    const mode = data.mode || 'append';  // 'append' hoặc 'replace'

    if (!rows.length) {
      return ContentService.createTextOutput(JSON.stringify({
        ok: true, message: 'No data', count: 0
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    if (mode === 'replace') {
      sheet.clear();
    }

    // Lấy header từ row đầu (nếu là object)
    if (rows.length > 0 && typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
      const headers = Object.keys(rows[0]);
      // Nếu sheet trống hoặc chế độ replace → ghi headers
      if (sheet.getLastRow() === 0 || mode === 'replace') {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers])
          .setFontWeight('bold').setBackground('#1B5E20').setFontColor('#fff');
      }
      // Convert array of objects → 2D array
      const data2D = rows.map(r => headers.map(h => {
        const v = r[h];
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return JSON.stringify(v);
        return v;
      }));
      sheet.getRange(sheet.getLastRow() + 1, 1, data2D.length, headers.length).setValues(data2D);
    } else {
      // Rows đã là 2D array
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }

    // Auto-resize columns
    sheet.autoResizeColumns(1, sheet.getLastColumn());

    return ContentService.createTextOutput(JSON.stringify({
      ok: true, sheet: sheetName, count: rows.length,
      ts: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false, error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    ok: true, app: 'NSTT Sync', version: '1.0',
    message: 'Use POST to push data. Body: {sheet:"name", rows:[...], mode:"append"|"replace"}',
    ts: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

// ========== END CODE PASTE ==========
