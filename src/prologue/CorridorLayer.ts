import Phaser from 'phaser';
import { corridor, corridorSlotAt } from './corridor';
import type { CorridorSlot } from './corridor';
import type { Point } from '../dungeon/model';
import type { PrologueState } from './store';
interface Bridge {read:()=>PrologueState;position:()=>Point;paused:()=>boolean;reduced:()=>boolean;insert:(slot:CorridorSlot,remove:boolean,position:Point)=>void}
/** Paper scenery and temporal feedback; the store alone resolves words and costs. */
export class CorridorLayer {
 private scene:Phaser.Scene;private b:Bridge;private ink:Phaser.GameObjects.Container;
 private blanks:Record<CorridorSlot,Phaser.GameObjects.Text>;private frames:Phaser.GameObjects.Text[]=[];
 private bridgeSuffix:Phaser.GameObjects.Text;
 private bones:Phaser.GameObjects.Image[]=[];private why:Phaser.GameObjects.Text[]=[];private puppets:Phaser.GameObjects.Container[]=[];private tears:Phaser.GameObjects.Graphics[]=[];
 private denial:Phaser.GameObjects.Text;private beam:Phaser.GameObjects.Graphics;private sun:Phaser.GameObjects.Container;
 private oldBridge:boolean;private lastCue='';private busyUntil=0;private rejection?:Phaser.GameObjects.Text;
 get busy(){return this.scene.time.now<this.busyUntil;}
 constructor(scene:Phaser.Scene,bridge:Bridge){
  this.scene=scene;this.b=bridge;const p=bridge.read();this.oldBridge=!!p.corridor.bridgeWord;
  const serif={fontFamily:'Memory Serif, serif',fontSize:'29px',color:'#ead8b2'};
  scene.add.text(160,160,corridor.record,{...serif,fontSize:'23px',wordWrap:{width:620},lineSpacing:12}).setAlpha(.72).setDepth(3);
  this.denial=scene.add.text(90,270,corridor.denial,{...serif,fontSize:'45px',color:'#c1a8a7'}).setAngle(-4).setAlpha(.25).setDepth(1.5);
  scene.add.text(1950,240,corridor.denial,{...serif,fontSize:'39px'}).setAngle(5).setAlpha(.14).setDepth(1.5);
  this.ink=scene.add.container(0,0).setDepth(5);
  const paper=scene.add.graphics();paper.fillStyle(0xe2cfaa,.94);paper.fillPoints([{x:464,y:337},{x:939,y:344},{x:935,y:432},{x:471,y:437}],true);paper.lineStyle(2,0x7f6b61,.75);paper.lineBetween(476,428,930,423);this.ink.add(paper);
  this.ink.add(scene.add.text(505,384,corridor.bridge.prefix,{...serif,color:'#3e2b34'}).setOrigin(0,.5));
  this.bridgeSuffix=scene.add.text(804,384,corridor.bridge.suffix,{...serif,color:'#3e2b34'}).setOrigin(0,.5);this.ink.add(this.bridgeSuffix);
  const blank=(slot:CorridorSlot)=>{const s=corridor[slot];return scene.add.text(s.x,s.y,s.empty,{...serif,color:'#612f40',backgroundColor:'#ead7b3',padding:{x:14,y:7}}).setFixedSize(s.w,s.h).setOrigin(.5).setAlign('center').setDepth(7).setInteractive({useHandCursor:true}).on('pointerdown',()=>{if(!bridge.paused()&&!this.busy)bridge.insert(slot,false,bridge.position());});};
  this.blanks={bridge:blank('bridge'),door:blank('door')};
  for(let i=0;i<15;i++){
   const x=940+i*25,y=710+(i%3)*28,bone=scene.add.image(x,y,'side-skull').setDisplaySize(77,46).setAngle((i%3-1)*8).setDepth(3);this.bones.push(bone);
   if(this.oldBridge)bone.setPosition(x,626+(i%2)*3).setAngle((i%3-1)*3);
  }
  for(let i=0;i<11;i++)scene.add.image(930+i*37,775+(i%2)*24,'side-skull').setDisplaySize(55,30).setAngle(i*31).setTint(0x9b8984).setAlpha(.45).setDepth(2);
  for(let i=0;i<7;i++)this.why.push(scene.add.text(1080+i*145,190+(i%3)*79,corridor.why,{...serif,fontSize:`${25+i%3*9}px`,color:'#d3aaa8'}).setAngle(i%2?5:-5).setDepth(3).setAlpha(0));
  for(let i=0;i<3;i++){
   const x=1360+i*155,y=514,g=scene.add.graphics();g.fillStyle(0x4a4145);g.fillPoints([{x:-21,y:-35},{x:20,y:-34},{x:39,y:81},{x:-40,y:78}],true);g.lineStyle(2,0xa08d7c);g.strokePoints([{x:-21,y:-35},{x:20,y:-34},{x:39,y:81},{x:-40,y:78}],true);g.fillStyle(0xb39a6b);g.fillEllipse(0,-58,48,64);g.lineStyle(2,0x50434c);for(let j=0;j<4;j++)g.lineBetween(-18+j*10,-78,-13+j*8,-33);const body=scene.add.container(x,y,[g]).setAngle(i%2?7:-6).setDepth(4);this.puppets.push(body);
   const string=scene.add.graphics().setDepth(2);string.lineStyle(1,0xc1aa91,.35);string.lineBetween(x,0,x,y-88);
  }
  const phrase=[...corridor.door.prefix];
  for(let i=0;i<phrase.length;i++){
   const t=i/(phrase.length-1),angle=Math.PI+t*Math.PI,x=2440+125*Math.cos(angle),y=420+160*Math.sin(angle);
   const letter=scene.add.text(x,y,phrase[i],{...serif,fontSize:'27px',color:'#dbcaad'}).setOrigin(.5).setAngle(t*180-90).setDepth(5);this.frames.push(letter);
  }
  scene.add.text(2440,540,corridor.door.suffix,{...serif,fontSize:'24px'}).setOrigin(.5).setDepth(5);
  const threshold=scene.add.graphics().setDepth(4);threshold.lineStyle(2,0xa18b76,.45);threshold.lineBetween(2297,590,2582,590);threshold.lineBetween(2310,420,2310,590);threshold.lineBetween(2570,420,2570,590);
  this.beam=scene.add.graphics().setDepth(2);this.beam.fillStyle(0xffdf92,.22);this.beam.fillTriangle(2440,300,2020,620,2700,620);this.beam.setVisible(false);
  this.sun=scene.add.container(640,790).setScrollFactor(0).setDepth(42).setVisible(false);
  const rays=scene.add.graphics();rays.fillStyle(0xe9ba55,.9);for(let i=0;i<16;i++){const a=i*Math.PI/8;rays.fillTriangle(Math.cos(a)*83,Math.sin(a)*83,Math.cos(a+.07)*109,Math.sin(a+.07)*109,Math.cos(a+.17)*83,Math.sin(a+.17)*83);}rays.fillStyle(0xf9df9a);rays.fillCircle(0,0,82);rays.lineStyle(3,0x946f47);rays.strokeCircle(0,0,76);rays.lineBetween(-26,-12,-8,-16);rays.lineBetween(12,-16,30,-12);rays.beginPath();rays.arc(0,15,24,0,Math.PI);rays.strokePath();this.sun.add(rays);
  for(const puppet of this.puppets){const tear=scene.add.graphics();tear.fillStyle(0x130f1a);tear.fillPoints([{x:-17,y:-79},{x:4,y:-89},{x:18,y:-62},{x:9,y:-38},{x:-12,y:-45}],true);tear.lineStyle(2,0xb5a084);tear.strokePoints([{x:-17,y:-79},{x:4,y:-89},{x:18,y:-62},{x:9,y:-38},{x:-12,y:-45}],true);puppet.add(tear);this.tears.push(tear);}
  this.update();
 }
 drop(clientX:number,clientY:number){const rect=this.scene.game.canvas.getBoundingClientRect(),camera=this.scene.cameras.main,p=camera.getWorldPoint((clientX-rect.left)*1280/rect.width,(clientY-rect.top)*720/rect.height),slot=corridorSlotAt(p);return slot&&!this.b.paused()&&!this.busy?slot:null;}
 remove(){const x=this.b.position().x;this.b.insert(x<1600?'bridge':'door',true,this.b.position());}
 reject(word:string){this.rejection?.destroy();const x=this.b.position().x<1600?700:2440,y=x===700?384:460;const label=this.scene.add.text(x,y,word,{fontFamily:'Memory Serif, serif',fontSize:'29px',color:'#e2c3b4'}).setOrigin(.5).setDepth(40);this.rejection=label;if(this.b.reduced()){label.destroy();return;}this.scene.tweens.add({targets:label,x:x-40,y:y+90,angle:-17,alpha:0,duration:600,onComplete:()=>label.destroy()});}
 update(){
  const p=this.b.read(),built=!!p.corridor.bridgeWord,door=!!p.corridor.doorWord,reduced=this.b.reduced();
  this.blanks.bridge.setText(p.cue?.id==='corridor_sun'?'태양의 신':built?'동료':corridor.bridge.empty);this.blanks.door.setText(door?'배신':corridor.door.empty);
  this.bridgeSuffix.setText(p.cue?.id==='corridor_sun'?corridor.bridge.sunSuffix:corridor.bridge.suffix);
  const changed=built!==this.oldBridge;
  if(changed){
   this.busyUntil=this.scene.time.now+(reduced?0:1050);
   this.bones.forEach((bone,i)=>{this.scene.tweens.killTweensOf(bone);const y=built?626+(i%2)*3:730+i%3*28,angle=built?(i%3-1)*3:(i%3-1)*24;if(reduced)bone.setY(y).setAngle(angle);else this.scene.tweens.add({targets:bone,y,angle,duration:built?580:440,delay:built?i*27:i*12,ease:built?'Back.easeOut':'Cubic.easeIn'});});
   if(built&&!reduced)this.scene.tweens.add({targets:this.puppets[0],angle:10,duration:220,yoyo:true,hold:250});
  }
  this.denial.setAlpha(built?.12:.3);
  this.why.forEach((text,i)=>{if(door){text.setAlpha(0);return;}const progressed=this.b.position().x>850+i*110;text.setAlpha(built&&progressed?.18+i%3*.09:0);});
  if(p.cue?.id!=='corridor_exit')this.frames.forEach((f,i)=>f.setAlpha(door?1:i%4===0?.08:.56));
  this.tears.forEach(t=>t.setVisible(door));
  const cue=p.cue?.id??'';
  if(cue==='corridor_sun'&&this.lastCue!==cue){
   const duration=reduced?0:p.events.includes('corridor_sun')?380:850;this.busyUntil=this.scene.time.now+duration*2+700;this.sun.setVisible(true).setPosition(640,reduced?210:790).setScale(1).setAlpha(1);
   const flash=this.scene.add.rectangle(640,360,1280,720,0xf8d988,.34).setScrollFactor(0).setDepth(41);const hand=this.scene.add.image(900,-260,'side-hand').setDisplaySize(430,470).setScrollFactor(0).setDepth(44).setAngle(-25);
   if(reduced){hand.setPosition(690,140);this.scene.time.delayedCall(700,()=>{hand.destroy();flash.destroy();this.sun.setVisible(false);});}
   else{
    this.scene.tweens.add({targets:this.sun,y:210,duration,ease:'Cubic.easeOut'});
    this.scene.tweens.add({targets:hand,x:675,y:145,delay:duration,duration:420,ease:'Cubic.easeInOut',onComplete:()=>{this.scene.tweens.add({targets:this.sun,scaleX:.12,scaleY:.07,angle:22,alpha:0,duration:330});this.scene.tweens.add({targets:flash,alpha:0,duration:350,onComplete:()=>flash.destroy()});this.scene.tweens.add({targets:hand,y:-280,delay:360,duration:420,onComplete:()=>hand.destroy()});}});
   }
  }
  if(cue==='corridor_exit'&&this.lastCue!==cue){this.beam.setVisible(true);if(!reduced)this.frames.forEach((f,i)=>this.scene.tweens.add({targets:f,x:f.x+(i<phraseHalf?-70:70),alpha:.25,duration:800}));}
  this.oldBridge=built;this.lastCue=cue;
 }
}
const phraseHalf=[...corridor.door.prefix].length/2;
