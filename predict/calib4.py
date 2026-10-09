import numpy as np, json, math, datetime as dt
from sklearn.linear_model import LogisticRegression
D=json.load(open('/root/jalnetra-flood/map/src/data.json')); M=json.load(open('village_model.json')); F={f['id']:f for f in M['feats']}
meta=json.load(open('/root/jalnetra-flood/geo/s1_meta.json'))
S=D['river']['stations']; skm=np.array([s['km'] for s in S]); sq=np.array([s['q'] for s in S],float); t0=dt.datetime(2026,9,15,12)
def qat(km,h):
    d=h/24; i=int(np.floor(d)); f=d-i; i=max(0,min(i,sq.shape[1]-2)); return float(np.interp(km,skm,sq[:,i]*(1-f)+sq[:,i+1]*f))
def qeff(km,h): return max(qat(km,h-x) for x in range(0,73,6))
REACH=[0,160,240,300,340,400]
def rb(c): return max(i for i in range(len(REACH)-1) if c>=REACH[i])
def X(f,q,variant):
    x=[math.log(q/4000), f['h10'], f['hc'], f['d']]
    if variant>=1: x+= [1.0 if rb(f['ch'])==i else 0.0 for i in range(len(REACH)-1)]
    return x
def hours(k): return (dt.datetime.fromisoformat(meta[k]['flood_time'][:19])-t0).total_seconds()/3600
for variant in [0,1]:
  for C in [0.3,1.0]:
    samples=[]
    for k in ['o1','o2','o3']:
        for v in D['villages']:
            o=v['obs'][k]
            if o is None: continue
            f=F[v['id']]; samples.append((k,X(f,qeff(f['ch'],hours(k)),variant),int(o<=0.5)))
    out=[]
    for k in ['o1','o2','o3']:
        tr=[s for s in samples if s[0]!=k]; te=[s for s in samples if s[0]==k]
        m=LogisticRegression(C=C,max_iter=2000).fit([s[1] for s in tr],[s[2] for s in tr])
        p=m.predict_proba([s[1] for s in te])[:,1]; y=np.array([s[2] for s in te])
        for th in [0.3,0.5]:
            pr=p>=th; out.append((k,th,int(y.sum()),int(pr.sum()),int((pr&(y==1)).sum())))
    print(variant,C,out)
