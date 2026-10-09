import json, math
from shapely.geometry import shape, Point, LineString
from shapely.ops import unary_union
C=json.load(open('../data/countries.geojson'))
names={f['properties'].get('ADMIN') or f['properties'].get('NAME') for f in C['features']}
keep=[f for f in C['features'] if f['properties'].get('name') in ('India','Nepal','Bangladesh','Bhutan')]
print([f['properties'].get('name') for f in keep])
poly=unary_union([shape(f['geometry']).buffer(0) for f in keep]); india=unary_union([shape(f['geometry']).buffer(0) for f in keep if f['properties'].get('name')=='India'])
R=json.load(open('../data/ne_rivers.geojson'))
def hav(a,b):
    r=math.pi/180;dl=(b[1]-a[1])*r;dn=(b[0]-a[0])*r
    return 12742*math.asin(math.sqrt(math.sin(dl/2)**2+math.cos(a[1]*r)*math.cos(b[1]*r)*math.sin(dn/2)**2))
pts=[];SP=40
for f in R['features']:
    g=f['geometry']; lines=[g['coordinates']] if g['type']=='LineString' else g['coordinates']
    name=f['properties'].get('name_en') or f['properties'].get('name') or 'River'
    for L in lines:
        if not any(poly.contains(Point(c)) for c in L[::3]): continue
        acc=SP
        for a,b in zip(L[:-1],L[1:]):
            d=hav(a,b); n=max(1,int(d/2))
            for k in range(n):
                p=(a[0]+(b[0]-a[0])*k/n, a[1]+(b[1]-a[1])*k/n); acc+=d/n
                if acc>=SP and poly.contains(Point(p)):
                    pts.append(dict(river=name,lng=round(p[0],4),lat=round(p[1],4),india=india.contains(Point(p)))); acc=0
print(len(pts), sum(p['india'] for p in pts))
import collections; print(collections.Counter(p['river'] for p in pts).most_common(60))
json.dump(pts,open('pts0.json','w'))
