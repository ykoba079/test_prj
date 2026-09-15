import json,math
from pathlib import Path
p=Path('webgpu-csv-dashboard/japan.geojson');d=json.loads(p.read_text(encoding='utf-8'))
def simplify(ring):
 pts=[(round(c[0],5),round(c[1],5)) for c in ring]
 if len(pts)<8:return pts
 # Iterative Douglas-Peucker. Retain ring endpoints and at least 3 vertices.
 keep={0,len(pts)-1};stack=[(0,len(pts)-1)];epsilon=0.006
 while stack:
  a,b=stack.pop();x,y=pts[a];dx=pts[b][0]-x;dy=pts[b][1]-y;den=dx*dx+dy*dy;best=epsilon*epsilon;index=None
  for i in range(a+1,b):
   px,py=pts[i];t=max(0,min(1,((px-x)*dx+(py-y)*dy)/den)) if den else 0
   distance=(px-x-t*dx)**2+(py-y-t*dy)**2
   if distance>best:best=distance;index=i
  if index is not None:keep.add(index);stack.extend([(a,index),(index,b)])
 out=[pts[i] for i in sorted(keep)]
 return out if len(out)>=4 else [pts[0],pts[len(pts)//3],pts[2*len(pts)//3],pts[-1]]
for f in d['features']:
 g=f['geometry'];polys=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
 g['coordinates']=[[simplify(r) for r in poly] for poly in polys]
 g['type']='MultiPolygon';f['properties']={'id':f['properties']['id']}
p.write_text(json.dumps(d,separators=(',',':')),encoding='utf-8');print('Map bytes:',p.stat().st_size)
