import json, math
import numpy as np
from shapely.geometry import shape, Point, LineString
from shapely.strtree import STRtree
from shapely.ops import unary_union
V=json.load(open('in_places.json')); P=json.load(open('pts1.json'))
st={l.split('\t')[0].split('.')[1]:l.split('\t')[1] for l in open('admin1.txt') if l.startswith('IN.')}
R=json.load(open('../data/ne_rivers.geojson'))
C=json.load(open('../data/countries.geojson'))
poly=unary_union([shape(f['geometry']).buffer(0) for f in C['features'] if f['properties']['name'] in ('India','Nepal','Bangladesh','Bhutan')])
lines=[]
for f in R['features']:
    g=shape(f['geometry'])
    if g.intersects(poly): lines.append(g.intersection(poly.buffer(0.1)))
river=unary_union(lines)
# km per degree approx at lat ~ 23
kx=111.32*math.cos(math.radians(23)); ky=111.32
buf=river.buffer(6/100)  # ~6 km (coarse, refined below)
tree=STRtree([Point(v[3],v[2]) for v in V])
idx=tree.query(buf, predicate='intersects')
print('candidates',len(idx))
parr=np.array([[p['lng'],p['lat']] for p in P])
out=[]
for i in idx:
    v=V[i]
    if v[4] in ('PPLQ','PPLH','PPLW'): continue
    pt=Point(v[3],v[2]); d=river.distance(pt)
    np_=river.interpolate(river.project(pt)) if river.geom_type=='LineString' else None
    dkm=d*111.32*math.cos(math.radians(v[2]))
    if dkm>6: continue
    j=int(np.argmin(((parr[:,0]-v[3])*math.cos(math.radians(v[2])))**2+(parr[:,1]-v[2])**2))
    out.append(dict(id=v[0],n=v[1],lat=v[2],lng=v[3],st=st.get(v[5],''),pop=v[6],dr=round(dkm,2),p=P[j]['id']))
print(len(out))
json.dump(out,open('vil0.json','w'))
import collections; c=collections.Counter(o['p'] for o in out); print('points with villages',len(c),'max',c.most_common(3))
