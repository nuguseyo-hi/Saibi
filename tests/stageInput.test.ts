import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { stageInput } from '../src/prologue/stageInput.ts';
import { sideRoom, physics, puppetArt, safeSidePosition, surfaces } from '../src/prologue/sideScroll.ts';
import { initialEnvironment } from '../src/prologue/environment.ts';
// Load the installed engine's actual event processing without a browser or canvas mock.
const require=createRequire(import.meta.url);
const KeyboardManager=require('phaser/src/input/keyboard/KeyboardManager.js');
const Key=require('phaser/src/input/keyboard/keys/Key.js');
const JustDown=require('phaser/src/input/keyboard/keys/JustDown.js');
function event(type:string,code:number){const e=new Event(type,{cancelable:true});Object.defineProperty(e,'keyCode',{value:code});return e;}
test('stage-targeted Phaser receives Space/arrows before ancestor cancellation, captures scroll, releases keys and ignores other controls',()=>{
 const stage=new EventTarget(),menu=new EventTarget();
 const input=stageInput(stage as unknown as HTMLElement);
 const codes=[32,37,39,65,68,69,82];
 const keys=new Map(codes.map(code=>[code,new Key(null,code)]));
 const manager={target:input.keyboard.target,enabled:true,preventDefault:true,captures:codes,queue:[] as Event[],manager:{events:{emit(){
  for(const e of manager.queue.splice(0)){const key=keys.get((e as KeyboardEvent).keyCode);if(e.type==='keydown')key.onDown(e);else key.onUp(e);}
 }}}};
 KeyboardManager.prototype.startListeners.call(manager);
 try{
  for(const code of codes){const down=event('keydown',code);stage.dispatchEvent(down);
   // A React ancestor runs after the listener on the focused stage.
   down.preventDefault();assert.equal(keys.get(code).isDown,true,`key ${code} reaches Phaser`);assert.equal(JustDown(keys.get(code)),true);assert.equal(JustDown(keys.get(code)),false);
   assert.equal(down.defaultPrevented,true,'game capture prevents browser scrolling');
   stage.dispatchEvent(event('keyup',code));assert.equal(keys.get(code).isDown,false);
   menu.dispatchEvent(event('keydown',code));assert.equal(keys.get(code).isDown,false,'menu input does not feed game');
  }
 }finally{KeyboardManager.prototype.stopListeners.call(manager);}
 stage.dispatchEvent(event('keydown',32));assert.equal(keys.get(32).isDown,false,'detached keyboard stays inactive');
});
test('regression evidence: cancelling before the Phaser listener suppresses jump',()=>{
 const target=new EventTarget(),manager={target,enabled:true,preventDefault:true,captures:[32],queue:[] as Event[],manager:{events:{emit(){}}}};
 KeyboardManager.prototype.startListeners.call(manager);
 try{const e=event('keydown',32);e.preventDefault();target.dispatchEvent(e);assert.equal(manager.queue.length,0);}finally{KeyboardManager.prototype.stopListeners.call(manager);}
});
test('corridor entrance is flat; unfolded bridge supports the physics feet and artwork baseline at the same height',()=>{
 const room=sideRoom('betrayal'),e={...initialEnvironment(),bridge:'open'};
 assert.ok(room.platforms.every(p=>p.y===physics.groundY),'no mandatory jump before first word puzzle');
 const bridge=room.bridge!;
 for(const x of [bridge.x+physics.bodyWidth,bridge.x+bridge.w/2,bridge.x+bridge.w-physics.bodyWidth]){
  const p=safeSidePosition({x,y:570},room.id,e);const feet=p.y+physics.bodyHeight/2;
  assert.equal(feet,bridge.y);assert.equal(p.x,x);
  const origin=puppetArt.footY/puppetArt.sourceHeight;
  const imageTop=feet-puppetArt.height*origin;
  assert.ok(Math.abs(imageTop+puppetArt.footY*puppetArt.height/puppetArt.sourceHeight-feet)<1e-8);
 }
 const ground=surfaces(room.id,e).sort((a,b)=>a.x-b.x);for(let i=1;i<ground.length;i++){assert.equal(ground[i-1].x+ground[i-1].w,ground[i].x);assert.equal(ground[i-1].y,ground[i].y);}
});
