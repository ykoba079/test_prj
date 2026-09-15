import argparse,csv
from pathlib import Path
parser=argparse.ArgumentParser(description='Explicitly generate a synthetic CSV; UI edits do not require this')
parser.add_argument('--rows',type=int,default=1000000)
parser.add_argument('--output',default='sample-million.csv')
parser.add_argument('--force',action='store_true',help='Overwrite an existing dataset')
args=parser.parse_args()
if not 1<=args.rows<=5000000:parser.error('--rows must be 1..5000000')
root=Path(__file__).resolve().parent;output=root/args.output
if output.exists() and not args.force:parser.error('Data already exists. Reuse it, or specify --force to regenerate.')
prefs=['北海道','東京都','神奈川県','愛知県','大阪府','福岡県'];tags=['産業','生活','観光'];sums={};seed=42
with output.open('w',encoding='utf-8',newline='') as file:
 writer=csv.writer(file,lineterminator='\n');writer.writerow(['都道府県','市町村','年','データ値1','データ値2','タグ','行種別'])
 for i in range(args.rows):
  seed=(seed*1664525+1013904223)&0xffffffff
  p=prefs[i%6];city='市町村'+str(i//6%20+1);year=2020+i//120%6;tag=tags[i//720%3];a=seed%1000;b=(seed>>10)%500
  writer.writerow([p,city,year,a,b,tag,'明細']);v=sums.setdefault((p,year,tag),[0,0]);v[0]+=a;v[1]+=b
 for (p,y,t),(a,b) in sums.items():writer.writerow([p,'',y,a,b,t,'中間集計'])
print(f'{output.name}: {args.rows:,} detail + {len(sums):,} summary rows')
