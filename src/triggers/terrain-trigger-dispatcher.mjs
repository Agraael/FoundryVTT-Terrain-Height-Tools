/** @import { TerrainShape } from "../geometry/terrain-shape.mjs" */
/** @import { TerrainType, TerrainTrigger } from "../stores/terrain-types.mjs" */
import { enterLeaveTerrainHook } from "../consts.mjs";
import { getContainingTriggerMatches } from "./terrain-containment.mjs";
import { isActiveGm, passesTargetFilter, runTriggerAction } from "./trigger-action.mjs";

/** @type {Map<string, { matches: ReturnType<typeof getContainingTriggerMatches>, position: { x: number, y: number, elevation: number } }>} */
const preMatchesByTokenId = new Map();

function matchKey({ shape, trigger }) {
	return `${trigger.id}::${shape._providerId ?? ""}::${shape.terrainTypeId}::${shape.bottom}::${shape.top}::${shape.polygon.boundingRect.x},${shape.polygon.boundingRect.y}`;
}

function indexByKey(matches) {
	const map = new Map();
	for (const m of matches) map.set(matchKey(m), m);
	return map;
}

/** Walk the line pre→post as a series of token top-left positions, one per cell visited. */
function getPathCells(tokenDoc, prePos, postPos) {
	const grid = canvas.grid;
	if (!grid?.getDirectPath || !grid?.getCenterPoint) return [prePos, postPos];
	const gridSize = grid.size;
	const w = (tokenDoc.width ?? 1) * gridSize;
	const h = (tokenDoc.height ?? 1) * gridSize;
	const preCenter = { x: prePos.x + w / 2, y: prePos.y + h / 2 };
	const postCenter = { x: postPos.x + w / 2, y: postPos.y + h / 2 };
	let offsets;
	try {
		offsets = grid.getDirectPath([preCenter, postCenter]) ?? [];
	} catch {
		return [prePos, postPos];
	}
	return offsets.map(off => {
		const c = grid.getCenterPoint(off);
		return { x: c.x - w / 2, y: c.y - h / 2 };
	});
}

/** Zones contained at some intermediate path step but in neither pre nor post: traversed in one move. */
function getTraversedMatches(tokenDoc, prePos, postPos, preIdx, postIdx) {
	const cells = getPathCells(tokenDoc, prePos, postPos);
	if (cells.length <= 2) return [];
	const found = new Map();
	const elevStart = prePos.elevation ?? 0;
	const elevEnd = postPos.elevation ?? 0;
	const last = cells.length - 1;
	for (let i = 1; i < last; i++) {
		const t = i / last;
		const elevation = elevStart + (elevEnd - elevStart) * t;
		const pos = { x: cells[i].x, y: cells[i].y, elevation };
		const matches = getContainingTriggerMatches(tokenDoc, pos);
		for (const m of matches) {
			const k = matchKey(m);
			if (preIdx.has(k) || postIdx.has(k)) continue;
			if (found.has(k)) continue;
			found.set(k, m);
		}
	}
	return [...found.values()];
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
	preMatchesByTokenId.set(tokenDoc.id, {
		matches: getContainingTriggerMatches(tokenDoc),
		position: { x: tokenDoc.x, y: tokenDoc.y, elevation: tokenDoc.elevation }
	});
}

export async function handleUpdateToken(tokenDoc, change) {
	const moved = "x" in change || "y" in change || "elevation" in change;
	if (!moved) return;

	const preData = preMatchesByTokenId.get(tokenDoc.id);
	preMatchesByTokenId.delete(tokenDoc.id);
	const prePos = preData?.position ?? { x: tokenDoc.x, y: tokenDoc.y, elevation: tokenDoc.elevation };
	const preMatches = preData?.matches ?? getContainingTriggerMatches(tokenDoc, prePos);

	// tokenDoc x/y can still reflect the pre-update position when this hook fires on hex grids,
	// so feed the new coords from the change diff directly.
	const postPos = {
		x: change.x ?? tokenDoc.x,
		y: change.y ?? tokenDoc.y,
		elevation: change.elevation ?? tokenDoc.elevation
	};
	const postMatches = getContainingTriggerMatches(tokenDoc, postPos);

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

	// Zones traversed during this move (in neither pre nor post but touched in between).
	const traversed = getTraversedMatches(tokenDoc, prePos, postPos, preIdx, postIdx);

	const enterMatches = selectTriggers(tokenDoc, entered, ["ENTER", "ENTER_LEAVE"]);
	const leaveMatches = selectTriggers(tokenDoc, left, ["LEAVE", "ENTER_LEAVE"]);
	const moveMatches = selectTriggers(tokenDoc, stayed, ["MOVE_INSIDE"]);
	const traversedEnter = selectTriggers(tokenDoc, traversed, ["ENTER", "ENTER_LEAVE"]);
	const traversedLeave = selectTriggers(tokenDoc, traversed, ["LEAVE", "ENTER_LEAVE"]);

	await dispatchMatches(tokenDoc, enterMatches, { hasEntered: true, isPreview: false, reason: "move" });
	await dispatchMatches(tokenDoc, traversedEnter, { hasEntered: true, isPreview: false, reason: "traversal" });
	await dispatchMatches(tokenDoc, traversedLeave, { hasEntered: false, isPreview: false, reason: "traversal" });
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
