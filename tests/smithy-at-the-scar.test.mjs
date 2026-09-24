import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {edgePositions,nextRoster,overlaps,smithyMacroCommand,smithy,chooseSmithyCombat} from '../scripts/smithy-at-the-scar.mjs';

test('all four waves and the ten reinforcement limit',()=>{
  assert.deepEqual(nextRoster({},'next',0),{wave:1,roster:{husk:12}});
  assert.throws(()=>nextRoster({wave:1},'next',1),/ten reinforcement/);
  for(let i=0;i<10;i++) assert.equal(nextRoster({wave:1,reinforcements:i,lastReinforcementRound:i},'reinforce',i+1),null);
  assert.throws(()=>nextRoster({wave:1,reinforcements:10},'reinforce',11),/ten reinforcement/);
  assert.throws(()=>nextRoster({wave:1,reinforcements:1,lastReinforcementRound:3},'reinforce',3),/already arrived/);
  assert.throws(()=>nextRoster({wave:1},'reinforce',0),/Start combat/);
  assert.deepEqual(nextRoster({wave:1,reinforcements:10},'next',10),{wave:2,roster:{ratling:20}});
  assert.deepEqual(nextRoster({wave:2},'next',10),{wave:3,roster:{husk:10,chimera:1}});
  assert.deepEqual(nextRoster({wave:3},'next',10),{wave:4,roster:{hulk:1,gutbuster:1,hunter:1,juggernaut:1}});
  assert.throws(()=>nextRoster({wave:4},'next',10),/four waves/);
  assert.throws(()=>nextRoster({wave:2},'reinforce',10),/only available/);
});

test('wave deployment reuses unlinked defenders combat and preserves its saved binding',()=>{
  const scene={id:'scar',tokens:new Map([['defender',{}]])};
  const combat={id:'party',scene:null,combatants:[{tokenId:'defender',sceneId:'scar'}]};
  const elsewhere={id:'other',scene:null,combatants:[{tokenId:'defender',sceneId:'elsewhere'}]};
  const combats=[combat,elsewhere];combats.get=id=>combats.find(c=>c.id===id);
  assert.equal(chooseSmithyCombat(scene,{},combats,combat),combat);
  assert.equal(chooseSmithyCombat(scene,{},combats,elsewhere),combat);
  assert.equal(chooseSmithyCombat(scene,{combatId:'party'},combats,elsewhere),combat);
});

test('large mixed waves remain inside all four map edges, clear of the center and existing troops',()=>{
  const rect={x:150,y:250,width:4000,height:3000},size=100;
  const occupied=[{x:200,y:400,width:100,height:100},{x:1000,y:1000,width:800,height:800}];
  const footprints=[{width:2,height:2},...Array.from({length:81},()=>({width:1,height:1}))];
  const positions=edgePositions({rect,size,footprints,occupied,random:()=>0});
  const taken=[...occupied],center={x:1150,y:1000,width:2000,height:1500};
  for(const [i,p] of positions.entries()) {
    const box={...p,width:footprints[i].width*size,height:footprints[i].height*size};
    assert.ok(box.x>=rect.x && box.y>=rect.y && box.x+box.width<=4150 && box.y+box.height<=3250);
    assert.ok(!overlaps(box,center));assert.ok(taken.every(b=>!overlaps(box,b)));taken.push(box);
  }
  assert.equal(positions[0].y,400);
  assert.equal(positions[1].x,3900);
  assert.equal(positions[2].y,3000);
  assert.equal(positions[3].x,300);
});

test('crowded or tiny maps fail rather than overlap or spill into the center',()=>{
  assert.throws(()=>edgePositions({rect:{x:0,y:0,width:1000,height:1000},size:100,footprints:[{width:1,height:1}],occupied:[{x:0,y:0,width:1000,height:1000}]}),/Not enough/);
  assert.throws(()=>edgePositions({rect:{x:0,y:0,width:400,height:400},size:100,footprints:[{width:2,height:2}]}),/Not enough/);
});

test('native macro exports compile without requiring the new module file',async()=>{
  const source=await readFile(new URL('../scripts/smithy-at-the-scar.mjs',import.meta.url),'utf8');
  const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
  for(const action of ['setup','next','reinforce','safe','status']) {
    const command=smithyMacroCommand(source,action);
    assert.doesNotThrow(()=>new AsyncFunction(command));
    assert.ok(!command.includes("import('/modules/morelord-game-master/scripts/smithy-at-the-scar.mjs')"));
  }
});

test('partial token creation retries saved IDs, without duplicate waves or changing allies',async()=>{
  class Collection extends Map {
    filter(fn){return [...this.values()].filter(fn);}
    map(fn){return [...this.values()].map(fn);}
    some(fn){return [...this.values()].some(fn);}
  }
  const clone=value=>structuredClone(value);
  let state={actors:{husk:'Actor.husk'},inset:1,combatId:'combat'},serial=0,fail=true;
  const tokens=new Collection([['ally',{id:'ally',x:2000,y:2000,width:1,height:1,actorId:'ally'}]]);
  const scene={id:'scene',grid:{type:1,size:100},name:'Test',dimensions:{sceneRect:{x:0,y:0,width:5000,height:5000}},tokens,
    getFlag:()=>state,setFlag:async(_id,_key,value)=>{state=clone(value);},
    async createEmbeddedDocuments(_type,values){
      if(tokens.size===4 && fail){fail=false;throw Error('Simulated interrupted create');}
      for(const value of values) tokens.set(value._id,{...clone(value),id:value._id});
    }};
  const combat={id:'combat',scene,round:0,combatants:new Collection(),
    async createEmbeddedDocuments(_type,values){for(const value of values){const id=`c${serial++}`;this.combatants.set(id,{...value,id});}},
    async rollInitiative(ids){for(const id of ids)this.combatants.get(id).initiative=10;}};
  const notifications=[];
  const saved={};for(const key of ['game','canvas','foundry','MorelordCore','ui','fromUuid'])saved[key]=globalThis[key];
  const error=console.error;console.error=()=>{};
  try {
    globalThis.game={user:{id:'gm',isGM:true},modules:new Map([['morelord-core',{active:true}]]),users:new Map([['gm',{id:'gm',active:true}]]),combats:new Collection([['combat',combat]])};
    globalThis.canvas={scene,ready:true};
    globalThis.foundry={utils:{deepClone:clone,randomID:()=>`token${serial++}`},applications:{api:{DialogV2:{wait:async()=>({action:'deploy'})}}}};
    globalThis.MorelordCore={users:{list:()=>[{id:'gm'}]},socket:{runSerialized:(_key,fn)=>fn()}};
    globalThis.ui={notifications:{info:m=>notifications.push(m),error:m=>notifications.push(m)}};
    globalThis.fromUuid=async()=>({type:'npc',getTokenDocument:async(data)=>({toObject:()=>({...data,actorId:'husk',width:1,height:1})})});
    await smithy('next');
    assert.equal(tokens.size,4);assert.equal(state.pending.tokens.length,12);assert.equal(state.wave,undefined);
    const plannedIds=state.pending.tokens.map(t=>t._id);
    await smithy('next');
    assert.equal(tokens.size,13);assert.equal(combat.combatants.size,12);assert.equal(state.wave,1);assert.equal(state.pending,null);
    assert.ok(plannedIds.every(id=>tokens.has(id)));
    assert.deepEqual(tokens.get('ally'),{id:'ally',x:2000,y:2000,width:1,height:1,actorId:'ally'});
    await smithy('next');
    assert.equal(tokens.size,13);assert.match(notifications.at(-1),/ten reinforcement/);
  } finally {console.error=error;for(const [key,value] of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
