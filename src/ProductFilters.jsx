import React from 'react';
import {Search} from 'lucide-react';
import {emptyFilters} from './productFilters.js';
export default function ProductFilters({products,suppliers,value,onChange,count}){
 const change=(key,next)=>onChange({...value,[key]:next});
 return <div className="product-filters"><div className="catalog-toolbar">
 <label className="filter-search">Buscar producto<div className="search-wrap"><Search size={18}/><input value={value.query} onChange={e=>change('query',e.target.value)} placeholder="Nombre, modelo, color o talla…"/></div></label>
 <label>Proveedor<select value={value.supplier} onChange={e=>change('supplier',e.target.value)}><option value="">Todos los proveedores</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 <label>Tipo de producto<select value={value.kind} onChange={e=>change('kind',e.target.value)}><option value="">Todos los tipos</option>{[...new Set(products.map(p=>p.kind))].sort().map(k=><option key={k}>{k}</option>)}</select></label>
 <label>Existencias<select value={value.stock} onChange={e=>change('stock',e.target.value)}><option value="">Todas</option><option value="available">Con existencias</option><option value="empty">Sin existencias</option></select></label>
 <button className="secondary" disabled={!Object.values(value).some(Boolean)} onClick={()=>onChange(emptyFilters())}>Limpiar filtros</button>
 </div><p className="filter-count" role="status">Mostrando {count} de {products.length} variantes</p></div>;
}
