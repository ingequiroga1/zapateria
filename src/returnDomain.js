export const demoSaleLines=sale=>({...sale,items:sale.items.map((i,n)=>({...i,id:`${sale.id}:${n}`}))});
export function returnBalance(sale,returns){return sale.items.map(i=>({...i,returned:returns.filter(r=>r.sale_id===sale.id).flatMap(r=>r.items).filter(r=>r.sale_item_id===i.id).reduce((s,r)=>s+Number(r.quantity),0)}))}
export function validateReturn(payload,sale,returns){
 if(!sale||payload.sale_id!==sale.id)throw Error('Venta no disponible.');
 if(!payload.id||!/^\d{4}-\d{2}-\d{2}$/.test(payload.return_date)||payload.return_date<sale.sale_date)throw Error('La fecha de devolución debe ser igual o posterior a la venta.');
 if(!payload.reason?.trim()||payload.reason.length>200)throw Error('Indica un motivo de hasta 200 caracteres.');
 if(!['Efectivo','Tarjeta','Transferencia','Otro'].includes(payload.refund_method))throw Error('Selecciona la forma de reembolso.');
 if((payload.notes||'').length>2000)throw Error('Observaciones demasiado largas.');
 if(!payload.items.length||payload.items.length>100)throw Error('Selecciona al menos un producto.');
 const lines=returnBalance(sale,returns),seen=new Set();
 for(const row of payload.items){const i=lines.find(i=>i.id===row.sale_item_id);if(!i||seen.has(i.id))throw Error('Renglón no válido o repetido.');seen.add(i.id);if(!Number.isInteger(row.quantity)||row.quantity<1||row.quantity>i.quantity-i.returned)throw Error('La cantidad supera lo pendiente de devolver.');if(typeof row.restock!=='boolean')throw Error('Selecciona el estado del producto.');}
 return payload;
}
export function applyDemoReturn(state,payload){
 const previous=(state.returns||[]).find(r=>r.id===payload.id);if(previous)return {state,returned:previous};
 const source=(state.sales||[]).find(s=>s.id===payload.sale_id),sale=source&&demoSaleLines(source);
 validateReturn(payload,sale,state.returns||[]);
 const products=state.products.map(p=>({...p}));
 const items=payload.items.map(r=>{const line=sale.items.find(i=>i.id===r.sale_item_id);const p=products.find(p=>p.id===line.product_id);if(r.restock){if(!p)throw Error('Producto no disponible para reintegrar.');p.stock+=r.quantity}return {...line,...r,id:crypto.randomUUID(),price:Number(line.price)}});
 const returned={...payload,items,owner_id:'demo',created_at:new Date().toISOString(),folio:'DEV-'+String((state.returns||[]).length+1).padStart(6,'0'),total:items.reduce((s,r)=>s+Math.round(r.price*100)*r.quantity,0)/100};
 return {state:{...state,products,returns:[returned,...(state.returns||[])]},returned};
}
