import Phaser from 'phaser';
import type { DungeonObject, Point } from '../dungeon/model';
import { dungeon, rules, reverseMemory, resistanceTexts } from './content';
import { physics as config, sideRoom, surfaces, closedGates, safeSidePosition, slots, slotInserted, scenery, puppetArt, stageObject, thoughtText } from './sideScroll';
import type { PrologueState } from './store';
export interface SideBridge {
 read:()=>PrologueState; paused:()=>boolean; reduced:()=>boolean; word:()=>{id:string;label:string}|null;
 interact:(o:DungeonObject,p:Point,remove:boolean)=>void; nearby:(o:DungeonObject|null)=>void;
 checkpoint:(p:Point)=>void; fall:()=>void; ready:()=>void;
}
/** Only traversal and presentation live here; all text edits go through the store. */
export class SideScrollScene extends Phaser.Scene {
 private bridge:SideBridge;
 private actor!:Phaser.GameObjects.Rectangle;
 private puppet!:Phaser.GameObjects.Image;
 private held!:Phaser.GameObjects.Text;
 private thread!:Phaser.GameObjects.Graphics;
 private terrain!:Phaser.Physics.Arcade.StaticGroup;
 private terrainArt!:Phaser.GameObjects.Container;
 private stationLabels=new Map<string,Phaser.GameObjects.Text>();
 private stationPapers=new Map<string,Phaser.GameObjects.Graphics>();
 private stationTitles=new Map<string,Phaser.GameObjects.Text>();
 private effectKey='';private folding=false;private bridgeOpen=false;
 private keys!:Record<string,Phaser.Input.Keyboard.Key>;
 private roomId='';private envKey='';private positionKey='';private nearId='';private facing=1;private lastCheckpoint=0;private lastGrounded=0;private jumpQueued=0;private wasPaused=false;private swapPuppets:Phaser.GameObjects.Image[]=[];
 constructor(bridge:SideBridge){super('PrologueSideScroll');this.bridge=bridge;}
 preload(){
  this.load.image('side-vessel','/assets/prologue/vessel.svg');this.load.image('side-inquisitor','/assets/prologue/inquisitor.svg');
  this.load.image('side-paper',dungeon.art.paper);this.load.image('side-door',dungeon.art.door);
  this.load.image('side-hand','/assets/prologue/hand.svg');
  for(const room of dungeon.rooms)this.load.image(`side-bg-${room.id}`,room.backgroundImage!);
 }
 create(){
  const p=this.bridge.read(),room=dungeon.rooms.find(r=>r.id===p.dungeon.roomId)!;this.roomId=room.id;this.envKey='';this.nearId='';this.effectKey='';this.folding=false;this.bridgeOpen=p.environment.bridge==='open';this.stationLabels.clear();this.stationPapers.clear();this.stationTitles.clear();this.swapPuppets=[];
  this.physics.world.setBounds(62,70,room.width-124,850);
  const bg=this.add.image(640,360,`side-bg-${room.id}`).setDisplaySize(1280,720).setScrollFactor(0).setAlpha(.5);
  bg.setTint(room.id==='chapel'?0xddd2b6:0xb7a99e);
  this.add.rectangle(640,360,1280,720,0x17111c,.28).setScrollFactor(0);
  const decor=this.add.graphics();decor.setScrollFactor(.35);decor.lineStyle(2,0xbba77e,.5);
  for(let x=30;x<room.width;x+=145){decor.lineBetween(x,0,x+24,145+(x%73));decor.fillStyle(x%2?0x832e43:0xbba77e,.55);decor.fillTriangle(x+8,145,x+38,145,x+23,178);decor.lineStyle(1,0xe0d2ad,.3);decor.strokeCircle(x+23,120,19);}
  this.add.text(80,110,room.subtitle,{fontFamily:'Memory Serif, serif',fontSize:'20px',color:'#c0a98d',letterSpacing:5}).setScrollFactor(.2);
  const backgroundVerse=this.add.text(260,205,room.id==='altar'?scenery.altarCaption:scenery.caption,{fontFamily:'Memory Serif, serif',fontSize:'38px',color:'#e0d0ae'}).setAlpha(.16).setScrollFactor(.45);
  backgroundVerse.setAngle(-3);
  this.terrainArt=this.add.container(0,0).setDepth(2);this.terrain=this.physics.add.staticGroup();
  for(const o of room.objects){
   if(o.kind==='door'||o.id==='final_threshold')this.add.image(o.x,510,'side-door').setDisplaySize(110,210).setAlpha(.85).setDepth(3);
   const paper=this.add.graphics().setDepth(4);this.stationPapers.set(o.id,paper);
   const label=this.add.text(o.x,410,'',{fontFamily:'Memory Serif, serif',fontSize:'26px',color:'#35282b',align:'center',wordWrap:{width:282},lineSpacing:7}).setOrigin(.5).setDepth(5);this.stationLabels.set(o.id,label);
   this.stationTitles.set(o.id,this.add.text(o.x,320,o.title,{fontFamily:'Memory Serif, serif',fontSize:'20px',color:'#dac8a2'}).setOrigin(.5).setDepth(4));
   if(!['keyword_cache','sealed_belief'].includes(o.id))this.add.line(0,0,o.x,463,o.x,590,0xaa4b4b,.65).setOrigin(0).setDepth(3);
  }
  if(room.id==='betrayal'||room.id==='altar')for(let i=0;i<2;i++){
   const x=room.id==='betrayal'?1990+i*120:1000+i*180;
   this.add.line(0,0,x,0,x,170,0xe8d4a6,.65).setOrigin(0);
   this.swapPuppets.push(this.add.image(x,240,'side-inquisitor').setDisplaySize(80,180).setAngle(i?12:-9).setAlpha(.7));
  }
  this.actor=this.add.rectangle(180,570,config.bodyWidth,config.bodyHeight,0xffffff,0).setDepth(8);
  this.physics.add.existing(this.actor);const body=this.body();body.setCollideWorldBounds(true);body.setGravityY(config.gravity);body.setMaxVelocity(300,700);
  this.physics.add.collider(this.actor,this.terrain);
  this.puppet=this.add.image(180,570,'side-vessel').setDisplaySize(puppetArt.width,puppetArt.height).setOrigin(.5,puppetArt.footY/puppetArt.sourceHeight).setDepth(9);
  this.held=this.add.text(0,0,'',{fontFamily:'Memory Serif, serif',fontSize:'18px',color:'#432c31',backgroundColor:'#ead9af',padding:{x:10,y:7}}).setOrigin(.5).setAngle(-6).setDepth(10);
  this.thread=this.add.graphics().setDepth(7);
  const keyboard=this.input.keyboard!;
  this.keys=keyboard.addKeys('A,D,LEFT,RIGHT,SPACE,E,R') as Record<string,Phaser.Input.Keyboard.Key>;
  this.cameras.main.setBounds(0,0,room.width,720);this.cameras.main.startFollow(this.actor,true,1,1);this.cameras.main.setDeadzone(300,720);
  this.refresh();this.teleport(safeSidePosition(p.dungeon.position,room.id,p.environment));this.positionKey=this.savedKey();
  this.bridge.ready();
 }
 private body(){return this.actor.body as Phaser.Physics.Arcade.Body;}
 private savedKey(){const d=this.bridge.read().dungeon;return `${d.roomId}:${d.position.x}:${d.position.y}`;}
 position():Point{return this.actor?{x:this.actor.x,y:this.actor.y}:this.bridge.read().dungeon.position;}
 private teleport(p:Point){this.body().reset(p.x,p.y);}
 private refresh(){
  const p=this.bridge.read(),env=p.environment;this.envKey=JSON.stringify([env,p.sealFlipped]);
  const unfolding=env.bridge==='open'&&!this.bridgeOpen;this.bridgeOpen=env.bridge==='open';
  this.terrain.clear(true,true);this.terrainArt.removeAll(true);
  const addSurface=(r:{x:number;y:number;w:number;h:number},gate=false)=>{
   const box=this.add.rectangle(r.x+r.w/2,r.y+r.h/2,r.w,r.h,0xffffff,0);this.terrain.add(box);
   const piece=this.add.container(r.x,r.y);this.terrainArt.add(piece);
   const g=this.add.graphics({x:-r.x,y:-r.y});g.fillStyle(gate?0x33232c:0xc9b790,1);
   g.fillPoints([{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w-5,y:r.y+r.h-5},{x:r.x+r.w*.7,y:r.y+r.h-14},{x:r.x+r.w*.4,y:r.y+r.h},{x:r.x+5,y:r.y+r.h-9}],true);
   g.lineStyle(2,gate?0x9b424b:0x6b4e45,1);g.lineBetween(r.x,r.y+6,r.x+r.w,r.y+6);
   for(let x=r.x+10;x<r.x+r.w;x+=22){g.lineStyle(1,0x805b51,.55);g.lineBetween(x,r.y+12,x+6,r.y+20);}
   piece.add(g);
   if(!gate)piece.add(this.add.tileSprite(r.w/2,r.h/2,r.w,r.h,'side-paper').setAlpha(.23));
   if(unfolding&&r===sideRoom(this.roomId).bridge&&!this.bridge.reduced()){piece.setScale(.02,1);this.tweens.add({targets:piece,scaleX:1,duration:450,ease:'Stepped',easeParams:[5]});}
  };
  for(const r of surfaces(this.roomId,env))addSurface(r);
  for(const gate of closedGates(this.roomId,env)){addSurface(gate,true);this.terrainArt.add(this.add.text(gate.x+gate.w/2,gate.y+35,[...gate.label].join('\n'),{fontFamily:'Memory Serif, serif',fontSize:gate.key==='punctuation'?'100px':'32px',color:'#f0d5a6',align:'center'}).setOrigin(.5,0));}
  const bridge=sideRoom(this.roomId).bridge;if(bridge&&env.bridge!=='open')this.terrainArt.add(this.add.text(bridge.x+bridge.w/2,650,scenery.abyss,{fontFamily:'Memory Serif, serif',fontSize:'21px',color:'#bca383'}).setOrigin(.5));
  if(bridge&&env.bridge==='open'){
   const underline=this.add.graphics();underline.lineStyle(3,0xf0d5a6,1);underline.lineBetween(bridge.x,bridge.y,bridge.x+bridge.w,bridge.y);
   this.terrainArt.add(underline);
   const sentence=rules.find(r=>r.id==='bridge_rule')!.options.find(o=>o.value==='open')!.text;
   this.terrainArt.add(this.add.text(bridge.x+bridge.w/2,bridge.y+4,sentence,{fontFamily:'Memory Serif, serif',fontSize:'18px',color:'#4b2932'}).setOrigin(.5,0));
  }
  const room=dungeon.rooms.find(r=>r.id===this.roomId)!;
  for(const source of room.objects){
   const o=stageObject(source,env);
   const slot=slots.find(s=>s.objectId===o.id),rule=slot?rules.find(r=>r.id===slot.ruleId):undefined;
   let text=rule?.options.find(option=>option.value===env[rule.stateKey])?.text??o.text;
   if(o.id==='keyword_cache')text='태양의 신 · 사도\n동료 · 배신 · 공적';
   if(['identity_belief','identity_judgment'].includes(o.id))text=thoughtText(o.id,env);
   if(o.id==='altar_seal'&&p.sealFlipped)text=p.cue?.id==='seal'?o.text:reverseMemory;
   if(o.id==='order_thoughts')text=env.order==='swapped'?scenery.swappedOrder:scenery.originalOrder;
   const label=this.stationLabels.get(o.id)!;label.setText(text).setX(o.x);
   this.stationTitles.get(o.id)!.setX(o.x);
   const inserted=slot?slotInserted(slot,env):o.id==='identity_belief'&&env.identity==='placed';
   label.setColor(inserted?'#812e3e':'#35282b').setAlpha(o.id==='format_wall'&&env.wall==='crossed'?.45:1);
   const g=this.stationPapers.get(o.id)!;g.clear();g.fillStyle(inserted?0xe4cba3:0xe4dac0,.97);
   const w=310,h=Math.max(86,label.height+25),x=o.x-w/2,y=410-h/2;
   g.fillPoints([{x,y:y+7},{x:x+60,y},{x:x+w,y:y+3},{x:x+w-4,y:y+h-11},{x:x+w-24,y:y+h},{x:x+12,y:y+h-4}],true);
   g.lineStyle(1,inserted?0xa73749:0x8a7463,.8);g.strokeRect(x+9,y+12,w-18,h-24);
   if(o.id==='format_wall'&&env.wall==='crossed'){g.lineStyle(2,0x913d47,.7);g.lineBetween(o.x-55,410,o.x+55,410);}
   if(inserted){g.lineStyle(2,0x9e3644);for(let dx=14;dx<w-12;dx+=18)g.lineBetween(x+dx,y+h-8,x+dx+5,y+h-16);}
  }
  if(this.roomId==='altar')this.swapPuppets.forEach((puppet,i)=>puppet.setX(env.order==='swapped'?1180-i*180:1000+i*180).setTint(env.order==='swapped'?0xbc9a88:0xf4dc9a));
 }
 gesture(o:DungeonObject,remove:boolean,text:string){
  if(this.bridge.reduced())return;
  const token=this.add.text(remove?o.x:this.actor.x+35,remove?410:this.actor.y-30,text,{fontFamily:'Memory Serif, serif',fontSize:'26px',color:'#802c3f',backgroundColor:'#edddba',padding:{x:8,y:6}}).setOrigin(.5).setDepth(20);
  this.tweens.add({targets:token,x:remove?this.actor.x+35:o.x,y:remove?this.actor.y-30:410,angle:remove?-12:6,alpha:.3,duration:350,onComplete:()=>token.destroy()});
  const label=this.stationLabels.get(o.id);if(label)this.tweens.add({targets:label,alpha:.25,duration:90,yoyo:true,repeat:2,onComplete:()=>label.setAlpha(1)});
  const slot=slots.find(s=>s.objectId===o.id),rule=rules.find(r=>r.id===slot?.ruleId),gate=sideRoom(this.roomId).gates.find(g=>g.key===rule?.stateKey);
  if(gate&&!closedGates(this.roomId,this.bridge.read().environment).some(g=>g.key===gate.key))for(let i=0;i<5;i++){
   const scrap=this.add.rectangle(gate.x+gate.w/2,gate.y+i*gate.h/5,gate.w,gate.h/5,0x4a2938).setDepth(7);
   this.tweens.add({targets:scrap,x:scrap.x+(i%2?60:-60),y:scrap.y+90,angle:i%2?35:-35,alpha:0,duration:450,onComplete:()=>scrap.destroy()});
  }
 }
 private cueEffect(){
  const p=this.bridge.read(),key=JSON.stringify([p.cue?.id,p.sealFlipped,p.environment.identity,p.environment.seal]);if(key===this.effectKey)return;
  const previous=this.effectKey;this.effectKey=key;if(!previous||this.bridge.reduced())return;
  if(p.sealFlipped&&p.cue?.id!=='seal'){
   const label=this.stationLabels.get('altar_seal'),source=dungeon.rooms.find(r=>r.id==='chapel')!.objects.find(o=>o.id==='altar_seal')!;
   if(label){label.setScale(0,1);const front=this.add.text(source.x,410,source.text,{fontFamily:'Memory Serif, serif',fontSize:'26px',color:'#35282b',backgroundColor:'#e4dac0',wordWrap:{width:282},padding:{x:12,y:12}}).setOrigin(.5).setDepth(6);
    this.tweens.add({targets:front,scaleX:0,duration:180,onComplete:()=>{front.destroy();this.tweens.add({targets:label,scaleX:1,duration:180});}});
   }
  }
  if(p.cue?.id==='seal'||p.cue?.id==='resistance'){
   const source=dungeon.rooms.find(r=>r.id===this.roomId)!.objects.find(o=>o.id===(p.cue?.id==='seal'?'altar_seal':'identity_belief'))!;
   const o=stageObject(source,p.environment);
   if(p.cue.id==='seal')this.time.delayedCall(650,()=>{if(this.bridge.read().cue?.id==='seal')this.stationLabels.get('altar_seal')?.setText(source.text);});
   if(this.textures.exists('side-hand')){const hand=this.add.image(o.x+260,180,'side-hand').setDisplaySize(380,300).setDepth(22);this.tweens.add({targets:hand,x:o.x+60,y:340,duration:650,ease:'Stepped',easeParams:[5],yoyo:true,hold:1100,onComplete:()=>hand.destroy()});}
   if(p.cue.id==='resistance')for(const [i,text] of resistanceTexts.entries()){
    const ink=this.add.text(o.x-260+i*130,220+(i%2)*70,text,{fontFamily:'Memory Serif, serif',fontSize:'30px',color:'#e6a09a',backgroundColor:'#21151d'}).setDepth(21);
    this.tweens.add({targets:ink,alpha:0,angle:i%2?8:-8,y:ink.y+80,delay:900+i*100,duration:700,onComplete:()=>ink.destroy()});
   }
  }
 }
 collapse(done:()=>void){
  if(this.folding)return;this.folding=true;this.physics.world.pause();this.body().setVelocity(0);
  if(this.bridge.reduced()){done();return;}
  const pieces=[this.terrainArt,...this.stationLabels.values(),...this.stationPapers.values(),...this.stationTitles.values(),...this.swapPuppets,this.puppet,this.held];
  pieces.forEach((piece,i)=>this.tweens.add({targets:piece,scaleY:.02,alpha:0,angle:i%2?8:-8,delay:i*12,duration:650,ease:'Cubic.easeIn'}));
  this.cameras.main.fadeOut(1000,12,10,18);this.time.delayedCall(1100,done);
 }
 update(time:number){
  if(!this.actor||this.folding)return;
  const p=this.bridge.read();if(p.dungeon.roomId!==this.roomId){this.bridge.nearby(null);this.scene.restart();return;}
  if(this.envKey!==JSON.stringify([p.environment,p.sealFlipped]))this.refresh();
  this.cueEffect();
  if(this.positionKey!==this.savedKey()){this.positionKey=this.savedKey();this.teleport(safeSidePosition(p.dungeon.position,this.roomId,p.environment));}
  const paused=this.bridge.paused(),body=this.body();
  if(paused){this.physics.world.pause();body.setVelocity(0);this.wasPaused=true;return;}
  if(this.wasPaused){Object.values(this.keys).forEach(k=>k.reset());this.jumpQueued=0;this.wasPaused=false;}
  this.physics.world.resume();
  const left=this.keys.A.isDown||this.keys.LEFT.isDown,right=this.keys.D.isDown||this.keys.RIGHT.isDown,axis=Number(right)-Number(left);
  body.setVelocityX(axis*config.speed);if(axis)this.facing=axis;
  if(body.blocked.down)this.lastGrounded=time;
  if(Phaser.Input.Keyboard.JustDown(this.keys.SPACE))this.jumpQueued=time;
  if(this.jumpQueued>0&&time-this.jumpQueued<120&&time-this.lastGrounded<100){body.setVelocityY(-config.jumpSpeed);this.jumpQueued=0;this.lastGrounded=-1000;}
  if(this.actor.y>805){this.bridge.fall();const state=this.bridge.read();this.teleport(safeSidePosition(state.dungeon.position,this.roomId,state.environment));return;}
  this.puppet.setPosition(this.actor.x,body.bottom).setFlipX(this.facing<0).setAngle(axis&&!this.bridge.reduced()?this.facing*3:0);
  const word=this.bridge.word();this.held.setText(word?.label??'').setVisible(!!word).setPosition(this.actor.x+this.facing*48,this.actor.y-28);
  const room=dungeon.rooms.find(r=>r.id===this.roomId)!;
  const nearby=room.objects.map(o=>stageObject(o,p.environment)).filter(o=>Math.hypot(o.x-this.actor.x,o.y-this.actor.y)<=dungeon.rules.interactionRadius).sort((a,b)=>Math.abs(a.x-this.actor.x)-Math.abs(b.x-this.actor.x))[0]??null;
  if((nearby?.id??'')!==this.nearId){this.nearId=nearby?.id??'';this.bridge.nearby(nearby);}
  this.thread.clear();if(nearby){this.thread.lineStyle(2,0xb54f5d,.75);this.thread.lineBetween(this.actor.x+this.facing*30,this.actor.y-20,nearby.x,455);}
  const remove=Phaser.Input.Keyboard.JustDown(this.keys.R),use=Phaser.Input.Keyboard.JustDown(this.keys.E);
  if(nearby&&(use||remove))this.bridge.interact(nearby,this.position(),remove);
  if(time-this.lastCheckpoint>2500&&body.blocked.down&&body.velocity.y===0){this.lastCheckpoint=time;this.bridge.checkpoint(this.position());}
 }
}
