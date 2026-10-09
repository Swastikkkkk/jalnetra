import numpy as np, json, sys, datetime as dt
sys.path.insert(0,'/root/jalnetra-flood/geo'); from grid import *
G='/root/jalnetra-flood/geo/'
D=json.load(open('/root/jalnetra-flood/map/src/data.json'))
S=D['river']['stations']; skm=np.array([s['km'] for s in S]); sq=np.array([s['q'] for s in S])
t0=dt.datetime(2026,9,15,12)
def Q(km,when):
    h=(when-t0).total_seconds()/86400; i=int(np.floor(h)); f=h-i
    qs=sq[:,i]*(1-f)+sq[:,i+1]*f
    return float(np.interp(km,skm,qs))
hand=np.load(G+'hand.npy'); dk=np.load(G+'dist_km.npy'); normal=np.load(G+'occ.npy')>=50; ch=np.load('chain.npy')
O=np.load('obs.npz'); meta=json.load(open(G+'s1_meta.json'))
region=(dk<=15)&~normal&np.isfinite(hand)
bins=np.arange(0,400,40)
rows=[]
for k in ['o1','o2','o3']:
    new=O[k+'_new']; valid=O[k+'_valid']; when=dt.datetime.fromisoformat(meta[k]['flood_time'][:19])
    for b0 in bins:
        m=region&valid&(ch>=b0)&(ch<b0+40)
        n=m.sum()
        if n<20000: continue
        a=(new&m).sum(); hv=np.sort(hand[m])
        t=float(hv[min(len(hv)-1,int(a))]) if a>0 else 0.0
        q=Q(b0+20,when)
        rows.append(dict(k=k,b=int(b0),n=int(n),a=int(a),frac=round(a/n,4),t=round(t,2),q=round(q)))
for r in rows: print(r)
json.dump(rows,open('calib_points.json','w'))
print('station km',skm.tolist())
