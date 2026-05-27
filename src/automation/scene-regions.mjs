/** @import { TerrainShape } from "../geometry/terrain-shape.mjs"; */
import { moduleName, regionFlags } from "../consts.mjs";
import { allTerrainShapes$ } from "../stores/terrain-manager.mjs";
import { terrainTypeMap$, terrainTypes$ } from "../stores/terrain-types.mjs";
import { distinctBy, groupBy } from "../utils/array-utils.mjs";
import { toSceneUnits } from "../utils/grid-utils.mjs";
import { debug } from "../utils/log.mjs";

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
		change: (_values, newShapes, removedShapes) => createOrUpdateRegions([...newShapes, ...removedShapes])
	});

	// When terrain types change, ensure we update regions (e.g. GM may have added a new behaviour to a terrain type)
	terrainTypes$.subscribe(() => {
		createOrUpdateRegions(allTerrainShapes$.value);
	});

	// Hide THT regions from the region legend to prevent users editing them manually
	Hooks.on("renderRegionLegend", (_regionLegend, element) => {
		for (const region of getThtSceneRegions()) {
			element.querySelector(`[data-region-id="${region.id}"]`)?.style.setProperty("display", "none");
		}
	});

	// If the user DOES somehow open a THT region's config, then show a warning instead
	Hooks.on("renderRegionConfig", (regionConfig, element) => {
		if (!getThtSceneRegions().includes(regionConfig.document)) return;
		[...element.querySelectorAll(".window-content > *")].forEach(e => e.style.setProperty("display", "none"));
		const warningElement = document.createElement("div");
		warningElement.innerHTML = game.i18n.localize("TERRAINHEIGHTTOOLS.RegionManagedByThtWarning");
		warningElement.style.setProperty("color", "var(--error-color)");
		element.querySelector(".window-content").prepend(warningElement);
	});
}

/**
 * Adds/updates/deletes regions. Batch when possible to reduce the number of updates.
 * @param {TerrainShape[]} terrainShapes An array of shapes that have changed (including deleted).
 */
async function createOrUpdateRegions(terrainShapes) {
	if (!isSceneReady || !game.user.isActiveGM) return;

	// One scene region represents all shapes of a certain terrain type, top, and bottom. So, given the changed
	// shapes, work out which regions we need to update and calculate the full shapes for that region.
	// Feels better to have one region per group of shapes, rather than one region per shape? Not sure if it will affect
	// performance by any significant amount though?
	const changedRegions = distinctBy(terrainShapes, s => s.terrainTypeId, s => s.top, s => s.bottom)
		.map(({ terrainTypeId, top, bottom }) => ({ terrainTypeId, top, bottom }));

	/** @type {Map<string, RegionDocument>} */
	const existingRegionsLookup = new Map(getThtSceneRegions().map(r => [
		getMapKey(
			r.flags[moduleName]?.[regionFlags.terrainTypeId],
			r._source.elevation.top, // use ._source otherwise this is Infinity instead of null for boundless regions
			r._source.elevation.bottom
		),
		r
	]));

	const terrainShapesLookup = groupBy(allTerrainShapes$.value, s => {
		const usesHeight = terrainTypeMap$.value.get(s.terrainTypeId)?.usesHeight;
		return getMapKey(s.terrainTypeId, usesHeight ? s.top : null, usesHeight ? s.bottom : null);
	});

	const regionsToCreate = [];
	const regionsToUpdate = [];
	const regionIdsToDelete = [];

	for (const { terrainTypeId, top, bottom } of changedRegions) {
		const mapKey = getMapKey(terrainTypeId, top, bottom);
		const existingRegion = existingRegionsLookup.get(mapKey);
		const terrainShapes = terrainShapesLookup.get(mapKey);
		const terrainType = terrainTypeMap$.value.get(terrainTypeId);

		const isRegionNeeded = terrainShapes?.length > 0 && terrainType?.regionBehaviors.length > 0;
		if (!isRegionNeeded && existingRegion) {
			debug(`Deleting unnessecary scene region ${terrainType?.name} at ${bottom}->${top} (region '${existingRegion._id}')`);
			regionIdsToDelete.push(existingRegion._id);
		}
		if (!isRegionNeeded)
			continue;

		const regionData = {
			...existingRegion ? { _id: existingRegion._id } : {},
			name: `THT Automatic Region (${terrainType.name})`,
			color: terrainType.fillColor,
			shapes: terrainShapes.flatMap(terrainShape => [
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
			]),
			elevation: {
				top: terrainType.usesHeight ? toSceneUnits(top) : null,
				bottom: terrainType.usesHeight ? toSceneUnits(bottom) : null
			},
			behaviors: terrainType.regionBehaviors,
			visibility: CONST.REGION_VISIBILITY.LAYER,
			locked: true,
			flags: {
				[moduleName]: {
					[regionFlags.terrainTypeId]: terrainType.id
				}
			}
		};

		if (existingRegion) {
			debug(`Updating scene region ${terrainType.name} at ${bottom}->${top} (region '${regionData._id}')`);
			regionsToUpdate.push(regionData);
		} else {
			debug(`Creating scene region ${terrainType.name} at ${bottom}->${top}`);
			regionsToCreate.push(regionData);
		}
	}

	await Promise.all([
		regionsToCreate.length ? canvas.scene.createEmbeddedDocuments("Region", regionsToCreate) : Promise.resolve(),
		// Updates need to use `recursive: false` because the behaviors is an embedded collection, and so if recursive
		// is true (like default), then when deleting behaviors from a terrain type they don't deleted from the regions
		regionsToUpdate.length ? canvas.scene.updateEmbeddedDocuments("Region", regionsToUpdate, { recursive: false }) : Promise.resolve(),
		regionIdsToDelete.length ? canvas.scene.deleteEmbeddedDocuments("Region", regionIdsToDelete) : Promise.resolve()
	]);
}

/** Returns all regions in the scene that are handled by THT. */
function getThtSceneRegions() {
	return canvas.scene.regions.filter(r => r.flags[moduleName]?.[regionFlags.terrainTypeId]);
}

/**
 * @param {string} terrainTypeId
 * @param {number} top
 * @param {number} bottom
 */
function getMapKey(terrainTypeId, top, bottom) {
	return `${terrainTypeId}|${top}|${bottom}`;
}
