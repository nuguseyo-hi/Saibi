import Phaser from 'phaser';
import { texts, resistanceTexts } from './content';
import { textPhysics } from './environment';
import type { EnvironmentState } from './environment';
import { PaperLabel, COLLAGE_FONT, cutoutWord } from '../dungeon/collage';
import type { RoomData } from '../dungeon/model';
import type { DungeonExtension } from '../dungeon/DungeonScene';
export function attachTextWorld(scene:Phaser.Scene,player:Phaser.Physics.Arcade.Image,room:RoomData,read:()=>EnvironmentState,hit:()=>void,paused:()=>boolean):DungeonExtension {
 let activeTime=0;
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const entries=texts.filter(t=>t.roomId===room.id).map(t=>{
  const blocker=scene.add.rectangle(t.x+t.w/2,t.y+t.h/2,t.w,t.h,0,0);
  scene.physics.add.existing(blocker,true);scene.physics.add.collider(player,blocker);
  const sheet=scene.add.image(t.x+t.w/2,t.y+t.h/2,'art-paper').setDisplaySize(t.w,t.h).setDepth(6);
  const label=scene.add.text(t.x+t.w/2,t.y+t.h/2,t.text,{fontFamily:COLLAGE_FONT,fontSize:t.w<130?'25px':'24px',fontStyle:'bold',color:'#2a2021',align:'center',wordWrap:{width:Math.max(80,t.w-16)}}).setOrigin(.5).setDepth(7);
  const stroke=scene.add.graphics().setDepth(8);
  return {t,blocker,sheet,label,stroke,last:''};
 });
 // The rest of the chasm is always impassable, making the underlined span an actual bridge.
 if(room.id==='betrayal')for(const o of room.obstacles)scene.add.rectangle(o.x+o.w/2,o.y+o.h/2,o.w,o.h,0x171018).setDepth(6);
 const puppets=room.id==='betrayal'?[scene.add.image(1180,600,'art-player').setDisplaySize(45,70),scene.add.image(1250,600,'art-player').setDisplaySize(45,70)]:[];
 for(const puppet of puppets)puppet.setDepth(8).setVisible(false);
 const altar=room.id==='altar'?scene.add.ellipse(800,460,620,640,0xb69a4b,.18).setDepth(-2):null;
 const identityLabels=room.id==='altar'?['나는 태양의 신을 섬긴다.','나는 신의 적을 심판한다.','나는 나의 사명을 완수해야 한다.'].map((text,i)=>new PaperLabel(scene,800,220+(i<2&&read().order==='swapped'?1-i:i)*190,text,20).setDepth(10)):[];
 const altarPuppets=room.id==='altar'?[480,1120].map((x,i)=>scene.add.image(read().order==='swapped'?1600-x:x,460+i*90,'art-player').setDisplaySize(52,80).setDepth(9)):[];
 const resistance=room.id==='altar'?cutoutWord(scene,resistanceTexts[0],1100,400,'#8f2635').setDepth(18).setVisible(false):null;
 const resistanceBody=resistance?scene.physics.add.image(1100,400,'body-dot').setAlpha(0):null;
 if(resistanceBody){scene.physics.add.overlap(player,resistanceBody,()=>{if(read().identity==='resisting')hit();});}
 let lastBridge=read().bridge,lastSeal=read().seal,lastOrder=read().order,lastMemory=read().memory;
 const folded=room.id==='chapel'?scene.add.image(1330,480,'art-paper').setDisplaySize(400,730).setDepth(5):null;
 if(folded){folded.setScale(read().seal==='broken'?folded.scaleX:.06,folded.scaleY);folded.setTint(0xc8b77c);}
 return {update:()=>{
  const state=read();
  for(const e of entries){
   const physics=textPhysics(e.t,state),key=JSON.stringify(physics);
   (e.blocker.body as Phaser.Physics.Arcade.StaticBody).enable=physics.solid;
   if(key!==e.last){e.last=key;e.sheet.setVisible(physics.visible);e.label.setVisible(physics.visible);e.stroke.clear();
    e.sheet.setAlpha(physics.format==='strike'?.35:1).setTint(e.t.stateKey==='seal'?0xdbc56e:physics.unfolded?0xd0c6a7:0xe0cda8);
    e.label.setAlpha(physics.format==='strike'?.5:1).setFontStyle(physics.format==='bold'?'bold':'normal');
    if(physics.format==='strike')e.stroke.lineStyle(3,0x8a3037,.8).lineBetween(e.t.x,e.t.y+e.t.h/2,e.t.x+e.t.w,e.t.y+e.t.h/2);
    if(physics.format==='underline'){
      if(!physics.unfolded){e.sheet.setTint(0x241c27);e.label.setText('……');}
      else {e.label.setText(e.t.text);e.stroke.lineStyle(5,0x3e5948,1).lineBetween(e.t.x,e.t.y+e.t.h-12,e.t.x+e.t.w,e.t.y+e.t.h-12);}
    }
   }
   if(e.t.format==='bracket'){const inside=player.x>=e.t.x&&player.x<=e.t.x+e.t.w&&player.y>=e.t.y&&player.y<=e.t.y+e.t.h;e.sheet.setTint(inside?0xb8cfc0:0xe0cda8);}
  }
  if(lastBridge!==state.bridge){lastBridge=state.bridge;const e=entries.find(e=>e.t.stateKey==='bridge');if(e&&state.bridge==='open'&&!reduced){const sx=e.sheet.scaleX;e.sheet.scaleX=.01;scene.tweens.add({targets:e.sheet,scaleX:sx,duration:700,ease:'Back.Out'});}}
  if(lastSeal!==state.seal){lastSeal=state.seal;if(folded){const sx=400/folded.width;scene.tweens.add({targets:folded,scaleX:state.seal==='broken'?sx:.06,angle:state.seal==='broken'?0:-5,duration:reduced?0:850});}}
  if(lastOrder!==state.order){lastOrder=state.order;altarPuppets.forEach((doll,i)=>scene.tweens.add({targets:doll,x:state.order==='swapped'?1120-i*640:480+i*640,angle:state.order==='swapped'?8:-8,duration:reduced?0:500}));identityLabels.slice(0,2).forEach((l,i)=>scene.tweens.add({targets:l,y:220+(state.order==='swapped'?1-i:i)*190,duration:reduced?0:500}));}
  if(altar)altar.setFillStyle(state.order==='swapped'?0x65978a:0xb69a4b,.22);
  if(identityLabels.length&&state.identity==='unsealed')identityLabels[0].setColor('#8b2435');
  for(const puppet of puppets)puppet.setVisible(state.bridge==='open');
  if(lastMemory!==state.memory){lastMemory=state.memory;if(state.memory==='seen'&&puppets[1])scene.tweens.add({targets:puppets[1],x:1370,alpha:.15,angle:18,duration:reduced?0:1300});}
  if(resistance&&resistanceBody){const active=state.identity==='resisting';resistance.setVisible(active);resistanceBody.body!.enable=active;
   if(active){if(!paused())activeTime+=scene.game.loop.delta;const time=activeTime/900;const x=1050+Math.sin(time)*160,y=430+Math.cos(time)*120;resistance.setPosition(x,y);resistanceBody.setPosition(x,y);}}
 }};
}
