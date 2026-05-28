# Deploy NSTT lên app.nongsantuantuhanoi.vn

Hướng dẫn 2 giai đoạn:

- **Giai đoạn 1** (30-45 phút): Deploy CF Pages + custom domain — app sống chạy với data localStorage
- **Giai đoạn 2** (sau đó, 1-2 ngày): Migrate sang Supabase (multi-device sync)

---

## GIAI ĐOẠN 1 — Deploy CF Pages + custom domain (làm hôm nay)

### Bước 1.1: Push code lên GitHub

```bash
# Mở Terminal, di chuyển vào thư mục project
cd "/Users/macos/Desktop/App - tuan-tu-farm"

# Khởi tạo git (nếu chưa)
git init
git add .
git commit -m "Initial commit — NSTT CRM v59"

# Tạo repo PRIVATE trên https://github.com/new
# Tên gợi ý: nstt-crm (giữ private vì là app nội bộ)

# Push lên (đổi YOUR_USERNAME thành GitHub username của bạn)
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/nstt-crm.git
git push -u origin main
```

### Bước 1.2: Tạo Cloudflare Pages project

1. Vào https://dash.cloudflare.com → menu **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Authorize Cloudflare truy cập repo `nstt-crm` (chỉ cấp quyền 1 repo này)
3. Cấu hình build:
   - **Project name**: `nstt-crm` (sẽ thành `nstt-crm.pages.dev`)
   - **Production branch**: `main`
   - **Framework preset**: **None**
   - **Build command**: *bỏ trống*
   - **Build output directory**: `/`
4. Bấm **Save and Deploy** → đợi 1-2 phút build xong → có URL `https://nstt-crm.pages.dev` chạy thử trước

### Bước 1.3: Cấu hình custom domain app.nongsantuantuhanoi.vn

**Trên CF Pages dashboard:**
1. Vào project `nstt-crm` → tab **Custom domains** → **Set up a custom domain**
2. Nhập `app.nongsantuantuhanoi.vn` → Continue
3. CF hiển thị 1 dòng record cần tạo, ví dụ:
   ```
   Type: CNAME
   Name: app
   Target: nstt-crm.pages.dev
   ```
   **Copy lại 2 giá trị Name + Target** — sẽ dán vào provider .vn

**Trên nhà cung cấp .vn (Mắt Bão / Tenten / iNet / PavietNam):**

Mỗi provider UI khác nhau nhưng quy trình giống nhau — vào phần **DNS Management** / **Quản lý DNS** của domain `nongsantuantuhanoi.vn`:

| Provider | Đường vào DNS |
|---|---|
| **Mắt Bão** | mybao.matbao.net → Tên miền → Quản lý DNS |
| **Tenten** | manage.tenten.vn → Domain → Bản ghi DNS |
| **PA Việt Nam** | id.pavietnam.vn → Quản lý DNS |
| **iNet** | nhanh.inet.vn → Tên miền → DNS Manager |
| **GoDaddy** | godaddy.com → My Products → DNS |

Tạo record mới:
- **Type**: `CNAME`
- **Name/Host**: `app`
- **Value/Target**: `nstt-crm.pages.dev`
- **TTL**: `300` (5 phút) hoặc Auto
- **Save**

**Quay lại CF Pages:**
4. Trong tab Custom domains của project, CF sẽ tự verify DNS sau 5-30 phút → status đổi từ "Pending" → "Active"
5. SSL được CF cấp Let's Encrypt tự động → `https://app.nongsantuantuhanoi.vn` chạy được luôn

**Kiểm tra DNS đã trỏ đúng chưa:**
```bash
dig app.nongsantuantuhanoi.vn CNAME
# Nếu thấy "nstt-crm.pages.dev" → DNS đã propagate xong
```

### Bước 1.4: Test app live

1. Mở `https://app.nongsantuantuhanoi.vn` trong tab ẩn danh (Cmd+Shift+N)
2. Đăng nhập bằng tài khoản demo: `admin@nongsantuantu.com` / `admin123`
3. Vào Sản phẩm → Bảng giá → kiểm tra 120 SP, ảnh, PDF export đều OK
4. Mở từ điện thoại → "Thêm vào màn hình chính" để dùng như PWA

✅ **Giai đoạn 1 xong — app live + custom domain hoạt động.**

⚠️ **Lưu ý quan trọng giai đoạn 1:**
- Data lưu trong `localStorage` từng máy → mỗi NV vẫn data riêng
- Đăng nhập dùng 4 tài khoản demo (admin/sales/cskh/kt) — không phải auth thật
- Test thoải mái, demo OK
- Để mọi NV dùng chung data → chuyển sang Giai đoạn 2

---

## GIAI ĐOẠN 2 — Migrate Supabase (làm sau, 1-2 ngày)

### Bước 2.1: Tạo Supabase project

1. Vào https://supabase.com/dashboard → đăng nhập bằng GitHub
2. **New project**:
   - **Name**: `nstt-crm`
   - **Database password**: tạo password mạnh → **LƯU LẠI** (cần khi backup)
   - **Region**: **Southeast Asia (Singapore)** — gần VN nhất, latency thấp
   - **Plan**: Free
3. Đợi 1-2 phút project provision xong
4. Vào **Project Settings** → **API** → copy 2 giá trị:
   - **Project URL** (vd `https://xxxxxxxxx.supabase.co`)
   - **anon public key** (vd `eyJhbGciOiJI...`)
   - **Lưu 2 giá trị này** — sẽ gửi cho tôi/dán vào code

### Bước 2.2: Chạy schema SQL (chưa làm — chờ file mới)

⚠️ **CẢNH BÁO QUAN TRỌNG — KHÔNG ĐỤNG TỚI VTY:**
- Folder `_archive-vty-legacy-sql/` trong repo là SQL CŨ thời còn VTY → **TUYỆT ĐỐI KHÔNG paste vào Supabase Editor**
- VTY Logistics là app KHÁC, chạy ở project Supabase riêng (`dbfffwtnxhytcoczhxhf`) — không được động vào
- NSTT sẽ có folder MỚI `supabase-nstt/` với schema sạch, chỉ cho NSTT, không xung đột VTY

**Quy trình Giai đoạn 2 thực tế:**

1. Bạn tạo Supabase project MỚI tên `nstt-crm` (bước 2.1) — đảm bảo **KHÔNG dùng lại** project VTY
2. Gửi tôi URL + anon key của project NSTT mới
3. Tôi sẽ:
   - Tạo folder MỚI `supabase-nstt/` với schema sạch riêng cho NSTT
   - Schema NSTT: customers, orders, products, invoices, shippers, suppliers, leads, inventory, returns, staff, master_data, activity_logs, company_info, payment_accounts, cash_entries
   - **KHÔNG có** bảng VTY-specific (vehicles, drivers, fuel_logs, maintenance_logs)
   - Seed data NSTT: email `@nongsantuantuhanoi.vn`, 120 SP, 28 KH demo
4. Bạn chạy SQL của `supabase-nstt/` vào Supabase Editor của project `nstt-crm`
5. Tôi update `supabase-config.js` với URL + key NSTT
6. Push → CF Pages auto deploy

→ **Phần này tôi sẽ chuẩn bị file mới khi bạn xong bước 2.1**. Báo tôi URL + key project `nstt-crm`.

### Bước 2.3: Tôi sẽ làm cho bạn (sau khi có Supabase ready)

1. Cập nhật `supabase/01-schema.sql` thêm các bảng NSTT mới (products, shippers, suppliers, leads…)
2. Viết `05-seed-nstt.sql` migrate toàn bộ data demo (120 SP + 28 KH + 142 đơn) từ `data/*.js`
3. Cập nhật `scripts/supabase-config.js` với URL + key của bạn
4. Đổi mode = 'supabase'
5. Commit + push → CF Pages auto deploy → app dùng cloud
6. Test toàn bộ luồng end-to-end

### Bước 2.4: Tạo user thật cho NV (sau khi schema chạy xong)

1. Trên Supabase: **Authentication** → **Users** → **Add user**
2. Tạo email + password cho từng NV thật (vd `tuantu@nongsantuantuhanoi.vn`)
3. Tick "Auto confirm user" để không cần verify email
4. Tắt 4 tài khoản demo trong `auth.js` để bảo mật

---

## Sau khi deploy: workflow update code

Mỗi lần sửa code và muốn deploy:

```bash
cd "/Users/macos/Desktop/App - tuan-tu-farm"
git add .
git commit -m "Mô tả thay đổi"
git push
```

→ CF Pages tự nhận push từ GitHub → build + deploy trong 1-2 phút → app live mới có ngay tại `app.nongsantuantuhanoi.vn`.

Xem progress build tại: https://dash.cloudflare.com → Workers & Pages → nstt-crm → Deployments

---

## Troubleshooting

**SSL chưa có sau khi setup CNAME 30 phút:**
- Check DNS đã propagate chưa: https://dnschecker.org → nhập `app.nongsantuantuhanoi.vn`
- Nếu xanh ở nhiều quốc gia → DNS OK, đợi CF cấp SSL thêm 5-10 phút
- Nếu vẫn không có sau 1h → vào CF Pages → Custom domains → Remove + Add lại

**Sửa code rồi push nhưng app live chưa thay đổi:**
- Hard reload Chrome (Cmd+Shift+R) — vì Service Worker cache
- Hoặc kiểm tra CF Pages → Deployments xem build có chạy không
- Nếu build fail → click vào để xem log error

**`https://app.nongsantuantuhanoi.vn` báo "Site not found":**
- DNS chưa propagate xong (đợi tối đa 24h, thường 5-30 phút)
- Check CNAME đã đúng `nstt-crm.pages.dev` (không phải `xxx.pages.dev` khác)

---

## Chi phí vận hành

- Domain `.vn`: ~750k/năm (đã có)
- CF Pages: **0₫**
- Supabase Free: **0₫** (đủ cho 30 NV, 3-5 năm data)
- **Tổng: 0₫/tháng**

Khi nào lên paid:
- > 500MB data → Supabase Pro $25/tháng
- > 100GB bandwidth/tháng → CF Pages không bao giờ chạm (free unlimited)
