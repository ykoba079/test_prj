import argparse,gzip,hashlib,time
from pathlib import Path
parser=argparse.ArgumentParser(description='Compress an existing CSV without regenerating data')
parser.add_argument('input',nargs='?',default='sample-million.csv');parser.add_argument('--force',action='store_true');args=parser.parse_args()
root=Path(__file__).resolve().parent;source=root/args.input;target=source.with_name(source.name+'.gz')
if target.exists() and not args.force:parser.error('Compressed file exists; reuse it or specify --force')
data=source.read_bytes();t=time.perf_counter();compressed=gzip.compress(data,compresslevel=6,mtime=0);target.write_bytes(compressed)
assert gzip.decompress(compressed)==data
print(f'{len(data):,} -> {len(compressed):,} bytes; saved {100*(1-len(compressed)/len(data)):.1f}%; ratio {len(data)/len(compressed):.2f}x; compression {(time.perf_counter()-t):.2f}s')
print('SHA256 verified:',hashlib.sha256(data).hexdigest())
