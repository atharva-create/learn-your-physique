"""Restore source-registered eye surfaces and a lip color mask from BodyParts3D."""
from prepare_anatomy import ROOT
from scipy.spatial import cKDTree
import zipfile,json
import numpy as np

archive=zipfile.ZipFile(ROOT/'data/bodyparts3d.zip')
def read_obj(fid):
    lines=archive.read('isa_BP3D_4.0_obj_99/'+fid+'.obj').decode().splitlines()
    vertices=[];faces=[]
    for line in lines:
        w=line.split()
        if not w:continue
        if w[0]=='v':vertices.append([float(v) for v in w[1:4]])
        if w[0]=='f':
            poly=[int(v.split('/')[0])-1 for v in w[1:]]
            for i in range(1,len(poly)-1):faces.append([poly[0],poly[i],poly[i+1]])
    return np.array(vertices),np.array(faces)

meshes=[]
for kind,ids in [('sclera',['FJ1317','FJ1368']),('iris',['FJ1297','FJ1348']),('cornea',['FJ1289','FJ1340'])]:
    for fid in ids:
        v,f=read_obj(fid)
        meshes.append({'kind':kind,'sourceId':fid,'positions':v.round(4).flatten().tolist(),'indices':f.flatten().tolist()})
lip,_=read_obj('FJ2814')
meta=json.load(open(ROOT/'public/anatomy/skin.json'))
skin=np.fromfile(ROOT/'public/anatomy/skin.bin',dtype='<f4',count=meta['vertexCount']*3).reshape(-1,3)
distance,_=cKDTree(lip).query(skin)
mask=np.exp(-.5*(distance/1.7)**2)
indices=np.flatnonzero(mask>.02)
result={'meshes':meshes,'lipMask':[[int(i),round(float(mask[i]),4)] for i in indices]}
path=ROOT/'public/anatomy/face.json'
path.write_text(json.dumps(result,separators=(',',':')))
print('Eye surfaces:',len(meshes),'lip mask vertices:',len(indices),'bytes:',path.stat().st_size)
