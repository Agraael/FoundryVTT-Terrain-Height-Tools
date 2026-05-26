/** @import { TerrainShape } from "../geometry/terrain-shape.mjs"; */
import { allTerrainShapes$ } from "../stores/terrain-manager.mjs";
import { terrainTypeMap$, terrainTypes$ } from "../stores/terrain-types.mjs";
import { toSceneUnits } from "../utils/grid-utils.mjs";

/**
 * Map of the TerarinShape onto it's associated temporary RegionDocument.
 * @type {Map<TerrainShape, RegionDocument>}
 */
const regions = new Map();

let isSceneReady = false;

export function initSceneRegionAutomation() {
	Hooks.on("canvasReady", () => {
		isSceneReady = true;
		createOrUpdateRegions(allTerrainShapes$.value);
	});

	Hooks.on("canvasTearDown", () => {
		isSceneReady = false;
	});

	allTerrainShapes$.subscribe({
		add: createOrUpdateRegions,
		remove: removeRegions
	});

	// When terrain types change, ensure we update regions (e.g. GM may have added a new behaviour to a terrain type)
	terrainTypes$.subscribe(() => {
		createOrUpdateRegions(allTerrainShapes$.value);
	});

	// Hide THT regions from the region legend to prevent users editing them manually
	Hooks.on("renderRegionLegend", (_regionLegend, element) => {
		for (const region of regions.values()) {
			element.querySelector(`[data-region-id="${region.id}"]`)?.style.setProperty("display", "none");
		}
	});

	// If the user DOES somehow open a THT region's config, then show a warning
	Hooks.on("renderRegionConfig", (regionConfig, element) => {
		if (![...regions.values()].includes(regionConfig.document)) return;
		const warningElement = document.createElement("div");
		warningElement.innerHTML = game.i18n.localize("TERRAINHEIGHTTOOLS.RegionManagedByThtWarning");
		warningElement.style.setProperty("color", "var(--error-color)");
		element.querySelector(".window-content").prepend(warningElement);
	});
}

/** @param {TerrainShape[]} terrainShapes */
function createOrUpdateRegions(terrainShapes) {
	if (!isSceneReady) return;

	for (const terrainShape of terrainShapes) {
		const terrainType = terrainTypeMap$.value.get(terrainShape.terrainTypeId);
		if (!terrainType || !terrainType.regionBehaviors.length) {
			removeRegions([terrainShape]); // If removing the last behavior, ensure we clean up the region
			continue;
		}

		const existing = regions.get(terrainShape);
		const id = existing?.id ?? foundry.utils.randomID();

		const regionDoc = new CONFIG.Region.documentClass({
			_id: id,
			name: `THT Automatic Region (${terrainType.name})`,
			color: terrainType.fillColor,
			shapes: [
				{
					type: "polygon",
					points: terrainShape.polygon.vertices.flatMap(({ x, y }) => [x, y]),
					hole: false
				},
				...terrainShape.holes.map(hole => ({
					type: "polygon",
					points: hole.vertices.flatMap(({ x, y }) => [x, y]),
					hole: true
				}))
			],
			elevation: {
				top: terrainType.usesHeight ? toSceneUnits(terrainShape.top) : null,
				bottom: terrainType.usesHeight ? toSceneUnits(terrainShape.bottom) : null
			},
			behaviors: terrainType.regionBehaviors,
			visibility: CONST.REGION_VISIBILITY.LAYER,
			locked: true
		}, {
			parent: canvas.scene
		});

		canvas.scene.regions.set(id, regionDoc);
		regions.set(terrainShape, regionDoc);
	}
}

/** @param {TerrainShape[]} terrainShapes */
function removeRegions(terrainShapes) {
	if (!isSceneReady) return;

	for (const terrainShape of terrainShapes) {
		const existing = regions.get(terrainShape);
		if (existing) {
			canvas.scene.regions.delete(existing._id);
			regions.delete(terrainShape);
		}
	}
}
