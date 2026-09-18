import { terrainAboveLowerTokens$ } from "../config/settings.mjs";
import { getShapesByBounds } from "../stores/terrain-manager.mjs";
import { getTerrainType } from "../stores/terrain-types.mjs";
import { getSpacesUnderToken, toSceneUnits } from "../utils/grid-utils.mjs";

let terrainVersion = 0;

const sortKeyCache = new WeakMap();

export function bumpTerrainVersion() {
	terrainVersion++;
}

export function applyTokenTerrainSort(token) {
	const mesh = token?.mesh;
	const tokenDoc = token?.document;
	if (!mesh || !tokenDoc) return;

	const elevation = tokenDoc.elevation;

	if (!terrainAboveLowerTokens$.value) {
		sortKeyCache.delete(token);
		setMeshElevation(mesh, elevation);
		return;
	}

	const rect = artRect(token);
	const cacheKey = rect
		? `${terrainVersion}|${elevation}|${Math.round(rect.x)}|${Math.round(rect.y)}|${Math.round(rect.width)}|${Math.round(rect.height)}|${tokenDoc.x}|${tokenDoc.y}`
		: null;

	const cached = sortKeyCache.get(token);
	if (cacheKey !== null && cached?.key === cacheKey) {
		setMeshElevation(mesh, cached.value);
		return;
	}

	const value = Math.max(elevation, tallestBeside(token, rect));
	if (cacheKey !== null) sortKeyCache.set(token, { key: cacheKey, value });
	setMeshElevation(mesh, value);
}

export function refreshAllTokenTerrainSort() {
	bumpTerrainVersion();
	for (const token of canvas.tokens?.placeables ?? [])
		applyTokenTerrainSort(token);
	for (const token of canvas.tokens?.preview?.children ?? [])
		applyTokenTerrainSort(token);
}

function setMeshElevation(mesh, value) {
	if (mesh.elevation === value) return;
	mesh.elevation = value;
	if (canvas.primary) canvas.primary.sortDirty = true;
}

function artRect(token) {
	const mesh = token.mesh;
	if (!(mesh.width > 0) || !(mesh.height > 0)) return null;
	return new PIXI.Rectangle(
		mesh.position.x - (mesh.width / 2),
		mesh.position.y - (mesh.height / 2),
		mesh.width,
		mesh.height);
}

function tallestBeside(token, rect) {
	if (!rect) return -Infinity;

	const shapes = getShapesByBounds(rect);
	if (!shapes.length) return -Infinity;

	const tokenDoc = token.document;
	const { width, height, hexagonalShape } = tokenDoc;
	const { type: gridType, size: gridSize } = canvas.grid;
	const spaces = getSpacesUnderToken(tokenDoc.x, tokenDoc.y, width, height, gridType, gridSize, hexagonalShape);

	let tallest = -Infinity;
	for (const shape of shapes) {
		if (!getTerrainType(shape.terrainTypeId)?.usesHeight) continue;
		if (spaces.some(space => shape.containsPoint(space.x, space.y))) continue;
		tallest = Math.max(tallest, toSceneUnits(shape.top));
	}
	return tallest;
}
