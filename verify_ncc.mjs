const URL='https://edhyvdstmewshurxucka.supabase.co';
const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkaHl2ZHN0bWV3c2h1cnh1Y2thIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NDI4MDYsImV4cCI6MjA5NTUxODgwNn0.WXOLLLkyrLPRAOnAu_4tgFL4KJ-S3ZKuOYePgWc_96I';
const H={apikey:KEY,Authorization:'Bearer '+KEY};
const s=await (await fetch(`${URL}/rest/v1/suppliers?select=id,name,products,notes&order=id.asc`,{headers:H})).json();
console.log('TỔNG NCC cloud:', s.length);
console.log('Đầu/cuối theo mã (id.asc = thứ tự file):');
[0,1,2,58,59,60].forEach(i=>{const x=s[i]; if(x) console.log(' ', x.id, '|', x.name, '|', (x.products||[]).length,'mặt hàng →', (x.products||[]).slice(0,3).map(p=>p.name).join(', '));});
// kiểm liên tục NCC001..NCC061 không thiếu
const ids=new Set(s.map(x=>x.id)); let miss=[];
for(let i=1;i<=61;i++){const id='NCC'+String(i).padStart(3,'0'); if(!ids.has(id)) miss.push(id);}
console.log('\nThiếu mã:', miss.length?miss.join(','):'KHÔNG — đủ NCC001→NCC061 liên tục ✅');
const noProd=s.filter(x=>!(x.products||[]).length).map(x=>x.id);
console.log('NCC chưa có mặt hàng:', noProd.length?noProd.join(','):'không — tất cả đều có ✅');
