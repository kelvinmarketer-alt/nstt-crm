/* =========================================================
   Invoices — Hóa đơn VAT phát hành T5/2026
   ========================================================= */
window.INVOICES = [
  {no:'C26TAA-001', serial:'C26TAA', date:'18/05/2026', custId:'KH002', custName:'Khách sạn Mường Thanh HN',
    custTax:'0101234567', items:[
      {name:'Rau hằng ngày T2-CN tuần 20', qty:1, unit:'Đợt', price:48_500_000, total:48_500_000}
    ],
    subtotal:48_500_000, vatRate:8, vat:3_880_000, total:52_380_000,
    paymentMethod:'CK', status:'issued', cqtCode:'C26TAA00100001',
    sentToCqt:true, note:'HĐ định kỳ T5/2026'},

  {no:'C26TAA-002', serial:'C26TAA', date:'17/05/2026', custId:'KH003', custName:'Bếp ăn Canteen FPT',
    custTax:'0101234568', items:[
      {name:'Cung cấp rau T2-T6 tuần 20', qty:1, unit:'Đợt', price:64_200_000, total:64_200_000}
    ],
    subtotal:64_200_000, vatRate:8, vat:5_136_000, total:69_336_000,
    paymentMethod:'CK', status:'issued', cqtCode:'C26TAA00200002',
    sentToCqt:true},

  {no:'C26TAA-003', serial:'C26TAA', date:'15/05/2026', custId:'KH005', custName:'Phở Thìn Bờ Hồ',
    custTax:'', items:[
      {name:'Rau gia vị tuần 19 (5 ngày)', qty:5, unit:'Ngày', price:1_200_000, total:6_000_000}
    ],
    subtotal:6_000_000, vatRate:8, vat:480_000, total:6_480_000,
    paymentMethod:'Tiền mặt', status:'issued', cqtCode:'C26TAA00300003',
    sentToCqt:true},

  {no:'C26TAA-004', serial:'C26TAA', date:'12/05/2026', custId:'KH001', custName:'Nhà hàng Á Đông',
    custTax:'0101234569', items:[
      {name:'Rau hằng ngày T2-T7 tuần 19', qty:6, unit:'Ngày', price:1_400_000, total:8_400_000}
    ],
    subtotal:8_400_000, vatRate:8, vat:672_000, total:9_072_000,
    paymentMethod:'CK', status:'issued', cqtCode:'C26TAA00400004',
    sentToCqt:true},

  {no:'C26TAA-005', serial:'C26TAA', date:'10/05/2026', custId:'KH008', custName:'Nhà hàng Sen Tây Hồ',
    custTax:'0101234570', items:[
      {name:'Rau Đà Lạt + nấm tuần 19', qty:1, unit:'Đợt', price:18_500_000, total:18_500_000}
    ],
    subtotal:18_500_000, vatRate:8, vat:1_480_000, total:19_980_000,
    paymentMethod:'CK', status:'issued', cqtCode:'C26TAA00500005',
    sentToCqt:true},

  {no:'C26TAA-006', serial:'C26TAA', date:'08/05/2026', custId:'KH009', custName:'Bếp Hotel Daewoo',
    custTax:'0101234571', items:[
      {name:'Cải thảo + bí xanh đợt T5', qty:1, unit:'Đợt', price:14_200_000, total:14_200_000}
    ],
    subtotal:14_200_000, vatRate:8, vat:1_136_000, total:15_336_000,
    paymentMethod:'CK', status:'issued', cqtCode:'C26TAA00600006',
    sentToCqt:true},

  /* Draft chưa phát hành */
  {no:'C26TAA-007', serial:'C26TAA', date:'18/05/2026', custId:'KH004', custName:'Phở Thìn Lò Đúc CS2',
    custTax:'0101234572', items:[
      {name:'Rau gia vị T2 + T5 tuần 20', qty:2, unit:'Ngày', price:850_000, total:1_700_000}
    ],
    subtotal:1_700_000, vatRate:8, vat:136_000, total:1_836_000,
    paymentMethod:'Tiền mặt', status:'draft', cqtCode:'',
    sentToCqt:false, note:'Chờ KH xác nhận thông tin XHĐ'},

  /* Đã hủy */
  {no:'C26TAA-008', serial:'C26TAA', date:'05/05/2026', custId:'KH010', custName:'Quán Phở 24',
    custTax:'', items:[{name:'Test', qty:1, unit:'-', price:100_000, total:100_000}],
    subtotal:100_000, vatRate:8, vat:8_000, total:108_000,
    paymentMethod:'CK', status:'cancelled', cqtCode:'',
    sentToCqt:false, note:'Hủy do nhập sai thông tin'},
];
