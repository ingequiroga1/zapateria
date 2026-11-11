import test from 'node:test';
import assert from 'node:assert/strict';
import {filterProducts,emptyFilters,removeDemoSupplier} from '../src/productFilters.js';
const products=[{id:'a',kind:'Cinturón',name:'Clásico',color:'Café',size:'36',stock:2,supplier_ids:['s']},{id:'b',kind:'Bolsa',name:'Sara',color:'Rojo',size:'Grande',stock:0,supplier_ids:['t']}];
test('filters combine supplier, type, stock and accent-insensitive words in any order',()=>{
 assert.deepEqual(filterProducts(products,{query:' CAFE clasico ',supplier:'s',kind:'Cinturón',stock:'available'}).map(p=>p.id),['a']);
 assert.equal(filterProducts(products,{query:'cafe',supplier:'t'}).length,0);
 assert.deepEqual(filterProducts(products,{stock:'empty'}).map(p=>p.id),['b']);
 assert.equal(filterProducts(products,emptyFilters()).length,2);
});
test('supplier deletion preserves products and history and rejects references',()=>{
 const state={suppliers:[{id:'s'},{id:'t'},{id:'u'}],products,entries:[{supplier_id:'t'}]};
 assert.throws(()=>removeDemoSupplier(state,'s'),/productos asociados/);
 assert.throws(()=>removeDemoSupplier({...state,products:[]},'t'),/entradas registradas/);
 const result=removeDemoSupplier(state,'u');
 assert.equal(result.suppliers.length,2);assert.equal(state.suppliers.length,3);
 assert.equal(result.products,state.products);assert.equal(result.entries,state.entries);
 assert.equal(removeDemoSupplier(result,'u'),result);
});
