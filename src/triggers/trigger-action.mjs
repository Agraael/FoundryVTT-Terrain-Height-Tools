/** @import { TerrainTrigger } from "../stores/terrain-types.mjs" */
import { moduleName } from "../consts.mjs";
import { error } from "../utils/log.mjs";

/** @type {Map<string, Function>} */
const scriptCache = new Map();

const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;

function compileCode(code, sourceUrlTag) {
	const cached = scriptCache.get(code);
	if (cached) return cached;
	const wrapped = `${code}\n//# sourceURL=modules/${moduleName}/dynamic/${sourceUrlTag}.js`;
	const fn = new AsyncFunction("token", "shape", "terrainType", "trigger", "options", "api", wrapped);
	scriptCache.set(code, fn);
	return fn;
}

export function isActiveGm() {
	if (!game.user?.isGM) return false;
	const activeGms = game.users.filter(u => u.isGM && u.active);
	return activeGms.length === 0 || activeGms.sort((a, b) => a.id.localeCompare(b.id))[0]?.id === game.user.id;
}

/**
 * @param {TokenDocument} tokenDoc
 * @param {TerrainTrigger["targetTokens"]} filter
 */
export function passesTargetFilter(tokenDoc, filter) {
	if (filter?.startsWith?.("TEAM:")) {
		const wantedTeamId = filter.slice("TEAM:".length);
		const tokenTeamId = tokenDoc.flags?.["token-factions"]?.team
			?? tokenDoc.actor?.prototypeToken?.flags?.["token-factions"]?.team;
		return tokenTeamId === wantedTeamId;
	}
	switch (filter) {
		case "ALL": return true;
		case "FRIENDLY": return tokenDoc.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY;
		case "HOSTILE": return tokenDoc.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE;
		case "NEUTRAL": return tokenDoc.disposition === CONST.TOKEN_DISPOSITIONS.NEUTRAL;
		case "SECRET": return tokenDoc.disposition === CONST.TOKEN_DISPOSITIONS.SECRET;
		case "PLAYER_OWNED": return Object.entries(tokenDoc.actor?.ownership ?? {})
			.some(([userId, level]) => userId !== "default" && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && !game.users.get(userId)?.isGM);
		default: return true;
	}
}

/**
 * @param {TerrainTrigger} trigger
 * @param {{ token: TokenDocument; shape: import("../geometry/terrain-shape.mjs").TerrainShape; terrainType: import("../stores/terrain-types.mjs").TerrainType; options: Record<string, any>; }} scope
 */
export async function runTriggerAction(trigger, scope) {
	if (!trigger.enabled || trigger.actionType === "none") return;

	const fullScope = { ...scope, trigger };
	try {
		switch (trigger.actionType) {
			case "macro": {
				if (!trigger.actionMacroId) return;
				const fetched = await fromUuid(trigger.actionMacroId).catch(() => null);
				const macro = fetched ?? game.macros?.get(trigger.actionMacroId);
				if (!macro) {
					error(`Trigger ${trigger.id}: macro "${trigger.actionMacroId}" not found.`);
					return;
				}
				return macro.execute(fullScope);
			}
			case "code": {
				if (!trigger.actionCode?.trim()) return;
				const fn = compileCode(trigger.actionCode, `trigger-${trigger.id}`);
				return fn(fullScope.token, fullScope.shape, fullScope.terrainType, fullScope.trigger, fullScope.options, globalThis.terrainHeightTools);
			}
			case "effect": {
				if (!trigger.actionEffectId) return;
				const actor = fullScope.token?.actor;
				if (!actor?.toggleStatusEffect) return;
				const overlay = !!trigger.actionEffectOverlay;
				const active = scope.options?.hasEntered !== false;
				return actor.toggleStatusEffect(trigger.actionEffectId, { active, overlay });
			}
		}
	} catch (err) {
		error(`Trigger ${trigger.id} (${trigger.actionType}) failed:`, err);
	}
}
