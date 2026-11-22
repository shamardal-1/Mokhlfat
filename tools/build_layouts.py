"""Resolve every fillable blank on the 18 template pages (6 variants x 3 forms) to PDF-point boxes.
Output: layouts.json  {variant: {form: [ {k, x0, x1, y, kind} ]}}  (y = text baseline, points, top-left origin)
kind: dots (write centred over dotted leader) | span (write centred in a gap of printed text)
      date (white-out the printed "/ /" then write centred) | after (right-aligned after a printed word)
"""
import json, sys, glob, re, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from words import words

VAR = {'S1': 'f9a777f5', 'S2': '1252b7dd', 'S3': 'bc8492ba', 'H1': '5acca508', 'H2': '51e22471', 'H3': 'cfd87a0d'}
PAGE = {'report': 1, 'stop': 2, 'removal': 3}

def load(v, form):
    pdf = os.path.join(ROOT, 'www', 'tpl', v + '.pdf')
    ws = words(pdf, PAGE[form])
    isdot = lambda w: '.' in w['t'] and w['t'].strip('.:') == ''
    texts = [w for w in ws if not isdot(w)]
    dots = sorted([w for w in ws if isdot(w)], key=lambda w: (round(w['y1']), w['x0']))
    runs = []
    for d in dots:
        if runs and abs(runs[-1]['y1'] - d['y1']) < 1.5 and d['x0'] - runs[-1]['x1'] < 4:
            runs[-1]['x1'] = max(runs[-1]['x1'], d['x1'])
        else:
            runs.append(dict(d))
    # lines of text words
    lines = []
    for w in sorted(texts, key=lambda w: w['y1']):
        for l in lines:
            if abs(l['y'] - w['y1']) < 3.5: l['w'].append(w); break
        else: lines.append(dict(y=w['y1'], w=[w]))
    for l in lines:
        l['w'].sort(key=lambda w: -w['x1'])
        hs = sorted(w['y1'] - 0.22 * (w['y1'] - w['y0']) for w in l['w'] if len(w['t']) > 1)
        l['base'] = hs[len(hs) // 2] if hs else l['y']
    return lines, runs

def find_line(lines, need, nth=0):
    hits = [l for l in lines if all(any(w['t'] == n for w in l['w']) for n in need)]
    if len(hits) <= nth: raise KeyError(f'line {need}')
    return hits[nth]

def word(l, t, nth=0):
    m = [w for w in l['w'] if w['t'] == t]
    if len(m) <= nth: raise KeyError(f'word {t}#{nth} in line')
    return m[nth]

def resolve(lines, runs, spec):
    kind = spec['kind']; l = find_line(lines, spec['line'], spec.get('ln', 0))
    R = word(l, spec['r'], spec.get('rn', 0))
    if kind == 'dots':
        c = [r for r in runs if -7 < r['y1'] - l['y'] < 6.5 and r['x1'] <= R['x0'] + 3]
        if not c: raise KeyError(f"dots left of {spec['r']} on {spec['line']}")
        r = max(c, key=lambda r: r['x1'])
        return dict(x0=r['x0'], x1=r['x1'], y=r['y1'] - 3.2)
    x1 = R['x0'] - 2
    if 'l' in spec:
        cand = sorted([w for w in l['w'] if w['t'] == spec['l'] and w['x1'] <= R['x0'] + 1], key=lambda w: -w['x1'])
        if not cand: raise KeyError(f"left word {spec['l']}")
        x0 = cand[0]['x1'] + 2
    else: x0 = spec.get('xl', 42)
    return dict(x0=x0, x1=x1, y=l['base'])

# ---------- common fields per form ----------
D = lambda k, line, r, **kw: dict(k=k, kind='dots', line=line, r=r, **kw)
S = lambda k, line, r, **kw: dict(k=k, kind='span', line=line, r=r, **kw)
T = lambda k, line, r, **kw: dict(k=k, kind='date', line=line, r=r, **kw)
A = lambda k, line, r, **kw: dict(k=k, kind='after', line=line, r=r, **kw)

COMMON = {
 'report': [
  D('reportRegNo', ['القید', 'السجل'], ':'),
  T('reportRegDate', ['التارخ'], ':', l='م'),
  D('employee', ['الموظف'], ':'),
  T('inspDate', ['تارخ', 'المعاینة'], ':', l='م'),
  D('inspHour', ['الساعة'], ':', rn=1),
  D('inspector', ['المهندس', 'القائم'], ':'),
  A('jobSuffix', ['الوظفة'], 'مهنـــدس', xl=60),
  D('licNo', ['واقع', 'ملف'], 'رقم'),
  D('licYear', ['واقع', 'ملف'], 'لسنة'),
  D('ownerName', ['قومي', 'رقم'], ':'),
  D('ownerNid', ['قومي', 'رقم'], 'قومي'),
  D('capacity', ['صفة'], 'مستأجر/'),
  D('addrNo', ['عقار'], ':'),
  D('addrStreet', ['عقار'], 'شارع'),
  D('addrDistrict', ['حــي:'], 'حــي:'),
  D('addrArea', ['حــي:'], ':'),
  D('addrGov', ['حــي:'], 'محافظة:'),
  D('plot', ['القطعة'], ':'),
  D('lawArticles', ['للمواد'], 'للمواد'),
  D('stopNo', ['إقاف', 'فقد'], 'رقم', rn=1),
  T('stopDate', ['إقاف', 'فقد'], ':', rn=1, l='م'),
  D('S_inspector', ['ســم'], ':'),
  D('S_tanzeem', ['ســم'], ':', rn=1),
 ],
 'stop': [
  D('stopRegNo', ['القید', 'السجل'], ':'),
  T('stopRegDate', ['التارخ'], ':', l='م'),
  D('employee', ['الموظف'], ':'),
  T('inspDate', ['تارخ', 'المعاینة'], ':', l='م'),
  D('inspHour', ['الساعة'], ':', rn=1),
  D('inspector', ['إسم', 'القائم'], ':'),
  D('jobFull', ['إسم', 'القائم'], ':', rn=1),
  D('plot', ['القطعة'], ':'),
  D('composed', ['المكون'], ':'),
  D('licNo', ['صدور'], ':'),
  T('licDate', ['صدور'], ':', rn=1, l='م'),
  T('execDate', ['صدور'], ':', rn=2, l='م', ln_m=1),
  D('licWorks', ['المرخص', 'بها'], ':'),
  D('ownerName', ['لصالحه'], ':'),
  D('ownerNid', ['لصالحه'], 'قومي'),
  D('engName', ['إسم', 'المهندس', 'قومي'], ':'),
  D('engNid', ['إسم', 'المهندس', 'قومي'], 'قومي'),
  D('contrName', ['المقاول', 'المنفذ'], ':'),
  D('contrNid', ['المقاول', 'المنفذ'], 'قومي'),
  D('S_responsible', ['اإلســـــــم'], ':'),
  D('S_tanzeem', ['اإلســـــــم'], ':', rn=1),
  D('S_gm', ['اإلســـــــم'], ':', rn=2),
  T('issueDate', ['حتريرا'], ':', l='م'),
 ],
 'removal': [
  D('removalRegNo', ['القید', 'السجل'], ':'),
  T('removalRegDate', ['التارخ'], ':', l='م'),
  D('employee', ['الموظف'], ':'),
  D('plot', ['القطعة:'], 'القطعة:'),
  D('licNo', ['نوع'], ':'),
  T('licDate', ['نوع'], ':', rn=1, l='نوع'),
  D('licType', ['نوع'], ':', rn=2),
  D('licWorks', ['بها:'], 'بها:'),
  D('ownerName', ['سم:'], 'سم:'),
  D('ownerNid', ['سم:'], 'قومي'),
  D('addrNo', ['العنوان'], ':', rn=1),
  D('addrStreet', ['العنوان'], ':', rn=2),
  D('addrDistrict', ['حــي'], ':'),
  D('addrArea', ['حــي'], ':', rn=1),
  D('addrGov', ['حــي'], ':', rn=2),
  D('engName', ['المهندس', 'سم'], ':'),
  D('engNid', ['المهندس', 'سم'], 'قومي'),
  D('contrName', ['المقاول', 'المنفذ'], ':'),
  D('contrNid', ['المقاول', 'المنفذ'], 'قومي'),
  D('stopNo', ['قرار', 'اإلقاف'], ':'),
  T('stopDate', ['قرار', 'اإلقاف'], ':', rn=1, l='تارخ', lnn=1),
  T('announceDate', ['قرار', 'اإلقاف'], ':', rn=2, xl=48),
  D('reportNo', ['محضر', 'المخالفة'], ':'),
  T('reportDate', ['محضر', 'المخالفة'], ':', rn=1, xl=240),
  T('periodFrom', ['المدة', 'خالل'], 'من', l='≈'),
  T('periodTo', ['المدة', 'خالل'], '≈', xl=86),
  D('S_responsible', ['اإلسـم'], ':'),
  D('S_tanzeem', ['اإلسـم'], ':', rn=1),
  D('S_gm', ['اإلسـم'], ':', rn=2),
  D('S_legal', ['اإلسـم'], ':', rn=3),
 ],
}
# region-specific site fields (الهرم templates have blanks, صحراء الأهرام has them printed)
HARAM = {
 'report': [D('street', ['القطعة'], 'شارع'), D('area', ['الهــــرم'], 'منطقة')],
 'stop': [D('street', ['القطعة'], 'شارع'), D('area', ['مدینة'], 'مدینة')],
 'removal': [D('street', ['القطعة:'], 'شارع'), D('area', ['منطقة', 'محافظة'], 'منطقة', r2=':')],
}

# ---------- narrative blanks per variant ----------
N = {
 'S1': {
  'report': [S('floorOne', ['صب', 'وناء'], 'الدور', l='بدون', lnn=1), S('areaM2', ['مسطح', 'حوالي'], 'حوالي', l='وتكلفة'),
             S('cost', ['مسطح', 'حوالي'], 'إجمالة', xl=42)],
  'stop': [S('floorOne', ['بصب', 'وبناء'], 'الدور', l='بدون'), S('areaM2', ['بصب', 'وبناء'], 'حوالي', l='مما')],
  'removal': [S('floorOne', ['بصب', 'وبناء'], 'الدور', l='بدون'), S('areaM2', ['مبسطح', 'مما'], 'ي', l='مما')],
 },
 'S2': {
  'report': [S('licNo', ['الرسومات', 'رقم:'], 'رقم:', l='لسنة'), S('licYear', ['الرسومات', 'رقم:'], 'لسنة', xl=40),
             S('areaB', ['البدروم', 'العلوي'], 'حوالي', l='وتكلفة'), S('costB', ['البدروم', 'العلوي'], 'إجمالیة', xl=40),
             S('floorOne', ['بالدور'], 'بالدور', xl=40), S('areaM2', ['بمسطح', 'وبتكلفة'], 'بمسطح', l='وبتكلفة'),
             S('cost', ['بمسطح', 'وبتكلفة'], 'إجمالیة', xl=40)],
  'stop': [S('licNo', ['الرســومات'], 'رقــم:', l='لســنة'), S('licYear', ['الرســومات'], 'لســنة', l='وذلــك'),
           S('areaB', ['البدروم', 'السفلي'], 'حوالي', l='وزیادة'),
           S('floorOne', ['بالدور'], 'بالدور', l='وذلك', lnn=1), S('areaM2', ['بالدور'], 'بمسطح', l='مما')],
  'removal': [S('licNo', ['مبخالفة', 'رقم:'], 'رقم:', xl=44), S('licYear', ['لسنة', 'بعدم'], 'لسنة', l='وذلك'),
              S('areaB', ['البدروم', 'السفلي'], 'حوايل', l='وزيادة'),
              S('floorOne', ['بالدور'], 'بالدور', l='وذلك', lnn=1), S('areaM2', ['بالدور'], 'مبسطح', xl=44)],
 },
 'S3': {
  'report': [S('licNo', ['الرسومات', 'رقم:'], 'رقم:', l='لسنة'), S('licYear', ['الرسومات', 'رقم:'], 'لسنة', xl=40),
             S('floorOne', ['بزیادة'], 'الدور', xl=40), S('areaM2', ['بمسطح', 'وبتكلفة'], 'بمسطح', l='وبتكلفة'),
             S('cost', ['بمسطح', 'وبتكلفة'], 'إجمالیة', xl=40)],
  'stop': [S('licNo', ['الرسومات', 'رقم:'], 'رقم:', l='لسنة'), S('licYear', ['الرسومات', 'رقم:'], 'لسنة', l='وذلك'),
           S('floorOne', ['الردود', 'وتقلیل'], 'الدور', l='وذلك'), S('areaM2', ['الردود', 'وتقلیل'], 'بمسطح', l='مما')],
  'removal': [S('licNo', ['مبخالفة', 'رقم:'], 'رقم:', xl=44), S('licYear', ['لسنة', 'زيادة'], 'لسنة', l='و'),
              S('floorOne', ['منطقة', 'الردود'], 'الدور', xl=44), S('areaM2', ['مبسطح', 'مما'], 'مبسطح', l='مما')],
 },
 'H1': {
  'report': [S('floorOne', ['بصب', 'وبناء'], 'الدور', l='بدون', lnn=1), S('areaM2', ['بمسطح', 'وبتكلفة'], 'حوالي', l='وبتكلفة'),
             S('cost', ['بمسطح', 'وبتكلفة'], 'حوالي', rn=1, xl=42)],
  'stop': [S('floorOne', ['بصب', 'وبناء'], 'الدور', l='بدون'), S('areaM2', ['بصب', 'وبناء'], 'حوالي', l='مما')],
  'removal': [S('floorOne', ['بصب', 'وبناء'], 'الدور', xl=44), S('areaM2', ['مبسطح', 'حوايل'], 'حوايل', xl=44)],
 },
 'H2': {
  'report': [S('licNo', ['الرسومات', 'رقم:'], 'رقم:', l='لسنة'), S('licYear', ['الرسومات', 'رقم:'], 'لسنة', l='وذلك'),
             S('floorFrom', ['األدوار', 'حتى'], 'األدوار', l='حتى'), S('floorTo', ['األدوار', 'حتى'], 'حتى', l='وذلك'),
             S('areaM2', ['األدوار', 'حتى'], 'حوالي', xl=40), S('cost', ['وبتكلفة', 'إجمالیة'], ':', xl=40)],
  'stop': [S('licNo', ['الرسومات', 'رقم:'], 'رقم:', l='لسنة'), S('licYear', ['الرسومات', 'رقم:'], 'لسنة', l='وذلك'),
           S('floorFrom', ['األدوار', 'إلى'], 'من', l='إلى'), S('floorTo', ['األدوار', 'إلى'], 'إلى', l='وذلك'),
           S('areaM2', ['األدوار', 'إلى'], 'حوالي', l='مما')],
  'removal': [S('licNo', ['مبخالفة', 'رقم:'], 'رقم:', xl=44), S('licYear', ['لسنة', 'لتغيري'], 'لسنة', l='وذلك'),
              S('floorFrom', ['األدوار', 'حىت'], 'األدوار', l='حىت'), S('floorTo', ['األدوار', 'حىت'], 'حىت', xl=44),
              S('areaM2', ['مبسطح', 'مما'], 'حوايل', l='مما')],
 },
 'H3': {
  'report': [S('licNo', ['الرســومات'], 'رقــم:', l='لســنة'), S('licYear', ['الرســومات'], 'لســنة', l='وذلــك'),
             S('floorFrom', ['األدوار', 'حتى'], 'األدوار', l='حتى'), S('floorTo', ['األدوار', 'حتى'], 'حتى', l='ذلك'),
             S('areaM2', ['األدوار', 'حتى'], 'حوالي', xl=40), S('cost', ['وبتكلفة', 'إجمالیة'], 'إجمالیة', xl=40)],
  'stop': [S('licNo', ['الرسومات', 'رقم:'], 'رقم:', l='لسنة'), S('licYear', ['الرسومات', 'رقم:'], 'لسنة', l='وذلك'),
           S('floorFrom', ['األدوار', 'إلى'], 'من', l='إلى'), S('floorTo', ['األدوار', 'إلى'], 'إلى', l='وذلك'),
           S('areaM2', ['األدوار', 'إلى'], 'حوالي', xl=40)],
  'removal': [S('licNo', ['مبخالفة', 'رقم:'], 'رقم:', xl=44), S('licYear', ['لسنة', 'لعدم'], 'لسنة', l='وذلك'),
              S('floorFrom', ['األدوار', 'عن'], 'األدوار', xl=44), S('floorTo', ['حىت', 'مبسطح'], 'حىت', l='وذلك'),
              S('areaM2', ['حىت', 'مبسطح'], 'حوايل', l='مما')],
 },
}

out = {}; errors = []
for v in VAR:
    out[v] = {}
    for form in PAGE:
        lines, runs = load(v, form)
        specs = COMMON[form] + (HARAM[form] if v.startswith('H') else []) + N[v][form]
        res = []
        for sp in specs:
            try:
                sp2 = dict(sp)
                if sp2.get('r2'):  # dots left of a later colon on the line
                    l = find_line(lines, sp2['line']); R = word(l, sp2['r'])
                    cs = [w for w in l['w'] if w['t'] == sp2['r2'] and w['x1'] <= R['x0'] + 1]
                    c = [r for r in runs if -7 < r['y1'] - l['y'] < 6.5 and r['x1'] <= cs[0]['x0'] + 3]
                    r = max(c, key=lambda r: r['x1']); box = dict(x0=r['x0'], x1=r['x1'], y=r['y1'] - 3.2)
                else:
                    box = resolve(lines, runs, sp2)
                if sp['kind'] == 'date' and sp.get('l') == 'م':
                    # date region ends at the printed "م" of "٢٠م": cover from that م to the colon
                    l = find_line(lines, sp['line']); R = word(l, sp['r'], sp.get('rn', 0))
                    ms = sorted([w for w in l['w'] if w['t'] == 'م' and w['x1'] < R['x0']], key=lambda w: -w['x1'])
                    box['x0'] = ms[0]['x0'] - 1
                if box['x1'] - box['x0'] < 12: raise ValueError(f"tiny box {box}")
                res.append(dict(k=sp['k'], kind=sp['kind'], x0=round(box['x0'], 1), x1=round(box['x1'], 1), y=round(box['y'], 1)))
            except Exception as e:
                errors.append(f'{v} {form} {sp["k"]}: {e}')
        out[v][form] = res
open(os.path.join(ROOT, 'www', 'js', 'layouts.js'), 'w').write('/* generated by tools/build_layouts.py from www/tpl/*.pdf — boxes in PDF points (top-left origin), y = baseline */\nconst LAYOUTS=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('\n'.join(errors) or 'no errors')
for v in out:
    print(v, {f: len(out[v][f]) for f in out[v]})
