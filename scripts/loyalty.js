/* =========================================================
   Loyalty / Discount engine
   ─────────────────────────────────────────────────────────
   Rule schema:
   {
     id, name, enabled, priority,
     // điều kiện (AND giữa các điều kiện)
     conditions: {
       custGroup: ['VIP'],     // chỉ áp dụng cho nhóm KH
       minTotal: 5_000_000,    // đơn tối thiểu (₫)
       category: ['rau-ta'],   // chỉ khi có SP nhóm này
     },
     // hành động
     action: {
       type: 'percent' | 'amount' | 'freeShip',
       value: 5,               // % hoặc số ₫ giảm
     }
   }
   ========================================================= */
window.Loyalty = {
  default() {
    return [
      { id:'L01', name:'🏆 VIP — giảm 5% mọi đơn', enabled:true, priority:10,
        conditions:{ custGroup:['VIP'] }, action:{ type:'percent', value:5 } },
      { id:'L02', name:'📦 Đơn lớn ≥ 5tr — giảm 3%', enabled:true, priority:20,
        conditions:{ minTotal:5_000_000 }, action:{ type:'percent', value:3 } },
      { id:'L03', name:'📦 Đơn cực lớn ≥ 15tr — giảm thêm 2%', enabled:true, priority:30,
        conditions:{ minTotal:15_000_000 }, action:{ type:'percent', value:2 } },
      { id:'L04', name:'🚚 Freeship đơn ≥ 2tr', enabled:true, priority:40,
        conditions:{ minTotal:2_000_000 }, action:{ type:'freeShip', value:0 } },
    ];
  },
  getRules() {
    return window.STORE.get('loyalty_rules', this.default()) || this.default();
  },
  setRules(r) { window.STORE.set('loyalty_rules', r); },

  /* Tính discount cho 1 đơn (items + custGroup + total) */
  applyTo(orderCtx) {
    const rules = this.getRules().filter(r => r.enabled).sort((a,b) => a.priority - b.priority);
    const applied = [];
    let totalDiscount = 0;
    let freeShip = false;
    const total = orderCtx.total || 0;
    rules.forEach(r => {
      const c = r.conditions || {};
      if (c.custGroup && c.custGroup.length && !c.custGroup.includes(orderCtx.custGroup)) return;
      if (c.minTotal && total < c.minTotal) return;
      if (c.category && c.category.length) {
        const hasAny = (orderCtx.items||[]).some(it => c.category.includes(it.cat));
        if (!hasAny) return;
      }
      let amt = 0;
      if (r.action.type === 'percent') amt = total * r.action.value / 100;
      else if (r.action.type === 'amount') amt = r.action.value;
      else if (r.action.type === 'freeShip') freeShip = true;
      if (amt > 0) {
        totalDiscount += amt;
        applied.push({ rule: r.name, amount: amt });
      } else if (freeShip && r.action.type === 'freeShip') {
        applied.push({ rule: r.name, amount: 0, freeShip: true });
      }
    });
    return { totalDiscount: Math.round(totalDiscount), applied, freeShip };
  },
};
