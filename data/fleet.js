/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Mock data: Đội Shipper
   ─────────────────────────────────────────────────────────
   ĐỒNG BỘ với:
   - data/staff.js   (4 tài xế = NV006-NV009 dept "Vận hành")
   - data/orders.js  (orders dùng các ID DR01..DR09)
   Mỗi DR* ID phải tồn tại bên đây để link order ↔ shipper hoạt động.
   ========================================================= */

/* Giữ window.VEHICLES rỗng để tương thích code cũ (không dùng cho nông sản) */
window.VEHICLES = [];

window.DRIVERS = [
  /* === 4 SHIPPER CHÍNH = nhân viên cơ hữu, có lương cố định (link với staff.js) === */
  { id:'DR01', code:'TX001', staffId:'NV006',
    name:'Nguyễn Văn A', phone:'0901 222 333',
    email:'', telegramChatId:'',
    primaryPlate:'29-B1 234.56', status:'running',
    joinDate:'15/06/2024', trips30d:68, revenue30d:0, rating:4.7,
    address:'Cầu Giấy, Hà Nội', area:'Nội thành' },

  { id:'DR02', code:'TX002', staffId:'NV007',
    name:'Trần Hùng', phone:'0905 444 555',
    email:'', telegramChatId:'',
    primaryPlate:'29-D2 678.90', status:'running',
    joinDate:'22/01/2025', trips30d:75, revenue30d:0, rating:4.8,
    address:'Hai Bà Trưng, Hà Nội', area:'Nội thành' },

  { id:'DR03', code:'TX003', staffId:'NV008',
    name:'Lê Văn B', phone:'0912 666 777',
    email:'levanb@nongsantuantu.com', telegramChatId:'',
    primaryPlate:'29-X1 558.76', status:'running',
    joinDate:'08/03/2023', trips30d:67, revenue30d:0, rating:4.8,
    address:'Đông Anh, Hà Nội', area:'Liên tỉnh' },

  { id:'DR04', code:'TX004', staffId:'NV009',
    name:'Phạm Đức', phone:'0936 888 999',
    email:'phamduc@nongsantuantu.com', telegramChatId:'',
    primaryPlate:'29-H2 999.88', status:'running',
    joinDate:'12/09/2022', trips30d:69, revenue30d:0, rating:4.9,
    address:'Long Biên, Hà Nội', area:'Liên tỉnh' },

  /* === 2 SHIPPER FREELANCER === ngoài hợp đồng (chỉ tính thưởng/đơn, không lương cứng) */
  { id:'DR06', code:'TX005', staffId:null,
    name:'Bùi Văn C', phone:'0944 333 444',
    email:'', telegramChatId:'',
    primaryPlate:'29-K3 111.22', status:'running',
    joinDate:'18/11/2024', trips30d:66, revenue30d:0, rating:4.6,
    address:'Hoàng Mai, Hà Nội', area:'Nội thành', freelancer:true },

  { id:'DR09', code:'TX006', staffId:null,
    name:'Ngô Thị Thu', phone:'0978 121 343',
    email:'ngothu@nongsantuantu.com', telegramChatId:'',
    primaryPlate:'29-M5 333.44', status:'running',
    joinDate:'02/02/2025', trips30d:74, revenue30d:0, rating:4.8,
    address:'Thanh Xuân, Hà Nội', area:'Nội thành', freelancer:true },
];

/* Đối tác ngoài không dùng cho mô hình nông sản (giữ rỗng) */
window.PARTNERS = [];
