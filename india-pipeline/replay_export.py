import json
R=json.load(open('replay_raw.json')); days=R.pop('_days')
q={k:[None if x is None else round(x,1) for x in v] for k,v in R.items()}
json.dump(dict(days=days,q=q),open('../map/public/india/replay.json','w'),separators=(',',':'))
import os; print(len(q),len(days),os.path.getsize('../map/public/india/replay.json')//1024,'KB')
