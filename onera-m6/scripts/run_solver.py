"""Run the downloaded official SU2 binary; retain log and provenance locally."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import time
import argparse
import shutil

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'work'
exe = WORK / 'su2/bin/bin/SU2_CFD.exe'
config = ROOT / 'scripts/onera.cfg'
parser = argparse.ArgumentParser()
parser.add_argument('--fresh', action='store_true', help='Start from freestream rather than an existing restart')
parser.add_argument('--case', choices=['m060', 'm070', 'm080', 'm090'])
parser.add_argument('--mach', type=float, default=0.8395)
args = parser.parse_args()
if args.case:
    expected_mach = {'m060':0.60,'m070':0.70,'m080':0.80,'m090':0.90}[args.case]
    if args.mach != expected_mach:
        parser.error('--case and --mach must identify the same speed condition')
    WORK = WORK / 'cases' / args.case
    WORK.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / 'work/mesh_ONERAM6_inv_ffd.su2', WORK / 'mesh_ONERAM6_inv_ffd.su2')
text = config.read_text(encoding='utf-8')
text = text.replace('MACH_NUMBER= 0.8395', f'MACH_NUMBER= {args.mach}')
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
    'mach': args.mach,
    'mesh_sha256': hashlib.sha256((WORK / 'mesh_ONERAM6_inv_ffd.su2').read_bytes()).hexdigest(),
    'config_sha256': hashlib.sha256(generated_config.read_bytes()).hexdigest(),
}
(WORK / 'run.json').write_text(json.dumps(record, indent=2), encoding='utf-8')
print(json.dumps(record), flush=True)
raise SystemExit(code)
