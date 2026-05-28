/* =========================================================
   Cash Entries — Phiếu thu/chi sổ quỹ T5/2026
   ========================================================= */
window.CASH_ENTRIES = [
  /* Thu - Đối soát đơn */
  {no:'PT0042', date:'18/05/2026', type:'income', amount:8_750_000, account:'Tiền mặt', counterparty:'Nhà hàng Á Đông',
    description:'Thu đơn NSTT-000142 (rau ngày 18/5)', staff:'Trần Lan', orderRef:'NSTT-000142'},
  {no:'PT0041', date:'18/05/2026', type:'income', amount:12_400_000, account:'VCB-0123456789', counterparty:'KS Mường Thanh HN',
    description:'CK đơn NSTT-000143', staff:'Tuấn Tú', orderRef:'NSTT-000143'},
  {no:'PT0040', date:'17/05/2026', type:'income', amount:5_300_000, account:'Tiền mặt', counterparty:'Phở Thìn Bờ Hồ',
    description:'Thu COD đơn NSTT-000128', staff:'Phạm Hùng', orderRef:'NSTT-000128'},
  {no:'PT0039', date:'17/05/2026', type:'income', amount:18_700_000, account:'VCB-0123456789', counterparty:'Bếp ăn Canteen FPT',
    description:'CK đơn tuần T2-T6 (NSTT-000122 → 000126)', staff:'Hoàng Mai'},
  {no:'PT0038', date:'16/05/2026', type:'income', amount:32_500_000, account:'VCB-0123456789', counterparty:'KH thu nợ tháng 4',
    description:'Thu công nợ T4: Khách sạn Daewoo + Bếp Vsip', staff:'Tuấn Tú'},
  {no:'PT0037', date:'15/05/2026', type:'income', amount:6_800_000, account:'Tiền mặt', counterparty:'Nhà hàng Sen Tây Hồ',
    description:'Thu đơn cuối tuần', staff:'Trần Lan'},

  /* Chi - Mua hàng NCC */
  {no:'PC0042', date:'18/05/2026', type:'expense', amount:8_750_000, account:'Tiền mặt', counterparty:'HTX Vân Nội',
    description:'Thanh toán phiếu PN-2026-0142 (COD)', staff:'Tuấn Tú'},
  {no:'PC0041', date:'17/05/2026', type:'expense', amount:5_200_000, account:'Tiền mặt', counterparty:'Cty Nấm Mộc Châu',
    description:'Thanh toán PN-2026-0140 (COD)', staff:'Phạm Hùng'},
  {no:'PC0040', date:'15/05/2026', type:'expense', amount:9_650_000, account:'VCB-0123456789', counterparty:'HTX Vân Nội',
    description:'CK thanh toán PN-2026-0138', staff:'Tuấn Tú'},

  /* Chi - Lương NV */
  {no:'PC0039', date:'15/05/2026', type:'expense', amount:78_500_000, account:'VCB-0123456789', counterparty:'Lương NV',
    description:'Trả lương T4/2026 cho 9 NV', staff:'Tuấn Tú'},

  /* Chi - Ads */
  {no:'PC0038', date:'10/05/2026', type:'expense', amount:8_500_000, account:'VCB-0123456789', counterparty:'Facebook',
    description:'Nạp tài khoản FB Ads T5', staff:'Hoàng Mai'},
  {no:'PC0037', date:'05/05/2026', type:'expense', amount:6_200_000, account:'VCB-0123456789', counterparty:'Google',
    description:'Nạp Google Ads T5', staff:'Hoàng Mai'},

  /* Chi - Vận hành */
  {no:'PC0036', date:'12/05/2026', type:'expense', amount:1_800_000, account:'Tiền mặt', counterparty:'Tiền xăng',
    description:'Xăng xe tải tháng 5 (4 xe)', staff:'Tuấn Tú'},
  {no:'PC0035', date:'08/05/2026', type:'expense', amount:3_500_000, account:'Tiền mặt', counterparty:'Tiền thuê kho',
    description:'Thuê kho A1 + A2 T5/2026', staff:'Tuấn Tú'},
  {no:'PC0034', date:'05/05/2026', type:'expense', amount:1_200_000, account:'Tiền mặt', counterparty:'Điện nước',
    description:'Điện + nước kho + VP T4', staff:'Tuấn Tú'},

  /* Chi - Hoàn trả KH */
  {no:'PC0033', date:'16/05/2026', type:'expense', amount:80_000, account:'Tiền mặt', counterparty:'Nhà hàng Á Đông',
    description:'Hoàn tiền trả hàng RT001', staff:'Trần Lan'},
  {no:'PC0032', date:'15/05/2026', type:'expense', amount:130_000, account:'Tiền mặt', counterparty:'KS Mường Thanh',
    description:'Hoàn tiền trả hàng RT003', staff:'Tuấn Tú'},
];

/* Payment accounts (TK thanh toán) */
window.PAYMENT_ACCOUNTS = [
  {id:'cash',       name:'Tiền mặt',          balance:42_500_000, currency:'VND', icon:'💵', color:'#16A34A'},
  {id:'vcb',        name:'VCB · 0123456789',  balance:185_400_000,currency:'VND', icon:'🏦', color:'#0EA5E9'},
  {id:'tcb',        name:'TCB · 9999988888',  balance:35_200_000, currency:'VND', icon:'🏦', color:'#DC2626'},
  {id:'mb',         name:'MB · 1234567890',   balance:18_700_000, currency:'VND', icon:'🏦', color:'#7C3AED'},
  {id:'momo',       name:'MoMo · 0912345678', balance:4_200_000,  currency:'VND', icon:'📱', color:'#FF1493'},
  {id:'vnpay',      name:'VNPay QR',          balance:8_100_000,  currency:'VND', icon:'📱', color:'#1B5E20'},
];
