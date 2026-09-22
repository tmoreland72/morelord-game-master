import {ID} from "../core.mjs";
import {core,createRequest,rollRequest,foragingTerrains} from "../requests.mjs";
import {executeTrigger} from "../triggers.mjs";
import {assert} from "../../../morelord-core/scripts/testing/in-game.js";
const wait = async fn => { for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,50));}throw new Error("Expected Game Master UI did not render."); };
export const gameMasterChecks=[{
  id:"morelord-game-master.core-chat-private-rolls",
  async run(){
    assert(game.user.isGM,"Run this check as a GM or Assistant GM.");
    const api=game.modules.get(ID)?.api;
    assert(api && core().socket.ready,"Game Master and Core must be ready.");
    const player=core().users.list().find(u=>!u.isGM);
    assert(player,"Create a non-ignored player test account first.");
    const wasOpen=document.body.classList.contains("mlgm-open"),requests=[];
    let actor,dialog;
    try{
      actor=await Actor.create({name:"MLGM regression fixture",type:"character",ownership:{default:0,[player.id]:3},system:{attributes:{hp:{value:0,max:10}}}});
      api.toggle(true);
      document.querySelector('#mlgm [data-action="tab"][data-id="rolls"]').click();
      assert(document.querySelector('#mlgm-tab-rolls').textContent==="Roll Requests","Tab uses the requested name.");
      assert(document.querySelector('[data-roll-card="death"] strong').textContent==="Death Saving Throw","Death save card uses its neutral title.");
      assert(!document.querySelector('#mlgm-panel.ml-surface, #mlgm-panel .gm-column'),"Roll cards have no outer section or column headers.");
      assert(document.querySelector('[data-roll-card="encounter"] select[name="die"]'),"Encounter die uses a dropdown.");
      assert(document.querySelectorAll('[data-roll-card] input[name="blind"]').length===document.querySelectorAll('[data-roll-card]').length,"Every roll card has a blind toggle.");
      const columns=[...document.querySelectorAll('.gm-roll-column')];
      assert(columns.length===3 && columns[0].querySelector('[data-roll-card="encounter"]') && columns[1].querySelector('[data-roll-card="group"]') && columns[2].querySelector('[data-roll-card="player"]'),"Roll cards retain three independent columns.");
      assert(getComputedStyle(columns[0]).alignSelf==='start',"Columns use their own card heights.");
      assert([...document.querySelectorAll('#mlgm [role=tab]')].map(el=>el.textContent).join('|')==='Roll Requests|Macros|Sound|Triggers|Campaign AI|Player Settings',"Tabs use the requested names and order.");
      assert(document.querySelector('#mlgm .ml-page-body'),"Core page layout is initialized.");
      const pending=api.requestCheck({actorIds:[actor.id],skill:"prc",dc:12});
      await wait(()=>document.querySelector(`input[name="actorUuids"][value="${actor.uuid}"]`));
      const checkbox=document.querySelector(`input[name="actorUuids"][value="${actor.uuid}"]`);
      assert(checkbox.checked && checkbox.closest('.ml-actor-choice'),"Character verification uses the selected Core actor choice.");
      dialog=checkbox.closest('.application');
      assert(dialog?.classList.contains('ml-window'),"Verification uses Core's dialog shell.");
      checkbox.closest('form').querySelector('button[data-action="run"]').click();
      const skill=await pending;requests.push(skill.id);
      assert(!skill.blind&&!skill.whisper.length,"Roll-request cards are public even when their results are blind.");
      assert(skill.content.includes('DC 12'),"Supplied DC appears in the request card.");
      assert(!document.querySelector('.mlgm-player-prompt'),"Requests do not open player prompts.");
      const replies=await Promise.all([rollRequest(skill.id,actor.id),rollRequest(skill.id,actor.id)]);
      assert(replies.every(r=>r.accepted && !("total" in r)),"Acknowledgements contain no totals.");
      const results=game.messages.filter(m=>m.getFlag(ID,'result')?.requestId===skill.id);
      assert(results.length===1,"Simultaneous clicks produce exactly one result.");
      assert(results[0].blind && results[0].whisper.length===game.users.filter(u=>u.isGM).length,"Result is blind to all GMs including assistants.");
      assert(results[0].whisper.every(id=>game.users.get(id)?.isGM),"No player receives result content.");
      const summary=game.messages.find(m=>m.getFlag(ID,'summary')?.requestId===skill.id);
      assert(summary?.content.includes(actor.name) && summary.content.includes('Average:') && /Pass|Fail/.test(summary.content),"Private summary shows each roll, pass/fail, and average in chat.");
      assert(summary.blind && summary.whisper.every(id=>game.users.get(id)?.isGM),"Summary is private to GMs and assistants.");
      assert(!document.querySelector('#mlgm-panel').textContent.includes("Average:"),"Check results appear only in chat, not in the tray.");
      for (const [mode,automatic,expected] of [["adv",0,1],["dis",0,-1],["normal",1,1],["dis",1,0],["normal",-1,-1]]) {
        await actor.update({'system.skills.prc.roll.mode':automatic});
        const request=await createRequest({kind:'skill',actorIds:[actor.id],skill:'prc'});requests.push(request.id);
        assert(request.content.includes('ml-roll-controls'),"Skill requests provide DIS / Roll / ADV.");
        if (automatic === 0) {
          await wait(()=>document.querySelector(`[data-message-id="${request.id}"] [data-mlgm-mode="${mode}"]`));
          document.querySelector(`[data-message-id="${request.id}"] [data-mlgm-mode="${mode}"]`).click();
          await wait(()=>game.messages.some(m=>m.getFlag(ID,'result')?.requestId===request.id));
        } else await rollRequest(request.id,actor.id,undefined,mode);
        const result=game.messages.find(m=>m.getFlag(ID,'result')?.requestId===request.id);
        assert(result.rolls[0].options.advantageMode===expected,`Native skill roll handles ${mode} with automatic mode ${automatic}.`);
      }
      const encounter=await createRequest({kind:'encounter',die:8,actorIds:[actor.id]});requests.push(encounter.id);
      assert(!encounter.content.includes('DC '),"Blank DC is omitted.");
      assert(!encounter.content.includes('ml-roll-controls'),"Encounter dice do not offer skill modifiers.");
      await rollRequest(encounter.id,actor.id);
      const deathBefore=foundry.utils.deepClone(actor.system.attributes.death);
      const death=await createRequest({kind:'death',actorIds:[actor.id]});requests.push(death.id);await rollRequest(death.id,actor.id);
      assert(actor.system.attributes.death.success===deathBefore.success && actor.system.attributes.death.failure===deathBefore.failure && actor.system.attributes.hp.value===0,"Blind death saves do not disclose outcome through actor updates.");
      const search=await createRequest({kind:'delerium',zoneId:'outer',actorIds:[actor.id]});requests.push(search.id);
      await rollRequest(search.id,actor.id,'inv');
      assert(game.messages.some(m=>m.getFlag(ID,'search')?.requestId===search.id),"Delerium search creates its private summary.");
      const terrains=await foragingTerrains();
      const forage=await createRequest({kind:'foraging',skill:'sur',terrainIndex:2,actorIds:[actor.id]});requests.push(forage.id);
      assert(forage.getFlag(ID,'request').dc===terrains[2].value,"Foraging uses Journeys configured terrain DC.");
      await rollRequest(forage.id,actor.id);
      const food=game.messages.find(m=>m.getFlag(ID,'summary')?.requestId===forage.id);
      assert(food?.content.includes('Food found:') && !food.content.includes('Average'),"Foraging reports food and individual outcomes in private chat.");
      return {requests:requests.length,core:game.modules.get('morelord-core').version};
    } finally {
      if(dialog?.isConnected){const app=Object.values(ui.windows).find(a=>a.element===dialog);await app?.close();}
      const messages=game.messages.filter(m=>requests.includes(m.id)||requests.includes(m.getFlag(ID,'result')?.requestId)||requests.includes(m.getFlag(ID,'search')?.requestId)||requests.includes(m.getFlag(ID,'summary')?.requestId));
      if(messages.length)await ChatMessage.deleteDocuments(messages.map(m=>m.id));
      if(actor)await actor.delete();
      api.toggle(wasOpen);
    }
  }
},{
  id:"morelord-game-master.native-character-triggers",
  async run() {
    const fixtures=[],sources=[],requests=[],board=foundry.utils.deepClone(game.settings.get(ID,"board"));
    await game.settings.set(ID,"board",{...board,triggers:[]});
    try {
      const original=game.actors.get('1c2n8qWMYl3rXPpe');
      assert(original,"Grim Shara must exist for this native feature regression.");
      const data=original.toObject();delete data._id;data.name="MLGM Sneak Attack fixture";
      const actor=await Actor.create(data);fixtures.push(actor);
      const weapon=actor.items.find(i=>i.name==='Shortsword'),feature=actor.items.find(i=>i.system.identifier==='sneak-attack');
      const roll=await new CONFIG.Dice.D20Roll('1d20+100',{}, {advantageMode:1}).evaluate({allowInteractive:false});
      const source=await ChatMessage.create({type:'attack',speaker:ChatMessage.getSpeaker({actor}),rolls:[roll],system:{item:{id:weapon.id,uuid:weapon.uuid,name:weapon.name,type:'weapon'},targets:[{actor:actor.uuid,name:actor.name,ac:1}]},blind:true,whisper:[game.user.id]});sources.push(source.id);
      const trigger={id:'mlgm-test-sneak',actorId:'legacy-unrelated-character',itemId:'legacy-unrelated-feature',kind:'sneak'};
      assert(!await executeTrigger(trigger,source),"Sneak Attack waits for weapon damage.");
      const weaponDamage=await ChatMessage.create({type:'damage',speaker:ChatMessage.getSpeaker({actor}),rolls:[await new Roll('1d6').evaluate()],system:{item:{id:weapon.id,uuid:weapon.uuid,name:weapon.name,type:'weapon'},origin:source.id},blind:true,whisper:[game.user.id]});sources.push(weaponDamage.id);
      assert(await executeTrigger(trigger,weaponDamage),"Native qualifying attack rolls Sneak Attack.");
      assert(!await executeTrigger(trigger,weaponDamage),"The same attack cannot roll Sneak Attack twice.");
      const damage=game.messages.find(m=>m.getFlag(ID,'triggerResult')?.sourceId===source.id);
      assert(damage?.rolls[0].total>0 && damage.rolls[0].options.type==='piercing',"Sneak Attack uses native scaling and the weapon damage type.");
      assert(damage.blind && damage.whisper.every(id=>game.users.get(id).isGM),"Triggered damage is GM-only.");
      const rhyndor=game.actors.get('kvdHdccUF1gVumUm').toObject();delete rhyndor._id;rhyndor.name='MLGM Sorcerer fixture';rhyndor.ownership={default:0,[core().users.list().find(u=>!u.isGM).id]:3};
      const sorcerer=await Actor.create(rhyndor);fixtures.push(sorcerer);
      for (const [name,expected] of [['Light',false],['Chromatic Orb',true]]) {
        const item=sorcerer.items.find(i=>i.name===name);
        const cast=await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:sorcerer}),content:'Trigger regression fixture',flags:{[ID]:{triggerUse:{actorId:sorcerer.id,itemId:item.id,activityType:"utility",needsDamage:false,completed:false}}},whisper:[game.user.id]});sources.push(cast.id);
        const triggerRule={id:'mlgm-test-surge',kind:'sorcerer',tableUuid:'Compendium.morelord-game-master.roll-tables.RollTable.aDMFCKJcdKaJjTc6'};
        assert(!await executeTrigger(triggerRule,cast),"Wild Magic cannot trigger before casting completes.");
        await cast.setFlag(ID,'triggerUse',{...cast.getFlag(ID,'triggerUse'),completed:true});
        if (expected) {
          await cast.setFlag(ID,'triggerUse',{...cast.getFlag(ID,'triggerUse'),activityType:'attack',needsDamage:true});
          assert(!await executeTrigger(triggerRule,cast),"Wild Magic waits for the spell attack.");
          const attack=await ChatMessage.create({type:'attack',speaker:ChatMessage.getSpeaker({actor:sorcerer}),rolls:[await new CONFIG.Dice.D20Roll('1d20').evaluate()],system:{item:{id:item.id,uuid:item.uuid,name:item.name,type:'spell'},origin:cast.id},blind:true,whisper:[game.user.id]});sources.push(attack.id);
          assert(await executeTrigger(triggerRule,attack),"Wild Magic requests its d20 immediately after the attack without damage.");
        }

        const fired=await executeTrigger({id:'mlgm-test-surge',kind:'sorcerer',actorId:'legacy-unrelated-character',tableUuid:'Compendium.morelord-game-master.roll-tables.RollTable.aDMFCKJcdKaJjTc6'},cast);
        assert(!fired,"Racial spells do not trigger and an already handled spell cannot trigger twice.");
        if (expected) {
          const request=game.messages.find(m=>m.getFlag(ID,'request')?.sourceId===cast.id);requests.push(request.id);
          assert(!request.blind&&!request.whisper.length,"Wild Magic d20 request is public.");
          assert(!game.messages.some(m=>m.getFlag(ID,'surgeTable')===request.id),"Casting requests d20 before any surge table.");
          await rollRequest(request.id,sorcerer.id);
          const result=game.messages.find(m=>m.getFlag(ID,'result')?.requestId===request.id);
          const outcome=result.getFlag(ID,'surge');
          assert(outcome.threshold===1 && outcome.nextThreshold===(result.rolls[0].total===1?1:2),"Initial d20 uses threshold one.");
          await sorcerer.setFlag(ID,'surges.mlgm-test-surge',{threshold:20});
          const guaranteed=await createRequest({kind:'surge',actorIds:[sorcerer.id],triggerId:'mlgm-test-surge',tableUuid:'Compendium.morelord-game-master.roll-tables.RollTable.aDMFCKJcdKaJjTc6'});requests.push(guaranteed.id);
          await rollRequest(guaranteed.id,sorcerer.id);
          const rolled=game.messages.find(m=>m.getFlag(ID,'result')?.requestId===guaranteed.id);
          assert(game.messages.filter(m=>m.getFlag(ID,'surgeTable')===rolled.id).length===1,"Qualifying d20 rolls the native table once.");
          assert(sorcerer.getFlag(ID,'surges.mlgm-test-surge').threshold===1,"A surge resets the threshold.");
          await rollRequest(guaranteed.id,sorcerer.id);
          assert(game.messages.filter(m=>m.getFlag(ID,'surgeTable')===rolled.id).length===1,"Duplicate request cannot surge again.");
        }
      }
    } finally {
      const resultIds=game.messages.filter(m=>requests.includes(m.getFlag(ID,'result')?.requestId)).map(m=>m.id);
      const ids=game.messages.filter(m=>sources.includes(m.id)||sources.includes(m.getFlag(ID,'triggerResult')?.sourceId)||requests.includes(m.id)||resultIds.includes(m.id)||resultIds.includes(m.getFlag(ID,'surgeTable'))).map(m=>m.id);
      if(ids.length)await ChatMessage.deleteDocuments(ids);
      for(const actor of fixtures)await actor.delete();
      await game.settings.set(ID,"board",board);
    }
  }
},{
  id:"morelord-game-master.soundboard-macro-menu",
  async run() {
    const api=game.modules.get(ID).api,previous=foundry.utils.deepClone(game.settings.get(ID,'macros'));
    let macro;
    try {
      api.toggle(true);
      document.querySelector('#mlgm [data-action="tab"][data-id="triggers"]').click();
      assert(!document.querySelector('#mlgm [data-action="new-trigger"]').closest('#mlgm-panel'),"New Trigger is outside the content section.");
      const triggerCards=[...document.querySelectorAll('.gm-trigger-card')];
      for(const card of triggerCards) {
        const footer=card.querySelector('.gm-trigger-actions');
        assert(footer.textContent.trim()===''&&footer.querySelectorAll('button[aria-label]').length===3,"Trigger status and actions are accessible icons only.");
        assert(Math.abs(footer.getBoundingClientRect().bottom-(card.getBoundingClientRect().bottom-parseFloat(getComputedStyle(card).paddingBottom)-parseFloat(getComputedStyle(card).borderBottomWidth)))<2,"Trigger controls align with the bottom of their card.");
      }

      macro=await Macro.create({name:'MLGM macro fixture',type:'script',img:'icons/svg/dice-target.svg',command:'globalThis.mlgmMacroTestRuns=(globalThis.mlgmMacroTestRuns ?? 0)+1;'});
      document.querySelector('#mlgm [data-action="tab"][data-id="macros"]').click();
      const transfer=new DataTransfer();transfer.setData('text/plain',JSON.stringify({type:'Macro',uuid:macro.uuid}));
      document.querySelector('#mlgm-panel').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));
      await wait(()=>document.querySelector(`[data-macro-uuid="${macro.uuid}"]`));
      const tile=document.querySelector(`[data-macro-uuid="${macro.uuid}"]`),rect=tile.getBoundingClientRect();
      assert(getComputedStyle(tile.parentElement).gap==="16px","Macro spacing is doubled.");
      assert(rect.width===90 && rect.height===90,"Macro button is 50% larger than the native action bar.");
      tile.click();await wait(()=>globalThis.mlgmMacroTestRuns===1);
      document.querySelector(`[data-macro-uuid="${macro.uuid}"]`).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:rect.x+20,clientY:rect.y+20}));
      await wait(()=>document.querySelector('#context-menu .context-item'));
      const remove=[...document.querySelectorAll('#context-menu .context-item')].find(el=>el.textContent.includes('Remove'));
      assert(remove,"Native macro context menu offers Remove.");remove.click();
      await wait(()=>!document.querySelector(`[data-macro-uuid="${macro.uuid}"]`));
      assert(game.macros.has(macro.id),"Removing the button keeps the macro document.");
    } finally {
      delete globalThis.mlgmMacroTestRuns;
      await game.settings.set(ID,'macros',previous);
      if (macro) await macro.delete();
      document.querySelector('#mlgm [data-action="tab"][data-id="rolls"]').click();
    }
  }
},{
  id:"morelord-game-master.party-cards-window-sizes",
  async run() {
    const board=foundry.utils.deepClone(game.settings.get(ID,'board')),before=new Set(game.messages.map(m=>m.id));
    const geometryKey=`morelord-core.windowGeometry.${game.world.id}.${game.user.id}`,geometry=localStorage.getItem(geometryKey);
    let actor;
    try {
      actor=await Actor.create({name:'MLGM party fixture',type:'character',ownership:{default:0,[core().users.list().find(u=>!u.isGM).id]:3}});
      const api=game.modules.get(ID).api;api.toggle(true);
      document.querySelector('#mlgm-tab-party').click();
      assert(document.querySelector(`input[value="${actor.uuid}"]`),"Party tab uses Core character choices.");
      const choiceIds=[...document.querySelectorAll('#mlgm-panel input[name=actorUuids]')].map(el=>el.value);
      for (const uuid of choiceIds) {
        const el=document.querySelector(`#mlgm-panel input[value="${uuid}"]`);el.checked=uuid===actor.uuid;el.dispatchEvent(new Event('change',{bubbles:true}));
        await wait(()=>game.settings.get(ID,'board').partyActorIds?.includes(uuid.split('.').at(-1))===(uuid===actor.uuid));
      }
      document.querySelector('#mlgm-tab-rolls').click();
      let dc=document.querySelector('[data-roll-card="group"] input[name=dc]');dc.value='14';dc.dispatchEvent(new Event('change',{bubbles:true}));
      await wait(()=>game.settings.get(ID,'board').last.group?.dc===14);
      let blind=document.querySelector('[data-roll-card="group"] input[name=blind]');blind.checked=false;blind.dispatchEvent(new Event('change',{bubbles:true}));
      await wait(()=>game.settings.get(ID,'board').last.group?.blind===false);
      document.querySelector('[data-action="card-roll"][data-id="group"]').click();
      await wait(()=>game.messages.some(m=>!before.has(m.id)&&m.getFlag(ID,'request')?.skill));
      const request=game.messages.find(m=>!before.has(m.id)&&m.getFlag(ID,'request')?.skill);
      assert(JSON.stringify(request.getFlag(ID,'request').actorIds)===JSON.stringify([actor.id]),"Party rolls use the shared configured scope.");
      await rollRequest(request.id,actor.id);
      const result=game.messages.find(m=>m.getFlag(ID,'result')?.requestId===request.id),summary=game.messages.find(m=>m.getFlag(ID,'summary')?.requestId===request.id);
      assert(!result.blind&&!result.whisper.length&&!summary.blind&&!summary.whisper.length,"Blind toggle off makes both native roll and summary public.");
      document.querySelector('#mlgm-tab-party').click();document.querySelector('#mlgm-tab-rolls').click();
      assert(document.querySelector('[data-roll-card="group"] input[name=dc]').value==='14'&&!document.querySelector('[data-roll-card="group"] input[name=blind]').checked,"Card controls persist without a popup.");
      document.querySelector('#mlgm-tab-triggers').click();
      assert(document.querySelector('[data-action="new-trigger"]').disabled,"New Trigger stays visible but disabled.");
      assert(!document.querySelector('[data-action="trigger-edit"], [data-action="trigger-remove"]'),"Trigger editing/deletion is hidden.");
      new (game.settings.menus.get(`${ID}.configure`).type)().render();
      await wait(()=>foundry.applications.instances.get('morelord-game-master-game-master-settings')?.rendered);
      const settings=foundry.applications.instances.get('morelord-game-master-game-master-settings');
      settings.setPosition({width:470,height:380});await core().windowGeometry.remember(settings);await settings.close();

    } finally {
      for (const id of ['morelord-game-master-new-trigger','morelord-game-master-game-master-settings']) await foundry.applications.instances.get(id)?.close();
      const owned=game.messages.filter(m=>!before.has(m.id)&&(m.speaker?.actor===actor?.id || m.getFlag(ID,'request')?.actorIds.includes(actor?.id))).map(m=>m.id);
      await ChatMessage.deleteDocuments(game.messages.filter(m=>owned.includes(m.id)||owned.includes(m.getFlag(ID,'summary')?.requestId)).map(m=>m.id));
      if(actor)await actor.delete();await game.settings.set(ID,'board',board);
      await new Promise(resolve=>setTimeout(resolve,250));
      if(geometry===null)localStorage.removeItem(geometryKey);else localStorage.setItem(geometryKey,geometry);
      document.querySelector('#mlgm-tab-rolls').click();
    }
  }
}];
