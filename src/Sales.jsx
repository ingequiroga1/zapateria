import React,{useRef,useState} from 'react';
import {Plus,Trash2,CheckCircle2} from 'lucide-react';
import {money,today,dateLabel,labelName,validateSale} from './domain';
import {confirmSale} from './data';
export default function Sales({data,client,refresh,notify}){
 const fresh=()=>({id:crypto.randomUUID(),sale_date:today(),payment_method:'Efectivo',items:[]});
 const [sale,setSale]=useState(fresh),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(null);const flight=useRef(false),retry=useRef(null);
 const update=(id,key,value)=>setSale(s=>({...s,items:s.items.map(r=>r.product_id===id?{...r,[key]:value}:r)}));
 const total=sale.items.reduce((s,r)=>s+Math.round(Number(r.price)*100)*Number(r.quantity),0)/100;
 async function submit(e){e.preventDefault();if(flight.current||saved)return;try{const payload=retry.current||validateSale(sale,data.products);flight.current=true;setBusy(true);retry.current=structuredClone(payload);const result=await confirmSale(client,payload);setSaved(result);retry.current=null;notify('Venta registrada. Las existencias se descontaron.');try{await refresh()}catch{notify('Venta guardada. Recarga para actualizar el inventario.',true)}}catch(e){notify(e.message||'No se pudo registrar la venta.',true)}finally{flight.current=false;setBusy(false)}}
 const locked=busy||!!saved||!!retry.current;
 return <><div className="page-heading"><div><div className="eyebrow">OPERACIÓN INTERNA</div><h1>Registro de ventas</h1><p>Captura lo vendido y actualiza las existencias de tu tienda.</p></div></div>
 {!client&&<div className="demo-banner">Modo demostración: las ventas y existencias se guardan en este navegador.</div>}
 {saved&&<div className="sale-success" role="status"><CheckCircle2/><div><b>{saved.folio} · Venta registrada</b><p>Total: {money(saved.total)} · El inventario ya se actualizó.</p></div><button className="primary" onClick={()=>{setSale(fresh());setSaved(null);setQuery('')}}>Nueva venta</button></div>}
 <form onSubmit={submit} className="panel sale-form"><fieldset disabled={locked}><div className="supplier-grid"><label>Fecha de venta<input required type="date" value={sale.sale_date} onChange={e=>setSale({...sale,sale_date:e.target.value})}/></label><label>Forma de pago<select value={sale.payment_method} onChange={e=>setSale({...sale,payment_method:e.target.value})}>{['Efectivo','Tarjeta','Transferencia','Otro'].map(m=><option key={m}>{m}</option>)}</select></label></div>
 <label className="sale-search">Buscar producto<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nombre, tipo, color o tamaño…"/></label>
 {query&&<div className="sale-results">{data.products.filter(p=>labelName(p).toLowerCase().includes(query.toLowerCase())).slice(0,12).map(p=><button type="button" className="secondary" key={p.id} disabled={p.stock<1||sale.items.some(r=>r.product_id===p.id)} onClick={()=>{setSale({...sale,items:[...sale.items,{product_id:p.id,quantity:1,price:p.price}]});setQuery('')}}><Plus size={16}/><span>{labelName(p)}<small>{p.stock} disponibles · {money(p.price)}</small></span></button>)}{!data.products.some(p=>labelName(p).toLowerCase().includes(query.toLowerCase()))&&<p>No hay coincidencias. Registra el producto y recibe mercancía primero.</p>}</div>}
 <div className="table-scroll">
    <table className="simple-table">
        <thead>
            <tr>
                <th>Producto vendido</th>
                <th>Disponible</th>
                <th>Cantidad</th>
                <th>Precio unitario</th>
                <th>Importe</th>
                <th>
                    </th>
                    </tr>
            </thead>
            <tbody>
                {sale.items.map(r=>{const p=data.products.find(p=>p.id===r.product_id);return <tr key={r.product_id}><td>{p?labelName(p):'Producto no disponible'}</td><td>{p?.stock??0}</td><td><input aria-label={'Cantidad '+p?.name} required type="number" min="1" max={p?.stock||1} step="1" value={r.quantity} onChange={e=>update(r.product_id,'quantity',e.target.value)}/></td>
                <td>
                    <input disabled aria-label={'Precio '+p?.name} required type="number" min="0" max="9999999" step="0.01" value={r.price} onChange={e=>update(r.product_id,'price',e.target.value)}/></td><td>{money(Math.round(Number(r.price)*100)*Number(r.quantity)/100)}</td><td><button type="button" title="Quitar renglón" onClick={()=>setSale({...sale,items:sale.items.filter(i=>i.product_id!==r.product_id)})}><Trash2 size={17}/></button></td></tr>})}</tbody></table></div>
 {!sale.items.length&&<div className="empty">Busca un producto para capturar la venta.</div>}</fieldset>
 <div className="sale-total"><span>{sale.items.reduce((s,r)=>s+(Number(r.quantity)||0),0)} piezas · Total <b>{money(total)}</b></span><button className="primary" disabled={busy||!!saved||!sale.items.length}>{busy?'Registrando…':saved?'Venta registrada':retry.current?'Reintentar registro':'Registrar venta'}</button></div>
 {retry.current&&!saved&&<p className="hint">La solicitud se conserva para reintentar sin duplicar el descuento. Si el servidor rechazó la venta, recarga para consultar las existencias y capturarla de nuevo.</p>}</form>
 <div className="page-heading"><div><h2>Historial de ventas</h2><p>Últimas 100 ventas registradas.</p></div></div><div className="panel list-panel">{(data.sales||[]).length?(data.sales||[]).map(s=><details className="sale-history" key={s.id}><summary><b>{s.folio}</b><span>{dateLabel(s.sale_date)} · {s.payment_method}</span><strong>{money(s.total)}</strong></summary>{s.items.map((r,i)=><p key={i}>{labelName(r)} · {r.quantity} × {money(r.price)} = {money(r.quantity*r.price)}</p>)}</details>):<div className="empty">Todavía no hay ventas registradas.</div>}</div></>;
}
