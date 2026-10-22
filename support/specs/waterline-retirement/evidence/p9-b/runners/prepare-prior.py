from pathlib import Path
import shutil
root=Path('.tmp/wrp9/prior');root.mkdir(parents=True,exist_ok=True)
shutil.copytree('node_modules',root/'node_modules',symlinks=True,dirs_exist_ok=True)
for pkg in ['redbox-core','sails-hook-redbox-storage-mongo','raido','rva-registry','sails-ng-common','agenda-sqs-backend']:
 for item in ['package.json','package-lock.json','dist','node_modules','logfmt-transport.cjs']:
  src=Path('packages')/pkg/item; dst=root/'packages'/pkg/item
  if not src.exists():continue
  dst.parent.mkdir(parents=True,exist_ok=True)
  if src.is_dir():shutil.copytree(src,dst,symlinks=True,dirs_exist_ok=True)
  else:shutil.copy2(src,dst)
