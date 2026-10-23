"""Export a local training checkpoint to the existing browser demo contract."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys

from common import ROOT, enable_upstream, load_checkpoint_model


def main(args):
    upstream = enable_upstream(args.upstream)
    import numpy as np
    import onnx
    import onnxruntime as ort
    import torch
    from PIL import Image
    from yolo.utils.bounding_box_utils import create_converter

    torch.set_num_threads(args.threads)
    model, cfg, saved = load_checkpoint_model(args.checkpoint, upstream)
    size = saved['input_size']
    converter = create_converter('v9-t', model, cfg.anchor, [size, size], torch.device('cpu'))

    class BrowserModel(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.model = model
        def forward(self, images):
            logits, _, boxes = converter(self.model(images, shortcut='Main')['Main'])
            return torch.cat([boxes, logits.sigmoid()], dim=-1).transpose(1, 2)

    wrapper = BrowserModel().eval()
    output = args.output.resolve()
    if output.exists():
        raise ValueError('output already exists; choose a new model directory')
    output.mkdir(parents=True)
    dummy = torch.zeros(1, 3, size, size)
    model_file = output/'mikan.onnx'
    torch.onnx.export(wrapper, dummy, model_file, opset_version=17,
                      input_names=['images'], output_names=['output'], do_constant_folding=True)
    onnx.checker.check_model(str(model_file))
    runtime = ort.InferenceSession(str(model_file), providers=['CPUExecutionProvider'])
    # Check raw coordinates and every class probability before NMS on independent inputs.
    rng = np.random.default_rng(42)
    inputs = [('zeros', np.zeros((1, 3, size, size), dtype=np.float32)),
              ('random', rng.random((1, 3, size, size), dtype=np.float32))]
    if args.image:
        image = Image.open(args.image).convert('RGB')
        scale = min(size/image.width, size/image.height)
        w, h = round(image.width*scale), round(image.height*scale)
        frame = Image.new('RGB', (size, size), (114, 114, 114))
        frame.paste(image.resize((w, h), Image.Resampling.BILINEAR), ((size-w)//2, (size-h)//2))
        inputs.append(('image', np.asarray(frame).astype('float32').transpose(2, 0, 1)[None]/255))
    checks = []
    for name, data in inputs:
        with torch.no_grad():
            reference = wrapper(torch.from_numpy(data)).numpy()
        actual = runtime.run(None, {'images': data})[0]
        np.testing.assert_allclose(actual, reference, rtol=1e-3, atol=1e-2)
        checks.append({'input': name, 'shape': list(actual.shape),
                       'max_abs_difference': float(np.max(np.abs(actual-reference)))})
    config = {'name': args.name, 'url': './mikan.onnx', 'inputSize': size,
              'classes': saved['classes'], 'boxFormat': 'xyxy'}
    (output/'model.json').write_text(json.dumps(config, indent=2), encoding='utf-8')
    source = {'checkpoint_sha256': hashlib.sha256(args.checkpoint.read_bytes()).hexdigest(),
              'onnx_sha256': hashlib.sha256(model_file.read_bytes()).hexdigest(),
              'source_revision': saved['source_revision'], 'epoch': saved['epoch'],
              'validation_map': saved['validation_map'], 'checks': checks,
              'rtol': 1e-3, 'atol': 1e-2}
    (output/'export-report.json').write_text(json.dumps(source, indent=2), encoding='utf-8')
    shutil.copy2(upstream/'LICENSE', output/'YOLOv9-LICENSE.txt')
    print(json.dumps(source, indent=2))
    print(f'Browser config: {output/"model.json"}')


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('checkpoint', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--upstream', type=Path, default=ROOT/'upstream')
    parser.add_argument('--image', type=Path, help='optional image for an additional parity check')
    parser.add_argument('--threads', type=int, default=4)
    parser.add_argument('--name', default='YOLOv9-T / mikan', help='display name in the browser demo')
    main(parser.parse_args())
