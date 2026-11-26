import {ChapelLayer} from './ChapelLayer';
import Phaser from 'phaser';
import type { DungeonObject, Point } from '../dungeon/model';
import { dungeon, reverseMemory } from './content';
import { physics as config, sideRoom, surfaces, closedGates, safeSidePosition, puppetArt, slots } from './sideScroll';
import { CorridorLayer } from './CorridorLayer';
import type { CorridorSlot } from './corridor';
import { StrikeLayer } from './StrikeLayer';
import { readRealm, roomEnvironment, strikeRoom } from './strikes';
import type { InkStroke, InkRoom, Realm } from './strikes';
import type { PrologueState } from './store';
export interface SideBridge {
 read:()=>PrologueState;paused:()=>boolean;reduced:()=>boolean;
 interact:(o:DungeonObject,p:Point)=>void;nearby:(o:DungeonObject|null)=>void;
 corridor:(slot:CorridorSlot,remove:boolean,position:Point)=>void;
 edit:(stroke:InkStroke|null,position:Point)=>void;preview:(realm:Realm|undefined)=>void;
 checkpoint:(p:Point)=>void;fall:()=>void;ready:()=>void;
}
/** Physics and live staging only. Ink coverage and persistent effects belong to the domain/store. */
export class SideScrollScene extends Phaser.Scene {
 private bridge:SideBridge;
 private actor!:Phaser.GameObjects.Rectangle;private puppet!:Phaser.GameObjects.Image;
 private terrain!:Phaser.Physics.Arcade.StaticGroup;private terrainArt!:Phaser.GameObjects.Container;
 private keys!:Record<string,Phaser.Input.Keyboard.Key>;private inkLayer?:StrikeLayer;private corridorLayer?:CorridorLayer;
 private subject!:Phaser.GameObjects.Image;private subjectShadow!:Phaser.GameObjects.Image;private strings!:Phaser.GameObjects.Graphics;private shade!:Phaser.GameObjects.Rectangle;
 private companions:Phaser.GameObjects.Image[]=[];private truth!:Phaser.GameObjects.Text;
 private roomId='';private envKey='';private positionKey='';private nearId='';private facing=1;private lastCheckpoint=0;private lastGrounded=0;private jumpQueued=0;private wasPaused=false;private folding=false;private oldCanceled:string[]=[];
 private chapelLayer?:ChapelLayer;private lastCue='';
 constructor(bridge:SideBridge){super('PrologueSideScroll');this.bridge=bridge;}
 preload(){
  this.load.image('side-skull','/assets/prologue/skull-bone.svg');this.load.image('side-vessel','/assets/prologue/vessel.svg');this.load.image('side-inquisitor','/assets/prologue/inquisitor.svg');
  this.load.image('side-paper',dungeon.art.paper);this.load.image('side-door',dungeon.art.door);this.load.image('side-hand','/assets/prologue/hand.svg');
  for(const room of dungeon.rooms)this.load.image(`side-bg-${room.id}`,room.backgroundImage!);
 }
 private objects(){if(this.roomId==='chapel')return dungeon.rooms[1].objects.filter(o=>['back_betrayal','chapel_memory','chapel_slot','to_altar'].includes(o.id));if(this.roomId==='betrayal')return dungeon.rooms[0].objects.filter(o=>['trust_bridge','betrayal_memory','betrayal_door','to_chapel'].includes(o.id));return dungeon.rooms.find(r=>r.id===this.roomId)!.objects.filter(o=>!slots.some(s=>s.objectId===o.id)&&!['identity_belief','identity_judgment','sealed_belief'].includes(o.id));}
 create(){
  const p=this.bridge.read(),room=dungeon.rooms.find(r=>r.id===p.dungeon.roomId)!;
  this.roomId=room.id;this.envKey='';this.nearId='';this.folding=false;this.oldCanceled=[];this.companions=[];this.lastCue='';
  this.inkLayer=undefined;this.corridorLayer=undefined;this.chapelLayer=undefined;
  this.physics.world.setBounds(62,70,room.width-124,850);
  this.add.image(640,360,`side-bg-${room.id}`).setDisplaySize(1280,720).setScrollFactor(0).setAlpha(.7);
  this.shade=this.add.rectangle(640,360,1280,720,0x100d21,1).setScrollFactor(0).setDepth(1);
  this.terrainArt=this.add.container(0,0).setDepth(2);this.terrain=this.physics.add.staticGroup();
  for(const o of this.roomId==='betrayal'?[]:this.objects()){
   if(o.kind==='door'||o.id==='final_threshold')this.add.image(o.x,this.roomId==='chapel'?o.y-60:510,'side-door').setDisplaySize(110,210).setAlpha(.8).setDepth(3);
   if(this.roomId!=='chapel'||o.kind==='door')this.add.text(o.x,this.roomId==='chapel'?o.y-125:440,o.title,{fontFamily:'Memory Serif, serif',fontSize:'21px',color:'#ead5ab',align:'center',wordWrap:{width:220},backgroundColor:'#251b29',padding:{x:12,y:9}}).setOrigin(.5).setDepth(4);
  }

  this.subjectShadow=this.add.image(1150,478,'side-inquisitor').setDisplaySize(125,212).setTint(0x120e20).setAlpha(.7).setScrollFactor(0).setDepth(6);
  this.subject=this.add.image(1138,470,'side-inquisitor').setDisplaySize(120,204).setScrollFactor(0).setDepth(7);
  this.strings=this.add.graphics().setScrollFactor(0).setDepth(6);
  this.truth=this.add.text(680,410,reverseMemory,{fontFamily:'Memory Serif, serif',fontSize:'29px',color:'#efe2c3',backgroundColor:'#2c2437',padding:{x:16,y:10}}).setOrigin(.5).setScrollFactor(0).setDepth(6).setVisible(false);
  this.actor=this.add.rectangle(180,570,config.bodyWidth,config.bodyHeight,0xffffff,0).setDepth(8);this.physics.add.existing(this.actor);
  const body=this.body();body.setCollideWorldBounds(true);body.setGravityY(config.gravity);body.setMaxVelocity(300,700);this.physics.add.collider(this.actor,this.terrain);
  this.puppet=this.add.image(180,570,'side-vessel').setDisplaySize(puppetArt.width,puppetArt.height).setOrigin(.5,puppetArt.footY/puppetArt.sourceHeight).setDepth(9);
  this.keys=this.input.keyboard!.addKeys('A,D,LEFT,RIGHT,SPACE,E') as Record<string,Phaser.Input.Keyboard.Key>;
  this.cameras.main.setBounds(0,0,room.width,720);this.cameras.main.startFollow(this.actor,true,1,1);this.cameras.main.setDeadzone(300,720);
  if(room.id==='betrayal'){this.corridorLayer=new CorridorLayer(this,{read:this.bridge.read,position:()=>this.position(),paused:this.bridge.paused,reduced:this.bridge.reduced,insert:this.bridge.corridor});this.subject.setVisible(false);this.subjectShadow.setVisible(false);this.strings.setVisible(false);}
  else this.inkLayer=new StrikeLayer(this,room.id,{read:this.bridge.read,position:()=>this.position(),suspended:this.bridge.paused,commit:s=>this.bridge.edit(s,this.position()),preview:this.bridge.preview});
  if(room.id==='chapel'){this.subject.setVisible(false);this.subjectShadow.setVisible(false);this.strings.setVisible(false);this.truth.setVisible(false);this.chapelLayer=new ChapelLayer(this,this.bridge.read,()=>this.view().realm,id=>{if(!this.bridge.paused()){const o=this.objects().find(o=>o.id===id);if(o)this.bridge.interact(o,this.position());}},this.bridge.reduced);}
  this.refresh();this.teleport(safeSidePosition(p.dungeon.position,room.id,roomEnvironment(room.id,p.ink,p.environment,p.corridor,p.chapel)));this.positionKey=this.savedKey();if(room.id==='betrayal')this.cameras.main.setScroll(Math.max(0,p.dungeon.position.x-490),0);this.bridge.ready();
 }
 private body(){return this.actor.body as Phaser.Physics.Arcade.Body;}
 private savedKey(){const d=this.bridge.read().dungeon;return `${d.roomId}:${d.position.x}:${d.position.y}`;}
 position():Point{return this.actor?{x:this.actor.x,y:this.actor.y}:this.bridge.read().dungeon.position;}
 private teleport(p:Point){this.body().reset(p.x,p.y);}
 cancelInk(){this.inkLayer?.cancelEdit();}
 dropCorridor(x:number,y:number){return this.corridorLayer?.drop(x,y)??null;}
 dropChapel(clientX:number,clientY:number){
  if(this.roomId!=='chapel'||this.bridge.paused()||this.inkLayer?.editing)return false;
  const rect=this.game.canvas.getBoundingClientRect(),p=this.cameras.main.getWorldPoint((clientX-rect.left)*1280/rect.width,(clientY-rect.top)*720/rect.height),word=strikeRoom('chapel').words.find(w=>w.id==='c_light1')!;
  return p.x>=word.x-12&&p.x<=word.x+word.w+12&&Math.abs(p.y-word.y)<35;
 }
 rejectWord(word:string){this.corridorLayer?.reject(word);}
 removeCorridor(){this.corridorLayer?.remove();}
 beginInk(){this.inkLayer?.beginKeyboard();}resetInk(){this.inkLayer?.reset();}
 private view(){
  const p=this.bridge.read(),ink=this.inkLayer?.draft?{...p.ink,[this.roomId]:this.inkLayer.draft}:p.ink;
  return {p,ink,realm:readRealm(this.roomId,ink[this.roomId as InkRoom],p.environment.identity,p.chapel),env:roomEnvironment(this.roomId,ink,p.environment,p.corridor,p.chapel)};
 }
 private refresh(){
  const {p,realm,env}=this.view();this.envKey=JSON.stringify([env,realm.canceled,p.cue?.id,p.corridor,p.chapel]);
  this.terrain.clear(true,true);this.terrainArt.removeAll(true);
  const addSurface=(r:{x:number;y:number;w:number;h:number},gate=false)=>{
   this.terrain.add(this.add.rectangle(r.x+r.w/2,r.y+r.h/2,r.w,r.h,0xffffff,0));
   if(this.roomId==='betrayal'&&r.x===900&&r.w===340)return;
   const g=this.add.graphics();g.fillStyle(gate?0x693449:0xd6c39d,1);
   g.fillPoints([{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w-5,y:r.y+r.h-5},{x:r.x+r.w*.7,y:r.y+r.h-14},{x:r.x+r.w*.4,y:r.y+r.h},{x:r.x+5,y:r.y+r.h-9}],true);
   if(this.roomId==='chapel'&&!this.bridge.reduced()) {g.setAlpha(0);this.tweens.add({targets:g,alpha:1,duration:300});}
   g.lineStyle(3,gate?0xc9667a:0xf1ddaf);g.lineBetween(r.x,r.y+3,r.x+r.w,r.y+3);this.terrainArt.add(g);
   if(!gate)this.terrainArt.add(this.add.tileSprite(r.x+r.w/2,r.y+r.h/2,r.w,r.h,'side-paper').setAlpha(.32));
  };
  for(const r of surfaces(this.roomId,env))addSurface(r);
  for(const gate of closedGates(this.roomId,env)){
   addSurface(gate,true);this.terrainArt.add(this.add.text(gate.x+gate.w/2,gate.y+18,[...gate.label].join('\n'),{fontFamily:'Memory Serif, serif',fontSize:'26px',color:'#f2ddbc'}).setOrigin(.5,0));
  }
  const bridge=sideRoom(this.roomId).bridge;
  if(this.roomId!=='betrayal'&&bridge&&!realm.bridgeSolid){
   const ghost=this.add.rectangle(bridge.x+bridge.w/2,bridge.y+25,bridge.w,22,0xccb997,realm.bridgePresent?.28:.07).setAngle(realm.bridgePresent?8:0);this.terrainArt.add(ghost);
   const seams=this.add.graphics();seams.lineStyle(2,0xc0a784,.5);seams.lineBetween(bridge.x,bridge.y-20,bridge.x+24,bridge.y+45);seams.lineBetween(bridge.x+bridge.w,bridge.y-20,bridge.x+bridge.w-24,bridge.y+45);this.terrainArt.add(seams);
  }
  if(this.roomId==='betrayal'){this.shade.setAlpha(.6);return;}
  if(this.roomId==='chapel'){
   if(realm.lightOn){const light=this.add.graphics();light.fillStyle(0xeccc7a,.17);light.fillTriangle(740,90,580,620,1390,620);light.fillStyle(0xffdf8d,.9);light.fillCircle(740,95,17);this.terrainArt.add(light);}

  }
  if(this.roomId==='chapel'){this.shade.setAlpha(realm.lightOn?.24:.78);return;}
  this.shade.setAlpha(realm.lightOn?.24:.78);this.truth.setVisible(this.roomId==='chapel'&&!realm.lightOn);
  for(const companion of this.companions)companion.setAlpha(realm.companionPresent?.75:.08).setTint(realm.companionPresent?0xe0c88a:0x595063);
  this.subject.setAlpha(realm.selfPresent?1:.12).setTint(realm.mood==='rewritten'?0xd7a1ba:realm.mood==='doubt'?0xaaa3bd:0xffffff).setAngle(!realm.selfPresent?18:realm.bound?-9:0);
  this.subjectShadow.setAlpha(realm.selfPresent?.65:.06).setAngle(realm.bound?-9:0);
  this.strings.clear();if(realm.bound){this.strings.lineStyle(2,realm.mood==='rewritten'?0xb9426c:0xc3af91,.6);for(let i=0;i<3;i++)this.strings.lineBetween(1106+i*30,0,1115+i*26,375);}
  if(realm.mood==='rewritten'){this.strings.fillStyle(0xe4507c,.85);this.strings.fillCircle(1137,409,5);this.strings.fillCircle(1150,409,5);}
  if(this.envKey&&JSON.stringify(realm.canceled)!==JSON.stringify(this.oldCanceled)&&!this.bridge.reduced()){
   const changed=strikeRoom(this.roomId).words.find(w=>realm.canceled.includes(w.id)!==this.oldCanceled.includes(w.id));
   if(changed){const spark=this.add.circle(changed.x+changed.w/2-this.cameras.main.scrollX,changed.y,7,0xe67d99).setScrollFactor(0).setDepth(40);this.tweens.add({targets:spark,x:1138,y:420,duration:420,onComplete:()=>spark.destroy()});}
  }
  this.oldCanceled=[...realm.canceled];
  const cue=p.cue?.id??'';
  if(cue!==this.lastCue&&['seal','resistance'].includes(cue)){
   const hand=this.add.image(1220,this.bridge.reduced()?250:-180,'side-hand').setDisplaySize(370,410).setScrollFactor(0).setDepth(45).setAngle(-16).setAlpha(.85);
   if(this.bridge.reduced())this.time.delayedCall(1200,()=>hand.destroy());
   else this.tweens.add({targets:hand,y:250,duration:650,hold:400,yoyo:true,ease:'Cubic.easeInOut',onComplete:()=>hand.destroy()});
  }
  this.lastCue=cue;
 }
 collapse(done:()=>void){
  if(this.folding)return;this.folding=true;this.physics.world.pause();this.body().setVelocity(0);if(this.bridge.reduced()){done();return;}
  const pieces=this.children.list.filter(o=>'scaleY' in o&&'alpha' in o);
  pieces.forEach((piece,i)=>this.tweens.add({targets:piece,scaleY:.02,alpha:0,delay:i*6,duration:620,ease:'Cubic.easeIn'}));
  this.cameras.main.fadeOut(1050,12,10,18);this.time.delayedCall(1150,done);
 }
 update(time:number){
  if(!this.actor||this.folding)return;
  const p=this.bridge.read();if(p.dungeon.roomId!==this.roomId){this.bridge.nearby(null);this.scene.restart();return;}
  this.corridorLayer?.update();this.chapelLayer?.update();
  const {env,realm}=this.view();if(this.envKey!==JSON.stringify([env,realm.canceled,p.cue?.id,p.corridor,p.chapel]))this.refresh();this.inkLayer?.refresh();
  if(this.positionKey!==this.savedKey()){this.positionKey=this.savedKey();this.teleport(safeSidePosition(p.dungeon.position,this.roomId,env));}
  const body=this.body(),paused=this.bridge.paused()||(this.inkLayer?.editing??false)||!!this.corridorLayer?.busy;
  this.puppet.setPosition(this.actor.x,body.bottom).setFlipX(this.facing<0).setAngle(body.velocity.x&&!this.bridge.reduced()?this.facing*3:0);
  if(paused){this.physics.world.pause();body.setVelocity(0);this.wasPaused=true;return;}
  if(this.wasPaused){Object.values(this.keys).forEach(k=>k.reset());this.jumpQueued=0;this.wasPaused=false;}
  this.physics.world.resume();
  const left=this.keys.A.isDown||this.keys.LEFT.isDown,right=this.keys.D.isDown||this.keys.RIGHT.isDown,axis=Number(right)-Number(left);
  body.setVelocityX(axis*config.speed);if(axis)this.facing=axis;
  if(body.blocked.down)this.lastGrounded=time;if(Phaser.Input.Keyboard.JustDown(this.keys.SPACE))this.jumpQueued=time;
  if(this.jumpQueued>0&&time-this.jumpQueued<120&&time-this.lastGrounded<100){body.setVelocityY(-config.jumpSpeed);this.jumpQueued=0;this.lastGrounded=-1000;}
  if(this.actor.y>805){this.bridge.fall();const next=this.bridge.read();this.teleport(safeSidePosition(next.dungeon.position,this.roomId,roomEnvironment(this.roomId,next.ink,next.environment,next.corridor,next.chapel)));return;}
  const nearby=this.objects().filter(o=>Math.hypot(o.x-this.actor.x,o.y-this.actor.y)<=dungeon.rules.interactionRadius).sort((a,b)=>Math.abs(a.x-this.actor.x)-Math.abs(b.x-this.actor.x))[0]??null;
  if((nearby?.id??'')!==this.nearId){this.nearId=nearby?.id??'';this.bridge.nearby(nearby);}
  if(nearby&&Phaser.Input.Keyboard.JustDown(this.keys.E))this.bridge.interact(nearby,this.position());
  if(time-this.lastCheckpoint>2500&&body.blocked.down&&body.velocity.y===0){this.lastCheckpoint=time;this.bridge.checkpoint(this.position());}
 }
}
