import json, math
T=json.load(open('trishuli.json')); D=json.load(open('/root/jalnetra-flood/map/src/data.json'))
def hav(a,b):
    r=math.pi/180;dl=(b[1]-a[1])*r;dn=(b[0]-a[0])*r
    return 12742*math.asin(math.sqrt(math.sin(dl/2)**2+math.cos(a[1]*r)*math.cos(b[1]*r)*math.sin(dn/2)**2))
path=T['path'][:]; km=T['km'][:]
off=km[-1]-9.29
for p,k in zip(D['river']['path'],D['river']['km']):
    if k>9.29: path.append(p); km.append(round(k+off,2))
def kmAt(x,y): i=min(range(len(path)),key=lambda j:hav(path[j],(x,y))); return km[i]
P={p['name']:p for p in T['places']}
mal=kmAt(84.8425,27.8186)
wave=[['08:37',0],['08:44',P['Rasuwagadhi border']['km']],['08:50',P['Syaprubesi']['km']],['09:20',P['Betrawati']['km']],['11:43',mal],['13:00',P['Mugling']['km']],['15:20',P['Devghat']['km']]]
valm=[s for s in D['river']['stations'] if s['name']=='Valmikinagar'][0]
places=[
 {'id':'src','name':'Langtang Lirung glacier','lng':85.5252,'lat':28.2853},
 {'id':'gy','name':'Gyirong Port / Rasuwagadhi','lng':85.379,'lat':28.276},
 {'id':'sy','name':'Syabrubesi','lng':85.347,'lat':28.16},
 {'id':'be','name':'Betrawati','lng':85.187,'lat':27.972},
 {'id':'bi','name':'Bidur (Trishuli Bazar)','lng':85.148,'lat':27.915},
 {'id':'ml','name':'Malekhu','lng':84.8425,'lat':27.8186},
 {'id':'mu','name':'Mugling','lng':84.556,'lat':27.855},
 {'id':'dg','name':'Devghat','lng':84.432,'lat':27.712},
 {'id':'vb','name':'Valmikinagar barrage','lng':valm['lng'],'lat':valm['lat']},
]
for p in places: p['km']=kmAt(p['lng'],p['lat'])
gauges=[
 {'id':'gy','name':'Rasuwagadhi','last':'1.62 m at 08:40, calm','fate':'destroyed before its next reading','lost':True},
 {'id':'sy','name':'Syabrubesi','last':'3.8 m, below alert','fate':'stopped at 08:50','lost':True},
 {'id':'be','name':'Betrawati','last':'3.55 m (warning 4.1 m)','fate':'stopped at 09:20','lost':True},
 {'id':'ml','name':'Malekhu','last':'rose almost 4 m in 10 minutes','fate':'first alert anywhere at 11:20, swept away 11:43','lost':True},
 {'id':'dg','name':'Devghat','last':'peaked 6.57 m at 16:00','fate':'stayed green, amber level is 7.3 m','lost':False},
]
Q=json.load(open('aug_q.json'))
glofas={'days':Q[0]['daily']['time'],'trishuli':[round(v) for v in Q[0]['daily']['river_discharge']],'devghat':[round(v) for v in Q[3]['daily']['river_discharge']],'valmikinagar':[round(v) for v in Q[4]['daily']['river_discharge']]}
V=json.load(open('/root/jalnetra-flood/map/public/india/villages.json'))
R={p['id']:p for p in json.load(open('/root/jalnetra-flood/map/public/india/rivers.json'))['points']}
vil=[{'n':v['n'],'lng':v['lng'],'lat':v['lat'],'dr':v['dr'],'h':v['h']} for v in V if 26.85<=v['lat']<=27.46 and 83.8<=v['lng']<=84.4 and R[v['p']]['river']=='Gandak' and v['dr']<=3 and v['h'] is not None and -3<=v['h']<=4]
vil.sort(key=lambda v:-v['lat'])
out={'path':path,'km':km,'places':places,'wave':wave,'gauges':gauges,'glofas':glofas,'villages':vil,
 'img':{'before':[85.36,28.19,85.58,28.34],'after':[85.36,28.19,85.58,28.34],'valley':json.load(open('valley_meta.json'))['bounds']}}
json.dump(out,open('/root/jalnetra-flood/map/src/aug.json','w'),separators=(',',':'),ensure_ascii=False)
print(len(path),km[-1],mal,[ (p['id'],p['km']) for p in places],len(vil))
