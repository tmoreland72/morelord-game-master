import {initializeAmmoTracking} from './ammo-recovery.mjs';
import {initializeTriggerMacros,replacePastedTriggerMacros,triggerStatus,triggerMacroUuid} from './trigger-macros.mjs';
import {rollOfFate} from './roll-of-fate.mjs';
import {initializeGlobalTriggers,saveGlobalTriggers} from "./global-triggers.mjs";
import {clockInterval,initializeDeferredClockSettlement} from "./world-clock.mjs";
import {initializeTriggers,installTrigger,luckyFindWorldTable} from "./triggers.mjs";
import { ID, escapeHTML as e } from "./core.mjs";
import { core, craftworks, recipient, initializeRequests, createRequest, foragingTerrains } from "./requests.mjs";
import { CHECK_TYPES, SPECIALTIES, buildCheckRequest, checkChoices, defaultCheckId, moveSpecialty, resolveRollActors, specialtyOrder, visibleSpecialties } from "./roll-requests.mjs";
import {applyBulkCoins, initializeBulkCoins, readCoins} from './bulk-coins.mjs';
import {applyBulkInspiration, applyBulkTokens, applyBulkUndo, applyBulkXp, bulkPanel, bulkXpChoice, initializeBulkActions, readXp, tokenFieldList} from './bulk-actions.mjs';
import {bulkHTML, bulkText} from './bulk-text.mjs';
import {BULK_UNDO, readBulkUndo} from './bulk-undo.mjs';
import {AMBIENCE_FOLDERS, AMBIENCE_MIGRATED, LEGACY_AMBIENCE_DEFAULT, ambiencePickerOptions, collectAmbienceFiles, ensureAmbienceFolders, folderFromFilePicker, normalizeAmbienceFolders, presentAmbienceScan, resolveAmbiencePickerPath} from './ambience-folders.mjs';

const tabs = { rolls: "Roll Requests", bulk: "Bulk Actions", macros: "Macros", sound: "Sound", triggers: "Triggers", settings: "GM Settings", party: "Player Settings" };
let root, open = false, tab = "rolls", state, saving = Promise.resolve();
let terrainOptions = [];
let settingTrackVolumes = false;
let bulkBusy = false;
let suppressMacroClick = false;
let suppressSpecialtyToggle = false;
const get = key => game.settings.get(ID, key);
const button = (action, label, id = "", extra = "") => `<button type="button" data-action="${action}" data-id="${e(id)}" ${extra}>${e(label)}</button>`;
const deleteButton = (action, id, name) => `<button type="button" class="ml-icon-button" data-action="${action}" data-id="${e(id)}" title="Delete ${e(name)}" aria-label="Delete ${e(name)}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>`;
const savedButton = (action, name, id, remove) => `<div class="ml-item-row"><div class="ml-stack">${button(action,name,id)}</div>${deleteButton(remove,id,name)}</div>`;
const option = (id, name, selected) => `<option value="${e(id)}" ${id === selected ? "selected" : ""}>${e(name)}</option>`;
const column = (title, body, cls = "") => `<div class="ml-stack gm-column ${cls}" data-gap="4"><strong>${e(title)}</strong>${body}</div>`;
const label = (name, content) => `<label><span>${e(name)}</span>${content}</label>`;
const inlineField = (name, content) => `<label class="gm-inline"><span>${e(name)}</span>${content}</label>`;
const requestButton = (action, id, name, extra = "") => `<button type="button" class="ml-icon-button gm-row-action" data-action="${action}" data-id="${e(id)}" title="${e(name)}" aria-label="${e(name)}" ${extra}><i class="fa-solid fa-dice-d20" aria-hidden="true"></i></button>`;
function requestRow({card, fields = "", blind = null, action, id = "", name, disabled = false}) {
  const blindControl = blind == null ? "" : `<label class="ml-check"><input type="checkbox" name="blind" ${blind ? "checked" : ""}><span>Blind roll</span></label>`;
  return `<form class="gm-request-row" data-roll-card="${e(card)}">${fields}${blindControl}${requestButton(action, id, name, disabled ? "disabled" : "")}</form>`;
}
const input = (name, value = "", attrs = "") => `<input name="${name}" value="${e(value)}" ${attrs}>`;
const select = (name, options) => `<select name="${name}">${options}</select>`;
const gm = () => { if (!game.user.isGM) throw new Error("Only the GM can use this action."); };
const notify = text => ui.notifications.info(text);
function fail(error) { console.error(`${ID} |`, error); ui.notifications.error(error.message ?? String(error)); }
async function press(target, work) {
  target.disabled = true;
  try { await work(); }
  catch (error) { fail(error); }
  finally { if (target.isConnected) target.disabled = false; }
}
let localBoardWrite = 0;
function persist(change) {
  // Serialize settings writes so fast clicks cannot overwrite a previous save.
  saving = saving.catch(() => {}).then(async () => {
    const next = foundry.utils.deepClone(state);
    change(next);
    if (JSON.stringify(next.triggers) !== JSON.stringify(state.triggers)) await saveGlobalTriggers(next.triggers);
    // Blur saves this board value during mousedown, before click. The setting
    // hook would rebuild the tray and drop that click. This write is the field
    // the user just edited, so the open tray already shows it.
    localBoardWrite++;
    try { await game.settings.set(ID, "board", next); }
    finally { localBoardWrite--; }
    state = next;
  });
  return saving;
}
async function form(title, content, actions = [["ok", "Save"]], {modal = true} = {}) {
  return foundry.applications.api.DialogV2.wait({ modal, id:`${ID}-${title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/-$/,"")}`, classes:["ml-window"], window: { title, resizable: true }, position: { width: /Ambience|Verify/i.test(title) ? 560 : /Trigger Character|Trigger Action|settings/i.test(title) ? 480 : 400 },
    content: `<div><div class="ml-app ml-app-shell ml-dialog-shell">${content}</div></div>`, rejectClose: false,
    buttons: actions.map(([action, text], i) => ({ action, label: text, default: i === 0,
      callback: (_event, btn) => ({ action, data: new FormData(btn.form) }) })) });
}

Hooks.once("init", () => {
  class GameMasterSettings extends foundry.applications.api.ApplicationV2 {
    render() { closeTrayForSettings(); settings().catch(fail); return this; }
  }
  game.settings.registerMenu(ID,"configure",{name:"Morelord Game Master",label:"Configure",hint:"Ambience folders.",icon:"fa-solid fa-dice-d20",type:GameMasterSettings,restricted:true});
  game.settings.register(ID, "board", { scope: "world", config: false, type: Object,
    default: { saved: [], scenarios: [], last: {}, triggers: [] } });
  game.settings.register(ID,"macros",{scope:"world",config:false,type:Array,default:[]});
  game.settings.register(ID,"specialtyOrder",{scope:"world",config:false,type:Array,default:[]});
  game.settings.register(ID, "ambienceFolder", { name: "Ambience folder", hint: "Legacy single ambience folder. Copied once into Ambience folders when it has a path.", scope: "world", config: false, type: String, default: LEGACY_AMBIENCE_DEFAULT });
  game.settings.register(ID, AMBIENCE_FOLDERS, { name: "Ambience folders", hint: "Folders scanned recursively for ambience audio. Starts empty. Each folder keeps its FilePicker source.", scope: "world", config: false, type: Array, default: [] });
  game.settings.register(ID, AMBIENCE_MIGRATED, { scope: "world", config: false, type: Boolean, default: false });
  game.settings.register(ID, BULK_UNDO, {scope: "world", config: false, type: String, default: ""});
  for (const specialty of SPECIALTIES) game.settings.register(ID, specialty.setting, { name: `Show ${specialty.label}`, hint: "Show this specialty request on the Roll Requests tab for this world.", scope: "world", config: false, type: Boolean, default: true });
  game.keybindings.register(ID, "toggle", { name: "Toggle Game Master tray", restricted: true,
    editable: [{ key: "KeyG", modifiers: ["Alt"] }], onDown: () => { toggle(); return true; } });
});

Hooks.once("ready", async () => {
  game.modules.get(ID).api = { toggle, requestCheck, requestEncounter:encounter, requestDeathSave:() => requestCheck({kind:"death",...state?.last.death}), rollOfFate, addTrigger, installTrigger };
  initializeDeferredClockSettlement(() => (game.settings.get(ID,'board').triggers ?? []).some(t => t.kind === 'world-clock' && t.enabled && triggerStatus(t.id) === 'Running'));
  try { initializeRequests(); initializeBulkCoins(partyActorIds); initializeBulkActions(partyActorIds); initializeAmmoTracking(); await initializeGlobalTriggers(); initializeTriggers(); await replacePastedTriggerMacros(); await initializeTriggerMacros(); await core().compendiums?.organize([{collection:`${ID}.macros`,label:"Game Master Macros"},{collection:`${ID}.roll-tables`,label:"Game Master Roll Tables"}],["Morelord Gaming","Game Master"]); } catch(error) { ui.notifications.error(error.message); return; }
  core().ui.documentation.register({id:ID,title:'Morelord Game Master',icon:'fa-solid fa-dice-d20',source:'modules/morelord-game-master/README.md'});
  if (!game.user.isGM) return;
  try { await ensureAmbienceFolders(game.settings, ID); } catch (error) { console.error(`${ID} |`, error); }
  state = foundry.utils.deepClone(get("board"));
  if (migrateSoundVolumes(state)) await game.settings.set(ID, "board", state);
  foragingTerrains().then(options=>{terrainOptions=options;render();}).catch(()=>{});
  root = document.createElement("aside"); root.id = "mlgm"; root.className = "ml-window"; root.setAttribute("aria-label", "Morelord Game Master");
  document.body.append(root);
  root.addEventListener("click", event => {
    const target = event.target.closest("[data-action]");
    if (!target || target.disabled) return;
    if (suppressMacroClick && target.dataset.action === "macro") return;
    press(target, () => act(target.dataset.action, target.dataset.id));
  });
  new foundry.applications.ux.ContextMenu(root,'[data-macro-uuid]',[{name:"Remove",icon:'<i class="fa-solid fa-trash"></i>',callback:element=>act("unpin-macro",element.dataset.macroUuid).catch(fail)}],{jQuery:false,fixed:true});
  root.addEventListener("submit",event=>{event.preventDefault();const id=event.target.dataset.rollCard;if(id==="check")sendCheck().catch(fail);else if(id)sendQuick(id).catch(fail);});
  root.addEventListener("change", event => onChange(event).catch(fail));
  root.addEventListener("dragover",event=>{if(tab === "macros" || tab === "settings")event.preventDefault();});
  root.addEventListener("drop",event=>{if(tab === "macros"){event.preventDefault();dropMacro(event).catch(fail);}else if(tab === "settings"){event.preventDefault();dropSpecialty(event).catch(fail);}});
  root.addEventListener("dragstart",event=>{
    const tile=event.target.closest('[data-macro-uuid]');
    const row=event.target.closest('[data-specialty]');
    if(tile){suppressMacroClick=true;event.dataTransfer.setData('text/plain',JSON.stringify({type:'Macro',uuid:tile.dataset.macroUuid}));event.dataTransfer.effectAllowed="copyMove";return;}
    if(row && tab === "settings"){suppressSpecialtyToggle=true;event.dataTransfer.setData('text/plain',JSON.stringify({type:'Specialty',id:row.dataset.specialty}));event.dataTransfer.effectAllowed="move";}
  });
  root.addEventListener("dragend",()=>{setTimeout(()=>{suppressMacroClick=false;suppressSpecialtyToggle=false;});});
  root.addEventListener("keydown", event => {
    if (event.key === "Escape") { toggle(false); event.stopPropagation(); }
    const current = event.target.closest('[role="tab"]');
    if (!current) return;
    const ids = Object.keys(tabs), index = ids.indexOf(current.dataset.id);
    const next = event.key === "ArrowRight" ? ids[(index+1)%ids.length] : event.key === "ArrowLeft" ? ids[(index+ids.length-1)%ids.length] : event.key === "Home" ? ids[0] : event.key === "End" ? ids.at(-1) : ["Enter"," "].includes(event.key) ? current.dataset.id : null;
    if (next) { event.preventDefault(); tab = next; render(); root.querySelector(`#mlgm-tab-${next}`).focus(); }
  });
  root.addEventListener("input", event => {
    const readout = event.target.dataset.sound && event.target.parentElement?.querySelector("[data-volume-readout]");
    if (readout) readout.textContent = `${Math.round(Number(event.target.value) * 100)}%`;
  });
  render();
  core().ui.activateCardSelection({element:root});
});

function toggle(value = !open, {focus = true} = {}) {
  if (!game.user?.isGM || !root) return;
  open = Boolean(value); document.body.classList.toggle("mlgm-open", open); render();
  if (focus) root.querySelector(open ? "[role=tab][aria-selected=true]" : ".gm-handle")?.focus();
}
function closeTrayForSettings() {
  if (!open) return;
  toggle(false, {focus: false});
}
Hooks.on("renderSettingsConfig", (_application, _element, _context, options) => {
  if (options?.isFirstRender === false) return;
  closeTrayForSettings();
});
function saved(type) {
  return state.saved.filter(s => s.type === type).map(s => savedButton("saved",savedName(s.type,s.config),s.id,"remove-saved")).join("");
}
function savedName(type,config) {
  if (type === "group" || type === "player") return `${game.i18n.localize(CONFIG.DND5E.skills[config.skill]?.label ?? config.skill)} Check${type === "player" ? ` - ${game.actors.get(config.actorIds?.[0])?.name ?? "Missing character"}` : ""}`;
  if (type === "playlist") return game.playlists.get(config.playlist)?.name ?? "Missing playlist";
  if (type === "ambience") return config.files.map(f=>f.path.split('/').at(-1).replace(/\.[^.]+$/,"")).join(" + ");
  return "Death Saving Throw";
}
function controlKey(el) {
  if (el.id) return `#${el.id}`;
  const card = el.closest("[data-roll-card]")?.dataset.rollCard ?? "";
  if (el.dataset.sound) return `sound:${el.dataset.playlist}:${el.dataset.sound}`;
  return `${card}:${el.name}:${el.type === "radio" || el.type === "checkbox" ? el.value : ""}`;
}
function snapshotControls(container, active = container.ownerDocument?.activeElement) {
  return [...container.querySelectorAll("input, select, textarea")].filter(el => el.type !== "file").map(el => {
    const toggle = el.type === "checkbox" || el.type === "radio";
    const value = toggle ? Boolean(el.checked) : el.value;
    const initial = toggle ? Boolean(el.defaultChecked) : el.defaultValue;
    let start = null, end = null;
    try { start = el.selectionStart; end = el.selectionEnd; } catch { /* non-text controls */ }
    return {key: controlKey(el), toggle, value, dirty: value !== initial, focused: el === active, start, end};
  });
}
function restoreControls(container, drafts) {
  if (!drafts?.length) return;
  const fields = [...container.querySelectorAll("input, select, textarea")];
  let focus;
  for (const draft of drafts) {
    if (!draft.dirty && !draft.focused) continue;
    const el = fields.find(field => controlKey(field) === draft.key);
    if (!el || el.type === "file") continue;
    if (draft.toggle) el.checked = draft.value;
    else if (el.tagName === "SELECT" && ![...el.options].some(option => option.value === String(draft.value))) continue;
    else el.value = draft.value;
    if (draft.focused) focus = {el, start: draft.start, end: draft.end};
  }
  if (!focus?.el.isConnected) return;
  focus.el.focus({preventScroll: true});
  if (Number.isInteger(focus.start) && focus.el.setSelectionRange) {
    try { focus.el.setSelectionRange(focus.start, focus.end); } catch { /* number and select controls */ }
  }
}
function render() {
  if (!root) return;
  const controls = snapshotControls(root);
  root.innerHTML = `<button type="button" data-action="toggle" class="ml-tray-handle gm-handle" aria-expanded="${open}" aria-controls="mlgm-tray" title="${open ? "Close" : "Open"} Game Master"><i class="fa-solid fa-chevron-${open ? "down" : "up"}" aria-hidden="true"></i><span>Game Master</span></button>
    <section id="mlgm-tray" class="window-content gm-tray" ${open ? "" : "hidden"}><div class="ml-app ml-app-shell"><header class="ml-hero"><i class="fa-solid fa-dice-d20 ml-hero__icon" aria-hidden="true"></i><div class="ml-hero__body"><h1>Morelord Game Master</h1><p>Your table, within reach.</p></div><div class="ml-actions">${button("documentation", "Documentation")}</div></header>

    <nav class="ml-tabs ml-compact" role="tablist" aria-label="Game Master tools">${Object.entries(tabs).map(([id, name]) => `<a data-action="tab" data-id="${id}" id="mlgm-tab-${id}" role="tab" tabindex="${tab === id ? 0 : -1}" aria-selected="${tab === id}" aria-controls="mlgm-panel">${e(name)}</a>`).join("")}</nav>
    <section id="mlgm-panel" class="${tab === "sound" ? "ml-surface " : ""}ml-grid ml-compact gm-columns" data-columns="${["triggers","macros","bulk","party","rolls","settings"].includes(tab) ? "1" : "3"}" role="tabpanel" aria-labelledby="mlgm-tab-${tab}">${content()}</section></div></section>`;
  restoreControls(root, controls);
  core().ui.applyPageLayout({element:root});
}
function content() {
  if (tab === "rolls") return `<div class="ml-stack gm-request-rows" data-gap="4">${checkBuilder()}${specialtyGrid()}</div>`;
  if (tab === "bulk") { const last = state?.last ?? {}; return bulkPanel({actorIds: partyActorIds(), coins: last.bulkCoins, coinAction: last.bulkCoinAction, xp: last.bulkXp, xpAction: last.bulkXpAction, inspiration: last.bulkInspiration, busy: bulkBusy, undo: readBulkUndo()}); }
  if (tab === "party") return `<div class="ml-stack"><p>Characters included in party roll requests and bulk operations.</p>${characterChoices(partyActorIds())}</div>`;
  if (tab === "settings") return `<div class="ml-stack"><p>Specialty requests shown on Roll Requests. Drag one to reorder the cards. Hidden requests keep their place, and this world remembers each choice.</p>${specialtySettings()}</div>`;
  if (tab === "triggers") return `<div class="ml-grid gm-triggers" data-columns="3">${triggerCards()}</div>`;
  if (tab === "sound") {
    const playing = game.playlists.contents.flatMap(p => p.sounds.filter(s=>s.playing).map(s=>({p,s})));
    const cards = playing.map(({p,s})=>{const level=foundry.audio.AudioHelper.volumeToInput(Number(s.volume)||0),percent=Math.round(level*100);return `<div class="ml-card ml-stack"><strong>${e(s.name)}</strong><small>${e(p.name)}</small><div class="ml-item-row"><input type="range" min="0" max="1" step="0.01" value="${level}" data-playlist="${p.id}" data-sound="${s.id}" aria-label="${e(s.name)} volume" aria-valuetext="${percent}%"><span data-volume-readout>${percent}%</span>${button("stop-sound","Stop",`${p.id}:${s.id}`)}</div></div>`;}).join("");
    return column("Playlists",`${button("playlist","Start Playlist")}${saved("playlist")}`)
      + column("Ambience",`${button("ambience","Play Ambience")}${saved("ambience")}`)
      + `<div class="ml-stack gm-column" data-gap="4"><div class="ml-stack">${label("All track volumes (%)",input("allTrackVolume",state.last.allTrackVolume ?? 25,'id="ml-game-master-track-volume" type="number" min="0" max="100" step="1" required'))}${button("set-track-volumes",settingTrackVolumes ? "Setting volumes…" : "Set All Track Volumes","",settingTrackVolumes ? "disabled" : "")}<small>Applies to every playlist track, including stopped tracks, ambience, and saved playback buttons.</small></div>${column("Now Playing",cards + (playing.some(({p})=>!p.getFlag(ID,"ambience")) ? button("stop-music","Stop Music") : "") + (playing.some(({p})=>p.getFlag(ID,"ambience")) ? button("stop-ambience","Stop Ambience") : ""))}</div>`;
  }
  if (tab === "macros") return `<div class="gm-macros">${macroButtons()}</div>`;
  return "";
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
  return `<section class="ml-card gm-builder-card">${requestRow({card: "check", fields, blind: c.blind === true, action: "send-check", name: "Send check", disabled: !(scope === "tokens" || actors.length)})}</section>`;
}
function specialtyGrid() {
  const settings = Object.fromEntries(SPECIALTIES.map(specialty => [specialty.setting, game.settings.get(ID, specialty.setting)]));
  const cards = visibleSpecialties(settings, get("specialtyOrder")).map(id => specialtyCard(id)).join("");
  return cards ? `<div class="gm-specialty-grid">${cards}</div>` : "";
}
function specialtyCard(id) {
  const c = state.last[id] ?? {};
  const actors = partyActorIds().map(actorId => game.actors.get(actorId)).filter(Boolean);
  const names = {encounter: "Encounter Check", search: "Delerium Search", foraging: "Foraging Check", death: "Death Save", fate: "Roll of Fate"};
  const zones = id === "search" ? searchZones() : [];
  const fateScope = c.scope === "party" ? "party" : "tokens";
  const field = id === "encounter" ? ["Die", select("die", [4,6,8,10,12,20].map(die => option(String(die), `d${die}`, String(c.die ?? state.last.die ?? 8))).join(""))]
    : id === "search" ? ["Search area", select("zoneId", zones.map(zone => option(zone.id, `${zone.name} - DC ${zone.dc}`, c.zoneId ?? zones[0]?.id)).join(""))]
    : id === "foraging" ? ["Terrain", select("terrainIndex", terrainOptions.map((terrain, index) => option(String(index), terrain.label, String(c.terrainIndex ?? 2))).join(""))]
    : id === "death" ? ["Character", select("actorId", actors.map(actor => option(actor.id, actor.name, c.actorIds?.[0] ?? actors[0]?.id)).join(""))]
    : ["Who rolls", select("scope", [option("party", "Party", fateScope), option("tokens", "Selected tokens", fateScope)].join(""))];
  const blind = id === "fate" ? "" : `<label class="ml-check"><input type="checkbox" name="blind" ${c.blind === true ? "checked" : ""}><span>Blind roll</span></label>`;
  return `<form class="ml-card gm-specialty-card" data-roll-card="${e(id)}"><strong class="gm-specialty-title">${e(names[id])}</strong><div class="gm-specialty-row"><label class="gm-specialty-field"><span>${e(field[0])}</span>${field[1]}</label>${blind}${requestButton("quick-request", id, names[id])}</div></form>`;
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
async function sendBulkCoins(operation) {
  if (bulkBusy) return;
  const form = root.querySelector('[data-mlgm-bulk-coins]');
  if (!form?.reportValidity()) return;
  const coins = readCoins(Object.fromEntries(new FormData(form)));
  await saving;
  if (bulkBusy) return;
  bulkBusy = true; render();
  try {
    const result = await applyBulkCoins(operation, coins);
    if (result?.unchanged) { notify(result.notice || 'No coin balances changed.'); return; }
    if (!result?.messageId) throw Error('The coordinating GM must refresh Game Master before using party coins.');
    for (const input of root.querySelectorAll('[data-mlgm-bulk-coins] input')) input.value = '0';
    await persist(n => { n.last.bulkCoins = readCoins(); });
    notify('Party coins updated. See the chat card for changes and deficits.');
  } finally { bulkBusy = false; render(); }
}
async function sendBulkXp(operation) {
  if (bulkBusy) return;
  const form = root.querySelector('[data-mlgm-bulk-xp]');
  if (!form?.reportValidity()) return;
  const amount = readXp(new FormData(form).get('xp'), {allowZero: operation === 'set'});
  await saving;
  if (bulkBusy) return;
  bulkBusy = true; render();
  try {
    const result = await applyBulkXp(operation, amount);
    if (result?.unchanged) { notify(result.notice); return; }
    if (!result?.messageId) throw Error(bulkText('error.noGm'));
    const input = root.querySelector('[data-mlgm-bulk-xp] input[name="xp"]');
    if (input) input.value = '0';
    await persist(n => { n.last.bulkXp = 0; n.last.bulkXpAction = operation; });
    notify(bulkText('xp.updated'));
  } finally { bulkBusy = false; render(); }
}
async function sendBulkInspiration(action) {
  if (bulkBusy) return;
  await saving;
  if (bulkBusy) return;
  bulkBusy = true; render();
  try {
    const result = await applyBulkInspiration(action);
    if (result?.unchanged) { notify(result.notice); return; }
    if (!result?.messageId) throw Error(bulkText('error.noGm'));
    await persist(n => { n.last.bulkInspiration = action; });
    notify(bulkText('inspiration.updated'));
  } finally { bulkBusy = false; render(); }
}
async function sendBulkTokens() {
  if (bulkBusy) return;
  await saving;
  if (bulkBusy) return;
  bulkBusy = true; render();
  try {
    const result = await applyBulkTokens();
    if (result?.unchanged) { notify(result.notice); return; }
    if (!result?.messageId) throw Error(bulkText('error.noGm'));
    notify(bulkText('tokens.updatedNotice'));
  } finally { bulkBusy = false; render(); }
}
async function sendBulkUndo() {
  if (bulkBusy || !readBulkUndo()) return;
  await saving;
  if (bulkBusy || !readBulkUndo()) return;
  bulkBusy = true; render();
  try {
    const result = await applyBulkUndo();
    if (!result?.messageId) throw Error(bulkText('error.noGm'));
    notify(bulkText('undo.done'));
  } finally { bulkBusy = false; render(); }
}
async function sendQuick(id) {
  await saving;
  if (id === "fate") return sendFate();
  const config = readQuick(id);
  if (!config.actorIds.length) throw new Error(id === "death" ? "Choose a character from Player Settings." : "Select participating characters on the Player Settings tab first.");
  await persist(n => { n.last[id] = config; if (id === "encounter") n.last.die = config.die; });
  await createRequest(config);
}
async function sendFate() {
  const card = root.querySelector('[data-roll-card="fate"]');
  const scope = card && new FormData(card).get("scope") === "party" ? "party" : "tokens";
  if (card) await persist(n => { n.last.fate = {scope}; });
  return rollOfFate({scope, actors: partyActorIds().map(id => game.actors.get(id)).filter(Boolean)});
}
function macroButtons() {
  return (get("macros") ?? []).map(uuid=>{const macro=fromUuidSync(uuid),name=macro?.name ?? "Missing macro";return `<button type="button" class="gm-macro" draggable="true" data-macro-uuid="${e(uuid)}" data-action="macro" data-id="${e(uuid)}" title="${e(name)}" aria-label="${e(name)}"><img src="${e(macro?.img ?? "icons/svg/dice-target.svg")}" alt="" width="32" height="32" draggable="false"><span>${e(name)}</span></button>`;}).join("");
}
function specialtySettings() {
  return specialtyOrder(get("specialtyOrder")).map(id => {
    const specialty = SPECIALTIES.find(item => item.id === id);
    return `<label class="ml-check" draggable="true" data-specialty="${e(specialty.id)}"><input type="checkbox" name="specialty" value="${e(specialty.id)}" ${game.settings.get(ID, specialty.setting)!==false?"checked":""}><span>${e(specialty.label)}</span></label>`;
  }).join("");
}
async function dropSpecialty(event) {
  gm();
  let data = {};
  try { data = JSON.parse(event.dataTransfer.getData("text/plain") || "{}"); } catch { data = {}; }
  if (data.type !== "Specialty") return;
  const before = event.target.closest("[data-specialty]")?.dataset.specialty;
  const order = moveSpecialty(get("specialtyOrder"), data.id, before);
  if (JSON.stringify(order) === JSON.stringify(specialtyOrder(get("specialtyOrder")))) return;
  await game.settings.set(ID, "specialtyOrder", order);
  render();
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
  if (action === "tab") { tab = id; render(); return; }
  if (action === "send-check") return sendCheck();
  if (action === "quick-request") return sendQuick(id);
  if (action === "bulk-coins") return sendBulkCoins(root.querySelector('[name="bulkCoinAction"]')?.value);
  if (action === "bulk-xp") return sendBulkXp(root.querySelector('[name="bulkXpAction"]')?.value);
  if (action === "bulk-inspiration") return sendBulkInspiration(root.querySelector('[name="bulkInspirationAction"]')?.value === 'clear' ? 'clear' : 'grant');
  if (action === "bulk-tokens") return sendBulkTokens();
  if (action === "bulk-tokens-help") return form(bulkText('tokens.help'), `<p>${bulkHTML('tokens.copied', {fields: tokenFieldList()})}</p>`, [["close", "Close"]]);
  if (action === "bulk-undo") return sendBulkUndo();
  if (action === "bulk-coins-clear") {
    if (bulkBusy) return;
    for (const input of root.querySelectorAll('[data-mlgm-bulk-coins] input')) input.value = '0';
    await persist(n => { n.last.bulkCoins = readCoins(); });
    return;
  }
  if (action === "bulk-xp-step") {
    const input = root.querySelector('[data-mlgm-bulk-xp] input[name="xp"]');
    if (!input) return;
    if (Number(id) > 0) input.stepUp(); else input.stepDown();
    input.dispatchEvent(new Event('change', {bubbles: true}));
    return;
  }
  if (action === "bulk-coin-step") {
    const [key, direction] = id.split(':');
    const input = root.querySelector(`[data-mlgm-bulk-coins] input[name="${key}"]`);
    if (!input) return;
    if (Number(direction) > 0) input.stepUp(); else input.stepDown();
    input.dispatchEvent(new Event('change', {bubbles:true}));
    return;
  }
  if (action === "settings") return settings();
  if (action === "trigger-edit" || action === "trigger-remove") return;
  if (action === "fate") return sendFate();
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
  render();
}
async function onChange(event) {
  const el = event.target;
  if (el.name === 'bulkCoinAction') { root.querySelector('[data-action=bulk-coins]').textContent = el.value.endsWith('-remove') ? 'Take' : bulkText('coins.apply'); await persist(n => { n.last.bulkCoinAction = el.value; }); return; }
  if (el.name === 'bulkXpAction') { await persist(n => { n.last.bulkXpAction = bulkXpChoice(el.value); }); return; }
  if (el.name === 'bulkInspirationAction') { await persist(n => { n.last.bulkInspiration = el.value === 'clear' ? 'clear' : 'grant'; }); return; }
  const bulkForm = el.closest('[data-mlgm-bulk-coins]');
  if (bulkForm) {
    if (el.value !== '' && Number(el.value) < 0) el.value = '0';
    if (bulkForm.checkValidity()) await persist(n => { n.last.bulkCoins = readCoins(Object.fromEntries(new FormData(bulkForm))); });
    return;
  }
  const xpForm = el.closest('[data-mlgm-bulk-xp]');
  if (xpForm) {
    if (el.value !== '' && Number(el.value) < 0) el.value = '0';
    if (xpForm.checkValidity()) await persist(n => { n.last.bulkXp = readXp(new FormData(xpForm).get('xp'), {allowZero: true}); });
    return;
  }
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
    if (suppressSpecialtyToggle) { el.checked = !el.checked; return; }
    const specialty = SPECIALTIES.find(item => item.id === el.value);
    if (specialty) await game.settings.set(ID, specialty.setting, el.checked);
    return;
  }
  const card=el.closest('[data-roll-card]');
  if (card?.dataset.rollCard === "check") { await persist(n => { n.last.check = readBuilder(); }); return; }
  if (card?.dataset.rollCard === "fate") { await persist(n => { n.last.fate = {scope: new FormData(card).get("scope") === "party" ? "party" : "tokens"}; }); return; }
  if (card && ["encounter","search","foraging","death"].includes(card.dataset.rollCard)) {
    const config = readQuick(card.dataset.rollCard);
    await persist(n => { n.last[card.dataset.rollCard] = config; if (card.dataset.rollCard === "encounter") n.last.die = config.die; });
    return;
  }
  if (el.dataset.sound) { gm(); await game.playlists.get(el.dataset.playlist)?.sounds.get(el.dataset.sound)?.update({ volume: volumeFromPercent(Number(el.value) * 100) }); }
}
function volumeFromPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("Volume must be between 0 and 100.");
  return foundry.audio.AudioHelper.inputToVolume(n / 100);
}
function percentFromVolume(volume) {
  const level = Number(volume);
  if (!Number.isFinite(level)) return 0;
  return Math.round(foundry.audio.AudioHelper.volumeToInput(Math.min(1, Math.max(0, level))) * 100);
}
function migrateSoundVolumes(board) {
  if (!board || board.volumeScale === "foundry") return false;
  const curve = value => foundry.audio.AudioHelper.inputToVolume(Number(value) || 0);
  for (const saved of board.saved ?? []) {
    if (saved.type === "playlist" && saved.config && "volume" in saved.config) saved.config.volume = curve(saved.config.volume);
    if (saved.type === "ambience") for (const file of saved.config?.files ?? []) if ("volume" in file) file.volume = curve(file.volume);
  }
  if (board.last?.playlist && "volume" in board.last.playlist) board.last.playlist.volume = curve(board.last.playlist.volume);
  for (const file of board.last?.ambience?.files ?? []) if ("volume" in file) file.volume = curve(file.volume);
  board.volumeScale = "foundry";
  return true;
}
async function setTrackVolumes() {
  gm();
  if (settingTrackVolumes) return;
  const field = root.querySelector('#ml-game-master-track-volume');
  if (!field?.reportValidity()) return;
  const percent = Number(field.value);
  const volume = volumeFromPercent(percent);
  settingTrackVolumes = true;
  try {
    await persist(n=>{
      n.volumeScale="foundry";
      n.last.allTrackVolume=percent;
      // Playback buttons reapply their own level on start, so they have to keep this one.
      if (n.last.playlist) n.last.playlist.volume=volume;
      for (const file of n.last.ambience?.files ?? []) file.volume=volume;
      for (const saved of n.saved ?? []) {
        if (saved.type==="playlist" && saved.config) saved.config.volume=volume;
        if (saved.type==="ambience") for (const file of saved.config?.files ?? []) file.volume=volume;
      }
    });
    render();
    let count = 0;
    for (const playlist of [...(game.playlists.contents ?? game.playlists)]) {
      const sounds = [...(playlist.sounds?.contents ?? playlist.sounds ?? [])];
      const updates = sounds.filter(sound=>sound?.id).map(sound=>({_id:sound.id,volume}));
      if (!updates.length) continue;
      await playlist.updateEmbeddedDocuments("PlaylistSound",updates,{diff:false});
      for (const sound of sounds) if (sound.playing && sound.sound) sound.sound.volume=volume;
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
    await p.updateEmbeddedDocuments("PlaylistSound", p.sounds.map(s => ({ _id:s.id, volume:config.volume })), {diff:false});
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
Hooks.on("renderDialogV2", (_app, html) => {
  const dialog = html?.jquery ? html[0] : html;
  for (const field of dialog?.querySelectorAll?.("[data-mlgm-character]") ?? []) core().ui.decorateActorSelect(field);
  bindAmbienceFolderEditor(dialog);
});
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
  const last = state.last.playlist ?? { volume:volumeFromPercent(65) };
  const result = await form("Start Playlist",label("Playlist",select("playlist",playlists.map(p => option(p.id,p.name,last.playlist)).join(""))) + label("Volume (%)",input("volume",percentFromVolume(last.volume),'type="number" min="0" max="100" required')) , [["start","Start"]]);
  if (!result) return;
  const config = {playlist:result.data.get("playlist"), volume:volumeFromPercent(result.data.get("volume"))};
  await saveAndRun("playlist", config);
  await run("playlist", config);
}
async function ambienceForm() {
  const folders = normalizeAmbienceFolders(get(AMBIENCE_FOLDERS));
  const Picker = foundry.applications.apps.FilePicker.implementation ?? foundry.applications.apps.FilePicker;
  const browse = Picker.browse ?? foundry.applications.apps.FilePicker.browse;
  const {files, errors} = await collectAmbienceFiles(folders, (source, target, options) => browse.call(Picker, source, target, options));
  const playable = presentAmbienceScan({files, errors}, {warn: error => console.warn(`${ID} |`, error), notify});
  if (!playable.length) return;
  const last = state.last.ambience?.files ?? [];
  const result = await form("Play Ambience", `<fieldset class="ml-stack"><legend>Layers and volume (%)</legend>${playable.map((file, i) => { const prev = last.find(entry => entry.path === file.path); return `<div class="ml-card ml-item-row"><label class="ml-check"><input type="checkbox" name="file" value="${i}" ${prev ? "checked" : ""}><span title="${e(file.path)}">${e(file.label)}</span></label>${label("Volume (%)", input(`volume${i}`, prev ? percentFromVolume(prev.volume) : 40, 'type="number" min="0" max="100" required'))}</div>`; }).join("")}</fieldset>`, [["save", "Save button"]]);
  if (!result) return;
  const selected = result.data.getAll("file").map(i => ({path: playable[Number(i)].path, volume: volumeFromPercent(result.data.get(`volume${i}`))}));
  if (!selected.length) throw new Error("Select at least one sound.");
  await saveAndRun("ambience", {files: selected});
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
function refreshTray(tabs) {
  if (!open || !root || (tabs && !tabs.includes(tab))) return;
  render();
}
Hooks.on("morelordGameMasterTriggersChanged", () => refreshTray(["triggers"]));
for (const hook of ["updatePlaylist", "updatePlaylistSound"]) Hooks.on(hook, () => refreshTray(["sound"]));
for (const hook of ["createMacro", "updateMacro", "deleteMacro"]) Hooks.on(hook, () => refreshTray(["macros"]));
Hooks.on("updateUser", () => refreshTray(["party", "rolls", "bulk"]));
Hooks.on("updateSetting", setting => {
  if (!game.user.isGM) return;
  if (setting.key === `${ID}.macros`) refreshTray(["macros"]);
  if (setting.key === `${ID}.specialtyOrder`) refreshTray(["settings", "rolls"]);
  if (setting.key === 'dnd5e.primaryParty' || setting.key === `${ID}.${BULK_UNDO}`) refreshTray(['bulk']);
  if (setting.key === `${ID}.board`) {
    state = foundry.utils.deepClone(get("board"));
    if (localBoardWrite) return;
    if (open && ["rolls", "sound", "triggers", "party", "settings", "macros", "bulk"].includes(tab)) render();
  }
  if (SPECIALTIES.some(specialty => setting.key === `${ID}.${specialty.setting}`)) refreshTray(["rolls", "settings"]);
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
    return `<article class="ml-card gm-trigger-card"><header class="gm-trigger-header"><strong class="gm-trigger-name" title="${e(name)}">${e(name)}</strong><span class="gm-trigger-scope" title="${e(scope)}">${e(scope)}</span><span class="ml-status gm-trigger-status" data-tone="${running ? "success" : "muted"}" role="img" title="${e(status)}" aria-label="${e(status)}"><i class="fa-solid ${running ? "fa-circle-check" : "fa-circle-pause"}" aria-hidden="true"></i></span><button type="button" class="ml-icon-button gm-row-action" data-action="trigger-toggle" data-id="${e(trigger.id)}" aria-pressed="${running}" title="${running ? "Pause trigger" : "Enable trigger"}" aria-label="${running ? "Pause trigger" : "Enable trigger"}"><i class="fa-solid ${running ? "fa-pause" : "fa-play"}" aria-hidden="true"></i></button></header><dl class="gm-trigger-rule"><div><dt>When</dt><dd>${e(triggerWhen(trigger))}</dd></div><div><dt>Then</dt><dd>${e(triggerThen(trigger))}</dd></div></dl></article>`;
  }).join("");
}

function ambienceFolderRow(folder) {
  const shown = folder.source === "data" ? folder.path : `${folder.source}: ${folder.path}`;
  return `<div class="ml-item-row" data-mlgm-ambience-folder><div class="ml-stack"><span title="${e(`${folder.source}: ${folder.path}`)}">${e(shown)}</span></div><button type="button" class="ml-icon-button" data-mlgm-remove-ambience title="Remove ${e(folder.path)}" aria-label="Remove ${e(folder.path)}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button><input type="hidden" name="ambienceSource" value="${e(folder.source)}"><input type="hidden" name="ambiencePath" value="${e(folder.path)}"></div>`;
}
function ambienceFolderEditor(folders) {
  return `<fieldset class="ml-stack" data-mlgm-ambience-folders><legend>Ambience folders</legend>${folders.map(ambienceFolderRow).join("")}<button type="button" data-mlgm-add-ambience>Add folder</button></fieldset>`;
}
function bindAmbienceFolderEditor(dialog) {
  const fieldset = dialog?.querySelector?.("[data-mlgm-ambience-folders]");
  if (!fieldset || fieldset.dataset.mlgmAmbienceBound) return;
  fieldset.dataset.mlgmAmbienceBound = "1";
  const add = fieldset.querySelector("[data-mlgm-add-ambience]");
  fieldset.addEventListener("click", async event => {
    const remove = event.target.closest?.("[data-mlgm-remove-ambience]");
    if (remove) {
      event.preventDefault();
      event.stopPropagation();
      remove.closest("[data-mlgm-ambience-folder]")?.remove();
      return;
    }
    if (event.target.closest?.("[data-mlgm-add-ambience]") !== add) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      const source = [...fieldset.querySelectorAll('[name="ambienceSource"]')].at(-1)?.value ?? "data";
      const path = [...fieldset.querySelectorAll('[name="ambiencePath"]')].at(-1)?.value ?? "";
      const Picker = foundry.applications.apps.FilePicker.implementation ?? foundry.applications.apps.FilePicker;
      const browse = Picker.browse ?? foundry.applications.apps.FilePicker.browse;
      const target = await resolveAmbiencePickerPath({source, path}, (nextSource, nextTarget, options) => browse.call(Picker, nextSource, nextTarget, options));
      if (target.error) console.warn(`${ID} |`, target.error);
      let activePicker;
      const callback = (selected, instance) => {
        const folder = folderFromFilePicker(selected, instance ?? activePicker);
        if (!folder) return;
        const duplicate = [...fieldset.querySelectorAll("[data-mlgm-ambience-folder]")].some(row => row.querySelector('[name="ambienceSource"]').value === folder.source && row.querySelector('[name="ambiencePath"]').value === folder.path);
        if (duplicate) return;
        add.insertAdjacentHTML("beforebegin", ambienceFolderRow(folder));
      };
      const show = async current => {
        const picker = new Picker(ambiencePickerOptions(current, callback));
        activePicker = picker;
        await picker.render({force: true});
        picker.bringToFront?.();
      };
      try { await show(target); }
      catch (error) {
        console.warn(`${ID} |`, error);
        try { await activePicker?.close?.(); } catch { /* A failed window is replaced by the data-root picker. */ }
        if (!target.path) throw error;
        await show({source: "data", path: ""});
      }
    } catch (error) { fail(error); }
  });
}
async function settings() {
  await ensureAmbienceFolders(game.settings, ID);
  const result = await form("Game Master settings", ambienceFolderEditor(normalizeAmbienceFolders(get(AMBIENCE_FOLDERS))), [["ok", "Save"]], {modal: false});
  if (!result) return;
  const sources = result.data.getAll("ambienceSource");
  const paths = result.data.getAll("ambiencePath");
  await game.settings.set(ID, AMBIENCE_FOLDERS, normalizeAmbienceFolders(sources.map((source, index) => ({source, path: paths[index]}))));
  await game.settings.set(ID, AMBIENCE_MIGRATED, true);
  render();
}
