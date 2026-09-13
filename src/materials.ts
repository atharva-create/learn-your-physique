import * as THREE from 'three';

/** Procedural optical detail on the sourced geometry; no anatomical features are added. */
export function addTissueCoordinates(geometry: THREE.BufferGeometry, raw: Float32Array, center: number[], axis: number[]) {
  const longitudinal=new THREE.Vector3(...axis).normalize();
  const reference=Math.abs(longitudinal.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);
  const u=new THREE.Vector3().crossVectors(longitudinal,reference).normalize();
  const v=new THREE.Vector3().crossVectors(longitudinal,u).normalize();
  const coordinates=new Float32Array(raw.length);
  for(let i=0;i<raw.length;i+=3){
    const x=raw[i]-center[0],y=raw[i+1]-center[1],z=raw[i+2]-center[2];
    coordinates[i]=(x*u.x+y*u.y+z*u.z)*.01;
    coordinates[i+1]=(x*v.x+y*v.y+z*v.z)*.01;
    coordinates[i+2]=(x*longitudinal.x+y*longitudinal.y+z*longitudinal.z)*.01;
  }
  geometry.setAttribute('tissueCoord',new THREE.BufferAttribute(coordinates,3));
}

const noiseGLSL=`
  varying vec3 vTissueCoord;
  float tissueHash(vec3 p) {
    p=fract(p*.3183099+vec3(.17,.29,.43));
    p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
  }
  float tissueNoise(vec3 p) {
    vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(mix(tissueHash(i),tissueHash(i+vec3(1,0,0)),f.x),mix(tissueHash(i+vec3(0,1,0)),tissueHash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(tissueHash(i+vec3(0,0,1)),tissueHash(i+vec3(1,0,1)),f.x),mix(tissueHash(i+vec3(0,1,1)),tissueHash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
`;

export function tissueMaterial(color: string, kind: 'muscle'|'skin', extra: THREE.MeshPhysicalMaterialParameters={}) {
  const mat=new THREE.MeshPhysicalMaterial({color,roughness:kind==='skin'?.57:.48,metalness:0,
    clearcoat:kind==='skin'?.08:.16,clearcoatRoughness:.62,
    sheen:kind==='skin'?.18:.12,sheenColor:new THREE.Color(kind==='skin'?'#d4906f':'#df9585'),
    sheenRoughness:.8,side:THREE.DoubleSide,...extra});
  mat.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 tissueCoord;\nvarying vec3 vTissueCoord;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTissueCoord=tissueCoord;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n${noiseGLSL}`);
    const detail=kind==='muscle'?`
      float phase=(vTissueCoord.x+.08*sin(vTissueCoord.z*1.8)+.018*sin(vTissueCoord.z*9.))*95.;
      float visibleDetail=1.-smoothstep(.8,3.0,fwidth(phase));
      float fibers=sin(phase)*.65+sin(phase*1.87+.4)*.35;
      float variation=tissueNoise(vTissueCoord*vec3(9.,9.,1.5));
      diffuseColor.rgb*=.96+.07*variation+.045*fibers*visibleDetail;
      float tissueHeight=(fibers*.0008*visibleDetail+variation*.0012);
    `:`
      float variation=tissueNoise(vTissueCoord*5.);
      float poreScale=230.;
      float visibleDetail=1.-smoothstep(.4,2.,length(fwidth(vTissueCoord*poreScale)));
      float pores=tissueNoise(vTissueCoord*poreScale);
      diffuseColor.rgb*=vec3(.985+.03*variation,.98+.028*variation,.975+.035*variation);
      float tissueHeight=(pores-.5)*.0009*visibleDetail;
    `;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n${detail}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec3 surfaceX=dFdx(-vViewPosition),surfaceY=dFdy(-vViewPosition);
      vec3 normalX=cross(surfaceY,normal),normalY=cross(normal,surfaceX);
      float determinant=dot(surfaceX,normalX);
      vec3 gradient=sign(determinant)*(dFdx(tissueHeight)*normalX+dFdy(tissueHeight)*normalY);
      normal=normalize(max(abs(determinant),1e-10)*normal-gradient);
    `);
  };
  mat.customProgramCacheKey=()=>`form-tissue-${kind}-v1`;
  return mat;
}
