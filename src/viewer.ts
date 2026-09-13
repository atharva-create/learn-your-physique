import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Catalog, FocusArea, MeshInfo, ViewerAPI, ViewerState } from './types';
import { getSize, deformMusclePositions } from './model';
import { addTissueCoordinates, tissueMaterial } from './materials';

interface SkinManifest {vertexCount:number;indexCount:number;fields:{name:string;offset:number;count:number}[]}
interface SkinField {name:string;indices:Uint32Array;delta:Float32Array}
interface Piece {mesh:THREE.Mesh;baseline:THREE.Mesh;info:MeshInfo;original:Float32Array;size:number}
interface FaceData {meshes:{kind:'sclera'|'iris'|'cornea';sourceId:string;positions:number[];indices:number[]}[];lipMask:[number,number][]}

// Version the changed surface files together so cached anatomy cannot restore the old surface.
const SURFACE_REVISION='2';
let assets: Promise<[ArrayBuffer,ArrayBuffer,ArrayBuffer,SkinManifest,FaceData]> | undefined;
function getAssets() {
  if (!assets) assets=Promise.all([
    ...['muscles.glb','skeleton.glb','skin.bin'].map(async n=> {
      const r=await fetch(`${import.meta.env.BASE_URL}anatomy/${n}${n==='skin.bin'?`?v=${SURFACE_REVISION}`:''}`);if(!r.ok)throw new Error(`Could not load ${n}`);return r.arrayBuffer();
    }),
    fetch(`${import.meta.env.BASE_URL}anatomy/skin.json?v=${SURFACE_REVISION}`).then(r=>{if(!r.ok)throw new Error('Could not load skin metadata');return r.json();}),
    fetch(`${import.meta.env.BASE_URL}anatomy/face.json`).then(r=>{if(!r.ok)throw new Error('Could not load facial anatomy');return r.json();}),
  ]) as Promise<[ArrayBuffer,ArrayBuffer,ArrayBuffer,SkinManifest,FaceData]>;
  return assets;
}

export async function createViewer(host: HTMLElement, catalog: Catalog,
  onSelect:(id:string)=>void, onHover:(label:string,x:number,y:number)=>void,
  signal:AbortSignal): Promise<ViewerAPI> {
  const [muscleBuffer,boneBuffer,skinBuffer,skinMeta,faceData]=await getAssets();
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  const loader=new GLTFLoader();
  const [muscleModel,boneModel]=await Promise.all([
    loader.parseAsync(muscleBuffer.slice(0),''),loader.parseAsync(boneBuffer.slice(0),'')
  ]);
  if(signal.aborted)throw new DOMException('Aborted','AbortError');

  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.0;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  renderer.domElement.tabIndex=0;
  renderer.domElement.setAttribute('aria-label','Interactive 3D body. Scroll to zoom toward the pointer. Drag to rotate; Shift-drag, right-drag, or Move mode to pan. Double-click to focus. Arrow keys pan when the model has focus.');
  renderer.domElement.setAttribute('role','img');
  host.appendChild(renderer.domElement);

  const scene=new THREE.Scene();
  const studio=new RoomEnvironment();const pmrem=new THREE.PMREMGenerator(renderer);
  const environment=pmrem.fromScene(studio,.04);scene.environment=environment.texture;scene.environmentIntensity=.3;
  studio.dispose();pmrem.dispose();
  const camera=new THREE.PerspectiveCamera(32,1,.015,300);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.12;
  controls.enablePan=true;controls.screenSpacePanning=true;controls.zoomToCursor=true;
  controls.minDistance=.12;controls.maxDistance=160;controls.panSpeed=1.;controls.keyPanSpeed=28;
  controls.listenToKeyEvents(renderer.domElement);
  controls.maxPolarAngle=Math.PI*.92;controls.minPolarAngle=Math.PI*.08;
  controls.rotateSpeed=.6;controls.zoomSpeed=.8;
  controls.target.set(0,0,0);camera.position.set(0,0,35);
  scene.add(new THREE.HemisphereLight(0xffffff,0xc2b6a5,1.5));
  const key=new THREE.DirectionalLight(0xfffaf2,2.5);key.position.set(-8,14,16);scene.add(key);
  key.castShadow=true;key.shadow.mapSize.set(2048,2048);
  key.shadow.camera.left=-15;key.shadow.camera.right=15;key.shadow.camera.top=15;key.shadow.camera.bottom=-15;
  key.shadow.camera.near=.5;key.shadow.camera.far=60;key.shadow.normalBias=.025;key.shadow.bias=.0001;
  const fill=new THREE.DirectionalLight(0xe6f1f0,1.1);fill.position.set(10,5,-10);scene.add(fill);
  const front=new THREE.DirectionalLight(0xffffff,.5);front.position.set(5,0,20);scene.add(front);
  const editRoot=new THREE.Group();const baseRoot=new THREE.Group();scene.add(editRoot,baseRoot);baseRoot.visible=false;
  const bones=new THREE.Group();const baseBones=new THREE.Group();editRoot.add(bones);baseRoot.add(baseBones);

  const center=new THREE.Vector3(
    (catalog.bounds[0][0]+catalog.bounds[1][0])/2,
    (catalog.bounds[0][1]+catalog.bounds[1][1])/2,
    (catalog.bounds[0][2]+catalog.bounds[1][2])/2
  );
  const scale=.01;
  function transformGeometry(g:THREE.BufferGeometry) {
    const pos=g.getAttribute('position');
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
      pos.setXYZ(i,(x-center.x)*scale,(z-center.z)*scale,-(y-center.y)*scale);
    }
    g.deleteAttribute('normal');g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox();return g;
  }
  const material=(color:string,extra:THREE.MeshStandardMaterialParameters={})=>new THREE.MeshStandardMaterial({color,roughness:.72,metalness:.03,side:THREE.DoubleSide,...extra});
  // Warm clay separates the muscle surface from the pale canvas and ivory bones.
  const muscleMat=tissueMaterial('#ad5948','muscle');
  const selectedMat=tissueMaterial('#267e70','muscle');
  const hoverMat=tissueMaterial('#67aa91','muscle');
  const ghostMat=material('#b77a64',{transparent:true,opacity:.14,depthWrite:false});
  const xraySelected=tissueMaterial('#267e70','muscle',{depthTest:false});
  const supportMat=material('#debd91');
  const boneMat=material('#f0dec0');
  const ghostBone=material('#debd91',{transparent:true,opacity:.08,depthWrite:false});
  const skinMat=tissueMaterial('#ffffff','skin',{vertexColors:true});
  const skinColor='#b77e59';
  const baseSkinMat=tissueMaterial(skinColor,'skin');
  const allMaterials=[muscleMat,selectedMat,hoverMat,ghostMat,xraySelected,supportMat,boneMat,ghostBone,skinMat,baseSkinMat];
  const byName=new Map(catalog.meshes.map(m=>[m.name.replace(/\s+/g,'_'),m]));
  const pieces:Piece[]=[];
  muscleModel.scene.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const info=byName.get(object.name);if(!info)throw new Error(`Missing anatomy metadata: ${object.name}`);
    const original=(object.geometry.getAttribute('position').array as Float32Array).slice();
    const geometry=transformGeometry(object.geometry.clone());
    addTissueCoordinates(geometry,original,info.center,info.axis);
    const mesh=new THREE.Mesh(geometry,info.support?supportMat:muscleMat);
    const baseline=new THREE.Mesh(geometry.clone(),info.support?supportMat:muscleMat);
    mesh.castShadow=true;mesh.receiveShadow=true;baseline.castShadow=true;baseline.receiveShadow=true;
    mesh.name=info.name;mesh.userData.group=info.group;
    editRoot.add(mesh);baseRoot.add(baseline);
    pieces.push({mesh,baseline,info,original,size:1});
    object.geometry.dispose();
    if(Array.isArray(object.material))object.material.forEach(m=>m.dispose());else object.material.dispose();
  });
  boneModel.scene.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const geometry=transformGeometry(object.geometry.clone());
    for(const root of [bones,baseBones]){const bone=new THREE.Mesh(geometry,boneMat);bone.castShadow=true;bone.receiveShadow=true;root.add(bone);}
    object.geometry.dispose();
    if(Array.isArray(object.material))object.material.forEach(m=>m.dispose());else object.material.dispose();
  });

  const skinRaw=new Float32Array(skinBuffer,0,skinMeta.vertexCount*3);
  const skinIndices=new Uint32Array(skinBuffer,skinMeta.vertexCount*12,skinMeta.indexCount);
  const skinGeometry=new THREE.BufferGeometry();
  skinGeometry.setAttribute('position',new THREE.BufferAttribute(skinRaw.slice(),3));
  skinGeometry.setIndex(new THREE.BufferAttribute(skinIndices,1));
  transformGeometry(skinGeometry);
  skinGeometry.setAttribute('tissueCoord',skinGeometry.getAttribute('position').clone());
  const skinBase=skinGeometry.getAttribute('position').array.slice() as Float32Array;
  const baseSkin=new THREE.Mesh(skinGeometry.clone(),baseSkinMat);baseRoot.add(baseSkin);
  const skin=new THREE.Mesh(skinGeometry,skinMat);editRoot.add(skin);
  skin.castShadow=true;skin.receiveShadow=true;baseSkin.castShadow=true;baseSkin.receiveShadow=true;
  const colors=new Float32Array(skinMeta.vertexCount*3);
  skinGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const complexion=new Float32Array(colors.length);
  const skinBaseColor=new THREE.Color(skinColor),lipColor=new THREE.Color('#ad5e52');
  for(let i=0;i<skinMeta.vertexCount;i++){
    complexion[i*3]=skinBaseColor.r;complexion[i*3+1]=skinBaseColor.g;complexion[i*3+2]=skinBaseColor.b;
  }
  for(const [i,weight] of faceData.lipMask){
    complexion[i*3]=THREE.MathUtils.lerp(skinBaseColor.r,lipColor.r,weight*.7);
    complexion[i*3+1]=THREE.MathUtils.lerp(skinBaseColor.g,lipColor.g,weight*.7);
    complexion[i*3+2]=THREE.MathUtils.lerp(skinBaseColor.b,lipColor.b,weight*.7);
  }
  baseSkin.geometry.setAttribute('color',new THREE.BufferAttribute(complexion.slice(),3));
  baseSkinMat.color.set('#ffffff');baseSkinMat.vertexColors=true;
  const eyes=new THREE.Group(),baseEyes=new THREE.Group();editRoot.add(eyes);baseRoot.add(baseEyes);
  const scleraMat=new THREE.MeshPhysicalMaterial({color:'#e7daca',roughness:.28,clearcoat:.7,clearcoatRoughness:.12});
  const irisMat=new THREE.MeshPhysicalMaterial({color:'#684832',roughness:.48,clearcoat:.3,side:THREE.DoubleSide});
  const corneaMat=new THREE.MeshPhysicalMaterial({color:'#ffffff',roughness:.07,clearcoat:1,clearcoatRoughness:.05,transparent:true,opacity:.1,depthWrite:false});
  const pupilMat=new THREE.MeshStandardMaterial({color:'#090a08',roughness:1,side:THREE.DoubleSide});
  irisMat.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 eyeCoord;varying vec2 vEyeCoord;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvEyeCoord=eyeCoord;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vEyeCoord;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float angle=atan(vEyeCoord.y,vEyeCoord.x),r=length(vEyeCoord);
      float fibers=sin(angle*87.+r*16.)*sin(angle*139.-r*9.);
      float rim=1.-smoothstep(.78,1.,r);
      diffuseColor.rgb*= (.8+.35*fibers)*mix(.35,1.,rim);
    `);
  };
  for(const part of faceData.meshes){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.positions,3));geometry.setIndex(part.indices);transformGeometry(geometry);
    const material=part.kind==='sclera'?scleraMat:part.kind==='iris'?irisMat:corneaMat;
    if(part.kind==='iris'){
      const box=geometry.boundingBox!,center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
      const pos=geometry.getAttribute('position'),uv=new Float32Array(pos.count*2);
      for(let i=0;i<pos.count;i++){uv[i*2]=(pos.getX(i)-center.x)/(size.x*.5);uv[i*2+1]=(pos.getY(i)-center.y)/(size.y*.5);}
      geometry.setAttribute('eyeCoord',new THREE.BufferAttribute(uv,2));
      const pupilGeometry=new THREE.CircleGeometry(Math.max(size.x,size.y)*.51,40);
      for(const root of [eyes,baseEyes]){const pupil=new THREE.Mesh(pupilGeometry,pupilMat);pupil.position.set(center.x,center.y,box.min.z-.003);root.add(pupil);}
    }
    for(const root of [eyes,baseEyes]){const eye=new THREE.Mesh(geometry,material);eye.receiveShadow=part.kind!=='cornea';root.add(eye);}
  }
  const skinFields:SkinField[]=skinMeta.fields.map(f=>({name:f.name,
    indices:new Uint32Array(skinBuffer,f.offset,f.count),delta:new Float32Array(skinBuffer,f.offset+f.count*4,f.count*3)}));
  const fieldByName=new Map(skinFields.map(f=>[f.name,f]));

  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;
  const ctx=shadowCanvas.getContext('2d')!;const gradient=ctx.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'rgba(61,69,57,.20)');gradient.addColorStop(.5,'rgba(61,69,57,.07)');gradient.addColorStop(1,'rgba(61,69,57,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const shadowTex=new THREE.CanvasTexture(shadowCanvas);
  const shadowMat=new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false});
  const shadowGeo=new THREE.PlaneGeometry(7,5);
  for(const root of [editRoot,baseRoot]){
    const shadow=new THREE.Mesh(shadowGeo,shadowMat);shadow.rotation.x=-Math.PI/2;shadow.position.set(0,-8.5,0);root.add(shadow);
  }

  let state:ViewerState={selected:'acromial-part-of-deltoid',values:{},mode:'anatomy',xray:false,isolate:false,compare:false,side:'both',navigation:'rotate'};
  let hoverId='';let frame=0;let dirty=true;let disposed=false;let lastWidth=0,lastHeight=0;
  let transition:{from:THREE.Vector3;to:THREE.Vector3;targetFrom:THREE.Vector3;targetTo:THREE.Vector3;start:number}|null=null;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const selectedPiece=(p:Piece)=>p.info.group===state.selected&&(state.side==='both'||p.info.side===state.side||p.info.side==='center');
  function applyMaterials(){
    for(const p of pieces){
      const sel=selectedPiece(p);
      p.mesh.visible=state.mode==='anatomy'&&(!state.isolate||sel);
      p.baseline.visible=state.mode==='anatomy'&&(!state.isolate||sel);
      p.mesh.material=sel?(state.xray?xraySelected:selectedMat):state.xray?ghostMat:p.info.support?supportMat:p.info.group===hoverId?hoverMat:muscleMat;
      p.mesh.renderOrder=sel&&state.xray?10:0;
      p.mesh.castShadow=!state.xray;p.mesh.receiveShadow=!state.xray;
    }
    bones.visible=state.mode==='anatomy'&&!state.isolate;baseBones.visible=bones.visible;
    bones.children.forEach(o=>{(o as THREE.Mesh).material=state.xray?ghostBone:boneMat;});
    skin.visible=state.mode==='skin';baseSkin.visible=skin.visible;
    eyes.visible=!state.isolate&&!state.xray;baseEyes.visible=eyes.visible;
    dirty=true;
  }
  function colorSkin(){
    const sel=new THREE.Color('#328b75');
    const strength=new Float32Array(skinMeta.vertexCount);
    for(const p of pieces.filter(selectedPiece)){
      const f=fieldByName.get(p.info.name);if(!f)continue;
      for(let i=0;i<f.indices.length;i++)strength[f.indices[i]]=Math.max(strength[f.indices[i]],Math.min(1,Math.hypot(f.delta[i*3],f.delta[i*3+1],f.delta[i*3+2])/Math.max(3,p.info.radius*.4)));
    }
    for(let i=0;i<skinMeta.vertexCount;i++){
      colors[i*3]=THREE.MathUtils.lerp(complexion[i*3],sel.r,strength[i]);
      colors[i*3+1]=THREE.MathUtils.lerp(complexion[i*3+1],sel.g,strength[i]);
      colors[i*3+2]=THREE.MathUtils.lerp(complexion[i*3+2],sel.b,strength[i]);
    }
    skinGeometry.getAttribute('color').needsUpdate=true;dirty=true;
  }
  function deform(){
    let changed=false;
    for(const p of pieces){
      const value=p.info.support?1:getSize(state.values,p.info.group,p.info.side);
      if(p.size===value)continue;p.size=value;changed=true;
      const target=p.mesh.geometry.getAttribute('position');const raw=deformMusclePositions(p.original,p.info.center,p.info.axis,value);
      for(let i=0;i<raw.length;i+=3){
        target.setXYZ(i/3,(raw[i]-center.x)*scale,(raw[i+2]-center.z)*scale,-(raw[i+1]-center.y)*scale);
      }
      target.needsUpdate=true;p.mesh.geometry.computeVertexNormals();p.mesh.geometry.computeBoundingSphere();p.mesh.geometry.computeBoundingBox();
    }
    if(changed){
      const target=skinGeometry.getAttribute('position');(target.array as Float32Array).set(skinBase);
      for(const p of pieces){
        if(p.size===1)continue;const field=fieldByName.get(p.info.name);if(!field)continue;
        const factor=(Math.sqrt(p.size)-1)*scale;
        for(let j=0;j<field.indices.length;j++){
          const i=field.indices[j];const d=field.delta;
          target.setXYZ(i,target.getX(i)+d[j*3]*factor,target.getY(i)+d[j*3+2]*factor,target.getZ(i)-d[j*3+1]*factor);
        }
      }
      target.needsUpdate=true;skinGeometry.computeVertexNormals();skinGeometry.computeBoundingSphere();skinGeometry.computeBoundingBox();dirty=true;
    }
  }
  function cameraTo(position:THREE.Vector3,target:THREE.Vector3){
    if(reducedMotion){camera.position.copy(position);controls.target.copy(target);dirty=true;return;}
    transition={from:camera.position.clone(),to:position,targetFrom:controls.target.clone(),targetTo:target,start:performance.now()};
  }
  function bodyBounds(baseline=false){
    if(state.mode==='skin')return (baseline?baseSkin:skin).geometry.boundingBox!.clone();
    const box=new THREE.Box3();
    for(const p of pieces)box.union((baseline?p.baseline:p.mesh).geometry.boundingBox!);
    return box;
  }
  function comparisonLayout(){
    if(!state.compare){editRoot.position.x=0;return;}
    const edit=bodyBounds(),base=bodyBounds(true);const gap=2;
    baseRoot.position.x=-(edit.max.x-edit.min.x+gap)/2-(base.max.x+base.min.x)/2;
    editRoot.position.x=(base.max.x-base.min.x+gap)/2-(edit.max.x+edit.min.x)/2;
  }
  function fitDistance(box:THREE.Box3){
    const size=box.getSize(new THREE.Vector3());
    const halfFov=THREE.MathUtils.degToRad(camera.fov/2);
    return Math.max(size.y/2/Math.tan(halfFov),size.x/2/(Math.tan(halfFov)*camera.aspect))*1.15+size.z/2;
  }
  function fullBounds(){
    const box=bodyBounds().translate(editRoot.position);
    if(state.compare)box.union(bodyBounds(true).translate(baseRoot.position));return box;
  }
  function resetCamera(){
    const box=fullBounds(),target=box.getCenter(new THREE.Vector3());
    cameraTo(target.clone().add(new THREE.Vector3(0,0,fitDistance(box))),target);
  }
  function viewingDirection(){
    return (transition?.to.clone()??camera.position.clone()).sub(transition?.targetTo??controls.target).normalize();
  }
  function view(name:'front'|'back'|'left'|'right'){
    const target=transition?.targetTo.clone()??controls.target.clone();
    const dist=(transition?.to??camera.position).distanceTo(target);
    const direction={front:[0,0,1],back:[0,0,-1],left:[1,0,0],right:[-1,0,0]}[name];
    cameraTo(target.clone().add(new THREE.Vector3(...direction).multiplyScalar(dist)),target);
  }
  function focus(){
    const box=new THREE.Box3();for(const p of pieces.filter(selectedPiece))box.union(p.mesh.geometry.boundingBox!);
    if(box.isEmpty())return;
    const target=box.getCenter(new THREE.Vector3()).add(editRoot.position);
    const size=box.getSize(new THREE.Vector3());
    const dist=Math.max(.4,Math.max(size.y,size.x/camera.aspect)*2.4+size.z);
    const direction=viewingDirection();
    cameraTo(target.clone().add(direction.multiplyScalar(dist)),target);
  }
  function focusArea(area:FocusArea){
    const sections={head:[.79,1],chest:[.55,.83],core:[.4,.64],legs:[0,.48]};
    const regionBounds=(baseline=false)=>{
      const box=bodyBounds(baseline);const height=box.max.y-box.min.y;const bottom=box.min.y;
      const [min,max]=sections[area];box.min.y=bottom+height*min;box.max.y=bottom+height*max;
      if(area==='head'){box.min.x=-1.25;box.max.x=1.25;}
      return box.translate(baseline?baseRoot.position:editRoot.position);
    };
    const box=regionBounds();if(state.compare)box.union(regionBounds(true));
    const target=box.getCenter(new THREE.Vector3());
    const direction=viewingDirection();
    cameraTo(target.clone().add(direction.multiplyScalar(fitDistance(box))),target);
  }
  function update(next:ViewerState){
    const compareChanged=state.compare!==next.compare;
    const selectionChanged=state.selected!==next.selected||state.side!==next.side;
    const shadowChanged=state.values!==next.values||state.mode!==next.mode||state.xray!==next.xray||state.isolate!==next.isolate||compareChanged||(next.isolate&&selectionChanged);
    state=next;baseRoot.visible=state.compare;
    controls.mouseButtons.LEFT=state.navigation==='pan'?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
    controls.touches.ONE=state.navigation==='pan'?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;
    deform();applyMaterials();if(selectionChanged||state.mode==='skin')colorSkin();
    comparisonLayout();if(shadowChanged)renderer.shadowMap.needsUpdate=true;
    if(compareChanged)resetCamera();
  }

  const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();
  let down={x:0,y:0};let pressed=false;
  function hit(event:{clientX:number;clientY:number}){
    const r=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    const candidates=pieces.filter(p=>!p.info.support&&(!state.isolate||selectedPiece(p))).map(p=>p.mesh);
    return raycaster.intersectObjects(candidates,false)[0];
  }
  function surfaceHit(event:{clientX:number;clientY:number}){
    const r=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    return raycaster.intersectObjects(state.mode==='skin'?[skin,...(state.compare?[baseSkin]:[])]:[
      ...pieces.filter(p=>p.mesh.visible).map(p=>p.mesh),...(bones.visible?bones.children:[]),
      ...(state.compare?pieces.filter(p=>p.baseline.visible).map(p=>p.baseline):[])
    ],false)[0];
  }
  const wheelStart=(e:WheelEvent)=>{
    transition=null;onHover('',0,0);
    // Use the pointed surface's depth, retaining the viewing direction. This avoids
    // orbiting/zooming against the old chest plane when examining the head or feet.
    const intersection=surfaceHit(e);if(!intersection)return;
    const direction=camera.getWorldDirection(new THREE.Vector3());
    const depth=intersection.point.clone().sub(camera.position).dot(direction);
    if(depth>controls.minDistance){controls.target.copy(camera.position).addScaledVector(direction,depth);controls.update();}
  };
  const doubleClick=(e:MouseEvent)=>{
    const intersection=surfaceHit(e);if(!intersection)return;
    const direction=camera.getWorldDirection(new THREE.Vector3());
    const distance=THREE.MathUtils.clamp(camera.position.distanceTo(intersection.point)*.45,.45,12);
    cameraTo(intersection.point.clone().addScaledVector(direction,-distance),intersection.point.clone());
  };
  const pointerDown=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};pressed=true;transition=null;renderer.domElement.focus({preventScroll:true});};
  const pointerUp=(e:PointerEvent)=>{
    if(pressed&&e.button===0&&state.navigation==='rotate'&&!e.shiftKey&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<5){const h=hit(e);if(h)onSelect(h.object.userData.group);}
    pressed=false;
  };
  const pointerMove=(e:PointerEvent)=>{
    if(pressed){onHover('',0,0);return;}
    const h=hit(e);hoverId=h?h.object.userData.group:'';applyMaterials();
    const label=catalog.groups.find(g=>g.id===hoverId)?.name??'';
    const r=host.getBoundingClientRect();onHover(label,e.clientX-r.left,e.clientY-r.top);
    renderer.domElement.style.cursor=state.navigation==='pan'?'grab':h?'pointer':'grab';
  };
  const pointerLeave=()=>{pressed=false;hoverId='';onHover('',0,0);applyMaterials();};
  renderer.domElement.addEventListener('pointerdown',pointerDown);
  renderer.domElement.addEventListener('pointerup',pointerUp);
  renderer.domElement.addEventListener('pointermove',pointerMove);
  renderer.domElement.addEventListener('pointerleave',pointerLeave);
  renderer.domElement.addEventListener('pointercancel',pointerLeave);
  renderer.domElement.addEventListener('wheel',wheelStart,{capture:true,passive:true});
  renderer.domElement.addEventListener('dblclick',doubleClick);
  const resize=new ResizeObserver(()=>{
    const {width,height}=host.getBoundingClientRect();if(width===lastWidth&&height===lastHeight)return;
    const first=lastWidth===0;lastWidth=width;lastHeight=height;
    renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();
    if(first){const box=fullBounds(),target=box.getCenter(new THREE.Vector3());camera.position.copy(target).add(new THREE.Vector3(0,0,fitDistance(box)));controls.target.copy(target);}dirty=true;
  });resize.observe(host);
  const change=()=>{dirty=true;};controls.addEventListener('change',change);
  function animate(now:number){
    if(disposed)return;frame=requestAnimationFrame(animate);
    if(transition){
      const t=Math.min(1,(now-transition.start)/450);const e=1-Math.pow(1-t,3);
      camera.position.lerpVectors(transition.from,transition.to,e);controls.target.lerpVectors(transition.targetFrom,transition.targetTo,e);
      dirty=true;if(t===1)transition=null;
    }
    controls.update();if(dirty){renderer.render(scene,camera);dirty=false;}
  }
  applyMaterials();colorSkin();frame=requestAnimationFrame(animate);
  return {update,view,focus,focusArea,resetCamera,zoom:(factor)=>{
    // Repeated button clicks accumulate against the pending destination.
    const target=transition?.targetTo.clone()??controls.target.clone();
    const direction=(transition?.to.clone()??camera.position.clone()).sub(target);const dist=THREE.MathUtils.clamp(direction.length()*factor,controls.minDistance,controls.maxDistance);
    cameraTo(target.clone().add(direction.setLength(dist)),target);
  },dispose:()=>{
    disposed=true;cancelAnimationFrame(frame);resize.disconnect();controls.dispose();
    renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pointerUp);
    renderer.domElement.removeEventListener('pointermove',pointerMove);renderer.domElement.removeEventListener('pointerleave',pointerLeave);renderer.domElement.removeEventListener('pointercancel',pointerLeave);
    renderer.domElement.removeEventListener('wheel',wheelStart,true);renderer.domElement.removeEventListener('dblclick',doubleClick);
    const geometries=new Set<THREE.BufferGeometry>();scene.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});geometries.forEach(g=>g.dispose());
    [...allMaterials,scleraMat,irisMat,corneaMat,pupilMat].forEach(m=>m.dispose());shadowMat.dispose();shadowTex.dispose();environment.dispose();key.shadow.map?.dispose();renderer.dispose();renderer.domElement.remove();
  }};
}
