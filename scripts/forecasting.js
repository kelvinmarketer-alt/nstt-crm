/* =========================================================
   Forecasting + Cohort + Variance Analysis
   ─────────────────────────────────────────────────────────
   Bộ helper phân tích nâng cao, hiển thị trong Reports.

   1. forecast.linearNext(series, n)
      → Dự báo n giá trị kế tiếp dùng linear regression đơn giản
   2. forecast.movingAvg(series, window)
      → Trung bình trượt
   3. cohort.byMonth(orders, customers)
      → Cohort retention theo tháng đầu tiên đặt
   4. variance.calc(actual, budget)
      → So Plan vs Actual
   ========================================================= */
window.Forecasting = {

  /* Linear regression: y = a + b*x, dự báo n điểm tiếp theo */
  linearNext(series, n) {
    const N = series.length;
    if (N < 2) return Array(n).fill(series[N-1] || 0);
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    series.forEach((y, x) => { sumX += x; sumY += y; sumXY += x*y; sumXX += x*x; });
    const b = (N*sumXY - sumX*sumY) / Math.max(1, N*sumXX - sumX*sumX);
    const a = (sumY - b*sumX) / N;
    const out = [];
    for (let i = 0; i < n; i++) {
      const v = a + b * (N + i);
      out.push(Math.max(0, Math.round(v)));
    }
    return out;
  },

  movingAvg(series, window) {
    const out = [];
    for (let i = 0; i < series.length; i++) {
      const start = Math.max(0, i - window + 1);
      const slice = series.slice(start, i+1);
      out.push(slice.reduce((a,b) => a+b, 0) / slice.length);
    }
    return out;
  },

  /* Series 12 tháng doanh thu */
  monthlyRevSeries() {
    const orders = window.STORE.get('orders', []) || [];
    const map = {};
    orders.forEach(o => {
      if (o.status === 'cancelled') return;
      const m = (o.date||'').match(/(\d+)\/(\d+)\/(\d+)/);
      if (!m) return;
      const key = `${m[3]}-${String(m[2]).padStart(2,'0')}`;
      map[key] = (map[key] || 0) + (o.freight || 0);
    });
    const keys = Object.keys(map).sort();
    const last12 = keys.slice(-12);
    return { labels: last12, values: last12.map(k => map[k] || 0) };
  },
};

window.Cohort = {
  /* Cohort: tháng đầu mỗi KH → tỷ lệ active mỗi tháng sau */
  byMonth() {
    const orders = (window.STORE.get('orders', []) || []).filter(o => o.status !== 'cancelled');
    const custFirst = {};
    /* Tìm tháng đầu của mỗi KH */
    orders.forEach(o => {
      const m = (o.date||'').match(/(\d+)\/(\d+)\/(\d+)/);
      if (!m) return;
      const ym = `${m[3]}-${String(m[2]).padStart(2,'0')}`;
      if (!custFirst[o.custId] || ym < custFirst[o.custId]) custFirst[o.custId] = ym;
    });
    /* Group KH theo tháng đầu (cohort) */
    const cohorts = {};
    Object.entries(custFirst).forEach(([cid, ym]) => {
      cohorts[ym] = cohorts[ym] || [];
      cohorts[ym].push(cid);
    });
    /* Với mỗi cohort, đếm KH active mỗi tháng sau đó */
    const all = Object.keys(cohorts).sort();
    const matrix = [];
    all.forEach(ym => {
      const row = { cohort: ym, size: cohorts[ym].length, months: [] };
      const startIdx = all.indexOf(ym);
      for (let i = 0; i < 6; i++) {
        const offset = startIdx + i;
        const targetYm = all[offset];
        if (!targetYm) { row.months.push(null); continue; }
        const activeCusts = new Set();
        orders.forEach(o => {
          const om = (o.date||'').match(/(\d+)\/(\d+)\/(\d+)/);
          if (!om) return;
          const oYm = `${om[3]}-${String(om[2]).padStart(2,'0')}`;
          if (oYm === targetYm && cohorts[ym].includes(o.custId)) activeCusts.add(o.custId);
        });
        row.months.push(Math.round((activeCusts.size / row.size) * 100));
      }
      matrix.push(row);
    });
    return matrix.slice(-8);  /* 8 cohort gần nhất */
  },
};

window.Variance = {
  /* Default budget: lưu trong STORE.budget */
  getBudget() { return window.STORE.get('budget_2026', {
    /* monthlyRevTarget, monthlyCostBudget, etc — Default seed nếu chưa có */
    monthlyRevTarget:   500_000_000,
    monthlyCogsBudget:  325_000_000,
    monthlyAdsBudget:    25_000_000,
    monthlySalaryBudget: 80_000_000,
  }) || {}; },

  setBudget(b) { window.STORE.set('budget_2026', b); },

  /* So sánh actual T5 vs budget */
  compare() {
    const b = this.getBudget();
    const orders = (window.STORE.get('orders', []) || []).filter(o => o.status !== 'cancelled' && (o.date||'').includes('/05/2026'));
    const ads = (window.STORE.get('adspend', []) || []).filter(a => (a.date||'').startsWith('2026-05'));
    const staff = (window.STORE.get('staff', []) || []).filter(s => s.status === 'active');
    const products = window.STORE.get('products', []) || [];
    const buyFor = (pid, date) => {
      const p = products.find(x => x.id === pid);
      if (!p || !p.priceHistory) return 0;
      const sorted = p.priceHistory.slice().sort((a,b) => a.date < b.date ? -1 : 1);
      return sorted[sorted.length-1]?.buy || 0;
    };
    const rev = orders.reduce((s,o) => s+(o.freight||0), 0);
    let cogs = 0;
    orders.forEach(o => (o.items||[]).forEach(it => {
      cogs += (buyFor(it.id) || (it.price||0)*0.65) * (it.qty||0);
    }));
    const adsTotal = ads.reduce((s,a) => s+(a.spend||0), 0);
    const salary = staff.reduce((s,x) => s+(x.salary||0), 0);
    return [
      {label:'💰 Doanh thu',   actual:rev,      budget:b.monthlyRevTarget,    higherIsBetter:true},
      {label:'📦 COGS (Giá vốn)', actual:cogs,   budget:b.monthlyCogsBudget,   higherIsBetter:false},
      {label:'📣 Chi phí Ads', actual:adsTotal, budget:b.monthlyAdsBudget,    higherIsBetter:false},
      {label:'💼 Lương NV',    actual:salary,   budget:b.monthlySalaryBudget, higherIsBetter:false},
    ];
  },
};
