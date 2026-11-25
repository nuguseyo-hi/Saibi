import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createPrologueStore, decodePrologue, PROLOGUE_SAVE_KEY } from '../src/prologue/store.ts';
import { scenario, meta, dungeon, rules, texts, identityEvent, questions } from '../src/prologue/content.ts';
import { initialEnvironment, applyRule, textPhysics, exitAvailable } from '../src/prologue/environment.ts';
import { createDraft } from '../src/domain/mind/editing.ts';
import { strokeAcross, strikeRoom } from '../src/prologue/strikes.ts';
import { stageObject } from '../src/prologue/sideScroll.ts';
import { validPosition } from '../src/dungeon/model.ts';
type Store=ReturnType<typeof createPrologueStore>;
function setup(){const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};return{values,storage,store:createPrologueStore(storage)};}
function advanceTo(s:Store,id:string){for(let i=0;i<70&&s.getState().progress.nodeId!==id;i++){const p=s.getState().progress;s.getState().advance(p.nodeId);}assert.equal(s.getState().progress.nodeId,id);}
function startDungeon(s:Store,rescue='no',answer='called',collect=true){s.getState().start();advanceTo(s,'rescue');s.getState().choose('rescue',rescue);if(rescue==='no')assert.equal(s.getState().progress.nodeId,'forced_yes');advanceTo(s,'threat');assert.equal(s.getState().progress.guard,90);s.getState().choose('threat',answer);assert.equal(s.getState().progress.guard,100);advanceTo(s,'obedience');assert.equal(s.getState().progress.guard,0);advanceTo(s,'questions');for(const q of questions){s.getState().ask(q.id);if(collect)for(const part of meta[q.nodeId].segments??[])if(part.keywordId){s.getState().collect(part.keywordId);s.getState().collect(part.keywordId);}s.getState().advance(q.nodeId);}s.getState().finishQuestions();s.getState().enter();assert.equal(s.getState().progress.phase,'dungeon');}
function object(s:Store,id:string){return stageObject(dungeon.rooms.find(r=>r.id===s.getState().progress.dungeon.roomId)!.objects.find(o=>o.id===id)!,s.getState().progress.environment);}
function inspect(s:Store,id:string){assert.equal(s.getState().inspect(id,object(s,id)),true);}
function travel(s:Store,id:string){s.getState().travel(id,object(s,id));}
function finishCue(s:Store){for(let i=0;i<4&&s.getState().progress.cue;i++)s.getState().cueNext();}
function erase(s:Store,word:string){const id=s.getState().progress.dungeon.roomId;s.getState().editStroke(id,strokeAcross(id,word),strikeRoom(id).anchor);}
function reachCore(s:Store){
 erase(s,'blocks');travel(s,'to_chapel');assert.equal(s.getState().progress.dungeon.roomId,'betrayal');inspect(s,'betrayal_memory');finishCue(s);travel(s,'to_chapel');
 erase(s,'locks');const seal=object(s,'altar_seal');s.getState().touch(seal.id,null,false,seal);finishCue(s);travel(s,'to_altar');
 erase(s,'sun');assert.equal(s.getState().progress.resistance,1);assert.equal(s.getState().progress.environment.identity,'resisting');finishCue(s);assert.equal(s.getState().progress.phase,'core');
}
for(const rescue of ['yes','no'])for(const answer of ['curiosity','called'])test(`complete prologue ${rescue}/${answer}: keywords → 3 zones → identity → name → playable character → village`,()=>{
 const {store:s,storage,values}=setup();startDungeon(s,rescue,answer);assert.equal(s.getState().progress.keywords.length,5);reachCore(s);
 const before=structuredClone(s.getState().progress);s.getState().confirmCore(createDraft(identityEvent));assert.equal(s.getState().progress.phase,'core');assert.equal(s.getState().progress.editResult,null);
 s.getState().cancelCore();assert.equal(s.getState().progress.environment.identity,'placed');s.getState().core();s.getState().confirmCore({...createDraft(identityEvent),identity:'apostle'});
 assert.equal(s.getState().progress.nodeId,'return_0');assert.equal(s.getState().progress.playableId,'vessel');assert.ok(s.getState().progress.editResult!.afterText.includes('나는 나의 사명을 완수해야 한다.'));
 const snapshot=structuredClone(s.getState().progress);s.getState().confirmCore({identity:'apostle'});assert.deepEqual(s.getState().progress,snapshot);
 advanceTo(s,'name');s.getState().name('  ');assert.equal(s.getState().progress.nodeId,'name');s.getState().name('세라');advanceTo(s,'curtaincall_4');assert.equal(s.getState().progress.playableId,'inquisitor');assert.equal(s.getState().progress.completed,true);advanceTo(s,'village');assert.equal(s.getState().progress.phase,'village');
 s.getState().visit('church');s.getState().church();assert.equal(s.getState().progress.phase,'church');s.getState().village();
 assert.deepEqual(createPrologueStore(storage).getState().progress,s.getState().progress);assert.equal(decodePrologue(values.get(PROLOGUE_SAVE_KEY)!).name,'세라');assert.ok(before.ink.altar);
});
test('questions stay mandatory and keyword collection is optional for direct ink editing',()=>{
 const {store:s}=setup();s.getState().start();s.getState().finishQuestions();assert.equal(s.getState().progress.nodeId,'myth_0');startDungeon(s,'no','called',false);assert.equal(s.getState().progress.keywords.length,0);
 inspect(s,'keyword_cache');assert.equal(s.getState().progress.keywords.length,0);reachCore(s);
});
test('shared text physics: bold blocks, crossed text passes, underline unfolds; cancelled preview leaves world unchanged',()=>{
 const original=initialEnvironment(),wall=texts.find(t=>t.id==='absolute_wall')!,bridge=texts.find(t=>t.id==='trust_path')!;
 assert.equal(textPhysics(wall,original).solid,true);const preview=applyRule(original,rules.find(r=>r.id==='wall_rule')!,'crossed',[]);assert.equal(textPhysics(wall,preview).solid,false);assert.equal(textPhysics(wall,original).solid,true);
 assert.equal(textPhysics(texts.find(t=>t.id==='ghost_wall')!,original).solid,false);assert.equal(textPhysics(bridge,original).solid,true);
 const unfolded=applyRule(original,rules.find(r=>r.id==='bridge_rule')!,'companion',['companion']);assert.equal(textPhysics(bridge,unfolded).solid,false);assert.equal(textPhysics(bridge,unfolded).unfolded,true);
 assert.equal(exitAvailable('to_altar',original),false);assert.throws(()=>applyRule(original,rules[0],'script',[]));
});
test('ink positions persist, repeat drops are idempotent, and reset restores the world',()=>{
 const {store:s,storage}=setup();startDungeon(s);erase(s,'blocks');const checkpoint=structuredClone(s.getState().progress);erase(s,'blocks');assert.deepEqual(s.getState().progress,checkpoint);
 const restored=createPrologueStore(storage);assert.equal(restored.getState().error,null);assert.deepEqual(restored.getState().progress.ink.betrayal,checkpoint.ink.betrayal);
 restored.getState().editStroke('betrayal',null,strikeRoom('betrayal').anchor);assert.equal(restored.getState().progress.environment.wall,'solid');assert.equal(restored.getState().progress.environment.bridge,'open');
});
test('forced events survive reload and stale inputs do not skip mandatory phases',()=>{
 const {store:s,storage}=setup();s.getState().start();advanceTo(s,'rescue');s.getState().choose('rescue','no');const copy=createPrologueStore(storage);assert.equal(copy.getState().progress.nodeId,'forced_yes');copy.getState().choose('rescue','yes');assert.equal(copy.getState().progress.nodeId,'forced_yes');
 advanceTo(copy,'threat');copy.getState().choose('threat','called');advanceTo(copy,'obedience');assert.equal(createPrologueStore(storage).getState().progress.guard,0);copy.getState().advance('threat');assert.equal(copy.getState().progress.nodeId,'obedience');
 advanceTo(copy,'questions');copy.getState().advance('questions');copy.getState().enter();assert.equal(copy.getState().progress.nodeId,'questions');
});
test('stability immunity, zero-state retry preserves progress and core draft is not saved',()=>{
 const {store:s,storage}=setup();startDungeon(s);erase(s,'blocks');s.getState().hit('betrayal_chaser',{x:650,y:480},10000);s.getState().hit('betrayal_chaser',{x:650,y:480},10500);assert.equal(s.getState().progress.dungeon.stability,2);
 s.getState().hit('betrayal_chaser',{x:650,y:480},11000);s.getState().hit('betrayal_chaser',{x:650,y:480},12000);assert.equal(s.getState().progress.dungeon.stability,0);assert.equal(createPrologueStore(storage).getState().error,null);
 s.getState().retry();assert.equal(s.getState().progress.dungeon.stability,3);assert.equal(s.getState().progress.environment.bridge,'open');reachCore(s);const r=createPrologueStore(storage);assert.equal(r.getState().progress.phase,'core');assert.equal(r.getState().progress.editResult,null);
});
test('corrupt save is preserved; save failure allows retry; old Emilia key is untouched',()=>{
 const {store:s,values,storage}=setup();values.set('nyarlathotep-vn.save.v1','old-save');s.getState().start();assert.equal(values.get('nyarlathotep-vn.save.v1'),'old-save');
 const raw=JSON.parse(values.get(PROLOGUE_SAVE_KEY)!);raw.state.completed=true;values.set(PROLOGUE_SAVE_KEY,JSON.stringify(raw));const broken=createPrologueStore(storage);assert.ok(broken.getState().error);const keep=values.get(PROLOGUE_SAVE_KEY);broken.getState().retrySave();assert.equal(values.get(PROLOGUE_SAVE_KEY),keep);
 let denied=true;const flaky=createPrologueStore({getItem:()=>null,setItem:()=>{if(denied)throw new Error('quota');}});flaky.getState().start();assert.ok(flaky.getState().error);denied=false;flaky.getState().retrySave();assert.equal(flaky.getState().error,null);
});
test('all assets exist and open text world has a walkable approach to each interaction',()=>{
 for(const src of [scenario.background,...scenario.characters.map(c=>c.standing),...dungeon.rooms.map(r=>r.backgroundImage!),...Object.values(dungeon.art)])assert.ok(existsSync(new URL('../public'+src,import.meta.url)),src);
 const state={...initialEnvironment(),wall:'crossed',bridge:'open',negation:'detached',door:'open',seal:'broken',identity:'unsealed'};
 for(const room of dungeon.rooms){const queue=[room.start],seen=new Set([`${room.start.x},${room.start.y}`]);for(let i=0;i<queue.length;i++)for(const [dx,dy]of [[20,0],[-20,0],[0,20],[0,-20]]){const point={x:queue[i].x+dx,y:queue[i].y+dy},key=`${point.x},${point.y}`;if(seen.has(key)||!validPosition(point,room)||texts.some(t=>t.roomId===room.id&&textPhysics(t,state).solid&&point.x+18>t.x&&point.x-18<t.x+t.w&&point.y+18>t.y&&point.y-18<t.y+t.h))continue;seen.add(key);queue.push(point);}for(const o of room.objects)assert.ok(queue.some(p=>Math.hypot(p.x-o.x,p.y-o.y)<110),o.id);}
 const source=readFileSync(new URL('../src/content/prologue/story.json',import.meta.url),'utf8');assert.ok(source.includes('태양의 신'));assert.ok(!meta.night_claim.event);
});
