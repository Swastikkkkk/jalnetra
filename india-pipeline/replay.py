# usage: python hist.py pts2.json start end out.json slice_from slice_to
import json, sys, time, urllib.request
P=json.load(open(sys.argv[1])); s,e,out,a,b=sys.argv[2],sys.argv[3],sys.argv[4],int(sys.argv[5]),int(sys.argv[6])
P=P[a:b]; res={}
B=30
for i in range(0,len(P),B):
    ch=P[i:i+B]
    u='https://flood-api.open-meteo.com/v1/flood?latitude='+','.join(str(p['glat']) for p in ch)+'&longitude='+','.join(str(p['glng']) for p in ch)+f'&daily=river_discharge&start_date={s}&end_date={e}'
    d=None
    for k in range(10):
        try: d=json.load(urllib.request.urlopen(u,timeout=90)); break
        except Exception as ex: print('retry',i,ex,flush=True); time.sleep(30*(k+1))
    if isinstance(d,dict): d=[d]
    for p,r in zip(ch,d): res[p['id']]=r['daily']['river_discharge']; res['_days']=r['daily']['time']
    print(i,len(res),flush=True); time.sleep(20)
json.dump(res,open(out,'w')); print('done',flush=True)
