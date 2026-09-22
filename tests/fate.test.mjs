import test from 'node:test';
import assert from 'node:assert/strict';
import {rollOfFate} from '../scripts/roll-of-fate.mjs';
test('Fate uses selected character tokens only, handles zero/one, and always posts publicly',async()=>{
  let warned=0,rolled=0,created=[];
  globalThis.game={user:{isGM:true},modules:new Map([['morelord-core',{active:true}]])};
  globalThis.MorelordCore={socket:{createChannel(){}},ui:{participation:{},actorIdentity:a=>a.name},rolls:{skill(){}}};
  globalThis.ui={notifications:{warn:()=>warned++}};
  globalThis.canvas={tokens:{controlled:[]}};
  globalThis.ChatMessage={getSpeaker:()=>({}),create:async(data,options)=>{created.push({data,options});return data;}};
  globalThis.Roll=class {constructor(formula){assert.equal(formula,'1d2');}async evaluate(){rolled++;return {total:2};}};
  assert.equal(await rollOfFate(),null);assert.equal(warned,1);assert.equal(created.length,0);
  const token=(name,type='character')=>({name,actor:{type,name,uuid:`Actor.${name}`},document:{uuid:`Scene.s.Token.${name}`}});
  canvas.tokens.controlled=[token('Goblin','npc'),token('A')];await rollOfFate();assert.equal(rolled,0);assert.match(created[0].data.content,/A shall be targeted/);
  canvas.tokens.controlled.push(token('B'));await rollOfFate();assert.equal(rolled,1);assert.match(created[1].data.content,/B shall be targeted/);
  assert.deepEqual(created[1].data.whisper,[]);assert.equal(created[1].data.blind,false);assert.equal(created[1].options.messageMode,'public');
});
