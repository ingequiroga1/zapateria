import {createClient} from '@supabase/supabase-js';
import {applyDemoSale,applyDemoEntry,migrateDemoSuppliers,saveDemoProduct} from './domain';
const CONFIG_KEY='piel.connection.v1', DEMO_KEY='piel.demo.v1';
export function getConfig() {
  return readConnectionConfig(import.meta.env);
}
export function saveConfig(c){localStorage.setItem(CONFIG_KEY,JSON.stringify(c))}
export function makeClient(c){return c.url&&c.key?createClient(c.url,c.key):null}
export const initialDemo=()=>({suppliers:[{id:'demo-supplier',name:'Pieles del Bajío'}],products:[],entries:[]});
export function readDemo(){try{const d=JSON.parse(localStorage.getItem(DEMO_KEY));return d?.entries&&d?.products&&d?.suppliers?migrateDemoSuppliers(d):initialDemo()}catch{return initialDemo()}}
export function writeDemo(d){localStorage.setItem(DEMO_KEY,JSON.stringify(d));return d}
export async function loadData(client){
 if(!client)return readDemo();
 const results=await Promise.all([client.from('suppliers').select('*').order('name'),client.from('products').select('*,product_suppliers(supplier_id)').order('name'),client.from('entries').select('*,items:entry_items(*)').order('created_at',{ascending:false}).limit(100),client.from('sales').select('*,items:sale_items(*)').order('created_at',{ascending:false}).limit(100)]);
 for(const r of results)if(r.error){if(['PGRST200','42P01'].includes(r.error.code))throw Error('Actualiza tu base de datos con la migración 002 de productos y la 003 de ventas, disponible en Configuración.');throw r.error;}
 return {suppliers:results[0].data,products:results[1].data.map(p=>({...p,supplier_ids:p.product_suppliers.map(r=>r.supplier_id)})),entries:results[2].data,sales:results[3].data};
}
export async function addSupplier(client,name,userId){if(!client){const state=readDemo();const s={id:crypto.randomUUID(),name};writeDemo({...state,suppliers:[...state.suppliers,s]});return s}const {data,error}=await client.from('suppliers').insert({name,owner_id:userId}).select().single();if(error)throw error;return data}
export async function uploadImage(client,file,userId){
 if(!['image/jpeg','image/png'].includes(file.type))throw Error('Elige una imagen JPG o PNG.');
 if(file.size>5*1024*1024)throw Error('La imagen debe pesar máximo 5 MB.');
 if(!client)return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});
 const path=userId+'/'+crypto.randomUUID()+'.'+(file.type==='image/png'?'png':'jpg');
 const {error}=await client.storage.from('product-images').upload(path,file,{contentType:file.type,upsert:false});if(error)throw error;return path;
}
export async function imageUrl(client,path){if(!path)return '';if(!client)return path;const {data,error}=await client.storage.from('product-images').createSignedUrl(path,3600);if(error)throw error;return data.signedUrl}
export async function confirmEntry(client,payload){
 if(!client){const result=applyDemoEntry(readDemo(),payload);writeDemo(result.state);return result.entry}
 const {data,error}=await client.rpc('receive_merchandise',{p_id:payload.id,p_supplier_id:payload.supplier_id,p_date:payload.entry_date,p_reference:payload.reference,p_notes:payload.notes,p_items:payload.items.map(({kind,name,color,size,quantity,cost,price,image_path})=>({kind,name,color,size,quantity:Number(quantity),cost:Number(cost),price:Number(price),image_path:image_path||null}))});if(error)throw error;return data;
}

export async function registerProduct(client,product,supplierIds){
 if(!client){const r=saveDemoProduct(readDemo(),product,supplierIds);writeDemo(r.state);return r.product}
 const {data,error}=await client.rpc('register_product',{p_id:product.id,p_product:{kind:product.kind,name:product.name,color:product.color,size:product.size,cost:Number(product.cost),price:Number(product.price),image_path:product.image_path||null},p_supplier_ids:supplierIds});if(error)throw error;return data;
}

export async function confirmSale(client,payload){
 if(!client){const result=applyDemoSale(readDemo(),payload);writeDemo(result.state);return result.sale}
 const {data,error}=await client.rpc('register_sale',{p_id:payload.id,p_date:payload.sale_date,p_payment:payload.payment_method,p_items:payload.items.map(r=>({product_id:r.product_id,quantity:Number(r.quantity),price:Number(r.price)}))});if(error)throw error;return data;
}

export async function loadReportData(client,from,to){
 if(!client){const sales=(readDemo().sales||[]).filter(s=>s.sale_date>=from&&s.sale_date<=to);return {sales,items:sales.flatMap(s=>s.items.map(i=>({...i,sale_id:s.id})))}}
 async function pages(query){const all=[];for(let offset=0;;offset+=500){const {data,error}=await query().range(offset,offset+499);if(error)throw error;all.push(...data);if(data.length<500)return all}}
 const [sales,items]=await Promise.all([
 pages(()=>client.from('sales').select('id,sale_date,total').gte('sale_date',from).lte('sale_date',to).order('id')),
 pages(()=>client.from('sale_items').select('id,sale_id,product_id,kind,name,color,size,quantity,price,sales!inner(sale_date)').gte('sales.sale_date',from).lte('sales.sale_date',to).order('id'))
 ]);return {sales,items};
}
