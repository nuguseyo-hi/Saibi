import Phaser from 'phaser';
import type { Point } from '../dungeon/model';
import type { PrologueState } from './store';
import { strikeRoom, readRealm, wordCoverage, distanceToInk, canReachInk, inkUI } from './strikes';
import type { InkStroke, InkRoom, Realm } from './strikes';
interface InkBridge {
 read:()=>PrologueState;position:()=>Point;suspended:()=>boolean;
 commit:(stroke:InkStroke|null)=>void;preview:(realm:Realm|undefined)=>void;
}
/** A movable physical ink strip in the world, not a word-selection interface. */
export class StrikeLayer {
 private scene:Phaser.Scene;private bridge:InkBridge;readonly roomId:string;
 private art:Phaser.GameObjects.Graphics;private labels=new Map<string,Phaser.GameObjects.Text>();
 private drag:'body'|'a'|'b'|null=null;private start!:Point;private origin!:InkStroke;
 private keyboard=false;private handle:'body'|'a'|'b'='body';private stamp='';
 draft:InkStroke|undefined;
 get editing(){return this.drag!==null||this.keyboard;}
 constructor(scene:Phaser.Scene,roomId:string,bridge:InkBridge){
  this.scene=scene;this.roomId=roomId;this.bridge=bridge;
  const room=strikeRoom(roomId),paper=scene.add.graphics().setDepth(4);
  scene.add.text(room.bounds.x,room.bounds.y-20,room.title,{fontFamily:'Memory Serif, serif',fontSize:'19px',color:'#e8c798'}).setDepth(5);
  for(const word of room.words){
   paper.fillStyle(0xe9d9b7,.96);paper.fillPoints([{x:word.x-5,y:word.y-27},{x:word.x+word.w+6,y:word.y-23},{x:word.x+word.w+2,y:word.y+26},{x:word.x-4,y:word.y+23}],true);
   this.labels.set(word.id,scene.add.text(word.x+word.w/2,word.y,word.text,{fontFamily:'Memory Serif, serif',fontSize:'28px',color:'#392631'}).setOrigin(.5).setDepth(5));
  }
  for(const c of room.connectors)scene.add.text(c.x,c.y,c.text,{fontFamily:'Memory Serif, serif',fontSize:'25px',color:'#e5d4b4'}).setOrigin(0,.5).setDepth(5);
  this.art=scene.add.graphics().setDepth(35);
  scene.input.on('pointerdown',this.down);scene.input.on('pointermove',this.move);scene.input.on('pointerup',this.up);scene.input.on('pointerupoutside',this.cancel);
  scene.game.canvas.parentElement!.addEventListener('keydown',this.key,{capture:true});
  window.addEventListener('blur',this.cancel);window.addEventListener('pointerup',this.releaseOutside);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
   scene.input.off('pointerdown',this.down);scene.input.off('pointermove',this.move);scene.input.off('pointerup',this.up);scene.input.off('pointerupoutside',this.cancel);
   scene.game.canvas.parentElement?.removeEventListener('keydown',this.key,{capture:true});window.removeEventListener('blur',this.cancel);window.removeEventListener('pointerup',this.releaseOutside);this.drag=null;this.keyboard=false;this.draft=undefined;this.bridge.preview(undefined);
  });
  this.refresh();
 }
 current():InkStroke{return this.draft??this.bridge.read().ink[this.roomId as InkRoom]??strikeRoom(this.roomId).park;}
 realm():Realm {const p=this.bridge.read();return readRealm(this.roomId,this.draft??p.ink[this.roomId as InkRoom],p.environment.identity,p.chapel);}
 private allowed(){return !this.bridge.suspended()&&!this.bridge.read().cue&&canReachInk(this.roomId,this.bridge.position());}
 private point(pointer:Phaser.Input.Pointer):Point{return pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;}
 private down=(pointer:Phaser.Input.Pointer)=>{
  if(!this.allowed()||this.keyboard)return;
  const p=this.point(pointer),line=this.current();
  if(Math.hypot(p.x-line.a.x,p.y-line.a.y)<23)this.drag='a';
  else if(Math.hypot(p.x-line.b.x,p.y-line.b.y)<23)this.drag='b';
  else if(distanceToInk(p,line)<20)this.drag='body';else return;
  this.start=p;this.origin=structuredClone(line);this.draft=structuredClone(line);this.paintPreview();
 };
 private move=(pointer:Phaser.Input.Pointer)=>{
  if(!this.drag)return;
  if(!this.allowed()){this.cancel();return;}
  const p=this.point(pointer),line=structuredClone(this.origin),dx=p.x-this.start.x,dy=p.y-this.start.y;
  if(this.drag==='body'||this.drag==='a'){line.a.x+=dx;line.a.y+=dy;}
  if(this.drag==='body'||this.drag==='b'){line.b.x+=dx;line.b.y+=dy;}
  this.draft=line;this.paintPreview();
 };
 private up=()=>{if(this.drag)this.finish();};
 private releaseOutside=(event:PointerEvent)=>{
  if(!this.drag)return;const rect=this.scene.game.canvas.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)this.cancel();else this.finish();
 };
 private finish(){const line=this.draft;this.drag=null;this.keyboard=false;this.draft=undefined;if(line)this.bridge.commit(line);this.bridge.preview(undefined);this.refresh();}
 private cancel=()=>{this.drag=null;this.keyboard=false;this.draft=undefined;this.bridge.preview(undefined);this.refresh();};
 cancelEdit(){this.cancel();}
 beginKeyboard(){if(!this.allowed())return;this.keyboard=true;this.handle='body';this.draft=structuredClone(this.current());this.paintPreview();}
 reset(){if(!this.allowed())return;this.cancel();this.bridge.commit(null);this.refresh();}
 private key=(event:KeyboardEvent)=>{
  if(this.roomId==='chapel'&&this.bridge.read().chapel.inserted&&!this.editing&&event.key.toLowerCase()==='r')return;
  if(event.key.toLowerCase()==='q'&&!event.repeat){if(!this.allowed())return;event.preventDefault();event.stopImmediatePropagation();if(this.keyboard)this.cancel();else this.beginKeyboard();return;}
  if(!this.keyboard){if(event.key.toLowerCase()==='r'&&this.allowed()){event.preventDefault();event.stopImmediatePropagation();this.reset();}return;}
  if(!this.allowed()){this.cancel();return;}
  const keys=['1','2','3','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter','Escape'];if(!keys.includes(event.key))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(event.key==='Escape'){this.cancel();return;}if(event.key==='Enter'){this.finish();return;}
  if(['1','2','3'].includes(event.key)){this.handle=event.key==='1'?'body':event.key==='2'?'a':'b';this.refresh(true);return;}
  const amount=event.shiftKey?1:10,dx=event.key==='ArrowLeft'?-amount:event.key==='ArrowRight'?amount:0,dy=event.key==='ArrowUp'?-amount:event.key==='ArrowDown'?amount:0;
  const line=structuredClone(this.current());for(const end of ['a','b'] as const)if(this.handle==='body'||this.handle===end){line[end].x+=dx;line[end].y+=dy;}
  this.draft=line;this.paintPreview();
 };
 private paintPreview(){this.bridge.preview(this.realm());this.refresh(true);}
 refresh(force=false){
  const p=this.bridge.read(),stroke=this.current(),key=JSON.stringify([stroke,this.editing,this.handle,p.ink[this.roomId as InkRoom],p.chapel]);if(!force&&key===this.stamp)return;this.stamp=key;
  const room=strikeRoom(this.roomId),active=this.draft??p.ink[this.roomId as InkRoom],direct=room.words.filter(w=>wordCoverage(w,active)==='full');
  this.art.clear();
  for(const word of room.words){
   const coverage=wordCoverage(word,active),linked=!!word.entity&&direct.some(w=>w.entity===word.entity),erased=coverage==='full'||linked;
   const replacement=this.roomId==='chapel'&&word.id==='c_light1'&&p.chapel.inserted;
   this.labels.get(word.id)!.setDepth(replacement?36:5).setBackgroundColor(replacement?'#e9d9b7':'');
   this.labels.get(word.id)!.setText(this.roomId==='chapel'&&word.id==='c_light1'&&p.chapel.inserted?'어둠':word.text).setAlpha(this.roomId==='chapel'&&word.id==='c_light1'&&p.chapel.inserted?1:erased?.35:1).setColor(coverage==='partial'?'#9b6424':'#392631');
   if((linked||this.roomId==='chapel'&&word.entity==='light'&&p.chapel.inserted)&&coverage!=='full'&&!(this.roomId==='chapel'&&word.id==='c_light1'&&p.chapel.inserted)){this.art.lineStyle(3,0xa34762,.65);this.art.lineBetween(word.x,word.y,word.x+word.w,word.y);}
   if(coverage==='partial'){this.art.lineStyle(2,0xe0b95f,.9);this.art.lineBetween(word.x,word.y+27,word.x+word.w,word.y+27);}
  }
  this.art.lineStyle(this.editing?14:11,0xa42f53,.95);this.art.lineBetween(stroke.a.x,stroke.a.y,stroke.b.x,stroke.b.y);
  this.art.lineStyle(2,0xf5bbad,.8);this.art.lineBetween(stroke.a.x,stroke.a.y-2,stroke.b.x,stroke.b.y-2);
  for(const end of ['a','b'] as const){this.art.fillStyle(this.keyboard&&this.handle===end?0xffd77c:0xeccdb0);this.art.fillCircle(stroke[end].x,stroke[end].y,11);this.art.lineStyle(2,0x99374f);this.art.strokeCircle(stroke[end].x,stroke[end].y,11);}
 }
 hint(){return this.editing?inkUI.keyboard:inkUI.hint;}
}
