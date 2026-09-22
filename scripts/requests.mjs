import { afterDiceAnimation } from "../../morelord-core/scripts/services/dice-animation.js";
import { rollControls, canRollForActor, markRollCompleted, isRollSubmitted, submitChatRoll } from "../../morelord-core/scripts/services/chat-roll-requests.js";
import { ID, escapeHTML as e, summarize } from "./core.mjs";

export const core = () => {
  const api = game.modules.get("morelord-core")?.active && globalThis.MorelordCore;
  if (!api?.socket?.createChannel || !api.ui?.participation || !api.rolls?.skill) throw new Error("Morelord Game Master requires Morelord Core 0.3.11 or newer and its Socketlib connection.");
  return api;
};
export const activeGM = () => core().users.list().find(user => user.active && user.isGM);
const authority = message => core().users.list().find(user => user.id === message?.author?.id && user.active && user.isGM) ?? activeGM();
export const recipient = actor => core().users.activePlayerForActor(actor) ?? activeGM();
export const craftworks = () => {
  const module = game.modules.get("morelord-craftworks"), api = module?.active && module.api;
  if (!module?.active) throw new Error("Enable Morelord Craftworks to use Delerium Search.");
  if (!api?.deleriumSearch) throw new Error("Craftworks is still initializing. Try Delerium Search again once it is ready.");
  if (!api.deleriumSearch.hasAccess) throw new Error("Enable the Monsters of Drakkenheim content pack in Craftworks to search for delerium.");
  return api;
};
export const requestTitle = req => req.kind === "surge" ? `${req.surgeName || "Wild Magic"} Check · 1d20` : req.kind === "foraging" ? `Foraging · ${req.terrain}` : req.kind === "delerium" ? `Delerium Search · ${req.searchSession.zone.name}` : req.kind === "encounter" ? `${req.name || "Encounter Check"} · 1d${req.die}` : req.kind === "death" ? "Death Saving Throw" : `${game.i18n.localize(CONFIG.DND5E.skills[req.skill].label)} check`;
let channel;


export function validRequest(message) {
  const req = message?.getFlag(ID,"request");
  if (!message?.author?.isGM || !Array.isArray(req?.actorIds)) return null;
  if (req.kind === "encounter") return Number.isInteger(req.die) && req.die >= 2 && req.die <= 1000 ? req : null;
  if (req.kind === "death") return req;
  if (req.kind === "surge") return req.triggerId && req.tableUuid && req.actorIds.length === 1 ? req : null;
  if (req.kind === "delerium") return req.searchSession?.id ? req : null;
  return CONFIG.DND5E?.skills?.[req.skill] ? req : null;
}
function resultMessage(requestId, actorId) {
  return game.messages.find(m => m.author?.isGM && m.getFlag(ID,"result")?.requestId === requestId && m.getFlag(ID,"result")?.actorId === actorId);
}
export function resultsFor(message) {
  const req = validRequest(message);
  return summarize(req?.actorIds ?? [], !game.user.isGM ? [] : game.messages.contents.filter(m => m.author?.isGM && m.getFlag(ID,"result")?.requestId === message.id && m.rolls?.length)
    .sort((a,b) => a.timestamp-b.timestamp).map(m => ({actorId:m.getFlag(ID,"result").actorId,total:m.rolls[0].total})));
}
const requestResults = message => game.messages.filter(result => result.author?.isGM && result.getFlag(ID,"result")?.requestId === message.id);
function scheduleRequestOutcomes(message) {
  void afterDiceAnimation(requestResults(message), async () => {
    if (!game.messages.get(message.id) || requestResults(message).some(result => result._dice3danimating)) return;
    const req = validRequest(message);
    if (req.kind === "surge") {
      const actor = game.actors.get(req.actorIds[0]), result = resultMessage(message.id, actor?.id);
      if (actor && result) await finishSurge(message, actor, result);
    }
    await updateCheckSummary(message);
    if (req.kind === "delerium" && req.actorIds.every(id => isComplete(message,id))) await finalizeSearch(message.id);
  }, `${ID}.rolls`).catch(error => ui.notifications.warn(`Roll saved; result display needs a retry: ${error.message}`));
}
async function updateCheckSummary(message) {
  if (requestResults(message).some(result => result._dice3danimating)) return;
  const req = validRequest(message), stats = resultsFor(message);
  if (!["skill","foraging"].includes(req.kind) || !stats.complete) return;
  const rows = req.actorIds.map(id => {
    const total = stats.totals.get(id);
    return `<tr><td>${e(game.actors.get(id)?.name ?? "Missing character")}</td><td>${total ?? "Pending"}</td>${req.dc != null ? `<td>${total == null ? "Pending" : total >= req.dc ? "Pass" : "Fail"}</td>` : ""}</tr>`;
  }).join("");
  let outcome = `<p>Average: ${stats.average?.toFixed(2)} · ${stats.count}/${stats.expected} rolled</p>`;
  if (req.kind === "foraging") {
    const {foragingFoodFound,resolveForagingResults} = await import("../../morelord-journeys/scripts/domain/foraging-rules.mjs");
    const travelers = req.actorIds.map(id=>({actorUuid:game.actors.get(id).uuid}));
    const resolution = resolveForagingResults(travelers,req.actorIds.map(id=>{
      const roll=resultMessage(message.id,id).rolls[0], succeeded=roll.total>=req.dc;
      return {actorUuid:game.actors.get(id).uuid,succeeded,foodFound:foragingFoodFound({succeeded,total:roll.total,natural:core().rolls.naturalD20(roll)})};
    }));
    outcome = `<p>Food found: ${resolution.totalFoodFound} meals · Meals still needed: ${resolution.foodRequired}</p><p>${resolution.waterSourceFound ? "Water source found." : "No water source found."}</p>`;
  }
  const content = `<section class="ml-chat-card ml-stack"><h3>${e(requestTitle(req))} · Results</h3>${req.dc != null ? `<p>DC ${req.dc}</p>` : ""}<table><thead><tr><th>Character</th><th>Roll</th>${req.dc != null ? "<th>Result</th>" : ""}</tr></thead><tbody>${rows}</tbody></table>${outcome}</section>`;
  const previous = game.messages.find(m => m.author?.isGM && m.getFlag(ID,"summary")?.requestId === message.id);
  const data = {content,blind:req.blind !== false,whisper:req.blind === false ? [] : game.users.filter(u => u.isGM).map(u => u.id)};
  if (previous) await previous.update(data);
  else await ChatMessage.create({...data,flags:{[ID]:{summary:{requestId:message.id}}}}, {messageMode:req.blind === false ? "public" : "blind"});
}
export function isComplete(message, actorId) { if (message.getFlag(ID,"request")?.kind === "surge") return Boolean(message.getFlag(ID,"request")?.completed?.includes(actorId)); return message.getFlag(ID,"request")?.completed?.includes(actorId) || (game.user.isGM && !!resultMessage(message.id,actorId)); }
function canRoll(message, actor, user = game.user) {
  if (!actor || !validRequest(message)?.actorIds.includes(actor.id) || core().users.isIgnored(user) || !user?.active) return false;
  return canRollForActor(actor,user);
}
export function requestHTML(req) {
  return `<section class="ml-chat-card ml-stack mlgm-request"><h3>${e(requestTitle(req))}</h3>${req.dc != null ? `<p>DC ${e(req.dc)}</p>` : ""}${req.actorIds.map(id => `<div class="ml-card ml-stack">${core().ui.actorIdentity({actorUuid:game.actors.get(id)?.uuid})}${req.kind === "delerium" ? `<select data-mlgm-search-skill aria-label="Search skill for ${e(game.actors.get(id)?.name)}">${req.searchSkills.map(s => `<option value="${e(s.id)}">${e(s.label)}</option>`).join("")}</select>${skillButtons(id)}<button type="button" data-mlgm-actor="${e(id)}" data-mlgm-skill="decline">Decline search</button>` : ["skill","foraging"].includes(req.kind) ? skillButtons(id) : `<button type="button" data-mlgm-actor="${e(id)}">Roll</button>`}</div>`).join("")}${req.kind === "delerium" ? '<button type="button" data-mlgm-finalize>Finalize / open search results (GM)</button>' : ""}</section>`;
}
function skillButtons(id) {
  return rollControls(mode => `data-mlgm-actor="${e(id)}" data-mlgm-mode="${mode}"`);
}

export async function createRequest(config) {
  if (!game.user.isGM) throw new Error("Only the GM can request checks.");
  if (!core().socket.ready) throw new Error("Morelord Core's socket connection is not ready.");
  const actorIds = [...new Set(config.actorIds ?? [])];
  // Automatic spell triggers include GM-run characters outside the configured party.
  const eligible = config.kind === "surge" ? [...game.actors.values()].filter(actor => actor.type === "character") : core().ui.participation.listCharacterActors();
  if (!actorIds.length || actorIds.some(id => !eligible.some(a => a.id === id))) throw new Error("Verify the participating characters before requesting rolls.");
  if (config.dc != null && (!Number.isInteger(config.dc) || config.dc < 0)) throw new Error("DC must be a non-negative whole number or blank.");
  if (config.kind === "encounter" && (!Number.isInteger(config.die) || config.die < 2 || config.die > 1000)) throw new Error("Choose a die from 2 to 1000 sides.");
  if (config.kind === "death" && (actorIds.length !== 1 || !game.actors.get(actorIds[0]).rollDeathSave)) throw new Error("Select one character who supports death saving throws.");
  if (config.kind === "foraging") config={...config,skill:"sur"};
  if (!["encounter","death","delerium","surge"].includes(config.kind) && (game.system.id !== "dnd5e" || !CONFIG.DND5E.skills[config.skill])) throw new Error("Select a valid D&D 5e skill.");
  if (config.kind === "surge" && (actorIds.length !== 1 || !config.triggerId || !config.tableUuid)) throw new Error("Invalid Wild Magic request.");
  if (config.kind === "foraging") {
    const terrain=(await foragingTerrains())[config.terrainIndex];
    if (!terrain) throw new Error("Choose a foraging terrain.");
    config={...config,skill:"sur",dc:terrain.value,terrain:terrain.label.replace(/ — DC \d+$/,"")};
  }
  const req = {...config,version:2,kind:config.kind ?? "skill",actorIds,blind:config.kind === "surge" ? true : config.blind !== false,completed:[]};
  if (req.kind === "delerium") {
    const api = craftworks();
    req.searchSession = api.deleriumSearch.start(config.zoneId);
    req.searchSession.selectedCharacterUuids = actorIds.map(id => game.actors.get(id).uuid);
    req.searchSession.messageMode = req.blind ? "blind" : "public";
    req.searchSkills = api.deleriumSearch.getSkillOptions().map(skill => ({...skill}));
    req.dc = req.searchSession.zone.dc;
  }
  const message = await ChatMessage.create({content:requestHTML(req),whisper:[],blind:false,flags:{[ID]:{request:req}}},{messageMode:"public"});
  return message;
}

export async function rollRequest(requestId, actorId, skillId, mode = "normal") {
  const gm = authority(game.messages.get(requestId));
  if (!gm) throw new Error("An active GM is required to resolve this check.");
  const acknowledgement = await channel.executeAsUser("roll",{requestId,actorId,skillId,mode},gm.id);
  if (!acknowledgement?.accepted) throw new Error(acknowledgement?.reason ?? "The check could not be resolved.");
  return acknowledgement;
}
async function resolveRequest({requestId,actorId,skillId,mode = "normal"}, execution) {
  const message = game.messages.get(requestId), req = validRequest(message), actor = game.actors.get(actorId), sender = game.users.get(execution.senderUserId);
  if (!game.user.isGM || game.user.id !== authority(message)?.id) return {accepted:false,reason:"The request's active GM must resolve this check."};
  if (!req || !req.actorIds.includes(actorId)) return {accepted:false,reason:"This request is no longer available."};
  if (!canRoll(message,actor,sender)) return {accepted:false,reason:"The check is assigned to another player. Any GM may roll for this character."};
  if (!["normal","adv","dis"].includes(mode) || (mode !== "normal" && !["skill","delerium","foraging"].includes(req.kind))) return {accepted:false,reason:"Invalid roll mode for this check."};
  // Results are authored by the authority GM. Never trust client-supplied dice or totals.
  if (isComplete(message,actorId)) { scheduleRequestOutcomes(message); return {accepted:true,alreadyResolved:true}; }
  if (req.kind === "surge") {
    // Finish any interrupted earlier check before consuming this trigger's next threshold.
    for (const pending of game.messages.filter(m=>m.author?.isGM && m.getFlag(ID,"request")?.kind === "surge" && m.getFlag(ID,"request")?.triggerId === req.triggerId && m.getFlag(ID,"request")?.actorIds.includes(actorId) && m.id !== requestId && !resultMessage(m.id,actorId)?.getFlag(ID,"surge")?.resolved)) {
      const previous=resultMessage(pending.id,actorId);
      if (previous?._dice3danimating) return {accepted:false,reason:"Wait for the previous Wild Magic check for this character to finish."};
      if (previous) await finishSurge(pending,actor,previous);
    }
  }
  if (req.kind === "surge" && resultMessage(requestId,actorId)) {
    await message.setFlag(ID,"request",{...req,completed:[actorId]});
    scheduleRequestOutcomes(message);
    return {accepted:true};
  }
  let roll, declined = false;
  if (["encounter","surge"].includes(req.kind)) roll = await new Roll(`1d${req.kind === "surge" ? 20 : req.die}`).evaluate({allowInteractive:false});
  else if (req.kind === "death") {
    // Native bonuses and advantage apply, but private checks must not reveal the outcome through sheet counters.
    const preventUpdate = req.blind !== false && Hooks.on("dnd5e.rollDeathSave", (_rolls, data) => { if (data.subject === actor) return false; });
    try { [roll] = await actor.rollDeathSave({}, {configure:false}, {create:false}) ?? []; }
    finally { if (preventUpdate) Hooks.off("dnd5e.rollDeathSave",preventUpdate); }
  } else if (req.kind === "delerium") {
    const api = craftworks();
    if (skillId === "decline") declined = true;
    else {
      if (!api.deleriumSearch.getSkillOptions().some(s => s.id === skillId)) return {accepted:false,reason:"Choose a Craftworks search skill."};
      roll = (await core().rolls.skill(actor,skillId,{dc:req.dc,configure:false,create:false,advantage:mode === "adv",disadvantage:mode === "dis"})).roll;
    }
  } else roll = (await core().rolls.skill(actor,req.skill,{dc:req.dc ?? null,configure:false,create:false,advantage:mode === "adv",disadvantage:mode === "dis"})).roll;
  if (!roll && !declined) return {accepted:false,reason:"No roll was made. For death saves, verify the character is at zero HP and has not already completed their saves."};
  await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),flavor:e(`${actor.name} · ${requestTitle(req)}`),rolls:roll ? [roll] : [],content:declined ? `<section class="ml-chat-card"><p>${e(actor.name)} declined the search.</p></section>` : "",blind:req.blind !== false,
    whisper:req.blind === false ? [] : game.users.filter(u => u.isGM).map(u => u.id),
    flags:{[ID]:{result:{requestId,actorId,skillId:skillId ?? req.skill ?? null,declined}}}}, {messageMode:req.blind === false ? "public" : "blind"});
  await message.setFlag(ID,"request",{...req,completed:[...new Set([...(req.completed ?? []),actorId])]});
  scheduleRequestOutcomes(message);
  // No result, outcome, or Roll object crosses back to the requesting player.
  return {accepted:true};
}

function searchSummary(session) {
  const participants = Object.values(session.participants);
  const rows = participants.map(p => `<tr><td>${e(game.actors.get(p.actorUuid?.split('.').at(-1))?.name ?? "Missing character")}</td><td>${p.total ?? "—"}</td><td>${p.status === "declined" ? "Declined" : p.status === "succeeded" ? "Pass" : "Fail"}</td></tr>`).join("");
  return `<section class="ml-chat-card ml-stack"><h3>Delerium Search · ${e(session.zone.name)}</h3><p>DC ${session.zone.dc}</p><table><thead><tr><th>Character</th><th>Roll</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table><p>${session.successes} successes · ${session.failures} failures</p><p>${session.randomEncounter ? "Random encounter required." : "No random encounter triggered."}</p><p>${session.rewards.map(r => `${e(r.formula)} ${e(r.name)}`).join("<br>") || "No delerium found."}</p>${session.randomEncounter ? '<button type="button" data-mlgm-open-encounters>Open Encounters</button>' : ""}${session.result ? `<p>Awarded to ${e(session.result.recipientName)}.</p>` : session.rewards.length ? '<button type="button" data-mlgm-search-results>Roll for Delerium</button>' : ""}</section>`;
}
async function finalizeSearch(requestId) {
  const existing = game.messages.find(m => m.author?.isGM && m.getFlag(ID,"search")?.requestId === requestId);
  if (existing) return existing.id;
  const message = game.messages.get(requestId), req = validRequest(message);
  if (req?.kind !== "delerium" || !req.actorIds.every(id => isComplete(message,id))) throw new Error("Each character must roll or decline before finalizing.");
  if (requestResults(message).some(result => result._dice3danimating)) throw new Error("Wait for the search dice to finish before opening results.");
  const api = craftworks(), session = api.sessions.import(req.searchSession);
  for (const id of req.actorIds) {
    const result = resultMessage(requestId,id), data = result?.getFlag(ID,"result");
    if (!data) throw new Error("A search result card is missing. Keep the private cards until the search is finalized.");
    const values = {sessionId:session.id,userId:`actor:${id}`,actorUuid:game.actors.get(id)?.uuid ?? `Actor.${id}`};
    if (data.declined) api.deleriumSearch.decline(values);
    else api.deleriumSearch.attempt({...values,skillId:data.skillId,total:result.rolls[0].total,naturalD20:core().rolls.naturalD20(result.rolls[0])});
  }
  await api.deleriumSearch.finalize(session.id);
  const summary = await ChatMessage.create({content:searchSummary(session),blind:req.blind !== false,whisper:req.blind === false ? [] : game.users.filter(u => u.isGM).map(u => u.id),flags:{[ID]:{search:{requestId,session:foundry.utils.deepClone(session)}}}}, {messageMode:req.blind === false ? "public" : "blind"});
  return summary.id;
}
async function openSearchResults(summaryId) {
  if (!game.user.isGM) return;
  const message = game.messages.get(summaryId), data = message?.getFlag(ID,"search");
  if (!data || !message.author?.isGM) throw new Error("Search result no longer exists.");
  const api = craftworks(), session = foundry.utils.deepClone(data.session);
  const {DeleriumSearchResultsApp} = await import("../../morelord-craftworks/scripts/ui/delerium-search-results-app.mjs");
  const facade = {...api,deleriumSearch:{rollAndAward:async (_id,recipientUuid) => {
    const updated = await channel.executeAsUser("awardSearch",{summaryId,recipientUuid},authority(message)?.id);
    Object.assign(session,updated); return session.result;
  }}};
  return new DeleriumSearchResultsApp(facade,session).render({force:true});
}

function refreshRequests() {
  for (const message of game.messages) if (validRequest(message)) ui.chat?.updateMessage(message);
}
export function initializeRequests() {
  channel = core().socket.createChannel(ID);
  // Existing pending requests should also remain accessible after a player joins.
  if (game.user.isGM) for (const message of game.messages) {
    const req=validRequest(message);
    if (req && authority(message)?.id===game.user.id && (message.blind || message.whisper?.length) && req.actorIds.some(id=>!req.completed?.includes(id)))
      message.update({whisper:[],blind:false}).catch(error=>ui.notifications.warn(error.message));
    if (req && authority(message)?.id === game.user.id && requestResults(message).length) {
      const missingSummary = ["skill", "foraging"].includes(req.kind) && resultsFor(message).complete
        && !game.messages.some(result => result.getFlag(ID,"summary")?.requestId === message.id);
      const missingSearch = req.kind === "delerium" && req.actorIds.every(id => isComplete(message,id))
        && !game.messages.some(result => result.getFlag(ID,"search")?.requestId === message.id);
      const pendingSurge = req.kind === "surge" && !resultMessage(message.id,req.actorIds[0])?.getFlag(ID,"surge")?.resolved;
      if (missingSummary || missingSearch || pendingSurge) scheduleRequestOutcomes(message);
    }
  }
  // One GM-side queue also prevents overlapping death-save hooks and actor updates.
  channel.on("roll",resolveRequest,{serialize:`${ID}.rolls`});
  channel.on("finalizeSearch",async ({requestId},execution) => {
    if (!game.user.isGM || !game.users.get(execution.senderUserId)?.isGM) throw new Error("Only GMs can finalize searches.");
    return finalizeSearch(requestId);
  },{serialize:`${ID}.rolls`});
  channel.on("awardSearch",async ({summaryId,recipientUuid},execution) => {
    if (!game.user.isGM || !game.users.get(execution.senderUserId)?.isGM) throw new Error("Only GMs can award search results.");
    const message = game.messages.get(summaryId), data = message?.getFlag(ID,"search");
    if (!message?.author?.isGM || !data?.session) throw new Error("Search summary not found.");
    const api = craftworks(), session = api.sessions.import(data.session);
    try { await api.deleriumSearch.rollAndAward(session.id,recipientUuid); }
    finally { await message.update({content:searchSummary(session),[`flags.${ID}.search`]:{...data,session:foundry.utils.deepClone(session)}}); }
    return foundry.utils.deepClone(session);
  },{serialize:`${ID}.rolls`});

  Hooks.on("renderChatMessageHTML",(message,html) => {
    html.querySelector("[data-mlgm-open-encounters]")?.addEventListener("click",async () => {
      if (!game.user.isGM) return;
      try {
        if (!game.modules.get("morelord-encounters")?.active) throw new Error("Enable Morelord Encounters first.");
        const {configureEncounter} = await import("../../morelord-encounters/scripts/apps/encounter-builder-dialog.mjs");
        await configureEncounter();
      } catch(error) {ui.notifications.error(error.message);}
    });
    html.querySelector("[data-mlgm-search-results]")?.addEventListener("click",() => openSearchResults(message.id).catch(error => ui.notifications.error(error.message)));
    if (!validRequest(message)) return;
    const card = html.querySelector('.mlgm-request');
    if (card) card.outerHTML = requestHTML(validRequest(message));
    const finalize = html.querySelector("[data-mlgm-finalize]");
    if (finalize) {
      if (!game.user.isGM) finalize.remove();
      else finalize.addEventListener("click",async () => { try { await openSearchResults(await channel.executeAsUser("finalizeSearch",{requestId:message.id},authority(message)?.id)); } catch(error) { ui.notifications.error(error.message); } });
    }
    for (const btn of html.querySelectorAll("[data-mlgm-actor]")) {
      const actor = game.actors.get(btn.dataset.mlgmActor), done = isComplete(message,actor?.id) || isRollSubmitted(message,actor?.id), target = actor && recipient(actor);
      if (done) { markRollCompleted(btn.closest(".ml-card")); continue; }
      btn.disabled = !canRoll(message,actor);
      if (!btn.dataset.mlgmSkill && (!btn.dataset.mlgmMode || btn.dataset.mlgmMode === "normal")) btn.textContent = done ? "Completed" : "Roll";
      btn.title = target?.isGM ? "Assigned to GM" : `Assigned to ${target?.name ?? "GM"}`;
      btn.addEventListener("click",async () => {
        const skill = btn.dataset.mlgmSkill ?? btn.closest('.ml-card')?.querySelector('[data-mlgm-search-skill]')?.value;
        try { await submitChatRoll(message,actor.id,btn.closest(".ml-card"), () => rollRequest(message.id,actor.id,skill,btn.dataset.mlgmMode ?? "normal")); }
        catch(error) { ui.notifications.error(error.message); }
        finally { refreshRequests(); }
      });
    }
  });
  Hooks.on("updateChatMessage",refreshRequests);
  Hooks.on("deleteChatMessage",refreshRequests);
  Hooks.on("userConnected",refreshRequests);
  Hooks.on("updateUser",refreshRequests);
  Hooks.on("updateActor",refreshRequests);
}

export async function foragingTerrains() {
  if (!game.modules.get("morelord-journeys")?.active) throw new Error("Enable Morelord Journeys to use its foraging terrain rules.");
  const {RESOURCE_OPTIONS,routeOptionsWithDCs}=await import("../../morelord-journeys/scripts/domain/route-options.mjs");
  return routeOptionsWithDCs(RESOURCE_OPTIONS,game.settings.get("morelord-journeys","dcConfiguration")?.foraging);
}
export function surgeOutcome(total,threshold=1) {
  const triggered=total<=threshold;
  return {threshold,triggered,nextThreshold:triggered ? 1 : Math.min(20,threshold+1)};
}
export async function finishSurge(message,actor,result) {
  const req=validRequest(message);
  let outcome=result.getFlag(ID,"surge");
  if (!outcome) {
    outcome=surgeOutcome(result.rolls[0].total,actor.getFlag(ID,`surges.${req.triggerId}`)?.threshold ?? 1);
    await result.setFlag(ID,"surge",outcome);
  }
  if (outcome.triggered && !game.messages.some(m=>m.author?.isGM && m.getFlag(ID,"surgeTable")===result.id)) {
    const table=await fromUuid(req.tableUuid);
    if (!table) throw new Error("Wild Magic table is missing. Restore it and retry this request.");
    const {roll,results}=await table.roll();
    await table.toMessage(results,{roll,messageData:{blind:true,whisper:game.users.filter(u=>u.isGM).map(u=>u.id),speaker:ChatMessage.getSpeaker({actor}),flags:{[ID]:{surgeTable:result.id}}},messageOptions:{messageMode:"blind"}});
  }
  const state=actor.getFlag(ID,`surges.${req.triggerId}`);
  if (state?.resultId !== result.id && !outcome.resolved) await actor.setFlag(ID,`surges.${req.triggerId}`,{threshold:outcome.nextThreshold,resultId:result.id});
  await result.update({content:`<section class="ml-chat-card"><p>${e(actor.name)} · ${result.rolls[0].total} against ${outcome.threshold} or lower: ${outcome.triggered ? e(`${req.surgeName || "Wild Magic"} Surge`) : "No surge"}. Next threshold: ${outcome.nextThreshold}.</p></section>`,[`flags.${ID}.surge`]:{...outcome,resolved:true}});
  await message.setFlag(ID,"request",{...req,completed:[actor.id]});
}
