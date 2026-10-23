"""Create a standalone training-curve figure from the saved CSV log."""
import argparse
import csv
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    with args.csv.open(encoding='utf-8') as source:
        rows = list(csv.DictReader(source))
    validation = [row for row in rows if row.get('map')]
    epochs = [int(row['epoch'])+1 for row in validation]
    figure, axes = plt.subplots(1, 2, figsize=(10, 3.5), constrained_layout=True)
    axes[0].plot(epochs, [float(row['map']) for row in validation], label='mAP 0.50:0.95')
    axes[0].plot(epochs, [float(row['map_50']) for row in validation], label='mAP 0.50')
    axes[0].set_ylim(0, 1)
    axes[0].set_ylabel('Validation AP (10 synthetic images)')
    axes[0].legend()
    for key in ['BCELoss', 'BoxLoss', 'DFLLoss']:
        field = f'Loss/{key}_epoch'
        losses = [row for row in rows if row.get(field)]
        axes[1].plot([int(row['epoch'])+1 for row in losses], [float(row[field]) for row in losses], label=key)
    axes[1].set_ylabel('Training loss')
    axes[1].legend()
    for ax in axes:
        ax.set_xlabel('Epoch')
        ax.grid(alpha=.2)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    figure.savefig(args.output, dpi=160)
    plt.close(figure)
