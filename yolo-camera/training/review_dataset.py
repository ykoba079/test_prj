"""Check a generated YOLO dataset and create a local image/label review page."""
import argparse
from collections import Counter
import hashlib
import html
import json
from pathlib import Path

from PIL import Image, ImageDraw

from prepare_dataset import convert_label

NAMES = ['単体・基本', '複数・離して配置', '一部が重なる', '暗い照明', '遠く・小さく写る',
         '低い角度', '明るい背景', 'ミカンなし', 'ミカン＋立方体', 'ミカン＋球体']


def review(source):
    source = source.resolve()
    manifest = json.loads((source/'generation.json').read_text(encoding='utf-8'))
    names = manifest.get('condition_names', NAMES)
    classes = json.loads((source/'classes.json').read_text(encoding='utf-8'))
    groups = json.loads((source/'groups.json').read_text(encoding='utf-8'))
    output = source/'review'
    if output.exists():
        raise ValueError('review already exists; use a new dataset directory')
    items = manifest['items']
    declared = {(item['split'], item['name']) for item in items}
    actual = {(p.parent.name, p.stem) for p in (source/'images').glob('*/*.png')}
    if len(items) != manifest['count'] or len(declared) != len(items) or declared != actual:
        raise ValueError('image files and generation manifest do not match')
    hashes, group_splits, records = {}, {}, []
    for item in items:
        split, name = item['split'], item['name']
        image_path = source/'images'/split/(name+'.png')
        label_path = source/'labels'/split/(name+'.txt')
        text = label_path.read_text(encoding='utf-8')
        convert_label(text, classes, label_path)  # Strict class, area and bounds validation.
        rows = [list(map(float, row.split())) for row in text.splitlines() if row.strip()]
        if len(rows) != item['visible_boxes'] or len(rows) != item['instances']:
            raise ValueError(f'{name}: expected and labeled instance counts differ')
        if (item['options']['count'] == 0) != (len(rows) == 0):
            raise ValueError(f'{name}: negative/positive condition mismatch')
        group = groups[f'{split}/{name}.png']
        if group in group_splits and group_splits[group] != split:
            raise ValueError(f'{name}: scene group crosses dataset splits')
        group_splits[group] = split
        with Image.open(image_path) as opened:
            image = opened.convert('RGB')
        digest = hashlib.sha256(image.tobytes()).hexdigest()
        if digest in hashes:
            raise ValueError(f'{name}: duplicate RGB image')
        hashes[digest] = name
        records.append((item, image, rows))
    # All validation finishes before writing previews.
    output.mkdir()
    cards = []
    for item, image, rows in records:
        split, name = item['split'], item['name']
        draw = ImageDraw.Draw(image)
        for cls, cx, cy, w, h in rows:
            box = ((cx-w/2)*image.width, (cy-h/2)*image.height,
                   (cx+w/2)*image.width, (cy+h/2)*image.height)
            draw.rectangle(box, outline='#61e8ff', width=3)
        image.thumbnail((280, 280), Image.Resampling.LANCZOS)
        thumb = output/'thumbs'/split/(name+'.jpg')
        thumb.parent.mkdir(parents=True, exist_ok=True)
        image.save(thumb, quality=90)
        condition = item['condition']
        orientation = item['orientation'] or '対象なし'
        cards.append(f'''<figure data-condition="{condition}" data-orientation="{html.escape(orientation, quote=True)}" data-split="{split}">
<a href="../images/{split}/{name}.png" target="_blank" rel="noopener"><img src="thumbs/{split}/{name}.jpg" width="280" height="280" loading="lazy" alt="条件{condition}の画像と正解枠"></a>
<figcaption>{condition}. {html.escape(names[condition-1])}</figcaption>
<p>{html.escape(orientation)} ｜ 正解 {len(rows)}個 ｜ {split}</p><small>{name}</small></figure>''')
    summary = {'images': len(items), 'boxes': sum(len(rows) for _, _, rows in records),
               'conditions': dict(sorted(Counter(item['condition'] for item in items).items())),
               'orientations': dict(Counter(item['orientation'] or '対象なし' for item in items)),
               'splits': dict(Counter(item['split'] for item in items)),
               'generation_version': manifest['version'], 'appearance_version': manifest['appearanceVersion'],
               'checks': ['image/manifest correspondence', 'label class/area/bounds',
                          'expected instance counts', 'negative images', 'scene split leakage', 'duplicate RGB images'],
               'training': 'not performed for this dataset'}
    (output/'report.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    condition_options = ''.join(f'<option value="{i+1}">{i+1}. {html.escape(name)}</option>' for i, name in enumerate(names))
    orientation_options = ''.join(f'<option>{html.escape(name)}</option>' for name in summary['orientations'])
    page = '''<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>生成したIMAGE_COUNT枚の画像と正解枠</title><style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#101820;color:#eef5f8}body{max-width:1300px;margin:auto;padding:20px}h1{font-size:24px}p,small{color:#b7c9d4}a{color:#8ed1ff}
.filters{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}select{font:inherit;padding:9px;max-width:100%;background:#203342;color:white;border:1px solid #486071;border-radius:6px}
#grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:22px}figure{margin:0;min-width:0}figure[hidden]{display:none}img{width:100%;height:auto;display:block;border-radius:8px}figcaption{font-weight:bold;margin-top:8px}figure p{font-size:13px;margin:5px 0}small{font-size:11px;overflow-wrap:anywhere}
</style></head><body><h1>生成画像と正解の枠を確認</h1>
<p>IMAGE_COUNT枚・CONDITION_SUMMARY。水色は正解の枠です。YOLOの推論結果ではありません。</p>
<p>画像を押すと、枠を描いていない元画像を開きます。このデータでの学習はまだ行っていません。</p>
<div class="filters"><label>条件 <select id="condition"><option value="">すべて</option>CONDITION_OPTIONS</select></label>
<label>向き <select id="orientation"><option value="">すべて</option>ORIENTATION_OPTIONS</select></label>
<label>用途 <select id="split"><option value="">すべて</option><option>train</option><option>val</option><option>test</option></select></label></div>
<p id="count"></p><div id="grid">CARDS</div><p><a href="report.json">生成件数・検査結果</a></p>
<script>const fields=['condition','orientation','split'];function filter(){let count=0;for(const card of document.querySelectorAll('figure')){card.hidden=!fields.every(key=>!document.getElementById(key).value||card.dataset[key]===document.getElementById(key).value);if(!card.hidden)count++;}document.getElementById('count').textContent=count+'枚を表示';}for(const id of fields)document.getElementById(id).onchange=filter;filter();</script>
</body></html>'''
    totals = list(summary['conditions'].values())
    condition_summary = f'{len(totals)}パターン各{totals[0]}枚' if len(set(totals)) == 1 else f'{len(totals)}パターン（件数は検査結果に記録）'
    page = page.replace('IMAGE_COUNT', str(len(items))).replace('CONDITION_SUMMARY', condition_summary)
    page = page.replace('CONDITION_OPTIONS', condition_options).replace('ORIENTATION_OPTIONS', orientation_options).replace('CARDS', '\n'.join(cards))
    (output/'index.html').write_text(page, encoding='utf-8')
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    args = parser.parse_args()
    result = review(args.source)
    print(json.dumps(result, ensure_ascii=True, indent=2))
