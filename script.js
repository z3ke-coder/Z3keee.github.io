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
let cam={on:false,prev:null,mot:new Uint8Array(GW*GH),stream:null,msg:'',mt:0,lum:120,rgb:[1,1,1],n:0},
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
 cam.mot.fill(0);cam.n=0;
 if(!cam.on||V.readyState<2)return;
 sx.drawImage(V,0,0,GW,GH);
 const d=sx.getImageData(0,0,GW,GH).data,cur=new Uint8Array(GW*GH);let sr=0,sg=0,sb=0;
 for(let i=0;i<GW*GH;i++){
  sr+=d[i*4];sg+=d[i*4+1];sb+=d[i*4+2];
  const l=d[i*4]*.3+d[i*4+1]*.59+d[i*4+2]*.11;cur[i]=l;
  if(cam.prev&&Math.abs(l-cam.prev[i])>28){cam.mot[i]=1;cam.n++}
 }
 cam.prev=cur;
 const m=(sr+sg+sb)/3||1;cam.rgb=[sr/m,sg/m,sb/m];cam.lum+=(m/(GW*GH)-cam.lum)*.05;
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

let pull=false,grab=null,gt=0,gx0=0,gy0=0,balls=[];
function pick(x,y){let best=null,bd=1e9;
 bots.forEach(b=>{const d=Math.hypot(x-b.x,y-(b.y-45*b.s));if(d<52*b.s&&d<bd){bd=d;best=b}});
 balls.forEach(q=>{const d=Math.hypot(x-q.x,y-q.y);if(d<q.r+10&&d<bd){bd=d;best=q}});return best}
function tapBot(b){b.vy=-16;b.av=(Math.random()<.5?-1:1)*.3;b.dz=0;b.cheer=40;beep(660,.1);setTimeout(()=>beep(880,.15),90)}
function addBall(){if(balls.length>=3)return;balls.push({x:80+Math.random()*(W-160),y:60,vx:(Math.random()-.5)*8,vy:0,r:38,rot:0,ball:true,held:false,cd:0});beep(400,.1)}
function updBall(q){
 q.cd--;
 if(q.held){q.vx=(hand.x-q.x)*.35;q.vy=(hand.y-q.y)*.35;q.x+=q.vx;q.y=Math.min(floor-q.r,q.y+q.vy);return}
 const pr=probe(q.x,q.y,q.r+25);
 if(pr.n>3){const dx=q.x-pr.mx,dy=q.y-pr.my,l=Math.hypot(dx,dy)||1,f=Math.min(pr.n,25)*.5;q.vx+=dx/l*f;q.vy+=dy/l*f-1}
 q.vy=clamp(q.vy+.5,-26,26);q.vx=clamp(q.vx*.995,-26,26);q.x+=q.vx;q.y+=q.vy;
 if(q.x<q.r||q.x>W-q.r){q.x=clamp(q.x,q.r,W-q.r);q.vx*=-.8}
 if(q.y<q.r){q.y=q.r;q.vy*=-.7}
 if(q.y>floor-q.r){q.y=floor-q.r;q.vy*=-.72;if(Math.abs(q.vy)<1.5)q.vy=0;q.vx*=.985}
 q.rot-=q.vx/q.r;
}
function collide(){
 balls.forEach(q=>{if(q.held)return;
  bots.forEach(b=>{if(b.held)return;
   const R2=28*b.s+q.r,dx=q.x-b.x,dy=q.y-(b.y-45*b.s),d=Math.hypot(dx,dy)||1;
   if(d<R2){const nx=dx/d,ny=dy/d,ov=R2-d;q.x+=nx*ov;q.y+=ny*ov;
    const imp=Math.max(0,(b.vx-q.vx)*nx+(b.vy-q.vy)*ny)+2.5;q.vx+=nx*imp;q.vy+=ny*imp-1;b.vx-=nx*imp*.12;
    if(imp>5&&q.cd<=0){beep(220+Math.random()*100,.08,'triangle');q.cd=10;b.cheer=30}}
  })})}
function ballTex(){const cv=document.createElement('canvas');cv.width=256;cv.height=128;const x=cv.getContext('2d');
 ['#ff4d5a','#ffffff','#2d9cff','#ffffff','#ffd23f','#ffffff'].forEach((c1,i)=>{x.fillStyle=c1;x.fillRect(i*256/6,0,256/6+1,128)});
 const t2=new THREE.CanvasTexture(cv);t2.encoding=THREE.sRGBEncoding;return t2}

/* ---- bots ---- */
function addBot(x){
 if(bots.length>=12)return;
 const pop=x===undefined;if(pop)burst(W/2,floor-20,'#7df9ff',22);
 bots.push({x:pop?W/2+(Math.random()-.5)*60:x,y:pop?floor-30:-40-Math.random()*200,vx:pop?(Math.random()-.5)*14:0,vy:pop?-17:0,s:1.1+Math.random()*.5,col:cols[bots.length%cols.length],
  dir:Math.random()<.5?-1:1,walk:true,dz:0,tm:0,ph:Math.random()*6,blink:0,cheer:0,cd:0,air:true});
 beep(500+Math.random()*300,.1);
}
function updBot(b){
 if(b.held){b.vx=(hand.x-b.x)*.35;b.vy=(hand.y+62*b.s-b.y)*.35;b.x+=b.vx;b.y=Math.min(floor,b.y+b.vy);b.air=true;b.dz=0;
  b.rot=(b.rot||0)+(-clamp(hand.vx*.02,-.6,.6)-(b.rot||0))*.2;b.ph+=.1;return}
 const pr=probe(b.x,b.y-30*b.s,pull?150:34*b.s+20);
 if(pr.n>3){
  if(pull){b.vx+=(pr.mx-b.x)*.035;b.vy+=(pr.my+45*b.s-b.y)*.03-.35;b.vx*=.92;b.vy*=.92}
  else{
   const dx=b.x-pr.mx,dy=b.y-30*b.s-pr.my,l=Math.hypot(dx,dy)||1,f=Math.min(pr.n,25)*.35;
   b.vx+=dx/l*f+(hand.on?hand.vx*.12:0);b.vy+=dy/l*f-1.5;b.av=(b.av||0)-dx/l*f*.012;b.surp=18;
   if(b.cd<=0&&pr.n>6){beep(300+Math.random()*250,.08,'triangle');b.cd=15}
  }
 }else if(!b.air&&b.dz<=0){
  const w=probe(b.x,b.y-30*b.s,280);
  if(w.n>5){b.wave=40;b.fx=w.mx}
 }
 if(b.wave>0){b.wave--;b.vx*=.85}
 if(b.surp>0)b.surp--;
 b.cd--;
 b.vx=clamp(b.vx,-22,22);b.vy=clamp(b.vy+.6,-22,24);
 b.x+=b.vx;b.y+=b.vy;
 b.rot=(b.rot||0)+(b.av||0);b.av=clamp((b.av||0)*.96,-.35,.35);if(b.y>=floor-2){b.rot*=.82;b.av*=.7}
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
 hand.on=hand.vis&&(Math.hypot(hand.vx,hand.vy)>3||down)&&!grab;hand.vx*=.8;hand.vy*=.8;
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
 bots.forEach(updBot);balls.forEach(updBall);collide();
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
 if(!cam.on){const fg=ctx.createLinearGradient(0,floor,0,H);fg.addColorStop(0,'rgba(140,190,255,.14)');fg.addColorStop(1,'rgba(140,190,255,0)');ctx.fillStyle=fg;ctx.fillRect(0,floor+4,W,H)}
 const vg=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.45,W/2,H/2,Math.max(W,H)*.75);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.45)');ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);

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
  if(cam.on){ctx.fillStyle='rgba(255,255,255,.15)';ctx.fillRect(24,52,120,5);ctx.fillStyle='#7df9ff';ctx.fillRect(24,52,120*Math.min(1,cam.n/200),5)}
  button('+ BOT (B)',W-300,16,130,44,'bot','#7bed9f');
  button('CAM: '+(cam.on?'ON':'OFF')+' (C)',W-160,16,144,44,'tcam',cam.on?'#7df9ff':'#ff9f9f');
  button('+ BALL (O)',W-300,68,130,44,'ball','#ffd23f');
  button('MODE: '+(pull?'PULL':'PUSH')+' (P)',W-160,68,144,44,'mode',pull?'#b388ff':'#ff9f43');
  if(t<700)text(cam.on?'Wave at the bots - they wave back! Press P to pull them to your hand.':'Drag bots to throw them, tap one for a backflip, press O for a ball.',W/2,H-16,'bold 18px sans-serif','#fff');
 }
 if(t<cam.mt)text(cam.msg,W/2,H-60,'bold 16px sans-serif','#ffd23f');
 if(!has3D)text('3D engine could not load - connect to the internet and reload',W/2,H/2,'bold 20px sans-serif','#ff9f9f');
}

/* ---- realistic 3D (three.js, physically based) ---- */
const has3D=typeof THREE!=='undefined';
let R,scene,cam3,K=.01,ctrl,ctrlGlow,amb,key,floorM,blobTex,glowTex;const M={};
function radial(stops){const cv=document.createElement('canvas');cv.width=cv.height=64;const x=cv.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);
 stops.forEach(([p,col])=>g.addColorStop(p,col));x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(cv)}
function glowSprite(col,sz){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:col,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));sp.scale.set(sz,sz,1);return sp}
function cap(r,len){const p=[];
 for(let i=0;i<=8;i++){const a=i/8*Math.PI/2;p.push(new THREE.Vector2(Math.sin(a)*r,-len/2-Math.cos(a)*r))}
 for(let i=0;i<=8;i++){const a=i/8*Math.PI/2;p.push(new THREE.Vector2(Math.cos(a)*r,len/2+Math.sin(a)*r))}
 return new THREE.LatheGeometry(p,20)}
function makeEnv(){ // procedural photo-studio so glossy plastic has real reflections
 const es=new THREE.Scene();
 es.add(new THREE.Mesh(new THREE.SphereGeometry(20,32,16),new THREE.MeshBasicMaterial({color:0x14202e,side:THREE.BackSide})));
 const panel=(w,h,x,y,z,col,i)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(col).multiplyScalar(i),side:THREE.DoubleSide}));m.position.set(x,y,z);m.lookAt(0,0,0);es.add(m)};
 panel(10,6,-8,8,8,0xffffff,5);panel(8,3,10,3,6,0xcfe8ff,3);panel(6,10,8,2,-10,0x00e5ff,4);panel(14,2,0,14,0,0xffffff,3);panel(10,2,0,-6,10,0x335577,1.2);
 const pm=new THREE.PMREMGenerator(R);const tex=pm.fromScene(es,.02).texture;pm.dispose();return tex;
}
function initGL(){
 R=new THREE.WebGLRenderer({antialias:true,alpha:true});R.setClearColor(0x000000,0);
 R.setPixelRatio(Math.min(devicePixelRatio,2));R.domElement.id='gl';document.body.insertBefore(R.domElement,c);
 R.outputEncoding=THREE.sRGBEncoding;R.toneMapping=THREE.ACESFilmicToneMapping;R.toneMappingExposure=1.1;
 R.shadowMap.enabled=true;R.shadowMap.type=THREE.PCFSoftShadowMap;
 scene=new THREE.Scene();scene.environment=makeEnv();
 cam3=new THREE.PerspectiveCamera(40,1,.1,100);cam3.position.z=10;
 glowTex=radial([[0,'rgba(255,255,255,1)'],[.3,'rgba(255,255,255,.35)'],[1,'rgba(255,255,255,0)']]);
 blobTex=radial([[0,'rgba(0,0,0,.8)'],[.6,'rgba(0,0,0,.3)'],[1,'rgba(0,0,0,0)']]);
 amb=new THREE.HemisphereLight(0xdfeaff,0x223344,.55);scene.add(amb);
 key=new THREE.DirectionalLight(0xffffff,1.2);key.position.set(-4,9,7);key.castShadow=true;
 key.shadow.mapSize.set(1024,1024);key.shadow.bias=-.0005;key.shadow.radius=4;
 Object.assign(key.shadow.camera,{left:-10,right:10,top:10,bottom:-10,near:1,far:35});scene.add(key);
 const rim=new THREE.DirectionalLight(0x3ad8ff,.9);rim.position.set(5,3,-6);scene.add(rim);
 const pl=(o)=>new THREE.MeshPhysicalMaterial(o);
 M.w=pl({color:0xf1f3f7,roughness:.26,clearcoat:1,clearcoatRoughness:.06,envMapIntensity:1.1});
 M.v=pl({color:0x04060a,roughness:.04,metalness:.2,clearcoat:1,clearcoatRoughness:.02,envMapIntensity:1.8});
 M.g=pl({color:0x8d98aa,roughness:.4,metalness:.55});
 M.d=pl({color:0x0a0d12,roughness:.35,clearcoat:.6});
 M.lb=new THREE.MeshBasicMaterial({color:0x00e5ff});
 floorM=new THREE.Mesh(new THREE.PlaneGeometry(60,30),new THREE.ShadowMaterial({opacity:.42}));
 floorM.rotation.x=-Math.PI/2;floorM.receiveShadow=true;scene.add(floorM);
 // DualShock-style controller (the portal the bots pop out of)
 ctrl=new THREE.Group();
 const body=new THREE.Mesh(new THREE.SphereGeometry(.45,32,16),M.d);body.scale.set(1.1,.28,.5);ctrl.add(body);
 for(const k of[-1,1]){const gp=new THREE.Mesh(cap(.11,.24),M.d);gp.position.set(k*.42,-.03,.2);gp.rotation.set(1.25,0,k*.3);ctrl.add(gp)}
 const tp=new THREE.Mesh(new THREE.BoxGeometry(.34,.02,.17),M.g);tp.position.set(0,.085,-.02);ctrl.add(tp);
 const lb=new THREE.Mesh(new THREE.BoxGeometry(.34,.03,.03),M.lb);lb.position.set(0,.09,-.2);ctrl.add(lb);
 ctrlGlow=glowSprite(0x00e5ff,1.1);ctrlGlow.position.set(0,.14,-.2);ctrl.add(ctrlGlow);
 for(const [x,z] of[[.3,-.02],[.3,.1],[.24,.04],[.36,.04]]){const bt=new THREE.Mesh(new THREE.SphereGeometry(.027,12,8),M.g);bt.position.set(x,.085,z);ctrl.add(bt)}
 for(const bx of[[.14,.04],[.04,.14]]){const dp=new THREE.Mesh(new THREE.BoxGeometry(bx[0],.02,bx[1]),M.g);dp.position.set(-.3,.085,.04);ctrl.add(dp)}
 ctrl.rotation.x=.85;scene.add(ctrl);
}
function makeBot(b){
 const g=new THREE.Group(),pv=new THREE.Group(),r=new THREE.Group(),S=q=>new THREE.SphereGeometry(q,32,24),
  mk=(geo,mat,x=0,y=0,z=0,sx=1,sy=1,sz=1)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);return m},
  o={g,pv,r,eyes:[],gl:[],arms:[],legs:[]};
 pv.position.y=.45;r.position.y=-.45;g.add(pv);pv.add(r);
 const bp=[[0,0],[.12,.005],[.17,.05],[.2,.14],[.205,.24],[.19,.34],[.15,.41],[.09,.45],[0,.46]].map(p=>new THREE.Vector2(p[0],p[1]));
 r.add(mk(new THREE.LatheGeometry(bp,40),M.w,0,.14,0,1,1,.86));
 r.add(mk(new THREE.CylinderGeometry(.065,.075,.07,20),M.g,0,.58,0));
 r.add(mk(S(.028),M.lb,0,.36,.165,1,1,.5));const cg=glowSprite(0x00e5ff,.16);cg.position.set(0,.36,.19);r.add(cg);
 o.head=new THREE.Group();o.head.position.y=.78;r.add(o.head);
 o.head.add(mk(S(.25),M.w,0,0,0,1,.9,.95));
 o.head.add(mk(S(.19),M.v,0,.005,.16,1.06,.7,.5));
 o.em=new THREE.MeshBasicMaterial({color:0x7df9ff});
 for(const k of[-1,1]){const e=mk(S(.032),o.em,k*.07,.01,.262,1,1.55,.35);o.head.add(e);o.eyes.push(e);
  const gs=glowSprite(0x00e5ff,.2);gs.position.set(k*.07,.01,.285);o.head.add(gs);o.gl.push(gs)}
 const pm=new THREE.MeshPhysicalMaterial({color:new THREE.Color(b.col),roughness:.3,clearcoat:1,clearcoatRoughness:.1});
 for(const k of[-1,1]){
  const pod=mk(new THREE.CylinderGeometry(.06,.06,.05,24),pm,k*.25,0,0);pod.rotation.z=Math.PI/2;o.head.add(pod);
  const ring=mk(new THREE.TorusGeometry(.058,.007,8,24),M.lb,k*.277,0,0);ring.rotation.y=Math.PI/2;o.head.add(ring);
  const lg=new THREE.Group();lg.position.set(k*.09,.17,0);
  lg.add(mk(cap(.05,.06),M.w,0,-.07,0));lg.add(mk(S(.065),M.d,0,-.15,.025,1,.55,1.45));r.add(lg);o.legs.push(lg);
  const ar=new THREE.Group();ar.position.set(k*.215,.46,0);
  ar.add(mk(cap(.033,.12),M.w,0,-.1,0));ar.add(mk(S(.05),M.w,0,-.22,0));ar.rotation.z=k*.18;r.add(ar);o.arms.push(ar);
 }
 o.stars=new THREE.Group();o.stars.position.y=1.12;
 for(let i=0;i<3;i++)o.stars.add(mk(S(.03),new THREE.MeshBasicMaterial({color:0xffe066}),Math.cos(i*2.1)*.2,0,Math.sin(i*2.1)*.2));
 o.stars.visible=false;r.add(o.stars);
 g.traverse(m=>{if(m.isMesh)m.castShadow=true});
 o.sh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:blobTex,transparent:true,depthWrite:false}));
 o.sh.rotation.x=-Math.PI/2;scene.add(g,o.sh);return o;
}
function sync3D(){
 if(!has3D)return;
 const P=100*K,fy=(H/2-floor)*K,lum=cam.on?clamp(cam.lum/130,.4,1.4):1,rg=cam.on?cam.rgb:[1,1,1];
 amb.color.setRGB(.6+rg[0]*.4,.6+rg[1]*.4,.6+rg[2]*.4);amb.intensity=.55*lum+.1;key.intensity=1.2*lum;
 floorM.position.y=fy;
 bots.forEach(b=>{
  const o=b.m||(b.m=makeBot(b)),sp=Math.hypot(b.vx,b.vy),sq=Math.min(.22,sp*.012),S=P*b.s,up=b.air||b.held,dz=b.dz>0,
   wk=up?0:clamp(Math.abs(b.vx)/1.3,0,1);
  o.g.position.set((b.x-W/2)*K,(H/2-b.y)*K,0);
  o.g.scale.set(S*(1-sq*.5),S*(1+sq),S*(1-sq*.5));
  o.pv.rotation.z=b.rot||0;
  // walk facing the direction of travel, turn to the camera when idle
  const yw=(up||b.wave>0)?0:(wk>.25?clamp(b.vx*.9,-1.25,1.25):0);b.yaw=(b.yaw||0)+(yw-(b.yaw||0))*.12;o.r.rotation.y=b.yaw;
  const sw=Math.sin(b.ph)*wk;
  o.legs.forEach((l,i)=>{const k=i?-1:1;l.rotation.x=up?(i?.5:-.3):k*sw*.8});
  o.arms.forEach((a,i)=>{const k=i?1:-1;a.rotation.z+=((up?k*2.3:(b.wave>0&&i?2.4+Math.sin(t*.45)*.4:k*.18))-a.rotation.z)*.25;a.rotation.x+=((i?1:-1)*-sw*.7-a.rotation.x)*.25});
  const hx=hand.on?hand.x:(b.wave>0?b.fx:b.x),hy=hand.on?hand.y:b.y-80;
  o.head.rotation.y=clamp(-b.yaw*.7+(hx-b.x)*.002,-.9,.9);o.head.rotation.x=clamp((hy-b.y+60)*.002,-.35,.35);
  o.head.rotation.z=dz?Math.sin(t*.3)*.15:0;
  o.eyes.forEach(e=>e.scale.y=dz?.3:(b.blink>0?.2:(b.surp>0?2.3:1.55)));
  o.gl.forEach(s=>s.visible=!dz&&b.blink<=0);
  o.em.color.set(dz?0xffb347:0x7df9ff);
  o.stars.visible=dz;o.stars.rotation.y+=.15;
  const hh=floor-b.y,w2=P*b.s*.9*(1-Math.min(.6,hh/500));
  o.sh.position.set(o.g.position.x,fy+.003,0);o.sh.scale.set(w2,w2*.8,1);o.sh.material.opacity=1-Math.min(.8,hh/400);
 });
 balls.forEach(q=>{
  if(!q.m){q.m=new THREE.Mesh(new THREE.SphereGeometry(1,40,28),new THREE.MeshPhysicalMaterial({map:ballTex(),roughness:.35,clearcoat:.6,clearcoatRoughness:.2}));q.m.castShadow=true;
   q.sh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:blobTex,transparent:true,depthWrite:false}));q.sh.rotation.x=-Math.PI/2;scene.add(q.m,q.sh)}
  q.m.position.set((q.x-W/2)*K,(H/2-q.y)*K,.3);q.m.scale.setScalar(q.r*K);q.m.rotation.z=q.rot;
  const hh=floor-(q.y+q.r),w=q.r*2.2*K*(1-Math.min(.6,hh/500));
  q.sh.position.set(q.m.position.x,fy+.003,.3);q.sh.scale.set(w,w*.8,1);q.sh.material.opacity=1-Math.min(.8,hh/400);
 });
 ctrl.visible=state==='play';ctrl.scale.setScalar(P);ctrl.position.set(0,(H/2-(floor+30))*K,.5);
 const pu=.55+.35*Math.sin(t*.08);M.lb.color.setRGB(0,pu,1);ctrlGlow.material.opacity=pu;
 R.render(scene,cam3);
}
function resize3(){if(!has3D)return;R.setSize(W,H);cam3.aspect=W/H;cam3.updateProjectionMatrix();K=2*Math.tan(20*Math.PI/180)*10/H}

/* ---- input ---- */
async function act(a){
 if(a==='cam'){state='play';score=0;lastStar=t;await startCam()}
 else if(a==='nocam'){state='play';score=0;lastStar=t}
 else if(a==='bot')addBot();
 else if(a==='ball')addBall();
 else if(a==='mode')pull=!pull;
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
 if(state==='play'){grab=pick(e.clientX,e.clientY);if(grab){grab.held=true;gt=performance.now();gx0=e.clientX;gy0=e.clientY;beep(520,.06)}}
});
function release(){down=false;if(!grab)return;const g=grab;grab=null;g.held=false;
 if(performance.now()-gt<250&&Math.hypot(hand.x-gx0,hand.y-gy0)<10){if(g.ball)g.vy=-14;else tapBot(g)}
 else{g.vx=clamp(hand.vx*1.6,-26,26);g.vy=clamp(hand.vy*1.6,-26,26);g.av=-clamp(hand.vx*.01,-.3,.3);beep(300,.12,'triangle')}}
window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);
window.addEventListener('keydown',e=>{
 const k=e.key.toLowerCase();
 if(k==='b')addBot();
 if(k==='o')addBall();
 if(k==='p')pull=!pull;
 if(k==='c')act('tcam');
});
window.addEventListener('resize',()=>{resize();resize3()});

if(has3D)initGL();
resize();resize3();
for(let i=0;i<4;i++)addBot(W*(i+1)/5);
(function loop(){t++;update();draw();sync3D();requestAnimationFrame(loop)})();
</script></body></html>
