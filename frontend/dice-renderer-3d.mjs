import * as THREE from '/vendor/three.module.js';
import { RoundedBoxGeometry } from '/vendor/RoundedBoxGeometry.js';

const QUALITY_KEY = 'macko_dice_quality';
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const PIPS = {
  1:[[.5,.5]], 2:[[.28,.28],[.72,.72]], 3:[[.28,.28],[.5,.5],[.72,.72]],
  4:[[.28,.28],[.72,.28],[.28,.72],[.72,.72]],
  5:[[.28,.28],[.72,.28],[.5,.5],[.28,.72],[.72,.72]],
  6:[[.28,.24],[.72,.24],[.28,.5],[.72,.5],[.28,.76],[.72,.76]]
};

const SKINS_3D = {
  default:{ colors:['#f8f4ee','#d8cfbd'], pip:'#171724', edge:'#a99f8c', roughness:.58, metalness:.03, effect:'classic', particle:'#ffffff' },
  '1': { colors:['#fff7d6','#56f4ff'], pip:'#10142a', edge:'#37d9ff', roughness:.3, metalness:.15, emissive:'#1fc7d4', effect:'neon', particle:'#a8fbff' },
  '2': { colors:['#ffb12b','#c61b08'], pip:'#fff6d5', edge:'#ff4b10', roughness:.42, metalness:.08, emissive:'#ff2700', effect:'fire', particle:'#ff7a18' },
  '4': { colors:['#dff5ff','#5d9fe4'], pip:'#10284f', edge:'#93d9ff', roughness:.16, metalness:.55, emissive:'#2678c7', effect:'elite', particle:'#bdeaff' },
  '5': { colors:['#d9ffff','#42d7e8'], pip:'#083b4b', edge:'#a7ffff', roughness:.1, metalness:.05, emissive:'#28dcea', opacity:.68, effect:'ghost', particle:'#c9ffff' },
  '6': { colors:['#f4ffff','#76c9ef'], pip:'#153953', edge:'#d4f8ff', roughness:.22, metalness:.12, emissive:'#4aa8dc', effect:'ice', particle:'#e9ffff' },
  '18':{ colors:['#ff4040','#620000'], pip:'#ffffff', edge:'#ff1515', roughness:.32, metalness:.4, emissive:'#ff0000', effect:'laser', particle:'#ff2525' },
  '19':{ colors:['#fff1a0','#bd7600'], pip:'#4a2500', edge:'#ffd84c', roughness:.2, metalness:.88, emissive:'#b97a00', effect:'gold', particle:'#ffe277' },
  '20':{ colors:['#a6ffd0','#087f4a'], pip:'#f2fff8', edge:'#39e895', roughness:.24, metalness:.5, emissive:'#0e9d61', effect:'emerald', particle:'#70ffc0' },
  '21':{ colors:['#a9b94d','#314c0c'], pip:'#e1e7b0', edge:'#647c20', roughness:.82, metalness:0, emissive:'#294a08', effect:'zombie', particle:'#8cbd36' },
  '22':{ colors:['#ff5f91','#ffd43b','#45d9ff'], pip:'#28113b', edge:'#fff2a1', roughness:.28, metalness:.22, emissive:'#b53786', effect:'rainbow', particle:'#ff83ca' },
  '32':{ colors:['#f8ffff','#76dbff'], pip:'#06354d', edge:'#d8fbff', roughness:.04, metalness:.35, emissive:'#55cbea', opacity:.9, effect:'diamond', particle:'#e8ffff' },
  '33':{ colors:['#29104f','#071026'], pip:'#f8edff', edge:'#8c55e8', roughness:.35, metalness:.3, emissive:'#5317a6', effect:'galaxy', particle:'#b888ff' }
};

const textureCache = new Map();
const geometry = new RoundedBoxGeometry(1.22, 1.22, 1.22, 5, .13);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function configuredQuality() {
  const saved = localStorage.getItem(QUALITY_KEY) || 'auto';
  return ['auto','high','low','off'].includes(saved) ? saved : 'auto';
}

function resolvedQuality() {
  const configured = configuredQuality();
  if (configured !== 'auto') return configured;
  const memory = Number(navigator.deviceMemory || 4);
  const cores = Number(navigator.hardwareConcurrency || 4);
  return memory <= 4 || cores <= 4 || innerWidth <= 480 ? 'low' : 'high';
}

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch (_) { return false; }
}

function skinFor(id) { return SKINS_3D[String(id)] || SKINS_3D.default; }

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.rect(x, y, width, height);
  }
  ctx.fill();
}

function drawMotif(ctx, skin, size) {
  ctx.save();
  ctx.globalAlpha = .22;
  if (skin.effect === 'fire') {
    ctx.strokeStyle = '#ffe46b'; ctx.lineWidth = 5;
    for (let i=0;i<5;i++) { ctx.beginPath(); ctx.moveTo(i*31, size); ctx.quadraticCurveTo(i*31+22, size*.55, i*31+10, 0); ctx.stroke(); }
  } else if (skin.effect === 'ice' || skin.effect === 'diamond') {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    [[0,40,128,76],[18,0,75,128],[95,0,45,128],[0,102,128,22]].forEach(v => { ctx.beginPath(); ctx.moveTo(v[0],v[1]); ctx.lineTo(v[2],v[3]); ctx.stroke(); });
  } else if (skin.effect === 'laser') {
    ctx.strokeStyle = '#ff9d9d'; ctx.lineWidth = 2;
    for(let i=8;i<size;i+=18){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,size);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(size,i);ctx.stroke();}
  } else if (skin.effect === 'galaxy') {
    ctx.fillStyle = '#ffffff';
    for(let i=0;i<35;i++){const x=(i*47)%size,y=(i*83)%size,r=i%5===0?2:1;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
  } else if (skin.effect === 'zombie') {
    ctx.fillStyle='#142706'; for(let i=0;i<18;i++){ctx.beginPath();ctx.arc((i*37)%size,(i*61)%size,3+(i%4),0,Math.PI*2);ctx.fill();}
  } else if (skin.effect === 'neon' || skin.effect === 'elite' || skin.effect === 'emerald') {
    ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.strokeRect(12,12,size-24,size-24);ctx.strokeRect(20,20,size-40,size-40);
  }
  ctx.restore();
}

function faceTexture(value, skinId, quality) {
  const key = `${skinId || 'default'}:${value}:${quality}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const skin = skinFor(skinId);
  const size = quality === 'high' ? 192 : 96;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = skin.effect === 'rainbow'
    ? ctx.createLinearGradient(0,0,size,size)
    : ctx.createLinearGradient(0,0,size,size);
  (skin.colors || []).forEach((color, index, colors) => gradient.addColorStop(colors.length === 1 ? 0 : index/(colors.length-1), color));
  ctx.fillStyle = gradient;
  roundedRect(ctx, 0, 0, size, size, size*.09);
  drawMotif(ctx, skin, size);
  const scale = size / 128;
  for (const [x,y] of PIPS[value]) {
    ctx.save();
    ctx.shadowColor = skin.emissive || skin.pip;
    ctx.shadowBlur = (skin.emissive ? 10 : 4) * scale;
    ctx.fillStyle = skin.pip;
    ctx.strokeStyle = 'rgba(255,255,255,.65)';
    ctx.lineWidth = 1.6 * scale;
    ctx.beginPath(); ctx.arc(x*size,y*size,10*scale,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = quality === 'high' ? 4 : 1;
  textureCache.set(key, texture);
  return texture;
}

function materialsFor(skinId, state, quality) {
  const skin = skinFor(skinId);
  return FACE_VALUES.map(value => {
    const hot = state === 'hot', scoring = state === 'scoring', dead = state === 'dead';
    const emissive = hot ? '#d89100' : scoring ? '#158b38' : (skin.emissive || '#000000');
    return new THREE.MeshPhysicalMaterial({
      map: faceTexture(value, skinId, quality),
      color: dead ? '#777777' : '#ffffff',
      roughness: skin.roughness,
      metalness: skin.metalness,
      emissive: new THREE.Color(emissive),
      emissiveIntensity: dead ? 0 : hot || scoring ? .5 : skin.emissive ? .22 : 0,
      transparent: !!skin.opacity || dead,
      opacity: dead ? .42 : (skin.opacity || 1),
      transmission: quality === 'high' && ['ghost','diamond','ice'].includes(skin.effect) ? .12 : 0,
      thickness: .35,
      ior: skin.effect === 'diamond' ? 2.2 : 1.45,
      clearcoat: ['gold','diamond','elite','emerald'].includes(skin.effect) ? .8 : .25,
      clearcoatRoughness: skin.effect === 'diamond' ? .05 : .2
    });
  });
}

function targetQuaternion(value) {
  const rotations = {
    1:[0,0,0], 6:[Math.PI,0,0], 2:[-Math.PI/2,0,0],
    5:[Math.PI/2,0,0], 3:[0,0,Math.PI/2], 4:[0,0,-Math.PI/2]
  };
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rotations[value] || rotations[1])));
}

function makeStage(container, quality, preview=false) {
  const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:quality === 'high', powerPreference:'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality === 'high' ? 1.5 : 1));
  renderer.shadowMap.enabled = quality === 'high';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = preview ? 'dice-3d-preview-canvas' : 'dice-3d-canvas';
  container.replaceChildren(renderer.domElement);
  const width = Math.max(180, container.clientWidth || (preview ? 320 : 350));
  const height = preview ? 210 : Math.max(112, Math.min(150, width*.36));
  renderer.setSize(width,height,false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(preview ? 28 : 32,width/height,.1,50);
  camera.position.set(0, preview ? 4.4 : 4.7, preview ? 6.6 : 7.8);
  camera.lookAt(0,.25,0);
  scene.add(new THREE.HemisphereLight(0xeaf8ff,0x130f20,quality === 'high' ? 2.2 : 2.7));
  const key = new THREE.DirectionalLight(0xfff1c4,quality === 'high' ? 4.2 : 3.2);
  key.position.set(-3,6,4); key.castShadow = quality === 'high'; scene.add(key);
  const rim = new THREE.PointLight(0x58bfff,quality === 'high' ? 14 : 8,12); rim.position.set(4,2,-2); scene.add(rim);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(16,7),new THREE.ShadowMaterial({ color:0x000000,opacity:.36 }));
  ground.rotation.x=-Math.PI/2;ground.position.y=.02;ground.receiveShadow=true;scene.add(ground);
  return {renderer,scene,camera,width,height,rim,objects:[],frame:0,disposed:false};
}

function addParticles(stage, skinId, count) {
  const skin = skinFor(skinId);
  const positions = new Float32Array(count*3), colors = new Float32Array(count*3), velocities=[];
  const base = new THREE.Color(skin.particle || '#ffffff');
  for(let i=0;i<count;i++){
    positions[i*3]=(Math.random()-.5)*5;positions[i*3+1]=.2+Math.random()*1.6;positions[i*3+2]=(Math.random()-.5)*1.6;
    const color=base.clone().offsetHSL((Math.random()-.5)*.08,0,(Math.random()-.5)*.2);colors.set([color.r,color.g,color.b],i*3);
    velocities.push(new THREE.Vector3((Math.random()-.5)*.008,.006+Math.random()*.014,(Math.random()-.5)*.005));
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const mat=new THREE.PointsMaterial({size:.065,vertexColors:true,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false});
  const points=new THREE.Points(geo,mat);points.userData.velocities=velocities;stage.scene.add(points);return points;
}

function disposeStage(stage) {
  if (!stage || stage.disposed) return;
  stage.disposed=true;cancelAnimationFrame(stage.frame);
  stage.scene.traverse(object=>{if(object.geometry&&object.geometry!==geometry)object.geometry.dispose?.();if(object.material){const list=Array.isArray(object.material)?object.material:[object.material];list.forEach(m=>m.dispose?.());}});
  stage.renderer.dispose();stage.renderer.forceContextLoss?.();stage.renderer.domElement.remove();
}

let gameStage=null, requestId=0;

function renderGameDice({container,dice,states,skinId}) {
  if (!container || !Array.isArray(dice) || !dice.length || resolvedQuality()==='off' || !supportsWebGL()) return false;
  requestId+=1;const currentRequest=requestId;disposeStage(gameStage);
  const quality=resolvedQuality();gameStage=makeStage(container,quality,false);container.classList.add('dice-row-3d');
  const stage=gameStage, spacing=Math.min(1.55,6.4/dice.length), total=(dice.length-1)*spacing;
  const starts=[],targets=[];
  dice.forEach((value,index)=>{
    const state=states[index]||'normal',skin=skinFor(skinId);
    const mesh=new THREE.Mesh(geometry,materialsFor(skinId,state,quality));mesh.castShadow=quality==='high';mesh.receiveShadow=true;
    const targetX=index*spacing-total/2;mesh.position.set(targetX+(Math.random()-.5)*1.8,2.2+Math.random(),(Math.random()-.5)*1.2);
    mesh.quaternion.setFromEuler(new THREE.Euler(Math.random()*6,Math.random()*6,Math.random()*6));
    starts.push({position:mesh.position.clone(),quaternion:mesh.quaternion.clone()});targets.push({position:new THREE.Vector3(targetX,.7,0),quaternion:targetQuaternion(value)});
    const ring=new THREE.Mesh(new THREE.RingGeometry(.66,.76,36),new THREE.MeshBasicMaterial({color:state==='hot'?0xffc928:state==='scoring'?0x3de77d:new THREE.Color(skin.edge),transparent:true,opacity:state==='dead'?.08:.24,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));
    ring.rotation.x=-Math.PI/2;ring.position.set(targetX,.035,0);stage.scene.add(ring);stage.scene.add(mesh);stage.objects.push(mesh);
  });
  const particles=addParticles(stage,skinId,quality==='high'?55:26),start=performance.now(),duration=reducedMotion()?80:980,linger=quality==='high'?1600:700;
  let impacted=false;
  const animate=now=>{
    if(stage.disposed||currentRequest!==requestId)return;
    const elapsed=now-start,t=Math.min(1,elapsed/duration),ease=1-Math.pow(1-t,3);
    stage.objects.forEach((mesh,i)=>{mesh.position.lerpVectors(starts[i].position,targets[i].position,ease);mesh.position.y+=Math.sin(Math.PI*t)*1.2+Math.abs(Math.sin(t*Math.PI*3))*.18*(1-t);mesh.quaternion.slerpQuaternions(starts[i].quaternion,targets[i].quaternion,ease);});
    if(!impacted&&t>.76){impacted=true;window.playSkinImpact?.(String(skinId||''));if(!reducedMotion()&&navigator.vibrate)navigator.vibrate(18);}
    const attr=particles.geometry.attributes.position;particles.userData.velocities.forEach((v,i)=>{attr.array[i*3]+=v.x;attr.array[i*3+1]+=v.y;attr.array[i*3+2]+=v.z;if(attr.array[i*3+1]>2.6)attr.array[i*3+1]=.1;});attr.needsUpdate=true;
    stage.rim.color.set(skinFor(skinId).edge);stage.rim.intensity=(quality==='high'?12:7)*(1+.16*Math.sin(now*.006));stage.renderer.render(stage.scene,stage.camera);
    if(elapsed<duration+linger)stage.frame=requestAnimationFrame(animate);
  };
  stage.frame=requestAnimationFrame(animate);return true;
}

function createPreview(container,skinId,value=5) {
  if(!container||resolvedQuality()==='off'||!supportsWebGL())return null;
  const quality=resolvedQuality(),stage=makeStage(container,quality,true),mesh=new THREE.Mesh(geometry,materialsFor(skinId,'normal',quality));
  const spinner=new THREE.Group();mesh.castShadow=quality==='high';mesh.position.y=.72;mesh.quaternion.copy(targetQuaternion(value));spinner.add(mesh);stage.scene.add(spinner);stage.objects.push(mesh);const particles=addParticles(stage,skinId,quality==='high'?38:18);const start=performance.now();
  const animate=now=>{if(stage.disposed||!container.isConnected){if(!container.isConnected)disposeStage(stage);return;}const elapsed=(now-start)*.001;spinner.rotation.y=elapsed*.65;spinner.rotation.z=Math.sin(elapsed*.7)*.06;particles.rotation.y=elapsed*.12;stage.rim.color.set(skinFor(skinId).edge);stage.renderer.render(stage.scene,stage.camera);stage.frame=requestAnimationFrame(animate);};
  stage.frame=requestAnimationFrame(animate);return()=>disposeStage(stage);
}

function clearGameDice(){requestId+=1;disposeStage(gameStage);gameStage=null;}
function setQuality(value){if(!['auto','high','low','off'].includes(value))return;localStorage.setItem(QUALITY_KEY,value);clearGameDice();window.dispatchEvent(new CustomEvent('macko-dice-quality',{detail:{configured:value,resolved:resolvedQuality()}}));}

window.MackoDice3D={renderDice:renderGameDice,createPreview,clear:clearGameDice,setQuality,getQuality:configuredQuality,getResolvedQuality:resolvedQuality,isSupported:supportsWebGL,skins:SKINS_3D};
window.dispatchEvent(new CustomEvent('macko-dice-3d-ready'));

export {renderGameDice,createPreview,clearGameDice,setQuality,configuredQuality,resolvedQuality,supportsWebGL,SKINS_3D};
