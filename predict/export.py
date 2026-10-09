import numpy as np, json, math, datetime as dt, sys
sys.path.insert(0,'/root/jalnetra-flood/geo'); from grid import *
from PIL import Image
from sklearn.linear_model import LogisticRegression
G='/root/jalnetra-flood/geo/'; OUT='/root/jalnetra-flood/map/src/'
D=json.load(open(OUT+'data.json')); meta=json.load(open(G+'s1_meta.json'))
hand=np.load(G+'hand.npy'); dk=np.load(G+'dist_km.npy'); normal=np.load(G+'occ.npy')>=50; ch=np.load('chain.npy')
F=3; H3,W3=HEIGHT//F,WIDTH//F
def blk(a,fn):
    a=a[:H3*F,:W3*F].reshape(H3,F,W3,F); return fn(fn(a,axis=3),axis=1)
hm=blk(np.nan_to_num(hand,nan=99).astype(np.float32),np.mean); dm=blk(dk,np.mean); cm=blk(np.nan_to_num(ch,nan=0),np.mean); nm=blk(normal.astype(np.float32),np.mean)>=0.5
R=np.clip(np.round((hm+5)*10),0,253).astype(np.uint8); R[dm>15]=255; R[nm]=254
Gc=np.clip(np.round(cm/2),0,255).astype(np.uint8); B=np.clip(np.round(dm*10),0,255).astype(np.uint8)
img=np.dstack([R,Gc,B,np.full_like(R,255)])
Image.fromarray(img,'RGBA').save(OUT+'img/terrain.png',optimize=True)
import os; print('terrain.png',os.path.getsize(OUT+'img/terrain.png')//1024,'KB',H3,W3)
# stations + celerity
S=D['river']['stations']; skm=[s['km'] for s in S]
sq=np.array([s['q'] for s in S],float)
def peak_t(q):
    i=int(np.argmax(q)); 
    if 0<i<len(q)-1:
        a,b,c=q[i-1],q[i],q[i+1]; off=0.5*(a-c)/(a-2*b+c); return i+off
    return float(i)
pk=[peak_t(q) for q in sq]
c=np.polyfit(np.array(pk)*24, skm, 1)[0]
print('peak days',np.round(pk,2),'celerity km/h',round(c,2))
# rain: catchment mean daily
RN=json.load(open('/root/jalnetra-flood/data/rain_nepal_2026.json'))
rain=np.mean([p['p'] for p in RN['points']],axis=0)
# rain-discharge coefficient: rise at Devghat vs rain in prior 3 days
VM=json.load(open('village_model.json')); PM=json.load(open('pixel_model.json'))
# leave-one-out village coefs
LOO={k:dict(b0=v['b0'],b=v['coef']) for k,v in VM['res'].items()}
# refit full with C=1 (same as calib3)
feats=[{**f,'ch':round(f['ch'],1),'h10':round(f['h10'],2),'hc':round(f['hc'],2),'d':round(f['d'],2)} for f in VM['feats']]
# POIs
O=json.load(open(G+'osm.json')); pois=[]
for s in O['shelters']:
    x,y=s['g']; r=int((N-y)/RES); cc=int((x-W)/RES)
    if not(0<=r<HEIGHT and 0<=cc<WIDTH): continue
    if dk[r,cc]>20: continue
    pois.append(dict(n=s.get('name') or ('School' if s['amenity']=='school' else 'Hospital'),a=s['amenity'][0],x=round(x,5),y=round(y,5),h=round(float(np.nan_to_num(hand[r,cc],nan=99)),1),ch=round(float(ch[r,cc]),1)))
print('pois',len(pois))
model=dict(
  version='2026.10-a',
  grid=dict(w=W,n=N,res=RES*F,cols=W3,rows=H3,enc='R=(hand+5)*10 (254 river, 255 outside 15 km); G=chainage/2 km; B=distance to river*10 km'),
  stations=[dict(name=s['name'],label=s['label'],km=s['km'],lng=s['lng'],lat=s['lat']) for s in S],
  celerity=round(float(c),2),
  event=dict(start='2026-09-15',q=[[round(v) for v in s['q']] for s in S],rain=[round(float(v),1) for v in rain]),
  village=dict(b0=VM['full']['b0'],b=VM['full']['coef'],features=['ln(Q72max/4000)','h10 (m)','hc (m)','d (km)'],loo=LOO,warn=0.3),
  pixel=dict(b0=PM['b0'],b=PM['b'],pstar=0.15),
  villages=feats, pois=pois,
  obsTimes={k:meta[k]['flood_time'][:19]+'Z' for k in ['o1','o2','o3']},
)
json.dump(model,open(OUT+'model.json','w'),separators=(',',':'))
print('model.json',os.path.getsize(OUT+'model.json')//1024,'KB'); print('rain',np.round(rain,1).tolist())
