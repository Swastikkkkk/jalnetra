import json, math, collections, numpy as np, rasterio, warnings
from rasterio.windows import from_bounds
warnings.filterwarnings('ignore')
V=json.load(open('vil0.json')); P=json.load(open('pts1.json'))
def tile(lat,lng):
    n=math.floor(lat); e=math.floor(lng)
    t=f"Copernicus_DSM_COG_30_{'N' if n>=0 else 'S'}{abs(n):02d}_00_{'E' if e>=0 else 'W'}{abs(e):03d}_00_DEM"
    return t
groups=collections.defaultdict(list)
for i,v in enumerate(V): groups[tile(v['lat'],v['lng'])].append(('v',i))
for i,p in enumerate(P): groups[tile(p['lat'],p['lng'])].append(('p',i))
print('tiles',len(groups),flush=True)
done=0
for t,items in groups.items():
    u=f'https://copernicus-dem-90m.s3.amazonaws.com/{t}/{t}.tif'
    try:
        with rasterio.open(u) as src:
            a=src.read(1).astype(np.float32)
            T=src.transform
            for kind,i in items:
                o=V[i] if kind=='v' else P[i]
                c,r=~T*(o['lng'],o['lat']); r=int(r); c=int(c)
                if kind=='v':
                    w=a[max(0,r-1):r+2,max(0,c-1):c+2]; o['el']=round(float(np.median(w)),1)
                else:
                    w=a[max(0,r-20):r+21,max(0,c-20):c+21]  # ~3.6 km box
                    o['rel']=round(float(np.percentile(w[w>-100],5)),1) if (w>-100).any() else None
    except Exception as ex:
        print(t,'ERR',str(ex)[:80],flush=True)
    done+=1
    if done%20==0: print(done,flush=True)
json.dump(V,open('vil1.json','w')); json.dump(P,open('pts1e.json','w'))
print('villages with el',sum('el' in v for v in V),'points with rel',sum(p.get('rel') is not None for p in P))
