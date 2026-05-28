/* =========================================================
   Leads — 15 KH tiềm năng đủ phủ 5 stage funnel + nhiều nguồn
   ========================================================= */
window.LEADS = [
  /* === NEW (5) === */
  {id:'LD001', name:'Nhà hàng Mâm Cá Tiên', contact:'Anh Bình', phone:'0987 654 001', source:'fb-ads',
    stage:'new', interest:'rau-ta', estValue:8_000_000, owner:'Tuấn Tú', createdAt:'17/05/2026', lastTouch:'18/05/2026', note:'Hỏi báo giá rau ngày qua FB Ads'},
  {id:'LD006', name:'Quán cơm văn phòng FPT Tower', contact:'Chị Lê', phone:'0987 654 006', source:'fb-ads',
    stage:'new', interest:'rau-ta', estValue:15_000_000, owner:'Tuấn Tú', createdAt:'18/05/2026', lastTouch:'18/05/2026', note:'Hỏi báo giá rau hằng ngày — bếp 200 người'},
  {id:'LD007', name:'Nhà hàng Pizza 4P\'s Long Biên', contact:'Mr.Yamada', phone:'0987 654 007', source:'google-ads',
    stage:'new', interest:'rau-dalat', estValue:18_000_000, owner:'Trần Lan', createdAt:'18/05/2026', lastTouch:'18/05/2026', note:'Nhà hàng Nhật, cần rau Đà Lạt chuẩn organic'},
  {id:'LD008', name:'Khách sạn Pan Pacific HN', contact:'Chị Hằng', phone:'0987 654 008', source:'referral',
    stage:'new', interest:'rau-ta', estValue:25_000_000, owner:'Tuấn Tú', createdAt:'17/05/2026', lastTouch:'18/05/2026', note:'Bếp tổng giới thiệu — đang khảo sát NCC mới'},
  {id:'LD009', name:'Bếp ăn KCN Vsip Bắc Ninh', contact:'Anh Quân', phone:'0987 654 009', source:'cold-call',
    stage:'new', interest:'rau-ta', estValue:35_000_000, owner:'Hoàng Mai', createdAt:'18/05/2026', lastTouch:'18/05/2026', note:'Bếp 500 người — giao xe tải xuống BN'},

  /* === CONTACTED (3) === */
  {id:'LD002', name:'Café Vintage 36', contact:'Chị Linh', phone:'0987 654 002', source:'google-ads',
    stage:'contacted', interest:'rau-gia-vi', estValue:2_000_000, owner:'Hoàng Mai', createdAt:'16/05/2026', lastTouch:'17/05/2026', note:'Đã gọi tư vấn, đang xin menu'},
  {id:'LD010', name:'Nhà hàng Sushi Sora', contact:'Chị Yuki', phone:'0987 654 010', source:'fb-ads',
    stage:'contacted', interest:'hai-san', estValue:22_000_000, owner:'Trần Lan', createdAt:'15/05/2026', lastTouch:'18/05/2026', note:'Cần hải sản tươi mỗi sáng — đang gửi demo'},
  {id:'LD011', name:'Quán phở Lý Quốc Sư CS2', contact:'Bác Tâm', phone:'0987 654 011', source:'walk-in',
    stage:'contacted', interest:'rau-gia-vi', estValue:3_500_000, owner:'Phạm Hùng', createdAt:'14/05/2026', lastTouch:'17/05/2026', note:'Bác đến tận kho xem, ưng nhưng giá đang cao hơn NCC cũ 5%'},

  /* === QUALIFIED (3) === */
  {id:'LD003', name:'Bếp ăn Trường THPT Chu Văn An', contact:'Chú Hùng', phone:'0987 654 003', source:'referral',
    stage:'qualified', interest:'rau-ta', estValue:30_000_000, owner:'Trần Lan', createdAt:'14/05/2026', lastTouch:'17/05/2026', note:'BẾP TRƯỜNG LỚN — KH giới thiệu, đã gửi báo giá BG-2026-0043'},
  {id:'LD012', name:'Chuỗi Bún chả Tuấn Béo (3 CS)', contact:'Anh Tuấn', phone:'0987 654 012', source:'referral',
    stage:'qualified', interest:'rau-gia-vi', estValue:12_000_000, owner:'Phạm Hùng', createdAt:'12/05/2026', lastTouch:'17/05/2026', note:'3 chi nhánh, lấy rau gia vị hằng ngày — đang test 1 tuần'},
  {id:'LD013', name:'Hệ thống Lotte Mart', contact:'Mr.Park (PIC)', phone:'0987 654 013', source:'cold-call',
    stage:'qualified', interest:'rau-dalat', estValue:80_000_000, owner:'Tuấn Tú', createdAt:'10/05/2026', lastTouch:'18/05/2026', note:'CƠ HỘI LỚN — đang chờ ký hợp đồng nguyên tắc'},

  /* === WON (2) === */
  {id:'LD004', name:'Quán bún chả mới (Hà Đông)', contact:'Anh Đạt', phone:'0987 654 004', source:'walk-in',
    stage:'won', interest:'rau-gia-vi', estValue:1_500_000, owner:'Phạm Hùng', createdAt:'10/05/2026', lastTouch:'15/05/2026', note:'Đã chốt — chuyển thành KH010'},
  {id:'LD014', name:'Café Cộng (CS Trần Hưng Đạo)', contact:'Chị Hà', phone:'0987 654 014', source:'fb-ads',
    stage:'won', interest:'rau-gia-vi', estValue:2_500_000, owner:'Hoàng Mai', createdAt:'08/05/2026', lastTouch:'14/05/2026', note:'Đã chốt — gắn KH015'},

  /* === LOST (2) === */
  {id:'LD005', name:'Nhà hàng Tây Le Bistro', contact:'Mr.Pierre', phone:'0987 654 005', source:'fb-ads',
    stage:'lost', interest:'rau-dalat', estValue:6_000_000, owner:'Tuấn Tú', createdAt:'05/05/2026', lastTouch:'12/05/2026', note:'Chê giá cao, tìm NCC khác từ Đà Lạt trực tiếp'},
  {id:'LD015', name:'Bếp ăn Bệnh viện Đa khoa TW', contact:'Bs.Lan', phone:'0987 654 015', source:'cold-call',
    stage:'lost', interest:'rau-ta', estValue:45_000_000, owner:'Tuấn Tú', createdAt:'02/05/2026', lastTouch:'14/05/2026', note:'Yêu cầu chứng chỉ VietGAP đầy đủ — Tuấn Tú chưa có'},
];
