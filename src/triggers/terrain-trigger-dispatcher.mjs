/** @import { TerrainShape } from "../geometry/terrain-shape.mjs" */
/** @import { TerrainType, TerrainTrigger } from "../stores/terrain-types.mjs" */
import { enterLeaveTerrainHook } from "../consts.mjs";
import { getContainingTriggerMatches } from "./terrain-containment.mjs";
import { isActiveGm, passesTargetFilter, runTriggerAction } from "./trigger-action.mjs";

/** @type {Map<string, ReturnType<typeof getContainingTriggerMatches>>} */
const preMatchesByTokenId = new Map();

function matchKey({ shape, trigger }) {
	return `${trigger.id}::${shape._providerId ?? ""}::${shape.terrainTypeId}::${shape.bottom}::${shape.top}::${shape.polygon.boundingRect.x},${shape.polygon.boundingRect.y}`;
}

function indexByKey(matches) {
	const map = new Map();
	for (const m of matches) map.set(matchKey(m), m);
	return map;
}

function selectTriggers(tokenDoc, matches, modes) {
	const out = [];
	for (const m of matches) {
		if (!modes.includes(m.trigger.mode)) continue;
		if (!passesTargetFilter(tokenDoc, m.trigger.targetTokens)) continue;
		out.push(m);
	}
	return out;
}

async function dispatchMatches(tokenDoc, matches, options) {
	for (const m of matches) {
		Hooks.callAll(enterLeaveTerrainHook, {
			token: tokenDoc,
			shape: m.shape,
			terrainType: m.terrainType,
			trigger: m.trigger,
			...options
		});
		if (!isActiveGm()) continue;
		await runTriggerAction(m.trigger, {
			token: tokenDoc,
			shape: m.shape,
			terrainType: m.terrainType,
			options
		});
	}
}

export function handlePreUpdateToken(tokenDoc, change) {
	if (!("x" in change || "y" in change || "elevation" in change)) {
		preMatchesByTokenId.delete(tokenDoc.id);
		return;
	}
	preMatchesByTokenId.set(tokenDoc.id, getContainingTriggerMatches(tokenDoc));
}

export async function handleUpdateToken(tokenDoc, change) {
	const moved = "x" in change || "y" in change || "elevation" in change;
	if (!moved) return;

	const preMatches = preMatchesByTokenId.get(tokenDoc.id);
	preMatchesByTokenId.delete(tokenDoc.id);
	if (!preMatches) return;

	// tokenDoc x/y can still reflect the pre-update position when this hook fires on hex grids,
	// so feed the new coords from the change diff directly.
	const postMatches = getContainingTriggerMatches(tokenDoc, {
		x: change.x ?? tokenDoc.x,
		y: change.y ?? tokenDoc.y,
		elevation: change.elevation ?? tokenDoc.elevation
	});

	const preIdx = indexByKey(preMatches);
	const postIdx = indexByKey(postMatches);

	const entered = [];
	const left = [];
	const stayed = [];
	for (const [k, m] of postIdx) {
		if (preIdx.has(k)) stayed.push(m); else entered.push(m);
	}
	for (const [k, m] of preIdx) {
		if (!postIdx.has(k)) left.push(m);
	}

	const enterMatches = selectTriggers(tokenDoc, entered, ["ENTER", "ENTER_LEAVE"]);
	const leaveMatches = selectTriggers(tokenDoc, left, ["LEAVE", "ENTER_LEAVE"]);
	const moveMatches = selectTriggers(tokenDoc, stayed, ["MOVE_INSIDE"]);

	await dispatchMatches(tokenDoc, enterMatches, { hasEntered: true, isPreview: false, reason: "move" });
	await dispatchMatches(tokenDoc, leaveMatches, { hasEntered: false, isPreview: false, reason: "move" });
	await dispatchMatches(tokenDoc, moveMatches, { hasEntered: null, isPreview: false, reason: "move-inside" });
}

function combatantTokenDoc(combatant) {
	if (!combatant) return null;
	return combatant.token?.document
		?? game.scenes.get(combatant.sceneId ?? combatant.parent?.scene?.id)?.tokens.get(combatant.tokenId)
		?? null;
}

async function dispatchForCombatants(combat, combatantIds, modes, reason) {
	for (const combatantId of combatantIds) {
		const combatant = combat.combatants.get(combatantId);
		const tokenDoc = combatantTokenDoc(combatant);
		if (!tokenDoc) continue;
		const matches = selectTriggers(tokenDoc, getContainingTriggerMatches(tokenDoc), modes);
		if (matches.length === 0) continue;
		await dispatchMatches(tokenDoc, matches, { hasEntered: null, isPreview: false, reason });
	}
}

export async function handleCombatTurn(combat) {
	const priorTokenId = combat.previous?.combatantId;
	const currentTokenId = combat.current?.combatantId;
	if (priorTokenId)
		await dispatchForCombatants(combat, [priorTokenId], ["TURN_END", "TURN_START_END"], "turn-end");
	if (currentTokenId)
		await dispatchForCombatants(combat, [currentTokenId], ["TURN_START", "TURN_START_END"], "turn-start");
}

export async function handleCombatRound(combat) {
	const allCombatantIds = combat.combatants.map(c => c.id);
	await dispatchForCombatants(combat, allCombatantIds, ["ROUND_END", "ROUND_START_END"], "round-end");
	await dispatchForCombatants(combat, allCombatantIds, ["ROUND_START", "ROUND_START_END"], "round-start");
}

export function registerTriggerDispatcher() {
	Hooks.on("preUpdateToken", handlePreUpdateToken);
	Hooks.on("updateToken", handleUpdateToken);
	Hooks.on("combatTurn", handleCombatTurn);
	Hooks.on("combatRound", handleCombatRound);
}
