"""Validate YOLO detection labels and prepare data for the pinned MIT YOLOv9.

Input: images/{train,val,test}/* and labels/{train,val,test}/*.txt
Labels: class_id center_x center_y width height (normalized).
Output labels use corner polygons required by MultimediaTechLab/YOLO.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil

from PIL import Image


def convert_label(text, classes, source):
    rows = []
    for line_num, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        values = line.split()
        where = f'{source}:{line_num}'
        if len(values) != 5:
            raise ValueError(f'{where}: expected class cx cy width height')
        cls, cx, cy, width, height = map(float, values)
        if not all(math.isfinite(v) for v in [cls, cx, cy, width, height]):
            raise ValueError(f'{where}: non-finite value')
        if not cls.is_integer() or not 0 <= cls < len(classes):
            raise ValueError(f'{where}: invalid class ID')
        x1, y1, x2, y2 = cx-width/2, cy-height/2, cx+width/2, cy+height/2
        if width <= 0 or height <= 0 or min(x1, y1) < -1e-6 or max(x2, y2) > 1+1e-6:
            raise ValueError(f'{where}: box must have positive area and stay inside image')
        corners = [max(0, min(1, v)) for v in [x1, y1, x2, y1, x2, y2, x1, y2]]
        rows.append(str(int(cls))+' '+' '.join(f'{v:.8f}' for v in corners))
    return '\n'.join(rows)+ ('\n' if rows else '')


def prepare(source, output, classes):
    source, output = source.resolve(), output.resolve()
    if source == output or source in output.parents or output in source.parents:
        raise ValueError('input and output must be separate, non-nested directories')
    if output.exists():
        raise ValueError('output already exists; choose a new directory to avoid stale data')
    if not isinstance(classes, list) or not classes or not all(isinstance(c, str) and c.strip() for c in classes) or len(set(classes)) != len(classes):
        raise ValueError('classes must be a non-empty list of unique names')
    records, hashes, group_splits, report = [], {}, {}, {}
    # Optional grouping catches related views of the same fruit/session.
    groups_path = source/'groups.json'
    groups = json.loads(groups_path.read_text(encoding='utf-8')) if groups_path.exists() else {}
    if not isinstance(groups, dict):
        raise ValueError('groups.json must be an object mapping image names to group IDs')
    for split in ['train', 'val', 'test']:
        folder = source/'images'/split
        if not folder.exists() and split == 'test':
            continue
        images = sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in ['.jpg', '.jpeg', '.png'])
        if not images:
            raise ValueError(f'{split}: no images')
        names = set()
        positives = 0
        class_counts = {name: 0 for name in classes}
        for image in images:
            if image.stem.casefold() in names:
                raise ValueError(f'{split}: duplicate image stem {image.stem}')
            names.add(image.stem.casefold())
            label = source/'labels'/split/(image.stem+'.txt')
            if not label.is_file():
                raise ValueError(f'missing label: {label}; create an empty file for a verified negative image')
            converted = convert_label(label.read_text(encoding='utf-8-sig'), classes, label)
            positives += bool(converted)
            for line in converted.splitlines():
                class_counts[classes[int(line.split()[0])]] += 1
            with Image.open(image) as im:
                im.load()
                # Pixel hash also catches differently encoded copies of an image.
                rgb = im.convert('RGB')
                digest = hashlib.sha256(str(rgb.size).encode()+rgb.tobytes()).hexdigest()
                if im.getexif().get(274, 1) != 1:
                    raise ValueError(f'{image}: normalize EXIF orientation before labeling')
            if digest in hashes and hashes[digest] != split:
                raise ValueError(f'image leakage across splits: {image}')
            hashes[digest] = split
            relative = f'{split}/{image.name}'
            if groups_path.exists():
                group = groups.get(relative)
                if not isinstance(group, str) or not group.strip():
                    raise ValueError(f'groups.json: missing group for {relative}')
                if group in group_splits and group_splits[group] != split:
                    raise ValueError(f'group leakage across splits: {group}')
                group_splits[group] = split
            records.append((split, image, converted))
        orphans = [p.name for p in (source/'labels'/split).glob('*.txt') if p.stem.casefold() not in names]
        if orphans:
            raise ValueError(f'{split}: labels without images: {orphans}')
        if not positives:
            raise ValueError(f'{split}: no positive images')
        report[split] = {'images': len(images), 'positive_images': positives, 'objects': class_counts}
    for split, image, converted in records:
        dest = output/'images'/split/image.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(image, dest)
        label = output/'labels'/split/(image.stem+'.txt')
        label.parent.mkdir(parents=True, exist_ok=True)
        label.write_text(converted, encoding='utf-8')
    # JSON scalar/list syntax is also valid YAML; paths are absolute for Hydra.
    config = (f'path: {json.dumps(output.as_posix())}\ntrain: train\nvalidation: val\n'
              f'class_num: {len(classes)}\nclass_list: {json.dumps(classes, ensure_ascii=False)}\n')
    (output/'mikan.yaml').write_text(config, encoding='utf-8')
    report['group_check'] = 'checked' if groups_path.exists() else 'not provided; manually verify fruit/session separation'
    generation = source/'generation.json'
    if generation.is_file():
        shutil.copy2(generation, output/'generation.json')
        report['generation_sha256'] = hashlib.sha256(generation.read_bytes()).hexdigest()
    if groups_path.exists():
        shutil.copy2(groups_path, output/'groups.json')
    (output/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--classes', type=Path, default=Path(__file__).with_name('classes.json'))
    args = parser.parse_args()
    try:
        print(json.dumps(prepare(args.source, args.output, json.loads(args.classes.read_text(encoding='utf-8'))), indent=2))
    except (ValueError, OSError) as exc:
        parser.exit(1, f'Error: {exc}\n')
