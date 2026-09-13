"""Create a compact skin mesh and sparse, illustrative surface deformation fields."""
from prepare_anatomy import ROOT, read_glb
import json,struct
import numpy as np
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix, diags
from scipy.sparse.linalg import spsolve

verts=[];faces=[]
for line in (ROOT/'data/obj/isa_BP3D_4.0_obj_99/FJ2810.obj').read_text().splitlines():
    words=line.split()
    if not words:continue
    if words[0]=='v':verts.append([float(x) for x in words[1:4]])
    if words[0]=='f':
        poly=[int(x.split('/')[0])-1 for x in words[1:]]
        for i in range(1,len(poly)-1):faces.append([poly[0],poly[i],poly[i+1]])
p=np.array(verts,dtype='<f4');f=np.array(faces,dtype='<u4')
# Some source triangles have opposite winding across shared edges. Orient each
# connected surface consistently so the flattened patch has stable smooth normals.
adjacent=[[] for _ in f];edge_owner={}
for fi,triangle in enumerate(f):
    for a,b in zip(triangle,np.roll(triangle,-1)):
        a,b=int(a),int(b);edge=(min(a,b),max(a,b));direction=1 if a<b else -1
        if edge in edge_owner:
            other,other_direction=edge_owner[edge]
            relation=-direction*other_direction
            adjacent[fi].append((other,relation));adjacent[other].append((fi,relation))
        else:edge_owner[edge]=(fi,direction)
orientation=np.zeros(len(f),dtype=np.int8)
for seed in range(len(f)):
    if orientation[seed]:continue
    orientation[seed]=1;pending=[seed];component=[]
    while pending:
        current=pending.pop();component.append(current)
        for other,relation in adjacent[current]:
            if not orientation[other]:orientation[other]=orientation[current]*relation;pending.append(other)
    triangles=p[f[component]].astype(np.float64)
    volume=np.sum(np.einsum('ij,ij->i',triangles[:,0],np.cross(triangles[:,1],triangles[:,2]))*orientation[component])
    if volume<0:orientation[component]*=-1
flip=orientation<0
f[flip]=f[flip][:,[0,2,1]]
print('Oriented skin triangles:',int(flip.sum()))

# Replace the source's external genital detail with a smooth, continuous patch.
# Solve a local Dirichlet problem against the unchanged surrounding skin. This
# removes the protruding geometry instead of hiding it behind a camera or overlay.
# Vertex IDs/topology stay stable for the facial mask and generated skin fields.
patch=(np.abs(p[:,0])<60)&(p[:,2]>660)&(p[:,2]<815)&(p[:,1]<-75)
edges=np.vstack([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]])
edges=np.unique(np.sort(edges,axis=1),axis=0)
row=np.concatenate([edges[:,0],edges[:,1]])
col=np.concatenate([edges[:,1],edges[:,0]])
adjacency=coo_matrix((np.ones(len(row)),(row,col)),shape=(len(p),len(p))).tocsr()
laplacian=diags(np.asarray(adjacency.sum(axis=1)).ravel())-adjacency
inside=np.flatnonzero(patch);outside=np.flatnonzero(~patch)
p[inside]=spsolve(laplacian[inside][:,inside],adjacency[inside][:,outside]@p[outside])
print('Simplified external genital surface:',len(inside),'vertices')

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
