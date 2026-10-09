import numpy as np, rasterio, warnings, json, sys
from rasterio.vrt import WarpedVRT
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from PIL import Image
import planetary_computer as pc
from pystac_client import Client
warnings.filterwarnings('ignore')
cat = Client.open('https://planetarycomputer.microsoft.com/api/stac/v1', modifier=pc.sign_inplace)
def mosaic(items, bb, res, asset='visual'):
    W,S,E,N = bb; w=int(round((E-W)/res)); h=int(round((N-S)/res)); tr=from_origin(W,N,res,res)
    acc=np.zeros((h,w,3),np.uint8); have=np.zeros((h,w),bool)
    for it in items:
        with rasterio.open(it.assets[asset].href) as src:
            with WarpedVRT(src, crs='EPSG:4326', transform=tr, width=w, height=h, resampling=Resampling.average) as v:
                a=np.moveaxis(v.read([1,2,3]),0,-1)
        m=~have & (a.sum(2)>0); acc[m]=a[m]; have|=m
        print(it.id, round(have.mean(),3), flush=True)
        if have.mean()>0.995: break
    return acc
def get(bb, dt, cc):
    its=list(cat.search(collections=['sentinel-2-l2a'],bbox=bb,datetime=dt,query={'eo:cloud_cover':{'lt':cc}}).items())
    its=sorted(its,key=lambda i:i.properties['eo:cloud_cover']); seen=set(); out=[]
    for i in its:
        t=i.properties.get('s2:mgrs_tile') or i.id.split('_')[5]
        k=(t,i.properties.get('sat:relative_orbit'))
        if k not in seen: seen.add(k); out.append(i)
    return out
job=sys.argv[1]
if job=='src':
    bb=[85.36,28.19,85.58,28.34]
    for name,dt in [('before','2025-12-15/2025-12-15'),('after','2026-09-28/2026-10-01')]:
        a=mosaic(get(bb,dt,30),bb,0.00012)
        Image.fromarray(a).save(f'{name}.jpg',quality=80); print(name,a.shape)
    json.dump({'bounds':bb},open('src_meta.json','w'))
if job=='valley':
    bb=[84.30,27.55,85.60,28.40]
    a=mosaic(get(bb,'2025-11-01/2026-02-15',10),bb,0.0006)
    Image.fromarray(a).save('valley.jpg',quality=78); json.dump({'bounds':bb},open('valley_meta.json','w')); print(a.shape)
