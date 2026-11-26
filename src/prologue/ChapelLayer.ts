import Phaser from 'phaser';
import {chapel} from './chapel';
import type {PrologueState} from './store';
import type {Realm} from './strikes';
/** Memories belong to the backdrop. No character portrait/status panel in this room. */
export class ChapelLayer {
 private memory:Phaser.GameObjects.Container;private token:Phaser.GameObjects.Text;private cosmos:Phaser.GameObjects.Container;
 private prayer:Phaser.GameObjects.Graphics;private lastSun=false;
 constructor(privateScene:Phaser.Scene,privateRead:()=>PrologueState,privateRealm:()=>Realm,interact:(id:string)=>void,private reduced:()=>boolean){
  this.scene=privateScene;this.read=privateRead;this.realm=privateRealm;
  const s=this.scene,m=chapel.memory;
  this.memory=s.add.container(m.x,m.y).setDepth(4);
  const paper=s.add.image(0,10,'side-paper').setDisplaySize(550,175).setTint(0x796d85).setAlpha(.4);this.memory.add(paper);
  const style={fontFamily:'Memory Serif, serif',fontSize:'25px',color:'#e6dfcf',align:'center' as const,lineSpacing:12};
  this.memory.add(s.add.text(0,-32,m.prefix,style).setOrigin(.5));
  this.token=s.add.text(-124,35,m.word,{...style,color:'#f5d19d',backgroundColor:'#3b2a40',padding:{x:10,y:6}}).setOrigin(.5).setInteractive({useHandCursor:true}).on('pointerdown',()=>interact('chapel_memory'));this.memory.add(this.token);
  this.memory.add(s.add.text(65,35,m.suffix,style).setOrigin(.5));
  this.cosmos=s.add.container(0,0).setScrollFactor(0).setDepth(3);
  const stars=s.add.graphics();stars.fillStyle(0x080817,.82);stars.fillRect(0,0,1280,620);
  for(let i=0;i<110;i++){stars.fillStyle(i%3?0xbec8dc:0xf4dfc4,.4);stars.fillCircle((i*137)%1280,(i*73)%590,i%4===0?2:1);}
  stars.fillStyle(0x27233b,.65);stars.fillTriangle(430,600,930,600,680,140);stars.fillEllipse(680,140,170,215);stars.lineStyle(2,0xbab0ca,.4);stars.strokeEllipse(680,140,115,160);stars.lineBetween(650,133,665,129);stars.lineBetween(693,129,708,133);this.cosmos.add(stars);
  this.prayer=s.add.graphics().setDepth(3);
 }
 private scene:Phaser.Scene;private read:()=>PrologueState;private realm:()=>Realm;
 update(){
  const p=this.read(),realm=this.realm(),sun=p.cue?.id==='chapel_sun';
  this.memory.setVisible(!realm.lightOn);this.token.setText(p.chapel.collected?'　　':chapel.memory.word).setAlpha(p.chapel.collected?.25:1);
  this.cosmos.setVisible(sun);
  this.prayer.clear();
  if(!realm.canceled.includes('c_mighty')){this.prayer.lineStyle(2,0xe6c87e,realm.lightOn?.5:.12);this.prayer.strokeCircle(750,95,35);}
  if(!realm.canceled.includes('c_pray')){this.prayer.lineStyle(1,0xc7b997,.3);for(let i=0;i<5;i++)this.prayer.strokeCircle(750,95,44+i*8);}
  if(sun&&!this.lastSun){const hand=this.scene.add.image(660,-200,'side-hand').setDisplaySize(370,410).setScrollFactor(0).setDepth(40);if(this.reduced()){hand.setY(250);this.scene.time.delayedCall(1200,()=>hand.destroy());}else this.scene.tweens.add({targets:hand,y:250,duration:650,hold:550,yoyo:true,onComplete:()=>hand.destroy()});}
  this.lastSun=sun;
 }
}
