import json, math, numpy as np, os
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
P=json.load(open('pts2.json')); E={p['id']:p for p in json.load(open('pts1e.json'))}
H={}
for f in ['h_a.json','h_b.json','h_c.json','h_d.json']:
    if os.path.exists(f): H.update({int(k):v for k,v in json.load(open(f)).items()})
print('history for',len(H))
V=json.load(open('vil1.json'))
places=json.load(open('in_places.json'))
big=[p for p in places if p[4] in ('PPLA','PPLA2','PPLA3','PPLC') or p[6]>=20000]
ba=np.array([[p[2],p[3]] for p in big])
pts=[]
for p in P:
    h=H.get(p['id']);
    if not h: continue
    q=np.array([x for x in h['q'] if x is not None],float)
    if len(q)<100 or q.max()<=0: continue
    d=((ba[:,0]-p['lat'])**2+((ba[:,1]-p['lng'])*math.cos(math.radians(p['lat'])))**2)
    j=int(np.argmin(d)); near=big[j][1]
    pts.append(dict(id=p['id'],river=p['river'].replace('ä','a').replace('ï','i'),lat=p['lat'],lng=p['lng'],glat=p['glat'],glng=p['glng'],near=near,state='',p50=round(float(np.percentile(q,50)),1),p90=round(float(np.percentile(q,90)),1),max=round(float(q.max()),1),rel=E[p['id']].get('rel'),nv=0))
PI={p['id']:p for p in pts}
vs=[]
for v in V:
    p=PI.get(v['p'])
    if not p or v.get('el') is None or p['rel'] is None: continue
    hgt=round(v['el']-p['rel'],1)
    p['nv']+=1
    if not p['state'] and v['st']: p['state']=v['st']
    if hgt<=8: vs.append(dict(id=v['id'],n=v['n'],lat=round(v['lat'],4),lng=round(v['lng'],4),st=v['st'],dr=v['dr'],h=hgt,p=v['p']))
R=json.load(open('../data/ne_rivers.geojson')); C=json.load(open('../data/countries.geojson'))
poly=unary_union([shape(f['geometry']).buffer(0) for f in C['features'] if f['properties']['name'] in ('India','Nepal','Bangladesh','Bhutan')]).buffer(0.2)
lines=[]
for f in R['features']:
    g=shape(f['geometry'])
    if not g.intersects(poly): continue
    g=g.intersection(poly).simplify(0.01)
    for part in (g.geoms if hasattr(g,'geoms') else [g]):
        if part.geom_type=='LineString' and len(part.coords)>1: lines.append(dict(river=f['properties'].get('name_en') or '',path=[[round(x,3),round(y,3)] for x,y in part.coords]))
os.makedirs('../map/public/india',exist_ok=True)
json.dump(dict(points=pts,lines=lines),open('../map/public/india/rivers.json','w'),separators=(',',':'),ensure_ascii=False)
json.dump(vs,open('../map/public/india/villages.json','w'),separators=(',',':'),ensure_ascii=False)
print('points',len(pts),'villages kept',len(vs),'lines',len(lines),os.path.getsize('../map/public/india/rivers.json')//1024,'KB',os.path.getsize('../map/public/india/villages.json')//1024,'KB')
