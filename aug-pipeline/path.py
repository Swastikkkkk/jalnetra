import numpy as np, rasterio, json, math, warnings
from rasterio.vrt import WarpedVRT
from rasterio.transform import from_origin
from rasterio.enums import Resampling
import planetary_computer as pc
from pystac_client import Client
from skimage.graph import route_through_array
warnings.filterwarnings('ignore')
cat = Client.open('https://planetarycomputer.microsoft.com/api/stac/v1', modifier=pc.sign_inplace)
W,S,E,N=84.30,27.55,85.60,28.40; res=0.0009
w=int((E-W)/res); h=int((N-S)/res); tr=from_origin(W,N,res,res)
dem=np.full((h,w),np.nan,np.float32)
for it in cat.search(collections=['cop-dem-glo-90'],bbox=[W,S,E,N]).items():
    with rasterio.open(it.assets['data'].href) as src:
        with WarpedVRT(src,crs='EPSG:4326',transform=tr,width=w,height=h,resampling=Resampling.bilinear,nodata=np.nan,dtype='float32') as v: a=v.read(1)
    m=np.isnan(dem)&np.isfinite(a)&(a>-100); dem[m]=a[m]
print('dem',np.isnan(dem).mean())
np.save('dem.npy',dem)
WP=[('Collapse site, Langtang Lirung',85.5252,28.2853),('Rasuwagadhi border',85.3790,28.2760),('Syaprubesi',85.3470,28.1600),('Betrawati',85.1870,27.9720),('Trishuli Bazar',85.1480,27.9150),('Galchhi',84.8780,27.7950),('Mugling',84.5560,27.8550),('Devghat',84.4320,27.7120)]
rc=lambda x,y:(int((N-y)/res),int((x-W)/res))
cost=np.nan_to_num(dem,nan=9000); cost=(cost-np.nanmin(dem))/50+1
cost=cost**2
path=[]
for a,b in zip(WP,WP[1:]):
    p,_=route_through_array(cost,rc(a[1],a[2]),rc(b[1],b[2]),fully_connected=True,geometric=True)
    path+= p if not path else p[1:]
pts=[[round(W+(c+.5)*res,4),round(N-(r+.5)*res,4)] for r,c in path]
def hav(a,b):
    r=math.pi/180;dl=(b[1]-a[1])*r;dn=(b[0]-a[0])*r
    return 12742*math.asin(math.sqrt(math.sin(dl/2)**2+math.cos(a[1]*r)*math.cos(b[1]*r)*math.sin(dn/2)**2))
km=[0.0]
for i in range(1,len(pts)): km.append(km[-1]+hav(pts[i-1],pts[i]))
# simplify: keep every 3rd point
keep=list(range(0,len(pts),3))+[len(pts)-1]
pts=[pts[i] for i in keep]; km=[round(km[i],2) for i in keep]
places=[]
for n,x,y in WP:
    i=min(range(len(pts)),key=lambda j:hav(pts[j],(x,y)))
    places.append({'name':n,'lng':x,'lat':y,'km':km[i],'elev':round(float(dem[rc(x,y)]))})
json.dump({'path':pts,'km':km,'places':places},open('trishuli.json','w'))
print(len(pts),km[-1]); print(places)
