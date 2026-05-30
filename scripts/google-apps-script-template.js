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

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    // Replace mode: chỉ xóa CONTENT (giữ formatting/banding/conditional/frozen)
    if (mode === 'replace') {
      // Xóa từ row 2 trở đi (giữ header row 1 + format)
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
      }
    }

    if (!rows.length) {
      return jsonResponse({ ok: true, message: 'Cleared (no new data)', count: 0 });
    }

    // Lấy header từ row đầu (nếu là object)
    if (rows.length > 0 && typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
      const headers = Object.keys(rows[0]);
      // Nếu sheet trống hoàn toàn → ghi headers (sheet mới, chưa có format)
      if (sheet.getLastRow() === 0) {
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
      // Append từ row 2 (sau header)
      const startRow = mode === 'replace' ? 2 : (sheet.getLastRow() + 1);
      sheet.getRange(startRow, 1, data2D.length, headers.length).setValues(data2D);
    } else {
      // Rows đã là 2D array (legacy)
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }

    return jsonResponse({
      ok: true, sheet: sheetName, count: rows.length,
      ts: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

function doGet(e) {
  return jsonResponse({
    ok: true, app: 'NSTT Sync', version: '2.0',
    message: 'Use POST to push data. Body: {sheet:"name", rows:[...], mode:"append"|"replace"}',
    ts: new Date().toISOString()
  });
}

/* Helper: trả JSON với CORS headers */
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ========== END CODE PASTE ==========
