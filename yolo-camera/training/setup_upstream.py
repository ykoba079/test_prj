"""Download the pinned MIT implementation and its original YOLOv9-T weights."""
import argparse
import hashlib
import io
from pathlib import Path
import urllib.request
import zipfile

REVISION = 'c4cb5f6f56102eceeaa7d75e23e1125cd0373eaf'
WEIGHT_SHA256 = '73a51422da00db19af048e876b392591065db8872ee1aa41d5d8354169141be2'
ROOT = Path(__file__).resolve().parent


def download(url):
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


def setup(output):
    output = output.resolve()
    marker = output/'.source-revision'
    if output.exists():
        if not marker.is_file() or marker.read_text().strip() != REVISION:
            raise ValueError('existing upstream directory is not the pinned source; choose a new output')
    else:
        blob = download(f'https://codeload.github.com/MultimediaTechLab/YOLO/zip/{REVISION}')
        with zipfile.ZipFile(io.BytesIO(blob)) as archive:
            prefix = f'YOLO-{REVISION}/'
            for info in archive.infolist():
                relative = info.filename.removeprefix(prefix)
                if not info.filename.startswith(prefix) or info.is_dir():
                    continue
                target = (output/relative).resolve()
                if output not in target.parents:
                    raise ValueError('invalid archive path')
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(info))
        marker.write_text(REVISION+'\n')
    weight = output/'weights/v9-t.pt'
    if not weight.exists():
        blob = download('https://github.com/MultimediaTechLab/YOLO/releases/download/v1.0-alpha/v9-t.pt')
        if hashlib.sha256(blob).hexdigest() != WEIGHT_SHA256:
            raise ValueError('pretrained weight checksum does not match')
        weight.parent.mkdir(exist_ok=True)
        weight.write_bytes(blob)
    if hashlib.sha256(weight.read_bytes()).hexdigest() != WEIGHT_SHA256:
        raise ValueError('existing pretrained weight checksum does not match')
    print(f'Pinned MIT source: {output}\nPretrained weight: {weight}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT/'upstream')
    args = parser.parse_args()
    setup(args.output)
