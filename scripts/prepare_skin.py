"""Create a compact skin mesh and sparse, illustrative surface deformation fields."""
from prepare_anatomy import ROOT, read_glb
import json,struct
import numpy as np
from scipy.spatial import cKDTree

verts=[];faces=[]
for line in (ROOT/'data/obj/isa_BP3D_4.0_obj_99/FJ2810.obj').read_text().splitlines():
    words=line.split()
    if not words:continue
    if words[0]=='v':verts.append([float(x) for x in words[1:4]])
    if words[0]=='f':
        poly=[int(x.split('/')[0])-1 for x in words[1:]]
        for i in range(1,len(poly)-1):faces.append([poly[0],poly[i],poly[i+1]])
p=np.array(verts,dtype='<f4');f=np.array(faces,dtype='<u4')
normals=np.zeros_like(p)
fn=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
for j in range(3):np.add.at(normals,f[:,j],fn)
normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-8)
chunks=[p.tobytes(),f.tobytes()];offset=sum(map(len,chunks))
manifest={'vertexCount':len(p),'indexCount':f.size,'fields':[]}
doc,accessor=read_glb(ROOT/'public/anatomy/muscles.glb')
catalog=json.load(open(ROOT/'public/anatomy/catalog.json'))
meta={m['name']:m for m in catalog['meshes']}
for node in doc['nodes']:
    if 'mesh' not in node:continue
    m=meta[node['name']]
    if m['support']:continue
    mp=accessor(doc['meshes'][node['mesh']]['primitives'][0]['attributes']['POSITION'])
    dist,near=cKDTree(mp).query(p,workers=-1)
    # This approximates the surface envelope, not tissue biomechanics.
    # Small / internal structures deliberately have only local, small effects.
    radius=m['radius'];sigma=max(6,min(28,radius*0.65))
    affected=dist<sigma*2.5
    indexes=np.flatnonzero(affected)
    relative=mp[near[affected]]-m['center'];axis=np.array(m['axis'])
    radial=relative-np.outer(relative@axis,axis)
    displacement=np.maximum((radial*normals[indexes]).sum(1),0)
    weights=np.exp(-0.5*(dist[affected]/sigma)**2)
    delta=normals[indexes]*(displacement*weights)[:,None]
    keep=np.linalg.norm(delta,axis=1)>.05
    indexes=indexes[keep].astype('<u4');delta=delta[keep].astype('<f4')
    manifest['fields'].append({'name':node['name'],'offset':offset,'count':len(indexes)})
    chunks.extend([indexes.tobytes(),delta.tobytes()]);offset+=len(indexes)*16
(ROOT/'public/anatomy/skin.bin').write_bytes(b''.join(chunks))
(ROOT/'public/anatomy/skin.json').write_text(json.dumps(manifest,separators=(',',':')))
print('Skin:',len(p),'vertices;',len(f),'triangles;',round(offset/1e6,2),'MB with deformation fields.')
