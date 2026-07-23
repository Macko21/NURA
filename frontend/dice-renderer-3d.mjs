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
  '1': { colors:['#F8F4EE','#E8E0D0'], pip:'#1a1a2e', edge:'#C4BAA2', roughness:.3, metalness:.15, emissive:'#1fc7d4', effect:'neon', particle:'#a8fbff', icon:'🎲' },
  '2': { colors:['#FF6B35','#E05020'], pip:'#ffffff', edge:'#B03010', roughness:.42, metalness:.08, emissive:'#ff2700', effect:'fire', particle:'#ff7a18', icon:'🔥' },
  '4': { colors:['#B8D8F8','#88B8E8'], pip:'#1a2a4e', edge:'#6898C8', roughness:.16, metalness:.55, emissive:'#2678c7', effect:'elite', particle:'#bdeaff', icon:'💎' },
  '5': { colors:['#70E8FF','#10C0E0'], pip:'#003A4A', edge:'#0090B0', roughness:.1, metalness:.05, emissive:'#28dcea', opacity:.82, effect:'ghost', particle:'#c9ffff', icon:'👻' },
  '6': { colors:['#C8E8F8','#A8D0E8'], pip:'#1a3a4e', edge:'#78B0C8', roughness:.22, metalness:.12, emissive:'#4aa8dc', effect:'ice', particle:'#e9ffff', icon:'❄️' },
  '18':{ colors:['#FF2222','#CC0000'], pip:'#ffffff', edge:'#880000', roughness:.32, metalness:.4, emissive:'#ff0000', effect:'laser', particle:'#ff2525', icon:'🔴' },
  '19':{ colors:['#FFD700','#DAA520'], pip:'#5a3a00', edge:'#B8860B', roughness:.2, metalness:.88, emissive:'#b97a00', effect:'gold', particle:'#ffe277', icon:'🏅' },
  '20':{ colors:['#50C878','#2EA85E'], pip:'#ffffff', edge:'#1A7840', roughness:.24, metalness:.5, emissive:'#0e9d61', effect:'emerald', particle:'#70ffc0', icon:'💚' },
  '21':{ colors:['#6B8E23','#4A6E10'], pip:'#d0d0a0', edge:'#2A4E00', roughness:.68, metalness:0, emissive:'#557d18', effect:'zombie', particle:'#8cbd36', icon:'🧟' },
  '22':{ colors:['#FF6B9D','#FFD700'], pip:'#3a1a4e', edge:'#CC5599', roughness:.28, metalness:.22, emissive:'#b53786', effect:'rainbow', particle:'#ff83ca', icon:'🌈' },
  '32':{ colors:['#B9F2FF','#7FE0F8'], pip:'#003344', edge:'#40C0E0', roughness:.04, metalness:.35, emissive:'#55cbea', opacity:.94, effect:'diamond', particle:'#e8ffff', icon:'💠' },
  '33':{ colors:['#1A0533','#4A1A7A'], pip:'#ffffff', edge:'#2A0055', roughness:.35, metalness:.3, emissive:'#5317a6', effect:'galaxy', particle:'#b888ff', icon:'🌌' },
  '37':{ colors:['#39D6E8','#126DB5'], pip:'#ffffff', edge:'#0A4C86', roughness:.2, metalness:.2, emissive:'#149bc4', effect:'ocean', particle:'#8ff5ff', icon:'🌊' },
  '38':{ colors:['#FFD2E4','#EF80B2'], pip:'#542039', edge:'#C95689', roughness:.34, metalness:.08, emissive:'#e36da7', effect:'sakura', particle:'#ffd4e9', icon:'🌸' },
  '39':{ colors:['#C8FF28','#4E8F00'], pip:'#102000', edge:'#315F00', roughness:.3, metalness:.18, emissive:'#75c900', effect:'toxic', particle:'#c9ff45', icon:'☢️' },
  '40':{ colors:['#FF4FD8','#4A35D8'], pip:'#ffffff', edge:'#2DE2E6', roughness:.23, metalness:.35, emissive:'#9e32d0', effect:'vapor', particle:'#5ffaff', icon:'🕹️' },
  '49':{ colors:['#F5ECFF','#56D9FF','#D762FF'], pip:'#28134A', edge:'#8DEBFF', roughness:.08, metalness:.5, emissive:'#a350e0', effect:'prism', particle:'#ffffff', icon:'🔮' }
};

const textureCache = new Map();
const geometry = new RoundedBoxGeometry(1.34, 1.34, 1.34, 5, .14);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function configuredQuality() {
  const saved = localStorage.getItem(QUALITY_KEY) || 'auto';
  return ['auto','high','low','off'].includes(saved) ? saved : 'auto';
}

function resolvedQuality() {
  const configured = configuredQuality();
  if (configured !== 'auto') return configured;
  if (innerWidth <= 480) return 'low';
  const memory = Number(navigator.deviceMemory || 4);
  const cores = Number(navigator.hardwareConcurrency || 4);
  return memory <= 4 || cores <= 4 ? 'low' : 'high';
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
  ctx.globalAlpha = .1;
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

function drawSkinIcon(ctx, skin, size) {
  if (!skin.icon) return;
  ctx.save();
  ctx.globalAlpha = .76;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(size*.58)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = size*.055;
  ctx.fillText(skin.icon,size*.5,size*.515);
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
  drawSkinIcon(ctx, skin, size);
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

const _neutralFaceCache = new Map();
function createNeutralFaceMap(quality) {
  const key = quality;
  if (_neutralFaceCache.has(key)) return _neutralFaceCache.get(key);
  const size = quality === 'high' ? 128 : 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#999999';
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  _neutralFaceCache.set(key, texture);
  return texture;
}

function materialsFor(skinId, state, quality) {
  const skin = skinFor(skinId);
  return FACE_VALUES.map(value => {
    const hot = state === 'hot', scoring = state === 'scoring', dead = state === 'dead';
    const faceMap = dead ? createNeutralFaceMap(quality) : faceTexture(value, skinId, quality);
    const emissive = hot ? '#d89100' : scoring ? '#00cc55' : '#ffffff';
    return new THREE.MeshPhysicalMaterial({
      map: faceMap,
      color: dead ? '#888888' : '#ffffff',
      roughness: dead ? .9 : skin.roughness,
      metalness: dead ? 0 : skin.metalness,
      emissive: new THREE.Color(emissive),
      emissiveMap: faceMap,
      emissiveIntensity: dead ? .08 : hot ? .55 : scoring ? .65 : .38,
      transparent: !!skin.opacity,
      opacity: dead ? 1 : (skin.opacity || 1),
      transmission: quality === 'high' && ['ghost','diamond','ice'].includes(skin.effect) ? .12 : 0,
      thickness: .35,
      ior: skin.effect === 'diamond' ? 2.2 : 1.45,
      clearcoat: dead ? 0 : ['gold','diamond','elite','emerald'].includes(skin.effect) ? .8 : .25,
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

function configureRenderer(container, quality, preview) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha:true, antialias:quality === 'high', powerPreference:'default' });
  } catch (_) { return null; }
  if (!renderer.getContext() || renderer.getContext().isContextLost()) { renderer.dispose(); return null; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 2.1;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality === 'high' ? 1.5 : 1));
  renderer.shadowMap.enabled = quality === 'high';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = preview ? 'dice-3d-preview-canvas' : 'dice-3d-canvas';
  container.replaceChildren(renderer.domElement);
  return renderer;
}

function makeStage(container, quality, preview=false) {
  const renderer = configureRenderer(container, quality, preview);
  if (!renderer) return null;
  const width = Math.max(180, container.clientWidth || (preview ? 320 : 350));
  const height = preview ? 210 : Math.max(110, Math.min(145, width*.33));
  renderer.setSize(width,height,false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(preview ? 26 : 23,width/height,.1,50);
  camera.position.set(0, preview ? 4.15 : 3.3, preview ? 6.1 : 5.5);
  camera.lookAt(0,preview ? .25 : .55,0);
  scene.add(new THREE.HemisphereLight(0xffffff,0x444466,quality === 'high' ? 4.0 : 4.5));
  const key = new THREE.DirectionalLight(0xfff5d4,quality === 'high' ? 5.0 : 4.0);
  key.position.set(-3,6,4); key.castShadow = quality === 'high'; scene.add(key);
  const rim = new THREE.PointLight(0x58bfff,quality === 'high' ? 14 : 8,12); rim.position.set(4,2,-2); scene.add(rim);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(16,7),new THREE.ShadowMaterial({ color:0x000000,opacity:.36 }));
  ground.rotation.x=-Math.PI/2;ground.position.y=.02;ground.receiveShadow=true;scene.add(ground);
  const stage = {renderer,scene,camera,width,height,rim,objects:[],frame:0,disposed:false,contextLost:false,resizeObserver:null};
  const onLost = () => {
    stage.contextLost = true;
    if (stage.disposed) return;
    clearGameDice();
    container.classList.remove('dice-row-3d');
    window.dispatchEvent(new CustomEvent('macko-dice-3d-lost'));
  };
  renderer.domElement.addEventListener('webglcontextlost', onLost, {once:true});
  if (typeof ResizeObserver !== 'undefined') {
    stage.resizeObserver = new ResizeObserver(() => {
      if (stage.disposed) return;
      const nextWidth = Math.max(180, container.clientWidth || width);
      const nextHeight = preview ? 210 : Math.max(110, container.clientHeight || Math.min(145,nextWidth*.33));
      if (nextWidth === stage.width && nextHeight === stage.height) return;
      stage.width=nextWidth;stage.height=nextHeight;camera.aspect=nextWidth/nextHeight;camera.updateProjectionMatrix();renderer.setSize(nextWidth,nextHeight,false);
    });
    stage.resizeObserver.observe(container);
  }
  return stage;
}

function addParticles(stage, skinId, count) {
  const skin = skinFor(skinId);
  const positions = new Float32Array(count*3), colors = new Float32Array(count*3), velocities=[];
  const base = new THREE.Color(skin.particle || '#ffffff');
  for(let i=0;i<count;i++){
    positions[i*3]=(Math.random()-.5)*5.8;positions[i*3+1]=1.55+Math.random()*1.05;positions[i*3+2]=-.8-Math.random()*.7;
    const color=base.clone().offsetHSL((Math.random()-.5)*.08,0,(Math.random()-.5)*.2);colors.set([color.r,color.g,color.b],i*3);
    velocities.push(new THREE.Vector3((Math.random()-.5)*.005,.003+Math.random()*.008,(Math.random()-.5)*.003));
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const mat=new THREE.PointsMaterial({size:.04,vertexColors:true,transparent:true,opacity:.48,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:true});
  const points=new THREE.Points(geo,mat);points.userData.velocities=velocities;stage.scene.add(points);return points;
}

function disposeStage(stage) {
  if (!stage || stage.disposed) return;
  stage.disposed=true;cancelAnimationFrame(stage.frame);
  stage.resizeObserver?.disconnect();
  stage.scene.traverse(object=>{if(object.geometry&&object.geometry!==geometry)object.geometry.dispose?.();if(object.material){const list=Array.isArray(object.material)?object.material:[object.material];list.forEach(m=>m.dispose?.());}});
  stage.renderer.dispose();stage.renderer.forceContextLoss?.();stage.renderer.domElement.remove();
}

let gameStage=null, requestId=0;

function renderGameDice({container,dice,states,skinId,specialId}) {
  if (!container || !Array.isArray(dice) || !dice.length || resolvedQuality()==='off' || !supportsWebGL()) return false;
  requestId+=1;const currentRequest=requestId;disposeStage(gameStage);
  const quality=resolvedQuality();gameStage=makeStage(container,quality,false);if(!gameStage)return false;
  container.classList.add('dice-row-3d');
  const stage=gameStage, spacing=Math.min(1.65,7.0/dice.length), total=(dice.length-1)*spacing;
  const starts=[],targets=[];
  dice.forEach((value,index)=>{
    const state=states[index]||'normal',skin=skinFor(skinId);
    const mesh=new THREE.Mesh(geometry,materialsFor(skinId,state,quality));mesh.castShadow=quality==='high';mesh.receiveShadow=true;
    const targetX=index*spacing-total/2;mesh.position.set(targetX+(Math.random()-.5)*1.8,2.2+Math.random(),(Math.random()-.5)*1.2);
    mesh.quaternion.setFromEuler(new THREE.Euler(Math.random()*6,Math.random()*6,Math.random()*6));
    starts.push({position:mesh.position.clone(),quaternion:mesh.quaternion.clone()});targets.push({position:new THREE.Vector3(targetX,.7,0),quaternion:targetQuaternion(value)});
    stage.scene.add(mesh);stage.objects.push(mesh);
  });
  const effectBoost=['29','45','46','48','51'].includes(String(specialId||''));
  const particles=addParticles(stage,skinId,quality==='high'?(effectBoost?30:18):(effectBoost?12:8)),start=performance.now(),duration=reducedMotion()?60:460,linger=quality==='high'?420:260;
  let impacted=false;
  const animate=now=>{
    if(stage.disposed||currentRequest!==requestId)return;
    if(stage.contextLost||!stage.renderer.getContext()||stage.renderer.getContext().isContextLost()){clearGameDice();container.classList.remove('dice-row-3d');window.dispatchEvent(new CustomEvent('macko-dice-3d-lost'));return;}
    const elapsed=now-start,t=Math.min(1,elapsed/duration),ease=1-Math.pow(1-t,3);
    stage.objects.forEach((mesh,i)=>{mesh.position.lerpVectors(starts[i].position,targets[i].position,ease);mesh.position.y+=Math.sin(Math.PI*t)*1.2+Math.abs(Math.sin(t*Math.PI*3))*.18*(1-t);mesh.quaternion.slerpQuaternions(starts[i].quaternion,targets[i].quaternion,ease);});
    if(!impacted&&t>.62){impacted=true;window.mackoNativeImpact?.('medium');if(!window.MACKO_NATIVE&&!reducedMotion()&&navigator.vibrate)navigator.vibrate(12);}
    const attr=particles.geometry.attributes.position;particles.userData.velocities.forEach((v,i)=>{attr.array[i*3]+=v.x;attr.array[i*3+1]+=v.y;attr.array[i*3+2]+=v.z;if(attr.array[i*3+1]>2.6)attr.array[i*3+1]=.1;});attr.needsUpdate=true;
    stage.rim.color.set(skinFor(skinId).edge);stage.rim.intensity=(quality==='high'?7:4.5)*(1+.08*Math.sin(now*.006));
    try { stage.renderer.render(stage.scene,stage.camera); } catch(_){ clearGameDice();container.classList.remove('dice-row-3d');window.dispatchEvent(new CustomEvent('macko-dice-3d-lost'));return; }
    if(elapsed<duration+linger)stage.frame=requestAnimationFrame(animate);
  };
  stage.frame=requestAnimationFrame(animate);return true;
}

function createPreview(container,skinId,value=5) {
  if(!container||resolvedQuality()==='off'||!supportsWebGL())return null;
  const quality=resolvedQuality(),stage=makeStage(container,quality,true);if(!stage)return null;
  const mesh=new THREE.Mesh(geometry,materialsFor(skinId,'normal',quality));
  const spinner=new THREE.Group();mesh.castShadow=quality==='high';mesh.position.y=.72;mesh.quaternion.copy(targetQuaternion(value));spinner.add(mesh);stage.scene.add(spinner);stage.objects.push(mesh);const particles=addParticles(stage,skinId,quality==='high'?20:9);const start=performance.now();
  const animate=now=>{if(stage.disposed||!container.isConnected){if(!container.isConnected)disposeStage(stage);return;}const elapsed=(now-start)*.001;spinner.rotation.y=elapsed*.65;spinner.rotation.z=Math.sin(elapsed*.7)*.06;particles.rotation.y=elapsed*.12;stage.rim.color.set(skinFor(skinId).edge);stage.renderer.render(stage.scene,stage.camera);stage.frame=requestAnimationFrame(animate);};
  stage.frame=requestAnimationFrame(animate);return()=>disposeStage(stage);
}

function clearGameDice(){requestId+=1;disposeStage(gameStage);gameStage=null;}
function setQuality(value){if(!['auto','high','low','off'].includes(value))return;localStorage.setItem(QUALITY_KEY,value);clearGameDice();window.dispatchEvent(new CustomEvent('macko-dice-quality',{detail:{configured:value,resolved:resolvedQuality()}}));}

window.MackoDice3D={renderDice:renderGameDice,createPreview,clear:clearGameDice,setQuality,getQuality:configuredQuality,getResolvedQuality:resolvedQuality,isSupported:supportsWebGL,skins:SKINS_3D};
window.dispatchEvent(new CustomEvent('macko-dice-3d-ready'));

export {renderGameDice,createPreview,clearGameDice,setQuality,configuredQuality,resolvedQuality,supportsWebGL,SKINS_3D};
