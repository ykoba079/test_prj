"""Evaluate the exported ONNX on a held-out prepared split and save previews."""
import argparse
import json
from pathlib import Path
import time

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw
import torch
from torchmetrics.detection import MeanAveragePrecision
from torchvision.ops import batched_nms, box_iou


def prepare(image, size):
    image = image.convert('RGB')
    scale = min(size/image.width, size/image.height)
    w, h = round(image.width*scale), round(image.height*scale)
    x, y = (size-w)//2, (size-h)//2
    padded = Image.new('RGB', (size, size), (114, 114, 114))
    padded.paste(image.resize((w, h), Image.Resampling.BILINEAR), (x, y))
    data = np.asarray(padded).astype('float32').transpose(2, 0, 1)[None]/255
    return data, (w/image.width, h/image.height, x, y)


def decode(output, classes, geometry, width, height, threshold):
    data = torch.from_numpy(output[0].T.copy())
    scores, labels = data[:, 4:].max(dim=1)
    valid = scores >= threshold
    boxes, scores, labels = data[valid, :4], scores[valid], labels[valid]
    sx, sy, px, py = geometry
    boxes[:, [0, 2]] = (boxes[:, [0, 2]]-px)/sx
    boxes[:, [1, 3]] = (boxes[:, [1, 3]]-py)/sy
    boxes[:, [0, 2]] = boxes[:, [0, 2]].clamp(0, width)
    boxes[:, [1, 3]] = boxes[:, [1, 3]].clamp(0, height)
    keep = (boxes[:, 2] > boxes[:, 0]) & (boxes[:, 3] > boxes[:, 1])
    boxes, scores, labels = boxes[keep], scores[keep], labels[keep]
    keep = batched_nms(boxes, scores, labels, .45)[:100]
    return {'boxes': boxes[keep], 'scores': scores[keep], 'labels': labels[keep]}


def main(args):
    config = json.loads(args.config.read_text(encoding='utf-8'))
    if config['boxFormat'] != 'xyxy':
        raise ValueError('this evaluator expects the exported xyxy contract')
    output = args.output.resolve()
    if output.exists():
        raise ValueError('choose a new evaluation directory')
    images = sorted((args.dataset/'images'/args.split).glob('*'))
    images = [p for p in images if p.suffix.lower() in ['.jpg', '.jpeg', '.png']]
    if not images:
        raise ValueError('no evaluation images')
    output.mkdir(parents=True)
    session = ort.InferenceSession(str(args.config.parent/config['url']), providers=['CPUExecutionProvider'])
    metric = MeanAveragePrecision(iou_type='bbox', box_format='xyxy', backend='faster_coco_eval')
    counts = {'true_positive': 0, 'false_positive': 0, 'false_negative': 0}
    records = []
    times = []
    generation_path = args.dataset/'generation.json'
    metadata = {}
    condition_names = []
    if generation_path.is_file():
        generation = json.loads(generation_path.read_text(encoding='utf-8'))
        condition_names = generation.get('condition_names', [])
        metadata = {(item['split'], item['name']): item for item in generation['items']}
    for path in images:
        with Image.open(path) as source:
            image = source.convert('RGB')
        data, geometry = prepare(image, config['inputSize'])
        start = time.perf_counter()
        result = session.run(None, {'images': data})[0]
        times.append(time.perf_counter()-start)
        prediction = decode(result, config['classes'], geometry, image.width, image.height, .001)
        rows = (args.dataset/'labels'/args.split/(path.stem+'.txt')).read_text().splitlines()
        targets, labels = [], []
        for row in rows:
            fields = list(map(float, row.split()))
            points = np.array(fields[1:]).reshape(-1, 2)*[image.width, image.height]
            targets.append([*points.min(0), *points.max(0)]);labels.append(int(fields[0]))
        target = {'boxes': torch.tensor(targets, dtype=torch.float32).reshape(-1, 4),
                  'labels': torch.tensor(labels, dtype=torch.int64)}
        metric.update([prediction], [target])
        valid = prediction['scores'] >= args.confidence
        visible = {k: v[valid] for k, v in prediction.items()}
        matched = set()
        false_positive_boxes = []
        before = counts.copy()
        # Confidence-ordered one-to-one matches at IoU 0.5.
        for box, cls in zip(visible['boxes'], visible['labels']):
            candidates = [(float(box_iou(box[None], truth[None])[0, 0]), i)
                          for i, (truth, label) in enumerate(zip(target['boxes'], target['labels']))
                          if i not in matched and label == cls]
            if candidates and max(candidates)[0] >= .5:
                matched.add(max(candidates)[1]);counts['true_positive'] += 1
            else:
                counts['false_positive'] += 1
                false_positive_boxes.append(box.tolist())
        counts['false_negative'] += len(targets)-len(matched)
        draw = ImageDraw.Draw(image)
        for box in target['boxes'].tolist():
            draw.rectangle(box, outline='cyan', width=2)
        for box, score, cls in zip(visible['boxes'].tolist(), visible['scores'].tolist(), visible['labels'].tolist()):
            draw.rectangle(box, outline='lime', width=2)
            draw.text((box[0]+3, max(0, box[1]-13)), f"{config['classes'][cls]} {score:.2f}", fill='lime')
        image.save(output/(path.stem+'.png'))
        info = metadata.get((args.split, path.stem), {})
        condition = info.get('condition')
        condition_name = condition_names[condition-1] if condition and condition <= len(condition_names) else None
        records.append({'image': path.name, 'truth': len(targets), 'detections': len(visible['boxes']),
                        **{key: counts[key]-before[key] for key in counts},
                        'condition': condition, 'condition_name': condition_name, 'orientation': info.get('orientation'),
                        'false_positive_boxes': false_positive_boxes})
    measured = metric.compute()
    tp, fp, fn = counts.values()
    report = {'split': args.split, 'images': len(images), 'classes': config['classes'],
              'input_size': config['inputSize'], 'confidence': args.confidence, 'match_iou': .5, 'nms_iou': .45,
              'map': float(measured['map']), 'map_50': float(measured['map_50']),
              **counts, 'precision': tp/(tp+fp) if tp+fp else 0, 'recall': tp/(tp+fn) if tp+fn else 0,
              'mean_inference_ms': sum(times)/len(times)*1000, 'runtime': 'ONNX Runtime CPU',
              'preview_colors': {'cyan': 'ground truth', 'lime': 'prediction'}, 'items': records}
    (output/'evaluation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k != 'items'}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('config', type=Path, help='exported model.json')
    parser.add_argument('dataset', type=Path, help='prepared dataset')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--split', choices=['val', 'test'], default='test')
    parser.add_argument('--confidence', type=float, default=.4)
    args = parser.parse_args()
    if not 0 <= args.confidence <= 1:
        parser.error('confidence must be between 0 and 1')
    main(args)
