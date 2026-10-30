#!/usr/bin/env python3
"""Package only the extension runtime, reproducibly, without local credentials."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ('manifest.json', 'core.js', 'background.js', 'content.js', 'options.html',
           'options.js', 'popup.html', 'popup.js', 'style.css')


def build(destination):
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    version = manifest['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Expected a numeric MAJOR.MINOR.PATCH manifest version')
    stage = destination / 'extension'
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True, exist_ok=True)
    # A dedicated allowlist prevents tests, CI, scripts and credentials from shipping.
    for name in RUNTIME:
        shutil.copyfile(ROOT / name, stage / name)
    archive = destination / f'sync-calendar-epitech-{version}.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as package:
        for name in RUNTIME:
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            package.writestr(info, (stage / name).read_bytes())
    shutil.copyfile(archive, destination / f'sync-calendar-epitech-{version}-unsigned.xpi')
    shutil.copyfile(ROOT / 'install.sh', destination / 'install.sh')
    (destination / 'install.sh').chmod(0o755)
    print(f'Packaged Firefox extension {version}: {archive.name}')


def checksums(destination):
    files = sorted(p for p in destination.iterdir() if p.is_file() and p.name != 'SHA256SUMS')
    (destination / 'SHA256SUMS').write_text(''.join(
        f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in files))
    print(f'SHA256SUMS: {len(files)} assets')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist', type=Path, default=ROOT / 'dist')
    parser.add_argument('--checksums-only', action='store_true')
    args = parser.parse_args()
    args.dist.mkdir(parents=True, exist_ok=True)
    if not args.checksums_only:
        build(args.dist)
    checksums(args.dist)
