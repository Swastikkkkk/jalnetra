import numpy as np, json, sys, datetime as dt, math
sys.path.insert(0,'/root/jalnetra-flood/geo'); from grid import *
from sklearn.linear_model import LogisticRegression
G='/root/jalnetra-flood/geo/'
D=json.load(open('/root/jalnetra-flood/map/src/data.json'))
S=D['river']['stations']; skm=np.array([s['km'] for s in S]); sq=np.array([s['q'] for s in S],float)
t0=dt.datetime(2026,9,15,12)
def qat(km,h):  # h hours since t0
    d=h/24; i=int(np.floor(d)); f=d-i; i=max(0,min(i,sq.shape[1]-2))
    return float(np.interp(km,skm,sq[:,i]*(1-f)+sq[:,i+1]*f))
def qeff(km,h): return max(qat(km,h-x) for x in range(0,73,6))
hand=np.load(G+'hand.npy'); dk=np.load(G+'dist_km.npy'); normal=np.load(G+'occ.npy')>=50; ch=np.load('chain.npy')
O=np.load('obs.npz'); meta=json.load(open(G+'s1_meta.json'))
kmpx=RES*111.32*math.cos(math.radians(26.7)); rpx=int(0.5/kmpx)+1
yy,xx=np.mgrid[-rpx:rpx+1,-rpx:rpx+1]; disk=(yy**2+xx**2)*kmpx**2<=0.25
# village features
V=D['villages']; feats=[]
for v in V:
    r=int((N-v['lat'])/RES); c=int((v['lng']-W)/RES)
    hw=hand[r-rpx:r+rpx+1,c-rpx:c+rpx+1]; nw=normal[r-rpx:r+rpx+1,c-rpx:c+rpx+1]
    m=disk&~nw&np.isfinite(hw); hv=hw[m]
    feats.append(dict(id=v['id'],ch=float(ch[r,c]),h10=float(np.percentile(hv,10)),hc=float(hand[r,c]),d=float(dk[r,c]),low=float((hv<=1.0).mean())))
F={f['id']:f for f in feats}
def hours(k): return (dt.datetime.fromisoformat(meta[k]['flood_time'][:19])-t0).total_seconds()/3600
def X(f,q): return [math.log(q/4000), f['h10'], f['d'], f['low']]
samples=[]
for k in ['o1','o2','o3']:
    h=hours(k)
    for v in V:
        o=v['obs'][k]
        if o is None: continue
        f=F[v['id']]; samples.append((k,X(f,qeff(f['ch'],h)),int(o<=0.5),v['id']))
def fit(ks):
    Xs=np.array([s[1] for s in samples if s[0] in ks]); ys=np.array([s[2] for s in samples if s[0] in ks])
    m=LogisticRegression(C=1.0).fit(Xs,ys); return m
full=fit({'o1','o2','o3'})
print('coef',full.coef_,full.intercept_)
res={}
for k in ['o1','o2','o3']:
    m=fit({'o1','o2','o3'}-{k})
    S_=[s for s in samples if s[0]==k]; p=m.predict_proba(np.array([s[1] for s in S_]))[:,1]
    y=np.array([s[2] for s in S_]); pr=p>=0.5
    res[k]=dict(valid=len(S_),observed=int(y.sum()),predicted=int(pr.sum()),both=int((pr&(y==1)).sum()),brier=round(float(((p-y)**2).mean()),3),coef=m.coef_[0].tolist(),b0=float(m.intercept_[0]))
    print(k,res[k])
json.dump(dict(feats=feats,res=res,full=dict(coef=full.coef_[0].tolist(),b0=float(full.intercept_[0]))),open('village_model.json','w'))
