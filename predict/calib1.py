import numpy as np, json, sys
sys.path.insert(0,'/root/jalnetra-flood/geo')
from grid import *
from scipy.ndimage import distance_transform_edt, label
G='/root/jalnetra-flood/geo/'
hand=np.load(G+'hand.npy'); dk=np.load(G+'dist_km.npy'); occ=np.load(G+'occ.npy'); normal=occ>=50
R=json.load(open(G+'river_main.json')); P=np.array(R['path']); KM=np.array(R['km'])
pts=[];kms=[]
for (x0,y0),(x1,y1),k0,k1 in zip(P[:-1],P[1:],KM[:-1],KM[1:]):
    n=max(1,int(max(abs(x1-x0),abs(y1-y0))/RES))
    for i in range(n): pts.append((x0+(x1-x0)*i/n,y0+(y1-y0)*i/n)); kms.append(k0+(k1-k0)*i/n)
pts=np.array(pts);kms=np.array(kms)
cols=((pts[:,0]-W)/RES).astype(int);rows=((N-pts[:,1])/RES).astype(int)
ok=(rows>=0)&(rows<HEIGHT)&(cols>=0)&(cols<WIDTH)
chk=np.full((HEIGHT,WIDTH),np.nan,np.float32); chk[rows[ok],cols[ok]]=kms[ok]
chan=~np.isnan(chk)
_,(ir,ic)=distance_transform_edt(~chan,return_indices=True)
ch=chk[ir,ic]; np.save('chain.npy',ch.astype(np.float32))
meta=json.load(open(G+'s1_meta.json'))
obs={}
for k in ['o1','o2','o3']:
    z=np.load(G+k+'.npz'); new=z['new']&~normal; valid=z['valid']
    lab,n=label(new); s=np.bincount(lab.ravel()); kp=s>=4; kp[0]=False; new=kp[lab]
    obs[k]=(new,valid)
np.savez_compressed('obs.npz',**{k+'_new':v[0] for k,v in obs.items()},**{k+'_valid':v[1] for k,v in obs.items()})
print({k:meta[k]['flood_time'] for k in meta}, KM.max())
