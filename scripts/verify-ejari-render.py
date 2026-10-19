"""Compare the Rust roundtrip from test:ejari with the original at 144 dpi.

Requires Pillow, pypdf, and Poppler. Pass --poppler-dir if not on PATH.
No form values or user documents are used; temporary PNGs are deleted on exit.
"""
import argparse
from pathlib import Path
import subprocess
import tempfile

from PIL import Image, ImageChops
from pypdf import PdfReader

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--poppler-dir', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
original = root / 'public/ejari-template.pdf'
roundtrip = root / '.cache/ejari-proof/roundtrip.pdf'
if not roundtrip.exists():
    parser.error('Run npm run test:ejari first.')
renderer = str(args.poppler_dir / 'pdftoppm') if args.poppler_dir else 'pdftoppm'
assert len(PdfReader(roundtrip).pages) == 3
pairs = [('roundtrip', original, roundtrip)]
for usage in ['Residential', 'Commercial', 'Industrial']:
    pairs.append((usage, roundtrip.parent / f'{usage}-reference.pdf', roundtrip.parent / f'{usage}-rust.pdf'))
with tempfile.TemporaryDirectory(prefix='ejari-render-') as directory:
    temporary = Path(directory)
    for case, reference, result in pairs:
        for name, pdf in [('before', reference), ('after', result)]:
            subprocess.run([renderer, '-r', '144', '-png', str(pdf), str(temporary / name)], check=True)
        for page in range(1, 4):
            with Image.open(temporary / f'before-{page}.png') as before, Image.open(temporary / f'after-{page}.png') as after:
                assert before.size == after.size == (1224, 1584)
                assert ImageChops.difference(before.convert('RGB'), after.convert('RGB')).getbbox() is None, f'{case} page {page} changed'
                print(f'{case} page {page}: pixel-identical at 144 dpi (1224 x 1584).')
