/* app.js — screens, data model, PDF rendering. Speech/storage/files live in platform.js, understanding in parser.js */
'use strict';
/* ============ helpers ============ */
const $=s=>document.querySelector(s);
const AR='٠١٢٣٤٥٦٧٨٩';
const toAr=s=>String(s??'').replace(/[0-9]/g,d=>AR[d]);
const toEn=s=>String(s??'').replace(/[٠-٩]/g,d=>AR.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const addDays=(iso,n)=>{const d=new Date(iso+'T12:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
const fmtDate=iso=>{if(!iso||iso==='/'||iso==='∅')return'';const m=String(iso).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);if(!m)return toAr(iso);return toAr(`${+m[3]} / ${+m[2]} / ${m[1]}`)+'م'};
const nowHour=()=>{const d=new Date();let h=d.getHours(),p=h<12?'صباحاً':'مساءً';h=h%12||12;return toAr(h+':'+String(d.getMinutes()).padStart(2,'0'))+' '+p};
function toast(t,ms=2600){const e=document.createElement('div');e.className='toast';e.textContent=t;document.body.appendChild(e);setTimeout(()=>e.remove(),ms)}
const uid=()=>'c_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);

/* number to Arabic words */
function w3(n){const o=['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
 const t=['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
 const h=['','مائة','مائتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة'];
 const a=Math.floor(n/100),r=n%100,p=[];if(a)p.push(h[a]);
 if(r){if(r<20)p.push(o[r]);else{const u=r%10,tt=Math.floor(r/10);p.push(u?o[u]+' و'+t[tt]:t[tt])}}return p.join(' و')}
function numWords(n){n=Math.floor(Math.abs(n));if(!n)return'صفر';const S=[[1e9,'مليار','ملياران','مليارات'],[1e6,'مليون','مليونان','ملايين'],[1e3,'ألف','ألفان','آلاف']],p=[];
 for(const[v,s1,s2,pl]of S){const q=Math.floor(n/v);n%=v;if(!q)continue;if(q===1)p.push(s1);else if(q===2)p.push(s2);else if(q<=10)p.push(w3(q)+' '+pl);else p.push(w3(q)+' '+s1)}
 if(n)p.push(w3(n));return p.join(' و')}
const num=v=>{const x=parseFloat(toEn(v).replace(/[,،٬\s]/g,''));return isFinite(x)?x:0};

/* ============ data model ============ */
const FORMS={
 report:{name:'محضر مخالفة أعمال',short:'محضر مخالفة',ic:'📝',col:'#17335f',reg:'سجل محاضر مخالفات البناء'},
 stop:{name:'قرار إيقاف أعمال مخالفة',short:'قرار إيقاف',ic:'✋',col:'#c8811a',reg:'سجل قرارات الإيقاف'},
 removal:{name:'قرار تصحيح / إزالة أعمال مخالفة',short:'قرار إزالة / تصحيح',ic:'🏚️',col:'#b42318',reg:'سجل قرارات الإزالة والتصحيح'}};
const REGIONS={sahara:'صحراء الأهرام',haram:'الهرم'};

/* the six template sets: every set has the three forms (pdf pages 1,2,3) */
const TPLS={
 S1:{region:'sahara',lic:false,name:'بدون ترخيص',desc:'بصب وبناء الدور … بدون ترخيص'},
 S2:{region:'sahara',lic:true,name:'عدم تنفيذ البدروم + البروزات والمناور',desc:'عدم تنفيذ البدروم العلوي وتغيير منسوب السفلي، وزيادة الأبعاد والبروزات وتقليل المناور'},
 S3:{region:'sahara',lic:true,name:'زيادة البروزات وتقليل المناور',desc:'زيادة أبعاد وبروزات المبنى على منطقة الردود وتقليل مسطحات المناور'},
 H1:{region:'haram',lic:false,name:'بدون ترخيص',desc:'بصب وبناء الدور … بدون ترخيص'},
 H2:{region:'haram',lic:true,name:'محاور الأعمدة + المناور والبروز',desc:'تغيير محاور بعض الأعمدة وتقليل مسطحات المناور وزيادة البروز'},
 H3:{region:'haram',lic:true,name:'عدم تنفيذ الردود + محاور الأعمدة',desc:'عدم تنفيذ الردود وتغيير محاور الأعمدة وتقليل المناور وزيادة البروز'}};
const PAGE={report:0,stop:1,removal:2};
const tplsOf=r=>Object.keys(TPLS).filter(k=>TPLS[k].region===r);

/* violation words (used to pick the template automatically from speech) */
const VIOL=[{k:'basement',l:'البدروم'},{k:'projections',l:'البروزات'},{k:'shafts',l:'المناور'},{k:'columns',l:'محاور الأعمدة'},{k:'extraFloor',l:'دور زائد'},
 {k:'roof',l:'سقف'},{k:'height',l:'الارتفاع'},{k:'setback',l:'الردود'},{k:'facade',l:'الواجهات'},{k:'garage',l:'الجراج'},{k:'conv',l:'تحويل'}];
function autoTpl(c){const r=c.region||'sahara',v=new Set(c.violations||[]);
 if(c.licensed===false||v.has('extraFloor')||v.has('roof'))return r==='sahara'?'S1':'H1';
 if(r==='sahara')return v.has('basement')?'S2':'S3';
 return v.has('setback')?'H3':'H2'}
const tplOf=c=>(c.tpl&&TPLS[c.tpl]&&TPLS[c.tpl].region===(c.region||'sahara'))?c.tpl:autoTpl(c);

/* [key,label,type,group] — which ones appear on a page comes from LAYOUTS */
const FIELDS=[
 ['plot','رقم القطعة','text','site'],['street','الشارع','text','site'],['area','المنطقة / المدينة','text','site'],['composed','العقار مكون من','text','site'],
 ['inspDate','تاريخ المعاينة','date','insp'],['inspHour','ساعة المعاينة','text','insp'],
 ['licNo','رقم الترخيص','text','lic'],['licYear','سنة الترخيص','num','lic'],['licDate','تاريخ الترخيص','date','lic'],['licType','نوع الترخيص','text','lic'],
 ['licWorks','الأعمال المرخص بها','text','lic'],['execDate','تاريخ بدء التنفيذ','date','lic'],
 ['ownerName','اسم المالك / المخالف','text','owner'],['ownerNid','الرقم القومي','nid','owner'],['capacity','صفة المخالف','text','owner'],
 ['addrNo','عنوانه: عقار رقم','text','owner'],['addrStreet','عنوانه: شارع','text','owner'],['addrDistrict','عنوانه: حي','text','owner'],
 ['addrArea','عنوانه: منطقة / مدينة','text','owner'],['addrGov','عنوانه: محافظة','text','owner'],
 ['engName','المهندس المشرف','text','eng'],['engNid','رقمه القومي','nid','eng'],['contrName','المقاول المنفذ','text','eng'],['contrNid','رقمه القومي','nid','eng'],
 ['floorOne','الدور','text','viol'],['floorFrom','من الدور','text','viol'],['floorTo','إلى الدور','text','viol'],['floorsCount','عدد الأدوار (للتكلفة)','num','viol'],
 ['areaB','مسطح البدروم (م٢)','num','viol'],['areaM2','المسطح (م٢)','num','viol'],['lawArticles','المواد المخالفة من قانون البناء','text','viol'],
 ['reportRegNo','رقم القيد بسجل المحاضر','text','reg'],['reportRegDate','تاريخ القيد','date','reg'],
 ['stopRegNo','رقم القيد بسجل الإيقاف','text','reg'],['stopRegDate','تاريخ القيد','date','reg'],
 ['removalRegNo','رقم القيد بسجل الإزالة','text','reg'],['removalRegDate','تاريخ القيد','date','reg'],['issueDate','تحريراً في','date','reg'],
 ['stopNo','رقم قرار الإيقاف','text','dec'],['stopDate','تاريخ قرار الإيقاف','date','dec'],['announceDate','تاريخ الإعلان','date','dec'],
 ['reportNo','رقم محضر المخالفة','text','dec'],['reportDate','تاريخ المحضر','date','dec'],
 ['periodFrom','مدة الإزالة: من','date','dec'],['periodTo','مدة الإزالة: إلى','date','dec']];
const FMAP=Object.fromEntries(FIELDS.map(f=>[f[0],f]));
const GROUPS={site:'📍 موقع المخالفة',insp:'🔎 المعاينة',lic:'📄 الترخيص',owner:'👤 المالك / المخالف',eng:'👷 المهندس والمقاول',viol:'⚠️ الأعمال المخالفة',reg:'🗂️ بيانات القيد بالسجل',dec:'⚖️ القرارات المرتبطة'};
const REQ=new Set(['plot','street','ownerName','ownerNid','inspDate','inspHour','licNo','licYear','floorOne','floorFrom','floorTo','areaB','areaM2',
 'floorsCount','reportRegNo','reportRegDate','stopRegNo','stopRegDate','removalRegNo','removalRegDate','stopNo','stopDate','reportNo','reportDate','periodFrom','periodTo']);

const jobS=()=>String(S.jobSuffix||'').replace(/^\s*(ال)?مهندس\s*/,'').trim();
const EMPTY='∅'; // answered: leave blank
const isBlank=v=>{const x=String(v??'').trim();return !x||x===EMPTY};
const DEF_SET={inspector:'',jobSuffix:'مدني',responsible:'',tanzeem:'',gm:'',legal:'',employee:'',price:'',font:'plex',ink:'#111111',autoMic:true,pause:'mid',region:'sahara'};
let S={...DEF_SET};
let CASES=[];
let cur=null; // {form, c}
let screen='home';

function newCase(){const t=today();return{id:uid(),created:Date.now(),updated:Date.now(),licensed:true,violations:[],
 region:S.region||'sahara',tpl:'',area:'',capacity:'مالك',addrGov:'الجيزة',inspDate:t,inspHour:nowHour(),
 reportRegDate:t,stopRegDate:t,removalRegDate:t,issueDate:t,stopDate:'',reportDate:'',periodFrom:t,periodTo:addDays(t,15),done:{}}}

function nextReg(key){let m=0;for(const c of CASES){const v=num(c[key]);if(v>m)m=v}return m?String(m+1):''}
/* fields shown/asked for this form = the blanks that exist on the chosen template page */
function fieldsFor(form,c){c=c||cur.c;const keys=new Set((LAYOUTS[tplOf(c)][form]||[]).map(b=>b.k));if(keys.has('areaM2'))keys.add('floorsCount');for(const h of HANDWRITTEN)keys.delete(h);return FIELDS.filter(f=>keys.has(f[0]))}
function isReq(f,form,c){if(!REQ.has(f[0]))return false;if(f[0]==='street'&&(c.region||'sahara')==='sahara')return false;
 if(['areaM2','areaB'].includes(f[0])&&!S.price&&form!=='report')return true;return true}
const hasVal=(k,c)=>{const h=x=>String(c[x]??'').trim()!=='';if(k==='floorOne')return h('floorOne')||h('floorFrom');if(k==='floorFrom')return h('floorFrom')||h('floorOne');return h(k)};
function missing(form,c){return fieldsFor(form,c).filter(f=>isReq(f,form,c)&&!hasVal(f[0],c)).sort((x,y)=>(y[0]==='floorsCount')-(x[0]==='floorsCount'))}
function emptyOpt(form,c){const req=new Set(missing(form,c).map(f=>f[0]));return fieldsFor(form,c).filter(f=>!req.has(f[0])&&!hasVal(f[0],c))}
const costOf=(a,n=1)=>{const p=num(S.price),x=num(a),f=num(n);return p&&x&&f?Math.round(p*x*f):0};
/* number of floors from the spoken range: الأرضي→الثالث = 4 , الأول→الثاني = 2 */
function floorIdx(s){if(isBlank(s)||s==='/')return null;const f=VParser.parseFloor(String(s));if(f==='البدروم')return -1;if(f==='الأرضي')return 0;const i=VParser.ORD.indexOf(f);return i>=0?i:null}
function floorsFromRange(c){let a=c.floorFrom,b=c.floorTo;
 if(isBlank(a)&&!isBlank(c.floorOne)){const p=String(c.floorOne).split(/\s+(?:حتى|إلى|الى|لحد)\s+/);a=p[0];b=b||p[1]}
 const x=floorIdx(a),y=floorIdx(b);return x!==null&&y!==null?Math.abs(y-x)+1:0}
function syncFloors(c){if(c.floorsManual)return;const n=floorsFromRange(c);c.floorsCount=n?String(n):''}
function cost(c){return costOf(c.areaM2,c.floorsCount)}
function costText(k,wide){if(!k)return'';const n=toAr(k.toLocaleString('en-US').replace(/,/g,'٬'));return wide?`${n} جنيهاً (${numWords(k)} جنيهاً فقط لا غير)`:`${n} جنيهاً`}

/* value printed for a layout key */
function valueFor(k,c,box){
 const v=c[k];
 switch(k){
  case 'employee':return S.employee;case 'inspector':case 'S_inspector':return S.inspector;case 'S_tanzeem':return S.tanzeem;
  case 'S_responsible':return S.responsible;case 'S_gm':return S.gm;case 'S_legal':return S.legal;
  case 'jobSuffix':return jobS();case 'jobFull':return ('مهندس '+jobS()).trim();
  case 'cost':{const k2=cost(c);return k2?costText(k2,box.x1-box.x0>200):''}
  case 'costB':{const k2=costOf(c.areaB);return k2?costText(k2,box.x1-box.x0>200):''}
  case 'costCalc':{const ps=costParts(c);if(!ps.length)return'';return 'حساب التكلفة: '+ps.map(x=>`${x.lab}: ${x.txt} = ${fmtN(x.v)} ج`).join('  +  ')}
  case 'costTotal':{const ps=costParts(c);if(ps.length<2)return'';const tot=ps.reduce((a,x)=>a+x.v,0);return `التكلفة الإجمالية: ${fmtN(tot)} جنيهاً (${numWords(tot)} جنيهاً فقط لا غير)`}
  case 'reflow':return valueFor('floorOne',c,{kind:'span'});
  case 'floorOne':{if(!isBlank(v))return v;const a=c.floorFrom,b=c.floorTo;if(isBlank(a))return v;return(!isBlank(b)&&b!==a)?`${a} حتى ${b}`:a}
  case 'floorFrom':return isBlank(v)&&!isBlank(c.floorOne)?c.floorOne:v;
  case 'areaM2':case 'areaB':return isBlank(v)?v:`${v} م٢`;
  default:return(box.kind==='date')?fmtDate(v):v}}

/* ============ PDF rendering on the real template pages ============ */
const PFONTS={plex:['Plex','آي بي إم بلكس (افتراضي)'],nsans:['NSans','نوتو سانس'],cairo:['Cairo','القاهرة'],tajawal:['Tajawal','تجوال'],amiri:['Amiri','أميري (نسخ كلاسيكي)'],naskh:['Naskh','نوتو نسخ']};
const INKS={'#111111':'أسود','#0b2563':'أزرق غامق'};
let INK='#111111',FONT='"Plex", "Cairo", sans-serif';
function applyPrintStyle(){const f=PFONTS[S.font]||PFONTS.plex;FONT=`"${f[0]}", "Cairo", sans-serif`;INK=INKS[S.ink]?S.ink:'#111111'}
const imgCache={},pdfCache={};
function loadImg(src){return imgCache[src]||(imgCache[src]=new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src}))}
function loadPdf(t){return pdfCache[t]||(pdfCache[t]=fetch(`tpl/${t}.pdf`).then(r=>{if(!r.ok)throw new Error('template '+t);return r.arrayBuffer()}))}
const PW=595.32,PH=841.92, FS=11.5; // page size and base text size (points)
function fitText(ctx,t,x,y,w,size=FS,min=6.5,align='center'){t=toAr(t);ctx.textAlign=align;let s=size;ctx.font=`700 ${s}px ${FONT}`;while(ctx.measureText(t).width>w&&s>min){s-=.25;ctx.font=`700 ${s}px ${FONT}`}
 /* text shrunk to fit a short blank is lifted so it sits in the middle of the line, not on its floor */
 ctx.fillText(t,x,y-(size-s)*0.4)}
/* transparent overlay (in points × scale) holding everything we write on the page */
/* additions on the محضر page: the cost working + grand total in the blank space under the narrative,
   and on S2 the floor blank is too narrow, so that printed line is rewritten further to the right with the floor in it */
const S2_LINE='وزيادة أبعاد وبروزات المبنى متعدياً على منطقة الردود وتقليل مسطحات المناور وذلك بالدور';
const EXTRA={
 S1:{report:[{k:'costCalc',kind:'free',x0:42,x1:553,y:572.5}]},
 S2:{report:[{k:'costCalc',kind:'free',x0:42,x1:553,y:591.5,fs:9},{k:'costTotal',kind:'free',x0:42,x1:553,y:603.5,fs:9},
   {k:'reflow',kind:'reflow',x0:38,x1:553,y:564.3,cover:[38,553.5,430,14],skip:'floorOne'}]},
 S3:{report:[{k:'costCalc',kind:'free',x0:42,x1:553,y:582}]},
 H1:{report:[{k:'costCalc',kind:'free',x0:42,x1:553,y:578.5}]},
 H2:{report:[{k:'costCalc',kind:'free',x0:42,x1:553,y:610.5}]},
 H3:{report:[{k:'costCalc',kind:'free',x0:42,x1:553,y:608.5}]}};
function layoutOf(c,form){const t=tplOf(c),ex=(EXTRA[t]&&EXTRA[t][form])||[];const skip=new Set(ex.map(e=>e.skip).filter(Boolean));
 return LAYOUTS[t][form].filter(b=>!skip.has(b.k)).concat(ex)}
const fmtN=n=>toAr(Math.round(n).toLocaleString('en-US').replace(/,/g,'٬'));
function costParts(c){const p=num(S.price),parts=[];if(!p)return parts;
 const a=num(c.areaM2),f=num(c.floorsCount);if(a&&f)parts.push({lab:'الأدوار',txt:`${fmtN(a)} م٢ × ${toAr(f)} ${f===1?'دور':f===2?'دور':'أدوار'} × ${fmtN(p)}`,v:a*f*p});
 const t=tplOf(c);if(LAYOUTS[t].report.some(b=>b.k==='areaB')){const b=num(c.areaB);if(b)parts.push({lab:'البدروم',txt:`${fmtN(b)} م٢ × ${fmtN(p)}`,v:b*p})}
 return parts}
const HANDWRITTEN=new Set(['inspHour','inspDate','reportRegDate','stopRegDate','removalRegDate']); // left blank on purpose — written by hand
async function drawOverlay(ctx,form,c,covers){ /* covers: array to collect white-out boxes instead of painting them (PDF draws them as vector) */
 const lay=layoutOf(c,form);const slash=(c.region||'sahara')==='sahara';
 ctx.direction='rtl';ctx.textBaseline='alphabetic';
 for(const b of lay){
  if(HANDWRITTEN.has(b.k))continue;
  let v=valueFor(b.k,c,b);if(v===EMPTY)v='';v=v==null?'':String(v).trim();
  const w=b.x1-b.x0,cx=(b.x0+b.x1)/2;
  if(b.kind==='date'){if(!v)continue;const box=[b.x0,b.y-12.5,w,16.5];if(covers)covers.push(box);else{ctx.fillStyle='#fff';ctx.fillRect(...box)}ctx.fillStyle=INK;fitText(ctx,v,cx,b.y,w-2);continue}
  ctx.fillStyle=INK;
  if(b.kind==='free'){if(v)fitText(ctx,v,b.x1,b.y,w,b.fs||9.8,6.5,'right');continue}
  if(b.kind==='reflow'){const[x,y,ww,h]=b.cover;const box=[x,y,ww,h];if(covers)covers.push(box);else{ctx.fillStyle='#fff';ctx.fillRect(...box)}ctx.fillStyle=INK;
   fitText(ctx,S2_LINE+' '+(v||'……'),b.x1,b.y,w,11,6.5,'right');continue}
  if(b.kind==='after'){if(v)fitText(ctx,v,b.x1,b.y-4.4,w,13,6.5,'right');continue} // printed word beside it is a larger font: match its baseline
  const y=(b.kind==='dots'?b.y-1.2:b.y)+(b.dy||0);
  if(v)fitText(ctx,v,cx,y,w-2,b.fs||FS);else if(slash&&!b.k.startsWith('S_')&&b.k!=='employee')fitText(ctx,'/',cx,y,20)}}
async function renderForm(form,c,scale=2){ /* preview: background image + overlay */
 applyPrintStyle();await document.fonts.load(`700 12px ${FONT}`,'أبجد ٠١٢ /');await document.fonts.ready;
 const t=tplOf(c),img=await loadImg(`tpl/${t}-${form}.jpg`);
 const cv=document.createElement('canvas');cv.width=Math.round(PW*scale);cv.height=Math.round(PH*scale);
 const ctx=cv.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,cv.width,cv.height);ctx.scale(scale,scale);
 await drawOverlay(ctx,form,c);return cv}
async function makePdf(form,c){ /* final: the original vector page + a transparent text layer on top */
 applyPrintStyle();await document.fonts.load(`700 12px ${FONT}`,'أبجد ٠١٢ /');await document.fonts.ready;
 const t=tplOf(c),bytes=await loadPdf(t);const{PDFDocument}=window.PDFLib;
 const src=await PDFDocument.load(bytes.slice(0));const out=await PDFDocument.create();
 const[pg]=await out.copyPages(src,[PAGE[form]]);out.addPage(pg);
 const sc=3.2,ov=document.createElement('canvas');ov.width=Math.round(PW*sc);ov.height=Math.round(PH*sc);
 const ctx=ov.getContext('2d');ctx.scale(sc,sc);const covers=[];await drawOverlay(ctx,form,c,covers);
 const png=await out.embedPng(await new Promise(r=>ov.toBlob(b=>b.arrayBuffer().then(r),'image/png')));
 const{width,height}=pg.getSize();const k=height/PH;
 for(const[x,y,w,h]of covers)pg.drawRectangle({x:x*k,y:height-(y+h)*k,width:w*k,height:h*k,color:window.PDFLib.rgb(1,1,1),borderWidth:0});
 pg.drawImage(png,{x:0,y:0,width,height});
 out.setTitle(FORMS[form].name);
 const blob=new Blob([await out.save()],{type:'application/pdf'});
 return{blob,cv:await renderForm(form,c)}}

const APP_VERSION='2.3.1';

/* ============ storage ============ */
async function loadAll(){
 const st=await Plat.store.get('settings');if(st)S={...DEF_SET,...st};
 const cs=await Plat.store.get('cases');CASES=Array.isArray(cs)?cs.sort((a,b)=>b.updated-a.updated):[];
}
async function saveCase(c){c.updated=Date.now();const i=CASES.findIndex(x=>x.id===c.id);if(i>=0)CASES[i]=JSON.parse(JSON.stringify(c));else CASES.unshift(JSON.parse(JSON.stringify(c)));
 CASES.sort((a,b)=>b.updated-a.updated);await Plat.store.set('cases',CASES)}
async function delCase(id){CASES=CASES.filter(c=>c.id!==id);await Plat.store.set('cases',CASES)}
async function saveSettings(){await Plat.store.set('settings',S)}
async function saveDraft(){if(cur)await Plat.store.set('draft',{form:cur.form,c:cur.c,transcript:cur.transcript||''})}
async function clearDraft(){await Plat.store.set('draft',null)}

/* ============ speech glue ============ */
let micOwner=null; // id of the control currently listening
function listen(owner,h){
 if(!Plat.speech.supported){toast('التعرف على الصوت مش مدعوم هنا — افتح من Chrome، أو استخدم مايك الكيبورد 🎤',3500);return false}
 if(Plat.speech.listening){const same=micOwner===owner;Plat.speech.stop();if(same)return false}
 micOwner=owner;
 Plat.speech.start({partial:h.partial,final:h.final,
  state:(s)=>{if(s==='idle'&&micOwner===owner)micOwner=null;h.state&&h.state(s)},
  error:e=>{micOwner=null;toast(e==='not-allowed'?'محتاج إذن الميكروفون — فعّله من إعدادات المتصفح/التطبيق':e==='unavailable'?'خدمة التعرف على الصوت مش موجودة على الموبايل ده (نزّل تطبيق Google)':'المايك وقف — جرب تاني',3500);h.state&&h.state('idle')}});
 return true}
function stopMic(){if(Plat.speech.listening)Plat.speech.stop()}
/* one field by voice: keeps listening through short pauses; finishes after a silence (longer for IDs/dates)
   or as soon as a national ID reaches 14 digits */
const PAUSES={short:1.8,mid:3,long:4.5};
function listenField(owner,key,{show,done,state}){
 let acc='',live='',timer=null,finished=false;
 const t=FMAP[key]?FMAP[key][2]:'text';
 const wait=(PAUSES[S.pause]||3)*1000*(t==='nid'||t==='date'?1.6:1);
 const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);const txt=(acc+' '+live).trim();stopMic();if(txt)done(txt);else state&&state('idle')};
 const arm=()=>{clearTimeout(timer);timer=setTimeout(finish,wait)};
 const digits=()=>VParser.numsOf(acc+' '+live).map(String).join('').replace(/\D/g,'').length;
 return listen(owner,{
  partial:p=>{live=p;show((acc+' '+live).trim());arm();if(t==='nid'&&digits()>=14)finish()},
  final:f=>{acc=(acc+' '+f).trim();live='';show(acc);arm();if(t==='nid'&&digits()>=14)finish()},
  state:s=>{state&&state(s);if(s==='listening'&&!timer)timer=setTimeout(finish,wait+4000);if(s==='idle'&&!finished){finished=true;clearTimeout(timer);const txt=(acc+' '+live).trim();if(txt)done(txt)}}})}

/* ============ understanding (on-device) ============ */
function applyParse(text,c,form){const _r=applyParse0(text,c,form);if(c.floorsCount&&!c.floorsManual&&VParser.parseTranscript(text,form,today()).values.floorsCount)c.floorsManual=true;syncFloors(c);return _r}
function applyParse0(text,c,form){
 const r=VParser.parseTranscript(text,form,today());let n=0;
 for(const[k,v]of Object.entries(r.values)){if(FMAP[k]&&v){c[k]=v;n++}}
 if(r.violations.length){c.violations=[...new Set([...(c.violations||[]),...r.violations])];n+=r.violations.length}
 if(r.licensed!==undefined)c.licensed=r.licensed;
 if(r.values.area){if(/صحرا/.test(r.values.area)){setRegion(c,'sahara')}else setRegion(c,'haram')}
 return n}
const normalizeField=(key,text)=>VParser.normalizeValue(key,text,today())||text.trim();

/* ============ screens ============ */
function go(s){stopMic();screen=s;render();window.scrollTo(0,0);if(['capture','missing','review','guided'].includes(s))saveDraft()}
function render(){({home:vHome,capture:vCapture,guided:vGuided,missing:vMissing,review:vReview,preview:vPreview,cases:vCases,settings:vSettings})[screen]($('#app'))}
const setupNeeded=()=>!S.inspector||!S.tanzeem;

let DRAFT=null;
const regionHint=r=>r==='haram'?'الخانات اللي ما تتملاش هتفضل فاضية':'الخانات اللي ما تتملاش هيتكتب فيها ( / )';
function regionToggle(r,id){return `<div class="card" style="padding:12px"><div class="row" style="justify-content:space-between;margin-bottom:8px"><b style="color:var(--pri)">📍 المنطقة</b><small style="color:var(--mute)">${regionHint(r)}</small></div>
 <div class="sw" id="${id}" style="margin:0">${Object.entries(REGIONS).map(([k,l])=>`<button class="btn ${r===k?'':'sec'}" data-reg="${k}" type="button">${l}</button>`).join('')}</div></div>`}
function setRegion(c,r){c.region=r;if(c.tpl&&TPLS[c.tpl].region!==r)c.tpl='';if(r==='sahara'&&!isBlank(c.area)&&/صحرا/.test(c.area))c.area='';
 for(const f of FIELDS){if(r==='haram'&&c[f[0]]==='/')c[f[0]]=EMPTY;if(r==='sahara'&&c[f[0]]===EMPTY)c[f[0]]='/'}}
/* region + template chooser (shown on capture & review) */
function tplPicker(c,id){const r=c.region||'sahara',t=tplOf(c);
 return `<div class="card" id="${id}" style="padding:12px">
 <div class="sw" style="margin:0 0 10px">${Object.entries(REGIONS).map(([k,l])=>`<button class="btn ${r===k?'':'sec'}" data-reg="${k}" type="button">📍 ${l}</button>`).join('')}</div>
 <div class="row" style="justify-content:space-between;margin-bottom:6px"><b style="color:var(--pri);font-size:14px">النموذج</b><small style="color:var(--mute)">${c.tpl?'اختيارك':'متختار تلقائي من كلامك'}</small></div>
 <div style="display:grid;gap:6px">${tplsOf(r).map(k=>`<button class="tplopt ${k===t?'on':''}" data-tpl="${k}" type="button"><b>${TPLS[k].name}</b><small>${TPLS[k].desc}</small></button>`).join('')}</div>
 <div class="hint" style="text-align:right;margin-top:6px;font-size:12px">${regionHint(r)}</div></div>`}
function bindTplPicker(root,c,after){root.querySelectorAll('[data-reg]').forEach(b=>b.onclick=()=>{setRegion(c,b.dataset.reg);S.region=b.dataset.reg;saveSettings();after()});
 root.querySelectorAll('[data-tpl]').forEach(b=>b.onclick=()=>{c.tpl=b.dataset.tpl;c.licensed=TPLS[c.tpl].lic;after()})}
function vHome(a){
 a.innerHTML=`<header class="top"><h1>مخالفات حي الهرم<span class="sub">إدارة التنظيم — ملء النماذج بالصوت</span></h1>
 <button class="iconbtn" id="bCases" title="القضايا">🗂️</button><button class="iconbtn" id="bSet" title="الإعدادات">⚙️</button></header>
 ${setupNeeded()?`<div class="warn">⚙️ أول مرة؟ ادخل <b>الإعدادات</b> واكتب أسماء الموظفين وسعر المتر مرة واحدة، وهتتملى تلقائي في كل نموذج. <button class="btn ghost" id="bSet2" style="width:auto;display:inline">افتح الإعدادات</button></div>`:''}
 ${DRAFT&&DRAFT.c?`<div class="warn">📝 فيه ${FORMS[DRAFT.form].short} ما خلصش${DRAFT.c.ownerName?' — '+esc(DRAFT.c.ownerName):''}. <button class="btn ghost" id="resume" style="width:auto;display:inline">كمّل</button> <button class="btn ghost" id="drop" style="width:auto;display:inline;color:var(--mute)">تجاهل</button></div>`:''}
 ${regionToggle(S.region||'sahara','hreg')}
 <div class="hint" style="text-align:right;margin:0 2px 10px">هتعمل إيه النهارده؟</div>
 ${Object.entries(FORMS).map(([k,f])=>`<button class="bigbtn" data-f="${k}"><span class="ic" style="background:${f.col}">${f.ic}</span><span><b>${f.name}</b><small>${f.reg}</small></span></button>`).join('')}
 <button class="bigbtn" id="bCases2"><span class="ic" style="background:#5b6b82">🔍</span><span><b>القضايا المحفوظة</b><small>${toAr(CASES.length)} قضية — دور بالاسم أو الرقم القومي أو العنوان</small></span></button>`;
 a.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>startForm(b.dataset.f));
 a.querySelectorAll('#hreg [data-reg]').forEach(b=>b.onclick=()=>{S.region=b.dataset.reg;saveSettings();render()});
 $('#bCases').onclick=$('#bCases2').onclick=()=>go('cases');$('#bSet').onclick=()=>go('settings');if($('#bSet2'))$('#bSet2').onclick=()=>go('settings');
 if($('#resume'))$('#resume').onclick=()=>{cur={form:DRAFT.form,c:DRAFT.c,transcript:DRAFT.transcript||''};DRAFT=null;go('review')};
 if($('#drop'))$('#drop').onclick=()=>{DRAFT=null;clearDraft();render()}}

function startForm(form,c){
 c=c||newCase();if(!c.region)c.region=S.region||'sahara';cur={form,c,transcript:''};DRAFT=null;
 const regK=form+'RegNo';if(!c[regK])c[regK]=nextReg(regK);
 const done=c.done||{};
 if(form==='removal'){if(!c.reportNo&&done.report){c.reportNo=c.reportRegNo;c.reportDate=c.reportDate||c.reportRegDate}
  if(!c.stopNo&&done.stop){c.stopNo=c.stopRegNo;c.stopDate=c.stopDate||c.stopRegDate}}
 if(form==='report'&&!c.stopNo&&done.stop){c.stopNo=c.stopRegNo;c.stopDate=c.stopRegDate}
 go(Object.keys(done).length?'review':'capture')}

const KW_HINT=['قطعة','شارع','المالك','الرقم القومي','عنوانه … شارع … حي … محافظة','ترخيص رقم … لسنة','بدون ترخيص','من الدور … إلى الدور','المسطح','المعاينة النهارده','الساعة','رقم القيد','المهندس','المقاول','التحويل من … إلى'];
let liveTxt='';
function vCapture(a){const f=FORMS[cur.form];const on=micOwner==='cap';
 a.innerHTML=`<header class="top"><button class="iconbtn" id="back">→</button><h1>${f.name}<span class="sub">قول اسم الخانة وبعدها قيمتها</span></h1></header>
 ${tplPicker(cur.c,'ctpl')}
 <div class="micwrap"><button class="mic ${on?'live':''}" id="mic">${on?'■':'🎤'}</button></div>
 <div class="hint">${on?'بيسمعك… اضغط تاني لما تخلص':'اضغط وابدأ الكلام'}</div>
 <div class="card" style="margin-top:14px"><h3>اللي اتقال</h3>
 <textarea id="tr" rows="6" placeholder="مثال: قطعة ٤٥ ل، شارع التقسيم، المالك عبد الله صلاح الدين حسن نايل، الرقم القومي ٢٩٧٠٩٢٤٢١٠٢٧١٦، ترخيص رقم ٥٨ لسنة ٢٠٢٥، عدم تنفيذ الدروم وزيادة البروزات، من الدور الأرضي إلى الدور الرابع، المسطح ١٠٠ متر">${esc(cur.transcript)}</textarea>
 <div class="live-t" id="live">${esc(liveTxt)}</div></div>
 <details class="card"><summary>الكلمات اللي التطبيق بيفهمها</summary><div class="kws">${KW_HINT.map(k=>`<span>${k}</span>`).join('')}</div>
 <div class="hint" style="text-align:right;margin-top:8px">المخالفات بيلقطها من الكلام لوحده (الدروم، البروزات، المناور، الأعمدة، دور زايد، سقف، الجراج…).</div></details>
 <div class="bar"><div class="in"><button class="btn sec" id="guide" style="flex:1">خانة خانة</button><button class="btn" id="go" style="flex:2">وزّع البيانات ←</button></div></div>`;
 const tr=$('#tr');tr.oninput=()=>cur.transcript=tr.value;
 bindTplPicker($('#ctpl'),cur.c,()=>keepScroll(render));
 $('#back').onclick=()=>go('home');
 $('#mic').onclick=()=>{listen('cap',{partial:t=>{liveTxt=t;const l=$('#live');if(l)l.textContent=t},
  final:t=>{liveTxt='';cur.transcript=(cur.transcript+' '+t).trim();const x=$('#tr');if(x)x.value=cur.transcript;const l=$('#live');if(l)l.textContent='';saveDraft()},
  state:()=>{if(screen==='capture')render()}});render()};
 $('#guide').onclick=()=>{gIdx=0;go('guided')};
 $('#go').onclick=()=>{stopMic();setTimeout(()=>{
  if(!cur.transcript.trim()){toast('مفيش كلام لسه — سجّل أو اكتب');return}
  const n=applyParse(cur.transcript,cur.c,cur.form);toast(`اتملت ${toAr(n)} خانة`);
  go(missing(cur.form,cur.c).length||emptyOpt(cur.form,cur.c).length?'missing':'review')},Plat.speech.listening?600:0)}}

/* ---- guided: one field at a time ---- */
let gIdx=0;
function guidedList(){return fieldsFor(cur.form)}
function vGuided(a){const list=guidedList();const c=cur.c;
 if(gIdx>=list.length){go('review');return}
 const f=list[gIdx];const k=f[0];const on=micOwner==='g';
 const showV=v=>f[2]==='date'?fmtDate(v):toAr(v);
 a.innerHTML=`<header class="top"><button class="iconbtn" id="back">→</button><h1>خانة خانة<span class="sub">${FORMS[cur.form].short} — ${toAr(gIdx+1)} من ${toAr(list.length)}</span></h1><button class="iconbtn" id="fin" title="خلصت">✓</button></header>
 <div class="prog"><i style="width:${Math.round(gIdx/list.length*100)}%"></i></div>
 <div class="card"><div class="guide-n">${GROUPS[f[3]]}</div><div class="guide-f">${f[1]}</div>
 <div class="micwrap"><button class="mic small ${on?'live':''}" id="mic">${on?'■':'🎤'}</button></div>
 <div class="live-t" id="live" style="text-align:center"></div>
 <input id="gv" class="guide-v" ${f[2]==='date'&&c[k]!=='/'?'type="date"':''} ${f[2]==='nid'||f[2]==='num'?'inputmode="numeric"':''} value="${esc(c[k]===EMPTY?'':c[k]??'')}" placeholder="${c[k]===EMPTY?'فاضية':'قول أو اكتب'}">
 ${c[k]&&f[2]!=='date'?`<div class="hint" style="margin-top:6px">${esc(showV(c[k]))}</div>`:''}
 <div class="actions"><button class="btn sec" id="prev">→ السابق</button><button class="btn" id="next">التالي ←</button>
 <button class="btn sec" id="na">${c.region==='haram'?'فاضية':'مش موجود ( / )'}</button><button class="btn sec" id="skip">تخطي</button></div></div>
 <div class="hint">بعد ما تقول القيمة، بيروح للخانة اللي بعدها لوحده.</div>`;
 const inp=$('#gv');inp.oninput=()=>{let v=inp.value;if(f[2]==='nid')v=VParser.toEn(v).replace(/\D/g,'');c[k]=v;fieldEdited(c,k)};
 const next=()=>{gIdx++;saveDraft();render();if(Plat.speech.supported&&S.autoMic!==false)setTimeout(()=>{const m=$('#mic');if(screen==='guided'&&micOwner!=='g'&&m)m.click()},250)};
 const startG=()=>listenField('g',k,{show:t=>{const l=$('#live');if(l)l.textContent=t},
  done:t=>{const v=normalizeField(k,t);c[k]=v;fieldEdited(c,k);const i=$('#gv');if(i){if(f[2]==='date'&&v&&!/^\d{4}-/.test(v))i.type='text';i.value=v}const l=$('#live');if(l)l.textContent='';
   setTimeout(next,700)},
  state:s=>{const m=$('#mic');if(m){m.classList.toggle('live',s==='listening');m.textContent=s==='listening'?'■':'🎤'}}});
 $('#mic').onclick=startG;
 $('#next').onclick=next;$('#skip').onclick=next;
 $('#na').onclick=()=>{c[k]=c.region==='haram'?EMPTY:'/';next()};
 $('#prev').onclick=()=>{if(gIdx>0){gIdx--;render()}};
 $('#back').onclick=()=>go('capture');$('#fin').onclick=()=>go('review')}

function fieldInput(f,c,extra=''){const k=f[0],raw=c[k]??'',v=raw===EMPTY?'':raw;const t=f[2];
 const type=t==='date'&&v!=='/'?'date':'text';const im=t==='nid'||t==='num'?'inputmode="numeric"':'';
 return `<label class="f ${extra}"><span>${f[1]}${t==='nid'&&v&&v!=='/'&&String(v).length!==14?' <b style="color:var(--bad)">('+toAr(String(v).length)+' رقم — لازم ١٤)</b>':''}</span>
 <div class="fwrap"><input type="${type}" data-k="${k}" ${im} value="${esc(v)}" ${raw===EMPTY?'placeholder="فاضية"':''}><button class="mic-s" data-mic="${k}" type="button">🎤</button></div></label>`}
function fieldEdited(c,k,root){
 if(k==='floorsCount'){c.floorsManual=!isBlank(c.floorsCount);return}
 if(['floorFrom','floorTo','floorOne'].includes(k)){c.floorsManual=false;syncFloors(c);const i=root&&root.querySelector('input[data-k="floorsCount"]');if(i)i.value=c.floorsCount||''}}
function bindFields(root,c,onChange){
 root.querySelectorAll('input[data-k]').forEach(i=>i.oninput=()=>{let v=i.value;if(FMAP[i.dataset.k][2]==='nid')v=VParser.toEn(v).replace(/\D/g,'');c[i.dataset.k]=v;fieldEdited(c,i.dataset.k,root);onChange&&onChange(i.dataset.k)});
 root.querySelectorAll('[data-mic]').forEach(b=>b.onclick=()=>{const k=b.dataset.mic;const inp=root.querySelector(`input[data-k="${k}"]`);
  const ok=listenField('f_'+k,k,{show:t=>{inp.value='';inp.placeholder=t},done:t=>{inp.placeholder='';const v=normalizeField(k,t);c[k]=v;if(inp.type==='date'&&!/^\d{4}-/.test(v))inp.type='text';inp.value=v;fieldEdited(c,k,root);onChange&&onChange(k)},
   state:s=>{b.textContent=s==='listening'?'⏺':'🎤';b.style.background=s==='listening'?'#fde2e0':''}});
  if(!ok&&!Plat.speech.supported)inp.focus()})}
function chipsHtml(c){return `<div class="chips">${VIOL.map(v=>`<button class="chip ${(c.violations||[]).includes(v.k)?'on':''}" data-v="${v.k}" type="button">${v.l}</button>`).join('')}</div>`}
function bindChips(root,c,after){root.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{const s=new Set(c.violations||[]);s.has(b.dataset.v)?s.delete(b.dataset.v):s.add(b.dataset.v);c.violations=[...s];b.classList.toggle('on');after&&after()})}

function vMissing(a){const c=cur.c,m=missing(cur.form,c),o=emptyOpt(cur.form,c);
 if(!m.length&&!o.length){go('review');return}
 const H=c.region==='haram',NA=H?EMPTY:'/',NAL=H?'سيبها فاضية':'مش موجود ( / )';
 const optHtml=f=>`<div class="optf">${fieldInput(f,c)}<button class="btn ghost na" data-na="${f[0]}" type="button">${NAL}</button></div>`;
 a.innerHTML=`<header class="top"><button class="iconbtn" id="back">→</button><h1>كمّل الناقص<span class="sub">${m.length?toAr(m.length)+' مطلوب · ':''}${toAr(o.length)} خانة تانية فاضية</span></h1></header>
 ${m.length?`<div class="card miss"><h3>مطلوب</h3>${m.map(f=>fieldInput(f,c)).join('')}</div>`:''}
 ${o.length?`<div class="card"><h3>باقي خانات الورقة (${toAr(o.length)})</h3><div class="hint" style="text-align:right;margin-bottom:8px">قولها أو اكتبها. ${H?'اللي مش موجود سيبه — هيفضل فاضي في الورقة (منطقة الهرم).':'اللي مش موجود اضغط "مش موجود" وهيتكتب فيها ( / ) زي الورق.'}</div>${o.map(optHtml).join('')}
 <button class="btn sec" id="allna">${H?'سيب الباقي فاضي':'كل الباقي مش موجود ( / )'}</button></div>`:''}
 <div class="bar"><div class="in"><button class="btn sec" id="guide" style="flex:1">خانة خانة</button><button class="btn" id="ok" style="flex:2">راجع الكل ←</button></div></div>`;
 bindFields(a,c);
 a.querySelectorAll('[data-na]').forEach(b=>b.onclick=()=>{const k=b.dataset.na;c[k]=NA;const i=a.querySelector(`input[data-k="${k}"]`);if(i){i.type='text';i.value=H?'':'/';i.placeholder=H?'فاضية':''}b.textContent=H?'✓ فاضية':'✓ مش موجود'});
 if($('#allna'))$('#allna').onclick=()=>{o.forEach(f=>{if(!String(c[f[0]]??'').trim())c[f[0]]=NA});go('review')};
 $('#back').onclick=()=>go('capture');$('#ok').onclick=()=>go('review');
 $('#guide').onclick=()=>{const list=guidedList();gIdx=Math.max(0,list.findIndex(f=>!String(c[f[0]]??'').trim()));go('guided')}}

function vReview(a){const c=cur.c,form=cur.form,fs=fieldsFor(form),miss=new Set(missing(form,c).map(f=>f[0]));
 const groups={};for(const f of fs)(groups[f[3]]=groups[f[3]]||[]).push(f);
 const grpHtml=g=>{const list=groups[g]||[];
  const mc=list.filter(f=>miss.has(f[0])).length;const ec=list.filter(f=>!String(c[f[0]]??'').trim()).length;
  return `<details class="card" ${mc||g==='site'||g==='owner'||g==='viol'?'open':''}><summary>${GROUPS[g]}${mc?`<span class="cnt">${toAr(mc)} ناقص</span>`:ec?`<span class="cnt" style="background:#9aa3b2">${toAr(ec)} فاضي</span>`:''}</summary>
  ${list.map(f=>fieldInput(f,c,miss.has(f[0])?'miss':'')).join('')}
  ${g==='viol'?`<div class="cost" id="cost">${costHtml(c)}</div>`:''}</details>`};
 a.innerHTML=`<header class="top"><button class="iconbtn" id="back">→</button><h1>مراجعة البيانات<span class="sub">${FORMS[form].name}</span></h1><button class="iconbtn" id="more" title="إضافة بالصوت">🎤</button></header>
 ${tplPicker(c,'rtpl')}
 ${miss.size?`<div class="warn">فيه ${toAr(miss.size)} خانة مهمة فاضية (متعلّمة بالبرتقاني). تقدر تكمّل بيها أو من غيرها.</div>`:''}
 ${['site','owner','viol','insp','lic','eng','reg','dec'].filter(g=>groups[g]).map(grpHtml).join('')}
 <div class="bar"><div class="in"><button class="btn ok" id="prev">معاينة الـ PDF ←</button></div></div>`;
 bindTplPicker($('#rtpl'),c,()=>keepScroll(render));
 bindFields(a,c,()=>{const ce=$('#cost');if(ce)ce.innerHTML=costHtml(c)});
 $('#back').onclick=()=>go(c.done&&Object.keys(c.done).length?'cases':'capture');
 $('#more').onclick=()=>{cur.transcript='';go('capture')};
 $('#prev').onclick=()=>go('preview')}
function costHtml(c){if(!S.price)return 'حط <b>سعر المتر</b> في الإعدادات عشان التكلفة تتحسب لوحدها.';
 const line=(lab,a,n)=>{const k=costOf(a,n||1);return k?`${lab}${toAr(a)} م٢${n?' × '+toAr(n)+' '+(num(n)===1?'دور':num(n)===2?'دورين':'أدوار'):''} × ${toAr(num(S.price).toLocaleString('en-US'))} = <b>${toAr(k.toLocaleString('en-US'))} جنيه</b><br><small>${numWords(k)} جنيهاً فقط لا غير</small>`:''};
 const t=[!isBlank(c.areaM2)&&isBlank(c.floorsCount)?'<b style="color:var(--bad)">اكتب عدد الأدوار عشان التكلفة تتحسب</b>':line('',c.areaM2,c.floorsCount),fieldsFor(cur.form,c).some(f=>f[0]==='areaB')?line('البدروم: ',c.areaB):''].filter(Boolean);
 const ps=costParts(c);if(ps.length>1){const tot=ps.reduce((a,x)=>a+x.v,0);t.push(`<b>الإجمالي: ${fmtN(tot)} جنيه</b><br><small>${numWords(tot)} جنيهاً فقط لا غير</small>`)}
 return t.length?t.join('<hr style="border:0;border-top:1px dashed var(--acc)">'):`سعر المتر: ${toAr(num(S.price).toLocaleString('en-US'))} جنيه — اكتب المسطح وهتتحسب التكلفة.`}
function keepScroll(fn){const y=window.scrollY;fn();window.scrollTo(0,y)}

let lastPdf=null,lastName='';
const pdfName=(form,c)=>`${FORMS[form].short} - قطعة ${c.plot||''} - ${(c.ownerName||'').split(' ').slice(0,2).join(' ')}.pdf`;
async function vPreview(a){const c=cur.c,form=cur.form;
 a.innerHTML=`<header class="top"><button class="iconbtn" id="back">→</button><h1>المعاينة<span class="sub">${FORMS[form].name}</span></h1></header><div class="spin"></div><div class="hint">بجهّز النموذج…</div>`;
 $('#back').onclick=()=>go('review');
 try{const{blob,cv}=await makePdf(form,c);lastPdf=blob;lastName=pdfName(form,c);if(screen!=='preview')return;
  const url=cv.toDataURL('image/jpeg',0.8);
  a.innerHTML=`<header class="top"><button class="iconbtn" id="back">→</button><h1>المعاينة<span class="sub">راجع الورقة قبل الحفظ</span></h1></header>
  <div class="prev"><img src="${url}" alt="معاينة"></div>
  <div class="bar"><div class="in"><button class="btn sec" id="edit" style="flex:1">تعديل</button><button class="btn ok" id="save" style="flex:2">✓ تأكيد وحفظ</button></div></div>`;
  $('#back').onclick=$('#edit').onclick=()=>go('review');
  $('#save').onclick=async()=>{const b=$('#save');b.disabled=true;
   c.done=c.done||{};c.done[form]=today();
   if(form==='report'&&!c.reportNo){c.reportNo=c.reportRegNo;c.reportDate=c.reportRegDate}
   if(form==='stop'&&!c.stopNo){c.stopNo=c.stopRegNo;c.stopDate=c.stopRegDate}
   await saveCase(c);await clearDraft();
   let where='';try{const r=await Plat.files.save(lastPdf,lastName);where=r.where}catch(e){toast('مقدرتش أحفظ الملف: '+(e.message||e),3500)}
   showAfterSave(a,form,c,where)}}
 catch(e){a.innerHTML+=`<div class="warn">حصلت مشكلة في تجهيز الـ PDF: ${esc(e&&e.message||e)}</div>`}}
function showAfterSave(a,form,c,where){const others=Object.keys(FORMS).filter(k=>k!==form);
 const bar=a.querySelector('.bar');if(bar)bar.remove();
 const d=document.createElement('div');d.className='card';d.style.marginTop='12px';
 d.innerHTML=`<h3>✓ القضية اتحفظت${where?' — والملف في '+where:''}</h3>
 <div class="actions" style="margin-bottom:12px"><button class="btn ok" id="share">📤 إرسال (واتساب…)</button><button class="btn" id="print">🖨️ فتح للطباعة</button></div>
 <div class="hint" style="text-align:right;margin-bottom:10px">تعمل نموذج تاني لنفس القضية؟ البيانات هتتنقل لوحدها.</div>
 ${others.map(k=>`<button class="bigbtn" data-o="${k}" style="background:#f7f5f0"><span class="ic" style="background:${FORMS[k].col}">${FORMS[k].ic}</span><span><b>${FORMS[k].name}</b>${c.done&&c.done[k]?'<small>اتعمل قبل كده</small>':''}</span></button>`).join('')}
 <button class="btn sec" id="home">الرئيسية</button>`;
 a.appendChild(d);d.scrollIntoView({behavior:'smooth'});
 d.querySelectorAll('[data-o]').forEach(b=>b.onclick=()=>startForm(b.dataset.o,JSON.parse(JSON.stringify(c))));
 $('#home').onclick=()=>go('home');
 $('#share').onclick=()=>Plat.files.share(lastPdf,lastName).catch(e=>{if(e&&e.name!=='AbortError')toast('الإرسال اتلغى')});
 $('#print').onclick=()=>Plat.files.open(lastPdf,lastName).catch(e=>toast('مفيش برنامج يفتح PDF — نزّل Google Drive أو أي قارئ PDF',3500))}

let q='';
function vCases(a){
 const norm=s=>VParser.fold(VParser.toEn(String(s||''))).toLowerCase();
 const nq=norm(q).trim();
 const list=CASES.filter(c=>!nq||norm([c.ownerName,c.ownerNid,c.plot,c.street,c.addrStreet,c.addrNo,c.addrArea,c.area,c.reportRegNo,c.stopRegNo,c.removalRegNo].join(' ')).includes(nq));
 a.innerHTML=`<header class="top"><button class="iconbtn" id="back">→</button><h1>القضايا المحفوظة<span class="sub">${toAr(CASES.length)} قضية</span></h1></header>
 <input id="q" placeholder="🔍 دور بالاسم أو الرقم القومي أو القطعة أو العنوان" value="${esc(q)}" style="margin-bottom:12px">
 ${list.length?list.map(c=>`<div class="card case" data-id="${c.id}"><b>${esc(c.ownerName||'بدون اسم')}</b>
  <div class="meta">قطعة ${esc(toAr(c.plot||'—'))} · ${esc(c.street||'')} ${c.ownerNid&&c.ownerNid!=='/'?'· '+toAr(c.ownerNid):''}</div>
  <div style="margin-top:6px">${Object.keys(FORMS).map(k=>`<span class="tag ${c.done&&c.done[k]?'done':''}">${c.done&&c.done[k]?'✓ ':''}${FORMS[k].short}</span>`).join('')}</div>
  <div class="case-act" style="display:none;margin-top:10px">${Object.keys(FORMS).map(k=>`<button class="btn ${c.done&&c.done[k]?'sec':''}" data-mk="${k}" style="margin-bottom:6px">${FORMS[k].ic} ${c.done&&c.done[k]?'فتح / تعديل':'اعمل'} ${FORMS[k].short}</button>`).join('')}
  <button class="btn ghost" data-del="1" style="color:var(--bad)">حذف القضية</button></div></div>`).join(''):`<div class="hint" style="margin-top:30px">${CASES.length?'مفيش نتايج':'لسه مفيش قضايا محفوظة'}</div>`}`;
 $('#back').onclick=()=>go('home');
 const qi=$('#q');qi.oninput=()=>{q=qi.value;const p=qi.selectionStart;render();const n=$('#q');n.focus();n.setSelectionRange(p,p)};
 a.querySelectorAll('.case').forEach(el=>{const c=CASES.find(x=>x.id===el.dataset.id);
  el.onclick=e=>{if(e.target.closest('button'))return;const ac=el.querySelector('.case-act');ac.style.display=ac.style.display==='none'?'block':'none'};
  el.querySelectorAll('[data-mk]').forEach(b=>b.onclick=()=>startForm(b.dataset.mk,JSON.parse(JSON.stringify(c))));
  el.querySelector('[data-del]').onclick=e=>{const b=e.target;if(b.dataset.sure){delCase(c.id).then(render)}else{b.dataset.sure=1;b.textContent='متأكد؟ اضغط تاني للحذف'}}})}

function vSettings(a){
 const F=[['inspector','المهندس القائم بالمعاينة / محرر المحضر'],['jobSuffix','التخصص فقط (كلمة مهندس مطبوعة) — مثل: مدني'],['responsible','المهندس المسئول'],['tanzeem','مدير التنظيم'],['gm','مدير عام الإدارات الهندسية'],['legal','مدير الشئون القانونية'],['employee','الموظف المسئول عن السجل']];
 a.innerHTML=`<header class="top"><button class="iconbtn" id="back">→</button><h1>الإعدادات<span class="sub">بتتحفظ مرة واحدة وتتملى في كل نموذج</span></h1></header>
 <div class="card"><h3>👥 الأسماء</h3>${F.map(([k,l])=>`<label class="f"><span>${l}</span><input data-s="${k}" value="${esc(S[k])}"></label>`).join('')}</div>
 <div class="card"><h3>💰 التكلفة</h3><label class="f"><span>سعر المتر المربع (جنيه)</span><input data-s="price" inputmode="numeric" value="${esc(S.price)}"></label>
 <div class="hint" style="text-align:right">التكلفة = المسطح × سعر المتر، وبتتكتب أرقام وحروف في المحضر.</div></div>
 <div class="card"><h3>🖋️ شكل الكتابة في الورقة</h3>
 <div class="chips">${Object.entries(PFONTS).map(([k,[fam,l]])=>`<button class="chip ${(S.font||'plex')===k?'on':''}" data-font="${k}" style="font-family:'${fam}',Cairo;font-weight:700">${l}</button>`).join('')}</div>
 <div id="fprev" style="margin:12px 0;padding:12px;border:1px solid var(--line);border-radius:12px;background:#fff;font-size:20px;font-weight:700;line-height:1.8"></div>
 <div class="chips">${Object.entries(INKS).map(([k,l])=>`<button class="chip ${(S.ink||'#111111')===k?'on':''}" data-ink="${k}"><span style="color:${k}">●</span> ${l}</button>`).join('')}</div>
 <div class="hint" style="text-align:right;margin-top:12px">الخانات الفاضية: في <b>صحراء الأهرام</b> يتكتب فيها ( / )، وفي <b>الهرم</b> تفضل فاضية. بتختار المنطقة من أول شاشة.</div>
 <div style="margin-top:12px;font-size:14px">المايك يستنى قد إيه لما تسكت قبل ما يقفل الخانة:</div>
 <div class="chips" style="margin-top:6px">${[['short','قصير'],['mid','متوسط'],['long','طويل']].map(([k,l])=>`<button class="chip ${(S.pause||'mid')===k?'on':''}" data-pause="${k}">${l}</button>`).join('')}</div>
 <label class="row" style="margin-top:8px;font-size:14px"><input type="checkbox" id="autoMic" style="width:auto" ${S.autoMic!==false?'checked':''}> في وضع "خانة خانة" المايك يفتح لوحده</label></div>
 
 <div class="card"><h3>💾 نسخة احتياطية</h3><div class="hint" style="text-align:right;margin-bottom:10px">القضايا محفوظة على الموبايل ده بس. اعمل نسخة احتياطية كل فترة وابعتها لنفسك.</div>
 <div class="actions"><button class="btn sec" id="exp">تصدير</button><button class="btn sec" id="imp">استيراد</button></div><input type="file" id="impf" accept=".json,application/json" style="display:none"></div>
 <div class="hint">الإصدار ${APP_VERSION}${Plat.NATIVE?' · تطبيق أندرويد':''}</div>
 <div class="bar"><div class="in"><button class="btn" id="save">حفظ</button></div></div>`;
 a.querySelectorAll('[data-s]').forEach(i=>i.oninput=()=>{S[i.dataset.s]=i.dataset.s==='price'?VParser.toEn(i.value):i.value});
 const fp=()=>{const f=PFONTS[S.font]||PFONTS.plex;const e=$('#fprev');e.style.fontFamily=`'${f[0]}',Cairo`;e.style.color=INKS[S.ink]?S.ink:'#111';e.textContent='عبد الله صلاح الدين حسن نايل — قطعة ٤٥ل — ٢٩٧٠٩٢٤٢١٠٢٧١٦'};fp();
 a.querySelectorAll('[data-font]').forEach(b=>b.onclick=()=>{S.font=b.dataset.font;a.querySelectorAll('[data-font]').forEach(x=>x.classList.toggle('on',x===b));fp()});
 a.querySelectorAll('[data-ink]').forEach(b=>b.onclick=()=>{S.ink=b.dataset.ink;a.querySelectorAll('[data-ink]').forEach(x=>x.classList.toggle('on',x===b));fp()});
  a.querySelectorAll('[data-pause]').forEach(b=>b.onclick=()=>{S.pause=b.dataset.pause;a.querySelectorAll('[data-pause]').forEach(x=>x.classList.toggle('on',x===b))});$('#autoMic').onchange=e=>S.autoMic=e.target.checked;
 $('#exp').onclick=async()=>{const blob=new Blob([JSON.stringify({app:'haram-violations',v:1,at:new Date().toISOString(),settings:S,cases:CASES},null,1)],{type:'application/json'});
  const name=`نسخة احتياطية مخالفات ${today()}.json`;try{await Plat.files.share(blob,name,'application/json')}catch(e){}};
 $('#imp').onclick=()=>$('#impf').click();
 $('#impf').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const o=JSON.parse(await f.text());if(!Array.isArray(o.cases))throw 0;
  const ids=new Set(CASES.map(c=>c.id));let n=0;for(const c of o.cases)if(!ids.has(c.id)){CASES.push(c);n++}
  if(o.settings&&setupNeeded())S={...DEF_SET,...o.settings};await Plat.store.set('cases',CASES);await saveSettings();toast(`اتضاف ${toAr(n)} قضية`);render()}catch(x){toast('الملف ده مش نسخة احتياطية صحيحة')}};
 $('#back').onclick=async()=>{await saveSettings();go('home')};$('#save').onclick=async()=>{await saveSettings();toast('اتحفظ ✓');go('home')}}

/* ============ boot ============ */
window.__render=async(form,c,s)=>{if(s)Object.assign(S,s);const cv=await renderForm(form,c,1.6);return cv.toDataURL('image/jpeg',.85)};
window.__app={applyParse,tplOf,get S(){return S},get CASES(){return CASES}};
(async()=>{render();await loadAll();try{const d=await Plat.store.get('draft');if(d&&d.c)DRAFT=d}catch(e){}render();
 if('serviceWorker' in navigator&&!Plat.NATIVE&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stopMic();saveDraft()}})})();
