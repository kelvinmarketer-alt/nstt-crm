/* =========================================================
   Purchase Orders mock — phiếu nhập từ NCC
   ========================================================= */
window.PURCHASES = [
  {id:'PN-2026-0142', supplierId:'NCC001', date:'18/05/2026', status:'received', total:8_750_000, paid:8_750_000,
    items:[
      {productId:'SP001', name:'Dưa chuột',  qty:80, price:11000, total:880_000},
      {productId:'SP002', name:'Cải dưa bẹ', qty:60, price:8500,  total:510_000},
      {productId:'SP008', name:'Bắp cải',    qty:50, price:6000,  total:300_000},
      {productId:'SP011', name:'Đậu cove',   qty:40, price:12000, total:480_000},
      {productId:'SP003', name:'Cà chua đại',qty:70, price:8000,  total:560_000},
      {productId:'SP005', name:'Khoai tây',  qty:120,price:8800,  total:1_056_000},
      {productId:'SP016', name:'Su hào',     qty:50, price:5000,  total:250_000},
    ],
    note:'Lấy hàng sáng 5h sáng 18/5'},
  {id:'PN-2026-0141', supplierId:'NCC002', date:'17/05/2026', status:'received', total:14_500_000, paid:0,
    items:[
      {productId:'SP027', name:'Lơ xanh',     qty:30, price:18000, total:540_000},
      {productId:'SP028', name:'Lơ trắng',    qty:25, price:19000, total:475_000},
      {productId:'SP030', name:'Ớt chuông đỏ',qty:18, price:36000, total:648_000},
      {productId:'SP032', name:'Cà chua bi',  qty:35, price:19500, total:682_500},
    ], note:'Chuyến xe lạnh từ Đà Lạt — NET 14'},
  {id:'PN-2026-0140', supplierId:'NCC003', date:'17/05/2026', status:'received', total:5_200_000, paid:5_200_000,
    items:[
      {productId:'SP033', name:'Nấm hải sản', qty:30, price:32500, total:975_000},
      {productId:'SP036', name:'Nấm hương',   qty:35, price:13000, total:455_000},
    ], note:'COD'},
  {id:'PN-2026-0139', supplierId:'NCC005', date:'17/05/2026', status:'received', total:2_300_000, paid:2_300_000,
    items:[
      {productId:'SP046', name:'Xà lách xoăn', qty:25, price:21000, total:525_000},
      {productId:'SP047', name:'Hành lá',      qty:20, price:21500, total:430_000},
    ]},
  {id:'PN-2026-0138', supplierId:'NCC001', date:'16/05/2026', status:'received', total:9_650_000, paid:9_650_000,
    items:[
      {productId:'SP001', name:'Dưa chuột',  qty:100,price:11500, total:1_150_000},
      {productId:'SP003', name:'Cà chua đại',qty:80, price:8000,  total:640_000},
    ]},
  {id:'PN-2026-0143', supplierId:'NCC004', date:'18/05/2026', status:'ordered', total:6_800_000, paid:0,
    items:[
      {productId:'SP040', name:'Ngọn bò khai', qty:15, price:26000, total:390_000},
      {productId:'SP043', name:'Măng tây',     qty:25, price:42500, total:1_062_500},
    ], note:'Đang chờ giao — dự kiến 19/5'},
];
