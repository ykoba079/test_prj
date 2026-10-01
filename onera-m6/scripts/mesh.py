"""Read the actual SU2 tetrahedral mesh, preserving boundary connectivity."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'work/python-deps'))
import numpy as np


def read_mesh():
    cache = ROOT / 'work/mesh-cache.npz'
    if cache.exists():
        data = np.load(cache)
        return data['points'], data['tetra'], data['wing'], data['symmetry']
    with (ROOT / 'work/mesh_ONERAM6_inv_ffd.su2').open() as f:
        assert f.readline().strip() == 'NDIME= 3'
        count = int(f.readline().split('=')[1])
        tetra = np.empty((count, 4), dtype=np.int32)
        for i in range(count):
            row = f.readline().split()
            assert row[0] == '10'
            tetra[i] = row[1:5]
        count = int(f.readline().split('=')[1].split()[0])
        points = np.empty((count, 3))
        for i in range(count):
            points[i] = f.readline().split()[:3]
        marker_count = int(f.readline().split('=')[1])
        wing, symmetry = [], []
        for _ in range(marker_count):
            tag = f.readline().split('=')[1].strip()
            count = int(f.readline().split('=')[1])
            for i in range(count):
                row = f.readline().split()
                assert row[0] == '5'
                triangle = list(map(int, row[1:4]))
                if tag in ('UPPER_SIDE', 'LOWER_SIDE', 'TIP'):
                    wing.append(triangle)
                elif tag == 'SYMMETRY_FACE':
                    symmetry.append(triangle)
    wing = np.asarray(wing, dtype=np.int32)
    symmetry = np.asarray(symmetry, dtype=np.int32)
    np.savez_compressed(cache, points=points, tetra=tetra, wing=wing, symmetry=symmetry)
    return points, tetra, wing, symmetry


if __name__ == '__main__':
    points, tetra, wing, _ = read_mesh()
    print('points / tetra / wing triangles:',len(points),len(tetra),len(wing))
    print('wing bounds:',points[wing].min(axis=(0,1)),points[wing].max(axis=(0,1)))
