import Phaser from 'phaser';
import type { DungeonObject, Point } from '../dungeon/model';
import { dungeon, rules, reverseMemory } from './content';
import { physics as config, sideRoom, surfaces, closedGates, safeSidePosition, slots, slotInserted, identityText, scenery } from './sideScroll';
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
 private keys!:Record<string,Phaser.Input.Keyboard.Key>;
 private roomId='';private envKey='';private positionKey='';private nearId='';private facing=1;private lastCheckpoint=0;private lastGrounded=0;private jumpQueued=0;private wasPaused=false;private swapPuppets:Phaser.GameObjects.Image[]=[];
 constructor(bridge:SideBridge){super('PrologueSideScroll');this.bridge=bridge;}
 preload(){
  this.load.image('side-vessel','/assets/prologue/vessel.svg');this.load.image('side-inquisitor','/assets/prologue/inquisitor.svg');
  this.load.image('side-paper',dungeon.art.paper);this.load.image('side-door',dungeon.art.door);
  for(const room of dungeon.rooms)this.load.image(`side-bg-${room.id}`,room.backgroundImage!);
 }
 create(){
  const p=this.bridge.read(),room=dungeon.rooms.find(r=>r.id===p.dungeon.roomId)!;this.roomId=room.id;this.envKey='';this.nearId='';this.stationLabels.clear();this.stationPapers.clear();this.swapPuppets=[];
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
   const label=this.add.text(o.x,410,'',{fontFamily:'Memory Serif, serif',fontSize:'22px',color:'#35282b',align:'center',wordWrap:{width:280},lineSpacing:9}).setOrigin(.5).setDepth(5);this.stationLabels.set(o.id,label);
   this.add.text(o.x,330,o.title,{fontFamily:'Memory Serif, serif',fontSize:'16px',color:'#dac8a2'}).setOrigin(.5).setDepth(4);
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
  this.puppet=this.add.image(180,570,'side-vessel').setDisplaySize(76,130).setDepth(9);
  this.held=this.add.text(0,0,'',{fontFamily:'Memory Serif, serif',fontSize:'18px',color:'#432c31',backgroundColor:'#ead9af',padding:{x:10,y:7}}).setOrigin(.5).setAngle(-6).setDepth(10);
  this.thread=this.add.graphics().setDepth(7);
  const keyboard=this.input.keyboard!;keyboard.disableGlobalCapture();
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
  this.terrain.clear(true,true);this.terrainArt.removeAll(true);
  const addSurface=(r:{x:number;y:number;w:number;h:number},gate=false)=>{
   const box=this.add.rectangle(r.x+r.w/2,r.y+r.h/2,r.w,r.h,0xffffff,0);this.terrain.add(box);
   const g=this.add.graphics();g.fillStyle(gate?0x33232c:0xc9b790,1);
   g.fillPoints([{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w-5,y:r.y+r.h-5},{x:r.x+r.w*.7,y:r.y+r.h-14},{x:r.x+r.w*.4,y:r.y+r.h},{x:r.x+5,y:r.y+r.h-9}],true);
   g.lineStyle(2,gate?0x9b424b:0x6b4e45,1);g.lineBetween(r.x,r.y+6,r.x+r.w,r.y+6);
   for(let x=r.x+10;x<r.x+r.w;x+=22){g.lineStyle(1,0x805b51,.55);g.lineBetween(x,r.y+12,x+6,r.y+20);}
   this.terrainArt.add(g);
   if(!gate)this.terrainArt.add(this.add.tileSprite(r.x+r.w/2,r.y+r.h/2,r.w,r.h,'side-paper').setAlpha(.23));
  };
  for(const r of surfaces(this.roomId,env))addSurface(r);
  for(const gate of closedGates(this.roomId,env)){addSurface(gate,true);this.terrainArt.add(this.add.text(gate.x+gate.w/2,gate.y+35,[...gate.label].join('\n'),{fontFamily:'Memory Serif, serif',fontSize:'28px',color:'#d7b98b',align:'center'}).setOrigin(.5,0));}
  const bridge=sideRoom(this.roomId).bridge;if(bridge&&env.bridge!=='open')this.terrainArt.add(this.add.text(bridge.x+bridge.w/2,650,scenery.abyss,{fontFamily:'Memory Serif, serif',fontSize:'21px',color:'#bca383'}).setOrigin(.5));
  const room=dungeon.rooms.find(r=>r.id===this.roomId)!;
  for(const o of room.objects){
   const slot=slots.find(s=>s.objectId===o.id),rule=slot?rules.find(r=>r.id===slot.ruleId):undefined;
   let text=rule?.options.find(option=>option.value===env[rule.stateKey])?.text??o.text;
   if(o.id==='keyword_cache')text='태양의 신 · 사도\n동료 · 배신 · 공적';
   if(o.id==='identity_belief')text=env.identity==='placed'?identityText.after:identityText.before;
   if(o.id==='altar_seal'&&p.sealFlipped)text=reverseMemory;
   if(o.id==='order_thoughts')text=env.order==='swapped'?scenery.swappedOrder:scenery.originalOrder;
   if(o.id==='identity_judgment'&&env.order==='swapped')text=identityText.before;
   const label=this.stationLabels.get(o.id)!;label.setText(text);
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
 gesture(o:DungeonObject,remove:boolean){
  if(this.bridge.reduced())return;
  const word=this.bridge.word();const token=this.add.text(remove?o.x:this.actor.x+35,remove?410:this.actor.y-30,word?.label??'✂',{fontFamily:'Memory Serif, serif',fontSize:'22px',color:'#802c3f',backgroundColor:'#edddba',padding:{x:8,y:6}}).setOrigin(.5).setDepth(20);
  this.tweens.add({targets:token,x:remove?this.actor.x+35:o.x,y:remove?this.actor.y-30:410,angle:remove?-12:6,alpha:.3,duration:350,onComplete:()=>token.destroy()});
 }
 update(time:number){
  if(!this.actor)return;
  const p=this.bridge.read();if(p.dungeon.roomId!==this.roomId){this.bridge.nearby(null);this.scene.restart();return;}
  if(this.envKey!==JSON.stringify([p.environment,p.sealFlipped]))this.refresh();
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
  const bob=!this.bridge.reduced()&&axis&&body.blocked.down?Math.round(Math.sin(time/100)*2)*2:0;
  this.puppet.setPosition(this.actor.x,this.actor.y-15+bob).setFlipX(this.facing<0).setAngle(axis&&!this.bridge.reduced()?this.facing*3:0);
  const word=this.bridge.word();this.held.setText(word?.label??'').setVisible(!!word).setPosition(this.actor.x+this.facing*48,this.actor.y-28);
  const room=dungeon.rooms.find(r=>r.id===this.roomId)!;
  const nearby=room.objects.filter(o=>Math.hypot(o.x-this.actor.x,o.y-this.actor.y)<=dungeon.rules.interactionRadius).sort((a,b)=>Math.abs(a.x-this.actor.x)-Math.abs(b.x-this.actor.x))[0]??null;
  if((nearby?.id??'')!==this.nearId){this.nearId=nearby?.id??'';this.bridge.nearby(nearby);}
  this.thread.clear();if(nearby){this.thread.lineStyle(2,0xb54f5d,.75);this.thread.lineBetween(this.actor.x+this.facing*30,this.actor.y-20,nearby.x,455);}
  const remove=Phaser.Input.Keyboard.JustDown(this.keys.R),use=Phaser.Input.Keyboard.JustDown(this.keys.E);
  if(nearby&&(use||remove))this.bridge.interact(nearby,this.position(),remove);
  if(time-this.lastCheckpoint>2500&&body.blocked.down){this.lastCheckpoint=time;this.bridge.checkpoint(this.position());}
 }
}
