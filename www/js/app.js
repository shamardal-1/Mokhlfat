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
const fmtDate=iso=>{if(!iso||iso==='/')return'';const m=String(iso).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);if(!m)return toAr(iso);return toAr(`${+m[3]} / ${+m[2]} / ${m[1]}`)+'م'};
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
const FK={report:'r',stop:'s',removal:'x'};

const VIOL=[
 {k:'conv',l:'تحويل استخدام',t:'عمل تعديلات معمارية بغرض التحويل من {convFrom} إلى {convTo}'},
 {k:'basement',l:'عدم تنفيذ الدروم',t:'عدم تنفيذ الدروم العلوي والسفلي'},
 {k:'projections',l:'زيادة الأبعاد والبروزات',t:'زيادة أبعاد وبروزات المبنى'},
 {k:'shafts',l:'تقليل المناور',t:'تقليل مسطحات المناور'},
 {k:'columns',l:'تغيير محاور الأعمدة',t:'تغيير محاور بعض الأعمدة'},
 {k:'extraFloor',l:'صب وبناء دور زائد',t:'صب وبناء دور زائد عن المرخص به'},
 {k:'roof',l:'صب سقف',t:'صب سقف بدون ترخيص'},
 {k:'height',l:'تجاوز الارتفاع',t:'تجاوز قيود الارتفاع المسموح بها'},
 {k:'setback',l:'عدم ترك الردود',t:'عدم ترك الردود القانونية'},
 {k:'facade',l:'تعديل الواجهات',t:'تعديل الواجهات بالمخالفة للرسومات المعتمدة'},
 {k:'garage',l:'إلغاء الجراج',t:'إلغاء الجراج المخصص لانتظار السيارات'}];

/* [key,label,type,forms,required-forms,group] */
const FIELDS=[
 ['plot','رقم القطعة','text','rsx','rsx','site'],
 ['street','الشارع','text','rsx','rsx','site'],
 ['area','المنطقة','text','sx','sx','site'],
 ['composed','العقار مكون من','text','s','','site'],
 ['inspDate','تاريخ المعاينة','date','rs','rs','insp'],
 ['inspHour','ساعة المعاينة','text','rs','rs','insp'],
 ['licNo','رقم الترخيص','text','rsx','rsx','lic'],
 ['licYear','سنة الترخيص','num','rx','rx','lic'],
 ['licDate','تاريخ الترخيص','date','sx','','lic'],
 ['licType','نوع الترخيص','text','x','','lic'],
 ['licWorks','الأعمال المرخص بها','text','sx','','lic'],
 ['execDate','تاريخ بدء التنفيذ','date','s','','lic'],
 ['ownerName','اسم المالك / المخالف','text','rsx','rsx','owner'],
 ['ownerNid','الرقم القومي','nid','rsx','rsx','owner'],
 ['capacity','صفة المخالف','text','r','','owner'],
 ['addrNo','عنوانه: عقار رقم','text','rx','','owner'],
 ['addrStreet','عنوانه: شارع','text','rx','','owner'],
 ['addrDistrict','عنوانه: حي','text','rx','','owner'],
 ['addrArea','عنوانه: منطقة / مدينة','text','rx','','owner'],
 ['addrGov','عنوانه: محافظة','text','rx','','owner'],
 ['engName','المهندس المشرف','text','sx','','eng'],
 ['engNid','رقمه القومي','nid','sx','','eng'],
 ['contrName','المقاول المنفذ','text','sx','','eng'],
 ['contrNid','رقمه القومي','nid','sx','','eng'],
 ['convFrom','التحويل من','text','rsx','','viol'],
 ['convTo','التحويل إلى','text','rsx','','viol'],
 ['floorFrom','من الدور','text','rsx','','viol'],
 ['floorTo','إلى الدور','text','rsx','','viol'],
 ['areaM2','المسطح (م٢)','num','rsx','r','viol'],
 ['lawArticles','المواد المخالفة من قانون البناء','text','r','','viol'],
 ['reportRegNo','رقم القيد بسجل المحاضر','text','r','r','reg'],
 ['reportRegDate','تاريخ القيد','date','r','r','reg'],
 ['stopRegNo','رقم القيد بسجل الإيقاف','text','s','s','reg'],
 ['stopRegDate','تاريخ القيد','date','s','s','reg'],
 ['removalRegNo','رقم القيد بسجل الإزالة','text','x','x','reg'],
 ['removalRegDate','تاريخ القيد','date','x','x','reg'],
 ['issueDate','تحريراً في','date','s','','reg'],
 ['stopNo','رقم قرار الإيقاف','text','rx','x','dec'],
 ['stopDate','تاريخ قرار الإيقاف','date','rx','x','dec'],
 ['announceDate','تاريخ الإعلان','date','x','','dec'],
 ['reportNo','رقم محضر المخالفة','text','x','x','dec'],
 ['reportDate','تاريخ المحضر','date','x','x','dec'],
 ['periodFrom','مدة الإزالة: من','date','x','x','dec'],
 ['periodTo','مدة الإزالة: إلى','date','x','x','dec']];
const FMAP=Object.fromEntries(FIELDS.map(f=>[f[0],f]));
const GROUPS={site:'📍 موقع المخالفة',insp:'🔎 المعاينة',lic:'📄 الترخيص',owner:'👤 المالك / المخالف',eng:'👷 المهندس والمقاول',viol:'⚠️ الأعمال المخالفة',reg:'🗂️ بيانات القيد بالسجل',dec:'⚖️ القرارات المرتبطة'};

const jobS=()=>String(S.jobSuffix||'').replace(/^\s*(ال)?مهندس\s*/,'').trim();
const DEF_SET={inspector:'',jobSuffix:'مدني',responsible:'',tanzeem:'',gm:'',legal:'',employee:'',price:'',defArea:'صحراء الأهرام',defStreet:'التقسيم',font:'plex',ink:'#111111',slash:true,autoMic:true};
let S={...DEF_SET};
let CASES=[];
let cur=null; // {form, c}
let screen='home';

function newCase(){const t=today();return{id:uid(),created:Date.now(),updated:Date.now(),licensed:true,violations:[],violCustom:'',
 area:S.defArea||'صحراء الأهرام',capacity:'مالك',addrGov:'الجيزة',inspDate:t,inspHour:nowHour(),
 reportRegDate:t,stopRegDate:t,removalRegDate:t,issueDate:t,stopDate:'',reportDate:'',periodFrom:t,periodTo:addDays(t,15),paraOv:{},done:{}}}

function nextReg(key){let m=0;for(const c of CASES){const v=num(c[key]);if(v>m)m=v}return m?String(m+1):''}
function fieldsFor(form){const k=FK[form];return FIELDS.filter(f=>f[3].includes(k))}
function isReq(f,form,c){if(!f[4].includes(FK[form]))return false;if(['licNo','licYear'].includes(f[0])&&c.licensed===false)return false;if(f[0]==='areaM2'&&!S.price)return false;return true}
function missing(form,c){const m=fieldsFor(form).filter(f=>isReq(f,form,c)&&!String(c[f[0]]??'').trim());
 if(!(c.violations||[]).length&&!String(c.violCustom||'').trim())m.push(['__viol','نوع المخالفة','viol','rsx','rsx','viol']);
 if((c.violations||[]).includes('conv')){for(const k of['convFrom','convTo'])if(!c[k]&&!m.find(x=>x[0]===k))m.push(FMAP[k])}
 return m}
function emptyOpt(form,c){const req=new Set(missing(form,c).map(f=>f[0]));
 return fieldsFor(form).filter(f=>!req.has(f[0])&&!String(c[f[0]]??'').trim()&&!(c.licensed===false&&f[5]==='lic')&&!(['convFrom','convTo'].includes(f[0])&&!(c.violations||[]).includes('conv')))}
function cost(c){const p=num(S.price),a=num(c.areaM2);return p&&a?Math.round(p*a):0}

/* compose the violation narrative */
function stripDor(s){return String(s||'').trim().replace(/^الدور\s+/,'')}
function compose(form,c){
 if(c.paraOv&&c.paraOv[form])return c.paraOv[form];
 c={...c};for(const k in c)if(c[k]==='/')c[k]='';
 const items=(c.violations||[]).map(k=>VIOL.find(v=>v.k===k)).filter(Boolean).map(v=>v.t.replace('{convFrom}',c.convFrom||'....').replace('{convTo}',c.convTo||'....'));
 const cu=String(c.violCustom||'').trim();if(cu)items.push(cu.replace(/^ب/,''));
 const body=items.length?'ب'+items.join(' و'):'';
 const lic=c.licensed!==false;
 const licTxt=`الرسومات الهندسية للترخيص رقم ${c.licNo||'....'}${c.licYear?' لسنة '+c.licYear:''}`;
 const ff=stripDor(c.floorFrom),ft=stripDor(c.floorTo);
 let fl='';if(ff&&ft&&ff!==ft)fl=` وذلك من الدور ${ff} إلى الدور ${ft}`;else if(ff||ft)fl=` وذلك بالدور ${ff||ft}`;
 const ar=c.areaM2?` وبمسطح حوالي ${c.areaM2} م٢`:'';
 const law='قانون البناء رقم ١١٩ لسنة ٢٠٠٨ ولائحته التنفيذية';
 let s;
 if(form==='stop'){
  s=(lic?licTxt:'قانون البناء رقم ١١٩ لسنة ٢٠٠٨ بالبناء بدون ترخيص')+(body?' وذلك '+body:'')+fl+ar+' وذلك يستوجب إيقاف العمل.';
 }else{
  s=(lic?'قام المخالف بمخالفة '+licTxt+(body?' وذلك '+body:''):'قام المخالف بالبناء بدون ترخيص'+(body?' و'+body.replace(/^ب/,'ب'):''))+fl+ar;
  if(form==='report'){const k=cost(c);if(k)s+=` وبتكلفة إجمالية حوالي ${k.toLocaleString('en-US').replace(/,/g,'٬')} جنيهاً (${numWords(k)} جنيهاً فقط لا غير)`;s+=' وذلك مخالفاً ل'+law+'.'}
  else s+=' وذلك مخالفاً ل'+law+'، مما يستوجب إزالة الأعمال وما يستجد من أعمال.';
 }
 return toAr(s.replace(/\s+/g,' '));
}

/* ============ PDF layouts (coords on 1066×1600 template) ============ */
const seg=(y,x1,x2)=>({x:x2-4,cx:(x1+x2)/2,y:y-5,w:x2-x1-10});
/* date box: x-range + label baseline */
const cov=(x1,x2,b)=>({cover:[x1,b-22,x2,b+12],b});
const L={
 report:{img:'tpl/report.jpg',items:[
  [seg(154,114,224),c=>c.reportRegNo],[cov(116,302,182),c=>fmtDate(c.reportRegDate)],[seg(214,124,241),()=>S.employee],
  [cov(676,838,314),c=>fmtDate(c.inspDate)],[seg(318,150,294),c=>c.inspHour],[seg(360,395,750),()=>S.inspector],
  [{x:224,y:354,w:100,noSlash:true},()=>jobS()],
  [seg(403,409,511),c=>c.licensed===false?'بدون':c.licNo],[seg(403,246,355),c=>c.licensed===false?'':c.licYear],
  [seg(447,513,902),c=>c.ownerName],[seg(447,155,408),c=>c.ownerNid],[seg(491,682,753),c=>c.capacity],
  [seg(577,765,875),c=>c.addrNo],[seg(577,118,620),c=>c.addrStreet],[seg(620,764,928),c=>c.addrDistrict],[seg(620,403,579),c=>c.addrArea],[seg(620,120,280),c=>c.addrGov],
  [seg(708,642,870),c=>c.plot],[seg(708,126,536),c=>c.street],
  [{para:[96,1058,966,1176]},c=>compose('report',c)],
  [seg(1194,337,470),c=>c.lawArticles],[seg(1221,306,401),c=>c.stopNo],[cov(104,227,1220),c=>fmtDate(c.stopDate)],
  [seg(1430,673,901),()=>S.inspector],[seg(1430,289,520),()=>S.tanzeem]]},
 stop:{img:'tpl/stop.jpg',items:[
  [seg(156,130,240),c=>c.stopRegNo],[cov(124,292,184),c=>fmtDate(c.stopRegDate)],[seg(215,135,252),()=>S.employee],
  [cov(686,851,338),c=>fmtDate(c.inspDate)],[seg(340,239,382),c=>c.inspHour],
  [seg(385,471,749),()=>S.inspector],[seg(385,257,388),()=>('مهندس '+jobS()).trim()],
  [{para:[112,446,964,522]},c=>compose('stop',c)],
  [seg(578,793,880),c=>c.plot],[seg(578,407,730),c=>c.street],[seg(616,697,895),c=>c.area],[seg(655,143,877),c=>c.composed],
  [seg(731,727,853),c=>c.licensed===false?'بدون ترخيص':c.licNo],[cov(394,562,730),c=>fmtDate(c.licDate)],[cov(116,249,731),c=>fmtDate(c.execDate)],
  [seg(770,141,814),c=>c.licWorks],
  [seg(847,466,755),c=>c.ownerName],[seg(847,148,383),c=>c.ownerNid],
  [seg(924,466,845),c=>c.engName],[seg(924,148,383),c=>c.engNid],
  [seg(1001,468,817),c=>c.contrName],[seg(1001,156,391),c=>c.contrNid],
  [seg(1340,700,880),()=>S.responsible],[seg(1341,417,626),()=>S.tanzeem],[seg(1341,120,330),()=>S.gm],
  [cov(772,894,1407),c=>fmtDate(c.issueDate)]]},
 removal:{img:'tpl/removal.jpg',items:[
  [seg(164,146,254),c=>c.removalRegNo],[cov(138,322,191),c=>fmtDate(c.removalRegDate)],[seg(224,191,307),()=>S.employee],
  [seg(335,733,891),c=>c.plot],[seg(335,118,681),c=>c.street],[seg(369,361,496),c=>c.area],
  [seg(439,750,883),c=>c.licensed===false?'بدون ترخيص':c.licNo],[cov(464,666,440),c=>fmtDate(c.licDate)],[seg(439,117,366),c=>c.licType],
  [seg(473,121,837),c=>c.licWorks],
  [seg(543,469,906),c=>c.ownerName],[seg(543,127,406),c=>c.ownerNid],
  [seg(576,656,845),c=>c.addrNo],[seg(576,128,588),c=>c.addrStreet],[seg(611,766,929),c=>c.addrDistrict],[seg(611,466,619),c=>c.addrArea],[seg(611,128,348),c=>c.addrGov],
  [seg(681,533,880),c=>c.engName],[seg(681,131,448),c=>c.engNid],[seg(750,531,843),c=>c.contrName],[seg(750,129,442),c=>c.contrNid],
  [{para:[134,800,531,950]},c=>compose('removal',c)],
  [seg(975,730,858),c=>c.stopNo],[cov(454,642,975),c=>fmtDate(c.stopDate)],[seg(975,125,383),c=>fmtDate(c.announceDate)],
  [seg(1009,709,837),c=>c.reportNo],[cov(434,634,1009),c=>fmtDate(c.reportDate)],
  [cov(424,634,1092),c=>fmtDate(c.periodFrom)],[cov(184,402,1092),c=>fmtDate(c.periodTo)],
  [seg(1294,771,912),()=>S.responsible],[seg(1294,548,689),()=>S.tanzeem],[seg(1294,332,472),()=>S.gm],[seg(1294,127,280),()=>S.legal]]}};

const PFONTS={plex:['Plex','آي بي إم بلكس (افتراضي)'],nsans:['NSans','نوتو سانس'],cairo:['Cairo','القاهرة'],tajawal:['Tajawal','تجوال'],amiri:['Amiri','أميري (نسخ كلاسيكي)'],naskh:['Naskh','نوتو نسخ']};
const INKS={'#111111':'أسود','#0b2563':'أزرق غامق'};
let INK='#111111',FONT='"Plex", "Cairo", sans-serif';
function applyPrintStyle(){const f=PFONTS[S.font]||PFONTS.plex;FONT=`"${f[0]}", "Cairo", sans-serif`;INK=INKS[S.ink]?S.ink:'#111111'}
const imgCache={};
function loadImg(src){return imgCache[src]||(imgCache[src]=new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src}))}
function fitText(ctx,t,x,y,w,size=22,min=11,align='right'){t=toAr(t);ctx.textAlign=align;let s=size;ctx.font=`700 ${s}px ${FONT}`;while(ctx.measureText(t).width>w&&s>min){s-=.5;ctx.font=`700 ${s}px ${FONT}`}ctx.fillText(t,x,y);ctx.textAlign='right'}
function wrap(ctx,t,w){const words=t.split(/\s+/),lines=[];let l='';for(const wd of words){const tr=l?l+' '+wd:wd;if(ctx.measureText(tr).width>w&&l){lines.push(l);l=wd}else l=tr}if(l)lines.push(l);return lines}
function drawPara(ctx,t,[x1,y1,x2,y2]){ctx.fillStyle='#fff';ctx.fillRect(x1,y1,x2-x1,y2-y1);ctx.fillStyle=INK;
 const W=x2-x1-8,H=y2-y1-4;let s=20,lines,lh;for(;s>=10;s-=.5){ctx.font=`700 ${s}px ${FONT}`;lh=s*1.62;lines=wrap(ctx,t,W);if(lines.length*lh<=H)break}
 lines.forEach((ln,i)=>{const yy=y1+4+lh*i+s*1.15;
  if(i<lines.length-1){const ws=ln.split(' ');const tw=ws.reduce((a,w)=>a+ctx.measureText(w).width,0);const gap=ws.length>1?(W-tw)/(ws.length-1):0;
   if(gap<s*1.6&&ws.length>2){let x=x2-4;for(const wd of ws){ctx.fillText(wd,x,yy);x-=ctx.measureText(wd).width+gap}return}}
  ctx.fillText(ln,x2-4,yy)})}
function drawSketch(ctx,kind,c){
 const plot=toAr(c.plot||''),st=c.street?'شارع '+c.street:'';
 if(kind==='report'){ctx.textAlign='center';let fs=30;ctx.font=`700 ${fs}px ${FONT}`;while(ctx.measureText(plot).width>118&&fs>12){fs-=1;ctx.font=`700 ${fs}px ${FONT}`}ctx.fillText(plot,490,906);
  if(c.street&&!/التقسيم/.test(c.street)){ctx.fillStyle='#fff';ctx.fillRect(345,941,300,35);ctx.fillStyle=INK;fs=20;ctx.font=`700 ${fs}px ${FONT}`;const t=toAr(st);while(ctx.measureText(t).width>290&&fs>11){fs-=1;ctx.font=`700 ${fs}px ${FONT}`}ctx.fillText(t,495,966)}ctx.textAlign='right'}
 else{ctx.strokeStyle=INK;ctx.lineWidth=2;ctx.strokeRect(625,815,120,64);ctx.beginPath();ctx.moveTo(575,890);ctx.lineTo(800,890);ctx.moveTo(575,930);ctx.lineTo(800,930);ctx.stroke();
  ctx.textAlign='center';ctx.font=`700 26px ${FONT}`;ctx.fillText(plot,685,858);ctx.font=`700 18px ${FONT}`;ctx.fillText(toAr(st||'شارع'),688,918);ctx.textAlign='right'}}
async function renderForm(form,c,scale=2.2){
 applyPrintStyle();await document.fonts.load(`700 20px ${FONT}`,'أبجد ٠١٢ /');await document.fonts.ready;
 const lay=L[form],img=await loadImg(lay.img);const cv=document.createElement('canvas');cv.width=Math.round(1066*scale);cv.height=Math.round(1600*scale);
 const ctx=cv.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,cv.width,cv.height);ctx.scale(scale,scale);
 ctx.direction='rtl';ctx.textAlign='right';ctx.textBaseline='alphabetic';ctx.fillStyle=INK;
 for(const[sp,fn]of lay.items){
  if(sp.sketch){drawSketch(ctx,sp.sketch,c);continue}
  const v=fn(c);
  if(sp.para){drawPara(ctx,String(v||''),sp.para);continue}
  if(sp.cover){if(!v)continue;const[x1,y1,x2,y2]=sp.cover;ctx.fillStyle='#fff';ctx.fillRect(x1,y1,x2-x1,y2-y1);ctx.fillStyle=INK;fitText(ctx,v,(x1+x2)/2,sp.b,x2-x1-8,21,11,'center');continue}
  const cx=sp.cx??(sp.x-sp.w/2);
  if(v&&String(v).trim())fitText(ctx,v,sp.noSlash?sp.x:cx,sp.y,sp.w,22,11,sp.noSlash?'right':'center');else if(S.slash!==false&&!sp.noSlash)fitText(ctx,'/',cx,sp.y,40,22,11,'center')}
 return cv}
async function makePdf(form,c){const cv=await renderForm(form,c);const{jsPDF}=window.jspdf;const pdf=new jsPDF({unit:'pt',format:'a4',compress:true});
 pdf.addImage(cv.toDataURL('image/jpeg',0.9),'JPEG',0,0,595.28,841.89);return{blob:pdf.output('blob'),cv}}

const APP_VERSION='1.0.0';

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

/* ============ understanding (on-device) ============ */
function applyParse(text,c,form){
 const r=VParser.parseTranscript(text,form,today());let n=0;
 for(const[k,v]of Object.entries(r.values)){if(k==='violCustom'){c.violCustom=c.violCustom?c.violCustom+' و'+v:v;n++;continue}if(FMAP[k]&&v){c[k]=v;n++}}
 if(r.violations.length){c.violations=[...new Set([...(c.violations||[]),...r.violations])];n+=r.violations.length}
 if(r.licensed!==undefined)c.licensed=r.licensed;
 return n}
const normalizeField=(key,text)=>VParser.normalizeValue(key,text,today())||text.trim();

/* ============ screens ============ */
function go(s){stopMic();screen=s;render();window.scrollTo(0,0);if(['capture','missing','review','guided'].includes(s))saveDraft()}
function render(){({home:vHome,capture:vCapture,guided:vGuided,missing:vMissing,review:vReview,preview:vPreview,cases:vCases,settings:vSettings})[screen]($('#app'))}
const setupNeeded=()=>!S.inspector||!S.tanzeem;

let DRAFT=null;
function vHome(a){
 a.innerHTML=`<header class="top"><h1>مخالفات حي الهرم<span class="sub">إدارة التنظيم — ملء النماذج بالصوت</span></h1>
 <button class="iconbtn" id="bCases" title="القضايا">🗂️</button><button class="iconbtn" id="bSet" title="الإعدادات">⚙️</button></header>
 ${setupNeeded()?`<div class="warn">⚙️ أول مرة؟ ادخل <b>الإعدادات</b> واكتب أسماء الموظفين وسعر المتر مرة واحدة، وهتتملى تلقائي في كل نموذج. <button class="btn ghost" id="bSet2" style="width:auto;display:inline">افتح الإعدادات</button></div>`:''}
 ${DRAFT&&DRAFT.c?`<div class="warn">📝 فيه ${FORMS[DRAFT.form].short} ما خلصش${DRAFT.c.ownerName?' — '+esc(DRAFT.c.ownerName):''}. <button class="btn ghost" id="resume" style="width:auto;display:inline">كمّل</button> <button class="btn ghost" id="drop" style="width:auto;display:inline;color:var(--mute)">تجاهل</button></div>`:''}
 <div class="hint" style="text-align:right;margin:0 2px 10px">هتعمل إيه النهارده؟</div>
 ${Object.entries(FORMS).map(([k,f])=>`<button class="bigbtn" data-f="${k}"><span class="ic" style="background:${f.col}">${f.ic}</span><span><b>${f.name}</b><small>${f.reg}</small></span></button>`).join('')}
 <button class="bigbtn" id="bCases2"><span class="ic" style="background:#5b6b82">🔍</span><span><b>القضايا المحفوظة</b><small>${toAr(CASES.length)} قضية — دور بالاسم أو الرقم القومي أو العنوان</small></span></button>`;
 a.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>startForm(b.dataset.f));
 $('#bCases').onclick=$('#bCases2').onclick=()=>go('cases');$('#bSet').onclick=()=>go('settings');if($('#bSet2'))$('#bSet2').onclick=()=>go('settings');
 if($('#resume'))$('#resume').onclick=()=>{cur={form:DRAFT.form,c:DRAFT.c,transcript:DRAFT.transcript||''};DRAFT=null;go('review')};
 if($('#drop'))$('#drop').onclick=()=>{DRAFT=null;clearDraft();render()}}

function startForm(form,c){
 c=c||newCase();cur={form,c,transcript:''};DRAFT=null;
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
 <div class="micwrap"><button class="mic ${on?'live':''}" id="mic">${on?'■':'🎤'}</button></div>
 <div class="hint">${on?'بيسمعك… اضغط تاني لما تخلص':'اضغط وابدأ الكلام'}</div>
 <div class="card" style="margin-top:14px"><h3>اللي اتقال</h3>
 <textarea id="tr" rows="6" placeholder="مثال: قطعة ٤٥ ل، شارع التقسيم، المالك عبد الله صلاح الدين حسن نايل، الرقم القومي ٢٩٧٠٩٢٤٢١٠٢٧١٦، ترخيص رقم ٥٨ لسنة ٢٠٢٥، عدم تنفيذ الدروم وزيادة البروزات، من الدور الأرضي إلى الدور الرابع، المسطح ١٠٠ متر">${esc(cur.transcript)}</textarea>
 <div class="live-t" id="live">${esc(liveTxt)}</div></div>
 <details class="card"><summary>الكلمات اللي التطبيق بيفهمها</summary><div class="kws">${KW_HINT.map(k=>`<span>${k}</span>`).join('')}</div>
 <div class="hint" style="text-align:right;margin-top:8px">المخالفات بيلقطها من الكلام لوحده (الدروم، البروزات، المناور، الأعمدة، دور زايد، سقف، الجراج…).</div></details>
 <div class="bar"><div class="in"><button class="btn sec" id="guide" style="flex:1">خانة خانة</button><button class="btn" id="go" style="flex:2">وزّع البيانات ←</button></div></div>`;
 const tr=$('#tr');tr.oninput=()=>cur.transcript=tr.value;
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
function guidedList(){const c=cur.c;return fieldsFor(cur.form).filter(f=>!(c.licensed===false&&f[5]==='lic')&&!(['convFrom','convTo'].includes(f[0])&&!(c.violations||[]).includes('conv')))}
function vGuided(a){const list=guidedList();const c=cur.c;
 if(gIdx>=list.length){go('review');return}
 const f=list[gIdx];const k=f[0];const on=micOwner==='g';
 const showV=v=>f[2]==='date'?fmtDate(v):toAr(v);
 a.innerHTML=`<header class="top"><button class="iconbtn" id="back">→</button><h1>خانة خانة<span class="sub">${FORMS[cur.form].short} — ${toAr(gIdx+1)} من ${toAr(list.length)}</span></h1><button class="iconbtn" id="fin" title="خلصت">✓</button></header>
 <div class="prog"><i style="width:${Math.round(gIdx/list.length*100)}%"></i></div>
 <div class="card"><div class="guide-n">${GROUPS[f[5]]}</div><div class="guide-f">${f[1]}</div>
 <div class="micwrap"><button class="mic small ${on?'live':''}" id="mic">${on?'■':'🎤'}</button></div>
 <div class="live-t" id="live" style="text-align:center"></div>
 <input id="gv" class="guide-v" ${f[2]==='date'&&c[k]!=='/'?'type="date"':''} ${f[2]==='nid'||f[2]==='num'?'inputmode="numeric"':''} value="${esc(c[k]??'')}" placeholder="قول أو اكتب">
 ${c[k]&&f[2]!=='date'?`<div class="hint" style="margin-top:6px">${esc(showV(c[k]))}</div>`:''}
 <div class="actions"><button class="btn sec" id="prev">→ السابق</button><button class="btn" id="next">التالي ←</button>
 <button class="btn sec" id="na">مش موجود ( / )</button><button class="btn sec" id="skip">تخطي</button></div></div>
 ${k==='areaM2'||k==='floorFrom'?`<div class="card"><h3>نوع المخالفة</h3>${chipsHtml(c)}</div>`:''}
 <div class="hint">بعد ما تقول القيمة، بيروح للخانة اللي بعدها لوحده.</div>`;
 bindChips(a,c);
 const inp=$('#gv');inp.oninput=()=>{let v=inp.value;if(f[2]==='nid')v=VParser.toEn(v).replace(/\D/g,'');c[k]=v};
 const next=()=>{gIdx++;saveDraft();render();if(Plat.speech.supported&&S.autoMic!==false)setTimeout(()=>{const m=$('#mic');if(screen==='guided'&&micOwner!=='g'&&m)m.click()},250)};
 const startG=()=>listen('g',{partial:t=>{const l=$('#live');if(l)l.textContent=t},
  final:t=>{const v=normalizeField(k,t);c[k]=v;const i=$('#gv');if(i){if(f[2]==='date'&&v&&!/^\d{4}-/.test(v))i.type='text';i.value=v}const l=$('#live');if(l)l.textContent='';
   stopMic();setTimeout(next,450)},
  state:s=>{const m=$('#mic');if(m){m.classList.toggle('live',s==='listening');m.textContent=s==='listening'?'■':'🎤'}}});
 $('#mic').onclick=startG;
 $('#next').onclick=next;$('#skip').onclick=next;
 $('#na').onclick=()=>{c[k]='/';next()};
 $('#prev').onclick=()=>{if(gIdx>0){gIdx--;render()}};
 $('#back').onclick=()=>go('capture');$('#fin').onclick=()=>go('review')}

function fieldInput(f,c,extra=''){const k=f[0],v=c[k]??'';const t=f[2];
 const type=t==='date'&&v!=='/'?'date':'text';const im=t==='nid'||t==='num'?'inputmode="numeric"':'';
 return `<label class="f ${extra}"><span>${f[1]}${t==='nid'&&v&&v!=='/'&&String(v).length!==14?' <b style="color:var(--bad)">('+toAr(String(v).length)+' رقم — لازم ١٤)</b>':''}</span>
 <div class="fwrap"><input type="${type}" data-k="${k}" ${im} value="${esc(v)}"><button class="mic-s" data-mic="${k}" type="button">🎤</button></div></label>`}
function bindFields(root,c,onChange){
 root.querySelectorAll('input[data-k]').forEach(i=>i.oninput=()=>{let v=i.value;if(FMAP[i.dataset.k][2]==='nid')v=VParser.toEn(v).replace(/\D/g,'');c[i.dataset.k]=v;onChange&&onChange(i.dataset.k)});
 root.querySelectorAll('[data-mic]').forEach(b=>b.onclick=()=>{const k=b.dataset.mic;const inp=root.querySelector(`input[data-k="${k}"]`);
  const ok=listen('f_'+k,{partial:t=>{inp.placeholder=t},final:t=>{inp.placeholder='';const v=normalizeField(k,t);c[k]=v;if(inp.type==='date'&&!/^\d{4}-/.test(v))inp.type='text';inp.value=v;onChange&&onChange(k);stopMic()},
   state:s=>{b.textContent=s==='listening'?'⏺':'🎤';b.style.background=s==='listening'?'#fde2e0':''}});
  if(!ok&&!Plat.speech.supported)inp.focus()})}
function chipsHtml(c){return `<div class="chips">${VIOL.map(v=>`<button class="chip ${(c.violations||[]).includes(v.k)?'on':''}" data-v="${v.k}" type="button">${v.l}</button>`).join('')}</div>`}
function bindChips(root,c,after){root.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{const s=new Set(c.violations||[]);s.has(b.dataset.v)?s.delete(b.dataset.v):s.add(b.dataset.v);c.violations=[...s];b.classList.toggle('on');after&&after()})}

function vMissing(a){const c=cur.c,m=missing(cur.form,c),o=emptyOpt(cur.form,c);
 if(!m.length&&!o.length){go('review');return}
 const optHtml=f=>`<div class="optf">${fieldInput(f,c)}<button class="btn ghost na" data-na="${f[0]}" type="button">مش موجود ( / )</button></div>`;
 a.innerHTML=`<header class="top"><button class="iconbtn" id="back">→</button><h1>كمّل الناقص<span class="sub">${m.length?toAr(m.length)+' مطلوب · ':''}${toAr(o.length)} خانة تانية فاضية</span></h1></header>
 ${m.length?`<div class="card miss"><h3>مطلوب</h3>${m.map(f=>f[0]==='__viol'?`<label class="f"><span>نوع المخالفة — اختار</span></label>${chipsHtml(c)}<label class="f" style="margin-top:10px"><span>مخالفة تانية (اختياري)</span><textarea id="vc" rows="2">${esc(c.violCustom)}</textarea></label>`:fieldInput(f,c)).join('')}</div>`:''}
 ${o.length?`<div class="card"><h3>باقي خانات الورقة (${toAr(o.length)})</h3><div class="hint" style="text-align:right;margin-bottom:8px">قولها أو اكتبها. اللي مش موجود اضغط "مش موجود" وهيتكتب فيها ( / ) زي الورق.</div>${o.map(optHtml).join('')}
 <button class="btn sec" id="allna">كل الباقي مش موجود ( / )</button></div>`:''}
 <div class="bar"><div class="in"><button class="btn sec" id="guide" style="flex:1">خانة خانة</button><button class="btn" id="ok" style="flex:2">راجع الكل ←</button></div></div>`;
 bindFields(a,c);bindChips(a,c);const vc=$('#vc');if(vc)vc.oninput=()=>c.violCustom=vc.value;
 a.querySelectorAll('[data-na]').forEach(b=>b.onclick=()=>{const k=b.dataset.na;c[k]='/';const i=a.querySelector(`input[data-k="${k}"]`);if(i){i.type='text';i.value='/'}b.textContent='✓ مش موجود'});
 if($('#allna'))$('#allna').onclick=()=>{o.forEach(f=>{if(!String(c[f[0]]??'').trim())c[f[0]]='/'});go('review')};
 $('#back').onclick=()=>go('capture');$('#ok').onclick=()=>go('review');
 $('#guide').onclick=()=>{const list=guidedList();gIdx=Math.max(0,list.findIndex(f=>!String(c[f[0]]??'').trim()));go('guided')}}

function vReview(a){const c=cur.c,form=cur.form,fs=fieldsFor(form),miss=new Set(missing(form,c).map(f=>f[0]));
 const groups={};for(const f of fs)(groups[f[5]]=groups[f[5]]||[]).push(f);
 const grpHtml=g=>{let list=groups[g]||[];if(g==='lic'&&c.licensed===false)list=[];
  const mc=list.filter(f=>miss.has(f[0])).length;const ec=list.filter(f=>!String(c[f[0]]??'').trim()).length;
  return `<details class="card" ${mc||g==='site'||g==='owner'||g==='viol'?'open':''}><summary>${GROUPS[g]}${mc?`<span class="cnt">${toAr(mc)} ناقص</span>`:ec?`<span class="cnt" style="background:#9aa3b2">${toAr(ec)} فاضي</span>`:''}</summary>
  ${g==='lic'?`<div class="sw"><button class="btn ${c.licensed!==false?'':'sec'}" data-lic="1" type="button">فيه ترخيص</button><button class="btn ${c.licensed===false?'':'sec'}" data-lic="0" type="button">بدون ترخيص</button></div>`:''}
  ${g==='viol'?`${chipsHtml(c)}<label class="f" style="margin-top:12px"><span>مخالفة تانية بصياغتك (اختياري)</span><textarea id="vc" rows="2">${esc(c.violCustom)}</textarea></label>`:''}
  ${list.filter(f=>!(g==='viol'&&['convFrom','convTo'].includes(f[0])&&!(c.violations||[]).includes('conv'))).map(f=>fieldInput(f,c,miss.has(f[0])?'miss':'')).join('')}
  ${g==='viol'&&form==='report'?`<div class="cost" id="cost">${costHtml(c)}</div>`:''}</details>`};
 a.innerHTML=`<header class="top"><button class="iconbtn" id="back">→</button><h1>مراجعة البيانات<span class="sub">${FORMS[form].name}</span></h1><button class="iconbtn" id="more" title="إضافة بالصوت">🎤</button></header>
 ${miss.size?`<div class="warn">فيه ${toAr(miss.size)} خانة مهمة فاضية (متعلّمة بالبرتقاني). تقدر تكمّل بيها أو من غيرها.</div>`:''}
 ${['site','owner','viol','insp','lic','eng','reg','dec'].filter(g=>groups[g]||g==='viol').map(grpHtml).join('')}
 <div class="card"><h3>📃 نص المخالفة اللي هيتكتب في النموذج</h3><textarea id="para" rows="6">${esc(compose(form,c))}</textarea>
 <button class="btn ghost" id="resetPara" style="display:${c.paraOv&&c.paraOv[form]?'block':'none'}">↺ رجّع النص التلقائي</button></div>
 <div class="bar"><div class="in"><button class="btn ok" id="prev">معاينة الـ PDF ←</button></div></div>`;
 const refreshPara=()=>{const p=$('#para');if(p&&!(c.paraOv&&c.paraOv[form]))p.value=compose(form,c);const ce=$('#cost');if(ce)ce.innerHTML=costHtml(c)};
 bindFields(a,c,refreshPara);bindChips(a,c,()=>{refreshPara();if((c.violations||[]).includes('conv')!==!!a.querySelector('[data-k="convFrom"]'))keepScroll(render)});
 const vc=$('#vc');if(vc)vc.oninput=()=>{c.violCustom=vc.value;refreshPara()};
 a.querySelectorAll('[data-lic]').forEach(b=>b.onclick=()=>{c.licensed=b.dataset.lic==='1';keepScroll(render)});
 $('#para').oninput=e=>{c.paraOv=c.paraOv||{};c.paraOv[form]=e.target.value;$('#resetPara').style.display='block'};
 $('#resetPara').onclick=()=>{delete c.paraOv[form];$('#para').value=compose(form,c);$('#resetPara').style.display='none'};
 $('#back').onclick=()=>go(c.done&&Object.keys(c.done).length?'cases':'capture');
 $('#more').onclick=()=>{cur.transcript='';go('capture')};
 $('#prev').onclick=()=>go('preview')}
function costHtml(c){const k=cost(c);if(!S.price)return 'حط <b>سعر المتر</b> في الإعدادات عشان التكلفة تتحسب لوحدها.';
 if(!k)return `سعر المتر: ${toAr(num(S.price).toLocaleString('en-US'))} جنيه — اكتب المسطح وهتتحسب التكلفة.`;
 return `${toAr(c.areaM2)} م٢ × ${toAr(num(S.price).toLocaleString('en-US'))} = <b>${toAr(k.toLocaleString('en-US'))} جنيه</b><br>${numWords(k)} جنيهاً فقط لا غير`}
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
 <label class="row" style="margin-top:12px;font-size:14px"><input type="checkbox" id="slash" style="width:auto" ${S.slash!==false?'checked':''}> اكتب ( / ) في أي خانة فاضية</label>
 <label class="row" style="margin-top:8px;font-size:14px"><input type="checkbox" id="autoMic" style="width:auto" ${S.autoMic!==false?'checked':''}> في وضع "خانة خانة" المايك يفتح لوحده</label></div>
 <div class="card"><h3>📍 قيم افتراضية</h3><label class="f"><span>المنطقة</span><input data-s="defArea" value="${esc(S.defArea)}"></label></div>
 <div class="card"><h3>💾 نسخة احتياطية</h3><div class="hint" style="text-align:right;margin-bottom:10px">القضايا محفوظة على الموبايل ده بس. اعمل نسخة احتياطية كل فترة وابعتها لنفسك.</div>
 <div class="actions"><button class="btn sec" id="exp">تصدير</button><button class="btn sec" id="imp">استيراد</button></div><input type="file" id="impf" accept=".json,application/json" style="display:none"></div>
 <div class="hint">الإصدار ${APP_VERSION}${Plat.NATIVE?' · تطبيق أندرويد':''}</div>
 <div class="bar"><div class="in"><button class="btn" id="save">حفظ</button></div></div>`;
 a.querySelectorAll('[data-s]').forEach(i=>i.oninput=()=>{S[i.dataset.s]=i.dataset.s==='price'?VParser.toEn(i.value):i.value});
 const fp=()=>{const f=PFONTS[S.font]||PFONTS.plex;const e=$('#fprev');e.style.fontFamily=`'${f[0]}',Cairo`;e.style.color=INKS[S.ink]?S.ink:'#111';e.textContent='عبد الله صلاح الدين حسن نايل — قطعة ٤٥ل — ٢٩٧٠٩٢٤٢١٠٢٧١٦'};fp();
 a.querySelectorAll('[data-font]').forEach(b=>b.onclick=()=>{S.font=b.dataset.font;a.querySelectorAll('[data-font]').forEach(x=>x.classList.toggle('on',x===b));fp()});
 a.querySelectorAll('[data-ink]').forEach(b=>b.onclick=()=>{S.ink=b.dataset.ink;a.querySelectorAll('[data-ink]').forEach(x=>x.classList.toggle('on',x===b));fp()});
 $('#slash').onchange=e=>S.slash=e.target.checked;$('#autoMic').onchange=e=>S.autoMic=e.target.checked;
 $('#exp').onclick=async()=>{const blob=new Blob([JSON.stringify({app:'haram-violations',v:1,at:new Date().toISOString(),settings:S,cases:CASES},null,1)],{type:'application/json'});
  const name=`نسخة احتياطية مخالفات ${today()}.json`;try{await Plat.files.share(blob,name,'application/json')}catch(e){}};
 $('#imp').onclick=()=>$('#impf').click();
 $('#impf').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const o=JSON.parse(await f.text());if(!Array.isArray(o.cases))throw 0;
  const ids=new Set(CASES.map(c=>c.id));let n=0;for(const c of o.cases)if(!ids.has(c.id)){CASES.push(c);n++}
  if(o.settings&&setupNeeded())S={...DEF_SET,...o.settings};await Plat.store.set('cases',CASES);await saveSettings();toast(`اتضاف ${toAr(n)} قضية`);render()}catch(x){toast('الملف ده مش نسخة احتياطية صحيحة')}};
 $('#back').onclick=async()=>{await saveSettings();go('home')};$('#save').onclick=async()=>{await saveSettings();toast('اتحفظ ✓');go('home')}}

/* ============ boot ============ */
window.__render=async(form,c,s)=>{if(s)Object.assign(S,s);const cv=await renderForm(form,c,1.6);return cv.toDataURL('image/jpeg',.85)};
window.__app={compose,applyParse,get S(){return S},get CASES(){return CASES}};
(async()=>{render();await loadAll();try{const d=await Plat.store.get('draft');if(d&&d.c)DRAFT=d}catch(e){}render();
 if('serviceWorker' in navigator&&!Plat.NATIVE&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stopMic();saveDraft()}})})();
