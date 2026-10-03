"""Export numerical CFD fields for the particle-only viewer (no SPZ decoding)."""
import gzip
import hashlib
import json
from pathlib import Path
from build_assets import FluidField, display, palette
from mesh import ROOT as CFD_ROOT, read_mesh, np
from scipy.spatial import cKDTree

ROOT=CFD_ROOT.parent
OUT=ROOT/'onera-m6-flow/assets'
OUT.mkdir(parents=True,exist_ok=True)
points,tetra,wing,_=read_mesh()
ids=np.unique(wing.ravel())
original=json.loads((ROOT/'onera-m6/assets/wing.json').read_text())
(OUT/'wing.json').write_text(json.dumps({k:original[k] for k in ['positions','indices']},separators=(',',':')),encoding='utf-8',newline='\n')
centers=points[wing].mean(axis=1)
normal=np.cross(points[wing[:,1]]-points[wing[:,0]],points[wing[:,2]]-points[wing[:,0]])
area=np.linalg.norm(normal,axis=1)*.5
normal/=2*area[:,None]
vertices=points[tetra]
tree=cKDTree(vertices.mean(axis=1))
cell=np.full(len(centers),-1,dtype=int)
for k in (24,96,384):
    missing=np.flatnonzero(cell<0)
    if not len(missing): break
    _,near=tree.query(centers[missing],k=k,workers=2)
    adjacent=(tetra[near][...,None]==wing[missing,None,None,:]).any(axis=2).all(axis=2)
    found=adjacent.any(axis=1)
    cell[missing[found]]=near[found,adjacent[found].argmax(axis=1)]
assert (cell>=0).all()
normal*=np.where((normal*(vertices[cell].mean(axis=1)-centers)).sum(axis=1)<0,-1,1)[:,None]
selected=np.random.default_rng(342).choice(len(centers),450,replace=False,p=area/area.sum())
del vertices,tree,original

# Display axes, half-wing only; x is the fastest varying grid index.
box={'x0':-.27,'y0':-.33,'z0':-1.65,'hx':.03,'hy':.012,'hz':.03,'nx':98,'ny':69,'nz':56}
z,y,x=np.meshgrid(np.arange(box['nz'])*box['hz']+box['z0'],np.arange(box['ny'])*box['hy']+box['y0'],np.arange(box['nx'])*box['hx']+box['x0'],indexing='ij')
query=np.column_stack([x.ravel(),-z.ravel(),y.ravel()])
entries=[]
for name,mach in [('m060',.6),('m070',.7),('m080',.8),('m08395',.8395),('m090',.9)]:
    work=ROOT/'onera-m6/work' if name=='m08395' else ROOT/'onera-m6/work/cases'/name
    source=ROOT/'onera-m6/assets' if name=='m08395' else ROOT/'onera-m6/assets/cases'/name
    manifest=json.loads((source/'manifest.json').read_text())
    assert manifest['mach']==mach and manifest['convergence']['rms[Rho]'] < -11
    data=np.loadtxt(work/'restart_flow.csv',delimiter=',',skiprows=1)
    assert np.array_equal(data[:,0].astype(int),np.arange(len(points)))
    assert np.max(np.abs(points-data[:,1:4]))<1e-10
    rho=data[:,4];v=data[:,5:8]/rho[:,None]
    p=.4*(data[:,8]-.5*rho*(v*v).sum(axis=1))
    assert (rho>0).all() and (p>0).all()
    cp=2*(p-1/(1.4*mach*mach))
    local_mach=np.linalg.norm(v,axis=1)/np.sqrt(1.4*p/rho)
    speed=manifest['freestream_velocity_m_s']
    field=FluidField(points,tetra,display(v*speed))
    values=np.empty((len(query),3),dtype='<f4')
    for start in range(0,len(query),4096):
        values[start:start+4096]=field.sample(query[start:start+4096])
    valid=np.isfinite(values).all(axis=1)
    assert valid.mean()>.98
    rng=np.random.default_rng(5)
    check=rng.choice(len(field.cells),200,replace=False)
    expected=field.fields[field.cells[check]].mean(axis=1)
    error=float(np.max(np.abs(field.sample(points[field.cells[check]].mean(axis=1))-expected)))
    assert error<1e-7
    target=OUT/'cases'/name
    target.mkdir(parents=True,exist_ok=True)
    raw=values.tobytes()
    packed=gzip.compress(raw,compresslevel=6,mtime=0)
    (target/'velocity.bin.gz').write_bytes(packed)
    delta_pressure=(p[wing].mean(axis=1)*(1.4*mach*mach)-1)*101325
    surface={'cp':np.round(np.tile(cp[ids],2),6).tolist(),
        'mach':np.round(local_mach[ids],6).tolist(),
        'colors':np.round(np.column_stack([np.tile(palette(cp[ids],-1.2,.6,'coolwarm'),(2,1)),np.ones(len(ids)*2)]),4).ravel().tolist(),
        'arrows':{'centers':display(centers[selected]).ravel().tolist(),'normals':display(normal[selected]).ravel().tolist(),
                  'delta_pressure_Pa':delta_pressure[selected].tolist(),'cp':cp[wing[selected]].mean(axis=1).tolist()}}
    (target/'surface.json').write_text(json.dumps(surface,separators=(',',':')),encoding='utf-8',newline='\n')
    range_speed=np.linalg.norm(values[valid],axis=1)
    record={'mach':mach,'freestream_velocity_m_s':speed,'angle_of_attack_degrees':3.06,
        'solver':manifest['solver'],'convergence':manifest['convergence'],'equations':manifest['equations'],
        'grid':box,'velocity_encoding':'gzip of little-endian Float32 xyz, x-fastest; m/s; NaN marks unavailable fluid data',
        'grid_speed_range_m_s':[float(range_speed.min()),float(range_speed.max())],
        'valid_grid_fraction':float(valid.mean()),'velocity_sha256':hashlib.sha256(packed).hexdigest(),
        'surface_sha256':hashlib.sha256((target/'surface.json').read_bytes()).hexdigest(),
        'interpolation_check_max_error_m_s':error,
        'surface_mach':'|velocity| / sqrt(gamma * pressure / density), from SU2 conserved variables, not Cp inversion',
        'limitations':['Inviscid steady Euler; no viscosity, separation or stall prediction',
            'Particles use a resampled regular velocity grid and are a slowed visualization, not an unsteady CFD solution',
            'No grid-convergence or experimental validation performed']}
    (target/'manifest.json').write_text(json.dumps(record,indent=2),encoding='utf-8',newline='\n')
    entries.append({'id':name,'mach':mach,'velocity_m_s':speed,'base_url':f'assets/cases/{name}',
                    'speed_range_m_s':record['grid_speed_range_m_s']})
    print(name,'grid',values.shape,'valid',valid.mean(),'bytes',len(packed),flush=True)
    del field
(OUT/'speeds.json').write_text(json.dumps({'default_index':3,'cases':entries},indent=2),encoding='utf-8',newline='\n')
