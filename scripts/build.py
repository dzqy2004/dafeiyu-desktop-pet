"""Build the final Windows portable package from the checked runtime snapshot."""
from pathlib import Path
import argparse, base64, hashlib, json, os, shutil, subprocess, tarfile, urllib.request, zipfile

ROOT = Path(__file__).resolve().parents[1]
def digest(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''): h.update(chunk)
    return h.hexdigest()

def download(url, target, check):
    if target.is_file() and check(target): return target
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_suffix(target.suffix + '.download')
    print('Downloading', url, flush=True)
    request = urllib.request.Request(url, headers={'User-Agent': 'dafeiyu-desktop-pet-build'})
    with urllib.request.urlopen(request, timeout=120) as response, temp.open('wb') as output:
        shutil.copyfileobj(response, output)
    if not check(temp): raise RuntimeError('Download integrity mismatch: ' + url)
    os.replace(temp, target)
    return target

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache-dir', type=Path, default=ROOT/'work/cache')
    parser.add_argument('--skip-tests', action='store_true', help='For a previously validated local packaging run')
    parser.add_argument('--rebuild-launcher', action='store_true', help='Compile the C# launcher instead of using the validated executable')
    args = parser.parse_args()
    work = ROOT/'work'
    work.mkdir(exist_ok=True)
    temp = work/'temp'
    temp.mkdir(exist_ok=True)
    os.environ['TEMP'] = os.environ['TMP'] = str(temp)
    deps = json.loads((ROOT/'scripts/dependencies.json').read_text(encoding='utf8'))
    tar_path = download(deps['petSource'], args.cache_dir/'dsh-pet-0.3.6.tgz',
        lambda p: 'sha512-' + base64.b64encode(hashlib.sha512(p.read_bytes()).digest()).decode() == deps['petIntegrity'])
    electron_path = download(deps['electronSource']+'electron-v43.3.0-win32-x64.zip',
        args.cache_dir/'electron-v43.3.0-win32-x64.zip', lambda p: digest(p) == deps['electronSHA256'])
    stage = work/'package/大肥鱼桌宠'
    # Delete only this generated stage, after verifying it stays inside the repository's work folder.
    if not stage.resolve().is_relative_to(work.resolve()): raise RuntimeError('Invalid build stage')
    if stage.exists(): shutil.rmtree(stage)
    pet = stage/'资源/pet'
    pet.mkdir(parents=True)
    manifest = json.loads((ROOT/'scripts/pet-manifest.json').read_text(encoding='utf8'))
    with tarfile.open(tar_path) as archive:
        for entry in manifest:
            rel = Path(entry['path'])
            target = pet/rel
            if not target.resolve().is_relative_to(pet.resolve()): raise RuntimeError('Invalid manifest path')
            target.parent.mkdir(parents=True, exist_ok=True)
            if entry['source'] == 'upstream':
                member = archive.getmember('package/' + entry['path'])
                with archive.extractfile(member) as source, target.open('wb') as output: shutil.copyfileobj(source, output)
            else: shutil.copy2(ROOT/'src/pet'/rel, target)
            if digest(target) != entry['sha256']: raise RuntimeError('Runtime snapshot mismatch: ' + entry['path'])
    if not args.skip_tests:
        subprocess.run(['node', '--test', str(ROOT/'tests/collision.test.cjs'),
            str(pet/'runtime/electron-helper/battle/tests/engine.test.cjs')], check=True)
    # Developer tests stay in the source repository, not in the end-user application.
    tests = pet/'runtime/electron-helper/battle/tests'
    if tests.exists(): shutil.rmtree(tests)
    electron = stage/'资源/electron'
    electron.mkdir()
    with zipfile.ZipFile(electron_path) as archive:
        for entry in json.loads((ROOT/'scripts/electron-manifest.json').read_text(encoding='utf8')):
            target = electron/entry['path']
            if not target.resolve().is_relative_to(electron.resolve()): raise RuntimeError('Invalid Electron archive path')
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(archive.read(entry['path']))
            if digest(target) != entry['sha256']: raise RuntimeError('Electron runtime mismatch: '+entry['path'])
    for name in ['ready.txt', 'portable-defaults.jsonc']: shutil.copy2(ROOT/'src'/name, stage/'资源'/name)
    launcher_manifest=json.loads((ROOT/'scripts/launcher-manifest.json').read_text(encoding='utf8'))
    launcher_source=ROOT/'src/launcher/PetLauncher.cs'
    prebuilt=ROOT/'src/launcher/final-launcher.exe'
    if not args.rebuild_launcher and digest(launcher_source)==launcher_manifest['sourceSha256']:
        if digest(prebuilt)!=launcher_manifest['executableSha256']: raise RuntimeError('Launcher integrity mismatch')
        shutil.copy2(prebuilt,stage/'大肥鱼桌宠.exe')
    else:
        compiler = Path(os.environ.get('WINDIR', r'C:\Windows'))/'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
        if not compiler.is_file(): raise RuntimeError('Windows .NET Framework C# compiler is required')
        references = ['System.Windows.Forms.dll', 'System.Drawing.dll', 'System.IO.Compression.dll',
            'System.IO.Compression.FileSystem.dll', 'System.Web.Extensions.dll', 'System.Security.dll']
        command = [str(compiler), '/nologo', '/target:winexe', '/platform:x64', '/optimize+',
            '/out:' + str(stage/'大肥鱼桌宠.exe'), '/win32icon:' + str(ROOT/'src/launcher/pet.ico')]
        command += ['/reference:'+name for name in references]
        command += [str(launcher_source)]
        subprocess.run(command, check=True)
    for rel in ['docs/使用说明.md', 'docs/电子斗蛐蛐.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
                'licenses/dsh-pet-MIT.txt', 'licenses/dafeiyu-persona-MIT.txt']:
        target = stage/(rel[5:] if rel.startswith('docs/') else rel)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT/rel, target)
    out = ROOT/'outputs'
    out.mkdir(exist_ok=True)
    package = out/'dafeiyu-desktop-pet-windows-x64.zip'
    with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for p in sorted(stage.rglob('*')):
            if p.is_file(): archive.write(p, p.relative_to(stage.parent).as_posix())
    with zipfile.ZipFile(package) as archive:
        if archive.testzip() is not None: raise RuntimeError('Release archive CRC mismatch')
    (out/'SHA256SUMS.txt').write_text(digest(package)+'  '+package.name+'\n', encoding='utf8')
    print('Built', package, package.stat().st_size, 'bytes', flush=True)

if __name__ == '__main__': main()
