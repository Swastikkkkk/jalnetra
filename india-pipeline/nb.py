import json, time, urllib.request
P=json.load(open('pts1.json'))
cands=[]
for p in P:
    for dx,dy in [(0,0),(0.05,0.05),(0.05,-0.05),(-0.05,0.05),(-0.05,-0.05)]:
        cands.append((p['id'],round(p['lat']+dy,4),round(p['lng']+dx,4)))
res={}
B=100
for i in range(0,len(cands),B):
    ch=cands[i:i+B]
    u='https://flood-api.open-meteo.com/v1/flood?latitude='+','.join(str(c[1]) for c in ch)+'&longitude='+','.join(str(c[2]) for c in ch)+'&daily=river_discharge&past_days=14&forecast_days=1'
    for k in range(5):
        try:
            d=json.load(urllib.request.urlopen(u,timeout=60)); break
        except Exception as e:
            print('retry',i,e); time.sleep(30)
    if isinstance(d,dict): d=[d]
    for c,r in zip(ch,d):
        q=[x for x in r['daily']['river_discharge'] if x is not None]
        m=sum(q)/len(q) if q else 0
        if c[0] not in res or m>res[c[0]]['m']: res[c[0]]=dict(m=m,glat=r['latitude'],glng=r['longitude'])
    print(i,len(res),flush=True); time.sleep(13)
for p in P: p.update(res.get(p['id'],{}))
json.dump(P,open('pts2.json','w'))
