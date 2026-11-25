import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrologueStore, decodePrologue, PROLOGUE_SAVE_KEY } from '../src/prologue/store.ts';
import { dungeon, questions, meta } from '../src/prologue/content.ts';
import { sideRooms, surfaces, closedGates, safeSidePosition, physics, slots, slotOption, identityText, stageObject, thoughtText, messages, editToken } from '../src/prologue/sideScroll.ts';
import { initialEnvironment } from '../src/prologue/environment.ts';
type Store=ReturnType<typeof createPrologueStore>;
function setup(){const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};return{values,storage,s:createPrologueStore(storage)};}
function advance(s:Store,id:string){for(let i=0;i<80&&s.getState().progress.nodeId!==id;i++)s.getState().advance(s.getState().progress.nodeId);assert.equal(s.getState().progress.nodeId,id);}
function enter(s:Store,collect=true){s.getState().start();advance(s,'rescue');s.getState().choose('rescue','yes');advance(s,'threat');s.getState().choose('threat','called');advance(s,'questions');for(const q of questions){s.getState().ask(q.id);if(collect)for(const seg of meta[q.nodeId].segments??[])if(seg.keywordId)s.getState().collect(seg.keywordId);s.getState().advance(q.nodeId);}s.getState().finishQuestions();s.getState().enter();}
function point(s:Store,id:string){return stageObject(dungeon.rooms.find(r=>r.id===s.getState().progress.dungeon.roomId)!.objects.find(o=>o.id===id)!,s.getState().progress.environment);}
function touch(s:Store,id:string,word:string|null=null,remove=false){return s.getState().touch(id,word,remove,point(s,id));}
function cue(s:Store){for(let i=0;i<5&&s.getState().progress.cue;i++)s.getState().cueNext();}
function chapel(s:Store){touch(s,'format_wall');touch(s,'punctuate');touch(s,'trust_bridge','companion');touch(s,'betrayal_memory');cue(s);touch(s,'to_chapel');assert.equal(s.getState().progress.dungeon.roomId,'chapel');}
function altar(s:Store){chapel(s);touch(s,'detach_denial');touch(s,'door_sentence','merit');touch(s,'altar_seal');touch(s,'altar_seal');assert.equal(s.getState().progress.sealFlipped,true);touch(s,'altar_seal');cue(s);touch(s,'to_altar');assert.equal(s.getState().progress.dungeon.roomId,'altar');}
test('direct word insertion rejects wrong/unowned words, is reversible, persists and never consumes inventory',()=>{
 const {s,storage}=setup();enter(s);const owned=[...s.getState().progress.keywords];touch(s,'trust_bridge','betrayal');assert.equal(s.getState().progress.environment.bridge,'folded');touch(s,'trust_bridge','companion');assert.equal(s.getState().progress.environment.bridge,'open');assert.deepEqual(s.getState().progress.keywords,owned);
 assert.equal(createPrologueStore(storage).getState().progress.environment.bridge,'open');touch(s,'trust_bridge',null,true);assert.equal(s.getState().progress.environment.bridge,'folded');assert.deepEqual(s.getState().progress.keywords,owned);
 const noWords=setup().s;enter(noWords,false);touch(noWords,'trust_bridge','companion');assert.equal(noWords.getState().progress.environment.bridge,'folded');touch(noWords,'keyword_cache');touch(noWords,'trust_bridge','companion');assert.equal(noWords.getState().progress.environment.bridge,'open');
});
test('all three rooms use direct interactions through final insertion, removal, reload, threshold and role transfer',()=>{
 const {s,storage}=setup();enter(s);altar(s);touch(s,'order_thoughts');assert.equal(s.getState().progress.environment.order,'swapped');touch(s,'identity_belief','apostle');assert.ok(s.getState().progress.cue);cue(s);assert.equal(s.getState().progress.phase,'core');
 touch(s,'identity_belief',identityText.tokenId);assert.equal(s.getState().progress.environment.identity,'placed');assert.equal(s.getState().progress.editResult,null);
 const r=createPrologueStore(storage);assert.equal(r.getState().error,null);assert.equal(r.getState().progress.environment.identity,'placed');touch(r,'identity_belief',null,true);assert.equal(r.getState().progress.environment.identity,'unsealed');touch(r,'final_threshold');assert.equal(r.getState().progress.editResult,null);
 touch(r,'identity_belief',identityText.tokenId);touch(r,'final_threshold');assert.equal(r.getState().progress.nodeId,'return_0');assert.equal(r.getState().progress.editResult?.selections.identity,'apostle');assert.equal(r.getState().progress.events.filter(e=>e==='identity_committed').length,1);
 const snapshot=structuredClone(r.getState().progress);r.getState().touch('final_threshold',null,false,{x:2520,y:570});assert.deepEqual(r.getState().progress,snapshot);
 advance(r,'name');r.getState().name('세라');advance(r,'village');assert.equal(r.getState().progress.playableId,'inquisitor');assert.equal(createPrologueStore(storage).getState().progress.name,'세라');
});
test('nearby gates are required, remote input/cue input rejected, falls keep words and solved state',()=>{
 const {s}=setup();enter(s);s.getState().touch('trust_bridge','companion',false,{x:180,y:570});assert.equal(s.getState().progress.environment.bridge,'folded');touch(s,'trust_bridge','companion');touch(s,'betrayal_memory');const state=structuredClone(s.getState().progress);touch(s,'trust_bridge',null,true);assert.deepEqual(s.getState().progress,state);cue(s);
 s.getState().fall();assert.equal(s.getState().progress.environment.bridge,'open');assert.equal(s.getState().progress.keywords.length,5);assert.equal(s.getState().progress.dungeon.stability,3);
});
test('old top-down saves migrate to safe entrances while preserving progress, names and old separate game storage',()=>{
 const {s,values,storage}=setup();enter(s);altar(s);const raw=JSON.parse(values.get(PROLOGUE_SAVE_KEY)!);raw.contentVersion='first-act-1';raw.state.dungeon.position={x:800,y:290};values.set(PROLOGUE_SAVE_KEY,JSON.stringify(raw));values.set('nyarlathotep-vn.save.v1','unchanged');const r=createPrologueStore(storage);
 assert.equal(r.getState().error,null);assert.equal(r.getState().progress.dungeon.roomId,'altar');assert.equal(r.getState().progress.dungeon.position.x,180);assert.equal(r.getState().progress.environment.seal,'broken');assert.deepEqual(r.getState().progress.keywords,s.getState().progress.keywords);assert.equal(values.get('nyarlathotep-vn.save.v1'),'unchanged');
 // Reading alone never overwrites the source save. Unsupported versions stay rejected.
 assert.equal(JSON.parse(values.get(PROLOGUE_SAVE_KEY)!).contentVersion,'first-act-1');raw.contentVersion='future';assert.throws(()=>decodePrologue(JSON.stringify(raw)));
});
test('surface geometry has walkable room exits, jumpable optional steps and an unjumpable missing bridge',()=>{
 const env={...initialEnvironment(),wall:'crossed',bridge:'open',punctuation:'question',negation:'detached',door:'open',seal:'broken'};
 const jumpHeight=physics.jumpSpeed**2/(2*physics.gravity),jumpRange=physics.speed*2*physics.jumpSpeed/physics.gravity;
 for(const room of sideRooms){const ground=surfaces(room.id,env).filter(r=>r.y===physics.groundY).sort((a,b)=>a.x-b.x);let end=ground[0].x;for(const rect of ground){assert.ok(rect.x<=end,`${room.id}: ground gap`);end=rect.x+rect.w;}
  const source=dungeon.rooms.find(r=>r.id===room.id)!;for(const o of source.objects){assert.ok(o.x>=ground[0].x&&o.x<=end,o.id);assert.ok(Math.abs(o.y-(physics.groundY-physics.bodyHeight/2))<110);}
  for(const step of room.platforms.filter(r=>r.y<physics.groundY))assert.ok(physics.groundY-step.y<jumpHeight,'low jump reaches optional step');
  assert.equal(closedGates(room.id,env).length,0);
  if(room.bridge)assert.ok(room.bridge.w>jumpRange+physics.bodyWidth,'bridge cannot be skipped with a jump');
 }
 assert.equal(closedGates('chapel',initialEnvironment()).length,3);
});
test('checkpoint recovery never leaves player over a removed bridge or inside a restored gate',()=>{
 const env=initialEnvironment();assert.equal(safeSidePosition({x:1600,y:570},'betrayal',env).x,180);assert.equal(safeSidePosition({x:710,y:570},'betrayal',env).x,180);
 assert.equal(safeSidePosition({x:1600,y:570},'betrayal',{...env,bridge:'open'}).x,1600);
 const slot=slots.find(s=>s.objectId==='trust_bridge')!;assert.throws(()=>slotOption(slot,env,'sun',false));assert.equal(slotOption(slot,env,null,true),'empty');
});
test('final word can be carried through a previous room and still completed at the threshold',()=>{
 const {s}=setup();enter(s);altar(s);touch(s,'order_thoughts');touch(s,'identity_belief','apostle');cue(s);touch(s,'identity_belief',identityText.tokenId);touch(s,'back_chapel');touch(s,'to_altar');touch(s,'final_threshold');assert.equal(s.getState().progress.nodeId,'return_0');
});

test('P1: unchanged edits and empty recovery never claim a world change',()=>{
 const {s}=setup();enter(s);
 assert.equal(touch(s,'format_wall',null,true),messages.unchanged);
 assert.equal(touch(s,'trust_bridge','companion'),messages.inserted);
 assert.equal(touch(s,'trust_bridge','companion'),messages.unchanged);
 assert.equal(touch(s,'trust_bridge','betrayal'),messages.wrongWord);
 assert.equal(s.getState().progress.environment.bridge,'open');
 assert.equal(touch(s,'keyword_cache'),messages.cacheEmpty);
 assert.equal(editToken('format_wall'),'절대로');assert.equal(editToken('door_sentence'),'공적');
});
test('P1: punctuation changes real collision and can be restored',()=>{
 const {s}=setup();enter(s);
 assert.ok(closedGates('betrayal',s.getState().progress.environment).some(g=>g.key==='punctuation'));
 const gate=closedGates('betrayal',s.getState().progress.environment).find(g=>g.key==='punctuation')!;
 const station=point(s,'punctuate');assert.ok(Math.abs(gate.x+gate.w+physics.bodyWidth/2-station.x)<dungeon.rules.interactionRadius,'old saves can reach the control from the right');
 touch(s,'punctuate');assert.ok(!closedGates('betrayal',s.getState().progress.environment).some(g=>g.key==='punctuation'));
 touch(s,'punctuate',null,true);assert.ok(closedGates('betrayal',s.getState().progress.environment).some(g=>g.key==='punctuation'));
});
test('P1: thought order moves stable IDs, gates the first rewrite, and preserves reversible saves',()=>{
 const {s,storage}=setup();enter(s);altar(s);
 touch(s,'identity_belief','apostle');assert.equal(s.getState().progress.cue,null);assert.equal(s.getState().actionError,messages.arrangeFirst);
 touch(s,'order_thoughts');
 assert.equal(point(s,'identity_belief').x,920);assert.equal(point(s,'identity_judgment').x,1460);
 assert.notEqual(thoughtText('identity_belief',s.getState().progress.environment),thoughtText('identity_judgment',s.getState().progress.environment));
 s.getState().touch('identity_belief','apostle',false,{x:1460,y:570});assert.equal(s.getState().progress.cue,null);
 touch(s,'identity_belief','apostle');cue(s);touch(s,'identity_belief',identityText.tokenId);
 assert.equal(touch(s,'identity_belief',identityText.tokenId),messages.unchanged);
 const restored=createPrologueStore(storage);assert.equal(restored.getState().progress.environment.identity,'placed');
 touch(restored,'order_thoughts');assert.equal(point(restored,'identity_belief').x,1460);
 touch(restored,'identity_belief',null,true);assert.equal(restored.getState().progress.environment.identity,'unsealed');
 touch(restored,'identity_belief',identityText.tokenId);touch(restored,'final_threshold');assert.equal(restored.getState().progress.events.filter(id=>id==='identity_committed').length,1);
});
