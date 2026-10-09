import numpy as np, json, math, datetime as dt, sys
sys.path.insert(0,'/root/jalnetra-flood/geo'); from grid import *
from sklearn.linear_model import LogisticRegression
G='/root/jalnetra-flood/geo/'
D=json.load(open('/root/jalnetra-flood/map/src/data.json')); meta=json.load(open(G+'s1_meta.json'))
S=D['river']['stations']; skm=np.array([s['km'] for s in S]); sq=np.array([s['q'] for s in S],float); t0=dt.datetime(2026,9,15,12)
def qat(km,h):
    d=h/24; i=np.floor(d).astype(int); f=d-i; return np.interp(km,skm,sq[:,i]*(1-f)+sq[:,i+1]*f)
def qeff_bins(h):
    kb=np.arange(0,400,5.0); return kb, np.max([qat(kb,h-x) for x in range(0,73,6)],axis=0)
hand=np.load(G+'hand.npy'); dk=np.load(G+'dist_km.npy'); normal=np.load(G+'occ.npy')>=50; ch=np.load('chain.npy'); O=np.load('obs.npz')
region=(dk<=15)&~normal&np.isfinite(hand)
rng=np.random.default_rng(0); Xs=[];ys=[];per={}
for k in ['o1','o2','o3']:
    h=(dt.datetime.fromisoformat(meta[k]['flood_time'][:19])-t0).total_seconds()/3600
    kb,qb=qeff_bins(h)
    m=region&O[k+'_valid']; idx=np.flatnonzero(m); new=O[k+'_new'].ravel()
    pos=idx[new[idx]]; neg=rng.choice(idx,size=min(len(idx),400000),replace=False)
    sel=np.concatenate([pos,neg]); w=np.concatenate([np.ones(len(pos))*1.0,np.ones(len(neg))*(len(idx)-len(pos))/len(neg)])
    q=np.interp(ch.ravel()[sel],kb,qb)
    X=np.c_[np.log(q/4000),np.clip(hand.ravel()[sel],-5,25),dk.ravel()[sel]]
    Xs.append((X,new[sel].astype(int),w)); per[k]=(h,m)
X=np.vstack([a[0] for a in Xs]); y=np.concatenate([a[1] for a in Xs]); w=np.concatenate([a[2] for a in Xs])
mdl=LogisticRegression(max_iter=2000).fit(X,y,sample_weight=w)
print('pix coef',mdl.coef_,mdl.intercept_)
b0=mdl.intercept_[0]; b=mdl.coef_[0]
px2=(RES*111.32)**2*math.cos(math.radians(26.7))
out={}
for pstar in [0.05,0.1,0.15,0.2,0.3]:
  row=[]
  for k in ['o1','o2','o3']:
    h,m=per[k]; kb,qb=qeff_bins(h); q=np.interp(ch[m],kb,qb)
    p=1/(1+np.exp(-(b0+b[0]*np.log(q/4000)+b[1]*np.clip(hand[m],-5,25)+b[2]*dk[m])))
    pr=p>=pstar; ob=O[k+'_new'][m]
    row.append((k,round(pr.sum()*px2),round(ob.sum()*px2),round((pr&ob).sum()*px2)))
  print(pstar,row)
json.dump(dict(b0=float(b0),b=b.tolist()),open('pixel_model.json','w'))
