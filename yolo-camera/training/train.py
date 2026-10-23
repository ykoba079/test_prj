"""Train MIT YOLOv9-T and save the best validation checkpoint for export."""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import sys
import time

from common import ROOT, enable_upstream, read_classes
from setup_upstream import REVISION, WEIGHT_SHA256


def main(args):
    upstream = enable_upstream(args.upstream)
    import torch
    from hydra import compose, initialize_config_dir
    from lightning import Trainer, seed_everything
    from lightning.pytorch.callbacks import Callback
    from lightning.pytorch.loggers import CSVLogger
    from omegaconf import OmegaConf
    from torch.utils.data import DataLoader
    from yolo.tools.data_loader import collate_fn
    from yolo.tools.solver import TrainModel
    from yolo.utils.model_utils import GradientAccumulation

    if args.size < 64 or args.size % 32 or args.epochs < 1 or args.batch < 2 or args.workers < 0:
        raise ValueError('size must be a multiple of 32 >=64; epochs>=1, batch>=2, workers>=0')
    dataset_path = args.dataset.resolve()
    dataset_cfg = OmegaConf.load(dataset_path/'mikan.yaml')
    classes = read_classes(args.classes)
    if classes != list(dataset_cfg.class_list) or len(classes) != dataset_cfg.class_num:
        raise ValueError('classes do not match the prepared dataset')
    if not (dataset_path/'report.json').is_file():
        raise ValueError('run prepare_dataset.py before training')
    output = args.output.resolve()
    if output.exists():
        raise ValueError('output already exists; choose a new run directory')
    if args.device == 'cuda' and not torch.cuda.is_available():
        raise ValueError('CUDA is unavailable; use a CUDA PyTorch environment or --device cpu')
    torch.set_num_threads(args.threads)
    seed_everything(args.seed, workers=True)
    with initialize_config_dir(config_dir=str(upstream/'yolo/config'), version_base=None):
        cfg = compose(config_name='config', overrides=['task=train', 'model=v9-t', 'use_wandb=False'])
    cfg.dataset = dataset_cfg
    cfg.image_size = [args.size, args.size]
    cfg.cpu_num = args.workers
    cfg.weight = False  # Load and audit compatible weights ourselves below.
    cfg.task.epoch = args.epochs
    cfg.task.data.batch_size = args.batch
    cfg.task.validation.data.batch_size = args.batch
    cfg.task.ema.enable = False  # Evaluate and export the exact same non-EMA weights.

    class Model(TrainModel):
        def train_dataloader(self):
            # Pinned upstream create_dataloader does not pass its shuffle setting.
            return DataLoader(self.train_loader.dataset, batch_size=args.batch, shuffle=True,
                              num_workers=args.workers, pin_memory=args.device == 'cuda', collate_fn=collate_fn)

    model = Model(cfg)
    if len(model.train_loader.dataset) < 2:
        raise ValueError('training requires at least two images')
    transfer = {'mode': 'random initialization (smoke testing only)'}
    if not args.from_scratch:
        weight = upstream/'weights/v9-t.pt'
        if hashlib.sha256(weight.read_bytes()).hexdigest() != WEIGHT_SHA256:
            raise ValueError('pretrained weight checksum mismatch; rerun setup_upstream.py')
        state = torch.load(weight, map_location='cpu', weights_only=True)
        if 'state_dict' in state:
            state = {k.removeprefix('model.model.'): v for k, v in state['state_dict'].items()}
        current = model.model.model.state_dict()
        matching = {k: v for k, v in state.items() if k in current and v.shape == current[k].shape}
        if len(matching) < len(current)*0.5:
            raise ValueError('pretrained weights do not match this model architecture')
        model.model.model.load_state_dict(matching, strict=False)
        transfer = {'mode': 'transfer learning', 'sha256': WEIGHT_SHA256,
                    'loaded_tensors': len(matching), 'total_tensors': len(current),
                    'reinitialized_keys': sorted(set(current)-set(matching))}
    output.mkdir(parents=True)
    OmegaConf.save(cfg, output/'resolved-config.yaml')
    manifest = {'source_revision': REVISION, 'model_name': 'v9-t', 'classes': classes,
                'input_size': args.size, 'seed': args.seed, 'epochs': args.epochs,
                'device': args.device, 'transfer': transfer,
                'environment': {n: importlib.metadata.version(n) for n in
                                ['torch', 'torchvision', 'lightning', 'onnx', 'numpy']},
                'dataset_report': json.loads((dataset_path/'report.json').read_text(encoding='utf-8'))}
    (output/'run.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')

    class BestCheckpoint(Callback):
        best = -1.0
        def on_validation_end(self, trainer, module):
            if trainer.sanity_checking:
                return
            score = float(trainer.callback_metrics['map'])
            if not torch.isfinite(torch.tensor(score)):
                raise ValueError('validation mAP is not finite')
            record = {**manifest, 'epoch': trainer.current_epoch, 'validation_map': score,
                      'model_state_dict': {k: v.detach().cpu() for k, v in module.model.state_dict().items()}}
            torch.save(record, output/'last.pt')
            if score > self.best:
                self.best = score
                torch.save(record, output/'best.pt')

    checkpoint = BestCheckpoint()
    trainer = Trainer(accelerator='gpu' if args.device == 'cuda' else 'cpu', devices=1,
                      max_epochs=args.epochs, precision='32-true', deterministic=True,
                      logger=CSVLogger(str(output), name='metrics'), enable_checkpointing=False,
                      enable_model_summary=False, enable_progress_bar=False, log_every_n_steps=1,
                      callbacks=[GradientAccumulation(cfg.task.data, cfg.task.scheduler), checkpoint],
                      gradient_clip_val=10, num_sanity_val_steps=0)
    start = time.perf_counter()
    trainer.fit(model)
    (output/'result.json').write_text(json.dumps({'seconds': time.perf_counter()-start,
        'best_validation_map': checkpoint.best, 'checkpoint': 'best.pt'}, indent=2), encoding='utf-8')
    print(f'Best checkpoint: {output / "best.pt"}; validation mAP={checkpoint.best:.5f}')


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('dataset', type=Path, help='prepared dataset directory')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--upstream', type=Path, default=ROOT/'upstream')
    parser.add_argument('--classes', type=Path, default=ROOT/'classes.json')
    parser.add_argument('--epochs', type=int, default=50)
    parser.add_argument('--batch', type=int, default=4)
    parser.add_argument('--size', type=int, default=640)
    parser.add_argument('--workers', type=int, default=0)
    parser.add_argument('--threads', type=int, default=4)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--device', choices=['cpu', 'cuda'], default='cuda')
    parser.add_argument('--from-scratch', action='store_true', help='pipeline smoke test only; do not claim transfer learning')
    main(parser.parse_args())
