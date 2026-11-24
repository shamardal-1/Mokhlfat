/* =====================================================================
   parser.js — on-device understanding of Egyptian-Arabic dictation.
   No AI, no network. Splits the transcript at known field keywords
   ("قطعة", "شارع", "المالك", "رقم قومي", ...) and normalises each value
   (spoken numbers -> digits, dates, hours, floors).
   Works in the browser (globals) and in Node (module.exports) for tests.
   ===================================================================== */
(function (G) {
'use strict';

const AR = '٠١٢٣٤٥٦٧٨٩', FA = '۰۱۲۳۴۵۶۷۸۹';
const toAr = s => String(s ?? '').replace(/[0-9]/g, d => AR[d]);
const toEn = s => String(s ?? '').replace(/[٠-٩]/g, d => AR.indexOf(d)).replace(/[۰-۹]/g, d => FA.indexOf(d));
/* strip harakat / tatweel (changes length, done once up-front) */
const clean = s => toEn(String(s || '')).replace(/[ً-ْٰـ]/g, '').replace(/[«»"“”]/g, ' ');
/* 1:1 letter folding so indexes stay aligned with the cleaned text */
const fold = s => s.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
const pad2 = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());

/* ---------------- spoken numbers ---------------- */
const NW = {};
const addW = (v, ...ws) => ws.forEach(w => NW[fold(w)] = v);
addW(0, 'صفر', 'زيرو');
addW(1, 'واحد', 'واحدة', 'واحده');
addW(2, 'اتنين', 'اثنين', 'اثنان', 'اتنان', 'إتنين');
addW(3, 'تلاتة', 'تلاته', 'ثلاثة', 'ثلاثه', 'تلات', 'ثلاث');
addW(4, 'اربعة', 'أربعة', 'اربعه', 'اربع', 'أربع');
addW(5, 'خمسة', 'خمسه', 'خمس');
addW(6, 'ستة', 'سته', 'ست');
addW(7, 'سبعة', 'سبعه', 'سبع');
addW(8, 'تمانية', 'تمانيه', 'ثمانية', 'ثمانيه', 'تمن', 'ثمان', 'تماني');
addW(9, 'تسعة', 'تسعه', 'تسع');
addW(10, 'عشرة', 'عشره', 'عشر');
addW(11, 'حداشر', 'احداشر', 'حادشر', 'احدعشر');
addW(12, 'اتناشر', 'اطناشر', 'اتنعشر', 'اثنعشر');
addW(13, 'تلتاشر', 'تلطاشر', 'ثلاثطعشر');
addW(14, 'اربعتاشر', 'اربعطاشر');
addW(15, 'خمستاشر', 'خمسطاشر');
addW(16, 'ستاشر', 'سطاشر');
addW(17, 'سبعتاشر', 'سبعطاشر');
addW(18, 'تمنتاشر', 'تمنطاشر');
addW(19, 'تسعتاشر', 'تسعطاشر');
addW(20, 'عشرين', 'عشرون'); addW(30, 'تلاتين', 'ثلاثين', 'ثلاثون'); addW(40, 'اربعين', 'أربعين', 'اربعون');
addW(50, 'خمسين', 'خمسون'); addW(60, 'ستين', 'ستون'); addW(70, 'سبعين', 'سبعون');
addW(80, 'تمانين', 'ثمانين', 'ثمانون'); addW(90, 'تسعين', 'تسعون');
addW(100, 'مية', 'ميه', 'مائة', 'مائه', 'مئة', 'مئه', 'ميت');
addW(200, 'ميتين', 'متين', 'مائتين', 'مائتان', 'مئتين');
addW(300, 'تلتمية', 'تلتميه', 'تلاتمية', 'ثلاثمائة', 'ثلثمائة', 'ثلاثمية');
addW(400, 'ربعمية', 'ربعميه', 'اربعمية', 'أربعمائة', 'اربعمائه');
addW(500, 'خمسمية', 'خمسميه', 'خمسمائة', 'خمسمائه');
addW(600, 'ستمية', 'ستميه', 'ستمائة', 'ستمائه');
addW(700, 'سبعمية', 'سبعميه', 'سبعمائة', 'سبعمائه');
addW(800, 'تمنمية', 'تمنميه', 'ثمانمائة', 'تمانمية');
addW(900, 'تسعمية', 'تسعميه', 'تسعمائة', 'تسعمائه');
addW(2000, 'الفين', 'ألفين', 'ألفان', 'الفان');
const MULT = {}; ['ألف', 'الف', 'آلاف', 'الاف'].forEach(w => MULT[fold(w)] = 1e3); ['مليون', 'ملايين'].forEach(w => MULT[fold(w)] = 1e6);

/* "تلتمية أربعة وعشرين" -> [{n:324}] ; "اتنين خمسة" -> [{n:2},{n:5}] ; words kept as {w} */
function spokenParse(str) {
  const toks = fold(clean(str)).replace(/[،,؛:]/g, ' ').split(/\s+/).filter(Boolean);
  const out = []; let big = 0, small = 0, has = false;
  const flush = () => { if (has) out.push({ n: big + small }); big = 0; small = 0; has = false; };
  for (const tk of toks) {
    let w = tk, waw = false;
    const known = x => x in NW || x in MULT || /^\d+$/.test(x);
    if (!known(w) && /^و/.test(w) && known(w.slice(1))) { w = w.slice(1); waw = true; }
    if (/^\d+[\/\-.]\d+/.test(w)) { flush(); w.split(/[\/\-.]/).filter(Boolean).forEach(x => out.push({ n: +x })); continue; }
    if (/^\d+$/.test(w) && w.length > 4) { flush(); out.push({ n: w, raw: true }); continue; } // long digit strings (IDs)
    if (w in MULT) { big += (small || 1) * MULT[w]; small = 0; has = true; continue; }
    const v = /^\d+$/.test(w) ? +w : (w in NW ? NW[w] : null);
    if (v === null) { flush(); out.push({ w: tk }); continue; }
    if (!has) { small = v; has = true; continue; }
    const r = small % 100;
    const add = (small === 0 && big > 0 && v < 1000)
      || (small > 0 && r === 0 && v < 100 && (small >= 100))
      || (r > 0 && r < 10 && ((v >= 20 && v < 100 && v % 10 === 0 && waw) || v === 10))
      || (big > 0 && small === 0 && v < 1000);
    if (add) small += v; else { flush(); small = v; has = true; }
  }
  flush();
  return out;
}
/* digits-only rendering, keeping trailing letters (plot "45ل") */
function spokenToDigits(str) {
  const parts = spokenParse(str); let r = '';
  parts.forEach((o, i) => {
    const p = parts[i - 1];
    if (o.n !== undefined) r += (p && p.w ? ' ' : '') + o.n;
    else { const w = o.w.replace(/^حرف$/, ''); if (!w) return; r += (p ? (p.n !== undefined && w.length <= 2 ? '' : ' ') : '') + w; }
  });
  return r.trim();
}
const numsOf = s => spokenParse(s).filter(o => o.n !== undefined).map(o => +o.n);

/* ---------------- dates ---------------- */
const MONTHS = {};
[['يناير', 'ينايير', 'كانون الثاني'], ['فبراير', 'فبرير'], ['مارس'], ['ابريل', 'أبريل', 'ابريل'], ['مايو', 'ماي'], ['يونيو', 'يونيه'],
 ['يوليو', 'يوليه'], ['اغسطس', 'أغسطس'], ['سبتمبر'], ['اكتوبر', 'أكتوبر'], ['نوفمبر'], ['ديسمبر']]
  .forEach((a, i) => a.forEach(w => MONTHS[fold(w)] = i + 1));
function parseDate(s, today) {
  const t = fold(clean(s)); const base = today ? new Date(today + 'T12:00') : new Date();
  const rel = n => { const d = new Date(base); d.setDate(d.getDate() + n); return iso(d); };
  if (/اول امبارح|اول امس/.test(t)) return rel(-2);
  if (/امبارح|امس/.test(t)) return rel(-1);
  if (/النهارده|النهاردا|اليوم|انهارده/.test(t)) return rel(0);
  if (/بكره|غدا/.test(t)) return rel(1);
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  let d, mo, y; const words = t.split(/\s+/);
  const mi = words.findIndex(w => MONTHS[w.replace(/^(شهر|ل|في)/, '')]);
  if (mi >= 0) {
    mo = MONTHS[words[mi].replace(/^(شهر|ل|في)/, '')];
    const before = numsOf(words.slice(0, mi).join(' ')), after = numsOf(words.slice(mi + 1).join(' '));
    d = before.length ? before[before.length - 1] : 1; y = after[0];
  } else {
    let n = numsOf(t);
    if (n.length === 1 && String(n[0]).length >= 5) { const x = String(n[0]); n = x.length === 8 ? [+x.slice(0, 2), +x.slice(2, 4), +x.slice(4)] : n; }
    if (n.length < 2) return '';
    if (n[0] > 1900) { y = n[0]; mo = n[1]; d = n[2]; } else { d = n[0]; mo = n[1]; y = n[2]; }
  }
  if (!y) y = base.getFullYear(); if (y < 100) y += 2000;
  if (!(d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y > 1950 && y < 2100)) return '';
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

/* ---------------- hour ---------------- */
function parseHour(s) {
  const t = fold(clean(s));
  let per = '';
  if (/صباح|الصبح|صبحا|بدري/.test(t)) per = 'صباحاً';
  else if (/الضهر|الظهر|ظهرا|ضهرا/.test(t)) per = 'ظهراً';
  else if (/العصر|عصرا/.test(t)) per = 'عصراً';
  else if (/مسا|بالليل|بليل|الليل|المغرب|العشا/.test(t)) per = 'مساءً';
  let m = t.match(/(\d{1,2})[:.](\d{2})/), h, mm = 0;
  if (m) { h = +m[1]; mm = +m[2]; }
  else {
    const n = numsOf(t.replace(/دقيقه|دقايق|دقائق/g, ' '));
    if (!n.length) return String(s || '').trim();
    h = n[0]; if (n[1] !== undefined && n[1] < 60) mm = n[1];
    if (h > 24 && h < 2400 && String(h).length >= 3) { mm = h % 100; h = Math.floor(h / 100); }
    if (/ونص|و نص|والنص/.test(t)) mm = 30;
    else if (/الا ربع|الا ربعا/.test(t)) { h -= 1; mm = 45; }
    else if (/وربع|و ربع/.test(t)) mm = 15;
    else if (/الا تلت/.test(t)) { h -= 1; mm = 40; }
    else if (/وتلت|و تلت/.test(t)) mm = 20;
  }
  if (h > 12) { h -= 12; if (!per) per = 'مساءً'; }
  if (h === 0) h = 12;
  if (!per) per = (h >= 7 && h <= 11) ? 'صباحاً' : (h === 12 || h <= 3) ? 'ظهراً' : 'مساءً';
  return (mm ? `${h}:${pad2(mm)}` : `${h}`) + ' ' + per;
}

/* ---------------- floors ---------------- */
const ORD = ['الأرضي', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر'];
const FLOOR_FIX = { 'الارضي': 'الأرضي', 'ارضي': 'الأرضي', 'الارضى': 'الأرضي', 'الاول': 'الأول', 'اول': 'الأول', 'التاني': 'الثاني', 'تاني': 'الثاني', 'الثاني': 'الثاني',
  'التالت': 'الثالث', 'تالت': 'الثالث', 'الثالث': 'الثالث', 'الرابع': 'الرابع', 'رابع': 'الرابع', 'الخامس': 'الخامس', 'خامس': 'الخامس', 'السادس': 'السادس', 'سادس': 'السادس',
  'السابع': 'السابع', 'سابع': 'السابع', 'التامن': 'الثامن', 'تامن': 'الثامن', 'الثامن': 'الثامن', 'التاسع': 'التاسع', 'تاسع': 'التاسع', 'العاشر': 'العاشر', 'عاشر': 'العاشر',
  'البدروم': 'البدروم', 'بدروم': 'البدروم', 'السطح': 'السطح', 'الروف': 'الروف', 'الاخير': 'الأخير', 'الميزانين': 'الميزانين' };
function parseFloor(s) {
  let t = clean(s).replace(/^\s*(و?(من|الي|إلى|إلي|الى|لحد|حتى|ل|ب|في)\s+)?(ال)?دور\s*/, '').trim();
  const f = fold(t).split(/\s+/);
  if (FLOOR_FIX[f[0]]) return FLOOR_FIX[f[0]] + (f[1] === 'عشر' ? ' عشر' : f.slice(1).length && /علوي|متكرر/.test(f[1]) ? ' ' + t.split(/\s+/)[1] : '');
  const n = numsOf(t);
  if (n.length && n[0] < ORD.length) return ORD[n[0]];
  return t;
}

/* ---------------- keyword table ---------------- */
const REG = { report: 'reportRegNo', stop: 'stopRegNo', removal: 'removalRegNo' };
const REGD = { report: 'reportRegDate', stop: 'stopRegDate', removal: 'removalRegDate' };
/* f: field key | (ctx, st) => key|null|'' (null = not a keyword here) ; c: context to switch to ; a: action */
const KW = [
  { p: ['بدون ترخيص', 'من غير ترخيص', 'مفيش ترخيص', 'ملوش ترخيص', 'مالوش ترخيص', 'غير مرخص', 'مش مرخص', 'بدون رخصه', 'من غير رخصه'], a: 'unlicensed', f: '' },
  { p: ['رقم القطعه', 'القطعه رقم', 'قطعه رقم', 'رقم قطعه', 'القطعه', 'قطعه', 'قطعه ارض', 'البلوك'], f: 'plot', c: 'site' },
  { p: ['المكون من', 'مكون من', 'مكونه من', 'العقار مكون من', 'المبني مكون من', 'عباره عن', 'تتكون من', 'يتكون من'], f: 'composed' },
  { p: ['عنوان المالك', 'عنوان المخالف', 'عنوانه', 'عنوانها', 'العنوان', 'ساكن في', 'ساكنه في', 'ساكن', 'ساكنه', 'مقيم في', 'مقيم', 'سكنه', 'محل اقامته', 'محل الاقامه'], f: 'addr', c: 'addr' },
  { p: ['عقار رقم', 'رقم العقار', 'العقار رقم', 'عماره رقم', 'رقم العماره', 'منزل رقم', 'بيت رقم', 'رقم المنزل', 'رقم البيت'], f: 'addrNo', c: 'addr' },
  { p: ['شارع', 'بشارع', 'الشارع'], f: ctx => ctx === 'addr' ? 'addrStreet' : 'street' },
  { p: ['حي'], f: ctx => ctx === 'addr' ? 'addrDistrict' : '' },
  { p: ['منطقه', 'المنطقه', 'مدينه', 'المدينه', 'بمنطقه'], f: ctx => ctx === 'addr' ? 'addrArea' : 'area' },
  { p: ['محافظه', 'المحافظه', 'محافظة'], f: ctx => ctx === 'addr' ? 'addrGov' : '' },
  { p: ['تاريخ المعاينه', 'المعاينه بتاريخ', 'المعاينه يوم', 'المعاينه كانت يوم', 'المعاينه كانت', 'عملت المعاينه', 'اتعملت المعاينه', 'يوم المعاينه', 'المعاينه'], f: 'inspDate', c: 'insp' },
  { p: ['ساعه المعاينه', 'الساعه', 'الوقت'], f: 'inspHour' },
  { p: ['رقم الترخيص', 'الترخيص رقم', 'ترخيص رقم', 'رخصه رقم', 'رقم الرخصه', 'الترخيص', 'ترخيص', 'الرخصه', 'رخصه', 'للترخيص'], f: 'licNo', c: 'lic' },
  { p: ['لسنه', 'سنه', 'عام', 'لعام'], f: (ctx, st) => (ctx === 'lic' || (st.licNo && !st.licYear)) ? 'licYear' : null },
  { p: ['تاريخ الترخيص', 'تاريخ صدور الترخيص', 'الترخيص صادر', 'صادر بتاريخ', 'صادر في', 'صدر بتاريخ', 'صدر في'], f: 'licDate', c: 'lic' },
  { p: ['نوع الترخيص', 'نوعه', 'نوع الرخصه'], f: 'licType' },
  { p: ['الاعمال المرخص بها', 'المرخص بها', 'مرخص له ب', 'مرخص ب', 'مرخص له', 'المرخص'], f: 'licWorks' },
  { p: ['تاريخ بدء التنفيذ', 'بدء التنفيذ', 'بدا التنفيذ', 'بدأ التنفيذ', 'التنفيذ بدا', 'بدايه التنفيذ'], f: 'execDate' },
  { p: ['اسم المالك', 'المالك اسمه', 'المالك', 'مالك العقار', 'اسم المخالف', 'المخالف اسمه', 'المخالف', 'صاحب العقار', 'صاحب الارض', 'صاحبه', 'الاسم', 'الصادر لصالحه'], f: 'ownerName', c: 'owner' },
  { p: ['الرقم القومي', 'رقم قومي', 'رقمه القومي', 'رقمها القومي', 'القومي', 'رقم البطاقه', 'بطاقه رقم', 'بطاقته', 'الرقم القومى'], f: ctx => ctx === 'eng' ? 'engNid' : ctx === 'contr' ? 'contrNid' : 'ownerNid' },
  { p: ['صفته', 'بصفته', 'صفه المخالف', 'صفتها', 'صفته ايه'], f: 'capacity' },
  { p: ['المهندس المشرف', 'مهندس مشرف', 'المشرف', 'المهندس اسمه', 'المهندس', 'مهندس'], f: 'engName', c: 'eng' },
  { p: ['المقاول المنفذ', 'المقاول اسمه', 'المقاول', 'مقاول'], f: 'contrName', c: 'contr' },
  { p: ['بغرض التحويل من', 'التحويل من', 'تحويل من', 'حوله من', 'حول من', 'محول من', 'حولها من'], f: 'convFrom', c: 'conv', a: 'conv' },
  { p: ['من الدور', 'من دور', 'من اول الدور'], f: 'floorFrom', c: 'floor' },
  { p: ['الي الدور', 'لحد الدور', 'للدور', 'حتي الدور', 'لغايه الدور'], f: 'floorTo', c: 'floor' },
  { p: ['بالدور', 'في الدور', 'الدور'], f: (ctx, st) => st.floorFrom ? (st.floorTo ? null : 'floorTo') : 'floorFrom', c: 'floor' },
  { p: ['الي', 'لحد', 'حتي', 'لغايه', 'لغاية'], f: ctx => ctx === 'conv' ? 'convTo' : ctx === 'period' ? 'periodTo' : ctx === 'floor' ? 'floorTo' : null },
  { p: ['مسطح البدروم', 'البدروم مسطحه', 'البدروم بمسطح', 'مساحه البدروم', 'مسطح عدم تنفيذ البدروم'], f: 'areaB' },
  { p: ['عدد الادوار', 'عدد الأدوار', 'عدد ادوار', 'عدد الطوابق'], f: 'floorsCount' },
  { p: ['المسطح', 'مسطح', 'بمسطح', 'المساحه', 'مساحه', 'بمساحه', 'مسطحه', 'مساحتها', 'مساحته'], f: 'areaM2' },
  { p: ['المواد', 'الماده', 'ماده', 'مواد', 'المواد المخالفه'], f: 'lawArticles' },
  { p: ['المخالفه', 'المخالفات', 'الاعمال المخالفه', 'الاعمال', 'نوع المخالفه', 'والمخالفه هي', 'المخالفه هي'], f: '' },
  { p: ['مخالفه تانيه', 'مخالفه اخري', 'كمان مخالفه', 'وكمان عمل', 'مخالفه كمان'], f: 'violCustom' },
  { p: ['تاريخ القيد', 'القيد بتاريخ'], f: (c, st, form) => REGD[form] },
  { p: ['رقم القيد', 'القيد رقم', 'قيد رقم', 'رقم السجل', 'القيد'], f: (c, st, form) => REG[form], c: 'reg' },
  { p: ['تاريخ قرار الايقاف', 'تاريخ الايقاف', 'الايقاف بتاريخ'], f: 'stopDate', c: 'stop' },
  { p: ['رقم قرار الايقاف', 'قرار الايقاف رقم', 'قرار ايقاف رقم', 'قرار الايقاف', 'الايقاف رقم', 'رقم الايقاف'], f: 'stopNo', c: 'stop' },
  { p: ['تاريخ المحضر', 'المحضر بتاريخ'], f: 'reportDate', c: 'report' },
  { p: ['رقم محضر المخالفه', 'رقم المحضر', 'المحضر رقم', 'محضر رقم', 'المحضر'], f: 'reportNo', c: 'report' },
  { p: ['تاريخ الاعلان', 'الاعلان بتاريخ', 'اتعلن', 'الاعلان'], f: 'announceDate' },
  { p: ['خلال المده من', 'المده من', 'مده الازاله من', 'المهله من', 'مهله من', 'الازاله من', 'التصحيح من'], f: 'periodFrom', c: 'period' },
  { p: ['تحريرا في', 'تاريخ التحرير', 'اتحرر', 'تحرير القرار'], f: 'issueDate' },
  { p: ['بتاريخ', 'تاريخه', 'تاريخ'], f: (ctx, st, form) => ctx === 'stop' ? 'stopDate' : ctx === 'report' ? 'reportDate' : ctx === 'lic' ? 'licDate' : ctx === 'reg' ? REGD[form] : 'inspDate' },
];
/* compile: longest phrase first */
const PH = [];
KW.forEach((k, i) => k.p.forEach(p => PH.push({ p: fold(p), i })));
PH.sort((a, b) => b.p.length - a.p.length);

const VIOL_RX = [
  ['basement', /(بدروم|دروم)/], ['projections', /(بروز|برواز|ابعاد)/], ['shafts', /(منور|مناور)/], ['columns', /(محاور|اعمده|عواميد|العمدان)/],
  ['extraFloor', /(دور زايد|دور زائد|دور زياده|دور مخالف|زود دور|زوّد دور|بني دور|دور اضافي)/], ['roof', /(صب سقف|السقف|سقف)/],
  ['height', /(ارتفاع)/], ['setback', /(الردود|ردود|ارتداد)/], ['facade', /(واجهه|واجهات)/], ['garage', /(جراج|الجراج)/],
];

const FILLER = /^(و|هو|هي|يعني|اسمه|اسمها|رقم|رقمه|بتاعه|بتاعها|كان|كانت|عبارة عن|:|،|-)\s+/;
function trimVal(v) {
  let s = String(v || '').replace(/[،,.؛:]+\s*$/g, '').replace(/^\s*[،,.؛:]+/, '').trim();
  for (let i = 0; i < 4; i++) { const n = s.replace(FILLER, '').trim(); if (n === s) break; s = n; }
  return s.replace(/\s+(و|يعني)$/, '').trim();
}

const NUMERIC = ['plot', 'licNo', 'reportRegNo', 'stopRegNo', 'removalRegNo', 'stopNo', 'reportNo', 'addrNo'];
const DATES = ['inspDate', 'licDate', 'execDate', 'reportRegDate', 'stopRegDate', 'removalRegDate', 'issueDate', 'stopDate', 'announceDate', 'reportDate', 'periodFrom', 'periodTo'];
const NIDS = ['ownerNid', 'engNid', 'contrNid'];

/* normalise one value for its field (used by both free speech and field-by-field) */
function normalizeValue(key, raw, today) {
  let v = trimVal(raw); if (!v) return '';
  if (NIDS.includes(key)) return numsOf(v).map(String).join('').replace(/\D/g, '');
  if (key === 'licDate') { const n = numsOf(v); if (n.length === 1 && n[0] > 1950 && n[0] < 2100) return String(n[0]); }
  if (key === 'licWorks') return v.replace(/\s*و?(زائد|زايد)\s*/g, ' + ').replace(/\s+/g, ' ').trim();
  if (DATES.includes(key)) return parseDate(v, today);
  if (key === 'inspHour') return parseHour(v);
  if (key === 'floorFrom' || key === 'floorTo') return parseFloor(v);
  if (key === 'floorsCount') { const t = fold(v); if (/دورين/.test(t)) return '2'; if (/^دور( واحد)?$/.test(t)) return '1'; const n = numsOf(v.replace(/ادوار|أدوار|دور/g, ' ')); return n.length ? String(n[0]) : ''; }
  if (key === 'areaM2' || key === 'areaB') { const n = numsOf(v.replace(/متر|مربع|م2|م٢/g, ' ')); return n.length ? String(n[0]) : ''; }
  if (key === 'licYear') { const n = numsOf(v); if (!n.length) return ''; let y = n[0]; if (y < 100) y += 2000; return String(y); }
  if (key === 'plot') {
    /* spoken letter names after the number: "45 لام" -> 45ل */
    const LET = { 'لام': 'ل', 'ميم': 'م', 'نون': 'ن', 'كاف': 'ك', 'باء': 'ب', 'بيه': 'ب', 'بي': 'ب', 'جيم': 'ج', 'دال': 'د', 'هاء': 'هـ', 'ها': 'هـ', 'هه': 'هـ', 'واو': 'و', 'زين': 'ز', 'زاي': 'ز', 'حاء': 'ح', 'حا': 'ح', 'طاء': 'ط', 'طا': 'ط', 'ياء': 'ي', 'يا': 'ي', 'الف': 'أ', 'ألف': 'أ', 'سين': 'س', 'عين': 'ع', 'تاء': 'ت', 'تا': 'ت', 'راء': 'ر', 'را': 'ر', 'فاء': 'ف', 'فا': 'ف', 'صاد': 'ص', 'قاف': 'ق' };
    const w = v.split(/\s+/); const lastW = fold(w[w.length - 1].replace(/^(حرف)$/, ''));
    let letter = '';
    if (w.length > 1 && LET[lastW] !== undefined) { letter = LET[lastW]; w.pop(); if (fold(w[w.length - 1]) === 'حرف') w.pop(); v = w.join(' '); }
    return (spokenToDigits(v).replace(/\s+(?=[\u0621-\u064A]{1,2}$)/, '').replace(/^(رقم)\s*/, '') + letter);
  }
  if (key === 'plot_old') return spokenToDigits(v).replace(/\s+(?=[ء-ي]{1,2}$)/, '').replace(/^(رقم)\s*/, '');
  if (NUMERIC.includes(key)) return spokenToDigits(v).replace(/\s+/g, ' ');
  const LEAD = { street: /^(بشارع|شارع|الشارع)\s+/, addrStreet: /^(بشارع|شارع|الشارع)\s+/, area: /^(بمنطقه|منطقه|المنطقه|مدينه)\s+/, addrArea: /^(بمنطقه|منطقه|المنطقه|مدينه)\s+/,
    addrDistrict: /^(حي)\s+/, addrGov: /^(محافظه|المحافظه)\s+/, ownerName: /^(المالك|المخالف|الاستاذ|السيد)\s+/, engName: /^(المهندس|مهندس|م\/?)\s+/, contrName: /^(المقاول)\s+/ };
  if (LEAD[key]) { const m = fold(v).match(LEAD[key]); if (m) v = v.slice(m[0].length).trim(); }
  return v;
}

/* main entry: transcript -> {values, violations, licensed, log} */
function parseTranscript(text, form, today) {
  const src = clean(text).replace(/\s+/g, ' ').trim();
  const f = fold(src);
  /* find keyword hits (non-overlapping, longest first, on word boundaries; allow و/ب/ف/ل prefix) */
  const hits = []; const taken = new Array(f.length).fill(false);
  for (const { p, i } of PH) {
    let from = 0;
    while (true) {
      const at = f.indexOf(p, from); if (at < 0) break; from = at + 1;
      let s = at;
      const prev = f[at - 1];
      if (at > 0 && prev !== ' ') {
        if (/[وبفل]/.test(prev) && (at - 1 === 0 || f[at - 2] === ' ')) s = at - 1; else continue;
      }
      const e = at + p.length; if (e < f.length && !/[\s،,.؛:]/.test(f[e])) continue;
      let ok = true; for (let x = s; x < e; x++) if (taken[x]) { ok = false; break; }
      if (!ok) continue;
      for (let x = s; x < e; x++) taken[x] = true;
      hits.push({ s, e, k: KW[i], phrase: p });
    }
  }
  hits.sort((a, b) => a.s - b.s);
  /* walk */
  const st = {}; const log = []; let ctx = 'site'; let licensed; const acts = new Set();
  let curKey = null, curStart = 0; const segs = [];
  const close = end => { if (curKey !== null) segs.push({ key: curKey, raw: src.slice(curStart, end) }); };
  for (const h of hits) {
    let key = typeof h.k.f === 'function' ? h.k.f(ctx, st, form) : h.k.f;
    if (key === null || key === undefined) continue;          // not a keyword in this context
    close(h.s);
    if (h.k.a === 'unlicensed') { licensed = false; acts.add('unlicensed'); }
    if (h.k.a === 'conv') acts.add('conv');
    if (key === 'licNo' && licensed === undefined) licensed = true;
    if (h.k.c) ctx = h.k.c; else if (['plot', 'street'].includes(key)) ctx = 'site';
    curKey = key; curStart = h.e;
    if (key && !st[key]) st[key] = '…';                      // mark as seen for context rules
  }
  close(src.length);
  for (const k in st) if (st[k] === '…') delete st[k];
  const values = {};
  for (const sg of segs) {
    if (!sg.key) continue;
    if (sg.key === 'addr') {                                    // "عنوانه 25 ..." -> number first
      const v = trimVal(sg.raw); if (!v) continue;
      const m = toEn(v).match(/^(\d+\S*)\s*(.*)$/);
      if (m) { values.addrNo = values.addrNo || m[1]; if (m[2]) values.addrStreet = values.addrStreet || trimVal(m[2]); }
      else values.addrStreet = values.addrStreet || v;
      log.push({ key: 'addr', raw: sg.raw }); continue;
    }
    const val = normalizeValue(sg.key, sg.raw, today);
    log.push({ key: sg.key, raw: sg.raw.trim(), val });
    if (!val) continue;
    if (sg.key === 'violCustom') values.violCustom = values.violCustom ? values.violCustom + ' و' + val : val;
    else if (!values[sg.key]) values[sg.key] = val;
    else if (sg.key === 'floorFrom' && !values.floorTo) values.floorTo = val;
  }
  /* violations anywhere in the text */
  const viol = []; for (const [k, rx] of VIOL_RX) if (rx.test(f)) viol.push(k);
  if (acts.has('conv') || values.convFrom) viol.push('conv');
  if (licensed === undefined && values.licNo) licensed = true;
  /* site street that the speaker gave as "شارع التقسيم" keeps the word التقسيم only */
  if (values.street) values.street = values.street.replace(/^شارع\s+/, '');
  return { values, violations: [...new Set(viol)], licensed, log };
}

const API = { toAr, toEn, fold, clean, spokenParse, spokenToDigits, numsOf, parseDate, parseHour, parseFloor, normalizeValue, parseTranscript, ORD };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.VParser = API;
})(typeof window !== 'undefined' ? window : globalThis);
