"""Compute independent steady CFD conditions, then publish an asset index."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import argparse

ROOT=Path(__file__).resolve().parents[1]
cases=[('m060',0.60),('m070',0.70),('m080',0.80),('m08395',0.8395),('m090',0.90)]
parser=argparse.ArgumentParser()
parser.add_argument('--reuse-solutions',action='store_true',help='Rebuild assets from existing, matching successful CFD runs')
args=parser.parse_args()
entries=[]
for case,mach in cases:
    base=ROOT/'assets' if case=='m08395' else ROOT/'assets/cases'/case
    if case!='m08395':
        if args.reuse_solutions:
            run=json.loads((ROOT/'work/cases'/case/'run.json').read_text())
            assert run['mach']==mach and run['exit_code']==0
        else:
            subprocess.run([sys.executable,str(ROOT/'scripts/run_solver.py'),'--case',case,'--mach',str(mach),'--fresh'],check=True)
        subprocess.run([sys.executable,str(ROOT/'scripts/build_assets.py'),'--case',case],check=True)
    else:
        wing=json.loads((base/'wing.json').read_text())
        (base/'pressure.json').write_text(json.dumps({k:wing[k] for k in ['cp','colors']},separators=(',',':')),encoding='utf-8',newline='\n')
    manifest=json.loads((base/'manifest.json').read_text())
    assert manifest['mach']==mach and manifest['flow_spz']['count']==150000
    entries.append({'id':case,'mach':mach,'velocity_m_s':manifest['freestream_velocity_m_s'],
                    'base_url':base.relative_to(ROOT).as_posix(),
                    'pressure_sha256':hashlib.sha256((base/'pressure.json').read_bytes()).hexdigest()})
(ROOT/'assets/speeds.json').write_text(json.dumps({'default_index':3,'cases':entries},indent=2),encoding='utf-8',newline='\n')
print('All five independently calculated speed cases are ready.',flush=True)
