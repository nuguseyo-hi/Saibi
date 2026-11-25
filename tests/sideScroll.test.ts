import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrologueStore, decodePrologue, PROLOGUE_SAVE_KEY } from '../src/prologue/store.ts';
import { dungeon, questions } from '../src/prologue/content.ts';
import { sideRooms, surfaces, closedGates, physics } from '../src/prologue/sideScroll.ts';
import { emptyInk, strokeAcross, strikeRoom, readRealm, roomEnvironment, projectInk, wordCoverage, validStroke, validInk, inkUI } from '../src/prologue/strikes.ts';
import type { InkRoom } from '../src/prologue/strikes.ts';
import { initialEnvironment } from '../src/prologue/environment.ts';
type Store=ReturnType<typeof createPrologueStore>;
function setup(){const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};return{values,storage,s:createPrologueStore(storage)};}
function advance(s:Store,id:string){for(let i=0;i<80&&s.getState().progress.nodeId!==id;i++)s.getState().advance(s.getState().progress.nodeId);assert.equal(s.getState().progress.nodeId,id);}
function enter(s:Store){s.getState().start();advance(s,'rescue');s.getState().choose('rescue','yes');advance(s,'threat');s.getState().choose('threat','called');advance(s,'questions');for(const q of questions){s.getState().ask(q.id);s.getState().advance(q.nodeId);}s.getState().finishQuestions();s.getState().enter();}
function touch(s:Store,id:string){const o=dungeon.rooms.find(r=>r.id===s.getState().progress.dungeon.roomId)!.objects.find(o=>o.id===id)!;return s.getState().touch(id,null,false,o);}
function erase(s:Store,word:string){const id=s.getState().progress.dungeon.roomId;return s.getState().editStroke(id,strokeAcross(id,word),strikeRoom(id).anchor);}
function cue(s:Store){for(let i=0;i<5&&s.getState().progress.cue;i++)s.getState().cueNext();}
function chapel(s:Store){erase(s,'blocks');touch(s,'betrayal_memory');cue(s);touch(s,'to_chapel');assert.equal(s.getState().progress.dungeon.roomId,'chapel');}
function altar(s:Store){chapel(s);erase(s,'locks');touch(s,'altar_seal');cue(s);touch(s,'to_altar');assert.equal(s.getState().progress.dungeon.roomId,'altar');}

test('ink coverage depends on both endpoints; a partial word and a vertical line do not cancel the verb',()=>{
 const word=strikeRoom('chapel').words.find(w=>w.id==='locks')!,full=strokeAcross('chapel','locks');
 assert.equal(wordCoverage(word,full),'full');
 assert.equal(wordCoverage(word,{a:full.a,b:{x:word.x+word.w/2,y:word.y}}),'partial');
 assert.notEqual(wordCoverage(word,{a:{x:word.x+word.w/2,y:200},b:{x:word.x+word.w/2,y:380}}),'full');
 assert.equal(wordCoverage(word,{a:{x:full.a.x,y:word.y+70},b:{x:full.b.x,y:word.y+70}}),'none');
 assert.ok(validStroke(full,'chapel'));assert.ok(!validStroke({a:{x:0,y:0},b:full.b},'chapel'));assert.ok(!validStroke({a:{x:NaN,y:220},b:full.b},'chapel'));
});
test('the same light entity drives both rules; erasing the locking action preserves light and bridge',()=>{
 const dark=readRealm('chapel',strokeAcross('chapel','c_light1'));
 assert.equal(dark.lightOn,false);assert.equal(dark.bridgeSolid,false);assert.equal(dark.doorLocked,false);
 const action=readRealm('chapel',strokeAcross('chapel','locks'));
 assert.equal(action.lightOn,true);assert.equal(action.bridgeSolid,true);assert.equal(action.doorLocked,false);assert.equal(action.doorPresent,true);
 assert.notEqual(dark.reaction,action.reaction);
 const ghost=readRealm('chapel',strokeAcross('chapel','c_door'));assert.equal(ghost.doorPresent,false);assert.equal(ghost.bridgeSolid,true);
 const unsupported=readRealm('chapel',strokeAcross('chapel','c_support'));assert.equal(unsupported.bridgePresent,true);assert.equal(unsupported.bridgeSolid,false);assert.equal(unsupported.lightOn,true);
});
test('a long stroke can suppress several words; valid alternatives alter the observer and subject differently',()=>{
 const ink={a:{x:410,y:254},b:{x:910,y:254}};assert.ok(validStroke(ink,'chapel'));assert.equal(readRealm('chapel',ink).bridgeSolid,false);
 const companion=readRealm('betrayal',strokeAcross('betrayal','companion')),action=readRealm('betrayal',strokeAcross('betrayal','blocks'));
 assert.equal(companion.wallSolid,false);assert.equal(action.wallSolid,false);assert.equal(companion.companionPresent,false);assert.equal(action.companionPresent,true);assert.notEqual(companion.reaction,action.reaction);
 const self=readRealm('altar',strokeAcross('altar','a_self1'));assert.equal(self.selfPresent,false);assert.equal(self.mood,'faded');
 const free=readRealm('altar',strokeAcross('altar','binds'));assert.equal(free.bound,false);assert.equal(free.faithIntact,true);
});
test('preview is pure, commit copies geometry, reset reverses effects and unchanged drops do not write',()=>{
 const {s,storage}=setup();enter(s);const before=structuredClone(s.getState().progress);readRealm('betrayal',strokeAcross('betrayal','blocks'));assert.deepEqual(s.getState().progress,before);
 const stroke=strokeAcross('betrayal','blocks');s.getState().editStroke('betrayal',stroke,strikeRoom('betrayal').anchor);stroke.a.x=0;
 assert.equal(s.getState().progress.environment.wall,'crossed');const checkpoint=structuredClone(s.getState().progress);assert.equal(erase(s,'blocks'),inkUI.same);assert.deepEqual(s.getState().progress,checkpoint);
 const restored=createPrologueStore(storage);assert.equal(restored.getState().error,null);restored.getState().editStroke('betrayal',null,strikeRoom('betrayal').anchor);assert.equal(restored.getState().progress.environment.wall,'solid');
});
test('remote, cross-room, nonfinite and narration-time edits never change persistent progress',()=>{
 const {s}=setup();enter(s);const before=structuredClone(s.getState().progress);
 s.getState().editStroke('chapel',strokeAcross('chapel','locks'),strikeRoom('betrayal').anchor);
 s.getState().editStroke('betrayal',strokeAcross('betrayal','blocks'),{x:2600,y:570});
 s.getState().editStroke('betrayal',{a:{x:NaN,y:200},b:{x:500,y:200}},strikeRoom('betrayal').anchor);assert.deepEqual(s.getState().progress,before);
 erase(s,'blocks');touch(s,'betrayal_memory');const cueState=structuredClone(s.getState().progress);erase(s,'memory');assert.deepEqual(s.getState().progress,cueState);
});
test('removing the chapel bridge restores the nearest safe edge and can be undone from that edge',()=>{
 const {s}=setup();enter(s);chapel(s);
 const result=s.getState().editStroke('chapel',strokeAcross('chapel','c_light1'),{x:1080,y:576});assert.equal(result,inkUI.safe);
 const x=s.getState().progress.dungeon.position.x;assert.ok(x>=900&&x<=1240);assert.ok(x<950||x>1210);assert.equal(s.getState().progress.environment.door,'open');
 s.getState().editStroke('chapel',null,s.getState().progress.dungeon.position);assert.equal(readRealm('chapel',s.getState().progress.ink.chapel).bridgeSolid,true);
});
test('faith and self erasure, rather than a selected word, control resistance and the single final commitment',()=>{
 const {s,storage}=setup();enter(s);altar(s);erase(s,'a_self1');assert.equal(s.getState().progress.cue,null);touch(s,'final_threshold');assert.equal(s.getState().progress.editResult,null);
 erase(s,'binds');assert.equal(s.getState().progress.cue,null);erase(s,'sun');assert.equal(s.getState().progress.cue?.id,'resistance');cue(s);assert.equal(s.getState().progress.environment.identity,'placed');
 const restored=createPrologueStore(storage);assert.equal(restored.getState().error,null);restored.getState().editStroke('altar',null,strikeRoom('altar').anchor);assert.equal(restored.getState().progress.environment.identity,'unsealed');touch(restored,'final_threshold');assert.equal(restored.getState().progress.editResult,null);
 erase(restored,'serves');assert.equal(restored.getState().progress.cue,null);assert.equal(restored.getState().progress.environment.identity,'placed');touch(restored,'final_threshold');assert.equal(restored.getState().progress.nodeId,'return_0');
 const snapshot=structuredClone(restored.getState().progress);touch(restored,'final_threshold');assert.deepEqual(restored.getState().progress,snapshot);assert.equal(snapshot.events.filter(e=>e==='identity_committed').length,1);
});
test('known old saves translate their puzzle outcomes; invalid ink and unknown versions stay preserved',()=>{
 const {s,values,storage}=setup();enter(s);altar(s);erase(s,'sun');cue(s);
 const legacy=JSON.parse(values.get(PROLOGUE_SAVE_KEY)!);legacy.contentVersion='first-act-side-2';delete legacy.state.ink;legacy.state.environment.wall='crossed';legacy.state.environment.door='open';values.set(PROLOGUE_SAVE_KEY,JSON.stringify(legacy));values.set('nyarlathotep-vn.save.v1','separate');
 const restored=createPrologueStore(storage);assert.equal(restored.getState().error,null);assert.ok(restored.getState().progress.ink.altar);assert.equal(restored.getState().progress.environment.identity,'placed');assert.equal(values.get('nyarlathotep-vn.save.v1'),'separate');
 assert.equal(JSON.parse(values.get(PROLOGUE_SAVE_KEY)!).contentVersion,'first-act-side-2');
 legacy.contentVersion='first-act-strike-3';legacy.state.ink={...emptyInk(),altar:{a:{x:99999,y:1},b:{x:3,y:4}}};assert.throws(()=>decodePrologue(JSON.stringify(legacy)));
 legacy.contentVersion='future';values.set(PROLOGUE_SAVE_KEY,JSON.stringify(legacy));const raw=values.get(PROLOGUE_SAVE_KEY);const broken=createPrologueStore(storage);assert.ok(broken.getState().error);broken.getState().retrySave();assert.equal(values.get(PROLOGUE_SAVE_KEY),raw);
 assert.ok(!validInk({...emptyInk(),extra:null}));
});
test('the two bridges share collision heights with their artwork; solved rooms have continuous walkable ground',()=>{
 const ink=emptyInk();ink.betrayal=strokeAcross('betrayal','blocks');ink.chapel=strokeAcross('chapel','locks');const base={...projectInk(ink,initialEnvironment()),seal:'broken'};
 for(const room of sideRooms){const env=roomEnvironment(room.id,ink,base),ground=surfaces(room.id,env).filter(r=>r.y===physics.groundY).sort((a,b)=>a.x-b.x);let end=ground[0].x;for(const r of ground){assert.ok(r.x<=end,room.id);end=r.x+r.w;}assert.equal(closedGates(room.id,env).length,0);if(room.bridge)assert.ok(room.bridge.w>physics.speed*2*physics.jumpSpeed/physics.gravity+physics.bodyWidth);}
 for(const id of ['betrayal','chapel','altar'] as InkRoom[])assert.equal(validStroke(strikeRoom(id).park,id),true);
});
