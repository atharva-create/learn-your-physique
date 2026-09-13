import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clampSize, getSize, setSize, validateShape, serializeShape, deformMusclePositions, sizeToSlider, sliderToSize } from '../src/model.ts';

const catalog=JSON.parse(readFileSync(new URL('../public/anatomy/catalog.json',import.meta.url)));
const deltoid=catalog.groups.find(g=>g.id==='acromial-part-of-deltoid');
test('bilateral controls adjust only their requested sides and reset to baseline',()=>{
  let values=setSize({},deltoid,'both',1.35);
  assert.equal(getSize(values,deltoid.id,'left'),1.35);
  assert.equal(getSize(values,deltoid.id,'right'),1.35);
  values=setSize(values,deltoid,'left',1.15);
  assert.equal(getSize(values,deltoid.id,'right'),1.35);
  assert.equal(getSize(values,deltoid.id,'left'),1.15);
  assert.deepEqual(setSize(values,deltoid,'both',1),{});
  assert.equal(clampSize(200),10);assert.equal(clampSize(-1),.25);
});
test('export and import preserves an asymmetric shape',()=>{
  const original=setSize(setSize({},deltoid,'left',1.35),deltoid,'right',.85);
  assert.deepEqual(validateShape(JSON.parse(JSON.stringify(serializeShape(original))),catalog.groups),original);
});
test('untrusted imports reject unknown muscles, unsupported schemas and invalid sizes',()=>{
  for(const doc of [null,[],{}, {app:'FORM',version:7,values:{}},serializeShape({missing:1.1}),serializeShape({[`${deltoid.id}:left`]:Infinity}),serializeShape({[`${deltoid.id}:left`]:10.01}),serializeShape({[`${deltoid.id}:left`]:.24}),serializeShape({[`${deltoid.id}:left`]:'1.1'})])assert.throws(()=>validateShape(doc,catalog.groups));
});
test('extended size scale round-trips precisely and preserves older saved shapes',()=>{
  for(const size of [.25,.5,1,1.15,1.6,3,6,10])assert.equal(sliderToSize(sizeToSlider(size)),size);
  const values=setSize(setSize({},deltoid,'left',10),deltoid,'right',.25);
  assert.deepEqual(validateShape(serializeShape(values),catalog.groups),values);
  assert.deepEqual(validateShape(serializeShape({[`${deltoid.id}:left`]:1.6}),catalog.groups),{[`${deltoid.id}:left`]:1.6});
});
test('volume transform preserves the long axis and produces the requested volume ratio',()=>{
  // Orthogonal edges of a unit cube; determinant measures the actual transformed volume.
  const raw=new Float32Array([0,0,0, 1,0,0, 0,1,0, 0,0,1]);
  const out=deformMusclePositions(raw,[0,0,0],[0,0,1],1.44);
  assert.ok(Math.abs(out[3]*out[7]*out[11]-1.44)<1e-6);
  assert.equal(out[11],1);assert.equal(raw[3],1);
  assert.deepEqual(deformMusclePositions(raw,[0,0,0],[0,0,1],1),raw);
  const maximum=deformMusclePositions(raw,[0,0,0],[0,0,1],10);
  assert.ok(Math.abs(maximum[3]*maximum[7]*maximum[11]-10)<1e-5);
});
test('facial detail uses six valid source meshes and a mask registered to skin vertices',()=>{
  const face=JSON.parse(readFileSync(new URL('../public/anatomy/face.json',import.meta.url)));
  const skin=JSON.parse(readFileSync(new URL('../public/anatomy/skin.json',import.meta.url)));
  assert.equal(face.meshes.length,6);
  for(const m of face.meshes){
    assert.equal(m.positions.length%3,0);assert.equal(m.indices.length%3,0);
    assert.ok(m.positions.every(Number.isFinite));
    assert.ok(m.indices.every(i=>i>=0&&i<m.positions.length/3));
  }
  assert.ok(face.lipMask.length>0);
  for(const [index,weight] of face.lipMask){assert.ok(index>=0&&index<skin.vertexCount);assert.ok(weight>0&&weight<=1);}
});
test('every mesh has a valid catalog group, unit principal axis, and matching GLB node',()=>{
  const data=readFileSync(new URL('../public/anatomy/muscles.glb',import.meta.url));
  const gltf=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());
  const names=new Set(gltf.nodes.filter(n=>n.mesh!==undefined).map(n=>n.name));
  const ids=new Set(catalog.groups.map(g=>g.id));
  assert.equal(names.size,catalog.meshes.length);
  assert.equal(catalog.muscleMeshes,catalog.meshes.filter(m=>!m.support).length);
  assert.equal(catalog.muscleControls,catalog.groups.filter(g=>!g.support).length);
  for(const m of catalog.meshes){
    assert.ok(names.has(m.name),m.name);assert.ok(ids.has(m.group),m.group);
    assert.ok(Math.abs(Math.hypot(...m.axis)-1)<1e-5,m.name);
    assert.ok(m.center.every(Number.isFinite));
  }
});
test('skin buffers and every sparse deformation field fit the binary asset',()=>{
  const meta=JSON.parse(readFileSync(new URL('../public/anatomy/skin.json',import.meta.url)));
  const data=readFileSync(new URL('../public/anatomy/skin.bin',import.meta.url));
  const known=new Set(catalog.meshes.map(m=>m.name));
  assert.ok((meta.vertexCount*3+meta.indexCount)*4<=data.length);
  for(const f of meta.fields){
    assert.ok(known.has(f.name));assert.ok(f.offset+f.count*16<=data.length);
    for(let i=0;i<f.count;i++)assert.ok(data.readUInt32LE(f.offset+i*4)<meta.vertexCount);
  }
});

test('the skin retains a continuous groin surface without the original genital projection',()=>{
  const meta=JSON.parse(readFileSync(new URL('../public/anatomy/skin.json',import.meta.url)));
  const data=readFileSync(new URL('../public/anatomy/skin.bin',import.meta.url));
  let surfacePoints=0;
  for(let i=0;i<meta.vertexCount;i++){
    const x=data.readFloatLE(i*12),y=data.readFloatLE(i*12+4),z=data.readFloatLE(i*12+8);
    assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z));
    if(Math.abs(x)<25&&z>690&&z<775&&y<-75){
      surfacePoints++;
      assert.ok(y>-175,'The original external genital projection must not remain');
    }
  }
  assert.ok(surfacePoints>100,'The region must retain a skin surface');
  for(let i=0;i<meta.indexCount;i++)assert.ok(data.readUInt32LE(meta.vertexCount*12+i*4)<meta.vertexCount);
});
