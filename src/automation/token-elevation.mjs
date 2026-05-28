import { tokenElevationChange$ } from "../config/settings.mjs";
import { moduleName, tokenFlags } from "../consts.mjs";
import { heightMap } from "../geometry/height-map.mjs";
import { getTerrainType } from "../stores/terrain-types.mjs";
import { getSpacesUnderToken, toSceneUnits } from "../utils/grid-utils.mjs";

// TODO: make this configurable?
const automaticElevationMovementTypes = ["walk", "crawl", "climb", "jump", "teleport", "blink"];

const thtElevation = Symbol("thtElevation");

/**
 * Wrapper that handles automatic elevation change when the user is dragging the token within a scene.
 * This is not used in other circumstances such as when using the keyboard or undoing a previous move.
 * @param {(current, changes, options) => { elevation: number; x: number; y: number; }} wrapped
 * @param {{ x: number; y: number; elevation: number; action: string | undefined; [thtElevation]?: number; }} current
 * @param {{ x: number; y: number; }} changes
 * @param {any} options
 */
export function tokenGetDragWaypointPositionWrapper(wrapped, current, changes, options) {
	const position = wrapped(current, changes, options);

	const autoElevationEnabled = tokenElevationChange$.value &&
		!this.document._source.flags?.[moduleName]?.[tokenFlags.ignoreAutoElevation] &&
		automaticElevationMovementTypes.includes(this.document.movementAction);
	if (!autoElevationEnabled) return position;

	// `current` is the same object that was returned from this function the last time it was called.
	// `current` also includes any changes in elevation that the user has done via the +/- keybinds.
	// So, record the THT elevation from the previous run, then we can calculate the delta against just the THT
	// elevation, and add that to the position's elevation without affecting elevation changes from +/- keys (or other).
	const { x: initialX, y: initalY, width, height, shape } = this.document._source;

	const previousElevation = current[thtElevation] ?? getHighestTerrainUnderToken({ x: initialX, y: initalY, width, height, shape });
	const currentElevation = getHighestTerrainUnderToken({ ...position, width, height, shape });

	const delta = currentElevation - previousElevation;
	position.elevation += toSceneUnits(delta);
	position[thtElevation] = currentElevation;

	return position;
}

/**
 * Wrapper that handles automatic elevation change when the user is using the keyboard to move a token.
 * @param {(dx: -1 | 0 | 1, dy: -1 | 0 | 1, dz: -1 | 0 | 1) => { x: number; y: number; elevation: number; }} wrapped
 * @param {-1 | 0 | 1} dx
 * @param {-1 | 0 | 1} dy
 * @param {-1 | 0 | 1} dz
 */
export function tokenGetShiftedPositionWrapper(wrapped, dx, dy, dz) {
	const position = wrapped(dx, dy, dz);

	const autoElevationEnabled = tokenElevationChange$.value &&
		!this.document._source.flags?.[moduleName]?.[tokenFlags.ignoreAutoElevation] &&
		automaticElevationMovementTypes.includes(this.document.movementAction);
	if (!autoElevationEnabled) return position;

	const { width, height, shape } = this.document._source;
	const initialElevation = getHighestTerrainUnderToken(this.document._source);
	const newElevation = getHighestTerrainUnderToken({ x: position.x, y: position.y, width, height, shape });

	position.elevation += toSceneUnits(newElevation - initialElevation);

	return position;
}

/**
 * When a token is created, if the token elevation option is enabled and the token is ontop of solid terrain, then set
 * the token's initial elevation.
 * @param {TokenDocument} tokenDoc
 * @param {string} userId
 */
export function onTokenPreCreate(tokenDoc, _createData, _options, userId) {
	// If the token was not created by the current user, or the setting is disabled, do nothing
	if (userId !== game.userId || !tokenElevationChange$.value) return;

	// If the token has the ignore auto-elevation flag set, skip initial elevation
	if (tokenDoc.getFlag(moduleName, tokenFlags.ignoreAutoElevation)) return;

	const terrainHeight = getHighestTerrainUnderToken(tokenDoc);

	tokenDoc.updateSource({ elevation: terrainHeight });
}

/**
 * Finds the highest solid terrain point under the given token position. This accounts for terrain height and elevation.
 * @param {{ x: number; y: number; width: number; height: number; shape: number; }} position
 */
function getHighestTerrainUnderToken(position) {
	const { x, y, width, height, shape } = position;
	const { type: gridType, size: gridSize } = canvas.grid;

	let highest = 0;

	for (const space of getSpacesUnderToken(x, y, width, height, gridType, gridSize, shape)) {
		const shapes = heightMap.getShapesAtPoint(space.x, space.y);
		if (!(shapes?.length > 0)) continue; // no terrain at this cell

		for (const shape of shapes) {
			const terrainType = getTerrainType(shape.terrainTypeId);
			if (!terrainType?.usesHeight || !terrainType.isSolid) continue; // zone or non solid, ignore it

			highest = Math.max(highest, shape.top);
		}
	}

	return highest;
}
