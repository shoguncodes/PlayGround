(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = {
    hp: $('hpFill'), hpText: $('hpText'), mana: $('manaFill'), manaText: $('manaText'),
    xp: $('xpFill'), xpText: $('xpText'), level: $('level'), kills: $('kills'), shards: $('shards'),
    wave: $('wave'), enemy: $('enemyCount'), objective: $('objective'), objectiveSub: $('objectiveSub'),
    feed: $('feedText'), note: $('arenaNote'), coords: $('coords'), starsCd: $('starsCd'), meteorCd: $('meteorCd'),
    pause: $('pauseOverlay'), gameover: $('gameoverOverlay'), toast: $('levelToast')
  };
  const TAU = Math.PI * 2;
  let W = 800, H = 560, dpr = 1, last = performance.now(), elapsed = 0;
  let running = true, paused = false, dead = false, soundOn = false, showMap = false;
  let audio;
  const keys = Object.create(null);
  const pointer = { x: 550, y: 280, down: false, inside: false };
  let player, enemies = [], shots = [], effects = [], meteors = [], pickups = [];
  let wave = 1, kills = 0, shards = 0, spawnLeft = 0, spawnTimer = 0, waveWait = 0;
  let starsCooldown = 0, meteorCooldown = 0, fireTimer = 0, toastTimer = 0, lastUi = 0;
  let spell = 'fire';
  const rand = (a,b) => a + Math.random()*(b-a);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const colors = { fire:'#ff9d67', star:'#c2b2ff', meteor:'#ffbd76', heal:'#9ae2be' };

  function resize(){
    const r = canvas.getBoundingClientRect(); if(!r.width || !r.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2); W = r.width; H = r.height;
    canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if(player){ player.x=clamp(player.x,28,W-28); player.y=clamp(player.y,40,H-30); }
  }
  new ResizeObserver(resize).observe(canvas); resize();
  function fresh(){
    player={x:W*.5,y:H*.57,r:15,hp:100,maxHp:100,mana:100,maxMana:100,speed:210,aim:0,invuln:0,xp:0,level:1,damage:1};
    enemies=[];shots=[];effects=[];meteors=[];pickups=[];wave=1;kills=0;shards=0;spawnLeft=3;spawnTimer=.45;waveWait=0;
    starsCooldown=0;meteorCooldown=0;fireTimer=0;elapsed=0;dead=false;paused=false;running=true;
    ui.pause.classList.remove('show');ui.gameover.classList.remove('show');ui.toast.classList.remove('show');
    setFeed('A strange chill rolls over the clearing...'); setObjective('Survive the rift','The hollow stirs...');
    for(let i=0;i<4;i++) spawnEnemy(true);
    updateUI(true); requestAnimationFrame(loop);
  }
  function setFeed(s){ui.feed.textContent=s;}
  function setObjective(a,b){ui.objective.textContent=a;ui.objectiveSub.textContent=b;}
  function arenaPoint(){
    const edge=35, side=Math.floor(Math.random()*4);
    return side===0?{x:rand(edge,W-edge),y:edge}:side===1?{x:W-edge,y:rand(edge,H-edge)}:side===2?{x:rand(edge,W-edge),y:H-edge}:{x:edge,y:rand(edge,H-edge)};
  }
  function spawnEnemy(initial=false){
    const p=arenaPoint(); let type='shade';
    if(wave>=2 && Math.random()<.30) type='brute';
    if(wave>=3 && Math.random()<.24) type='wisp';
    const scale=1+(wave-1)*.12;
    enemies.push({x:p.x,y:p.y,r:type==='brute'?18:type==='wisp'?11:14,type,hp:(type==='brute'?5:type==='wisp'?2:3)*scale,maxHp:(type==='brute'?5:type==='wisp'?2:3)*scale,speed:(type==='brute'?29:type==='wisp'?67:43)+Math.min(wave*1.6,22),hit:0,attack:rand(.4,1.2),phase:rand(0,TAU),initial});
  }
  function burst(x,y,color,n=12,power=1){
    for(let i=0;i<n;i++){let a=rand(0,TAU),s=rand(25,145)*power;effects.push({kind:'particle',x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.32,.75),max:.75,size:rand(1.5,4),color});}
  }
  function ring(x,y,color,r=40){effects.push({kind:'ring',x,y,r:2,max:r,life:.42,maxLife:.42,color});}
  function shootFire(){
    if(dead||paused||!player)return;
    const a=player.aim; const speed=440;
    shots.push({x:player.x+Math.cos(a)*17,y:player.y+Math.sin(a)*17,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:6,life:1.55,damage:2*player.damage,kind:'fire',trail:[]});
    effects.push({kind:'flash',x:player.x+Math.cos(a)*22,y:player.y+Math.sin(a)*22,life:.14,max:.14,color:colors.fire});
    playTone(420,.045,'triangle',.014);
  }
  function castStars(){
    if(dead||paused||starsCooldown>0)return;
    starsCooldown=4; player.mana=Math.max(0,player.mana-12);
    const tx=pointer.x,ty=pointer.y; const area=128;
    ring(tx,ty,colors.star,area); burst(tx,ty,colors.star,21,.85);
    let hit=0;
    for(const e of enemies){if(Math.hypot(e.x-tx,e.y-ty)<area+e.r){e.hp-=3*player.damage;e.hit=.18;hit++;burst(e.x,e.y,colors.star,5,.65);}}
    setFeed(hit?`Astral stars scatter ${hit} ${hit===1?'shadow':'shadows'}!`:'Astral stars bloom across the clearing.');
    playTone(660,.17,'sine',.035); playTone(930,.22,'sine',.02);
  }
  function castMeteor(){
    if(dead||paused||meteorCooldown>0)return;
    meteorCooldown=8; player.mana=Math.max(0,player.mana-24);
    const cx=pointer.x,cy=pointer.y;
    for(let i=0;i<5;i++){
      const x=clamp(cx+rand(-75,75),35,W-35),y=clamp(cy+rand(-55,55),48,H-45);
      meteors.push({x,y,delay:i*.16,fall:.62+rand(0,.12),life:1.3,hit:false});
    }
    ring(cx,cy,'#e7a5ff',86);setFeed('The heavens answer. Meteors incoming!');
    playTone(135,.23,'sawtooth',.035);
  }
  function cast(which){
    if(which==='fire'){spell='fire';selectCard();shootFire();}
    if(which==='stars'){spell='stars';selectCard();castStars();}
    if(which==='meteor'){spell='meteor';selectCard();castMeteor();}
  }
  function selectCard(){document.querySelectorAll('.spell-card').forEach(c=>c.classList.toggle('active',c.dataset.spell===spell));}
  function playTone(freq,duration,type='sine',volume=.025){
    if(!soundOn)return;try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}catch(_){ }
  }
  function pointerPos(e){const r=canvas.getBoundingClientRect();pointer.x=e.clientX-r.left;pointer.y=e.clientY-r.top;pointer.inside=true;if(player)player.aim=Math.atan2(pointer.y-player.y,pointer.x-player.x);}
  canvas.addEventListener('pointermove',pointerPos);
  canvas.addEventListener('pointerdown',e=>{e.preventDefault();pointerPos(e);pointer.down=true;if(e.pointerType==='touch')shootFire();else if(spell==='stars')castStars();else if(spell==='meteor')castMeteor();else shootFire();});
  window.addEventListener('pointerup',()=>pointer.down=false);
  canvas.addEventListener('pointerleave',()=>pointer.inside=false);
  document.querySelectorAll('.spell-card').forEach(card=>card.addEventListener('click',()=>cast(card.dataset.spell)));
  $('touchCast').addEventListener('pointerdown',e=>{e.preventDefault();shootFire();pointer.down=true;});
  $('touchStars').addEventListener('pointerdown',e=>{e.preventDefault();castStars();});
  $('touchMeteor').addEventListener('pointerdown',e=>{e.preventDefault();castMeteor();});
  document.querySelectorAll('.touch-pad button').forEach(b=>{
    const dir=b.dataset.dir, down=e=>{e.preventDefault();keys['touch'+dir]=true;},up=e=>{e.preventDefault();keys['touch'+dir]=false;};
    b.addEventListener('pointerdown',down);b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('pointerleave',up);
  });
  window.addEventListener('keydown',e=>{
    const k=e.key.toLowerCase(); if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();keys[k]=true;
    if(k==='p'||k==='escape')togglePause();
    if(k==='enter'&&dead)fresh();
    if(k==='1')spell='fire',selectCard();
    if(k==='2')castStars();
    if(k==='3')castMeteor();
    if(k==='m')showMap=!showMap;
  });
  window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
  $('pauseBtn').addEventListener('click',togglePause);$('resumeBtn').addEventListener('click',togglePause);$('restartBtn').addEventListener('click',fresh);
  $('mapBtn').addEventListener('click',()=>showMap=!showMap);
  $('soundBtn').addEventListener('click',()=>{soundOn=!soundOn;$('soundBtn').style.color=soundOn?'#edc779':'';$('soundBtn').textContent=soundOn?'♫':'♩';if(soundOn)playTone(540,.08);});
  function togglePause(){if(dead)return;paused=!paused;ui.pause.classList.toggle('show',paused);$('pauseBtn').textContent=paused?'▶':'Ⅱ';if(!paused){last=performance.now();requestAnimationFrame(loop);}}
  function levelUp(){player.level++;player.maxHp+=8;player.hp=Math.min(player.maxHp,player.hp+30);player.damage+=.12;player.maxMana+=5;player.mana=player.maxMana;$('toastLevel').textContent=player.level;ui.toast.classList.add('show');toastTimer=2.2;setFeed(`Your magic deepens. You are now level ${player.level}.`);burst(player.x,player.y,'#ffe29b',28,1.3);playTone(720,.28,'sine',.05);}
  function killEnemy(e){
    const i=enemies.indexOf(e);if(i<0)return;enemies.splice(i,1);kills++;shards+=e.type==='brute'?3:1;
    burst(e.x,e.y,e.type==='brute'?'#d89cff':'#a996ec',13,1);ring(e.x,e.y,'#a996ec',24);
    if(Math.random()<.26)pickups.push({x:e.x,y:e.y,type:'xp',life:15});
    if(Math.random()<.08)pickups.push({x:e.x,y:e.y,type:'heal',life:15});
    player.xp+=e.type==='brute'?24:13;
    while(player.xp>=player.level*100)levelUp();
    if(kills%5===0)setFeed(`${kills} shadows banished. Keep going, starbound.`);
  }
  function update(dt){
    if(paused||dead)return;elapsed+=dt;
    starsCooldown=Math.max(0,starsCooldown-dt);meteorCooldown=Math.max(0,meteorCooldown-dt);player.invuln=Math.max(0,player.invuln-dt);player.mana=Math.min(player.maxMana,player.mana+2.6*dt);
    if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)ui.toast.classList.remove('show');}
    let mx=(keys.d||keys.arrowright||keys.touchright?1:0)-(keys.a||keys.arrowleft||keys.touchleft?1:0);
    let my=(keys.s||keys.arrowdown||keys.touchdown?1:0)-(keys.w||keys.arrowup||keys.touchup?1:0);
    const m=Math.hypot(mx,my)||1;player.x=clamp(player.x+mx/m*player.speed*dt,24,W-24);player.y=clamp(player.y+my/m*player.speed*dt,30,H-30);
    if(pointer.inside)player.aim=Math.atan2(pointer.y-player.y,pointer.x-player.x);
    if(pointer.down&&spell==='fire'){fireTimer-=dt;if(fireTimer<=0){shootFire();fireTimer=.17;}}else fireTimer=0;
    if(spawnLeft>0){spawnTimer-=dt;if(spawnTimer<=0){spawnEnemy();spawnLeft--;spawnTimer=Math.max(.45,1.05-wave*.035);}}
    if(spawnLeft===0&&enemies.length===0){waveWait+=dt;if(waveWait>2.3){wave++;spawnLeft=Math.min(5+wave*2,24);spawnTimer=.2;waveWait=0;setFeed(`Wave ${String(wave).padStart(2,'0')} — the shadows gather.`);setObjective(`Survive wave ${String(wave).padStart(2,'0')}`,`${spawnLeft} hostiles approaching`);burst(W/2,H/2,'#d7c27d',25,1.2);}}
    for(const e of enemies){
      e.phase+=dt*2.7;e.hit=Math.max(0,e.hit-dt);e.attack-=dt;
      const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy)||1;
      if(d>e.r+player.r+3){e.x+=dx/d*e.speed*dt;e.y+=dy/d*e.speed*dt;}
      if(d<e.r+player.r+2&&e.attack<=0&&player.invuln<=0){player.hp-=e.type==='brute'?15:9;player.invuln=.68;e.attack=.9;burst(player.x,player.y,'#ff7788',8,.55);setFeed(e.type==='brute'?'A hollow brute slams into you!':'A shadow catches your robe!');playTone(115,.12,'square',.025);}
      if(e.hp<=0)killEnemy(e);
    }
    for(const s of shots){s.trail.unshift({x:s.x,y:s.y});if(s.trail.length>5)s.trail.pop();s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;
      for(const e of enemies){if(Math.hypot(e.x-s.x,e.y-s.y)<e.r+s.r){e.hp-=s.damage;e.hit=.15;burst(s.x,s.y,colors.fire,5,.42);s.life=0;break;}}
    }
    shots=shots.filter(s=>s.life>0&&s.x>-20&&s.x<W+20&&s.y>-20&&s.y<H+20);
    for(const m of meteors){m.delay-=dt;if(m.delay<=0){m.fall-=dt;if(m.fall<=0&&!m.hit){m.hit=true;ring(m.x,m.y,'#ff9b6e',67);burst(m.x,m.y,'#ffb770',22,1.1);for(const e of enemies){if(Math.hypot(e.x-m.x,e.y-m.y)<69+e.r){e.hp-=5*player.damage;e.hit=.24;}}playTone(105,.16,'sawtooth',.04);}m.life-=dt;}}
    meteors=meteors.filter(m=>m.life>0);
    for(const p of pickups){p.life-=dt;const d=Math.hypot(p.x-player.x,p.y-player.y);if(d<player.r+14){if(p.type==='xp'){player.xp+=12;setFeed('A lost wisp of starlight joins you.');while(player.xp>=player.level*100)levelUp();}else{player.hp=Math.min(player.maxHp,player.hp+22);setFeed('A little warmth returns.');burst(player.x,player.y,colors.heal,12,.8);}p.life=0;}else if(d<100){p.x+=(player.x-p.x)/d*130*dt;p.y+=(player.y-p.y)/d*130*dt;}}
    pickups=pickups.filter(p=>p.life>0);
    for(const fx of effects){fx.life-=dt;if(fx.kind==='particle'){fx.x+=fx.vx*dt;fx.y+=fx.vy*dt;fx.vx*=Math.pow(.06,dt);fx.vy*=Math.pow(.06,dt);}else if(fx.kind==='ring')fx.r+=(fx.max-fx.r)*Math.min(1,dt*11);}
    effects=effects.filter(f=>f.life>0);
    if(player.hp<=0){player.hp=0;die();}
    if(performance.now()-lastUi>100){updateUI();lastUi=performance.now();}
  }
  function updateUI(force=false){
    if(!player)return;ui.hp.style.width=(player.hp/player.maxHp*100)+'%';ui.hpText.textContent=`${Math.ceil(player.hp)} / ${player.maxHp}`;
    ui.mana.style.width=(player.mana/player.maxMana*100)+'%';ui.manaText.textContent=`${Math.floor(player.mana)} / ${player.maxMana}`;
    ui.xp.style.width=(player.xp/(player.level*100)*100)+'%';ui.xpText.textContent=`${Math.floor(player.xp)} / ${player.level*100}`;
    ui.level.textContent=String(player.level).padStart(2,'0');ui.kills.textContent=String(kills).padStart(2,'0');ui.shards.textContent=String(shards).padStart(3,'0');ui.wave.textContent=String(wave).padStart(2,'0');ui.enemy.textContent=String(enemies.length+spawnLeft);
    ui.starsCd.textContent=starsCooldown>0?`${starsCooldown.toFixed(1)}s`:'';ui.meteorCd.textContent=meteorCooldown>0?`${meteorCooldown.toFixed(1)}s`:'';
    document.querySelector('[data-spell="stars"]').classList.toggle('cooling',starsCooldown>0);document.querySelector('[data-spell="meteor"]').classList.toggle('cooling',meteorCooldown>0);
    $('touchStars').style.opacity=starsCooldown>0?'.55':'1';$('touchMeteor').style.opacity=meteorCooldown>0?'.55':'1';
    ui.coords.textContent=`ASHEN MEADOWS  ·  ${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(Math.floor(elapsed%60)).padStart(2,'0')}`;
    if(spawnLeft>0)setObjective(`Survive wave ${String(wave).padStart(2,'0')}`,`${enemies.length+spawnLeft} hostiles remain`);else if(!enemies.length)setObjective('Rift temporarily quiet',`Next wave in ${Math.max(0,Math.ceil(2.3-waveWait))} sec`);
  }
  function die(){dead=true;ui.gameover.classList.add('show');$('finalWave').textContent=String(wave).padStart(2,'0');$('finalKills').textContent=String(kills).padStart(2,'0');$('finalShards').textContent=String(shards).padStart(3,'0');setFeed('The light goes quiet...');}
  function loop(now){if(dead||paused)return;const dt=Math.min(.033,(now-last)/1000||0);last=now;update(dt);draw();requestAnimationFrame(loop);}

  function draw(){
    ctx.clearRect(0,0,W,H);drawGround();drawSetPieces();
    // soft ambient pools
    let g=ctx.createRadialGradient(W*.5,H*.48,20,W*.5,H*.48,Math.max(W,H)*.65);g.addColorStop(0,'rgba(125,105,154,.09)');g.addColorStop(1,'rgba(7,9,20,.36)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    for(const p of pickups)drawPickup(p);
    for(const m of meteors)drawMeteor(m);
    for(const s of shots)drawShot(s);
    for(const e of enemies)drawEnemy(e);
    if(player)drawMage(player);
    for(const fx of effects)drawEffect(fx);
    if(showMap)drawMap();
  }
  function drawGround(){
    const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#24263b');bg.addColorStop(.48,'#29283c');bg.addColorStop(1,'#202438');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    // earth flecks & fine etched lines
    ctx.save();ctx.globalAlpha=.12;ctx.strokeStyle='#9f9cb0';ctx.lineWidth=.6;
    const step=32,ox=(elapsed*3)%step,oy=(elapsed*1.2)%step;
    for(let x=-step+ox;x<W+step;x+=step){for(let y=-step+oy;y<H+step;y+=step){let seed=Math.sin(x*12.98+y*78.23)*43758.5;let u=seed-Math.floor(seed);if(u>.72){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+3+u*5,y-2);ctx.stroke();}else if(u<.06){ctx.fillStyle='#ddc89a';ctx.fillRect(x,y,1.2,1.2);}}}
    ctx.globalAlpha=.09;ctx.strokeStyle='#d2c8a9';ctx.setLineDash([2,10]);ctx.beginPath();ctx.arc(W*.51,H*.52,Math.min(W,H)*.28,0,TAU);ctx.stroke();ctx.restore();
    // decorative rune fragments around perimeter
    ctx.save();ctx.strokeStyle='#d8c886';ctx.globalAlpha=.2;ctx.lineWidth=1;
    const cx=W*.5,cy=H*.52,r=Math.min(W,H)*.34;
    for(let i=0;i<24;i++){let a=i*TAU/24, x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;ctx.beginPath();ctx.moveTo(x-Math.cos(a)*3,y-Math.sin(a)*3);ctx.lineTo(x+Math.cos(a)*3,y+Math.sin(a)*3);ctx.stroke();}
    ctx.restore();
  }
  function drawSetPieces(){
    const props=[[.13,.25,'shrub'],[.82,.20,'rock'],[.89,.72,'shrub'],[.15,.82,'rock'],[.75,.86,'flower'],[.27,.14,'flower'],[.94,.39,'flower'],[.06,.62,'shrub'],[.63,.13,'rock'],[.38,.88,'shrub']];
    props.forEach((p,i)=>{let x=p[0]*W,y=p[1]*H; // keep props away from initial center
      if(Math.hypot(x-W*.5,y-H*.55)<Math.min(W,H)*.22)return;
      ctx.save();if(p[2]==='rock'){ctx.fillStyle='#343347';ctx.beginPath();ctx.ellipse(x,y+5,9,5,0,0,TAU);ctx.fill();ctx.fillStyle='#555164';ctx.beginPath();ctx.moveTo(x-9,y+3);ctx.lineTo(x-4,y-5);ctx.lineTo(x+2,y-8);ctx.lineTo(x+10,y+2);ctx.closePath();ctx.fill();ctx.strokeStyle='#8c8094';ctx.globalAlpha=.35;ctx.stroke();}
      else if(p[2]==='shrub'){ctx.fillStyle='#283b3c';ctx.beginPath();ctx.arc(x-4,y,6,0,TAU);ctx.arc(x+4,y-2,7,0,TAU);ctx.arc(x+1,y+4,6,0,TAU);ctx.fill();ctx.strokeStyle='#758b6b';ctx.globalAlpha=.4;ctx.stroke();}
      else{ctx.strokeStyle='#667b67';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x,y+6);ctx.lineTo(x,y-4);ctx.stroke();ctx.fillStyle=i%2?'#d79aaa':'#e0c779';ctx.beginPath();ctx.arc(x-3,y-5,2,0,TAU);ctx.arc(x+3,y-2,2,0,TAU);ctx.arc(x,y-8,2,0,TAU);ctx.fill();}
      ctx.restore();});
    // scattered tiny glowing mushrooms
    for(let i=0;i<12;i++){let x=((i*137+59)%997)/997*W,y=((i*201+43)%991)/991*H;if(Math.hypot(x-W*.5,y-H*.55)<Math.min(W,H)*.18)continue;ctx.fillStyle=i%2?'#b9a2c6':'#dfbb76';ctx.globalAlpha=.35+.2*Math.sin(elapsed*2+i);ctx.beginPath();ctx.arc(x,y,1.2,0,TAU);ctx.fill();ctx.globalAlpha=1;}
  }
  function drawMage(p){
    const aim=p.aim;ctx.save();ctx.translate(p.x,p.y);
    // soft shadow
    ctx.fillStyle='#090b17';ctx.globalAlpha=.55;ctx.beginPath();ctx.ellipse(1,11,15,7,0,0,TAU);ctx.fill();ctx.globalAlpha=1;
    // robe base
    ctx.fillStyle='#393453';ctx.strokeStyle='#9f8ed1';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-10,-5);ctx.quadraticCurveTo(-14,6,-18,13);ctx.quadraticCurveTo(0,18,18,12);ctx.lineTo(9,-7);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#524766';ctx.beginPath();ctx.moveTo(-7,-8);ctx.lineTo(7,-8);ctx.lineTo(10,11);ctx.lineTo(-11,11);ctx.closePath();ctx.fill();
    // belt and star clasp
    ctx.strokeStyle='#d6b977';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-10,5);ctx.lineTo(10,5);ctx.stroke();ctx.fillStyle='#f0d48a';ctx.beginPath();ctx.arc(0,5,2.1,0,TAU);ctx.fill();
    // face
    ctx.fillStyle='#d7aa8d';ctx.beginPath();ctx.ellipse(0,-10,7,8,0,0,TAU);ctx.fill();
    // beard flowing
    ctx.fillStyle='#ded9d1';ctx.beginPath();ctx.moveTo(-6,-7);ctx.quadraticCurveTo(-1,-2,6,-7);ctx.lineTo(4,3);ctx.lineTo(0,7);ctx.lineTo(-4,3);ctx.closePath();ctx.fill();
    // hat brim and cone
    ctx.fillStyle='#292640';ctx.strokeStyle='#9d8bd2';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,-16,13,4,0,0,TAU);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(-8,-17);ctx.lineTo(-3,-34);ctx.quadraticCurveTo(0,-38,3,-32);ctx.lineTo(9,-17);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.strokeStyle='#e3c67d';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-8,-17);ctx.lineTo(9,-17);ctx.stroke();
    // arm holding staff pointing toward aim
    ctx.rotate(aim);ctx.strokeStyle='#b48d62';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(6,1);ctx.lineTo(23,1);ctx.stroke();
    ctx.strokeStyle='#efd99a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(23,1);ctx.lineTo(38,1);ctx.stroke();
    const glow=ctx.createRadialGradient(39,1,1,39,1,10);glow.addColorStop(0,'#f8eab9');glow.addColorStop(.28,'#9de9ff');glow.addColorStop(1,'#91bbff00');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(39,1,10,0,TAU);ctx.fill();ctx.fillStyle='#d6f7ff';ctx.beginPath();ctx.arc(39,1,2.5,0,TAU);ctx.fill();
    ctx.restore();
    if(p.invuln>0){ctx.strokeStyle=`rgba(255,131,150,${.35+.3*Math.sin(elapsed*24)})`;ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,22,0,TAU);ctx.stroke();}
  }
  function drawEnemy(e){
    ctx.save();ctx.translate(e.x,e.y+Math.sin(e.phase)*2);const r=e.r;ctx.fillStyle='#090b17';ctx.globalAlpha=.42;ctx.beginPath();ctx.ellipse(1,r*.7,r*1.1,r*.42,0,0,TAU);ctx.fill();ctx.globalAlpha=1;
    if(e.type==='brute'){
      const pulse=1+Math.sin(e.phase*2)*.04;ctx.scale(pulse,pulse);
      ctx.fillStyle=e.hit?'#f4b6ff':'#49324f';ctx.strokeStyle='#d086cf';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-15,8);ctx.lineTo(-17,-6);ctx.lineTo(-10,-15);ctx.lineTo(-3,-11);ctx.lineTo(4,-17);ctx.lineTo(14,-8);ctx.lineTo(16,7);ctx.quadraticCurveTo(0,17,-15,8);ctx.fill();ctx.stroke();
      ctx.fillStyle='#ffb26d';ctx.shadowColor='#ff915e';ctx.shadowBlur=9;ctx.fillRect(-8,-5,4,3);ctx.fillRect(4,-5,4,3);ctx.shadowBlur=0;ctx.fillStyle='#d8a4c8';ctx.beginPath();ctx.moveTo(-11,-13);ctx.lineTo(-15,-21);ctx.lineTo(-5,-15);ctx.moveTo(7,-14);ctx.lineTo(14,-21);ctx.lineTo(13,-9);ctx.fill();
    }else if(e.type==='wisp'){
      ctx.globalAlpha=.86;ctx.fillStyle=e.hit?'#fff':'#9bc7df';ctx.shadowColor='#a5dfff';ctx.shadowBlur=17;ctx.beginPath();ctx.moveTo(0,-11);ctx.quadraticCurveTo(13,-7,8,7);ctx.quadraticCurveTo(3,14,0,9);ctx.quadraticCurveTo(-6,15,-9,6);ctx.quadraticCurveTo(-14,-7,0,-11);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#3d456a';ctx.fillRect(-4,-2,2,2);ctx.fillRect(3,-2,2,2);
    }else{
      ctx.fillStyle=e.hit?'#f6c2ff':'#5c456b';ctx.strokeStyle='#ba81cc';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-13,9);ctx.quadraticCurveTo(-18,-5,-5,-13);ctx.quadraticCurveTo(1,-19,8,-11);ctx.quadraticCurveTo(17,-4,12,8);ctx.quadraticCurveTo(0,16,-13,9);ctx.fill();ctx.stroke();
      ctx.fillStyle='#d9a5fb';ctx.shadowColor='#d37cff';ctx.shadowBlur=9;ctx.beginPath();ctx.arc(-5,-3,2,0,TAU);ctx.arc(5,-3,2,0,TAU);ctx.fill();ctx.shadowBlur=0;
      ctx.strokeStyle='#a778b5';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-7,11);ctx.lineTo(-11,17);ctx.moveTo(7,11);ctx.lineTo(11,17);ctx.stroke();
    }
    ctx.restore();
    if(e.hp<e.maxHp){ctx.fillStyle='#0b0d19';ctx.fillRect(e.x-e.r,e.y-e.r-8,e.r*2,3);ctx.fillStyle='#e38fbd';ctx.fillRect(e.x-e.r,e.y-e.r-8,e.r*2*clamp(e.hp/e.maxHp,0,1),3);}
  }
  function drawShot(s){
    for(let i=s.trail.length-1;i>=0;i--){let t=s.trail[i];ctx.globalAlpha=.18*(1-i/s.trail.length);ctx.fillStyle='#ff9d67';ctx.beginPath();ctx.arc(t.x,t.y,s.r*(1-i/s.trail.length),0,TAU);ctx.fill();}
    ctx.globalAlpha=1;let grad=ctx.createRadialGradient(s.x,s.y,1,s.x,s.y,12);grad.addColorStop(0,'#fff5ce');grad.addColorStop(.35,'#ffc075');grad.addColorStop(1,'#ff794900');ctx.fillStyle=grad;ctx.beginPath();ctx.arc(s.x,s.y,12,0,TAU);ctx.fill();ctx.fillStyle='#fff0cc';ctx.beginPath();ctx.arc(s.x,s.y,3.4,0,TAU);ctx.fill();
  }
  function drawMeteor(m){
    if(m.delay>0){ctx.globalAlpha=.3+Math.sin(elapsed*10+m.x)*.18;ctx.strokeStyle='#f5c5ff';ctx.setLineDash([2,4]);ctx.beginPath();ctx.arc(m.x,m.y,10,0,TAU);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;return;}
    if(!m.hit){let t=clamp(1-m.fall/.7,0,1),x=m.x+(1-t)*80,y=m.y-(1-t)*135;ctx.save();ctx.globalAlpha=.75;ctx.strokeStyle='#ffce9a';ctx.lineWidth=4;ctx.shadowColor='#f87c54';ctx.shadowBlur=16;ctx.beginPath();ctx.moveTo(x+34,y-55);ctx.lineTo(x,y);ctx.stroke();ctx.fillStyle='#fff0c1';ctx.beginPath();ctx.arc(x,y,6+t*4,0,TAU);ctx.fill();ctx.restore();}
    else{ctx.globalAlpha=clamp(m.life/.5,0,1);const g=ctx.createRadialGradient(m.x,m.y,2,m.x,m.y,75);g.addColorStop(0,'#ffdc9c88');g.addColorStop(.25,'#f088af45');g.addColorStop(1,'#ff8b8000');ctx.fillStyle=g;ctx.beginPath();ctx.arc(m.x,m.y,75,0,TAU);ctx.fill();ctx.globalAlpha=1;}
  }
  function drawPickup(p){ctx.save();ctx.globalAlpha=Math.min(1,p.life);let c=p.type==='heal'?'#94e8c4':'#e9d086';ctx.shadowColor=c;ctx.shadowBlur=12;ctx.fillStyle=c;ctx.translate(p.x,p.y+Math.sin(elapsed*4+p.x)*2);ctx.rotate(Math.PI/4);ctx.fillRect(-4,-4,8,8);ctx.restore();}
  function drawEffect(f){let a=clamp(f.life/(f.maxLife||f.max||1),0,1);ctx.save();if(f.kind==='particle'){ctx.globalAlpha=a;ctx.fillStyle=f.color;ctx.shadowColor=f.color;ctx.shadowBlur=8;ctx.beginPath();ctx.arc(f.x,f.y,f.size*a,0,TAU);ctx.fill();}else if(f.kind==='ring'){ctx.globalAlpha=a*.65;ctx.strokeStyle=f.color;ctx.lineWidth=2*a;ctx.shadowColor=f.color;ctx.shadowBlur=12;ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,TAU);ctx.stroke();}else if(f.kind==='flash'){ctx.globalAlpha=a;ctx.fillStyle=f.color;ctx.shadowColor=f.color;ctx.shadowBlur=16;ctx.beginPath();ctx.arc(f.x,f.y,5*a,0,TAU);ctx.fill();}ctx.restore();}
  function drawMap(){
    const mw=95,mh=68,x=W-mw-16,y=52;ctx.save();ctx.fillStyle='#0b0d1bdc';ctx.strokeStyle='#d2c27d88';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x,y,mw,mh,6);ctx.fill();ctx.stroke();ctx.fillStyle='#8c85b1';for(const e of enemies){ctx.beginPath();ctx.arc(x+e.x/W*mw,y+e.y/H*mh,1.5,0,TAU);ctx.fill();}ctx.fillStyle='#f2d78c';ctx.beginPath();ctx.arc(x+player.x/W*mw,y+player.y/H*mh,2.5,0,TAU);ctx.fill();ctx.restore();
  }
  fresh();
})();
