# ⚠️ KHÔNG CHẠY CÁC FILE SQL NÀY

Folder này chứa **SQL legacy từ thời app này còn là VTY Logistics**.

## Tại sao không chạy?

- Schema chứa các bảng VTY-specific: `vehicles`, `drivers`, `fuel_logs`, `maintenance_logs` (NSTT không cần)
- Seed data có email `@vty.vn`, project name `vty-logistics`
- Nếu vô tình chạy vào **đúng project Supabase VTY** đang chạy production tại `dbfffwtnxhytcoczhxhf` → có thể **xung đột / ghi đè dữ liệu VTY thật**

## NSTT sẽ có schema riêng

Khi triển khai Giai đoạn 2 của [DEPLOY.md](../DEPLOY.md), tôi sẽ tạo folder MỚI `supabase-nstt/` với:
- Schema chỉ chứa bảng NSTT cần (products, customers, orders, invoices, shippers, suppliers, leads, inventory, returns, ...)
- KHÔNG có bảng VTY-specific (vehicles/drivers/fuel_logs)
- Seed email `@nongsantuantuhanoi.vn`, project name `nstt-crm`

## Folder này giữ để làm gì?

Tham khảo cấu trúc bảng (customers, orders, invoices, staff) — vì NSTT cũng cần các bảng tương tự (chỉ cần khác seed data + thêm vài bảng nông sản).

→ **Đừng paste bất kỳ file SQL nào trong folder này vào Supabase Editor.**
