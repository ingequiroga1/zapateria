import React from 'react';
import {labelName,dateLabel,money} from './domain';
export default function PrintLabels({job}){
 const small=job.size==='a4-30x20',a4=job.size.startsWith('a4'),width=a4?(small?30:60):Number(job.size.split('x')[0]);
 const height=a4?(small?20:40):Number(job.size.split('x')[1]);
 const perPage=small?72:a4?18:1;
 const pages=Array.from({length:Math.ceil(job.labels.length/perPage)},(_,i)=>job.labels.slice(i*perPage,(i+1)*perPage));
 return <><style>{`@media print{@page{size:${a4?'A4':width+'mm '+height+'mm'};margin:${a4?'10mm':'0'}}}`}</style><div className={'print-sheet '+(a4?'a4-pages':'thermal')}>
 {pages.map((labels,page)=><div key={page} className={'label-page '+(small?'small-labels':'')} style={a4?{display:'grid',gridTemplateColumns:`repeat(${small?6:3}, ${width}mm)`,gap:'2mm',alignContent:'start'}:{}}>{labels.map((r,i)=><div className="print-label" key={i} style={{width:width+'mm',height:height+'mm'}}><strong style={small?{fontSize:labelName(r).length>75?'4pt':labelName(r).length>40?'5pt':'6pt'}:{}}>{labelName(r)}</strong><small>Entrada: {dateLabel(r.entry_date)}</small><b>{money(r.price)} MXN</b></div>)}</div>)}
 </div></>;
}
