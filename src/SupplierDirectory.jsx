import React,{useEffect,useRef,useState} from 'react';
import {Store,ChevronRight,Trash2} from 'lucide-react';
import {deleteSupplier} from './data.js';
export default function SupplierDirectory({data,client,refresh,notify,onProducts,protectedSupplierId,onDeleted}){
 const [selected,setSelected]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const dialog=useRef(null),inFlight=useRef(false);
 useEffect(()=>{if(selected)dialog.current?.showModal();else dialog.current?.close()},[selected]);
 async function remove(){if(inFlight.current||!selected)return;inFlight.current=true;setBusy(true);setError('');try{
  await deleteSupplier(client,selected.id);onDeleted(selected.id);setSelected(null);notify('Proveedor eliminado.');
  try{await refresh()}catch{notify('Proveedor eliminado. Recarga para actualizar la lista.',true)}
 }catch(e){setError(e.message)}finally{setBusy(false);inFlight.current=false}}
 return <div className="panel list-panel">{data.suppliers.length?data.suppliers.map(s=>{
 const count=data.products.filter(p=>p.supplier_ids?.includes(s.id)).length;
 const reason=protectedSupplierId===s.id?'Este proveedor está en una entrada en captura. Termina o vacía esa captura primero.':data.entries.some(e=>e.supplier_id===s.id)?'Tiene entradas registradas; se conserva para el historial.':count?'Tiene productos asociados. Reasígnalos antes de eliminarlo.':'';
 return <div className="supplier-directory-row" key={s.id}><div className="supplier-item"><Store size={20}/><b>{s.name}</b><button className="text-button supplier-products-link" onClick={()=>onProducts(s.id)}>{count} productos <ChevronRight size={15}/></button><button className="secondary danger-button" disabled={busy||!!reason} aria-label={'Eliminar proveedor '+s.name} onClick={()=>{setError('');setSelected(s)}}><Trash2 size={16}/>Eliminar</button></div>{reason&&<p className="supplier-delete-hint">{reason}</p>}</div>;
 }):<p className="empty">Agrega tu primer proveedor.</p>}
 <dialog ref={dialog} className="supplier-confirm" aria-labelledby="delete-supplier-title" onCancel={e=>{if(busy)e.preventDefault();else setSelected(null)}}><h2 id="delete-supplier-title">¿Eliminar proveedor?</h2><p>Se eliminará <b>{selected?.name}</b> del directorio. Esta acción no se puede deshacer.</p><p>Solo se permite si no tiene productos asociados ni entradas registradas.</p>{error&&<p role="alert" className="delete-error">{error}</p>}<div className="modal-footer"><button autoFocus className="secondary" disabled={busy} onClick={()=>setSelected(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={remove}>{busy?'Eliminando…':'Eliminar proveedor'}</button></div></dialog></div>;
}
