import urllib.request,tarfile,io,pathlib,re,json
root=pathlib.Path(__file__).resolve().parent.parent/'dist/vendor/three'
raw=urllib.request.urlopen('https://registry.npmjs.org/three/-/three-0.180.0.tgz',timeout=60).read()
t=tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz')
files={m.name.removeprefix('package/'):m for m in t.getmembers() if m.isfile()}
needed=['build/three.module.js','build/three.core.js','examples/jsm/loaders/GLTFLoader.js','examples/jsm/controls/OrbitControls.js','examples/jsm/postprocessing/EffectComposer.js','examples/jsm/postprocessing/RenderPass.js','examples/jsm/postprocessing/UnrealBloomPass.js','examples/jsm/postprocessing/OutputPass.js','examples/jsm/environments/RoomEnvironment.js','LICENSE']
seen=set()
while needed:
 p=needed.pop()
 if p in seen:continue
 seen.add(p);content=t.extractfile(files[p]).read();dest=root/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(content)
 if p.endswith('.js'):
  for dep in re.findall(r"from\s*['\"]([^'\"]+)['\"]",content.decode()):
   if dep.startswith('.'):
    import posixpath
    needed.append(posixpath.normpath(posixpath.join(posixpath.dirname(p),dep)))
print('Vendored',len(seen),'Three.js files',sum(p.stat().st_size for p in root.rglob('*') if p.is_file()),'bytes')
