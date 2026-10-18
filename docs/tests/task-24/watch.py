import json,sys
f=sys.argv[1]; n=int(sys.argv[2]) if len(sys.argv)>2 else 40
out=[]
for line in open(f,encoding='utf8',errors='replace'):
    line=line.strip()
    if line.startswith('data:'): line=line[5:]
    try: e=json.loads(line)
    except: continue
    t=e.get('type')
    if t=='log': x=e.get('entry',{}); out.append(f"{x.get('timestamp','')} [{x.get('type','')}] {str(x.get('message',''))[:300]}")
    elif t=='system': out.append("CHIP "+str(e.get('text',''))[:300])
    elif t in ('reviewFindings','reviewDecision','changeOrders','milestoneMap','evidence','milestoneBuild','done','error','search','sources','milestonePlan'):
        s=json.dumps(e,ensure_ascii=False); out.append("EV "+s[:500])
for l in out[-n:]: print(l)
