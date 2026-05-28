/* =========================================================
   Nông Sản Tuấn Tú Hà Nội — Mock data: Nhân viên
   salaryConfig:
     - fixed       : chỉ lương theo công
     - commission  : + % doanh thu KH phụ trách / NV tạo / tất cả
     - perOrder    : + thưởng/đơn (shipper)
     - kpi         : + thưởng nếu đạt mục tiêu DT tháng
     - custom      : ghi chú tự tính
   ========================================================= */
window.STAFFS = [
  { id:'NV001', code:'NV001', name:'Tuấn Tú', role:'Chủ doanh nghiệp', dept:'Ban giám đốc',
    phone:'0903 111 222', email:'luan@nongsantuantu.com', avatar:'TT',
    permissions:['Tất cả'], salary:0, kpi:null, status:'active',
    joinDate:'01/01/2020', address:'Hà Nội',
    salaryConfig:{ type:'custom', customNote:'Chủ doanh nghiệp — không nhận lương cố định, hưởng lợi nhuận ròng' } },

  { id:'NV002', code:'NV002', name:'Trần Lan', role:'Trưởng phòng Sales/CSKH', dept:'Sales',
    phone:'0912 333 444', email:'lan.tran@nongsantuantu.com', avatar:'TL',
    permissions:['Khách hàng','Đơn hàng','Công nợ','Hóa đơn','Báo cáo'],
    salary:18_000_000, kpi:'92%', status:'active',
    joinDate:'10/05/2022', address:'Cầu Giấy, HN',
    salaryConfig:{ type:'commission', commissionPct:0.5, commissionScope:'allOrders' } },

  { id:'NV003', code:'NV003', name:'Phạm Hùng', role:'Nhân viên Sales', dept:'Sales',
    phone:'0936 555 666', email:'hung.pham@nongsantuantu.com', avatar:'PH',
    permissions:['Khách hàng','Đơn hàng','Báo cáo'],
    salary:12_000_000, kpi:'88%', status:'active',
    joinDate:'15/03/2024', address:'Hai Bà Trưng, HN',
    salaryConfig:{ type:'commission', commissionPct:1.5, commissionScope:'ownedCusts' } },

  { id:'NV004', code:'NV004', name:'Hoàng Mai', role:'NV CSKH B2C / Last-mile', dept:'CSKH',
    phone:'0978 777 888', email:'mai.hoang@nongsantuantu.com', avatar:'HM',
    permissions:['Khách hàng','Đơn hàng'],
    salary:10_000_000, kpi:'95%', status:'active',
    joinDate:'01/11/2024', address:'Đống Đa, HN',
    salaryConfig:{ type:'commission', commissionPct:1.0, commissionScope:'ownedCusts' } },

  { id:'NV005', code:'NV005', name:'Lê Thị Phương', role:'Kế toán', dept:'Kế toán',
    phone:'0945 222 111', email:'phuong.ke-toan@nongsantuantu.com', avatar:'LP',
    permissions:['Kế toán','Công nợ','Hóa đơn','Báo cáo'],
    salary:14_000_000, kpi:'90%', status:'active',
    joinDate:'08/02/2023', address:'Thanh Xuân, HN',
    salaryConfig:{ type:'fixed' } },

  { id:'NV006', code:'NV006', name:'Nguyễn Văn A', role:'Tài xế nội thành', dept:'Vận hành',
    phone:'0901 222 333', email:'', avatar:'NA',
    permissions:['Đơn hàng (chỉ xem)'],
    salary:9_500_000, kpi:'87%', status:'active',
    joinDate:'15/06/2024', address:'Cầu Giấy, HN',
    salaryConfig:{ type:'perOrder', perOrderBonus:15000, perOrderStatus:'reconciled' } },

  { id:'NV007', code:'NV007', name:'Trần Hùng', role:'Tài xế nội thành', dept:'Vận hành',
    phone:'0905 444 555', email:'', avatar:'TH',
    permissions:['Đơn hàng (chỉ xem)'],
    salary:9_500_000, kpi:'93%', status:'active',
    joinDate:'22/01/2025', address:'Hai Bà Trưng, HN',
    salaryConfig:{ type:'perOrder', perOrderBonus:15000, perOrderStatus:'reconciled' } },

  { id:'NV008', code:'NV008', name:'Lê Văn B', role:'Tài xế liên tỉnh', dept:'Vận hành',
    phone:'0912 666 777', email:'', avatar:'LB',
    permissions:['Đơn hàng (chỉ xem)'],
    salary:13_000_000, kpi:'89%', status:'active',
    joinDate:'08/03/2023', address:'Đông Anh, HN',
    salaryConfig:{ type:'perOrder', perOrderBonus:25000, perOrderStatus:'reconciled' } },

  { id:'NV009', code:'NV009', name:'Phạm Đức', role:'Tài xế liên tỉnh', dept:'Vận hành',
    phone:'0936 888 999', email:'', avatar:'PĐ',
    permissions:['Đơn hàng (chỉ xem)'],
    salary:15_000_000, kpi:'94%', status:'active',
    joinDate:'12/09/2022', address:'Long Biên, HN',
    salaryConfig:{ type:'kpi', kpiTarget:80_000_000, kpiBonus:3_000_000 } },
];
