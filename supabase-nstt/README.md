# Supabase Schema — Nông Sản Tuấn Tú Hà Nội

⚠️ **Folder này CHỈ DÀNH cho project Supabase MỚI của NSTT.**

KHÔNG chạy file SQL trong folder này vào project Supabase nào khác (đặc biệt là **VTY** — project khác hoàn toàn).

## File trong folder

| File | Mục đích | Chạy theo thứ tự |
|---|---|---|
| `01-schema-nstt.sql` | 14 bảng nông sản (customers, products, orders, invoices...) | 1 |
| `02-rls-nstt.sql` | Row Level Security cho 4 role (admin/sales/cskh/kt) | 2 |
| `03-seed-nstt.sql` | Master data + company info + 5 NV admin/sales/cskh/kt | 3 |
| `04-demo-data.sql` | Demo 120 SP + 28 KH + 142 đơn (tùy chọn — bỏ qua nếu start sạch) | 4 |

## Khác gì so với folder `_archive-vty-legacy-sql/`?

| | NSTT (folder này) | VTY (archived) |
|---|---|---|
| Bảng `vehicles` (xe) | ❌ Không có | ✅ Có |
| Bảng `drivers` (tài xế) | ❌ Không có | ✅ Có |
| Bảng `fuel_logs` (đổ xăng) | ❌ Không có | ✅ Có |
| Bảng `products` (SP nông sản) | ✅ Có | ❌ Không có |
| Bảng `shippers` (giao hàng) | ✅ Có | ❌ Không có |
| Bảng `suppliers` (NCC) | ✅ Có | ❌ Không có |
| Bảng `leads` (KH tiềm năng) | ✅ Có | ❌ Không có |
| Email NV mặc định | `@nongsantuantuhanoi.vn` | `@vty.vn` |
| Project name | `nstt-crm` | `vty-logistics` |

## Cài đặt

1. Tạo project Supabase mới (region Singapore, FREE plan)
2. Vào project → SQL Editor
3. Chạy theo thứ tự: `01-schema-nstt.sql` → `02-rls-nstt.sql` → `03-seed-nstt.sql`
4. (Tùy chọn) `04-demo-data.sql` nếu muốn seed dữ liệu mẫu
5. Vào Project Settings → API → copy:
   - Project URL
   - anon public key
6. Paste vào `scripts/supabase-config.js` + đổi `mode='supabase'`
