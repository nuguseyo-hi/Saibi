import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDungeon, initialDungeon, direction, validPosition, applyPuzzle, settleDoors, objectAvailable, validateDungeonProgress } from '../src/dungeon/model.ts';
import { parseScenario } from '../src/domain/scenario.ts';
import { parseMindEvents, createDraft } from '../src/domain/mind/editing.ts';
import { createGameStore } from '../src/store/gameStore.ts';
import { createSavePort, decodeSave, SAVE_KEY } from '../src/services/storage.ts';
const read=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const data=parseDungeon(read('../src/content/dungeons/emilia.json'));
const scenario=parseScenario(read('../src/content/scenarios/intro.json'));
const events=parseMindEvents(read('../src/content/mind-scenes/bells.json'),scenario);
const core=events.find(e=>e.id===data.coreEventId)!;
function setup(dev=true){
  const values=new Map<string,string>();
  const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
  const port=createSavePort(()=>storage,scenario,events,data);
  const store=createGameStore(scenario,events,port,{dungeon:data,development:dev});
  return {store,values,port};
}
type Store=ReturnType<typeof createGameStore>;
function object(store:Store,id:string){return data.rooms.find(r=>r.id===store.getState().dungeon!.roomId)!.objects.find(o=>o.id===id)!;}
function use(store:Store,id:string){const o=object(store,id);if(o.kind==='door')store.getState().travelDungeon(id,o);else assert.equal(store.getState().inspectDungeon(id,o),true);}
function reachCore(store:Store){
  use(store,'to_corridor');
  use(store,'bell_fragment');use(store,'bell_fragment');assert.equal(store.getState().dungeon!.fragments.length,1);
  use(store,'to_letters');assert.equal(store.getState().dungeon!.roomId,'corridor');
  use(store,'door_inscription');store.getState().solveDungeonPuzzle('door_inscription','already');
  use(store,'to_letters');assert.equal(store.getState().dungeon!.roomId,'letters');
  use(store,'letter_fragment');
  assert.equal(store.getState().inspectDungeon('tower_fragment',object(store,'tower_fragment')),false);
  use(store,'letter_puzzle');store.getState().solveDungeonPuzzle('letter_puzzle','gather');
  use(store,'tower_fragment');use(store,'to_heart');assert.equal(store.getState().dungeon!.roomId,'heart');
  store.getState().openDungeonCore('core_bell',object(store,'core_bell'));
  assert.equal(store.getState().screen,'mindEdit');
}
test('dungeon data validates; all room interactions have reachable collision-free approaches',()=>{
  assert.equal(data.rooms.length,4);
  // Grid flood fill: layout reachability with the same player clearance as runtime saves.
  for(const room of data.rooms){
    const step=20,start={x:Math.round(room.start.x/step)*step,y:Math.round(room.start.y/step)*step};
    const queue=[start],seen=new Set([`${start.x},${start.y}`]);
    for(let i=0;i<queue.length;i++)for(const [dx,dy] of [[step,0],[-step,0],[0,step],[0,-step]]){
      const p={x:queue[i].x+dx,y:queue[i].y+dy},key=`${p.x},${p.y}`;
      if(!seen.has(key)&&validPosition(p,room)){seen.add(key);queue.push(p);}
    }
    for(const o of room.objects)assert.ok(queue.some(p=>Math.hypot(p.x-o.x,p.y-o.y)<data.rules.interactionRadius),`${room.id}/${o.id} unreachable`);
    assert.equal(validPosition({x:0,y:0},room),false);
    for(const o of room.obstacles)assert.equal(validPosition({x:o.x+o.w/2,y:o.y+o.h/2},room),false);
  }
  assert.equal(Math.round(Math.hypot(...Object.values(direction(1,1,220)))),220);
  const broken=structuredClone(data);broken.rooms[0].objects[1].targetRoom='missing';assert.throws(()=>parseDungeon(broken));
});
test('all three door rules and delayed deadline survive serialization',()=>{
  const puzzle=data.puzzles.find(p=>p.id==='door_rule')!;
  const door=data.rooms[1].objects.find(o=>o.id==='to_letters')!;
  let d=applyPuzzle(initialDungeon(data),puzzle,'never',1000);assert.equal(objectAvailable(d,door),false);
  d=applyPuzzle(d,puzzle,'someday',1000);assert.equal(objectAvailable(settleDoors(d,4999),door),false);
  d=JSON.parse(JSON.stringify(d));assert.equal(objectAvailable(settleDoors(d,5000),door),true);
  d=applyPuzzle(d,puzzle,'already',1000);assert.equal(objectAvailable(d,door),true);
  assert.throws(()=>applyPuzzle(d,puzzle,'hacked',1000));
});
test('normal confession enters dungeon; production debug entry does nothing',()=>{
  const {store}=setup(false);store.getState().debugDungeon();assert.equal(store.getState().screen,'title');
  store.getState().start();
  for(const id of ['arrival','greeting','welcome'])store.getState().advance(id);
  store.getState().choose('question','comfort');
  for(const id of ['comfort_reply','comfort_end','confession_intro','bell_memory'])store.getState().advance(id);
  assert.equal(store.getState().screen,'dungeon');assert.equal(store.getState().infiltration.elin.attempts,1);
});
for(const word of ['coincidence','revelation','illusion'])test(`four rooms → ${word} → saved result → matching confession`,()=>{
  const {store,port}=setup();store.getState().debugDungeon();reachCore(store);
  const session=store.getState().activeMind!.id;
  const baseline=structuredClone(store.getState().characterFlags);
  const draft={...createDraft(core),core_belief:word};
  store.getState().cancelEdit(session);assert.equal(store.getState().screen,'dungeon');assert.deepEqual(store.getState().characterFlags,baseline);
  store.getState().openDungeonCore('core_bell',object(store,'core_bell'));
  store.getState().confirmEdit(session,draft);assert.equal(store.getState().screen,'dungeonResult');
  assert.equal(store.getState().dungeon!.outcomeId,`core_${word}`);
  const checkpoint=structuredClone(store.getState().checkpoint);store.getState().confirmEdit(session,draft);assert.deepEqual(store.getState().checkpoint,checkpoint);
  const restored=createGameStore(scenario,events,port,{dungeon:data});assert.equal(restored.getState().saveError,null);
  assert.deepEqual(restored.getState().checkpoint,checkpoint);
  restored.getState().finishDungeon();assert.equal(restored.getState().nodeId,`dungeon_${word}`);
  assert.equal(restored.getState().characterFlags.elin.nyarlathotepRevelation,word==='revelation');
  const final=createGameStore(scenario,events,port,{dungeon:data});assert.equal(final.getState().saveError,null);
});
test('damage immunity, failure penalty once, two attempts and next-night recovery',()=>{
  const {store,port}=setup();store.getState().debugDungeon();use(store,'to_corridor');use(store,'bell_fragment');
  let time=10000;
  const hit=()=>store.getState().dungeonHit('denial_01',{x:740,y:430},time);
  hit();assert.equal(store.getState().dungeon!.stability,2);time+=999;hit();assert.equal(store.getState().dungeon!.stability,2);
  time++;hit();time+=1000;hit();hit();assert.equal(store.getState().screen,'dungeonResult');assert.equal(store.getState().infiltration.elin.guard,20);
  assert.equal(createGameStore(scenario,events,port,{dungeon:data}).getState().saveError,null);
  store.getState().finishDungeon();store.getState().advance('bell_memory');assert.equal(store.getState().screen,'dungeon');
  assert.equal(store.getState().dungeon!.fragments.length,1);use(store,'to_corridor');
  for(let i=0;i<3;i++){time+=1000;hit();}store.getState().finishDungeon();
  store.getState().advance('bell_memory');assert.equal(store.getState().screen,'dialogue');assert.equal(store.getState().infiltration.elin.guard,30);
  store.getState().nextNight();store.getState().advance('bell_memory');assert.equal(store.getState().screen,'dungeon');assert.equal(store.getState().infiltration.elin.night,2);
});
test('exploration, temporary core edit and retreat restore without losing confirmed progress',()=>{
  const {store,port}=setup();store.getState().debugDungeon();use(store,'to_corridor');use(store,'bell_fragment');
  const reload=createGameStore(scenario,events,port,{dungeon:data});assert.equal(reload.getState().saveError,null);assert.equal(reload.getState().dungeon!.fragments.length,1);
  reload.getState().retreatDungeon();assert.equal(createGameStore(scenario,events,port,{dungeon:data}).getState().saveError,null);
  reload.getState().advance('bell_memory');reachCore(reload);
  const editing=createGameStore(scenario,events,port,{dungeon:data});assert.equal(editing.getState().screen,'mindEdit');assert.equal(editing.getState().editResults.length,0);
});
test('schema-1 migration preserves recorded text, flags and progress; invalid data stays rejected',()=>{
  const {store,values}=setup();store.getState().start();
  const raw=JSON.parse(values.get(SAVE_KEY)!);raw.schemaVersion=1;raw.contentVersion='confession-1';
  delete raw.state.dungeon;delete raw.state.infiltration;delete raw.state.characterFlags.elin.nyarlathotepRevelation;
  raw.state.log[0].text='이전 버전에서 실제 표시된 문장';raw.state.characterFlags.elin.bellRevelation=true;
  const migrated=decodeSave(JSON.stringify(raw),scenario,events,data);
  assert.equal(migrated.log[0].text,raw.state.log[0].text);assert.equal(migrated.characterFlags.elin.bellRevelation,true);assert.equal(migrated.dungeon,null);
  const invalid=initialDungeon(data);invalid.fragments=['unknown'];assert.equal(validateDungeonProgress(invalid,data),false);
  raw.schemaVersion=99;assert.throws(()=>decodeSave(JSON.stringify(raw),scenario,events,data));
});
