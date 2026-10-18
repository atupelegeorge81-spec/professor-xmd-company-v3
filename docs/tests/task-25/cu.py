import json,sys
for line in open(sys.argv[1],encoding='utf8',errors='replace'):
    try: e=json.loads(line)
    except: continue
    if e.get('type')!='cu': continue
    c=e['cu']; t=c.get('type')
    if t in ('think_delta','think_start','think_end','usage'): continue
    s={k:v for k,v in c.items() if k not in('id','session','i','t')}
    print(json.dumps(s,ensure_ascii=False)[:int(sys.argv[2]) if len(sys.argv)>2 else 300])
