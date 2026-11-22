import re,unicodedata,subprocess,sys,json
def words(pdf,page):
    out=subprocess.run(['pdftotext','-bbox','-f',str(page),'-l',str(page),pdf,'-'],capture_output=True,text=True).stdout
    ws=[]
    for x0,y0,x1,y1,t in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>',out):
        t=unicodedata.normalize('NFKC',t.replace('&amp;','&').replace('&lt;','<').replace('&gt;','>')).replace('�','')
        if re.search(r'[؀-ۿ]',t) and not re.fullmatch(r'[\d٠-٩۰-۹.:/]+',t): t=t[::-1]
        ws.append(dict(x0=float(x0),y0=float(y0),x1=float(x1),y1=float(y1),t=t))
    return ws
def lines(ws,tol=3.5):
    # group by baseline (y1)
    ws=sorted(ws,key=lambda w:w['y1'])
    L=[]
    for w in ws:
        if w['t'].strip('.')=='' : yb=w['y1']-4.5   # dots sit lower
        else: yb=w['y1']
        for l in L:
            if abs(l['y']-yb)<tol: l['w'].append(w);break
        else: L.append(dict(y=yb,w=[w]))
    for l in L: l['w'].sort(key=lambda w:-w['x1'])
    return sorted(L,key=lambda l:l['y'])
def merge_dots(lw):
    out=[]
    for w in lw:
        isd=w['t'].strip('.:')=='' and '.' in w['t']
        if isd and out and out[-1].get('dots') and out[-1]['x0']-w['x1']<4:
            out[-1]['x0']=min(out[-1]['x0'],w['x0'])
        else:
            d=dict(w);d['dots']=isd;out.append(d)
    return out
if __name__=='__main__':
    pdf,page=sys.argv[1],int(sys.argv[2])
    for l in lines(words(pdf,page)):
        ws=merge_dots(l['w'])
        print(f"{l['y']:6.1f} | "+'  '.join((f"[…{w['x0']:.0f}-{w['x1']:.0f}]" if w['dots'] else f"{w['t']}<{w['x0']:.0f}-{w['x1']:.0f}>") for w in ws))
