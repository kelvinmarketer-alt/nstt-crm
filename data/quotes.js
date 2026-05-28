/* =========================================================
   Quotes mock — báo giá gửi KH (trước khi thành đơn)
   ========================================================= */
window.QUOTES = [
  {id:'BG-2026-0042', custId:'KH008', custName:'Nhà hàng Sen Tây Hồ', date:'18/05/2026',
    validUntil:'25/05/2026', status:'sent', total:12_450_000,
    items:[
      {name:'Dưa chuột',   qty:30, unit:'kg', price:15000, total:450_000},
      {name:'Cà chua đại', qty:25, unit:'kg', price:26000, total:650_000},
      {name:'Bắp cải',     qty:40, unit:'kg', price:10000, total:400_000},
      {name:'Khoai tây',   qty:60, unit:'kg', price:14000, total:840_000},
      {name:'Lơ xanh',     qty:20, unit:'kg', price:28000, total:560_000},
    ],
    staffOwner:'Tuấn Tú', note:'Báo giá cho menu mùa hè — đợi feedback'},
  {id:'BG-2026-0041', custId:'KH009', custName:'Bếp Hotel Daewoo', date:'17/05/2026',
    validUntil:'24/05/2026', status:'accepted', total:28_700_000, convertedOrderId:'NSTT-000142',
    items:[
      {name:'Cải thảo', qty:80, unit:'kg', price:10000, total:800_000},
      {name:'Bí xanh',  qty:50, unit:'kg', price:14000, total:700_000},
    ],
    staffOwner:'Trần Lan', note:'KH duyệt — đã chuyển thành đơn'},
  {id:'BG-2026-0040', custId:'KH010', custName:'Quán Phở 24', date:'16/05/2026',
    validUntil:'23/05/2026', status:'rejected', total:5_200_000,
    items:[
      {name:'Hành lá', qty:15, unit:'kg', price:20000, total:300_000},
      {name:'Mùi ta',  qty:5,  unit:'kg', price:20000, total:100_000},
    ],
    staffOwner:'Phạm Hùng', note:'KH chê giá cao — tìm NCC khác'},
  {id:'BG-2026-0039', custId:'KH006', custName:'Cafe Phố Cổ', date:'15/05/2026',
    validUntil:'22/05/2026', status:'expired', total:3_800_000,
    items:[{name:'Chanh', qty:30, unit:'kg', price:32000, total:960_000}],
    staffOwner:'Hoàng Mai', note:'Hết hạn — chưa phản hồi'},
];
