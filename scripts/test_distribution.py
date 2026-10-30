"""Build and installer integration checks; GitHub and Firefox are never contacted."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT/'manifest.json').read_text())['version']
TAG = 'v' + VERSION
spec = importlib.util.spec_from_file_location('extension_build', ROOT/'scripts/build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class DistributionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.assets = self.root/'assets'
        self.assets.mkdir()
        build.build(self.assets)
        build.checksums(self.assets)
        self.bin = self.root/'bin'
        self.bin.mkdir()
        fake = self.bin/'gh'
        fake.write_text('''#!/usr/bin/env python3
import json, os, pathlib, shutil, sys
args=sys.argv[1:]
assets=pathlib.Path(os.environ['MOCK_ASSETS'])
if args[:2]==['auth','status']:
    sys.exit(0)
if args[0]=='api':
    files=[p for p in assets.iterdir() if p.is_file()]
    tag='v'+os.environ['MOCK_VERSION']
    print(json.dumps({'tag_name':tag,'assets':[{'name':p.name,'browser_download_url':'https://github.com/Lluciocc/sync-calendar-epitech/releases/download/'+tag+'/'+p.name} for p in files]}))
elif args[:2]==['release','download']:
    shutil.copyfile(assets/args[args.index('--pattern')+1], pathlib.Path(args[args.index('--dir')+1])/args[args.index('--pattern')+1])
else:
    sys.exit('Unexpected gh call')
''')
        fake.chmod(0o755)
        self.destination = self.root/'installed with spaces'

    def run_installer(self, *args):
        env = {**os.environ, 'PATH':str(self.bin)+os.pathsep+os.environ['PATH'],
               'MOCK_ASSETS':str(self.assets), 'MOCK_VERSION':VERSION, 'NO_COLOR':'1'}
        return subprocess.run(['bash', str(ROOT/'install.sh'), '--no-open', '--dir', str(self.destination), *args],
                              env=env, capture_output=True, text=True, timeout=15)

    def test_allowlist_and_reproducibility(self):
        archive = self.assets/f'sync-calendar-epitech-{VERSION}.zip'
        before = hashlib.sha256(archive.read_bytes()).hexdigest()
        with zipfile.ZipFile(archive) as z:
            self.assertEqual(set(z.namelist()), set(build.RUNTIME))
            self.assertNotIn('install.sh', z.namelist())
        build.build(self.assets)
        self.assertEqual(before, hashlib.sha256(archive.read_bytes()).hexdigest())

    def test_private_release_dev_install_and_reinstall_preserves_files(self):
        first = self.run_installer()
        self.assertEqual(first.returncode, 0, first.stderr + first.stdout)
        current = self.destination/'current'
        previous = current.resolve()
        self.assertTrue((current/'extension/manifest.json').is_file())
        self.assertIn('Version de développement préparée', first.stdout)
        self.assertNotIn('\x1b', first.stdout)
        second = self.run_installer('--version', TAG)
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertTrue(previous.is_dir())
        self.assertNotEqual(previous, current.resolve())

    def test_signed_package_selected(self):
        signed = self.assets/f'sync-calendar-epitech-{VERSION}.xpi'
        shutil.copyfile(self.assets/f'sync-calendar-epitech-{VERSION}.zip', signed)
        # Signature presence fixture only; Firefox performs cryptographic verification.
        with zipfile.ZipFile(signed, 'a') as z:
            z.writestr('META-INF/mozilla.rsa', 'test fixture, not a valid signature')
        build.checksums(self.assets)
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Paquet signé prêt', result.stdout)
        self.assertTrue((self.destination/'current'/signed.name).is_file())
        result = self.run_installer('--dev')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.destination/'current/extension/manifest.json').is_file())

    def test_corrupted_asset_rejected(self):
        with (self.assets/f'sync-calendar-epitech-{VERSION}.zip').open('ab') as f:
            f.write(b'tampered')
        result = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('SHA-256 incorrecte', result.stderr)
        self.assertFalse(self.destination.exists())

    def test_archive_traversal_rejected_even_with_matching_checksum(self):
        with zipfile.ZipFile(self.assets/f'sync-calendar-epitech-{VERSION}.zip', 'a') as z:
            z.writestr('../outside.txt', 'must not extract')
        build.checksums(self.assets)
        result = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Chemin interdit', result.stderr)
        self.assertFalse(self.destination.exists())

    def test_invalid_option_and_version(self):
        for args in [('--version','../../bad'), ('--unknown',)]:
            result = self.run_installer(*args)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(self.destination.exists())


if __name__ == '__main__':
    unittest.main()
