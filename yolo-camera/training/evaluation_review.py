"""Build a compact review page from evaluate.py outputs."""
import argparse
import html
import json
import os
from pathlib import Path
from urllib.parse import urlencode


NAMES = ['単体・基本', '複数・離して配置', '一部が重なる', '暗い照明', '遠く・小さく写る',
         '低い角度', '明るい背景', 'ミカンなし', 'ミカン＋立方体', 'ミカン＋球体']


def build(folder, model):
    report = json.loads((folder/'evaluation.json').read_text(encoding='utf-8'))
    entry = Path(__file__).resolve().parent.parent/'detectsample_camera_yolo.html'
    demo_url = Path(os.path.relpath(entry, folder.resolve())).as_posix()+'?'+urlencode({'model': model})
    cards = []
    for item in sorted(report['items'], key=lambda row: row.get('condition') or 99):
        condition = item.get('condition')
        name = item.get('condition_name') or (NAMES[condition-1] if condition and condition <= len(NAMES) else '条件')
        title = f'{condition}. {name}' if condition else item['image']
        info = f"正解{item['truth']}個 / 検出{item['detections']}個"
        detail = f"正しく検出 {item['true_positive']}・誤検出 {item['false_positive']}・見逃し {item['false_negative']}"
        orientation = item.get('orientation') or 'ミカンなし'
        cards.append(f'''<figure><a href="{html.escape(item['image'], quote=True)}" target="_blank" rel="noopener"><img src="{html.escape(item['image'], quote=True)}" width="640" height="640" loading="lazy" alt="{html.escape(title)}の検出結果"></a>
<figcaption>{html.escape(title)}</figcaption><p>{html.escape(orientation)} ｜ {info}</p><p>{detail}</p></figure>''')
    summary = (f"評価画像{report['images']}枚・正解{report['true_positive']+report['false_negative']}個。"
               f"正しく検出{report['true_positive']}個、誤検出{report['false_positive']}個、見逃し{report['false_negative']}個。")
    page = f'''<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ミカンモデルの評価結果</title>
<style>:root{{color-scheme:dark;font-family:system-ui,sans-serif;background:#101820;color:#eef5f8}}body{{max-width:1200px;margin:auto;padding:20px}}h1{{font-size:24px}}p{{line-height:1.6;color:#b7c9d4}}a{{color:#8ed1ff}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:24px}}figure{{margin:0}}img{{width:100%;height:auto;display:block;border-radius:10px}}figcaption{{font-weight:bold;margin-top:10px}}figure p{{font-size:13px;margin:5px 0}}</style></head>
<body><h1>ミカンモデルの評価結果</h1><p>{summary}</p>
<p>信頼度{report['confidence']*100:.0f}%、照合IoU {report['match_iou']}。水色が正解、緑がYOLOの予測です。</p>
<p>適合率 {report['precision']*100:.1f}% / 再現率 {report['recall']*100:.1f}% / mAP50 {report['map_50']:.4f}</p>
<p>各条件1枚の小規模な合成画像評価です。実写や別の3Dモデルに対する精度は未検証です。</p>
<p><a href="{html.escape(demo_url, quote=True)}">このモデルで画像を試す</a> · <a href="evaluation.json">評価データ</a></p>
<div class="grid">{''.join(cards)}</div></body></html>'''
    (folder/'index.html').write_text(page, encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', type=Path)
    parser.add_argument('--model', default='models/mikan-v2-demo/model.json')
    args = parser.parse_args()
    build(args.folder, args.model)
