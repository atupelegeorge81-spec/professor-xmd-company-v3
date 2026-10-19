# killer.py <sid> — T5: subiri M1.R3.evidence DONE na M1.R3.verify RUNNING (+ reviewer wa kwanza ameanza), kisha kill -9 server ya next
import json, subprocess, time, sys, os, signal
sid = sys.argv[1]
def state():
    out = subprocess.run(["node", "/home/user/xmdtest/t26/get.mjs", sid, "state:M1", "/tmp/k_state.json"], capture_output=True, text=True, timeout=60)
    try: return json.load(open("/tmp/k_state.json"))
    except Exception: return None
while True:
    s = state()
    steps = {x["stepId"]: x for x in (s or {}).get("steps", [])}
    ev, vf = steps.get("M1.R3.evidence"), steps.get("M1.R3.verify")
    print(time.strftime("%H:%M:%S"), s and s.get("status"), s and s.get("round"), ev and ev["status"], vf and vf["status"], flush=True)
    if ev and ev["status"] == "DONE" and vf and vf["status"] == "RUNNING":
        time.sleep(8)  # reviewers wako katikati ya kazi
        pids = subprocess.run(["pgrep", "-f", "[n]ext-server|[n]ext start"], capture_output=True, text=True).stdout.split()
        for p in pids:
            try: os.kill(int(p), signal.SIGKILL)
            except Exception as e: print("kill", p, e)
        print(time.strftime("%H:%M:%S"), "KILLED -9", pids, flush=True)
        json.dump({"killedAt": time.strftime("%H:%M:%S"), "pids": pids, "steps": list(steps.values())}, open("/home/user/xmdtest/t26/T5-prekill.json", "w"), indent=1)
        break
    time.sleep(4)
