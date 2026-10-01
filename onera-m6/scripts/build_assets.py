"""Convert a converged 3-D Euler solution into mesh + static directional SPZ.

All velocity queries use barycentric interpolation inside the original fluid
tetrahedra. No invented vortices, nearest-node flow, or interpolation through
the wing. Coordinates are rotated (x,y,z)->(x,z,-y), identically for all assets.
"""
from pathlib import Path
import csv
import gzip
import hashlib
import json
import struct
import time
from mesh import ROOT, read_mesh, np
from scipy.spatial import cKDTree

WORK, ASSETS = ROOT / 'work', ROOT / 'assets'
QA = ROOT / 'qa'
QA.mkdir(exist_ok=True)
ASSETS.mkdir(exist_ok=True)
GAMMA, MACH, TEMP, GAS_R = 1.4, 0.8395, 288.15, 287.058
UINF = MACH * np.sqrt(GAMMA * GAS_R * TEMP)
TARGET_FLOW_SPLATS = 300_000


def display(p):
    return np.stack([p[..., 0], p[..., 2], -p[..., 1]], axis=-1)


def palette(values, low, high, name='turbo'):
    import matplotlib
    return matplotlib.colormaps[name](np.clip((values-low)/(high-low), 0, 1))[:, :3]


def write_spz(path, position, scales, quaternion, rgb, alpha):
    """SPZ v2, SH degree 0, 24-bit position, 8-bit log scale, xyz quaternion."""
    n = len(position)
    assert all(len(v) == n for v in [scales, quaternion, rgb, alpha])
    assert np.isfinite(position).all() and (scales > 0).all()
    fixed = np.rint(position * 4096).astype(np.int64)
    assert np.max(np.abs(fixed)) < 2**23
    packed_pos = np.stack([fixed & 255, (fixed >> 8) & 255, (fixed >> 16) & 255], axis=-1).astype('u1')
    quaternion = quaternion * np.where(quaternion[:, 3:4] < 0, -1, 1)
    rot = np.clip(np.rint(quaternion[:, :3]*127.5+127.5), 0, 255).astype('u1')
    scale = np.clip(np.rint((np.log(scales)+10)*16), 0, 255).astype('u1')
    # SPZ base color stores spherical-harmonic DC with scale factor 0.15.
    color = np.clip(np.rint(((rgb-0.5)/0.28209479177387814*0.15+0.5)*255), 0, 255).astype('u1')
    opacity = np.clip(np.rint(alpha*255), 0, 255).astype('u1')
    raw = (struct.pack('<IIIBBBB', 0x5053474e, 2, n, 0, 12, 0, 0) +
           packed_pos.tobytes()+opacity.tobytes()+color.tobytes()+scale.tobytes()+rot.tobytes())
    path.write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
    # Decode independently: test quantized lengths, positions and color.
    recovered = fixed / 4096
    error = float(np.max(np.abs(recovered-position)))
    assert error <= 0.5/4096+1e-9
    assert len(gzip.decompress(path.read_bytes())) == 16+n*19
    return {'count': n, 'bytes': path.stat().st_size, 'max_position_error': error,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def align_axis(direction, axis=0):
    direction = direction / np.maximum(np.linalg.norm(direction, axis=1, keepdims=True), 1e-12)
    base = np.zeros(3); base[axis] = 1
    cross = np.cross(np.broadcast_to(base, direction.shape), direction)
    dot = direction[:, axis]
    q = np.column_stack([cross, 1+dot])
    opposite = dot < -0.999999
    q[opposite] = [0, 1, 0, 0] if axis == 0 else [1, 0, 0, 0]
    return q / np.linalg.norm(q, axis=1, keepdims=True)


class FluidField:
    def __init__(self, points, tetra, fields):
        vertices = points[tetra]
        roi_min = np.array([-0.7, -0.001, -0.9])
        roi_max = np.array([2.9, 1.9, 0.9])
        mask = ((vertices.max(axis=1) >= roi_min) & (vertices.min(axis=1) <= roi_max)).all(axis=1)
        self.cells = tetra[mask]
        vertices = vertices[mask]
        self.origin = vertices[:, 0]
        matrix = np.stack([vertices[:, 1]-vertices[:, 0], vertices[:, 2]-vertices[:, 0], vertices[:, 3]-vertices[:, 0]], axis=2)
        self.inverse = np.linalg.inv(matrix)
        self.tree = cKDTree(vertices.mean(axis=1))
        self.fields = fields
        print('interpolation tetrahedra:',len(vertices),flush=True)

    def sample(self, p, return_valid=False):
        result = np.full((len(p), self.fields.shape[1]), np.nan)
        missing = np.arange(len(p))
        for k in (24, 96, 384):
            if not len(missing): break
            _, candidates = self.tree.query(p[missing], k=k, workers=2)
            delta = p[missing, None, :]-self.origin[candidates]
            w = np.einsum('nkij,nkj->nki', self.inverse[candidates], delta)
            bary = np.concatenate([1-w.sum(axis=2, keepdims=True), w], axis=2)
            inside = (bary >= -1e-7).all(axis=2) & (bary <= 1+1e-7).all(axis=2)
            hit = inside.any(axis=1)
            local = inside[hit].argmax(axis=1)
            cells = candidates[hit, local]
            weights = bary[hit, local]
            result[missing[hit]] = np.einsum('ni,nij->nj', weights, self.fields[self.cells[cells]])
            missing = missing[~hit]
        return (result, np.isfinite(result).all(axis=1)) if return_valid else result


def streamlines(field):
    rng = np.random.default_rng(726)
    # Near-wing sheets plus wing-tip region. Points are seeded upstream.
    y, z = np.meshgrid(np.linspace(0.012, 1.58, 42), np.linspace(-0.24, 0.24, 28))
    seeds = np.column_stack([np.full(y.size, -0.28), y.ravel(), z.ravel()])
    seeds[:, 1:] += rng.uniform(-0.003, 0.003, (len(seeds), 2))
    paths = np.full((len(seeds), 250, 3), np.nan)
    speeds = np.full((len(seeds), 250), np.nan)
    p, ids = seeds.copy(), np.arange(len(seeds))
    step = 0.012
    for i in range(250):
        values, valid = field.sample(p, True)
        p, ids, values = p[valid], ids[valid], values[valid]
        if not len(p): break
        v = values[:, :3]
        speed = np.linalg.norm(v, axis=1)
        paths[ids, i], speeds[ids, i] = p, speed*UINF
        mid = p+step*0.5*v/np.maximum(speed[:, None], 1e-10)
        values2, valid2 = field.sample(mid, True)
        p, ids, values2 = p[valid2], ids[valid2], values2[valid2]
        v2 = values2[:, :3]
        p += step*v2/np.maximum(np.linalg.norm(v2, axis=1, keepdims=True), 1e-10)
        active = (p[:, 0] < 2.6) & (p[:, 1] > 0) & (p[:, 1] < 1.8) & (np.abs(p[:, 2]) < 0.75)
        p, ids = p[active], ids[active]
        if i % 40 == 0: print('streamline step',i,'active',len(ids),flush=True)
    np.savez_compressed(QA / 'streamlines.npz', paths=paths, speeds=speeds)
    return paths, speeds


def build_flow(paths, speeds):
    pos, scale, quat, color, alpha = [], [], [], [], []
    phase=np.random.default_rng(481).integers(0,12,len(paths))
    # Each packet is a bright downstream head and six progressively fainter
    # upstream splats lying on the computed streamline, not an invented curve.
    for i in range(10, paths.shape[1]-1, 12):
        index=np.minimum(i+phase,paths.shape[1]-2)
        valid = np.isfinite(paths[np.arange(len(paths)), index+1]).all(axis=1)
        if not valid.any(): continue
        line=np.flatnonzero(valid)
        index=index[valid]
        head = paths[line, index]
        velocity = speeds[line, index]
        rgb = palette(velocity, 180, 420)
        length_ratio = np.clip(velocity/UINF, 0.35, 1.6)
        for j in range(7):
            at = index-j
            point = paths[line, at]
            tangent = display(paths[line, at+1]-paths[line, at-1])
            width = np.full(len(head), 0.0028 if j == 0 else 0.0022*(1-j/9))
            length = width if j == 0 else 0.0065*length_ratio
            pos.append(display(point))
            scale.append(np.column_stack([length, width, width]))
            quat.append(align_axis(tangent))
            color.append(np.clip(rgb*(1.0 if j else 0.5)+(0.0 if j else 0.5),0,1))
            alpha.append(np.full(len(head),0.93 if j == 0 else 0.56*(1-j/7)))
    # Select whole head/tail packets throughout the flow, keeping the requested
    # total exact. A final shorter packet accommodates a non-multiple of 14.
    packets = [np.concatenate([np.stack(v[i:i+7], axis=1) for i in range(0,len(v),7)])
               for v in [pos,scale,quat,color,alpha]]
    half_target=TARGET_FLOW_SPLATS//2
    whole,remainder=divmod(half_target,7)
    needed=whole+bool(remainder)
    assert len(packets[0]) >= needed, 'Increase streamline seed density'
    selection=np.linspace(0,len(packets[0])-1,needed,dtype=int)
    half=[]
    for packet in packets:
        values=packet[selection[:whole]].reshape((-1,)+packet.shape[2:])
        if remainder:
            values=np.concatenate([values,packet[selection[-1],:remainder]])
        half.append(values)
    # Symmetric reflection of the half-wing solution, not a second CFD run.
    positions, scales, quats, rgb, opacity = half
    reflected_p = positions.copy(); reflected_p[:, 2] *= -1
    reflected_q = quats.copy(); reflected_q[:, :2] *= -1
    assert len(positions)*2 == TARGET_FLOW_SPLATS
    return write_spz(ASSETS/'flow.spz', np.concatenate([positions,reflected_p]),
                     np.tile(scales,(2,1)),np.concatenate([quats,reflected_q]),
                     np.tile(rgb,(2,1)),np.tile(opacity,2))


def build_wing(points, tetra, triangles, cp, pressure):
    ids, inverse = np.unique(triangles.ravel(), return_inverse=True)
    pos = display(points[ids])
    indices = inverse.reshape(-1,3)
    colors = palette(cp[ids], -1.2, 0.6, 'coolwarm')
    # Both halves share exactly the same coordinate transform as SPZ.
    mirror = pos.copy(); mirror[:,2] *= -1
    allpos = np.concatenate([pos,mirror])
    allindices = np.concatenate([indices,indices[:,[0,2,1]]+len(ids)])
    mesh = {'positions':np.round(allpos,7).ravel().tolist(),
            'indices':allindices.ravel().tolist(),
            'cp':np.round(np.tile(cp[ids],2),6).tolist(),
            'colors':np.round(np.column_stack([np.tile(colors,(2,1)),np.ones(len(ids)*2)]),4).ravel().tolist()}
    (ASSETS/'wing.json').write_text(json.dumps(mesh,separators=(',',':')),encoding='utf-8',newline='\n')
    centers = points[triangles].mean(axis=1)
    normal = np.cross(points[triangles[:,1]]-points[triangles[:,0]],points[triangles[:,2]]-points[triangles[:,0]])
    area = np.linalg.norm(normal,axis=1)*0.5
    normal /= 2*area[:,None]
    # SU2 boundary orientations are checked against neighboring fluid cells.
    vertices=points[tetra]
    tree=cKDTree(vertices.mean(axis=1))
    cell=np.full(len(centers),-1,dtype=int)
    for k in (24,96,384):
        missing=np.flatnonzero(cell<0)
        if not len(missing): break
        _, near=tree.query(centers[missing],k=k,workers=2)
        adjacent=(tetra[near][...,None]==triangles[missing,None,None,:]).any(axis=2).all(axis=2)
        found=adjacent.any(axis=1)
        cell[missing[found]]=near[found,adjacent[found].argmax(axis=1)]
    assert (cell>=0).all(), 'Cannot establish outward surface normal'
    into_fluid=vertices[cell].mean(axis=1)-centers
    normal *= np.where((normal*into_fluid).sum(axis=1)<0,-1,1)[:,None]
    # Body outward normal points into fluid; pressure difference pushes inward.
    face_cp=cp[triangles].mean(axis=1)
    force= -((pressure[triangles].mean(axis=1)-101325)*area)[:,None]*normal
    fullforce=force.sum(axis=0); fullforce[1]=0; fullforce[[0,2]]*=2
    # Sparse samples of relative pressure traction, not mesh-dependent face force.
    rng=np.random.default_rng(342)
    selected=rng.choice(len(centers),size=450,replace=False,p=area/area.sum())
    base=centers[selected]+normal[selected]*0.006
    direction=-normal[selected]*np.sign(face_cp[selected,None])
    mag=np.minimum(np.abs(face_cp[selected]),1.2)*0.12+0.015
    # Positive-pressure arrows approach the surface from outside, so their
    # downstream heads do not disappear inside the solid wing.
    base += normal[selected]*(mag*(face_cp[selected]>0))[:,None]
    q=align_axis(display(direction))
    positions=[]; scales=[]; quats=[]; colors=[]; alphas=[]
    rgb=palette(face_cp[selected],-1.2,0.6,'coolwarm')
    for j in range(9):
        f=1-j/9
        point=display(base+direction*(mag*f)[:,None])
        positions.append(point)
        width=np.full(len(base),0.0035 if j==0 else 0.002)
        scales.append(np.column_stack([width if j==0 else mag/18,width,width]))
        quats.append(q); colors.append(rgb); alphas.append(np.full(len(base),0.95 if j==0 else 0.55*(1-j/10)))
    p,s,q,c,a=[np.concatenate(v) for v in [positions,scales,quats,colors,alphas]]
    mp=p.copy();mp[:,2]*=-1
    mq=q.copy();mq[:,:2]*=-1
    splat=write_spz(ASSETS/'pressure-force.spz',np.concatenate([p,mp]),np.tile(s,(2,1)),np.concatenate([q,mq]),np.tile(c,(2,1)),np.tile(a,2))
    return {'vertices':len(allpos),'triangles':len(allindices),'cp_range':[float(cp[ids].min()),float(cp[ids].max())],
            'relative_pressure_force_full_wing_N':fullforce.tolist(),'pressure_force_spz':splat}


def main():
    start=time.time()
    points,tetra,wing,_=read_mesh()
    data=np.loadtxt(WORK/'restart_flow.csv',delimiter=',',skiprows=1)
    assert np.array_equal(data[:,0].astype(int),np.arange(len(points)))
    assert np.max(np.abs(points-data[:,1:4]))<1e-10
    rho=data[:,4]; v=data[:,5:8]/rho[:,None]
    p=(GAMMA-1)*(data[:,8]-0.5*rho*np.sum(v*v,axis=1))
    pinf=1/(GAMMA*MACH*MACH)
    cp=2*(p-pinf)
    pressure=p/pinf*101325
    assert (rho>0).all() and (p>0).all()
    # Independently compare reconstructed values against SU2's own VTK output.
    vtk=(WORK/'flow.vtk').read_text().splitlines()
    exported={}
    for i,line in enumerate(vtk):
        if line.startswith('SCALARS Pressure_Coefficient '):
            exported['cp']=np.fromstring(vtk[i+2],sep=' ')
        elif line.startswith('VECTORS Velocity '):
            exported['velocity']=np.fromstring(vtk[i+1],sep=' ').reshape(-1,3)
    cp_export_error=float(np.max(np.abs(cp-exported['cp'])))
    velocity_export_error=float(np.max(np.abs(v-exported['velocity'])))
    assert cp_export_error<1e-5, cp_export_error
    assert velocity_export_error<1e-5, velocity_export_error
    field=FluidField(points,tetra,np.column_stack([v,cp]))
    rng=np.random.default_rng(1)
    select=rng.choice(len(field.cells),200,replace=False)
    test=points[field.cells[select]].mean(axis=1)
    expected=field.fields[field.cells[select]].mean(axis=1)
    actual=field.sample(test)
    interpolation_error=float(np.max(np.abs(actual-expected)))
    assert interpolation_error<1e-7
    paths,speeds=streamlines(field)
    flow=build_flow(paths,speeds)
    mesh=build_wing(points,tetra,wing,cp,pressure)
    with (WORK/'history.csv').open() as f:
        rows=list(csv.DictReader(f,skipinitialspace=True))
    def row_float(row): return {k.strip():float(value) for k,value in row.items()}
    history=[row_float(r) for r in rows]
    last=history[-1]
    assert last['rms[Rho]']<-11
    coefficient_change={key:float(abs(last[key]-history[-min(20,len(history))][key])) for key in ['CL','CD']}
    run=json.loads((WORK/'run.json').read_text())
    manifest={'title':'ONERA M6 — static CFD splats','solver':run,'equations':'3-D steady compressible Euler (inviscid)',
        'mach':MACH,'angle_of_attack_degrees':3.06,'freestream_temperature_K':TEMP,'freestream_pressure_Pa':101325,
        'freestream_velocity_m_s':float(UINF),'mesh_points':len(points),'mesh_tetrahedra':len(tetra),
        'symmetry':'Original half-wing CFD mirrored across y=0 for full-wing display',
        'display_transform':'(x,y,z) -> (x,z,-y); meters; right-handed',
        'convergence':last,'last_20_iteration_coefficient_change':coefficient_change,
        'interpolation_max_absolute_error':interpolation_error,'flow_spz':flow,'wing':mesh,
        'su2_export_max_errors':{'Cp':cp_export_error,'nondimensional_velocity':velocity_export_error},
        'streamline_count_half_wing':len(paths),'streamline_points_half_wing':int(np.isfinite(speeds).sum()),
        'speed_color_range_m_s':[180,420],'cp_color_range':[-1.2,0.6],
        'sampled_speed_range_m_s':[float(np.nanmin(speeds)),float(np.nanmax(speeds))],
        'head_tail':'Bright head downstream; six fading upstream splats along computed streamline',
        'sources':{'tutorial':'https://su2code.github.io/tutorials/Inviscid_ONERAM6/',
            'mesh':'https://raw.githubusercontent.com/su2code/Tutorials/master/compressible_flow/Inviscid_ONERAM6/mesh_ONERAM6_inv_ffd.su2',
            'solver':'https://github.com/su2code/SU2/releases/tag/v8.5.0'},
        'limitations':['No viscosity, skin friction, boundary-layer separation or stall prediction',
            'Single mesh; no grid-convergence or experimental validation performed',
            'Static streamline packets, not particle trajectories from an unsteady solution',
            'Pressure arrows show force per area relative to ambient; not total force or viscous stress'],
        'asset_build_seconds':time.time()-start}
    (ASSETS/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8',newline='\n')
    (ASSETS/'convergence.json').write_text(json.dumps(history,separators=(',',':')),encoding='utf-8',newline='\n')
    print(json.dumps({'flow':flow,'wing':mesh,'convergence':last,'build_seconds':time.time()-start}),flush=True)


if __name__=='__main__': main()
