/**
 * Per-terrain-type auto-generated edges.
 *
 * When a terrain type has `autoGenerateWalls.enabled`, every shape of that type
 * gets `foundry.canvas.edges.Edge` instances installed in `canvas.edges` along
 * its boundary. These are runtime-only — never persisted, never visible in the
 * wall layer. Mirrors the lancer-automations tokenBlocksVision pattern.
 */
import { wallHeightModuleName } from "./consts.mjs";
import { allTerrainShapes$ } from "./stores/terrain-manager.mjs";
import { getTerrainType, terrainTypes$ } from "./stores/terrain-types.mjs";
import { toSceneUnits } from "./utils/grid-utils.mjs";

const EDGE_PREFIX = "tht-auto-edge";

let _initialized = false;

/** Stable identity hash for a shape — vertices are frozen so this is reliable. */
function _shapeKey(shape) {
	const verts = shape.polygon.vertices?.map?.(v => `${v.x},${v.y}`).join(";") ?? "";
	return `${shape.elevation}|${shape.height}|${verts}`;
}

function _edgePrefixForShape(shape) {
	return `${EDGE_PREFIX}-${shape.terrainTypeId}-${_shapeKey(shape)}-`;
}

function _addEdgesForShape(shape) {
	if (!canvas?.edges) return;
	const cfg = getTerrainType(shape.terrainTypeId)?.autoGenerateWalls;
	if (!cfg?.enabled) return;

	const useWallHeight = cfg.setWallHeightFlags && game.modules.get(wallHeightModuleName)?.active;
	const wallStub = useWallHeight
		? { document: { flags: { "wall-height": { top: toSceneUnits(shape.elevation + shape.height), bottom: toSceneUnits(shape.elevation) } } } }
		: undefined;

	const prefix = _edgePrefixForShape(shape);
	const edges = [...shape.polygon.edges, ...shape.holes.flatMap(h => h.edges)];
	for (let i = 0; i < edges.length; i++) {
		const e = edges[i];
		const id = `${prefix}${i}`;
		const edge = new foundry.canvas.geometry.edges.Edge(e.p1, e.p2, {
			id,
			type: "wall",
			light: cfg.light,
			sight: cfg.sight,
			sound: cfg.sound,
			move: cfg.move,
			direction: cfg.dir,
			threshold: { light: null, sight: null, sound: null, attenuation: !!cfg.attenuation },
			...(wallStub ? { object: /** @type {any} */ (wallStub) } : {})
		});
		canvas.edges.set(id, edge);
	}
}

function _removeEdgesForShape(shape) {
	if (!canvas?.edges) return;
	const prefix = _edgePrefixForShape(shape);
	const toDelete = [];
	for (const key of canvas.edges.keys()) {
		if (key.startsWith(prefix)) toDelete.push(key);
	}
	for (const key of toDelete) canvas.edges.delete(key);
}

function _clearAll() {
	if (!canvas?.edges) return;
	const toDelete = [];
	for (const key of canvas.edges.keys()) {
		if (key.startsWith(`${EDGE_PREFIX}-`)) toDelete.push(key);
	}
	for (const key of toDelete) canvas.edges.delete(key);
}

function _rebuildAll() {
	if (!canvas?.edges) return;
	_clearAll();
	for (const shape of allTerrainShapes$.value) {
		_addEdgesForShape(shape);
	}
	_refreshPerception();
}

function _refreshPerception() {
	canvas?.perception?.update?.(
		{ refreshEdges: true, refreshVision: true, refreshLighting: true },
		true
	);
}

export function initAutoWallEdges() {
	if (_initialized) return;
	_initialized = true;

	// Per-canvas rebuild: canvas.edges is reset on every scene load.
	Hooks.on("canvasReady", () => _rebuildAll());

	// Granular shape deltas.
	allTerrainShapes$.subscribe({
		add: shapes => {
			if (!canvas?.edges) return;
			for (const shape of shapes) _addEdgesForShape(shape);
			_refreshPerception();
		},
		remove: shapes => {
			if (!canvas?.edges) return;
			for (const shape of shapes) _removeEdgesForShape(shape);
			_refreshPerception();
		}
	});

	// Terrain-type config save (toggle of `enabled` or sense changes) → full rebuild.
	terrainTypes$.subscribe(() => _rebuildAll());
}
