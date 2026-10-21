export function summarizeReports(sales,items){
 const days=new Map(),products=new Map();
 for(const s of sales){const d=days.get(s.sale_date)||{date:s.sale_date,sales:0,pieces:0,cents:0};d.sales++;d.cents+=Math.round(Number(s.total)*100);days.set(d.date,d)}
 const dates=new Map(sales.map(s=>[s.id,s.sale_date]));
 for(const i of items){const date=dates.get(i.sale_id);if(!date)continue;const qty=Number(i.quantity),cents=Math.round(Number(i.price)*100)*qty;days.get(date).pieces+=qty;const p=products.get(i.product_id)||{id:i.product_id,kind:i.kind,name:i.name,color:i.color,size:i.size,quantity:0,cents:0};p.quantity+=qty;p.cents+=cents;products.set(p.id,p)}
 return {daily:[...days.values()].sort((a,b)=>b.date.localeCompare(a.date)),products:[...products.values()].sort((a,b)=>b.quantity-a.quantity||b.cents-a.cents),total:sales.reduce((s,r)=>s+Math.round(Number(r.total)*100),0)/100,pieces:items.reduce((s,r)=>s+(dates.has(r.sale_id)?Number(r.quantity):0),0),count:sales.length};
}
