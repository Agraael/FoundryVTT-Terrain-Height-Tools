/** @import { Signal } from "@lit-labs/preact-signals" */
/** @import { drawingModeTypes, terrainPaintMode } from "../consts.mjs" */
/** @import { DeepSignal } from "../utils/signal-utils.mjs"; */
import { computed, signal } from "@preact/signals-core";
import { deepSignal } from "../utils/signal-utils.mjs";

/** @type {Signal<drawingModeTypes>} */
export const drawingMode$ = signal("gridCells");

/**
 * @typedef {Object} PaintingConfigModel
 * @property {string | undefined} terrainTypeId
 * @property {number} height
 * @property {number} elevation
 * @property {terrainPaintMode} mode
 */
/** @type {DeepSignal<PaintingConfigModel>} */
export const paintingConfig$ = deepSignal({
	terrainTypeId: undefined,
	height: 1,
	elevation: 0,
	mode: "destructiveMerge"
});

/**
 * Readonly signal representing the effective `top` value of the current painting config.
 * Use `setPaintingConfigTop` to adjust.
 */
export const paintingConfigTop$ = computed(() => paintingConfig$.elevation.value + paintingConfig$.height.value);

/**
 * Updates the `paintingConfig$`'s `height` so that it matches the specified `top` value.
 * @param {number} top
 */
export function setPaintingConfigTop(top) {
	paintingConfig$.height.value = Math.max(top - paintingConfig$.elevation.value, 0.1);
}

/**
 * Updates the `paintingConfig$`'s `height` and `elevation` so that it matches the specified `bottom` value. Does not
 * change what the effective `top` value would be.
 * @param {number} bottom
 */
export function setPaintingConfigBottom(bottom) {
	const { elevation, height } = paintingConfig$.value;
	const top = elevation + height;
	paintingConfig$.value = {
		elevation: bottom,
		height: Math.max(top - bottom, 0.1)
	};
}

/**
 * @typedef {Object} EraseConfigModel
 * @property {string[]} excludedTerrainTypeIds
 * @property {number | null} bottom
 * @property {number | null} top
 */
/** @type {DeepSignal<EraseConfigModel>} */
export const eraseConfig$ = deepSignal({
	excludedTerrainTypeIds: [], // we use an exclusion instead of inclusion so that the default selects all terrain types (without needing to load them)
	bottom: null,
	top: null
});

export const convertConfig$ = deepSignal({
	toDrawing: true,
	toRegion: false,
	toWalls: false,
	setWallHeightFlags: true,
	deleteAfter: true
});

/** @type {Signal<any>} */
export const wallConfig$ = signal(foundry.documents.WallDocument.schema.clean({}));

window.wallConfig$ = wallConfig$;
