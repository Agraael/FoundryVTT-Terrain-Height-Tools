/** @import { TerrainShape } from "../geometry/terrain-shape.mjs" */
/** @import { TerrainType, TerrainTrigger } from "../stores/terrain-types.mjs" */
import { getShapesByBounds } from "../stores/terrain-manager.mjs";
import { getTerrainType, terrainTypes$ } from "../stores/terrain-types.mjs";
import { fromSceneUnits, getSpacesUnderToken } from "../utils/grid-utils.mjs";
import { warn } from "../utils/log.mjs";

const zoneRuleWarned = new Set();

/**
 * @param {TokenDocument} tokenDoc
 * @param {TerrainShape} shape
 * @param {TerrainTrigger["elevationRule"]} rule
 * @param {{ x?: number; y?: number; elevation?: number }} [position]
 */
export function isTokenInsideShape(tokenDoc, shape, rule, position) {
	const x = position?.x ?? tokenDoc.x;
	const y = position?.y ?? tokenDoc.y;
	const { width, height, hexagonalShape } = tokenDoc;
	const { type: gridType, size: gridSize } = canvas.grid;

	let polyHit = false;
	for (const space of getSpacesUnderToken(x, y, width, height, gridType, gridSize, hexagonalShape)) {
		if (shape.containsPoint(space.x, space.y)) {
			polyHit = true;
			break;
		}
	}
	if (!polyHit) return false;

	const terrainType = getTerrainType(shape.terrainTypeId);
	if (!terrainType) return false;

	if (!terrainType.usesHeight) {
		if (rule !== "ANY_ELEVATION" && !zoneRuleWarned.has(terrainType.id)) {
			zoneRuleWarned.add(terrainType.id);
			warn(`Terrain type "${terrainType.name}" is a zone (usesHeight=false); elevation rule "${rule}" is being treated as ANY_ELEVATION.`);
		}
		return true;
	}

	if (rule === "ANY_ELEVATION") return true;

	const elev = fromSceneUnits(position?.elevation ?? tokenDoc.elevation ?? 0);
	switch (rule) {
		case "INSIDE_VOLUME_INCLUSIVE": return elev >= shape.bottom && elev <= shape.top;
		case "INSIDE_VOLUME_HALF_OPEN": return elev >= shape.bottom && elev < shape.top;
		case "ON_FLOOR": return elev === shape.bottom;
		default: return false;
	}
}

/**
 * @param {TokenDocument} tokenDoc
 * @param {{ x?: number; y?: number; elevation?: number }} [position]
 * @returns {{ shape: TerrainShape; terrainType: TerrainType; trigger: TerrainTrigger }[]}
 */
export function getContainingTriggerMatches(tokenDoc, position) {
	const result = [];

	const triggeredTypes = terrainTypes$.value.filter(t => t.triggers?.some(tr => tr.enabled));
	if (triggeredTypes.length === 0) return result;
	const triggeredTypeIds = new Set(triggeredTypes.map(t => t.id));

	const x = position?.x ?? tokenDoc.x;
	const y = position?.y ?? tokenDoc.y;
	const { width, height } = tokenDoc;
	const { size: gridSize } = canvas.grid;
	const tokenRect = new PIXI.Rectangle(x, y, width * gridSize, height * gridSize);

	const candidates = getShapesByBounds(tokenRect, {
		collisionTest: ({ t: shape }) => triggeredTypeIds.has(shape.terrainTypeId)
	});

	for (const shape of candidates) {
		const terrainType = getTerrainType(shape.terrainTypeId);
		if (!terrainType) continue;
		for (const trigger of terrainType.triggers) {
			if (!trigger.enabled) continue;
			if (isTokenInsideShape(tokenDoc, shape, trigger.elevationRule, position))
				result.push({ shape, terrainType, trigger });
		}
	}

	return result;
}
