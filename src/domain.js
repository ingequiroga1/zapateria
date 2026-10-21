export const money = n => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(n)||0);
export const today = () => {const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
export const dateLabel = v => v?.split('-').reverse().join('/') || '';
export const labelName = r => [r.kind,r.name,r.size,r.color].filter(Boolean).join(' ');
export const variantKey = r => JSON.stringify([r.kind,r.name,r.color,r.size].map(x=>x.trim().toLowerCase()));
export function validateEntry(e){
 if(!e.supplier_id) throw Error('Selecciona un proveedor.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(e.entry_date)) throw Error('Selecciona una fecha de entrada.');
 if(!e.items.length) throw Error('Agrega al menos un artículo.');
 if(e.items.length>100) throw Error('Máximo 100 variantes por entrada.');
 e.items.forEach((r,i)=>{
  if(['kind','name','color','size'].some(k=>!r[k]?.trim())) throw Error('Completa tipo, nombre, color y tamaño en la fila '+(i+1)+'.');
  if(!Number.isInteger(Number(r.quantity))||Number(r.quantity)<1||Number(r.quantity)>9999) throw Error('La cantidad de la fila '+(i+1)+' debe ser un entero entre 1 y 9999.');
  if(['cost','price'].some(k=>r[k]===''||!Number.isFinite(Number(r[k]))||Number(r[k])<0||Number(r[k])>9999999)) throw Error('Revisa los precios de la fila '+(i+1)+'.');
 });
 return e;
}
export const totalCost = items => items.reduce((s,r)=>s+Math.round(Number(r.cost)*100)*Number(r.quantity),0)/100;
export function applyDemoEntry(state,entry){
 validateEntry(entry);
 const existing=state.entries.find(x=>x.id===entry.id);if(existing)return {state,entry:existing};
 const products=state.products.map(p=>({...p}));
 for(const row of entry.items){let p=products.find(p=>variantKey(p)===variantKey(row));if(p){p.stock+=Number(row.quantity);p.cost=Number(row.cost);p.price=Number(row.price);p.image_path=row.image_path||p.image_path;p.supplier_ids=[...new Set([...(p.supplier_ids||[]),entry.supplier_id])];}else products.push({...row,id:crypto.randomUUID(),stock:Number(row.quantity),supplier_ids:[entry.supplier_id]});}
 const saved={...entry,folio:'ENT-'+String(state.entries.length+1).padStart(6,'0'),total:totalCost(entry.items)};
 return {state:{...state,products,entries:[saved,...state.entries]},entry:saved};
}

export function migrateDemoSuppliers(state){
 return {...state,products:state.products.map(p=>{
  if(Array.isArray(p.supplier_ids))return p;
  const ids=new Set();
  for(const e of state.entries)if(e.supplier_id&&e.items.some(i=>variantKey(i)===variantKey(p)))ids.add(e.supplier_id);
  return {...p,supplier_ids:[...ids]};
 })};
}
export function validateProduct(product,supplierIds,knownSuppliers){
 validateEntry({supplier_id:'catalog',entry_date:'2026-01-01',items:[{...product,quantity:1}]});
 if(!supplierIds.length)throw Error('Selecciona al menos un proveedor.');
 if(supplierIds.some(id=>!knownSuppliers.some(s=>s.id===id)))throw Error('Hay un proveedor no válido.');
 return product;
}
export function saveDemoProduct(state,product,supplierIds){
 validateProduct(product,supplierIds,state.suppliers);
 const duplicate=state.products.find(p=>p.id!==product.id&&variantKey(p)===variantKey(product));
 if(duplicate)throw Error('Esta variante ya existe. Edítala para agregar sus proveedores.');
 const existing=state.products.find(p=>p.id===product.id);
 const saved={...product,kind:product.kind.trim(),name:product.name.trim(),color:product.color.trim(),size:product.size.trim(),cost:Number(product.cost),price:Number(product.price),stock:existing?.stock||0,supplier_ids:[...new Set(supplierIds)]};
 return {state:{...state,products:existing?state.products.map(p=>p.id===saved.id?saved:p):[...state.products,saved]},product:saved};
}

export function validateSale(sale,products){
 if(!sale.id||!/^\d{4}-\d{2}-\d{2}$/.test(sale.sale_date))throw Error('Selecciona una fecha de venta.');
 if(!['Efectivo','Tarjeta','Transferencia','Otro'].includes(sale.payment_method))throw Error('Selecciona una forma de pago.');
 if(!sale.items.length||sale.items.length>100)throw Error('Registra entre 1 y 100 productos.');
 const quantities=new Map();
 for(const r of sale.items){
  const p=products.find(p=>p.id===r.product_id);if(!p)throw Error('Producto no disponible.');
  if(!Number.isInteger(Number(r.quantity))||Number(r.quantity)<1||Number(r.quantity)>9999)throw Error('Revisa la cantidad de '+labelName(p)+'.');
  if(r.price===''||!Number.isFinite(Number(r.price))||Number(r.price)<0||Number(r.price)>9999999)throw Error('Revisa el precio de '+labelName(p)+'.');
  quantities.set(p.id,(quantities.get(p.id)||0)+Number(r.quantity));
  if(quantities.get(p.id)>p.stock)throw Error('Existencias insuficientes: '+labelName(p)+' ('+p.stock+' disponibles).');
 }
 return sale;
}
export function applyDemoSale(state,sale){
 const existing=(state.sales||[]).find(s=>s.id===sale.id);if(existing)return {state,sale:existing};
 validateSale(sale,state.products);
 const products=state.products.map(p=>({...p}));
 const items=sale.items.map(r=>{const p=products.find(p=>p.id===r.product_id);p.stock-=Number(r.quantity);return {...p,product_id:p.id,quantity:Number(r.quantity),price:Math.round(Number(r.price)*100)/100}});
 const saved={...sale,items,folio:'VTA-'+String((state.sales||[]).length+1).padStart(6,'0'),total:items.reduce((s,r)=>s+Math.round(r.price*100)*r.quantity,0)/100};
 return {state:{...state,products,sales:[saved,...(state.sales||[])]},sale:saved};
}
