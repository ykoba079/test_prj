"""Run the downloaded official SU2 binary; retain log and provenance locally."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import time
import argparse

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'work'
exe = WORK / 'su2/bin/bin/SU2_CFD.exe'
config = ROOT / 'scripts/onera.cfg'
parser = argparse.ArgumentParser()
parser.add_argument('--fresh', action='store_true', help='Start from freestream rather than an existing restart')
args = parser.parse_args()
text = config.read_text(encoding='utf-8')
if args.fresh or not (WORK / 'restart_flow.csv').exists():
    text = text.replace('RESTART_SOL= YES', 'RESTART_SOL= NO')
generated_config = WORK / 'onera-run.cfg'
generated_config.write_text(text, encoding='utf-8')
env = os.environ.copy()
env['OMP_NUM_THREADS'] = '4'
start = time.time()
with (WORK / 'solver.log').open('w', encoding='utf-8') as log:
    proc = subprocess.Popen([str(exe), str(generated_config), '-t', '4'], cwd=WORK,
                            stdout=log, stderr=subprocess.STDOUT, env=env)
    print(f'SU2 PID={proc.pid}; log={WORK / "solver.log"}', flush=True)
    code = proc.wait()
record = {
    'solver': 'SU2 8.5.0 win64 OpenMP', 'exit_code': code,
    'elapsed_seconds': time.time() - start, 'threads': 4,
    'mesh_sha256': hashlib.sha256((WORK / 'mesh_ONERAM6_inv_ffd.su2').read_bytes()).hexdigest(),
    'config_sha256': hashlib.sha256(generated_config.read_bytes()).hexdigest(),
}
(WORK / 'run.json').write_text(json.dumps(record, indent=2), encoding='utf-8')
print(json.dumps(record), flush=True)
raise SystemExit(code)
