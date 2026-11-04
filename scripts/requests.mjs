import { afterDiceAnimation } from "../../morelord-core/scripts/services/dice-animation.js";
import { canRollForActor, markRollCompleted, isRollSubmitted, submitChatRoll } from "../../morelord-core/scripts/services/chat-roll-requests.js";
import { ID, escapeHTML as e, summarize } from "./core.mjs";
import { HOARD_BANDS, addHoardCoins, commitHoardStep, emptyHoardState, grantHoardAwards, hoardCardHTML, loadSrdItemIndex, loadTreasure, needsGmPlace, nextHoardStep, peekTreasure, previewMagicItem, readHoardTotal, resolveSpellScroll, spellScrollLevel } from "./treasure.mjs";

export const core = () => {
  const api = game.modules.get("morelord-core")?.active && globalThis.MorelordCore;
  if (!api?.socket?.createChannel || !api.ui?.participation || !api.rolls?.skill) throw new Error("Morelord Game Master requires Morelord Core 0.9.0+ and its Socketlib connection.");
  return api;
};
function coreReady() {
  const api = globalThis.game?.modules?.get?.("morelord-core")?.active && globalThis.MorelordCore;
  return Boolean(api?.socket?.createChannel && api?.ui?.participation && api?.rolls?.skill);
}
export const activeGM = () => core().users.list().find(user => user.active && user.isGM);
const authority = message => core().users.list().find(user => user.id === message?.author?.id && user.active && user.isGM) ?? activeGM();
export const recipient = actor => core().users.activePlayerForActor(actor) ?? activeGM();
export const deleriumSearch = () => {
  const api = core().deleriumSearch;
  if (typeof api?.start !== "function" || typeof api?.available !== "function") throw new Error("Morelord Game Master requires Morelord Core 0.9.0+ for Delerium Search.");
  if (!api.available()) throw new Error("Enable a Drakkenheim content module to search for delerium.");
  return api;
};
export const surgeDie = req => req.surgeName === 'Volatile Magic' ? 4 : 20;
const abilityName = id => game.i18n.localize(CONFIG.DND5E.abilities?.[id]?.label ?? id);
const hoardLabel = band => HOARD_BANDS.find(entry => entry.id === band)?.label ?? "Treasure Hoard";
export const requestTitle = req => req.kind === "hoard" ? `Treasure Hoard · ${hoardLabel(req.band)}` : req.kind === "surge" ? `${req.surgeName || "Wild Magic"} Check · 1d${surgeDie(req)}` : req.kind === "foraging" ? `Foraging · ${req.terrain}` : req.kind === "delerium" ? `Delerium Search · ${req.searchSession.zone.name}` : req.kind === "encounter" ? `${req.name || "Encounter Check"} · 1d${req.die}` : req.kind === "death" ? "Death Saving Throw" : req.kind === "ability" ? `${abilityName(req.ability)} check` : req.kind === "save" ? `${abilityName(req.ability)} saving throw` : `${game.i18n.localize(CONFIG.DND5E.skills[req.skill].label)} check`;
let channel;


export function validRequest(message) {
  const req = message?.getFlag(ID,"request");
  if (!message?.author?.isGM || !Array.isArray(req?.actorIds)) return null;
  if (req.kind === "encounter") return Number.isInteger(req.die) && req.die >= 2 && req.die <= 1000 ? req : null;
  if (req.kind === "death") return req;
  if (req.kind === "hoard") return req.actorIds.length === 1 && HOARD_BANDS.some(band => band.id === req.band) ? req : null;
  if (req.kind === "surge") return req.triggerId && req.tableUuid && req.actorIds.length === 1 ? req : null;
  if (req.kind === "delerium") return req.searchSession?.id ? req : null;
  if (req.kind === "ability" || req.kind === "save") return CONFIG.DND5E?.abilities?.[req.ability] ? req : null;
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
  if (!["skill","ability","save","foraging"].includes(req.kind) || !stats.complete) return;
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
function rollButton(id) {
  return `<button type="button" data-mlgm-actor="${e(id)}">Roll</button>`;
}
export function requestHTML(req) {
  const controls = id => req.kind === "delerium" ? `<select data-mlgm-search-skill aria-label="Search skill for ${e(game.actors.get(id)?.name)}">${req.searchSkills.map(s => `<option value="${e(s.id)}">${e(s.label)}</option>`).join("")}</select>${rollButton(id)}<button type="button" data-mlgm-actor="${e(id)}" data-mlgm-skill="decline">Decline search</button>` : rollButton(id);
  return `<section class="ml-chat-card ml-stack mlgm-request"><h3>${e(requestTitle(req))}</h3>${req.dc != null ? `<p>DC ${e(req.dc)}</p>` : ""}${req.actorIds.map(id => `<div class="ml-card ml-stack">${core().ui.actorIdentity({actorUuid:game.actors.get(id)?.uuid})}${controls(id)}</div>`).join("")}${req.kind === "delerium" ? '<button type="button" data-mlgm-finalize>Finalize / open search results (GM)</button>' : ""}</section>`;
}
const gmWhisper = () => game.users.filter(user => user.isGM).map(user => user.id);
// A private hoard is whispered to the GMs and the players who own the character.
function hoardWhisper(req) {
  const actor = game.actors.get(req.actorIds[0]);
  const owners = game.users.filter(user => !user.isGM && actor?.testUserPermission?.(user, "OWNER")).map(user => user.id);
  return [...new Set([...owners, ...gmWhisper()])];
}
const hoardTitle = () => "Roll for Treasure";
const hoardIdentity = actor => actor ? core().ui.actorIdentity({actorUuid: actor.uuid}) : "";
function hoardMarkup(req, actor, state, {allowRoll = false} = {}) {
  const data = peekTreasure();
  const step = data ? nextHoardStep(data, req.band, state) : null;
  return hoardCardHTML({title: hoardTitle(req, actor), identity: hoardIdentity(actor), recipientName: actor?.name ?? "", state, step, allowRoll: allowRoll && !state?.done, escape: e});
}
async function freshHoardContent(req) {
  const data = await loadTreasure();
  const actor = game.actors.get(req.actorIds[0]);
  const state = emptyHoardState(actor?.id);
  return hoardCardHTML({title: hoardTitle(req, actor), identity: hoardIdentity(actor), recipientName: actor?.name ?? "", state, step: nextHoardStep(data, req.band, state), allowRoll: true, escape: e});
}
export async function placeHoardItem(actor, itemData) {
  if (needsGmPlace(game.user, actor)) {
    const gm = activeGM();
    if (!gm) throw new Error("An active GM is required to add treasure.");
    const placed = await channel.executeAsUser("placeHoardItem", {actorId: actor.id, itemData}, gm.id);
    return placed?.uuid ? {uuid: placed.uuid, name: placed.name} : null;
  }
  const created = await actor.createEmbeddedDocuments("Item", [itemData]);
  return created?.[0] ?? null;
}
// Dice So Nice animates the rolls once, when the GM adds them to the card. The card's speaker is the
// character, so Dice So Nice's "Use character owner's dice appearance" setting plays the player's own dice.
// Nothing else animates them: showing them here as well played every hoard roll twice.
const stampActor = (rolls, actor) => { for (const roll of rolls) roll.data = {...(roll.data ?? {}), actorId: actor.id}; return rolls; };
async function rollHoardFormulas(formulas) {
  const rolls = [];
  const totals = [];
  for (const formula of formulas) {
    const roll = new Roll(formula);
    if (typeof roll.evaluate === "function") await roll.evaluate({allowInteractive: false});
    totals.push(readHoardTotal(formula, roll));
    rolls.push(roll);
  }
  return {rolls, totals};
}
function evaluatedDieData(formula, total) {
  const match = /^(\d+)d(\d+)$/.exec(formula);
  const number = Number(match[1]);
  const faces = Number(match[2]);
  const results = [];
  let remaining = total;
  for (let index = 0; index < number; index += 1) {
    const face = Math.min(faces, Math.max(1, remaining - (number - index - 1)));
    results.push({result: face, active: true, exploded: false, discarded: false, success: null, failure: null, count: 1});
    remaining -= face;
  }
  return {class: "Roll", formula, evaluated: true, terms: [{class: "Die", options: {}, evaluated: true, number, faces, modifiers: [], results}]};
}
function rebuildHoardRoll(formula, payload) {
  const total = readHoardTotal(formula, payload);
  const data = payload?.terms ? payload : evaluatedDieData(formula, total);
  if (typeof Roll.fromData !== "function") throw new Error(`A ${formula} could not be rebuilt.`);
  const roll = Roll.fromData(data);
  if (Number(roll.total) !== total) throw new Error(`A ${formula} came up ${roll.total}.`);
  return {roll, total};
}
function totalsFromPayload(formulas, payloadRolls) {
  const rebuilt = formulas.map((formula, index) => rebuildHoardRoll(formula, payloadRolls[index]));
  return {rolls: rebuilt.map(entry => entry.roll), totals: rebuilt.map(entry => entry.total)};
}

export async function createRequest(config) {
  if (!game.user.isGM) throw new Error("Only the GM can request checks.");
  if (!core().socket.ready) throw new Error("Morelord Core's socket connection is not ready.");
  const actorIds = [...new Set(config.actorIds ?? [])];
  const kind = config.kind ?? "skill";
  // Wild Magic and a single skill, ability, or save may name any player character in the world.
  // Party, token, death, and other requests stay on the Player Settings list.
  const singleCharacter = actorIds.length === 1 && ["skill", "ability", "save"].includes(kind);
  const directory = typeof game.actors?.values === "function" ? [...game.actors.values()] : [];
  const worldCharacters = directory.filter(actor => actor?.type === "character");
  const eligible = config.kind === "surge" || singleCharacter ? worldCharacters : core().ui.participation.listCharacterActors();
  if (!actorIds.length || actorIds.some(id => !eligible.some(a => a.id === id))) throw new Error("Verify the participating characters before requesting rolls.");
  if (config.dc != null && (!Number.isInteger(config.dc) || config.dc < 0)) throw new Error("DC must be a non-negative whole number or blank.");
  if (config.kind === "encounter" && (!Number.isInteger(config.die) || config.die < 2 || config.die > 1000)) throw new Error("Choose a die from 2 to 1000 sides.");
  if (config.kind === "death" && (actorIds.length !== 1 || !game.actors.get(actorIds[0]).rollDeathSave)) throw new Error("Select one character who supports death saving throws.");
  if (config.kind === "hoard" && (actorIds.length !== 1 || !HOARD_BANDS.some(band => band.id === config.band))) throw new Error("Choose one character and a treasure hoard.");
  if (config.kind === "foraging") config={...config,skill:"sur"};
  if (["ability","save"].includes(config.kind)) {
    if (game.system.id !== "dnd5e" || !CONFIG.DND5E.abilities?.[config.ability]) throw new Error("Select a valid D&D 5e ability.");
  } else if (!["encounter","death","delerium","surge","hoard"].includes(config.kind) && (game.system.id !== "dnd5e" || !CONFIG.DND5E.skills[config.skill])) throw new Error("Select a valid D&D 5e skill.");
  if (config.kind === "surge" && (actorIds.length !== 1 || !config.triggerId || !config.tableUuid)) throw new Error("Invalid Wild Magic request.");
  if (config.kind === "foraging") {
    const terrain=(await foragingTerrains())[config.terrainIndex];
    if (!terrain) throw new Error("Choose a foraging terrain.");
    config={...config,skill:"sur",dc:terrain.value,terrain:terrain.label.replace(/ — DC \d+$/,"")};
  }
  const req = {...config,version:2,kind:config.kind ?? "skill",actorIds,blind:config.kind === "surge" ? true : config.kind === "hoard" ? false : config.blind !== false,completed:[]};
  // Treasure Hoards are public or private, never blind.
  if (req.kind === "hoard") req.private = config.private === true;
  if (req.kind === "delerium") {
    const search = deleriumSearch();
    req.searchSession = search.start(config.zoneId);
    req.searchSession.selectedCharacterUuids = actorIds.map(id => game.actors.get(id).uuid);
    req.searchSession.messageMode = req.blind ? "blind" : "public";
    req.searchSkills = search.getSkillOptions().map(skill => ({...skill}));
    req.dc = req.searchSession.zone.dc;
  }
  const content = req.kind === "hoard" ? await freshHoardContent(req) : requestHTML(req);
  const flags = {request: req};
  // The hoard card speaks as the character, like skill and save results, so the owner's dice are used.
  if (req.kind === "hoard" && req.private) return ChatMessage.create({content,speaker:ChatMessage.getSpeaker({actor:game.actors.get(actorIds[0])}),whisper:hoardWhisper(req),blind:false,flags:{[ID]:flags}});
  const speaker = req.kind === "hoard" ? {speaker:ChatMessage.getSpeaker({actor:game.actors.get(actorIds[0])})} : {};
  const message = await ChatMessage.create({content,...speaker,whisper:[],blind:false,flags:{[ID]:flags}},{messageMode:"public"});
  return message;
}

export class RollCancelled extends Error {
  constructor() { super("Roll cancelled."); this.name = "RollCancelled"; }
}
const firstRoll = result => Array.isArray(result) ? result[0] : result?.rolls?.[0] ?? result?.roll ?? result ?? null;
function packRoll(roll) {
  if (!roll || typeof roll !== "object") return null;
  if (typeof roll.toJSON === "function") return {packed: true, data: roll.toJSON(), evaluated: roll._evaluated === true};
  return {packed: false, roll};
}
async function materializeRoll(prepared, kind) {
  if (!prepared) return null;
  if (prepared.packed === false) return prepared.roll ?? null;
  const data = prepared.data;
  if (!data || typeof data !== "object") throw new Error("The prepared roll could not be read.");
  const RollClass = ["encounter", "surge"].includes(kind) ? globalThis.Roll : CONFIG.Dice?.D20Roll ?? globalThis.Roll;
  const roll = typeof RollClass.fromData === "function" ? RollClass.fromData(data) : new RollClass(data.formula);
  if (kind === "death") return roll;
  // The clicking client already rolled the dice. The GM applies that result and never rolls again.
  if (prepared.evaluated === true || roll._evaluated === true) {
    if (!Number.isFinite(Number(roll.total))) throw new Error("The prepared roll has no result.");
    return roll;
  }
  // A roll from an older client that never evaluated it is still rolled here.
  const formula = roll.formula ?? data.formula;
  const fresh = new RollClass(formula, roll.data, roll.options);
  if (typeof fresh.evaluate === "function") await fresh.evaluate({allowInteractive: false});
  return fresh;
}
const requestDie = req => req.kind === "surge" ? surgeDie(req) : req.die;
export async function prepareRequestRoll(req, actor, skillId) {
  if (!req || !actor) throw new Error("This request is no longer available.");
  if (req.kind === "hoard") return null;
  // The clicking client rolls. The GM only applies the result.
  if (["encounter", "surge"].includes(req.kind)) return new Roll(`1d${requestDie(req)}`).evaluate({allowInteractive: false});
  if (req.kind === "death") {
    // A private save must not reveal its outcome through sheet counters.
    const preventUpdate = req.blind !== false && Hooks.on("dnd5e.rollDeathSave", (_rolls, data) => { if (data.subject === actor) return false; });
    try {
      const roll = firstRoll(await actor.rollDeathSave({}, {}, {create: false}));
      if (!roll) throw new RollCancelled();
      return roll;
    } finally { if (preventUpdate) Hooks.off("dnd5e.rollDeathSave", preventUpdate); }
  }
  if (req.kind === "delerium" && skillId === "decline") return null;
  const roll = await rollNative(actor, req, skillId, {});
  if (!roll) throw new RollCancelled();
  return roll;
}
async function advanceHoard(message, req, actor, payload = {}) {
  const data = await loadTreasure();
  const state = message.getFlag(ID, "hoard") ?? emptyHoardState(actor.id);
  const step = nextHoardStep(data, req.band, state);
  if (!step || (payload.stepId && payload.stepId !== "next" && payload.stepId !== step.id)) return {accepted: true, alreadyResolved: true};
  const supplied = Array.isArray(payload.rolls) && payload.rolls.length === step.formulas.length;
  // The clicking client rolls. A missing payload comes only from an older client.
  const rolled = supplied ? totalsFromPayload(step.formulas, payload.rolls) : await rollHoardFormulas(step.formulas);
  let scroll = null;
  if (step.kind === "magic") {
    const preview = previewMagicItem(data, step, rolled.totals);
    if (spellScrollLevel(preview.name) != null) scroll = payload.scroll?.level === spellScrollLevel(preview.name) ? payload.scroll : await resolveSpellScroll(preview.name);
  }
  const committed = await commitHoardStep({
    data, bandId: req.band, state, stepId: step.id, totals: rolled.totals, scroll, index: await loadSrdItemIndex(),
    placeItem: itemData => placeHoardItem(actor, itemData), addCoins: purse => addHoardCoins(actor, purse)
  });
  if (committed.alreadyResolved) return {accepted: true, alreadyResolved: true};
  const rolls = [...(Array.isArray(message.rolls) ? message.rolls : []), ...stampActor(rolled.rolls, actor)];
  const content = hoardMarkup(req, actor, committed.state, {allowRoll: true});
  // An older card has no speaker; set it with the rolls so Dice So Nice finds the owner.
  const speaker = message.speaker?.actor === actor.id ? {} : {speaker: ChatMessage.getSpeaker({actor})};
  await message.update({content, rolls, ...speaker, [`flags.${ID}.hoard`]: committed.state});
  if (committed.state.done) {
    const current = message.getFlag(ID, "request") ?? req;
    await message.setFlag(ID, "request", {...current, completed: [...new Set([...(current.completed ?? []), actor.id])]});
  }
  return {accepted: true};
}
function hoardRequestMessage(message) {
  return validRequest(message)?.kind === "hoard" ? message : null;
}
async function submitHoardRoll(message, actor) {
  const request = hoardRequestMessage(message);
  const req = validRequest(request);
  if (!req || !actor) throw new Error("This request is no longer available.");
  const data = peekTreasure() ?? await loadTreasure();
  const state = request.getFlag(ID, "hoard") ?? emptyHoardState(actor.id);
  const step = nextHoardStep(data, req.band, state);
  const hoard = {stepId: step?.id ?? "next"};
  if (step) {
    const rolled = await rollHoardFormulas(step.formulas);
    hoard.rolls = rolled.rolls.map(roll => typeof roll.toJSON === "function" ? roll.toJSON() : {formula: roll.formula, total: roll.total});
    if (step.kind === "magic") {
      const preview = previewMagicItem(data, step, rolled.totals);
      if (spellScrollLevel(preview.name) != null) hoard.scroll = await resolveSpellScroll(preview.name);
    }
  }
  const gm = authority(request);
  if (!gm) throw new Error("An active GM is required to resolve this check.");
  const acknowledgement = await channel.executeAsUser("roll", {requestId: request.id, actorId: actor.id, hoard}, gm.id);
  if (!acknowledgement?.accepted) throw new Error(acknowledgement?.reason ?? "The check could not be resolved.");
  return acknowledgement;
}
/** A rebuilt card carries raw @UUID text, so run it through Foundry's enricher for the link and type icon. */
async function enrichItemLinks(root) {
  const editor = globalThis.foundry?.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  if (typeof editor?.enrichHTML !== "function") return;
  for (const node of root.querySelectorAll(".ml-award-card__item-name")) {
    if (!node.innerHTML.includes("@UUID")) continue;
    try { node.innerHTML = await editor.enrichHTML(node.innerHTML); }
    catch (error) { console.warn("Morelord Game Master | Treasure links", error); }
  }
}
function bindHoardCard(message, html) {
  const request = hoardRequestMessage(message);
  const req = validRequest(request);
  if (!req) return;
  const actor = game.actors.get(req.actorIds[0]);
  const state = request.getFlag(ID, "hoard") ?? emptyHoardState(actor?.id);
  if (!peekTreasure()) {
    void loadTreasure().then(() => ui.chat?.updateMessage(message));
    return;
  }
  const node = html.querySelector(".mlgm-hoard") ?? html.querySelector(".mlgm-request");
  if (node) {
    node.outerHTML = hoardMarkup(req, actor, state, {allowRoll: !state.done});
    void enrichItemLinks(html);
  }
  for (const button of html.querySelectorAll("[data-mlgm-hoard-step]")) {
    button.disabled = !canRoll(request, actor);
    button.addEventListener("click", async () => {
      try { await submitChatRoll(message, `hoard:${actor?.id}`, button.closest(".mlgm-hoard") ?? button.parentElement, () => submitHoardRoll(message, actor)); }
      catch (error) { if (error?.name !== "RollCancelled") ui.notifications.error(error.message); }
      finally { refreshRequests(); }
    });
  }
}
export async function rollRequest(requestId, actorId, skillId, prepared = null) {
  const gm = authority(game.messages.get(requestId));
  if (!gm) throw new Error("An active GM is required to resolve this check.");
  const data = {requestId, actorId, skillId};
  if (prepared && typeof prepared === "object") data.roll = packRoll(prepared);
  const acknowledgement = await channel.executeAsUser("roll", data, gm.id);
  if (!acknowledgement?.accepted) throw new Error(acknowledgement?.reason ?? "The check could not be resolved.");
  return acknowledgement;
}
async function rollNative(actor, req, skillId, dialog) {
  const message = {create: false};
  const target = req.dc == null ? {} : {target: req.dc};
  if (req.kind === "ability" || req.kind === "save") {
    const method = req.kind === "ability" ? "rollAbilityCheck" : "rollSavingThrow";
    if (typeof actor[method] !== "function") throw new Error(`${actor.name} cannot make ${req.kind === "ability" ? "an ability check" : "a saving throw"}.`);
    return firstRoll(await actor[method]({ability: req.ability, ...target}, dialog, message));
  }
  const skill = req.kind === "delerium" ? skillId : req.skill;
  if (typeof actor.rollSkill !== "function") throw new Error(`${actor.name} cannot make a skill check.`);
  return firstRoll(await actor.rollSkill({skill, ...target}, dialog, message));
}
async function resolveRequest({requestId,actorId,skillId,roll:prepared,hoard}, execution) {
  const message = game.messages.get(requestId), req = validRequest(message), actor = game.actors.get(actorId), sender = game.users.get(execution.senderUserId);
  if (!game.user.isGM || game.user.id !== authority(message)?.id) return {accepted:false,reason:"The request's active GM must resolve this check."};
  if (!req || !req.actorIds.includes(actorId)) return {accepted:false,reason:"This request is no longer available."};
  if (!canRoll(message,actor,sender)) return {accepted:false,reason:"The check is assigned to another player. Any GM may roll for this character."};
  // Results are authored by the authority GM. The clicking client rolls; its dice are rebuilt here and never rolled again.
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
  if (req.kind === "hoard") return advanceHoard(message, req, actor, hoard ?? {});
  let roll, declined = false;
  const supplied = prepared && !(req.kind === "delerium" && skillId === "decline");
  if (supplied) {
    roll = await materializeRoll(prepared, req.kind);
    if (["encounter","surge"].includes(req.kind) && roll?.formula !== `1d${requestDie(req)}`) return {accepted:false,reason:"The supplied roll does not match this check."};
  }
  else if (["encounter","surge"].includes(req.kind)) roll = await new Roll(`1d${req.kind === "surge" ? surgeDie(req) : req.die}`).evaluate({allowInteractive:false});
  else if (req.kind === "death") {
    // Native bonuses and advantage apply, but private checks must not reveal the outcome through sheet counters.
    const preventUpdate = req.blind !== false && Hooks.on("dnd5e.rollDeathSave", (_rolls, data) => { if (data.subject === actor) return false; });
    try { [roll] = await actor.rollDeathSave({}, {configure:false}, {create:false}) ?? []; }
    finally { if (preventUpdate) Hooks.off("dnd5e.rollDeathSave",preventUpdate); }
  } else if (req.kind === "delerium") {
    if (skillId === "decline") declined = true;
    else {
      if (!deleriumSearch().getSkillOptions().some(s => s.id === skillId)) return {accepted:false,reason:"Choose Arcana, Investigation, or Survival."};
      roll = await rollNative(actor, req, skillId, {configure:false});
    }
  } else roll = await rollNative(actor, req, skillId, {configure:false});
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
  const search = deleriumSearch(), session = foundry.utils.deepClone(req.searchSession);
  for (const id of req.actorIds) {
    const result = resultMessage(requestId,id), data = result?.getFlag(ID,"result");
    if (!data) throw new Error("A search result card is missing. Keep the private cards until the search is finalized.");
    const values = {userId:`actor:${id}`,actorUuid:game.actors.get(id)?.uuid ?? `Actor.${id}`};
    if (data.declined) search.decline(session, values);
    else search.attempt(session, {...values,skillId:data.skillId,total:result.rolls[0].total,naturalD20:core().rolls.naturalD20(result.rolls[0])});
  }
  await search.finalize(session);
  const summary = await ChatMessage.create({content:searchSummary(session),blind:req.blind !== false,whisper:req.blind === false ? [] : game.users.filter(u => u.isGM).map(u => u.id),flags:{[ID]:{search:{requestId,session:foundry.utils.deepClone(session)}}}}, {messageMode:req.blind === false ? "public" : "blind"});
  return summary.id;
}
async function openSearchResults(summaryId) {
  if (!game.user.isGM) return;
  const message = game.messages.get(summaryId), data = message?.getFlag(ID,"search");
  if (!data || !message.author?.isGM) throw new Error("Search result no longer exists.");
  const session = foundry.utils.deepClone(data.session);
  return deleriumSearch().openResults(session, {award: async recipientUuid => {
    const updated = await channel.executeAsUser("awardSearch",{summaryId,recipientUuid},authority(message)?.id);
    Object.assign(session, updated);
    return session;
  }});
}

function refreshRequests() {
  for (const message of game.messages) if (validRequest(message)) ui.chat?.updateMessage(message);
}
function rebindHoardCards() {
  for (const message of game.messages ?? []) {
    if (validRequest(message)) ui.chat?.updateMessage?.(message);
  }
}
export function registerRequestRenderers() {
  if (!globalThis.Hooks?.on || globalThis.Hooks._mlgmRequestRenderers) return;
  globalThis.Hooks._mlgmRequestRenderers = true;
  Hooks.on("renderChatMessageHTML",(message,html) => {
    if (!coreReady()) return;
    const hoardReq = validRequest(message)?.kind === "hoard" ? validRequest(message) : null;
    // Foundry lists whispered roll messages for everyone; a private hoard stays hidden from non-recipients.
    if (hoardReq?.private && message.isContentVisible === false) {
      html.hidden = true;
      if (html.style) html.style.display = "none";
      return;
    }
    if (hoardReq) bindHoardCard(message, html);
    html.querySelector("[data-mlgm-open-encounters]")?.addEventListener("click",async () => {
      if (!game.user.isGM) return;
      try {
        if (!game.modules.get("morelord-encounters")?.active) throw new Error("Enable Morelord Encounters first.");
        const {configureEncounter} = await import("../../morelord-encounters/scripts/apps/encounter-builder-dialog.mjs");
        await configureEncounter();
      } catch(error) {ui.notifications.error(error.message);}
    });
    html.querySelector("[data-mlgm-search-results]")?.addEventListener("click",() => openSearchResults(message.id).catch(error => ui.notifications.error(error.message)));
    if (!validRequest(message) || validRequest(message).kind === "hoard" || message.getFlag(ID, "hoard")) return;
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
        try {
          await submitChatRoll(message,actor.id,btn.closest(".ml-card"), async () => {
            const prepared = await prepareRequestRoll(validRequest(message), actor, skill);
            return rollRequest(message.id, actor.id, skill, prepared);
          });
        }
        catch(error) { if (error?.name !== "RollCancelled") ui.notifications.error(error.message); }
        finally { refreshRequests(); }
      });
    }
  });
}
export function initializeRequests() {
  channel = core().socket.createChannel(ID);
  // Existing pending requests should also remain accessible after a player joins.
  if (game.user.isGM) for (const message of game.messages) {
    const req=validRequest(message);
    if (req && !(req.kind === "hoard" && req.private) && authority(message)?.id===game.user.id && (message.blind || message.whisper?.length) && req.actorIds.some(id=>!req.completed?.includes(id)))
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
  channel.on("placeHoardItem", async ({actorId, itemData}) => {
    if (!game.user.isGM) throw new Error("Only a GM can add treasure.");
    const actor = game.actors.get(actorId);
    const created = await actor?.createEmbeddedDocuments("Item", [itemData]);
    return {uuid: created?.[0]?.uuid ?? null, name: created?.[0]?.name ?? itemData?.name ?? ""};
  }, {serialize: `${ID}.rolls`});
  channel.on("finalizeSearch",async ({requestId},execution) => {
    if (!game.user.isGM || !game.users.get(execution.senderUserId)?.isGM) throw new Error("Only GMs can finalize searches.");
    return finalizeSearch(requestId);
  },{serialize:`${ID}.rolls`});
  channel.on("awardSearch",async ({summaryId,recipientUuid},execution) => {
    if (!game.user.isGM || !game.users.get(execution.senderUserId)?.isGM) throw new Error("Only GMs can award search results.");
    const message = game.messages.get(summaryId), data = message?.getFlag(ID,"search");
    if (!message?.author?.isGM || !data?.session) throw new Error("Search summary not found.");
    const session = foundry.utils.deepClone(data.session);
    try { await deleriumSearch().rollAndAward(session, recipientUuid); }
    finally { await message.update({content:searchSummary(session),[`flags.${ID}.search`]:{...data,session:foundry.utils.deepClone(session)}}); }
    return foundry.utils.deepClone(session);
  },{serialize:`${ID}.rolls`});

  registerRequestRenderers();
  rebindHoardCards();
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
export function surgeOutcome(total,threshold=1,die=20) {
  if (die===4) return {threshold:1,triggered:total===1};
  const triggered=total<=threshold;
  return {threshold,triggered,nextThreshold:triggered ? 1 : Math.min(20,threshold+1)};
}
export async function finishSurge(message,actor,result) {
  const req=validRequest(message);
  const volatile = surgeDie(req) === 4;
  let outcome=result.getFlag(ID,"surge");
  if (!outcome) {
    outcome=surgeOutcome(result.rolls[0].total,actor.getFlag(ID,`surges.${req.triggerId}`)?.threshold ?? 1,surgeDie(req));
    await result.setFlag(ID,"surge",outcome);
  }
  if (outcome.triggered && !game.messages.some(m=>m.author?.isGM && m.getFlag(ID,"surgeTable")===result.id)) {
    const table=await fromUuid(req.tableUuid);
    if (!table) throw new Error("Wild Magic table is missing. Restore it and retry this request.");
    const {roll,results}=await table.roll();
    await table.toMessage(results,{roll,messageData:{blind:true,whisper:game.users.filter(u=>u.isGM).map(u=>u.id),speaker:ChatMessage.getSpeaker({actor}),flags:{[ID]:{surgeTable:result.id}}},messageOptions:{messageMode:"blind"}});
  }
  const state=actor.getFlag(ID,`surges.${req.triggerId}`);
  if (!volatile && state?.resultId !== result.id && !outcome.resolved) await actor.setFlag(ID,`surges.${req.triggerId}`,{threshold:outcome.nextThreshold,resultId:result.id});
  await result.update({content:volatile ? `<section class="ml-chat-card"><p>${e(actor.name)} · d4 result ${result.rolls[0].total}: ${outcome.triggered ? "Volatile Magic Surge" : "No surge"}. Only a 1 triggers a surge.</p></section>` : `<section class="ml-chat-card"><p>${e(actor.name)} · ${result.rolls[0].total} against ${outcome.threshold} or lower: ${outcome.triggered ? e(`${req.surgeName || "Wild Magic"} Surge`) : "No surge"}. Next threshold: ${outcome.nextThreshold}.</p></section>`,[`flags.${ID}.surge`]:{...outcome,resolved:true}});
  await message.setFlag(ID,"request",{...req,completed:[actor.id]});
}
