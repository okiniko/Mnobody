import * as THREE from '/vendor/three/three.module.js';
const $ = id => document.getElementById(id);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let renderer;
try { await lancer(); } catch (error) {
  console.error('Musée aperçu :', error);
  if (renderer) renderer.dispose();
  $('statut').textContent = 'La visite 3D est indisponible.'; $('alternative').hidden = false;
  $('identite').hidden = true; document.querySelector('.parcours').hidden = true;
}
async function lancer() {
  const response = await fetch('/api/musee'); if (!response.ok) throw new Error('Catalogue');
  const oeuvres = await response.json(); if (!Array.isArray(oeuvres)||!oeuvres.length) throw new Error('Salle vide');
  const host = $('scene'); renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1,1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  host.append(renderer.domElement); const canvas = renderer.domElement; canvas.tabIndex = 0;
  canvas.setAttribute('aria-label','Visite guidée : flèches gauche et droite pour changer d’œuvre. Échap pour fermer sa fiche.');
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#202020');
  const camera = new THREE.PerspectiveCamera(50,1,.1,80); camera.rotation.order='YXZ';
  const wall = new THREE.MeshStandardMaterial({color:'#494740',roughness:1});
  const floor = new THREE.MeshStandardMaterial({color:'#55514a',roughness:.87});
  const dark = new THREE.MeshStandardMaterial({color:'#171715',roughness:.8});
  const warm = new THREE.MeshStandardMaterial({color:'#746c5b',roughness:.65});
  function box(w,h,d,x,y,z,mat=wall){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.receiveShadow=true;mesh.castShadow=true;scene.add(mesh);return mesh;}
  box(16,.16,15,0,-.08,1.5,floor); box(.2,5.4,15,-8,2.7,1.5);box(.2,5.4,15,8,2.7,1.5);box(16,5.4,.2,0,2.7,-6.1);box(16,.2,15,0,5.5,1.5,dark);
  // Plinthes et joints discrets : l’architecture reste en retrait des œuvres.
  box(16,.09,.035,0,.08,-5.97,dark);box(.035,.09,15,-7.88,.08,1.5,dark);box(.035,.09,15,7.88,.08,1.5,dark);
  const joint=new THREE.MeshBasicMaterial({color:'#45423d'});
  for(let x=-8;x<=8;x+=2)box(.012,.003,15,x,.003,1.5,joint);
  for(let z=-6;z<9;z+=2)box(16,.003,.012,0,.003,z,joint);
  // Banc central bas, pour donner une échelle humaine et une pause à la visite.
  box(3.1,.13,.85,0,.49,2.1,warm);box(.14,.43,.62,-1.15,.215,2.1,dark);box(.14,.43,.62,1.15,.215,2.1,dark);
  const ceilingLight=new THREE.MeshBasicMaterial({color:'#f5e5c7'});
  box(7,.025,.045,0,5.36,-1.5,ceilingLight);box(.035,.025,7,-5.3,5.36,1,ceilingLight);box(.035,.025,7,5.3,5.36,1,ceilingLight);
  scene.add(new THREE.HemisphereLight(0xe9e2d8,0x29241e,1.8));
  const fill=new THREE.DirectionalLight(0xffe6bc,1.1);fill.position.set(2,5,6);fill.castShadow=true;fill.shadow.mapSize.set(1024,1024);Object.assign(fill.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:.1,far:35});fill.shadow.normalBias=.035;scene.add(fill);
  const slots=[{p:[-4.6,2.35,-5.92],r:0},{p:[0,2.35,-5.92],r:0},{p:[4.6,2.35,-5.92],r:0},{p:[-7.87,2.35,1],r:Math.PI/2},{p:[7.87,2.35,1],r:-Math.PI/2}];
  const works=[],pickables=[],loader=new THREE.TextureLoader(); let selection=-1, room=0, animation=null,dirty=true,drag=null,ready=false;
  const salles=[{nom:'La salle des regards.',lignes:['La salle','des regards.']},{nom:'Échos intérieurs.',lignes:['Échos','intérieurs.']},{nom:'Présences nocturnes.',lignes:['Présences','nocturnes.']}];
  const roomPose={position:new THREE.Vector3(0,2.1,8.5),target:new THREE.Vector3(0,2.1,-4)};
  function quaternion(position,target){const temp=new THREE.PerspectiveCamera();temp.position.copy(position);temp.lookAt(target);return temp.quaternion.clone();}
  camera.position.copy(roomPose.position);camera.quaternion.copy(quaternion(roomPose.position,roomPose.target));
  function drawLabel(group,text,width,height){const c=document.createElement('canvas');c.width=1024;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#d4c9b7';ctx.font='26px Arial';ctx.fillText(text,0,45,1000);ctx.fillStyle='#a39886';ctx.font='18px Arial';ctx.fillText('IAMNOBODY  /  ÉDITION LIMITÉE',0,84);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;const label=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(width,2.5),.31),new THREE.MeshBasicMaterial({map:tex,transparent:true,toneMapped:false}));label.position.set(0,-height/2-.27,.06);group.add(label);}
  let failures=0;
  await Promise.all(oeuvres.slice(0,15).map((o,i)=>new Promise(resolve=>{
    const salle=Math.floor(i/5);const slot=slots[i%5],group=new THREE.Group();group.position.fromArray(slot.p);group.rotation.y=slot.r;scene.add(group);
    group.visible=salle===room;const work={...o,group,room:salle,width:2.4,height:2.4,index:i};works.push(work);
    const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',`Voir ${o.titre}`);b.setAttribute('aria-current','false');b.hidden=salle!==room;
    const img=document.createElement('img');img.src='/'+o.image;img.alt='';const number=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');b.append(img,number);b.addEventListener('click',()=>visiter(i));$('miniatures').append(b);work.button=b;
    loader.load('/'+o.image,tex=>{
      tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());const aspect=tex.image.width/tex.image.height;
      work.width=Math.min(2.8,2.7*aspect);work.height=work.width/aspect;
      const frame=new THREE.Mesh(new THREE.BoxGeometry(work.width+.09,work.height+.09,.08),dark);group.add(frame);
      const image=new THREE.Mesh(new THREE.PlaneGeometry(work.width,work.height),new THREE.MeshBasicMaterial({map:tex,toneMapped:false}));image.position.z=.048;image.userData.index=i;image.userData.room=salle;group.add(image);pickables.push(image);drawLabel(group,o.titre,work.width,work.height);
      const spot=new THREE.SpotLight(0xffe6bb,95,9,.48,.9,2);const normal=new THREE.Vector3(0,0,1).applyQuaternion(group.quaternion);spot.position.copy(group.position).addScaledVector(normal,2.8);spot.position.y=4.9;spot.target.position.copy(group.position);spot.visible=salle===room;work.spot=spot;scene.add(spot,spot.target);
      dirty=true;resolve();
    },undefined,()=>{failures++;resolve();});
  })));
  works.sort((a,b)=>a.index-b.index);ready=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  function afficherSalle(n){if(n<0||n>=Math.ceil(works.length/5))return;room=n;const info=salles[room];$('numero-salle').textContent=String(room+1).padStart(2,'0')+' / '+info.nom.replace(/\.$/,'').toUpperCase();$('pied-salle').textContent='SALLE '+String(room+1).padStart(2,'0')+' / '+String(Math.ceil(works.length/5)).padStart(2,'0');$('nom-salle').replaceChildren();info.lignes.forEach((ligne,i)=>{if(i)$('nom-salle').append(document.createElement('br'));$('nom-salle').append(document.createTextNode(ligne));});works.forEach(w=>{w.group.visible=w.room===room;w.button.hidden=w.room!==room;if(w.spot)w.spot.visible=w.room===room;});document.querySelectorAll('[data-salle]').forEach(b=>{b.hidden=Number(b.dataset.salle)>=Math.ceil(works.length/5);b.setAttribute('aria-pressed',String(Number(b.dataset.salle)===room));});renderer.shadowMap.needsUpdate=true;dirty=true;}
  function projection(){if(selection>=0&&innerWidth>700)camera.setViewOffset(innerWidth,innerHeight,-innerWidth*.16,0,innerWidth,innerHeight);else camera.clearViewOffset();camera.updateProjectionMatrix();}
  function posePour(work){const normal=new THREE.Vector3(0,0,1).applyQuaternion(work.group.quaternion);const f=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2);const mobile=innerWidth<=700;const distance=Math.max(4.8,work.width/(2*f*camera.aspect)*(mobile?1.5:2.3),work.height/(2*f)*(mobile?2.3:1.85));const target=work.group.position.clone();if(mobile)target.y-=.8;const position=target.clone().addScaledVector(normal,distance);return {position,target};}
  function transition(pose){animation={from:camera.position.clone(),to:pose.position,fromQ:camera.quaternion.clone(),toQ:quaternion(pose.position,pose.target),start:performance.now(),duration:reduced.matches?0:1350};dirty=true;}
  function fermer(){ $('fiche').hidden=true;$('ouvrir-fiche').setAttribute('aria-expanded','false'); }
  function visiter(index){if(!ready)return;fermer();document.querySelector('.experience').classList.add('mode-oeuvre');selection=(index+works.length)%works.length;afficherSalle(works[selection].room);projection();const w=works[selection];$('identite').hidden=true;$('cartel').hidden=false;$('cartel-numero').textContent=`SALLE ${String(room+1).padStart(2,'0')}  /  ŒUVRE ${String(selection+1).padStart(2,'0')}`;$('titre').textContent=w.titre;$('compteur').textContent=`${selection+1} / ${works.length} — ${w.titre}`;works.forEach((item,i)=>item.button.setAttribute('aria-current',String(i===selection)));transition(posePour(w));}
  function ensemble(){fermer();document.querySelector('.experience').classList.remove('mode-oeuvre');selection=-1;projection();$('identite').hidden=false;$('cartel').hidden=true;$('compteur').textContent=`SALLE ${room+1} / ${Math.ceil(works.length/5)} · ${Math.min(5,works.length-room*5)} ŒUVRES`;works.forEach(w=>w.button.setAttribute('aria-current','false'));transition(roomPose);}
  $('precedent').addEventListener('click',()=>visiter(selection<0?Math.min(room*5+4,works.length-1):selection-1));$('suivant').addEventListener('click',()=>visiter(selection<0?room*5:selection+1));$('vue-ensemble').addEventListener('click',ensemble);document.querySelectorAll('[data-salle]').forEach(b=>b.addEventListener('click',()=>{if(!ready)return;afficherSalle(Number(b.dataset.salle));ensemble();}));
  $('ouvrir-fiche').setAttribute('aria-expanded','false');$('ouvrir-fiche').setAttribute('aria-controls','fiche');
  $('ouvrir-fiche').addEventListener('click',()=>{if(selection<0)return;const w=works[selection];$('fiche-titre').textContent=w.titre;$('description').textContent=w.description;$('fiche-image').src='/'+w.image;$('fiche-image').alt=w.titre;$('finition').textContent=w.finition==='mat'?'mate':w.finition==='brillant'?'brillante':w.finition||'à préciser';$('lien-fiche').href='/oeuvre/'+w.id;$('fiche').hidden=false;$('ouvrir-fiche').setAttribute('aria-expanded','true');$('fermer-fiche').focus();});
  $('fermer-fiche').addEventListener('click',()=>{fermer();$('ouvrir-fiche').focus();});
  $('aide-bouton').addEventListener('click',()=>{const open=$('aide').hidden;$('aide').hidden=!open;$('aide-bouton').setAttribute('aria-expanded',String(open));});$('fermer-aide').addEventListener('click',()=>{$('aide').hidden=true;$('aide-bouton').setAttribute('aria-expanded','false');$('aide-bouton').focus();});
  $('plein-ecran').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('statut').hidden=false;$('statut').textContent='Le plein écran n’est pas disponible dans ce navigateur.';}});
  document.addEventListener('fullscreenchange',()=>{$('plein-ecran').textContent=document.fullscreenElement?'↙ Réduire':'⛶ Plein écran';});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){fermer();$('aide').hidden=true;return;}if(!$('fiche').hidden||!$('aide').hidden||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;if(e.key==='ArrowRight'){e.preventDefault();visiter(selection<0?room*5:selection+1);}if(e.key==='ArrowLeft'){e.preventDefault();visiter(selection<0?Math.min(room*5+4,works.length-1):selection-1);}});
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  function rayAt(e){const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);camera.updateMatrixWorld();ray.setFromCamera(pointer,camera);return ray.intersectObjects(pickables.filter(p=>p.userData.room===room));}
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;animation=null;drag={id:e.pointerId,x:e.clientX,y:e.clientY,distance:0};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!drag){canvas.style.cursor=rayAt(e).length?'pointer':'grab';return;}if(drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.distance+=Math.abs(dx)+Math.abs(dy);drag.x=e.clientX;drag.y=e.clientY;const angle=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');angle.y-=dx*.0027;angle.x=THREE.MathUtils.clamp(angle.x-dy*.0027,-.55,.55);camera.quaternion.setFromEuler(angle);dirty=true;});
  canvas.addEventListener('pointerup',e=>{if(drag&&drag.id===e.pointerId&&drag.distance<7){const hits=rayAt(e);if(hits.length)visiter(hits[0].object.userData.index);}drag=null;});canvas.addEventListener('pointercancel',()=>drag=null);
  const resize=new ResizeObserver(()=>{renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();projection();if(selection>=0)transition(posePour(works[selection]));dirty=true;});resize.observe(host);
  renderer.setAnimationLoop(now=>{if(document.hidden)return;if(animation){const t=animation.duration?Math.min(1,(now-animation.start)/animation.duration):1;const ease=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;camera.position.lerpVectors(animation.from,animation.to,ease);camera.quaternion.slerpQuaternions(animation.fromQ,animation.toQ,ease);dirty=true;if(t===1)animation=null;}if(dirty){renderer.render(scene,camera);dirty=false;}});
  document.addEventListener('visibilitychange',()=>dirty=true);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();renderer.setAnimationLoop(null);$('alternative').hidden=false;$('statut').hidden=false;$('statut').textContent='La visite a été interrompue. Rechargez la page pour réessayer.';});
  afficherSalle(0);$('compteur').textContent=`SALLE 1 / ${Math.ceil(works.length/5)} · ${Math.min(5,works.length)} ŒUVRES`;
  $('statut').textContent=failures?`${failures} œuvre(s) indisponible(s) dans cet aperçu.`:'';$('statut').hidden=!failures;
}
