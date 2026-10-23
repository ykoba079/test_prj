"""Shared source, class and checkpoint checks for the training tools."""
import json
from pathlib import Path
import sys

from setup_upstream import REVISION, ROOT


def enable_upstream(path):
    path = Path(path).resolve()
    marker = path/'.source-revision'
    if not marker.is_file() or marker.read_text().strip() != REVISION:
        raise ValueError('run setup_upstream.py first; only the pinned MIT implementation is supported')
    sys.path.insert(0, str(path))
    return path


def read_classes(path):
    names = json.loads(Path(path).read_text(encoding='utf-8'))
    if not isinstance(names, list) or not names or not all(isinstance(n, str) and n.strip() for n in names) or len(set(names)) != len(names):
        raise ValueError('classes must be a JSON array of unique non-empty names')
    return names


def load_checkpoint_model(checkpoint, upstream):
    import torch
    from omegaconf import OmegaConf
    from yolo.model.yolo import create_model
    # Training checkpoints are local artifacts produced by train.py.
    saved = torch.load(checkpoint, map_location='cpu', weights_only=True)
    if saved.get('source_revision') != REVISION or saved.get('model_name') != 'v9-t':
        raise ValueError('checkpoint must be produced by this pinned YOLOv9-T training runner')
    classes = saved['classes']
    model_cfg = OmegaConf.load(upstream/'yolo/config/model/v9-t.yaml')
    model = create_model(model_cfg, weight_path=False, class_num=len(classes))
    model.load_state_dict(saved['model_state_dict'], strict=True)
    model.eval()
    return model, model_cfg, saved
