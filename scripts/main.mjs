import {initializeAmmoTracking} from './ammo-recovery.mjs';
import {initializeTriggerMacros,triggerStatus,triggerMacroUuid} from './trigger-macros.mjs';
import {rollOfFate} from './roll-of-fate.mjs';
import {initializeGlobalTriggers,saveGlobalTriggers} from "./global-triggers.mjs";
import {clockInterval,initializeDeferredClockSettlement} from "./world-clock.mjs";
import {initializeTriggers,luckyFindWorldTable} from "./triggers.mjs";
import { ID, escapeHTML as e } from "./core.mjs";
import { DEFAULT_RELAY_URL, MIXED_CONTENT_MESSAGE, RELAY_CAMPAIGNS, askBody, campaignKey, healthSummary, mergeThread, mixedContentBlocked, normalizeRelayURL, parseAsk, parseHealth, parseThread, pollDelay, questionText, relayRequest, renderAnswerMarkdown, threadPending, threadQuery } from "./campaign-relay.mjs";
import { core, craftworks, recipient, initializeRequests, createRequest, foragingTerrains } from "./requests.mjs";
import { CHECK_TYPES, SPECIALTIES, buildCheckRequest, checkChoices, defaultCheckId, resolveRollActors, visibleSpecialties } from "./roll-requests.mjs";
import { addSide, addUnit, averageDamage, createBattle, endBattle, emptyHero, grantHero, removeSide, removeUnit, resetBattle, resolveRound, roundCard, unitStatus, updateBattle, updateUnit } from "./mass-battle.mjs";

const tabs = { rolls: "Roll Requests", macros: "Macros", sound: "Sound", triggers: "Triggers", battle: "Mass Combat", ai: "Campaign AI", settings: "GM Settings", party: "Player Settings" };
let root, open = false, tab = "rolls", state, saving = Promise.resolve(), status = "Ready. Choose an action to configure it.";
let questionDraft = "";
let relayStatus = "";
let relayThread = {entries: [], serverTime: "", notice: ""};
let relayFailures = 0;
let relayTimer = 0;
let relayGeneration = 0;
let terrainOptions = [];
let settingTrackVolumes = false;
let suppressMacroClick = false;
const get = key => game.settings.get(ID, key);
const button = (action, label, id = "", extra = "") => `<button type="button" data-action="${action}" data-id="${e(id)}" ${extra}>${e(label)}</button>`;
const deleteButton = (action, id, name) => `<button type="button" class="ml-icon-button" data-action="${action}" data-id="${e(id)}" title="Delete ${e(name)}" aria-label="Delete ${e(name)}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>`;
const savedButton = (action, name, id, remove) => `<div class="ml-item-row"><div class="ml-stack">${button(action,name,id)}</div>${deleteButton(remove,id,name)}</div>`;
const option = (id, name, selected) => `<option value="${e(id)}" ${id === selected ? "selected" : ""}>${e(name)}</option>`;
const column = (title, body, cls = "") => `<div class="ml-stack gm-column ${cls}" data-gap="4"><strong>${e(title)}</strong>${body}</div>`;
const label = (name, content) => `<label><span>${e(name)}</span>${content}</label>`;
const inlineField = (name, content) => `<label class="gm-inline"><span>${e(name)}</span>${content}</label>`;
const requestButton = (action, id, name, extra = "") => `<button type="button" class="ml-icon-button" data-action="${action}" data-id="${e(id)}" title="${e(name)}" aria-label="${e(name)}" ${extra}><i class="fa-solid fa-dice-d20" aria-hidden="true"></i></button>`;
function requestRow({card, fields = "", blind = null, action, id = "", name, disabled = false}) {
  const blindControl = blind == null ? "" : `<label class="ml-check"><input type="checkbox" name="blind" ${blind ? "checked" : ""}><span>Blind roll</span></label>`;
  return `<form class="gm-request-row" data-roll-card="${e(card)}">${fields}${blindControl}${requestButton(action, id, name, disabled ? "disabled" : "")}</form>`;
}
const input = (name, value = "", attrs = "") => `<input name="${name}" value="${e(value)}" ${attrs}>`;
const select = (name, options) => `<select name="${name}">${options}</select>`;
const gm = () => { if (!game.user.isGM) throw new Error("Only the GM can use this action."); };
const notify = text => { status = text; };
function fail(error) { console.error(`${ID} |`, error); ui.notifications.error(error.message ?? String(error)); notify(error.message ?? String(error)); }
function persist(change) {
  // Serialize settings writes so fast clicks cannot overwrite a previous save.
  saving = saving.catch(() => {}).then(async () => {
    const next = foundry.utils.deepClone(state);
    change(next);
    if (JSON.stringify(next.triggers) !== JSON.stringify(state.triggers)) await saveGlobalTriggers(next.triggers);
    await game.settings.set(ID, "board", next);
    state = next;
  });
  return saving;
}
async function form(title, content, actions = [["ok", "Save"]]) {
  return foundry.applications.api.DialogV2.wait({ id:`${ID}-${title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/-$/,"")}`, classes:["ml-window"], window: { title, resizable: true }, position: { width: /Ambience|campaign|Verify/i.test(title) ? 560 : /Trigger Character|Trigger Action|settings/i.test(title) ? 480 : 400 },
    content: `<div><div class="ml-app ml-app-shell ml-dialog-shell">${content}</div></div>`, rejectClose: false,
    buttons: actions.map(([action, text], i) => ({ action, label: text, default: i === 0,
      callback: (_event, btn) => ({ action, data: new FormData(btn.form) }) })) });
}

Hooks.once("init", () => {
  class GameMasterSettings extends foundry.applications.api.ApplicationV2 {
    render() { settings().catch(fail); return this; }
  }
  game.settings.registerMenu(ID,"configure",{name:"Morelord Game Master",label:"Configure",hint:"Ambience folder.",icon:"fa-solid fa-dice-d20",type:GameMasterSettings,restricted:true});
  game.settings.register(ID, "board", { scope: "world", config: false, type: Object,
    default: { saved: [], scenarios: [], last: {}, triggers: [] } });
  game.settings.register(ID,"macros",{scope:"world",config:false,type:Array,default:[]});
  game.settings.register(ID, "ambienceFolder", { name: "Ambience folder", hint: "A folder in Foundry's user data containing audio files.", scope: "world", config: false, type: String, default: "Ambience" });
  game.settings.register(ID, "relayUrl", { name: "Campaign AI relay URL", hint: "Campaign AI relay origin for this world.", scope: "world", config: false, type: String, default: DEFAULT_RELAY_URL });
  game.settings.register(ID, "relayToken", { name: "Campaign AI relay token", hint: "Bearer token for the Campaign AI relay. It is not written to the log.", scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "relayCampaign", { name: "Campaign AI campaign", hint: "Campaign this world asks about.", scope: "world", config: false, type: String, default: "" });
  game.settings.register(ID, "massBattle", { name: "Mass Combat battle", hint: "Experimental mass-combat battle for this world.", scope: "world", config: false, type: Object, default: null });
  for (const specialty of SPECIALTIES) game.settings.register(ID, specialty.setting, { name: `Show ${specialty.label}`, hint: "Show this specialty request on the Roll Requests tab for this world.", scope: "world", config: true, type: Boolean, default: true });
  game.keybindings.register(ID, "toggle", { name: "Toggle Game Master tray", restricted: true,
    editable: [{ key: "KeyG", modifiers: ["Alt"] }], onDown: () => { toggle(); return true; } });
});

Hooks.once("ready", async () => {
  initializeDeferredClockSettlement(() => (game.settings.get(ID,'board').triggers ?? []).some(t => t.kind === 'world-clock' && t.enabled && triggerStatus(t.id) === 'Running'));
  try { initializeRequests(); initializeAmmoTracking(); await initializeGlobalTriggers(); initializeTriggers(); await initializeTriggerMacros(); await core().compendiums?.organize([{collection:`${ID}.macros`,label:"Game Master Macros"},{collection:`${ID}.roll-tables`,label:"Game Master Roll Tables"}],["Morelord Gaming","Game Master"]); } catch(error) { ui.notifications.error(error.message); return; }
  game.modules.get(ID).api = { toggle, requestCheck, requestEncounter:encounter, requestDeathSave:() => requestCheck({kind:"death",...state?.last.death}), rollOfFate, addTrigger };
  core().ui.documentation.register({id:ID,title:'Morelord Game Master',icon:'fa-solid fa-dice-d20',source:'modules/morelord-game-master/README.md'});
  if (!game.user.isGM) return;
  if (!get("massBattle")?.sides?.length) await game.settings.set(ID, "massBattle", createBattle(() => foundry.utils.randomID()));
  state = foundry.utils.deepClone(get("board"));
  foragingTerrains().then(options=>{terrainOptions=options;render();}).catch(()=>{});
  root = document.createElement("aside"); root.id = "mlgm"; root.className = "ml-window"; root.setAttribute("aria-label", "Morelord Game Master");
  document.body.append(root);
  root.addEventListener("click", event => {
    const target = event.target.closest("[data-action]");
    if (!target || target.disabled) return;
    if (suppressMacroClick && target.dataset.action === "macro") return;
    target.disabled = true;
    Promise.resolve(act(target.dataset.action, target.dataset.id)).catch(fail).finally(() => { if (target.isConnected) target.disabled = false; });
  });
  new foundry.applications.ux.ContextMenu(root,'[data-macro-uuid]',[{name:"Remove",icon:'<i class="fa-solid fa-trash"></i>',callback:element=>act("unpin-macro",element.dataset.macroUuid).catch(fail)}],{jQuery:false,fixed:true});
  root.addEventListener("submit",event=>{event.preventDefault();const id=event.target.dataset.rollCard;if(id==="check")sendCheck().catch(fail);else if(id)sendQuick(id).catch(fail);});
  root.addEventListener("change", event => onChange(event).catch(fail));
  root.addEventListener("dragover",event=>{if(tab === "macros" || tab === "battle")event.preventDefault();});
  root.addEventListener("drop",event=>{if(tab === "macros"){event.preventDefault();dropMacro(event).catch(fail);}if(tab === "battle"){event.preventDefault();dropUnit(event).catch(fail);}});
  root.addEventListener("dragstart",event=>{const tile=event.target.closest('[data-macro-uuid]');if(!tile)return;suppressMacroClick=true;event.dataTransfer.setData('text/plain',JSON.stringify({type:'Macro',uuid:tile.dataset.macroUuid}));event.dataTransfer.effectAllowed="copyMove";});
  root.addEventListener("dragend",()=>{setTimeout(()=>{suppressMacroClick=false;});});
  root.addEventListener("keydown", event => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && event.target.id === "mlgm-question") { event.preventDefault(); act("ai-ask").catch(fail); return; }
    if (event.key === "Escape") { toggle(false); event.stopPropagation(); }
    const current = event.target.closest('[role="tab"]');
    if (!current) return;
    const ids = Object.keys(tabs), index = ids.indexOf(current.dataset.id);
    const next = event.key === "ArrowRight" ? ids[(index+1)%ids.length] : event.key === "ArrowLeft" ? ids[(index+ids.length-1)%ids.length] : event.key === "Home" ? ids[0] : event.key === "End" ? ids.at(-1) : ["Enter"," "].includes(event.key) ? current.dataset.id : null;
    if (next) { event.preventDefault(); tab = next; render(); root.querySelector(`#mlgm-tab-${next}`).focus(); }
  });
  root.addEventListener("input", event => {
    if (event.target.id === "mlgm-question") questionDraft = event.target.value;
  });
  render();
  core().ui.activateCardSelection({element:root});
});

function toggle(value = !open) {
  if (!game.user?.isGM || !root) return;
  open = Boolean(value); document.body.classList.toggle("mlgm-open", open); render();
  if (open && tab === "ai") syncRelayPoll({immediate: true});
  else stopRelayPoll();
  root.querySelector(open ? "[role=tab][aria-selected=true]" : ".gm-handle")?.focus();
}
function saved(type) {
  return state.saved.filter(s => s.type === type).map(s => savedButton("saved",savedName(s.type,s.config),s.id,"remove-saved")).join("");
}
function savedName(type,config) {
  if (type === "group" || type === "player") return `${game.i18n.localize(CONFIG.DND5E.skills[config.skill]?.label ?? config.skill)} Check${type === "player" ? ` - ${game.actors.get(config.actorIds?.[0])?.name ?? "Missing character"}` : ""}`;
  if (type === "playlist") return game.playlists.get(config.playlist)?.name ?? "Missing playlist";
  if (type === "ambience") return config.files.map(f=>f.path.split('/').at(-1).replace(/\.[^.]+$/,"")).join(" + ");
  return "Death Saving Throw";
}
function render() {
  if (!root) return;
  root.innerHTML = `<button type="button" data-action="toggle" class="ml-tray-handle gm-handle" aria-expanded="${open}" aria-controls="mlgm-tray" title="${open ? "Close" : "Open"} Game Master"><i class="fa-solid fa-chevron-${open ? "down" : "up"}" aria-hidden="true"></i><span>Game Master</span></button>
    <section id="mlgm-tray" class="window-content gm-tray" ${open ? "" : "hidden"}><div class="ml-app ml-app-shell"><header class="ml-hero"><i class="fa-solid fa-dice-d20 ml-hero__icon" aria-hidden="true"></i><div class="ml-hero__body"><h1>Morelord Game Master</h1><p>Your table, within reach.</p></div><div class="ml-actions">${button("documentation", "Documentation")}</div></header>

    <nav class="ml-tabs ml-compact" role="tablist" aria-label="Game Master tools">${Object.entries(tabs).map(([id, name]) => `<a data-action="tab" data-id="${id}" id="mlgm-tab-${id}" role="tab" tabindex="${tab === id ? 0 : -1}" aria-selected="${tab === id}" aria-controls="mlgm-panel">${e(name)}</a>`).join("")}</nav>
    <section id="mlgm-panel" class="${["sound","ai"].includes(tab) ? "ml-surface " : ""}ml-grid ml-compact gm-columns" data-columns="${["triggers","macros","party","rolls","settings","battle"].includes(tab) ? "1" : "3"}" role="tabpanel" aria-labelledby="mlgm-tab-${tab}">${content()}</section></div></section>`;
  core().ui.applyPageLayout({element:root});
}
function content() {
  if (tab === "rolls") return `<div class="ml-stack gm-request-rows" data-gap="2">${checkBuilder()}${quickRequests()}</div>`;
  if (tab === "party") return `<div class="ml-stack"><p>Characters included in party roll requests.</p>${characterChoices(partyActorIds())}</div>`;
  if (tab === "settings") return `<div class="ml-stack"><p>Specialty requests shown on Roll Requests. Every request starts visible, and this world remembers each choice.</p>${SPECIALTIES.map(specialty=>`<label class="ml-check"><input type="checkbox" name="specialty" value="${specialty.id}" ${game.settings.get(ID, specialty.setting)!==false?"checked":""}><span>${e(specialty.label)}</span></label>`).join("")}<h2>Campaign AI</h2>${label("Relay URL", input("relayUrl", get("relayUrl") ?? DEFAULT_RELAY_URL, 'type="url" autocomplete="off"'))}${label("Relay token", input("relayToken", get("relayToken") ?? "", 'type="password" autocomplete="off"'))}${label("Campaign", `<select name="relayCampaign">${RELAY_CAMPAIGNS.map(campaign => option(campaign.key, campaign.label, get("relayCampaign") ?? "")).join("")}</select>`)}${button("ai-test", "Test connection")}<p class="notes" id="mlgm-relay-status">${e(relayStatus)}</p></div>`;
  if (tab === "triggers") return `<div class="ml-grid gm-triggers" data-columns="3">${triggerCards()}</div>`;
  if (tab === "sound") {
    const playing = game.playlists.contents.flatMap(p => p.sounds.filter(s=>s.playing).map(s=>({p,s})));
    const cards = playing.map(({p,s})=>`<div class="ml-card ml-stack"><strong>${e(s.name)}</strong><small>${e(p.name)}</small><div class="ml-item-row"><input type="range" min="0" max="1" step="0.01" value="${s.volume}" data-playlist="${p.id}" data-sound="${s.id}" aria-label="${e(s.name)} volume">${button("stop-sound","Stop",`${p.id}:${s.id}`)}</div></div>`).join("");
    return column("Playlists",`${button("playlist","Start Playlist")}${saved("playlist")}`)
      + column("Ambience",`${button("ambience","Play Ambience")}${saved("ambience")}`)
      + `<div class="ml-stack gm-column" data-gap="4"><div class="ml-stack">${label("All track volumes (%)",input("allTrackVolume",state.last.allTrackVolume ?? 25,'id="ml-game-master-track-volume" type="number" min="0" max="100" step="1" required'))}${button("set-track-volumes",settingTrackVolumes ? "Setting volumes…" : "Set All Track Volumes","",settingTrackVolumes ? "disabled" : "")}<small>Applies to every playlist track, including stopped tracks and ambience.</small></div>${column("Now Playing",cards + (playing.some(({p})=>!p.getFlag(ID,"ambience")) ? button("stop-music","Stop Music") : "") + (playing.some(({p})=>p.getFlag(ID,"ambience")) ? button("stop-ambience","Stop Ambience") : ""))}</div>`;
  }
  if (tab === "macros") return `<div class="gm-macros">${macroButtons()}</div>`;
  if (tab === "battle") return battleContent();
  return aiContent();
}
function partyActorIds() {
  const eligible=core().ui.participation.listCharacterActors();
  const selected=state.partyActorIds ?? core().ui.participation.listCharacterChoices().filter(c=>c.checked).map(c=>c.uuid.split('.').at(-1));
  return selected.filter(id=>eligible.some(a=>a.id===id));
}
function catalogs() { return {skills: CONFIG.DND5E?.skills ?? {}, abilities: CONFIG.DND5E?.abilities ?? {}}; }
function checkBuilder() {
  const c = state.last.check ?? {};
  const checkType = CHECK_TYPES.some(type => type.id === c.checkType) ? c.checkType : "skill";
  const choices = checkChoices(checkType, catalogs());
  const checkId = defaultCheckId(checkType, choices, c.checkId);
  const scope = ["party","tokens","player"].includes(c.scope) ? c.scope : "party";
  const actors = partyActorIds().map(id => game.actors.get(id)).filter(Boolean);
  const actorId = actors.some(actor => actor.id === c.actorId) ? c.actorId : actors[0]?.id ?? "";
  const checkLabel = checkType === "skill" ? "Skill" : "Ability";
  const fields = [
    inlineField("Type", select("checkType", CHECK_TYPES.map(type => option(type.id, type.label, checkType)).join(""))),
    inlineField(checkLabel, select("checkId", choices.map(choice => option(choice.id, game.i18n.localize(choice.label), checkId)).join(""))),
    inlineField("DC", input("dc", c.dc ?? "", 'type="number" min="0" step="1"')),
    inlineField("Who rolls", select("scope", [["party","Party"],["tokens","Selected tokens"],["player","One character"]].map(([id, name]) => option(id, name, scope)).join(""))),
    scope === "player" ? inlineField("Character", select("actorId", actors.map(actor => option(actor.id, actor.name, actorId)).join(""))) : ""
  ].join("");
  return requestRow({card: "check", fields, blind: c.blind === true, action: "send-check", name: "Send check", disabled: !(scope === "tokens" || actors.length)});
}
function quickRequests() {
  const settings = Object.fromEntries(SPECIALTIES.map(specialty => [specialty.setting, game.settings.get(ID, specialty.setting)]));
  return visibleSpecialties(settings).map(id => quickControl(id)).join("");
}
function quickControl(id) {
  const c = state.last[id] ?? {};
  const actors = partyActorIds().map(actorId => game.actors.get(actorId)).filter(Boolean);
  const names = {encounter: "Encounter Check", search: "Delerium Search", foraging: "Foraging Check", death: "Death Save", fate: "Roll of Fate"};
  if (id === "fate") return requestRow({card: "fate", action: "quick-request", id: "fate", name: names.fate});
  const zones = id === "search" ? searchZones() : [];
  const field = id === "encounter" ? inlineField("Die", select("die", [4,6,8,10,12,20].map(die => option(String(die), `d${die}`, String(c.die ?? state.last.die ?? 8))).join("")))
    : id === "foraging" ? inlineField("Terrain", select("terrainIndex", terrainOptions.map((terrain, index) => option(String(index), terrain.label, String(c.terrainIndex ?? 2))).join("")))
    : id === "death" ? inlineField("Character", select("actorId", actors.map(actor => option(actor.id, actor.name, c.actorIds?.[0] ?? actors[0]?.id)).join("")))
    : inlineField("Area", select("zoneId", zones.map(zone => option(zone.id, `${zone.name} - DC ${zone.dc}`, c.zoneId ?? zones[0]?.id)).join("")));
  return requestRow({card: id, fields: field, blind: c.blind === true, action: "quick-request", id, name: names[id]});
}
function searchZones() {
  try { return craftworks().deleriumSearch.getZones(); } catch { return []; }
}
function readBuilder() {
  const data = new FormData(root.querySelector('[data-roll-card="check"]'));
  const checkType = CHECK_TYPES.some(type => type.id === data.get("checkType")) ? data.get("checkType") : "skill";
  const choices = checkChoices(checkType, catalogs());
  return {checkType, checkId: defaultCheckId(checkType, choices, data.get("checkId")), dc: parseDC(data.get("dc")), scope: ["party","tokens","player"].includes(data.get("scope")) ? data.get("scope") : "party", actorId: data.get("actorId") || "", blind: data.has("blind")};
}
function selectedTokenActorIds() {
  return [...new Set((canvas.tokens?.controlled ?? []).map(token => token.actor?.id).filter(Boolean))];
}
function readQuick(id) {
  const data = new FormData([...root.querySelectorAll("[data-roll-card]")].find(card => card.dataset.rollCard === id));
  const blind = data.has("blind");
  if (id === "encounter") return {kind: "encounter", die: Number(data.get("die")), blind, actorIds: partyActorIds()};
  if (id === "foraging") return {kind: "foraging", terrainIndex: Number(data.get("terrainIndex")), blind, actorIds: partyActorIds()};
  if (id === "death") return {kind: "death", blind, actorIds: [data.get("actorId")].filter(Boolean)};
  return {kind: "delerium", zoneId: data.get("zoneId"), blind, actorIds: partyActorIds()};
}
async function sendCheck() {
  await saving;
  const draft = readBuilder();
  const actorIds = resolveRollActors({scope: draft.scope, actorId: draft.actorId, partyIds: partyActorIds(), selectedActorIds: selectedTokenActorIds()});
  await persist(n => { n.last.check = draft; });
  await createRequest(buildCheckRequest({...draft, type: draft.checkType, actorIds}));
}
async function sendQuick(id) {
  await saving;
  if (id === "fate") return rollOfFate();
  const config = readQuick(id);
  if (!config.actorIds.length) throw new Error(id === "death" ? "Choose a character from Player Settings." : "Select participating characters on the Player Settings tab first.");
  await persist(n => { n.last[id] = config; if (id === "encounter") n.last.die = config.die; });
  await createRequest(config);
}
function macroButtons() {
  return (get("macros") ?? []).map(uuid=>{const macro=fromUuidSync(uuid),name=macro?.name ?? "Missing macro";return `<button type="button" class="gm-macro" draggable="true" data-macro-uuid="${e(uuid)}" data-action="macro" data-id="${e(uuid)}" title="${e(name)}" aria-label="${e(name)}"><img src="${e(macro?.img ?? "icons/svg/dice-target.svg")}" alt="" width="32" height="32" draggable="false"><span>${e(name)}</span></button>`;}).join("");
}
async function dropMacro(event) {
  gm();
  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  if (data.type !== "Macro") throw new Error("Drag a macro into this panel.");
  let macro = await Macro.fromDropData(data);
  if (!macro) throw new Error("Macro not found.");
  if (macro.inCompendium) macro = await Macro.create(macro.toObject());
  const pinned = (get("macros") ?? []).filter(uuid=>uuid !== macro.uuid);
  const before = event.target.closest('[data-macro-uuid]')?.dataset.macroUuid;
  if (before === macro.uuid) return;
  const index = pinned.indexOf(before);
  pinned.splice(index < 0 ? pinned.length : index,0,macro.uuid);
  await game.settings.set(ID,"macros",pinned);render();
}

async function act(action, id) {
  gm();
  if (action === "toggle") return toggle();
  if (action === "tab") { tab = id; render(); if (open && tab === "ai") syncRelayPoll({immediate: true}); else stopRelayPoll(); return; }
  if (action === "send-check") return sendCheck();
  if (action === "quick-request") return sendQuick(id);
  if (action === "settings") return settings();
  if (action === "trigger-edit" || action === "trigger-remove") return;
  if (action === "fate") return rollOfFate();
  if (action === "unpin-macro") {await game.settings.set(ID,"macros",(get("macros") ?? []).filter(uuid=>uuid !== id));render();return;}
  if (action === "documentation") return core().ui.documentation.open(ID);
  if (action === "scenario") { const s = state.scenarios.find(x => x.id === id); if (s) { await persist(n => { n.last.die = s.die; }); await encounter(s.die, s.name, s.actorIds); } }
  if (action.startsWith("remove-")) { const key = action === "remove-saved" ? "saved" : "scenarios"; await persist(n => { n[key] = n[key].filter(x => x.id !== id); }); }
  if (action === "saved") { const s = state.saved.find(x => x.id === id); if (s) await run(s.type, s.config); }
  if (action === "playlist") return playlistForm();
  if (action === "ambience") return ambienceForm();
  if (action === "set-track-volumes") return setTrackVolumes();
  if (action === "stop-music" || action === "stop-ambience") for (const p of game.playlists) if (Boolean(p.getFlag(ID,"ambience")) === (action === "stop-ambience")) await p.stopAll();
  if (action === "stop-sound") { const [p,s] = id.split(":"); await game.playlists.get(p)?.sounds.get(s)?.update({playing:false}); }
  if (action === "macro") { const m = await fromUuid(id); if (!m?.canExecute) throw new Error("That macro is no longer available."); await m.execute(); notify(`Launched ${m.name}.`); }
  if (action === "trigger-toggle") await persist(n => { const t = n.triggers.find(x => x.id === id); if (t) t.enabled = !t.enabled; });

  if (action === "battle-resolve") return resolveBattle();
  if (action === "battle-reset") return confirmBattle("reset");
  if (action === "battle-end") return confirmBattle("end");
  if (action === "battle-add-side") return saveBattle(battle => addSide(battle, `Side ${String.fromCharCode(65 + battle.sides.length)}`, () => foundry.utils.randomID()));
  if (action === "battle-remove-side") return saveBattle(battle => removeSide(battle, id));
  if (action === "battle-remove-unit") return saveBattle(battle => removeUnit(battle, id));
  if (action === "battle-hero") return requestHero();
  if (action === "ai-test") return testRelay();
  if (action === "ai-ask") return askRelay(root.querySelector("#mlgm-question")?.value ?? questionDraft);
  if (action === "ai-retry") return askRelay(relayThread.entries.find(entry => entry.requestId === id)?.question ?? "");
  render();
}
async function onChange(event) {
  if (await onBattleChange(event)) return;
  const el = event.target;
  if (el.id === "ml-game-master-track-volume" && el.checkValidity()) {
    gm();
    const percent = Number(el.value);
    await persist(n=>{n.last.allTrackVolume=percent;});return;
  }
  if (tab === "party" && el.name === "actorUuids") {
    const ids=[...root.querySelectorAll('[name="actorUuids"]:checked')].map(el=>el.value.split('.').at(-1));
    await persist(n=>{n.partyActorIds=ids;});return;
  }
  if (tab === "settings" && el.name === "specialty") {
    const specialty = SPECIALTIES.find(item => item.id === el.value);
    if (specialty) await game.settings.set(ID, specialty.setting, el.checked);
    return;
  }
  if (el.name === "relayUrl") { await game.settings.set(ID, "relayUrl", normalizeRelayURL(el.value)); relayStatus = ""; return; }
  if (el.name === "relayToken") { await game.settings.set(ID, "relayToken", el.value); return; }
  if (el.name === "relayCampaign") {
    await game.settings.set(ID, "relayCampaign", campaignKey(el.value));
    relayThread = {entries: [], serverTime: "", notice: ""};
    relayFailures = 0;
    relayStatus = "";
    return;
  }
  const card=el.closest('[data-roll-card]');
  if (card?.dataset.rollCard === "check") { await persist(n => { n.last.check = readBuilder(); }); return; }
  if (card && ["encounter","search","foraging","death"].includes(card.dataset.rollCard)) {
    const config = readQuick(card.dataset.rollCard);
    await persist(n => { n.last[card.dataset.rollCard] = config; if (card.dataset.rollCard === "encounter") n.last.die = config.die; });
    return;
  }
  if (el.dataset.sound) { gm(); await game.playlists.get(el.dataset.playlist)?.sounds.get(el.dataset.sound)?.update({ volume: Number(el.value) }); }
}
async function setTrackVolumes() {
  gm();
  if (settingTrackVolumes) return;
  const field = root.querySelector('#ml-game-master-track-volume');
  if (!field?.reportValidity()) return;
  const percent = Number(field.value);
  const volume = foundry.audio.AudioHelper.inputToVolume(percent / 100);
  settingTrackVolumes = true;
  try {
    await persist(n=>{n.last.allTrackVolume=percent;});
    render();
    let count = 0;
    for (const playlist of game.playlists) {
      const updates = playlist.sounds.map(sound=>({_id:sound.id,volume}));
      if (!updates.length) continue;
      await playlist.updateEmbeddedDocuments("PlaylistSound",updates);
      count += updates.length;
    }
    ui.notifications.info(`Set ${count} playlist tracks to ${percent}%.`);
  } finally {
    settingTrackVolumes = false;
    render();
  }
}
async function run(type, config) {
  if (["group", "player", "death"].includes(type)) await createRequest({...config,...(type === "group" ? {actorIds:partyActorIds()} : {}),kind:type === "death" ? "death" : "skill"});
  if (type === "playlist") {
    const p = game.playlists.get(config.playlist);
    if (!p) throw new Error("The saved playlist no longer exists.");
    if (!p.sounds.size) throw new Error("Add tracks to this playlist before starting it.");
    for (const music of game.playlists.filter(m => !m.getFlag(ID,"ambience") && (m.playing || m.sounds.some(s => s.playing || s.pausedTime)))) await music.stopAll();
    await p.update({mode:CONST.PLAYLIST_MODES.SHUFFLE});
    await p.updateEmbeddedDocuments("PlaylistSound", p.sounds.map(s => ({ _id:s.id, volume:config.volume })));
    await p.playAll(); notify(`Playing ${p.name}.`);
  }
  if (type === "ambience") {
    let p = game.playlists.find(p => p.getFlag(ID,"ambience"));
    if (!p) p = await Playlist.create({ name:"Morelord · Ambience", mode:CONST.PLAYLIST_MODES.SIMULTANEOUS, flags:{[ID]:{ambience:true}} });
    for (const file of config.files) {
      let sound = p.sounds.find(s => s.path === file.path);
      if (!sound) [sound] = await p.createEmbeddedDocuments("PlaylistSound", [{ name:file.path.split("/").pop(), path:file.path, repeat:true, volume:file.volume }]);
      await sound.update({ playing:true, repeat:true, volume:file.volume });
    }
    notify("Ambience layers started for the table.");
  }
}
async function saveAndRun(type, config) {
  const name = savedName(type,config);
  await persist(n => {
    n.last[type] = config;
    const existing = n.saved.find(s=>s.type === type && savedName(s.type,s.config) === name);
    if (existing) Object.assign(existing,{name,config});
    else n.saved.push({id:foundry.utils.randomID(),type,name,config});
  });
  render();
}
function characterDropdown(actorId) {
  const actors = core().ui.participation.listCharacterActors();
  return label("Player / character",`<select name="actorUuids" data-mlgm-character>${actors.map(a=>option(a.uuid,`${a.name} - ${recipient(a)?.name ?? "GM"}`,game.actors.get(actorId)?.uuid ?? actors[0]?.uuid)).join("")}</select>`);
}
Hooks.on("renderDialogV2",(app,html)=>{for(const field of html.querySelectorAll?.('[data-mlgm-character]') ?? [])core().ui.decorateActorSelect(field);});
function parseDC(value) { if (value === null || String(value).trim() === "") return null; const dc = Number(value); if (!Number.isInteger(dc) || dc < 0) throw new Error("DC must be a non-negative whole number or blank."); return dc; }
function characterChoices(actorIds, single = false) {
  const selectedUuids = actorIds ? actorIds.map(id => game.actors.get(id)?.uuid).filter(Boolean) : null;
  const choices = core().ui.participation.listCharacterChoices({selectedUuids});
  const singleUuid = choices.find(c => c.checked)?.uuid ?? choices[0]?.uuid;
  return `<section class="ml-surface ml-stack" data-gap="3"><div class="ml-section-heading"><div><h2>Verify characters</h2><p>Participants and roll recipients</p></div></div><div class="ml-actor-choice-grid">${choices.map(c => {
    const actor = game.actors.get(c.uuid.split(".").at(-1)), target = recipient(actor);
    return `<label class="ml-actor-choice"><input type="${single ? "radio" : "checkbox"}" name="actorUuids" value="${e(c.uuid)}" ${(single ? c.uuid === singleUuid : c.checked) ? "checked" : ""}><img src="${e(c.img)}" alt=""><span>${e(c.name)}<br><small>${e(target?.isGM ? `GM · ${target.name} (no active player)` : target?.name ?? "No active GM")}</small></span></label>`;
  }).join("")}</div></section>`;
}
function selectedActors(data) { return core().ui.participation.selectedCharacterUuids(data).map(uuid => uuid.split(".").at(-1)); }
async function verifyCharacters(actorIds,{single=false,title="Verify characters"}={}) {
  const result = await form(title,characterChoices(actorIds,single),[["run","Confirm & request"]]);
  if (!result) return null;
  const ids = selectedActors(result.data);
  if (!ids.length) throw new Error("Select at least one character.");
  return ids;
}
async function encounter(die,name,selected) {
  gm();
  if (!Number.isInteger(die) || die < 2 || die > 1000) throw new Error("Invalid encounter die.");
  const actorIds = await verifyCharacters(selected ?? state.last.encounter?.actorIds,{title:`Encounter Check · 1d${die}`});
  if (!actorIds) return;
  await persist(n => {n.last.encounter = {actorIds};});
  await createRequest({kind:"encounter",die,name,actorIds});
  notify(`Requested blind 1d${die} encounter checks.`);
}
async function playlistForm() {
  const playlists = game.playlists.filter(p => !p.getFlag(ID,"ambience"));
  if (!playlists.length) throw new Error("Create a playlist in Foundry first.");
  const last = state.last.playlist ?? { volume:0.65 };
  const result = await form("Start Playlist",label("Playlist",select("playlist",playlists.map(p => option(p.id,p.name,last.playlist)).join(""))) + label("Volume (%)",input("volume",last.volume*100,'type="number" min="0" max="100" required')) , [["save","Save button"]]);
  if (result) await saveAndRun("playlist",{playlist:result.data.get("playlist"), volume:volume(result.data.get("volume"))},result);
}
function volume(value) { const n = Number(value); if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("Volume must be between 0 and 100."); return n / 100; }
async function ambienceForm() {
  const browser = await foundry.applications.apps.FilePicker.browse("data",get("ambienceFolder"));
  const files = browser.files.filter(f => /\.(mp3|ogg|wav|flac|webm|m4a)$/i.test(f));
  if (!files.length) throw new Error("No audio files found in the configured Ambience folder.");
  const last = state.last.ambience?.files ?? [];
  const result = await form("Play Ambience",`<fieldset class="ml-stack"><legend>Layers and volume (%)</legend>${files.map((path,i) => { const prev = last.find(f => f.path === path); return `<div class="ml-card ml-item-row"><label class="ml-check"><input type="checkbox" name="file" value="${i}" ${prev ? "checked" : ""}><span>${e(path.split("/").pop())}</span></label>${label("Volume (%)",input(`volume${i}`,(prev?.volume ?? .4)*100,'type="number" min="0" max="100" required'))}</div>`; }).join("")}</fieldset>` , [["save","Save button"]]);
  if (!result) return;
  const selected = result.data.getAll("file").map(i => ({path:files[Number(i)],volume:volume(result.data.get(`volume${i}`))}));
  if (!selected.length) throw new Error("Select at least one sound.");
  await saveAndRun("ambience",{files:selected},result);
}

export async function requestCheck(config) {
  gm();
  const actorIds = await verifyCharacters(config.actorIds, {single:config.kind === "death", title:config.kind === "death" ? "Death Saving Throw" : "Verify characters"});
  if (!actorIds) return;
  const message = await createRequest({...config,actorIds});
  notify("Check requested. Core routes online players and offline GM fallbacks.");
  render();
  return message;
}
for (const hook of ["morelordGameMasterTriggersChanged","createChatMessage","deleteChatMessage","updateChatMessage","updatePlaylist","updatePlaylistSound","createMacro","updateMacro","deleteMacro","updateUser"]) Hooks.on(hook, () => { if (open && tab !== "ai") render(); });
Hooks.on("createChatMessage", message => { if (game.user.isGM) grantHeroResult(message).catch(fail); });
Hooks.on("updateSetting", setting => {
  if (!game.user.isGM) return;
  if (setting.key === `${ID}.macros` || (setting.key === `${ID}.massBattle` && open && tab === "battle")) render();
  if (setting.key === `${ID}.board`) { state = foundry.utils.deepClone(get("board")); render(); }
  if (open && tab === "rolls" && SPECIALTIES.some(specialty => setting.key === `${ID}.${specialty.setting}`)) render();
});

export async function addTrigger({name,actorId,itemId,tableId,tableUuid,kind="item",id,gameMinutes=10,realMinutes=1}) {
  gm();
  const actor=game.actors.get(actorId),item=actor?.items.get(itemId);
  if ((kind === "item" && !actor) || !["item","sorcerer","volatile","sneak","hunters-mark","ammo-recovery","lucky-find","world-clock","critical-hit","critical-fumble"].includes(kind)) throw new Error("Choose a character and trigger condition.");
  if (kind === "item" && !item) throw new Error("Choose the character's item or feature.");
  const table=kind === "lucky-find" ? luckyFindWorldTable() : ["sneak","hunters-mark","ammo-recovery","world-clock","critical-hit","critical-fumble"].includes(kind) ? null : await fromUuid(tableUuid ?? `RollTable.${tableId}`);
  if (!["sneak","hunters-mark","ammo-recovery","world-clock","critical-hit","critical-fumble"].includes(kind) && !table) throw new Error(kind === "lucky-find" ? "Import the Lucky Finds table into this world first." : "Choose a valid roll-table UUID.");
  if (kind === "world-clock" && id && state.triggers.some(t=>t.kind === kind && t.id !== id)) throw new Error("Edit the existing World Clock trigger instead.");
  const interval=kind === "world-clock" ? clockInterval({gameMinutes,realMinutes}) : {};
  const trigger={macroUuid:triggerMacroUuid(kind),...interval,sourceWorld:game.world?.id,id:id ?? foundry.utils.randomID(),name:name?.trim() || (kind === "critical-hit" ? "Critical Hit" : kind === "critical-fumble" ? "Critical Fumble" : kind === "world-clock" ? "World Clock" : kind === "sneak" ? "Sneak Attack" : kind === "hunters-mark" ? "Hunter's Mark" : kind === "ammo-recovery" ? "Ammunition Recovery" : table.name),actorId:kind === "item" ? actorId : null,itemId:kind === "item" ? itemId : null,tableUuid:table?.uuid,tableId:table?.id,kind,actorName:kind === "item" ? actor.name : null,itemName:item?.name,tableName:table?.name,enabled:false,createdBy:game.user.id};
  await persist(n=>{const existing=n.triggers.find(t=>id ? t.id===id : t.kind===kind && (kind !== "item" || (t.actorId===actorId && t.itemId===itemId && t.tableUuid===trigger.tableUuid)));if(existing){trigger.id=existing.id;trigger.enabled=existing.enabled;Object.assign(existing,trigger);}else n.triggers.push(trigger);});
  render();return trigger;
}
function triggerScope(trigger) {
  if (["critical-hit","critical-fumble"].includes(trigger.kind)) return "Any character or NPC";
  if (trigger.kind === "ammo-recovery") return "Characters in combat";
  if (trigger.kind === "world-clock") return "World time";
  if (trigger.kind === "lucky-find") return "Combat completed";
  if (trigger.kind === "hunters-mark") return "Any character with Hunter's Mark";
  if (trigger.kind === "sneak") return "Any rogue";
  if (trigger.kind === "volatile") return "Any character";
  if (trigger.kind === "sorcerer") return "Any Wild Magic sorcerer";
  return game.actors.get(trigger.actorId)?.name ?? trigger.actorName;
}
function triggerWhen(trigger) {
  if (trigger.kind === "critical-hit") return "An attack roll is a native critical hit";
  if (trigger.kind === "critical-fumble") return "An attack roll is a native critical fumble";
  if (trigger.kind === "ammo-recovery" || trigger.kind === "lucky-find") return "A started combat ends";
  if (trigger.kind === "world-clock") return "Game unpaused and no started combat";
  if (trigger.kind === "volatile") return "A character rolls a spell attack, or completes any spell without an attack";
  if (trigger.kind === "sorcerer") return "A Wild Magic sorcerer rolls a spell attack, or casts a Sorcerer spell without an attack";
  if (trigger.kind === "hunters-mark") return "A character completes attack damage against their marked target";
  if (trigger.kind === "sneak") return "A rogue completes weapon damage for a qualifying Sneak Attack hit";
  return `Uses ${trigger.itemName}`;
}
function triggerThen(trigger) {
  if (["critical-hit","critical-fumble"].includes(trigger.kind)) return "Roll the matching melee, ranged, or magic table privately in chat";
  if (trigger.kind === "ammo-recovery") return "Return half the ammunition spent, rounded down per character and ammunition stack";
  if (trigger.kind === "world-clock") return `Add ${trigger.gameMinutes ?? 10} game minutes every ${trigger.realMinutes ?? 1} real minutes. Combat adds 6 seconds per round when it ends.`;
  if (trigger.kind === "lucky-find") return "Roll the world Lucky Finds table for the GM, once per combat";
  if (trigger.kind === "hunters-mark") return "Roll Hunter's Mark damage, including critical damage on a natural 20";
  if (trigger.kind === "sneak") return "Roll Sneak Attack damage (once per turn)";
  if (trigger.kind === "volatile") return `Request d4; only a 1 rolls ${trigger.tableName}. No progression.`;
  if (trigger.kind === "sorcerer") return `Request d20; start at 1 or lower to roll ${trigger.tableName}. Increase on a miss; reset after a surge. Tracked separately for each character and trigger.`;
  return `Roll ${trigger.tableName}`;
}
function triggerCards() {
  return state.triggers.map(trigger => {
    const status = triggerStatus(trigger.id);
    const running = Boolean(trigger.enabled);
    const name = trigger.name ?? "";
    const scope = triggerScope(trigger) ?? "";
    return `<article class="ml-card gm-trigger-card"><header class="gm-trigger-header"><strong class="gm-trigger-name" title="${e(name)}">${e(name)}</strong><span class="gm-trigger-scope" title="${e(scope)}">${e(scope)}</span><span class="ml-status gm-trigger-status" data-tone="${running ? "success" : "muted"}" role="img" title="${e(status)}" aria-label="${e(status)}"><i class="fa-solid ${running ? "fa-circle-check" : "fa-circle-pause"}" aria-hidden="true"></i></span><button type="button" class="ml-icon-button" data-action="trigger-toggle" data-id="${e(trigger.id)}" aria-pressed="${running}" title="${running ? "Pause trigger" : "Enable trigger"}" aria-label="${running ? "Pause trigger" : "Enable trigger"}"><i class="fa-solid ${running ? "fa-pause" : "fa-play"}" aria-hidden="true"></i></button></header><dl class="gm-trigger-rule"><div><dt>When</dt><dd>${e(triggerWhen(trigger))}</dd></div><div><dt>Then</dt><dd>${e(triggerThen(trigger))}</dd></div></dl></article>`;
  }).join("");
}

async function settings() {
  const result = await form("Game Master settings", label("Ambience folder", input("folder", get("ambienceFolder"))));
  if (!result) return;
  await game.settings.set(ID, "ambienceFolder", result.data.get("folder").trim());
  render();
}
function relayVisible() { return open && tab === "ai"; }
function stopRelayPoll() {
  relayGeneration += 1;
  clearTimeout(relayTimer);
  relayTimer = 0;
}
function scheduleRelayPoll(delay) {
  const generation = ++relayGeneration;
  clearTimeout(relayTimer);
  relayTimer = setTimeout(() => { relayTimer = 0; if (generation === relayGeneration) pollRelay(generation).catch(fail); }, delay);
}
function syncRelayPoll({immediate = false} = {}) {
  const delay = immediate ? 0 : pollDelay({visible: relayVisible(), pending: threadPending(relayThread.entries), failures: relayFailures, idle: Boolean(get("relayCampaign"))});
  if (delay == null) { stopRelayPoll(); return; }
  scheduleRelayPoll(delay);
}
async function pollRelay(generation) {
  if (!relayVisible() || generation !== relayGeneration) return;
  const relayUrl = get("relayUrl") || DEFAULT_RELAY_URL;
  if (mixedContentBlocked(location.protocol, relayUrl)) { relayThread = {...relayThread, notice: MIXED_CONTENT_MESSAGE}; render(); return stopRelayPoll(); }
  const campaign = get("relayCampaign");
  if (!campaign) return stopRelayPoll();
  try {
    const result = await relayRequest(fetch, {baseUrl: relayUrl, token: get("relayToken"), path: threadQuery({campaign, world: game.world.id, since: relayThread.serverTime}), auth: true});
    if (generation !== relayGeneration) return;
    if (!result.ok) throw new Error(parseAsk(result.status, result.json).error);
    const parsed = parseThread(result.json);
    relayThread = {entries: mergeThread(relayThread.entries, parsed.entries), serverTime: parsed.serverTime, notice: ""};
    relayFailures = 0;
  } catch (error) {
    if (generation !== relayGeneration) return;
    relayFailures += 1;
    relayThread = {...relayThread, notice: error.message || "The Campaign AI relay could not be reached."};
  }
  const draft = root?.querySelector("#mlgm-question")?.value;
  if (draft != null) questionDraft = draft;
  if (relayVisible()) render();
  if (generation !== relayGeneration || !relayVisible()) return;
  const delay = pollDelay({visible: true, pending: threadPending(relayThread.entries), failures: relayFailures, idle: true});
  if (delay != null) scheduleRelayPoll(delay);
}
async function testRelay() {
  gm();
  const relayUrl = normalizeRelayURL(get("relayUrl"));
  if (mixedContentBlocked(location.protocol, relayUrl)) throw new Error(MIXED_CONTENT_MESSAGE);
  const result = await relayRequest(fetch, {baseUrl: relayUrl, path: "/health", auth: false});
  if (!result.ok) throw new Error(parseAsk(result.status, result.json).error);
  relayStatus = healthSummary(parseHealth(result.json), get("relayCampaign"));
  notify(relayStatus);
  render();
}
async function askRelay(value) {
  gm();
  const campaign = get("relayCampaign");
  if (!campaign) throw new Error("Choose a campaign on GM Settings.");
  const question = questionText(value);
  const relayUrl = normalizeRelayURL(get("relayUrl"));
  if (mixedContentBlocked(location.protocol, relayUrl)) throw new Error(MIXED_CONTENT_MESSAGE);
  const result = await relayRequest(fetch, {baseUrl: relayUrl, token: get("relayToken"), path: "/ask", method: "POST", body: askBody({campaign, world: game.world.id, question}), auth: true});
  const parsed = parseAsk(result.status, result.json);
  const entry = {requestId: parsed.requestId || foundry.utils.randomID(), question, askedAt: new Date().toISOString(), status: parsed.ok ? "sent" : "failed", error: parsed.error, answer: null, answeredAt: "", updatedAt: new Date().toISOString()};
  if (parsed.ok || parsed.requestId) {
    relayThread = {...relayThread, entries: mergeThread(relayThread.entries, [entry]), notice: parsed.ok ? "" : parsed.error};
    if (parsed.ok) questionDraft = "";
    notify(parsed.ok ? "Question sent." : parsed.error);
    render();
    syncRelayPoll({immediate: true});
    return;
  }
  throw new Error(parsed.error);
}
function aiEntry(entry) {
  const waiting = entry.status === "pending" || entry.status === "sent";
  const body = entry.status === "answered" ? `<div class="gm-ai-answer">${renderAnswerMarkdown(entry.answer ?? "")}</div>` : waiting ? `<p class="gm-ai-pending"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Waiting for an answer</p>` : `<p class="gm-ai-error">${e(entry.error || "The question failed.")}</p>${button("ai-retry", "Retry", entry.requestId)}`;
  return `<article class="ml-card gm-ai-entry" data-request-id="${e(entry.requestId)}"><p class="gm-ai-question">${e(entry.question)}</p>${body}</article>`;
}
function aiContent() {
  const relayUrl = get("relayUrl") || DEFAULT_RELAY_URL;
  if (mixedContentBlocked(location.protocol, relayUrl)) return `<p class="gm-ai-error">${e(MIXED_CONTENT_MESSAGE)}</p>`;
  const campaign = RELAY_CAMPAIGNS.find(item => item.key === get("relayCampaign"));
  if (!campaign?.key) return `<p class="notes">Choose a campaign on GM Settings.</p>`;
  const notice = relayThread.notice ? `<p class="gm-ai-error">${e(relayThread.notice)}</p>` : "";
  const entries = relayThread.entries.map(aiEntry).join("") || `<p class="notes">No questions yet. Answers usually take a minute.</p>`;
  return `<div class="gm-ai"><p class="notes">GM only · ${e(campaign.label)}</p>${notice}<div class="gm-ai-thread" role="log" aria-live="polite">${entries}</div><form class="gm-request-row gm-ai-ask" data-ai-ask><textarea id="mlgm-question" maxlength="${4000}" rows="2" placeholder="Ask about this campaign">${e(questionDraft)}</textarea><button type="button" data-action="ai-ask">Ask</button></form></div>`;
}
let battleSaving = Promise.resolve();
function saveBattle(change) {
  battleSaving = battleSaving.catch(() => {}).then(async () => {
    const next = change(foundry.utils.deepClone(get("massBattle")));
    await game.settings.set(ID, "massBattle", next);
    if (open && tab === "battle") render();
  });
  return battleSaving;
}
function battleContent() {
  const battle = get("massBattle");
  if (!battle?.sides?.length) return `<p class="notes">Preparing the experimental battle.</p>`;
  const hero = {...emptyHero(), ...battle.hero};
  const checkType = CHECK_TYPES.some(type => type.id === hero.checkType) ? hero.checkType : "skill";
  const choices = checkChoices(checkType, catalogs());
  const checkId = defaultCheckId(checkType, choices, hero.checkId);
  const actors = partyActorIds().map(id => game.actors.get(id)).filter(Boolean);
  const living = battle.sides.flatMap(side => side.units.filter(unit => unit.living > 0).map(unit => ({side, unit})));
  const controls = `<form class="gm-request-row" data-battle-controls>${inlineField("Damage cap", input("damageCap", battle.damageCap ?? "", 'type="number" min="0" placeholder="None"'))}<label class="ml-check"><input type="checkbox" name="blind" ${battle.blind ? "checked" : ""}><span>Blind roll</span></label>${button("battle-resolve", "Resolve Round")}${button("battle-reset", "Reset")}${button("battle-end", "End Battle")}</form>`;
  const heroRow = `<form class="gm-request-row" data-battle-hero>${inlineField("Unit", select("unitId", living.map(item => option(item.unit.id, `${item.unit.name} (${item.side.name})`, hero.unitId)).join("") || `<option value="">No living units</option>`))}${inlineField("Bonus", select("bonus", `${option("attack", "+ attack", hero.bonus)}${option("advantage", "Advantage", hero.bonus)}`))}${inlineField("Amount", input("attackBonus", hero.attackBonus ?? 2, 'type="number"'))}${inlineField("DC", input("dc", hero.dc ?? "", 'type="number" min="0"'))}${inlineField("Check", select("checkType", CHECK_TYPES.map(type => option(type.id, type.label, checkType)).join("")))}${inlineField("Roll", select("checkId", choices.map(choice => option(choice.id, choice.label, checkId)).join("")))}${inlineField("Character", select("actorId", actors.map(actor => option(actor.id, actor.name, hero.actorId || actors[0]?.id)).join("")))}${button("battle-hero", "Hero Action")}</form>`;
  const sides = battle.sides.map(side => `<section class="gm-battle-side" data-battle-side="${e(side.id)}"><form class="gm-request-row" data-battle-side-form data-battle-side="${e(side.id)}">${inlineField("Side", input("name", side.name))}${inlineField("New count", input("dropCount", side.dropCount ?? 1, 'type="number" min="1"'))}${button("battle-remove-side", "Remove Side", side.id)}</form>${side.units.map(unit => unitRow(battle, side, unit)).join("") || `<p class="notes">Drag an actor here.</p>`}</section>`).join("");
  return `<div class="ml-stack gm-battle" data-gap="2"><p class="notes">Experimental. Chat shows the round. This tab shows counts and status only.</p>${controls}${heroRow}${sides}${button("battle-add-side", "Add Side")}</div>`;
}
function unitRow(battle, side, unit) {
  const targets = battle.sides.filter(item => item.id !== side.id).flatMap(item => item.units.filter(candidate => candidate.living > 0 || candidate.id === unit.targetId).map(candidate => option(candidate.id, `${candidate.name} (${item.name})`, unit.targetId)));
  return `<form class="gm-request-row" data-battle-unit="${e(unit.id)}">${inlineField("Name", input("name", unit.name))}${inlineField("Count", input("count", unit.count, 'type="number" min="1"'))}<span class="gm-unit-status">${e(unitStatus(unit))}</span>${inlineField("AC", input("ac", unit.ac, 'type="number"'))}${inlineField("Attack", input("attackBonus", unit.attackBonus, 'type="number"'))}${inlineField("Damage", input("damage", unit.damage, 'type="number" min="0"'))}${inlineField("HP", input("hp", unit.hp, 'type="number" min="1"'))}${inlineField("Morale DC", input("moraleDc", unit.moraleDc, 'type="number" min="0"'))}${inlineField("Morale mod", input("moraleMod", unit.moraleMod, 'type="number"'))}${inlineField("Target", select("targetId", `<option value="">No target</option>${targets.join("")}`))}${deleteButton("battle-remove-unit", unit.id, unit.name)}</form>`;
}
async function onBattleChange(event) {
  const el = event.target;
  const unitForm = el.closest("[data-battle-unit]");
  const sideForm = el.closest("[data-battle-side-form]");
  const controls = el.closest("[data-battle-controls]");
  const heroForm = el.closest("[data-battle-hero]");
  if (!unitForm && !sideForm && !controls && !heroForm) return false;
  const battle = get("massBattle");
  let next = battle;
  if (unitForm) next = updateUnit(battle, unitForm.dataset.battleUnit, {[el.name]: el.type === "number" ? Number(el.value) : el.value});
  else if (sideForm && el.name === "name") next = updateBattle(battle, {sideId: sideForm.dataset.battleSide, sideName: el.value});
  else if (sideForm && el.name === "dropCount") next = updateBattle(battle, {sideId: sideForm.dataset.battleSide, dropCount: Number(el.value)});
  else if (controls && el.name === "blind") next = updateBattle(battle, {blind: el.checked});
  else if (controls && el.name === "damageCap") next = updateBattle(battle, {damageCap: el.value === "" ? null : Number(el.value)});
  else if (heroForm) {
    const data = new FormData(heroForm);
    const attackBonus = Number(data.get("attackBonus"));
    next = updateBattle(battle, {hero: {unitId: data.get("unitId") || "", bonus: data.get("bonus") === "advantage" ? "advantage" : "attack", attackBonus: Number.isInteger(attackBonus) ? attackBonus : 2, dc: parseDC(data.get("dc")) ?? heroFormDc(battle), checkType: data.get("checkType") || "skill", checkId: data.get("checkId") || "", actorId: data.get("actorId") || ""}});
  }
  await game.settings.set(ID, "massBattle", next);
  if (el.name === "checkType") render();
  return true;
}
function heroFormDc(battle) {
  return Number.isInteger(battle.hero?.dc) ? battle.hero.dc : 15;
}
async function confirmBattle(kind) {
  const accepted = await foundry.applications.api.DialogV2.confirm({id: `${ID}-battle-${kind}`, window: {title: kind === "end" ? "End Battle" : "Reset Battle"}, content: `<p>${kind === "end" ? "Clear this experimental battle?" : "Restore every unit to full strength?"}</p>`, classes: ["ml-window"]});
  if (!accepted) return;
  await saveBattle(battle => kind === "end" ? endBattle(() => foundry.utils.randomID()) : resetBattle(battle));
}
async function resolveBattle() {
  await battleSaving;
  const current = get("massBattle");
  const {battle, events} = resolveRound(current, () => Math.floor(Math.random() * 20) + 1);
  await game.settings.set(ID, "massBattle", battle);
  const blind = battle.blind === true;
  await ChatMessage.create({content: roundCard(battle.round, events), blind, whisper: blind ? game.users.filter(user => user.isGM).map(user => user.id) : [], flags: {[ID]: {massBattleRound: battle.round}}}, {messageMode: blind ? "blind" : "public"});
  notify(`Round ${battle.round} posted to chat.`);
  render();
}
async function requestHero() {
  const form = root.querySelector("[data-battle-hero]");
  const data = new FormData(form);
  const battle = get("massBattle");
  const unitId = data.get("unitId");
  if (!battle.sides.some(side => side.units.some(unit => unit.id === unitId && unit.living > 0))) throw new Error("Choose a living unit for the hero bonus.");
  const dc = parseDC(data.get("dc"));
  if (dc == null) throw new Error("Enter a DC for the hero action.");
  const checkType = CHECK_TYPES.some(type => type.id === data.get("checkType")) ? data.get("checkType") : "skill";
  const choices = checkChoices(checkType, catalogs());
  const actorIds = resolveRollActors({scope: "player", actorId: data.get("actorId"), partyIds: partyActorIds()});
  const attackBonus = Number(data.get("attackBonus"));
  const message = await createRequest(buildCheckRequest({type: checkType, checkId: defaultCheckId(checkType, choices, data.get("checkId")), dc, blind: false, actorIds}));
  await game.settings.set(ID, "massBattle", updateBattle(get("massBattle"), {hero: {unitId, bonus: data.get("bonus") === "advantage" ? "advantage" : "attack", attackBonus: Number.isInteger(attackBonus) ? attackBonus : 2, dc, checkType, checkId: defaultCheckId(checkType, choices, data.get("checkId")), actorId: actorIds[0], requestId: message.id, grantedRequestId: ""}}));
  notify("Hero action requested in chat.");
  render();
}
async function dropUnit(event) {
  gm();
  const sideElement = event.target.closest("[data-battle-side]");
  if (!sideElement) throw new Error("Drop the actor onto a side.");
  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  if (data.type !== "Actor") throw new Error("Drag an actor onto a side.");
  const actor = await Actor.implementation.fromDropData(data);
  if (!actor) throw new Error("Actor not found.");
  const battle = get("massBattle");
  const side = battle.sides.find(item => item.id === sideElement.dataset.battleSide);
  if (!side) throw new Error("That side is no longer in the battle.");
  await game.settings.set(ID, "massBattle", addUnit(battle, side.id, {...profileFromActor(actor), count: side.dropCount || 1}, () => foundry.utils.randomID()));
  notify(`${actor.name} added to ${side.name}.`);
  render();
}
function profileFromActor(actor) {
  const items = actor.items?.contents ?? [];
  const activity = items.flatMap(item => item.system?.activities?.contents ?? []).find(entry => entry?.type === "attack");
  const weapon = items.find(item => item.system?.damage?.parts?.length);
  const part = weapon?.system?.damage?.parts?.[0];
  const formula = activity ? activityFormula(activity) : Array.isArray(part) ? part[0] : part?.formula;
  return {
    name: actor.name,
    actorUuid: actor.uuid,
    ac: wholeNumber(actor.system?.attributes?.ac?.value, 10),
    hp: Math.max(1, wholeNumber(actor.system?.attributes?.hp?.max ?? actor.system?.attributes?.hp?.value, 1)),
    attackBonus: wholeNumber(activity?.labels?.modifier ?? activity?.attack?.bonus ?? weapon?.labels?.toHit, 0),
    damage: averageDamage(formula) ?? 1,
    moraleMod: wholeNumber(actor.system?.abilities?.wis?.mod, 0),
    moraleDc: 10
  };
}
function activityFormula(activity) {
  const part = activity.damage?.parts?.[0];
  if (!part) return "";
  if (typeof part === "string") return part;
  if (part.formula) return part.formula;
  if (!part.denomination) return "";
  const bonus = Number(part.bonus || 0);
  return `${part.number || 1}d${part.denomination}${bonus ? (bonus > 0 ? `+${bonus}` : bonus) : ""}`;
}
function wholeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}
async function grantHeroResult(message) {
  const result = message.getFlag?.(ID, "result");
  const battle = get("massBattle");
  if (!result?.requestId || battle?.hero?.requestId !== result.requestId) return;
  const total = message.rolls?.[0]?.total;
  if (!Number.isFinite(total)) return;
  const next = grantHero(battle, {requestId: result.requestId, total});
  if (next === battle) return;
  await game.settings.set(ID, "massBattle", next);
  if (open && tab === "battle") render();
}
