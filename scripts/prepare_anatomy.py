"""Prepare the sourced GLB meshes for the Learn Your Physique interface.

Models: BodyParts3D + Z-Anatomy, prepared as GLB by Johan Bellander.
See public/anatomy/ATTRIBUTION.md. This script does not invent anatomy.
"""
import json, struct, re
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]

def read_glb(path):
    with open(path, 'rb') as f:
        f.seek(12)
        size, _ = struct.unpack('<II', f.read(8))
        doc = json.loads(f.read(size))
        size, _ = struct.unpack('<II', f.read(8))
        buf = f.read(size)
    def accessor(i):
        a = doc['accessors'][i]
        v = doc['bufferViews'][a['bufferView']]
        dtype = {5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]
        n = {'SCALAR':1,'VEC3':3}[a['type']]
        return np.frombuffer(buf, dtype=dtype, count=a['count']*n,
                             offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,n).copy()
    return doc, accessor

def group_for(n, center):
    if 'foot' in n or re.search(r'halluc|plantar interosse|flexor accessorius|digitorum brevis', n): return 'feet'
    if 'hand' in n or re.search(r'pollicis brevis|opponens pollicis|palmar interosse', n): return 'hands'
    if re.search(r'pectoralis|subclavius', n): return 'chest'
    if re.search(r'deltoid|supraspinat|infraspinat|subscapular|teres minor', n): return 'shoulders'
    if re.search(r'trapezius|latissimus|rhomboid|teres major|iliocostalis|longissimus|spinalis|multifid|rotator|rotatores|intertransvers|interspinal|serratus posterior|thoracolumbar|levator scapulae', n): return 'back'
    if re.search(r'rectus abdominis|oblique$|transversus abdominis|quadratus lumborum|serratus anterior|intercostal|diaphragm|transversus thoracis', n) and not re.search(r'inferior oblique|superior oblique',n): return 'core'
    if re.search(r'biceps brachii|triceps|brachialis|coracobrachialis|anconeus', n): return 'arms'
    if re.search(r'carpi|digitorum superficialis|digitorum profundus|extensor digitorum$|extensor digiti minimi$|extensor indicis|pollicis longus|extensor pollicis|brachioradialis|palmaris|pronator|supinator', n): return 'forearms'
    if re.search(r'gluteus|iliacus|psoas|piriformis|obturator|gemellus|quadratus femoris|tensor fascia|coccygeus|perineal|levator ani|iliotibial', n): return 'hips'
    if re.search(r'vastus|rectus femoris|biceps femoris|semitendinos|semimembranos|sartorius|gracilis|pectineus|adductor (magnus|minimus|brevis|longus)', n): return 'thighs'
    if re.search(r'gastrocnemius|soleus|tibialis|fibularis|plantaris|popliteus|digitorum longus|hallucis longus', n): return 'legs'
    # Remaining small structures are assigned by their actual model position.
    x,y,z=center
    if z > 1300: return 'head'
    if z < 130: return 'feet'
    if abs(x)>200 and z<850: return 'hands'
    if z>1200: return 'head'
    return 'core'

def normalize(n):
    n=re.sub(r'\b(left|right)\b', '', n.lower()).strip()
    n=re.sub(r'\s+', ' ', n).replace('of foot','of foot').strip()
    return n

def display(n):
    friendly={
      'acromial part of deltoid':'Lateral deltoid',
      'clavicular part of deltoid':'Anterior deltoid',
      'spinal part of deltoid':'Posterior deltoid',
      'clavicular part of pectoralis major':'Pectoralis major · upper',
      'sternocostal part of pectoralis major':'Pectoralis major · middle',
      'abdominal part of pectoralis major':'Pectoralis major · lower',
      'descending part of trapezius':'Upper trapezius',
      'transverse part of trapezius':'Middle trapezius',
      'ascending part of trapezius':'Lower trapezius',
    }
    if n in friendly:return friendly[n]
    m=re.match(r'(.*?) (head|belly) of (.*)',n)
    if m:n=m[3]+' · '+m[1]+' '+m[2]
    n=n.replace(' muscle','')
    return n[:1].upper()+n[1:]

def superficial(n):
    return bool(re.search(r'deltoid|pectoralis major|latissimus|trapezius|rectus abdominis|external oblique|serratus anterior|biceps brachii|triceps|brachioradialis|gluteus maximus|gluteus medius|vastus (lateralis|medialis)|rectus femoris|gastrocnemius|soleus|tibialis anterior|semitendinosus|biceps femoris|sartorius|gracilis|sternocleidomastoid|platysma|frontalis|orbicularis|zygomatic|mentalis|risorius|nasalis|procerus|labii|anguli|corrugator',n))

def main():
    doc,accessor=read_glb(ROOT/'public/anatomy/muscles.glb')
    source={x['name']:x for x in json.load(open(ROOT/'data/mesh_mapping.json'))}
    groups={};meshes=[];allpos=[]
    for node in doc['nodes']:
        if 'mesh' not in node:continue
        name=node['name']; primitive=doc['meshes'][node['mesh']]['primitives'][0]
        pos=accessor(primitive['attributes']['POSITION']);allpos.append(pos)
        lo=pos.min(0);hi=pos.max(0);center=(lo+hi)/2
        mean=pos.mean(0);_,vec=np.linalg.eigh(np.cov(pos.T));axis=vec[:,-1]
        along=(pos-mean)@axis
        radial=pos-mean-np.outer(along,axis)
        key=normalize(name);gid=re.sub(r'[^a-z0-9]+','-',key).strip('-')
        support=bool(re.search(r'tendon|ligament|retinaculum|membrane|fascia|iliotibial tract|aponeurosis',key))
        # Tensor fasciae latae is a muscle, not fascia.
        if 'tensor fasciae' in key:support=False
        side='left' if re.search(r'\bleft\b',name) else 'right' if re.search(r'\bright\b',name) else 'center'
        region=group_for(key,center)
        if gid not in groups:
            groups[gid]={'id':gid,'name':display(key),'anatomicalName':key,'region':region,
                'superficial':superficial(key),'support':support,'meshNames':[],
                'sources':[],'sides':[]}
        g=groups[gid];g['meshNames'].append(name)
        src=source.get(name,{}).get('source','bp3d')
        if src not in g['sources']:g['sources'].append(src)
        if side not in g['sides']:g['sides'].append(side)
        meshes.append({'name':name,'group':gid,'side':side,'center':mean.round(4).tolist(),
            'axis':axis.round(6).tolist(),'min':lo.round(3).tolist(),'max':hi.round(3).tolist(),
            'radius':float(np.percentile(np.linalg.norm(radial,axis=1),75)),
            'support':support,'source':src})
    full=np.concatenate(allpos);bounds=[full.min(0).tolist(),full.max(0).tolist()]
    catalog=sorted(groups.values(),key=lambda a:a['name'])
    output={'groups':catalog,'meshes':meshes,'bounds':bounds,
      'muscleMeshes':sum(not m['support'] for m in meshes),
      'muscleControls':sum(not g['support'] for g in catalog)}
    (ROOT/'public/anatomy/catalog.json').write_text(json.dumps(output,separators=(',',':')))
    print('Prepared',output['muscleMeshes'],'muscle meshes;',output['muscleControls'],'bilaterally grouped controls.')
    from collections import Counter
    print(Counter(g['region'] for g in catalog if not g['support']))
    print('Bounds',bounds)

if __name__=='__main__':main()
