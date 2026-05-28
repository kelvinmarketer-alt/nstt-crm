# Supabase Setup — Nông Sản Tuấn Tú Hà Nội

Hướng dẫn migrate từ localStorage sang Supabase backend.

## 📋 Files trong folder này

| File | Mục đích |
|---|---|
| `01-schema.sql` | Tạo 17 bảng + indexes + triggers |
| `02-rls.sql` | Bật Row Level Security cho authenticated users |
| `03-seed.sql` | Insert data ban đầu (company info, master data, 5 staff, 8 integrations) |

## 🚀 Setup steps

### Bước 1: Tạo Supabase project
1. Vào https://supabase.com/dashboard/sign-up → đăng nhập bằng GitHub
2. Bấm "New project" → điền:
   - Name: `vty-logistics`
   - Database password: tạo password mạnh, **LƯU LẠI**
   - Region: **Southeast Asia (Singapore)**
   - Plan: Free
3. Đợi 1-2 phút project provision xong

### Bước 2: Chạy 3 file SQL theo thứ tự
1. Bên trái → bấm icon **SQL Editor** (biểu tượng database)
2. Bấm **+ New query**
3. Copy toàn bộ `01-schema.sql` → paste → bấm **Run**
4. Tạo query mới → paste `02-rls.sql` → Run
5. Tạo query mới → paste `03-seed.sql` → Run
6. Kiểm tra: Table Editor → thấy 17 bảng + staff có 5 dòng

### Bước 3: Cấu hình Auth
1. Vào **Authentication** → **Providers**
2. Bật **Email** (mặc định đã bật)
3. **Site URL**: `https://vty-logistics.onrender.com`
4. **Redirect URLs**: thêm `https://vty-logistics.onrender.com/**` (allow wildcard)
5. Tắt "Confirm email" để dễ test (bật lại sau): Authentication → Settings → tắt "Enable email confirmations"

### Bước 4: Tạo user mặc định (admin)
1. Vào **Authentication** → **Users** → **Add user** → **Create new user**
2. Email: `admin@vty.vn` · Password: `admin123` (đổi sau)
3. Tick "Auto confirm user"
4. Tạo
5. Copy UUID của user vừa tạo
6. Vào SQL Editor chạy:
   ```sql
   UPDATE staff SET user_id = 'UUID-VỪA-COPY' WHERE id = 'NV001';
   ```
7. Lặp lại cho 4 user khác (sales@vty.vn, hung@vty.vn, cskh@vty.vn, kt@vty.vn) với mật khẩu tương ứng.

### Bước 5: Lấy credentials
1. **Project Settings** (⚙️ góc dưới trái) → **API**
2. Copy 2 giá trị:
   - **Project URL** (dạng `https://xxxxxxx.supabase.co`)
   - **anon public** key (dài, bắt đầu `eyJhbGc...`)

### Bước 6: Cấu hình app
Mở `scripts/supabase-config.js` → thay 2 giá trị:
```js
url:     'https://xxxxxxx.supabase.co',
anonKey: 'eyJhbGc...',
```

### Bước 7: Push lên Render
```bash
git add scripts/supabase-config.js
git commit -m "Configure Supabase credentials"
git push
```
Render auto-deploy. Reload app → tự switch sang Supabase mode.

## 🔍 Verify

1. Mở https://vty-logistics.onrender.com/pages/login.html
2. F12 → Console → thấy `[NSTT] Supabase mode ACTIVE - syncing to cloud`
3. Login `admin@vty.vn` / mật khẩu mới
4. Vào trang Khách hàng → tạo KH mới
5. Mở Supabase dashboard → Table Editor → bảng `customers` → thấy dòng mới ✓
6. Mở browser khác (incognito) → login → thấy data đồng bộ ✓

## ⚠️ Troubleshooting

| Lỗi | Cách xử lý |
|---|---|
| `permission denied for table xxx` | Bỏ qua RLS bằng cách disable trong Table Editor, hoặc chạy lại `02-rls.sql` |
| Login failed | Đảm bảo "Enable email confirmations" tắt + user_id đã link trong bảng staff |
| Data không sync | Check Console F12, có thể URL/key sai |
| Free tier hết | Sẽ thông báo email trước. 30 NV xài 10-20 năm mới hết |

## 📊 Free tier limits (đủ cho NSTT)

- 500 MB Postgres DB
- 50,000 monthly active users (auth)
- 5 GB bandwidth
- 2 GB storage
- 100k Edge Function invocations
- Realtime + 200 concurrent connections
- **Pauses sau 7 ngày không có request** → click "Restore project" trong dashboard để unpause (~30s)
