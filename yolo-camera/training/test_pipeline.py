"""Small deterministic checks; no GPU, external source download, or training."""
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image

from prepare_dataset import convert_label, prepare


class DatasetChecks(unittest.TestCase):
    def test_box_format_conversion(self):
        values = list(map(float, convert_label('0 .5 .5 .4 .6', ['mikan'], 'sample').split()))
        self.assertEqual(values, [0, .3, .2, .7, .2, .7, .8, .3, .8])

    def test_invalid_labels(self):
        for text in ['1 .5 .5 .4 .4', '0 .1 .5 .8 .4', '0 nan .5 .4 .4', '0 .5 .5 0 .4', '0 1 2']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                convert_label(text, ['mikan'], 'sample')

    def test_missing_is_not_negative(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root/'src')
            (root/'src/labels/train/fruit.txt').unlink()
            with self.assertRaisesRegex(ValueError, 'missing label'):
                prepare(root/'src', root/'dest', ['mikan'])
            self.assertFalse((root/'dest').exists())

    @staticmethod
    def fixture(root):
        for split, color in [('train', 'orange'), ('val', 'yellow')]:
            (root/'images'/split).mkdir(parents=True)
            (root/'labels'/split).mkdir(parents=True)
            Image.new('RGB', (20, 20), color).save(root/'images'/split/'fruit.png')
            (root/'labels'/split/'fruit.txt').write_text('0 .5 .5 .4 .6')

    def test_preparation_and_negative_image(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root/'src')
            Image.new('RGB', (20, 20), 'blue').save(root/'src/images/train/empty.png')
            (root/'src/labels/train/empty.txt').write_text('')
            report = prepare(root/'src', root/'dest', ['mikan'])
            self.assertEqual(report['train']['positive_images'], 1)
            self.assertEqual(report['train']['images'], 2)
            self.assertEqual(report['train']['objects']['mikan'], 1)
            self.assertEqual((root/'dest/labels/train/empty.txt').read_text(), '')

    def test_pixel_leakage(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root/'src')
            (root/'src/images/val/fruit.png').write_bytes((root/'src/images/train/fruit.png').read_bytes())
            with self.assertRaisesRegex(ValueError, 'image leakage'):
                prepare(root/'src', root/'dest', ['mikan'])

    def test_group_leakage_and_missing_group(self):
        for groups in [{'train/fruit.png': 'same', 'val/fruit.png': 'same'}, {}]:
            with self.subTest(groups=groups), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                self.fixture(root/'src')
                (root/'src/groups.json').write_text(json.dumps(groups))
                with self.assertRaisesRegex(ValueError, 'group'):
                    prepare(root/'src', root/'dest', ['mikan'])


if __name__ == '__main__':
    unittest.main()
