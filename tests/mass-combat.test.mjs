import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveMassCombat,massCombatCommand} from '../scripts/mass-combat.mjs';
const target=(id,hp,other={})=>({id,hp,temp:0,ac:12,normal:7,critical:11,...other});

test('focus fire uses later attacks on later targets, never spillover damage',()=>{
  const result=resolveMassCombat([15,15,15],3,[target('a',5),target('b',12),target('c',10)]);
  assert.equal(result.dropped,2);assert.equal(result.hits,3);
  assert.deepEqual(result.rows.map(r=>[r.id,r.hp,r.hits]),[['a',0,1],['b',0,2],['c',10,0]]);
  assert.equal(result.rows[0].damage,5);
});
test('each target uses its own AC; natural 1 misses and natural 20 hits',()=>{
  const result=resolveMassCombat([1,2,20,15,20],10,[target('a',11,{ac:99}),target('b',20,{ac:30})]);
  assert.equal(result.rows[0].attempts,3);assert.equal(result.rows[0].hp,0);
  assert.equal(result.rows[1].attempts,2);assert.equal(result.rows[1].hp,9);
  assert.equal(result.hits,2);
});
test('temporary HP, per-hit resistance and immunity remain separate',()=>{
  const result=resolveMassCombat([15,15,15,15,15],3,[target('a',4,{temp:2,normal:3}),target('b',8,{normal:0,critical:0})]);
  assert.equal(result.rows[0].hp,0);assert.equal(result.rows[0].temp,0);
  assert.equal(result.rows[1].hp,8);assert.equal(result.rows[1].hits,3);
  assert.equal(result.dropped,1);
});
test('unused attacks stop once the last target falls',()=>{
  const result=resolveMassCombat([20,20,20],3,[target('a',3)]);
  assert.equal(result.used,1);assert.equal(result.unused,2);
  assert.equal(result.rows[0].before.hp,3);
});
test('three native macro commands compile independently',async()=>{
  const source=await readFile(new URL('../scripts/mass-combat.mjs',import.meta.url),'utf8');
  for(const action of ['attackers','resolve','apply'])assert.doesNotThrow(()=>new (Object.getPrototypeOf(async()=>{}).constructor)(massCombatCommand(source,action)));
});
