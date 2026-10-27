"""Export a smaller input using exactly the published 640 model's checkpoint."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'yolo-camera/training'))
import export_onnx as exporter

if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--size', type=int, choices=[320], default=320)
    parser.add_argument('--checkpoint', type=Path, default=ROOT/'outputs/mikan-quality-improvement/run-640/best.pt')
    parser.add_argument('--output', type=Path, default=ROOT/'mikan-inspection-v02/models/quality-320')
    args = parser.parse_args()
    reference = json.loads((ROOT/'mikan-inspection-v02/models/quality-640/export-report.json').read_text())
    if hashlib.sha256(args.checkpoint.read_bytes()).hexdigest() != reference['checkpoint_sha256']:
        raise ValueError('Checkpoint must match the published 640 model')
    original_loader = exporter.load_checkpoint_model
    training_size = None

    def load_resolution(*params):
        global training_size
        model, cfg, saved = original_loader(*params)
        training_size = saved['input_size']
        return model, cfg, {**saved, 'input_size': args.size}

    exporter.load_checkpoint_model = load_resolution
    exporter.main(argparse.Namespace(checkpoint=args.checkpoint, output=args.output,
        upstream=ROOT/'yolo-camera/training/upstream', official_config=None, threads=2,
        name=f'YOLOv9-T / same quality weights / {args.size}', image=None))
    report_path = args.output/'export-report.json'
    report = json.loads(report_path.read_text())
    report['source_training_input_size'] = training_size
    report['export_input_size'] = args.size
    report['source_training_validation_map'] = report.pop('validation_map')
    report['note'] = 'Same weights as quality-640; source validation mAP is not a 320-resolution evaluation.'
    report_path.write_text(json.dumps(report, indent=2), encoding='utf-8')
