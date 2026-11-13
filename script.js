<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bot Playroom</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#101830;font-family:'Segoe UI',sans-serif;user-select:none}
canvas{display:block;width:100vw;height:100vh;touch-action:none}
video{display:none;position:fixed;inset:0;width:100%;height:100%;object-fit:fill;transform:scaleX(-1);z-index:0}canvas{position:fixed;inset:0;z-index:2}#gl{z-index:1}body{background:linear-gradient(#04060c,#06182a)}
</style></head><body>
<canvas id="g"></canvas><video id="v" autoplay playsinline muted></video>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
const c=document.getElementById('g'),ctx=c.getContext('2d'),V=document.getElementById('v');
const GW=64,GH=48,sc=Object.assign(document.createElement('canvas'),{width:GW,height:GH}),sx=sc.getContext('2d',{willReadFrequently:true});
let cam={on:false,prev:null,mot:new Uint8Array(GW*GH),stream:null,msg:'',mt:0},
    state='menu',score=0,combo=0,lastGet=0,bots=[],stars=[],parts=[],btn=[],
    hand={x:-99,y:-99,vx:0,vy:0,on:false,vis:false},down=false,t=0,lastStar=0,W,H,floor;
const cols=['#ff5c8a','#4cc9f0','#ffd23f','#7bed9f','#b388ff','#ff9f43'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function resize(){c.width=W=innerWidth;c.height=H=innerHeight;floor=H-50}

/* ---- sound ---- */
let ac;
function beep(f,d=.12,ty='sine'){try{ac=ac||new AudioContext();const o=ac.createOscillator(),g=ac.createGain();
 o.type=ty;o.frequency.value=f;g.gain.value=.07;o.connect(g);g.connect(ac.destination);o.start();
 g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d);o.stop(ac.currentTime+d)}catch(e){}}

/* ---- camera ---- */
function note(m){cam.msg=m;cam.mt=t+600}
async function startCam(){
 if(cam.on)return;
 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){note('Camera not available here - use mouse/touch instead');return}
 try{
  cam.stream=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:'user'},audio:false});
  V.srcObject=cam.stream;await V.play();V.style.display="block";cam.on=true;cam.prev=null;
 }catch(e){note('Camera unavailable ('+(e.name||'error')+') - playing with mouse/touch')}
}
function stopCam(){cam.stream&&cam.stream.getTracks().forEach(k=>k.stop());cam.on=false;V.style.display="none";cam.prev=null;cam.mot.fill(0)}
function camStep(){
 cam.mot.fill(0);
 if(!cam.on||V.readyState<2)return;
 sx.drawImage(V,0,0,GW,GH);
 const d=sx.getImageData(0,0,GW,GH).data,cur=new Uint8Array(GW*GH);
 for(let i=0;i<GW*GH;i++){
  const l=d[i*4]*.3+d[i*4+1]*.59+d[i*4+2]*.11;cur[i]=l;
  if(cam.prev&&Math.abs(l-cam.prev[i])>28)cam.mot[i]=1;
 }
 cam.prev=cur;
}
// how much "hand" (camera motion or mouse) is near a point, and where its centre is
function probe(x,y,r){
 let n=0,mx=0,my=0;
 if(cam.on){
  const gx=(1-x/W)*GW,gy=y/H*GH,rr=Math.max(2,(r/W*GW)|0);
  for(let j=-rr;j<=rr;j++)for(let i=-rr;i<=rr;i++){
   const cx=(gx+i)|0,cy=(gy+j)|0;
   if(cx<0||cy<0||cx>=GW||cy>=GH||i*i+j*j>rr*rr||!cam.mot[cy*GW+cx])continue;
   n++;mx+=(1-(cx+.5)/GW)*W;my+=(cy+.5)/GH*H;
  }
  if(n){mx/=n;my/=n}
 }
 if(hand.on&&Math.hypot(hand.x-x,hand.y-y)<r+25){mx=(mx*n+hand.x*8)/(n+8);my=(my*n+hand.y*8)/(n+8);n+=8}
 return{n,mx,my};
}

/* ---- bots ---- */
function addBot(x){
 if(bots.length>=12)return;
 const pop=x===undefined;if(pop)burst(W/2,floor-20,'#7df9ff',22);
 bots.push({x:pop?W/2+(Math.random()-.5)*60:x,y:pop?floor-30:-40-Math.random()*200,vx:pop?(Math.random()-.5)*14:0,vy:pop?-17:0,s:1.1+Math.random()*.5,col:cols[bots.length%cols.length],
  dir:Math.random()<.5?-1:1,walk:true,dz:0,tm:0,ph:Math.random()*6,blink:0,cheer:0,cd:0,air:true});
 beep(500+Math.random()*300,.1);
}
function updBot(b){
 const pr=probe(b.x,b.y-30*b.s,34*b.s+20);
 if(pr.n>3){
  const dx=b.x-pr.mx,dy=b.y-30*b.s-pr.my,l=Math.hypot(dx,dy)||1,f=Math.min(pr.n,25)*.35;
  b.vx+=dx/l*f+(hand.on?hand.vx*.12:0);b.vy+=dy/l*f-1.5;
  if(b.cd<=0&&pr.n>6){beep(300+Math.random()*250,.08,'triangle');b.cd=15}
 }
 b.cd--;
 b.vx=clamp(b.vx,-22,22);b.vy=clamp(b.vy+.6,-22,24);
 b.x+=b.vx;b.y+=b.vy;
 if(b.x<20||b.x>W-20){if(Math.abs(b.vx)>8)b.dz=80;b.x=clamp(b.x,20,W-20);b.vx*=-.6}
 if(b.y<40){b.y=40;b.vy*=-.5}
 b.air=b.y<floor-1;
 if(b.y>=floor){
  if(b.vy>10){b.dz=90;beep(170,.1,'square')}
  b.y=floor;b.vy=Math.abs(b.vy)>3?b.vy*-.45:0;b.vx*=.86;b.air=false;
 }
 if(b.dz>0)b.dz--;
 else if(!b.air){
  if(--b.tm<=0){b.tm=60+Math.random()*120;b.dir=Math.random()<.5?-1:1;b.walk=Math.random()<.7}
  if(b.walk)b.vx+=b.dir*.15;
  if(Math.random()<.004){b.vy=-12}
 }
 b.ph+=Math.abs(b.vx)*.2+.05;
 if(--b.blink<-150)b.blink=8;
 if(b.cheer>0)b.cheer--;
}
function rr(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r)}
/* ---- stars & particles ---- */
function burst(x,y,col,n=14){for(let i=0;i<n;i++){const a=Math.random()*6.3,v=2+Math.random()*5;
 parts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-2,a:1,col,s:3+Math.random()*4})}}
function drawStar(x,y,r,rot){ctx.beginPath();
 for(let i=0;i<10;i++){const a=rot+i*Math.PI/5-Math.PI/2,rad=i%2?r*.45:r;ctx.lineTo(x+Math.cos(a)*rad,y+Math.sin(a)*rad)}ctx.closePath()}

/* ---- update ---- */
function update(){
 camStep();
 hand.on=hand.vis&&(Math.hypot(hand.vx,hand.vy)>3||down);hand.vx*=.8;hand.vy*=.8;
 if(false){
  stars.push({x:60+Math.random()*(W-120),y:100+Math.random()*Math.max(60,floor-220),r:22,life:480,ph:Math.random()*6});lastStar=t}
 for(let i=stars.length-1;i>=0;i--){
  const s=stars[i];s.life--;
  const pr=probe(s.x,s.y,s.r+10);
  if(pr.n>2){
   combo=t-lastGet<90?Math.min(5,combo+1):1;lastGet=t;score+=10*combo;
   burst(s.x,s.y,'#ffd23f');beep(450+combo*120,.18);
   bots.forEach(b=>{b.cheer=45;if(!b.air&&b.dz<=0)b.vy=-11});
   stars.splice(i,1);
  }else if(s.life<=0)stars.splice(i,1);
 }
 bots.forEach(updBot);
 for(let i=0;i<bots.length;i++)for(let j=i+1;j<bots.length;j++){
  const a=bots[i],b=bots[j],dx=b.x-a.x;
  if(Math.abs(dx)<38&&Math.abs(b.y-a.y)<50){const p=(38-Math.abs(dx))*.08*(dx<0?-1:1);a.vx-=p;b.vx+=p}
 }
 for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.x+=p.vx;p.y+=p.vy;p.vy+=.2;p.a-=.03;if(p.a<=0)parts.splice(i,1)}
}

/* ---- draw ---- */
function button(label,x,y,w,h,act,col='#7df9ff'){
 btn.push({x,y,w,h,act});
 ctx.save();ctx.shadowBlur=14;ctx.shadowColor=col;ctx.fillStyle='rgba(0,16,28,.88)';rr(x,y,w,h,4);ctx.fill();
 ctx.strokeStyle=col;ctx.lineWidth=2;ctx.stroke();ctx.restore();
 ctx.fillStyle=col;ctx.font='bold 17px sans-serif';ctx.textAlign='center';ctx.fillText(label,x+w/2,y+h/2+6);
}
function text(s,x,y,f,col,al='center'){ctx.font=f;ctx.fillStyle=col;ctx.textAlign=al;ctx.fillText(s,x,y)}

function drawTitle(){
 ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
 const bw=Math.min(W*.72,720),bh=bw*.085,bx=W/2-bw/2,by=H*.36,cy0=by+bh/2,pu=.8+Math.sin(t*.04)*.2;
 ctx.save();ctx.globalAlpha=.09*pu;ctx.fillStyle='#4aa8ff';
 for(let i=-3;i<=3;i++){ctx.beginPath();ctx.moveTo(W/2+i*bw*.06,by);ctx.lineTo(W/2+i*bw*.22-bw*.05,by-H*.32);ctx.lineTo(W/2+i*bw*.22+bw*.05,by-H*.32);ctx.fill()}
 ctx.restore();
 let g=ctx.createRadialGradient(W/2,by+bh,0,W/2,by+bh,bw*.6);
 g.addColorStop(0,`rgba(0,220,255,${.5*pu})`);g.addColorStop(1,'rgba(0,220,255,0)');
 ctx.fillStyle=g;ctx.fillRect(0,by-bh*2,W,bh*8);
 ctx.save();ctx.shadowBlur=30;ctx.shadowColor='#00e5ff';ctx.fillStyle='#00e5ff';
 ctx.beginPath();ctx.ellipse(W/2,by+bh*1.9,bw*.42,bh*.28,0,0,7);ctx.fill();ctx.restore();
 const bg=ctx.createLinearGradient(0,by,0,by+bh);bg.addColorStop(0,'#27324a');bg.addColorStop(.5,'#111826');bg.addColorStop(1,'#070b14');
 ctx.fillStyle=bg;rr(bx,by,bw,bh,4);ctx.fill();ctx.strokeStyle='#3b4a66';ctx.lineWidth=1.5;ctx.stroke();
 const sw=bw/8;
 for(let i=0;i<7;i++){
  const x=bx+i*sw,cx=x+sw/2;
  ctx.strokeStyle='#2c374d';ctx.lineWidth=1;ctx.strokeRect(x+3,by+3,sw-6,bh-6);
  if(i===1||i===5){
   ctx.fillStyle='#05080e';ctx.beginPath();ctx.arc(cx,cy0,bh*.3,0,7);ctx.fill();
   ctx.strokeStyle='#5b6b88';ctx.lineWidth=2;ctx.stroke();
   ctx.fillStyle='#16304a';ctx.beginPath();ctx.arc(cx,cy0,bh*.14,0,7);ctx.fill();
  }else{
   ctx.fillStyle='#3a475f';
   for(let r=0;r<6;r++)for(let q=0;q<7;q++)ctx.fillRect(x+8+q*((sw-16)/7),by+8+r*((bh-16)/6),1.6,1.6);
  }
 }
 ctx.save();ctx.shadowBlur=8;ctx.shadowColor='#f22';ctx.fillStyle='#ff2a2a';ctx.beginPath();ctx.arc(bx+sw*3.5,cy0,2.5,0,7);ctx.fill();ctx.restore();
 ctx.fillStyle='#4d6b86';rr(bx+sw*7+2,by+3,sw-5,bh-6,3);ctx.fill();
 ctx.save();ctx.textAlign='center';ctx.font=`italic 900 ${Math.min(72,W/11)}px Eurostile,"Segoe UI","Arial Black",sans-serif`;
 ctx.letterSpacing='4px';ctx.fillStyle='#fff';ctx.shadowBlur=18;ctx.shadowColor='rgba(120,200,255,.7)';
 ctx.fillText('BOT PLAYROOM',W/2,by-bh*1.3);ctx.restore();
}
function drawPad(){
 const x=W/2,y=floor+26,pu=.7+Math.sin(t*.08)*.3;
 ctx.save();ctx.translate(x,y);
 ctx.fillStyle='#0b1018';ctx.strokeStyle='#2c3a52';ctx.lineWidth=2;
 ctx.beginPath();ctx.ellipse(-34,10,16,20,.2,0,7);ctx.fill();ctx.stroke();
 ctx.beginPath();ctx.ellipse(34,10,16,20,-.2,0,7);ctx.fill();ctx.stroke();
 rr(-45,-12,90,28,12);ctx.fill();ctx.stroke();
 ctx.save();ctx.shadowBlur=18;ctx.shadowColor='#00e5ff';ctx.fillStyle=`rgba(0,229,255,${pu})`;rr(-22,-14,44,4,2);ctx.fill();ctx.restore();
 ctx.fillStyle='#1b2536';rr(-14,-6,28,12,3);ctx.fill();
 ctx.fillStyle='#4a5a78';ctx.fillRect(-36,-2,12,4);ctx.fillRect(-32,-6,4,12);
 [[30,-6],[30,6],[24,0],[36,0]].forEach(([a,b])=>{ctx.beginPath();ctx.arc(a,b,3,0,7);ctx.fill()});
 ctx.restore();
}
function draw(){
 btn=[];
 ctx.clearRect(0,0,W,H);
 if(cam.on&&V.readyState>=2){
  ctx.fillStyle='rgba(125,249,255,.25)';
  const cw=W/GW,ch=H/GH;
  for(let i=0;i<GW*GH;i++)if(cam.mot[i])ctx.fillRect((GW-1-i%GW)*cw,((i/GW)|0)*ch,cw+1,ch+1);
 }
 const fg=ctx.createLinearGradient(0,floor,0,H);fg.addColorStop(0,'rgba(0,220,255,.3)');fg.addColorStop(1,'rgba(0,220,255,0)');
 ctx.fillStyle=fg;ctx.fillRect(0,floor+4,W,H);ctx.fillStyle='rgba(125,249,255,.8)';ctx.fillRect(0,floor+4,W,2);

 stars.forEach(s=>{
  const pu=1+Math.sin(t*.1+s.ph)*.12,fade=s.life<90&&(t>>2)%2?.4:1;
  ctx.save();ctx.globalAlpha=fade;ctx.shadowBlur=22;ctx.shadowColor='#ffd23f';
  ctx.fillStyle='#ffd23f';drawStar(s.x,s.y,s.r*pu,t*.02);ctx.fill();
  ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();ctx.restore();
 });

 parts.forEach(p=>{ctx.globalAlpha=p.a;ctx.fillStyle=p.col;ctx.fillRect(p.x,p.y,p.s,p.s)});
 ctx.globalAlpha=1;

 if(hand.vis&&!cam.on){
  ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=3;ctx.fillStyle=down?'rgba(125,249,255,.4)':'rgba(255,255,255,.1)';
  ctx.beginPath();ctx.arc(hand.x,hand.y,24,0,7);ctx.fill();ctx.stroke();
 }

 if(state==='menu'){
  drawTitle();
  button('PLAY WITH CAMERA',W/2-160,H*.6,320,56,'cam','#00e5ff');
  button('PLAY WITHOUT CAMERA',W/2-160,H*.6+72,320,56,'nocam','#7df9ff');
  text('WAVE YOUR HANDS TO PLAY WITH THE AR BOTS',W/2,H*.6+158,'14px sans-serif','#6fb7d6');
  text('Camera tip: open this file in its own Chrome tab and click Allow.',W/2,H*.6+182,'13px sans-serif','#4c7088');
 }else{
  text('BOTS  '+bots.length,24,40,'bold 16px sans-serif','#7df9ff','left');
  button('+ BOT (B)',W-300,16,130,44,'bot','#7bed9f');
  button('CAM: '+(cam.on?'ON':'OFF')+' (C)',W-160,16,144,44,'tcam',cam.on?'#7df9ff':'#ff9f9f');
  if(t<500)text(cam.on?'Wave your hands to push the bots around!':'Move or drag your mouse to push the bots around!',W/2,H-16,'bold 18px sans-serif','#fff');
 }
 if(t<cam.mt)text(cam.msg,W/2,H-60,'bold 16px sans-serif','#ffd23f');
 if(!has3D)text('3D engine could not load - connect to the internet and reload',W/2,H/2,'bold 20px sans-serif','#ff9f9f');
}

/* ---- real 3D (three.js) ---- */
const has3D=typeof THREE!=='undefined';
let R,scene,cam3,K=.01,ctrl,shTex;const M={};
function initGL(){
 R=new THREE.WebGLRenderer({antialias:true,alpha:true});R.setClearColor(0x000000,0);
 R.setPixelRatio(Math.min(devicePixelRatio,2));R.domElement.id='gl';document.body.insertBefore(R.domElement,c);
 scene=new THREE.Scene();cam3=new THREE.PerspectiveCamera(40,1,.1,100);cam3.position.z=10;
 scene.add(new THREE.AmbientLight(0xbfd8ff,.8));
 const dl=new THREE.DirectionalLight(0xffffff,.9);dl.position.set(-3,6,8);scene.add(dl);
 const pl=new THREE.PointLight(0x00e5ff,1.4,40);pl.position.set(4,-1,5);scene.add(pl);
 const bl=new THREE.PointLight(0x4aa8ff,1,40);bl.position.set(-4,3,-3);scene.add(bl);
 M.w=new THREE.MeshPhongMaterial({color:0xf4f7fc,shininess:90,specular:0x99aabb});
 M.v=new THREE.MeshPhongMaterial({color:0x070b16,shininess:160,specular:0xffffff});
 M.g=new THREE.MeshPhongMaterial({color:0xaab6c8,shininess:60});
 M.d=new THREE.MeshPhongMaterial({color:0x0b1018,shininess:80,specular:0x334455});
 M.lb=new THREE.MeshBasicMaterial({color:0x00e5ff});
 const cv=document.createElement('canvas');cv.width=cv.height=64;const x=cv.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);
 g.addColorStop(0,'rgba(0,0,0,.65)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,64,64);
 shTex=new THREE.CanvasTexture(cv);
 ctrl=new THREE.Group();
 ctrl.add(new THREE.Mesh(new THREE.BoxGeometry(.9,.28,.22),M.d));
 for(const k of[-1,1]){const gp=new THREE.Mesh(new THREE.SphereGeometry(.17,16,12),M.d);gp.scale.set(.9,1.4,.9);gp.position.set(k*.4,-.17,0);gp.rotation.z=k*.15;ctrl.add(gp)}
 const lb=new THREE.Mesh(new THREE.BoxGeometry(.4,.03,.04),M.lb);lb.position.set(0,.15,-.04);ctrl.add(lb);
 ctrl.rotation.x=.7;scene.add(ctrl);
}
function makeBot(b){
 const g=new THREE.Group(),S=r=>new THREE.SphereGeometry(r,24,18),
  mk=(geo,mat,a=1,b2=1,c2=1)=>{const m=new THREE.Mesh(geo,mat);m.scale.set(a,b2,c2);return m},o={g,eyes:[],arms:[],legs:[]};
 for(const k of[-1,1]){const l=mk(S(.09),M.g,1,1.1,1);l.position.set(k*.1,.09,0);g.add(l);o.legs.push(l)}
 const body=mk(S(.2),M.w,1,.95,.9);body.position.y=.28;g.add(body);
 const chest=new THREE.Mesh(S(.03),M.lb);chest.position.set(0,.27,.175);g.add(chest);
 o.head=new THREE.Group();o.head.position.y=.6;g.add(o.head);
 o.head.add(mk(S(.27),M.w,1,.92,.95));
 const vz=mk(S(.2),M.v,1.05,.72,.55);vz.position.z=.17;o.head.add(vz);
 o.em=new THREE.MeshBasicMaterial({color:0x7df9ff});
 for(const k of[-1,1]){const e=mk(S(.035),o.em,1,1.5,.4);e.position.set(k*.075,.01,.275);o.head.add(e);o.eyes.push(e)}
 const pm=new THREE.MeshPhongMaterial({color:new THREE.Color(b.col),shininess:80});
 for(const k of[-1,1]){const p=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,.05,16),pm);p.rotation.z=Math.PI/2;p.position.x=k*.275;o.head.add(p)}
 for(const k of[-1,1]){const a=new THREE.Group();a.position.set(k*.2,.34,0);
  const u=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.2,12),M.w);u.position.y=-.1;a.add(u);
  const h=new THREE.Mesh(S(.055),M.w);h.position.y=-.21;a.add(h);a.rotation.z=k*.35;g.add(a);o.arms.push(a)}
 o.stars=new THREE.Group();o.stars.position.y=.95;
 for(let i=0;i<3;i++){const st=new THREE.Mesh(S(.035),new THREE.MeshBasicMaterial({color:0xffe066}));st.position.set(Math.cos(i*2.1)*.2,0,Math.sin(i*2.1)*.2);o.stars.add(st)}
 o.stars.visible=false;g.add(o.stars);
 o.sh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:shTex,transparent:true,depthWrite:false}));
 scene.add(g,o.sh);return o;
}
function sync3D(){
 if(!has3D)return;
 const P=100*K;
 bots.forEach(b=>{
  const o=b.m||(b.m=makeBot(b)),sp=Math.hypot(b.vx,b.vy),sq=Math.min(.25,sp*.015),S=P*b.s,up=b.air,
   wig=Math.sin(b.ph)*(b.air?0:1),dz=b.dz>0;
  o.g.position.set((b.x-W/2)*K,(H/2-b.y)*K,0);
  o.g.scale.set(S*(1-sq*.5),S*(1+sq),S*(1-sq*.5));
  const tl=up?clamp(b.vx*.05,-.7,.7):0;b.tilt=(b.tilt||0)+(tl-(b.tilt||0))*.2;o.g.rotation.z=-b.tilt;
  const yw=up?0:clamp(b.vx*.25,-.9,.9);b.yaw=(b.yaw||0)+(yw-(b.yaw||0))*.15;o.g.rotation.y=b.yaw;
  const hx=hand.on?hand.x:b.x,hy=hand.on?hand.y:b.y-80;
  o.head.rotation.y=clamp((hx-b.x)*.003,-.5,.5);o.head.rotation.x=clamp((hy-b.y+60)*.002,-.35,.35);
  o.arms.forEach((a,i)=>{const k=i?1:-1,tg=up?k*2.5:k*.35+wig*.4*k;a.rotation.z+=(tg-a.rotation.z)*.25});
  o.legs.forEach((l,i)=>l.position.y=.09+Math.max(0,i?-wig:wig)*.07);
  o.eyes.forEach(e=>e.scale.y=dz?.2:(b.blink>0?.15:1.5));
  o.em.color.set(dz?0xffb347:0x7df9ff);
  o.stars.visible=dz;o.stars.rotation.y+=.15;
  const h=floor-b.y,sw=56*b.s*(1-Math.min(.6,h/500))*K;
  o.sh.position.set(o.g.position.x,(H/2-(floor+4))*K,-.1);o.sh.scale.set(sw,sw*.22,1);
 });
 ctrl.visible=state==='play';ctrl.scale.setScalar(P);ctrl.position.set(0,(H/2-(floor+34))*K,-.3);
 M.lb.color.setRGB(0,.55+.35*Math.sin(t*.08),1);
 R.render(scene,cam3);
}
function resize3(){if(!has3D)return;R.setSize(W,H);cam3.aspect=W/H;cam3.updateProjectionMatrix();K=2*Math.tan(20*Math.PI/180)*10/H}

/* ---- input ---- */
async function act(a){
 if(a==='cam'){state='play';score=0;lastStar=t;await startCam()}
 else if(a==='nocam'){state='play';score=0;lastStar=t}
 else if(a==='bot')addBot();
 else if(a==='tcam'){cam.on?stopCam():await startCam()}
}
function ptr(e){const nx=e.clientX,ny=e.clientY;
 if(hand.vis){hand.vx=hand.vx*.5+(nx-hand.x)*.5;hand.vy=hand.vy*.5+(ny-hand.y)*.5}
 hand.x=nx;hand.y=ny;hand.vis=true}
window.addEventListener('pointermove',ptr);
window.addEventListener('pointerdown',e=>{
 ptr(e);
 const b=btn.find(b=>e.clientX>b.x&&e.clientX<b.x+b.w&&e.clientY>b.y&&e.clientY<b.y+b.h);
 if(b){act(b.act);return}
 down=true;
});
window.addEventListener('pointerup',()=>{down=false});
window.addEventListener('pointercancel',()=>{down=false});
window.addEventListener('keydown',e=>{
 const k=e.key.toLowerCase();
 if(k==='b')addBot();
 if(k==='c')act('tcam');
});
window.addEventListener('resize',()=>{resize();resize3()});

if(has3D)initGL();
resize();resize3();
for(let i=0;i<4;i++)addBot(W*(i+1)/5);
(function loop(){t++;update();draw();sync3D();requestAnimationFrame(loop)})();
</script></body></html>
