/* =========================================================
   Recurring Orders mock — đơn định kỳ B2B nhà hàng
   ========================================================= */
window.RECURRING_ORDERS = [
  {id:'RO001', custId:'KH001', custName:'Nhà hàng Á Đông', frequency:'daily',
    daysOfWeek:[1,2,3,4,5,6], deliverAt:'06:30', active:true,
    items:[
      {productId:'SP001', name:'Dưa chuột',  qty:10},
      {productId:'SP002', name:'Cải dưa bẹ', qty:8},
      {productId:'SP003', name:'Cà chua đại',qty:6},
      {productId:'SP005', name:'Khoai tây',  qty:15},
      {productId:'SP047', name:'Hành lá',    qty:2},
    ],
    nextRun:'19/05/2026', lastRun:'18/05/2026', createdAt:'01/03/2026', staffOwner:'Trần Lan',
    note:'Giao buổi sáng trước 7h'},
  {id:'RO002', custId:'KH002', custName:'Khách sạn Mường Thanh HN', frequency:'weekly',
    daysOfWeek:[1,4], deliverAt:'05:00', active:true,
    items:[
      {productId:'SP008', name:'Bắp cải',     qty:30},
      {productId:'SP004', name:'Cà rốt',      qty:25},
      {productId:'SP016', name:'Su hào',      qty:20},
      {productId:'SP027', name:'Lơ xanh',     qty:15},
      {productId:'SP033', name:'Nấm hải sản', qty:8},
    ],
    nextRun:'21/05/2026', lastRun:'14/05/2026', createdAt:'15/02/2026', staffOwner:'Tuấn Tú',
    note:'Bếp đặt T2 + T5'},
  {id:'RO003', custId:'KH003', custName:'Bếp ăn Canteen FPT', frequency:'daily',
    daysOfWeek:[1,2,3,4,5], deliverAt:'06:00', active:true,
    items:[
      {productId:'SP008', name:'Bắp cải',    qty:40},
      {productId:'SP005', name:'Khoai tây',  qty:50},
      {productId:'SP011', name:'Đậu cove',   qty:15},
    ],
    nextRun:'19/05/2026', lastRun:'18/05/2026', createdAt:'10/01/2026', staffOwner:'Hoàng Mai',
    note:'Số lượng lớn — giao T2-T6, T7/CN nghỉ'},
  {id:'RO004', custId:'KH005', custName:'Phở Thìn Bờ Hồ', frequency:'weekly',
    daysOfWeek:[2], deliverAt:'04:30', active:true,
    items:[
      {productId:'SP047', name:'Hành lá', qty:8},
      {productId:'SP049', name:'Mùi ta',  qty:3},
    ],
    nextRun:'19/05/2026', lastRun:'12/05/2026', createdAt:'01/04/2026', staffOwner:'Trần Lan',
    note:'Chỉ rau gia vị, giao trước 5h sáng T3'},
  {id:'RO005', custId:'KH004', custName:'Quán Bún chả Tuấn Anh', frequency:'daily',
    daysOfWeek:[1,2,3,4,5,6,0], deliverAt:'07:00', active:false,
    items:[
      {productId:'SP046', name:'Xà lách xoăn', qty:5},
      {productId:'SP049', name:'Mùi ta',       qty:1.5},
    ],
    nextRun:'—', lastRun:'10/05/2026', createdAt:'20/02/2026', staffOwner:'Phạm Hùng',
    note:'TẠM DỪNG (nhà hàng nghỉ tu sửa)'},
];
