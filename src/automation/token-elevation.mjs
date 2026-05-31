/** @import { TerrainShape } from "../geometry/terrain-shape.mjs" */
import { tokenElevationChange$, tokenElevationChangeInsertClimbWaypoints$ } from "../config/settings.mjs";
import { moduleName, tokenFlags } from "../consts.mjs";
import { heightMap } from "../geometry/height-map.mjs";
import { getTerrainType } from "../stores/terrain-types.mjs";
import { getSpacesUnderToken, toSceneUnits } from "../utils/grid-utils.mjs";
import { getTokenHeight } from "../utils/token-utils.mjs";

/**
 * @typedef {Object} TokenCompleteMovementWaypoint
 * @property {number} x The top-left x-coordinate in pixels (integer).
 * @property {number} y The top-left y-coordinate in pixels (integer).
 * @property {number} elevation The elevation in grid units.
 * @property {number} width The width in grid spaces (positive).
 * @property {number} height The height in grid spaces (positive).
 * @property {TokenShapeType} shape The shape type (CONST.TOKEN_SHAPES).
 * @property {string} action The movement action from the previous to this waypoint.
 * @property {DataModel|null} terrain The terrain data from the previous to this waypoint.
 * @property {boolean} snapped  Was this waypoint snapped to the grid?
 * @property {boolean} explicit Was this waypoint explicitly placed by the user?
 * @property {boolean} checkpoint Is this waypoint a checkpoint?
 * @property {boolean} intermediate Is this waypoint intermediate?
 */

// TODO: make this configurable?
const automaticElevationMovementTypes = ["walk", "crawl", "climb", "jump", "teleport", "blink"];

const thtTerrainTop = Symbol("thtTerrainTop");

/**
 * Wrapper that handles automatic elevation change when the user is dragging the token within a scene.
 * This is not used in other circumstances such as when using the keyboard or undoing a previous move.
 * @param {(current, changes, options) => { elevation: number; x: number; y: number; }} wrapped
 * @param {{ x: number; y: number; elevation: number; action: string | undefined; [thtTerrainTop]?: number; }} current
 * @param {{ x: number; y: number; }} changes
 * @param {any} options
 */
export function tokenGetDragWaypointPositionWrapper(wrapped, current, changes, options) {
	const position = wrapped(current, changes, options);

	const autoElevationEnabled = tokenElevationChange$.value
		&& !this.document._source.flags?.[moduleName]?.[tokenFlags.ignoreAutoElevation]
		&& automaticElevationMovementTypes.includes(this.document.movementAction);
	if (!autoElevationEnabled) return position;

	// `current` is the same object that was returned from this function the last time it was called.
	// `current` also includes any changes in elevation that the user has done via the +/- keybinds.
	// So, record the THT elevation from the previous run, then we can calculate the delta against just the THT
	// elevation, and add that to the position's elevation without affecting elevation changes from +/- keys (or other).
	const { x: initialX, y: initalY, width, height, shape } = this.document._source;
	const tokenZHeight = getTokenHeight(this.document);

	// Top of the terrain under the token in the `current` position.
	// We ignore any terrain that is is entirely above the token, i.e. if the token is in a gap beneath this terrain
	const currentTerrainTop = current[thtTerrainTop]
		?? getTopMostTerrainUnderToken(
			{ x: initialX, y: initalY, width, height, shape },
			{ terrainFilter: s => s.bottom <= current.elevation + tokenZHeight }
		);

	const currentElevationAboveTerrain = current.elevation - currentTerrainTop;

	// Find the best suitable space for the token, attempting to the keep the same relative height above terrain
	const nextTerrainTop = getTopMostTerrainUnderToken(
		{ ...position, width, height, shape },
		{ gapSearch: { currentTerrainTop, currentElevationAboveTerrain, tokenZHeight } }
	);

	const delta = nextTerrainTop - currentTerrainTop;
	position.elevation += toSceneUnits(delta);
	position[thtTerrainTop] = nextTerrainTop;

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

	const autoElevationEnabled = tokenElevationChange$.value
		&& !this.document._source.flags?.[moduleName]?.[tokenFlags.ignoreAutoElevation]
		&& automaticElevationMovementTypes.includes(this.document.movementAction);
	if (!autoElevationEnabled) return position;

	const { width, height, shape, elevation } = this.document._source;
	const tokenZHeight = getTokenHeight(this.document);

	const initialElevation = getTopMostTerrainUnderToken(this.document._source, { elevation, height: tokenZHeight });
	const newElevation = getTopMostTerrainUnderToken({ x: position.x, y: position.y, width, height, shape }, { elevation, height: tokenZHeight });

	position.elevation += toSceneUnits(newElevation - initialElevation);

	return position;
}

/**
 * Wrapper for TokenDocument#getCompleteMovementPath which adds additional climb waypoints when dragging tokens and the
 * elevation changes.
 * @param {(waypoints: any[]) => TokenCompleteMovementWaypoint[]} wrapped
 * @param {any[]} waypoints
 */
export function tokenDocumentGetCompleteMovementPathWrapper(wrapped, waypoints) {
	const movementPath = wrapped(waypoints);
	if (movementPath.length <= 1) return movementPath;

	// If the setting is disabled, do nothing
	if (!tokenElevationChange$.value || !tokenElevationChangeInsertClimbWaypoints$.value) return movementPath;

	// If the token has the ignore auto-elevation flag set, skip elevation adjustment
	if (this.flags?.[moduleName]?.[tokenFlags.ignoreAutoElevation]) return movementPath;

	const tokenZHeight = getTokenHeight(this);

	// Top of the terrain under the token in the initial waypoint.
	// We ignore any terrain that is is entirely above the token, i.e. if the token is in a gap beneath this terrain
	// This needs to match the logic in the tokenGetDragWaypointPositionWrapper
	let previousTerrainTop = getTopMostTerrainUnderToken(
		movementPath[0],
		{ terrainFilter: s => s.bottom <= movementPath[0].elevation + tokenZHeight }
	);

	for (let i = 1; i < movementPath.length; i++) {
		if (!automaticElevationMovementTypes.includes(movementPath[i].action)) continue;

		// Find the best suitable space for the token, keeping the same relative height above terrain.
		// This needs to match the logic in the tokenGetDragWaypointPositionWrapper
		const thisTerrainTop = getTopMostTerrainUnderToken(
			movementPath[i],
			{ gapSearch: {
				currentTerrainTop: previousTerrainTop,
				currentElevationAboveTerrain: movementPath[i].elevation - previousTerrainTop,
				tokenZHeight
			} }
		);

		// Update the elevation of this waypoint
		movementPath[i].elevation = toSceneUnits(thisTerrainTop);

		if (thisTerrainTop !== previousTerrainTop) {
			Object.assign(movementPath[i - 1], {
				intermediate: false
			});
			Object.assign(movementPath[i], {
				action: "climb",
				elevation: thisTerrainTop,
				intermediate: false
			});
		}

		previousTerrainTop = thisTerrainTop;
	}

	return movementPath;
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

	const terrainHeight = getTopMostTerrainUnderToken(tokenDoc);

	tokenDoc.updateSource({ elevation: terrainHeight });
}

/**
 * Finds the highest solid terrain point under the given token position. This accounts for terrain height and elevation.
 *
 * On gridded scenes, when using the arrow keys to move, Foundry will round a token's elevation to the nearest whole
 * grid scale distance. E.G. on a scene where distaince is 5ft, setting a token to have an elevation of 2.5 and then
 * moving it to another space using the keyboard causes the elevation to jump to 5. This does not seem to happen if
 * snapping is disabled or on gridless scenes. This behavior causes problems when using fractional height terrain, since
 * THT would adjust the elevation to be fraction, then if the user moves the token it then rounds that off. E.G. moving
 * a token on and off a half height terrain using the keyboard would cause the token to keep rising and rising. To get
 * around this, we round off all the elevation changes that THT does. This isn't ideal as it means fractional height
 * terrains don't behave as expected, but it does resolve the issue of indefinitely rising tokens.
 * @param {{ x: number; y: number; width: number; height: number; shape: number; }} position
 * @param {Object} [options]
 * @param {(terrain: TerrainShape) => boolean} [options.terrainFilter] If provided, only terrain passing this predicate
 * is considered.
 * @param {{ currentTerrainTop: number; currentElevationAboveTerrain: number; tokenZHeight: number }} [options.gapSearch]
 */
function getTopMostTerrainUnderToken(position, { terrainFilter, gapSearch } = {}) {
	const { x, y, width, height, shape } = position;
	const { type: gridType, size: gridSize } = canvas.grid;

	/** @type {{ bottom: number; top: number; }[]} */
	const occuipedTerrainRanges = [{ bottom: -Infinity, top: 0 }];

	let highest = 0;

	for (const space of getSpacesUnderToken(x, y, width, height, gridType, gridSize, shape)) {
		const shapes = heightMap.getShapesAtPoint(space.x, space.y);
		if (!(shapes?.length > 0)) continue; // no terrain at this cell

		for (const shape of shapes) {
			const terrainType = getTerrainType(shape.terrainTypeId);
			if (!terrainType?.usesHeight || !terrainType.isSolid) continue; // zone or non solid, ignore it
			if (typeof terrainFilter === "function" && !terrainFilter(shape)) continue;

			highest = Math.max(highest, shape.top);

			occuipedTerrainRanges.push({
				bottom: gridType === CONST.GRID_TYPES.GRIDLESS ? shape.bottom : Math.round(shape.bottom),
				top: gridType === CONST.GRID_TYPES.GRIDLESS ? shape.top : Math.round(shape.top)
			});
		}
	}

	// If we're only looking for the highest possible terrain, return that
	if (!gapSearch)
		return gridType === CONST.GRID_TYPES.GRIDLESS ? highest : Math.round(highest);

	// Otherwise if we're looking for the lowest gap, sort the terrain and loop through to find a gap big enough for the
	// token.
	if (!occuipedTerrainRanges.length) return 0;

	occuipedTerrainRanges.sort((a, b) => a.bottom - b.bottom || a.top - b.top);

	// Required gap size if we wish to maintain the same relative elevation above terrain.
	// TODO: add configuration that allows token to "squeeze"?
	// TODO: add configuration that will ignore elevation above terrain for these purposes?
	const requiredGapSize = gapSearch.currentElevationAboveTerrain + gapSearch.tokenZHeight;

	for (let i = 0; i < occuipedTerrainRanges.length - 1; i++) {
		const gapSize = occuipedTerrainRanges[i + 1].bottom - occuipedTerrainRanges[i].top;
		if (gapSize < requiredGapSize) continue;

		// For the gap to be valid, the top-most point of the gap must not be lower than the current elevation plus
		// the token's vertical height - otherwise the token could not feasibly move through that space into the gap.
		if (occuipedTerrainRanges[i + 1].bottom < gapSearch.currentTerrainTop + gapSearch.tokenZHeight) continue;

		return occuipedTerrainRanges[i].top;
	}

	return occuipedTerrainRanges.at(-1).top;
}
