import test from 'node:test';
import assert from 'node:assert/strict';
import {applyDemoEntry,validateEntry,totalCost} from '../src/domain.js';
const row={kind:'Monedero',name:'Sara',color:'Rojo',size:'Grande',quantity:6,cost:85,price:149};
const entry={id:'request-1',supplier_id:'s1',entry_date:'2026-10-19',items:[row]};
test('confirmar suma piezas y reintentar el mismo id no duplica',()=>{const first=applyDemoEntry({entries:[],products:[],suppliers:[]},entry);assert.equal(first.state.products[0].stock,6);const retry=applyDemoEntry(first.state,entry);assert.equal(retry.state.products[0].stock,6);assert.equal(retry.state.entries.length,1)});
test('una segunda entrada de la misma variante suma existencias',()=>{const first=applyDemoEntry({entries:[],products:[],suppliers:[]},entry);const next=applyDemoEntry(first.state,{...entry,id:'request-2',items:[{...row,name:' sara ',color:'ROJO',quantity:2}]});assert.equal(next.state.products.length,1);assert.equal(next.state.products[0].stock,8)});
test('rechaza cantidades fraccionarias y precios inválidos',()=>{assert.throws(()=>validateEntry({...entry,items:[{...row,quantity:1.5}]}));assert.throws(()=>validateEntry({...entry,items:[{...row,cost:''}]}));assert.throws(()=>validateEntry({...entry,items:[{...row,price:-1}]}))});
test('total de entrada del diseño: 2970 pesos',()=>{assert.equal(totalCost([row,{quantity:2,cost:950},{quantity:4,cost:140}]),2970)});

import {saveDemoProduct,migrateDemoSuppliers} from '../src/domain.js';
const catalogState={entries:[],products:[],suppliers:[{id:'s1',name:'Uno'},{id:'s2',name:'Dos'}]};
test('registrar producto con varios proveedores comienza sin existencias',()=>{const r=saveDemoProduct(catalogState,{...row,id:'p1',stock:500},['s1','s2']);assert.equal(r.product.stock,0);assert.deepEqual(r.product.supplier_ids,['s1','s2'])});
test('editar proveedores no altera existencias ni historial',()=>{const state={...catalogState,products:[{...row,id:'p1',stock:6,supplier_ids:['s1']}],entries:[entry]};const r=saveDemoProduct(state,{...row,id:'p1',stock:999,price:175},['s2']);assert.equal(r.product.stock,6);assert.deepEqual(r.product.supplier_ids,['s2']);assert.deepEqual(r.state.entries,[entry])});
test('rechaza variantes duplicadas y proveedores ajenos',()=>{const r=saveDemoProduct(catalogState,{...row,id:'p1'},['s1']);assert.throws(()=>saveDemoProduct(r.state,{...row,id:'p2',name:' sara '},['s2']));assert.throws(()=>saveDemoProduct(catalogState,{...row,id:'p1'},['otro']));assert.throws(()=>saveDemoProduct(catalogState,{...row,id:'p1'},[]))});
test('recepción suma stock y vincula un proveedor adicional',()=>{const registered=saveDemoProduct(catalogState,{...row,id:'p1'},['s2']).state;const received=applyDemoEntry(registered,entry);assert.equal(received.state.products[0].stock,6);assert.deepEqual(received.state.products[0].supplier_ids,['s2','s1'])});
test('recupera proveedores del historial demo sin modificar existencias',()=>{const old={...catalogState,products:[{...row,id:'p1',stock:6}],entries:[entry]};const upgraded=migrateDemoSuppliers(old);assert.deepEqual(upgraded.products[0].supplier_ids,['s1']);assert.equal(upgraded.products[0].stock,6);assert.equal(old.products[0].supplier_ids,undefined)});
test('migración demo respeta proveedores editados aunque existan entradas antiguas',()=>{const edited={...catalogState,products:[{...row,id:'p1',stock:6,supplier_ids:['s2']}],entries:[entry]};assert.deepEqual(migrateDemoSuppliers(edited).products[0].supplier_ids,['s2'])});
