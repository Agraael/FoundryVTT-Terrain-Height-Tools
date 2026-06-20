/** @import { Signal } from "@preact/signals-core"; */
/** @import { ColorAnimation } from "../shared/color/color-animation.mjs" */
import { computed, signal } from "@preact/signals-core";
import { moduleName, sceneFlags, settingNames } from "../consts.mjs";
import { LINE_TYPES } from "../shared/consts.mjs";

/**
 * @typedef {object} TerrainTrigger
 * @property {string} id
 * @property {boolean} enabled
 * @property {keyof typeof import("../consts.mjs").triggerEventModes} mode
 * @property {keyof typeof import("../consts.mjs").triggerElevationRules} elevationRule
 * @property {number} margin
 * @property {boolean} partiallyInside
 * @property {keyof typeof import("../consts.mjs").triggerTargetTokens} targetTokens
 * @property {keyof typeof import("../consts.mjs").triggerActionTypes} actionType
 * @property {string} actionMacroId
 * @property {string} actionCode
 * @property {string} actionEffectId
 * @property {boolean} actionEffectOverlay
 */

/**
 * @typedef {object} TerrainType
 * @property {string} id
 * @property {string} name
 * @property {boolean} usesHeight
 * @property {boolean} isSolid
 * @property {boolean} isAlwaysVisible
 * @property {boolean} textRotation
 * @property {LINE_TYPES} lineType
 * @property {number} lineWidth
 * @property {string} lineColor
 * @property {ColorAnimation | null} lineColorAnimation
 * @property {number} lineOpacity
 * @property {number} lineDashSize
 * @property {number} lineGapSize
 * @property {number} lineDashOffsetAnimation
 * @property {number} lineFadeDistance
 * @property {string} lineFadeColor
 * @property {number} lineFadeOpacity
 * @property {number} fillType
 * @property {string} fillColor
 * @property {ColorAnimation | null} fillColorAnimation
 * @property {number} fillOpacity
 * @property {string} fillTexture
 * @property {{ x: number; y: number; }} fillTextureOffset
 * @property {{ x: number; y: number; }} fillTextureScale
 * @property {{ x: number; y: number; }} fillTextureOffsetAnimation
 * @property {string} textFormat
 * @property {string} elevatedTextFormat
 * @property {string} font
 * @property {number} textSize
 * @property {string} textColor
 * @property {ColorAnimation | null} textColorAnimation
 * @property {number} textOpacity
 * @property {number} textStrokeThickness
 * @property {string} textStrokeColor
 * @property {number} textShadowAmount
 * @property {string} textShadowColor
 * @property {number} textShadowOpacity
 * @property {number | null} defaultHeight
 * @property {number | null} defaultElevation
 * @property {boolean} noClimbingCost
 * @property {TerrainTrigger[]} triggers
 * @property {AutoGenerateWallsConfig} autoGenerateWalls
 * @property {any[]} regionBehaviors
 * @property {Record<string, any>} flags
 */

/**
 * @typedef {object} AutoGenerateWallsConfig
 * @property {boolean} enabled
 * @property {number} move
 * @property {number} light
 * @property {number} sight
 * @property {number} sound
 * @property {number} dir
 * @property {boolean} attenuation
 * @property {boolean} setWallHeightFlags
 */

/**
 * This stores the actual terrain types as per the world settings.
 * @type {Signal<readonly Readonly<TerrainType>[]>}
 */
export const terrainTypes$ = signal([]);
export const terrainTypeMap$ = computed(() => new Map(terrainTypes$.value.map(t => [t.id, t])));

/**
 * If the user has the config window open, this will be updated based on what is in that window.
 * @type {Signal<readonly Readonly<TerrainType>[] | null>}
 */
export const previewTerrainTypes$ = signal(null);

/** This a computed that will return the preview terrain types if they are set, or the world-setting types if not. */
export const terrainTypesWithPreview$ = computed(() => previewTerrainTypes$.value ?? terrainTypes$.value);
export const terrainTypesWithPreviewMap$ = computed(() => new Map(terrainTypesWithPreview$.value.map(t => [t.id, t])));

export function loadTerrainTypes() {
	/** @type {Partial<TerrainType>[]} */
	const terrainTypes = game.settings.get(moduleName, settingNames.terrainTypes);

	// As we're sharing TerrainType instances, freeze them to prevent modification
	terrainTypes$.value = Object.freeze(terrainTypes
		.map(t => Object.freeze({
			...createDefaultTerrainType(t.id),
			...t,
			triggers: (t.triggers ?? []).map(_migrateTrigger)
		})));
}

function _migrateTrigger(trigger) {
	if ("margin" in trigger && "partiallyInside" in trigger) return trigger;
	return {
		...trigger,
		margin: trigger.margin ?? 0,
		partiallyInside: trigger.partiallyInside ?? false
	};
}

/**
 * Creates a new TerrainType object with the default options.
 * @param {TerrainType["id"]} id
 * @returns {TerrainType}
 */
export function createDefaultTerrainType(id = undefined) {
	return {
		id: id ?? foundry.utils.randomID(),
		name: "New Terrain Type",
		usesHeight: true,
		isSolid: true,
		isAlwaysVisible: false,
		textRotation: false,
		lineType: LINE_TYPES.SOLID,
		lineWidth: 4,
		lineColor: "#FF0000",
		lineColorAnimation: null,
		lineOpacity: 0.8,
		lineDashSize: 15,
		lineGapSize: 10,
		lineDashOffsetAnimation: 0,
		lineFadeDistance: 0,
		lineFadeColor: "#FF0000",
		lineFadeOpacity: 0.4,
		fillType: CONST.DRAWING_FILL_TYPES.SOLID,
		fillColor: "#FF0000",
		fillColorAnimation: null,
		fillOpacity: 0.2,
		fillTexture: "",
		fillTextureOffset: { x: 0, y: 0 },
		fillTextureScale: { x: 100, y: 100 },
		fillTextureOffsetAnimation: { x: 0, y: 0 },
		textFormat: "",
		elevatedTextFormat: "",
		font: CONFIG.defaultFontFamily,
		textSize: 48,
		textColor: "#FFFFFF",
		textColorAnimation: null,
		textOpacity: 1,
		textStrokeThickness: 4,
		textStrokeColor: "",
		textShadowAmount: 2,
		textShadowColor: "",
		textShadowOpacity: 1,
		defaultHeight: null,
		defaultElevation: null,
		noClimbingCost: false,
		triggers: [],
		autoGenerateWalls: createDefaultAutoGenerateWalls(),
		regionBehaviors: [],
		flags: {}
	};
}

/** @returns {AutoGenerateWallsConfig} */
export function createDefaultAutoGenerateWalls() {
	return {
		enabled: false,
		move: CONST.WALL_SENSE_TYPES.NORMAL,
		light: CONST.WALL_SENSE_TYPES.NORMAL,
		sight: CONST.WALL_SENSE_TYPES.NORMAL,
		sound: CONST.WALL_SENSE_TYPES.NORMAL,
		dir: CONST.WALL_DIRECTIONS.BOTH,
		attenuation: false,
		setWallHeightFlags: true
	};
}

/** @returns {TerrainTrigger} */
export function createDefaultTrigger() {
	return {
		id: foundry.utils.randomID(),
		enabled: true,
		mode: "ENTER",
		elevationRule: "INSIDE_VOLUME_INCLUSIVE",
		margin: 0.5,
		partiallyInside: true,
		targetTokens: "ALL",
		actionType: "none",
		actionMacroId: "",
		actionCode: "",
		actionEffectId: "",
		actionEffectOverlay: false
	};
}

/**
 * Returns the terrain type for the given ID.
 * @param {string} terrainTypeId
 * @returns {TerrainType | undefined}
 */
export function getTerrainType(terrainTypeId) {
	return terrainTypeMap$.value.get(terrainTypeId);
}

/**
 * Gets a single colour used to represent the given terrain type.
 * @param {TerrainType} terrainType
 * @param {number} defaultColor
 * @returns {number}
 */
export function getTerrainColor(terrainType, defaultColor = 0x00FFFF) {
	// If the terrain type has a fill colour, use that
	if (terrainType?.fillOpacity > 0 && terrainType.fillType !== CONST.DRAWING_FILL_TYPES.NONE)
		return Color.from(terrainType.fillColor);

	// If the terrain type does not have a fill colour but has a border colour, use that
	if (terrainType?.lineWidth > 0 && terrainType.lineOpacity > 0)
		return Color.from(terrainType.lineColor);

	// Otherwise use a default
	return defaultColor;
}

/**
 * Updates the passed scene so that the specified terrainTypeId is either visible or invisible.
 * @param {Scene} scene
 * @param {string} terrainTypeId
 * @param {boolean} [force] Whether the terrain type should be visible or not. Or undefined to toggle.
 */
export async function setSceneTerrainTypeVisible(scene, terrainTypeId, force = undefined) {
	/** @type {string[]} */
	const invisibleSceneTerrainTypes = scene.getFlag(moduleName, sceneFlags.invisibleTerrainTypes) ?? [];

	if ((force === true || force === undefined) && !invisibleSceneTerrainTypes.includes(terrainTypeId))
		await scene.setFlag(moduleName, sceneFlags.invisibleTerrainTypes, [...invisibleSceneTerrainTypes, terrainTypeId]);
	else if ((force === false || force === undefined) && invisibleSceneTerrainTypes.includes(terrainTypeId))
		await scene.setFlag(moduleName, sceneFlags.invisibleTerrainTypes, invisibleSceneTerrainTypes.filter(t => t !== terrainTypeId));
}
