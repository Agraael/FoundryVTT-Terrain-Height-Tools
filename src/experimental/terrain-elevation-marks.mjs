/** @import { Polygon } from "../geometry/polygon.mjs" */
/** @import { LineSegment } from "../geometry/line-segment.mjs" */
/** @import { TerrainShapeGraphic } from "../layers/terrain-height-graphics/terrain-shape-graphic.mjs" */
import { union as polygonUnion } from "polygon-clipping";
import { moduleName } from "../consts.mjs";
import { allTerrainShapes$ } from "../stores/terrain-manager.mjs";
import { terrainTypesWithPreviewMap$ } from "../stores/terrain-types.mjs";

/**
 * EXPERIMENTAL. Marks on terrain boundaries that read as height: shading cast on the ground beside a drop, and
 * contours lit from one side. Drawn per edge, against whatever terrain is butted up against that edge.
 *
 * Touchpoints: `TerrainShapeGraphic` owns a `ShapeElevationMarks`, the graphics layer calls `refreshElevationMarks`,
 * `registerSettings` calls `registerElevationMarkSettings`.
 */

const settingNames = {
	sunAngle: "terrainExtrusionSunAngle",
	dropBand: "terrainDropBand",
	dropBandReach: "terrainDropBandReach",
	dropBandColor: "terrainDropBandColor",
	dropBandOpacity: "terrainDropBandOpacity",
	tanaka: "terrainTanaka",
	tanakaTint: "terrainTanakaTint",
	tanakaTexture: "terrainTanakaTexture",
	tanakaWidth: "terrainTanakaWidth",
	tanakaOpacity: "terrainTanakaOpacity",
	tanakaLight: "terrainTanakaLight",
	tanakaDark: "terrainTanakaDark"
};

/** Drawing sizes are authored against this grid and scaled to the scene's. */
const baseGridSize = 100;

/** How far past the mark's own width a corner may run before it is cut back. */
const miterLimit = 1.5;

const dropBandSpans = 6;
const dropBandMinSteps = 8;
const dropBandMaxSteps = 32;
const dropBandMaxFall = 4;

/**
 * @typedef {Object} MarkContext What surrounds a shape, used to work out how far each of its edges actually falls.
 * @property {Map<object, { top: number; container: object | null }>} supports Each shape mapped to what it stands in.
 * @property {Set<string>} shapePolygonKeys Polygon key of every shape on the scene.
 * @property {{ shape: object; top: number; elevation: number }[]} solids Every shape that has height.
 * @property {{ vertices: object[]; sides: object[] }[]} outline Every solid merged into one set of rings.
 */

/**
 * @typedef {Object} Miter Where one edge's shading stops so the next one's can start.
 * @property {number} x
 * @property {number} y
 * @property {number} scale How much further along the join than straight out, so the two meet flush.
 */

export function registerElevationMarkSettings() {
	const redraw = () => canvas.terrainHeightGraphicsLayer?._redrawAll();

	game.settings.register(moduleName, settingNames.dropBand, {
		name: "Experimental: drop shading",
		hint: "Shades the ground beside terrain, reaching further the further it falls.",
		scope: "world",
		type: Boolean,
		default: false,
		config: true,
		onChange: redraw
	});

	game.settings.register(moduleName, settingNames.dropBandReach, {
		name: "Experimental: drop shading reach",
		hint: "Pixels of shading per unit of height, on a grid of 100, scaled to the scene's grid.",
		scope: "world",
		type: Number,
		range: { min: 2, max: 60, step: 2 },
		default: 12,
		config: true,
		onChange: redraw
	});

	game.settings.register(moduleName, settingNames.dropBandColor, {
		name: "Experimental: drop shading colour",
		hint: "Colour of the shading cast beside a drop.",
		scope: "world",
		type: new foundry.data.fields.ColorField({ required: true, nullable: false, initial: "#000000" }),
		default: "#000000",
		config: true,
		onChange: redraw
	});

	game.settings.register(moduleName, settingNames.dropBandOpacity, {
		name: "Experimental: drop shading strength",
		hint: "Opacity of the shading where it meets the drop.",
		scope: "world",
		type: Number,
		range: { min: 0.05, max: 1, step: 0.05 },
		default: 0.3,
		config: true,
		onChange: redraw
	});

	game.settings.register(moduleName, settingNames.tanaka, {
		name: "Experimental: Tanaka contours",
		hint: "Draws each drop as a highlight where it faces the light and a shadow where it faces away.",
		scope: "world",
		type: Boolean,
		default: false,
		config: true,
		onChange: redraw
	});

	game.settings.register(moduleName, settingNames.tanakaWidth, {
		name: "Experimental: Tanaka contour width",
		hint: "Widest stroke, in pixels on a grid of 100, scaled to the scene's grid.",
		scope: "world",
		type: Number,
		range: { min: 1, max: 20, step: 1 },
		default: 6,
		config: true,
		onChange: redraw
	});

	game.settings.register(moduleName, settingNames.tanakaOpacity, {
		name: "Experimental: Tanaka contour strength",
		hint: "Opacity of the strokes where they face the light most directly.",
		scope: "world",
		type: Number,
		range: { min: 0.05, max: 1, step: 0.05 },
		default: 0.8,
		config: true,
		onChange: redraw
	});

	game.settings.register(moduleName, settingNames.tanakaTexture, {
		name: "Experimental: Tanaka from fill pattern",
		hint: "Marks a pattern-filled type's drops with its own texture, tinted lit or shadowed.",
		scope: "world",
		type: Boolean,
		default: false,
		config: true,
		onChange: redraw
	});

	game.settings.register(moduleName, settingNames.tanakaTint, {
		name: "Experimental: Tanaka from terrain colour",
		hint: "Shades each terrain type's own fill colour instead of the fixed highlight and shadow colours.",
		scope: "world",
		type: Boolean,
		default: false,
		config: true,
		onChange: redraw
	});

	game.settings.register(moduleName, settingNames.tanakaLight, {
		name: "Experimental: Tanaka highlight colour",
		hint: "Colour used where a drop faces the light.",
		scope: "world",
		type: new foundry.data.fields.ColorField({ required: true, nullable: false, initial: "#ffffff" }),
		default: "#ffffff",
		config: true,
		onChange: redraw
	});

	game.settings.register(moduleName, settingNames.tanakaDark, {
		name: "Experimental: Tanaka shadow colour",
		hint: "Colour used where a drop faces away from the light.",
		scope: "world",
		type: new foundry.data.fields.ColorField({ required: true, nullable: false, initial: "#0e1014" }),
		default: "#0e1014",
		config: true,
		onChange: redraw
	});

	game.settings.register(moduleName, settingNames.sunAngle, {
		name: "Experimental: light angle",
		hint: "Compass bearing the light comes from, used by both marks.",
		scope: "world",
		type: Number,
		range: { min: 0, max: 345, step: 15 },
		default: 225,
		config: true,
		onChange: redraw
	});
}

/** Direction the light travels, from the configured compass bearing it comes from. */
function getSunDirection() {
	// Anything but a number here NaNs every mark
	const storedBearing = Number(game.settings.get(moduleName, settingNames.sunAngle));
	const bearing = Number.isFinite(storedBearing) ? storedBearing : 225;
	const radians = (bearing * Math.PI) / 180;
	return { x: -Math.sin(radians), y: Math.cos(radians) };
}

export function isDropBandEnabled() {
	return !!game.settings.get(moduleName, settingNames.dropBand);
}

export function isTanakaEnabled() {
	return !!game.settings.get(moduleName, settingNames.tanaka);
}

/**
 * Identifies a polygon by position alone. Vertices are sorted, so a solid ring matches the hole of the same outline.
 * @param {Polygon} polygon
 */
function polygonKey(polygon) {
	return polygon.vertices
		.map(({ x, y }) => `${Math.round(x)},${Math.round(y)}`)
		.sort((first, second) => first.localeCompare(second))
		.join("|");
}

/** The elevation marks of a single terrain shape. One of these is owned by each `TerrainShapeGraphic`. */
export class ShapeElevationMarks {

	/** @type {TerrainShapeGraphic} */
	#graphic;

	/** @type {PIXI.DisplayObject[]} */
	#parts = [];

	/** @type {MarkContext | undefined} */
	#context;

	/** @type {string | undefined} */
	#signature;

	#supportTop;

	/** @type {{ marks: PIXI.Graphics; quads: object[]; texture: PIXI.Texture | null; drift: object | null } | undefined} */
	#tanaka;

	#ready = false;

	/** @param {TerrainShapeGraphic} graphic */
	constructor(graphic) {
		this.#graphic = graphic;
		this.#supportTop = graphic.shape.elevation;
	}

	/** The graphic's main draw is async, so it calls this once it has finished. */
	ready() {
		this.#ready = true;
		this.draw();
	}

	/**
	 * Gives this shape its surroundings. Redraws only when the signature changes.
	 * @param {MarkContext} context
	 */
	setContext(context) {
		const { shape } = this.#graphic;

		const supportTop = supportTopOf(shape, context);

		const signature = `${supportTop}|`
			+ shape.holes.map(hole => context.shapePolygonKeys.has(polygonKey(hole)) ? "1" : "0").join("")
			+ `|${neighbourKey(shape, context)}`;

		if (this.#signature === signature) return;

		this.#signature = signature;
		this.#context = context;
		this.#supportTop = supportTop;

		if (!this.#ready) return;

		this.draw();
		this.#graphic.refreshCache();
	}

	destroy() {
		this.#tanaka = undefined;
		for (const part of this.#parts) {
			part.parent?.removeChild(part);
			if (!part.destroyed) part.destroy({ children: true });
		}
		this.#parts = [];
	}

	/** Redraws everything this shape contributes. */
	draw() {
		const graphic = this.#graphic;
		const { shape, terrainType } = graphic;

		// The caller re-enables the cache
		graphic.setCached(false);
		this.destroy();

		if (!terrainType?.usesHeight || shape.height <= 0) return;

		const insetRings = this.#stepOutlineClearOfNeighbours();
		if (!isDropBandEnabled() && !isTanakaEnabled()) return;

		const segments = this.#contourSegments(this.#drops(insetRings));

		this.#drawDropBand(segments);
		this.#drawTanaka(segments);
	}

	/**
	 * Boundary facing open ground comes from the merged outline, so a corner two shapes share resolves once on that
	 * ring. Steps down onto lower terrain are interior to the union and keep the shape's own edges.
	 */
	#contourSegments(drops) {
		const { shape } = this.#graphic;
		const segments = [];

		for (const ring of this.#context?.outline ?? []) {
			const { vertices, sides } = ring;

			for (let index = 0; index < sides.length; index++) {
				if (sides[index].owner !== shape) continue;

				segments.push({
					from: vertices[index],
					to: vertices[(index + 1) % vertices.length],
					side: sides[index],
					previous: sides[(index - 1 + sides.length) % sides.length],
					next: sides[(index + 1) % sides.length]
				});
			}
		}

		for (const drop of drops) {
			if (!drop.interior) continue;

			segments.push({
				from: drop.edge.p1,
				to: drop.edge.p2,
				side: drop,
				previous: drop.previous,
				next: drop.next
			});
		}

		return segments;
	}

	/**
	 * Steps the outline inward wherever a taller neighbour lays a contour over the shared edge, so the border sits
	 * beyond that contour rather than under it. Edges with nothing taller beside them do not move.
	 * @returns {{ x: number; y: number }[][] | null} Stepped vertices per ring, or null when nothing stepped.
	 */
	#stepOutlineClearOfNeighbours() {
		const graphic = this.#graphic;
		const gridScale = canvas.grid.size / baseGridSize;
		const widest = (game.settings.get(moduleName, settingNames.tanakaWidth) ?? 0) * gridScale;

		if (!isTanakaEnabled() || !this.#context || widest <= 0) {
			graphic._applyStyle();
			return null;
		}

		const { shape } = graphic;
		const { x: sunX, y: sunY } = getSunDirection();
		const probeStep = canvas.grid.size * 0.25;

		let stepped = false;
		let anyHidden = false;

		const rings = [shape.polygon, ...shape.holes].map(ring => {
			const sides = ring.edges.map(edge => {
				const { p1, p2 } = edge;
				const edgeX = p2.x - p1.x, edgeY = p2.y - p1.y;
				const edgeLength = Math.hypot(edgeX, edgeY) || 1;
				const normalX = edgeY / edgeLength, normalY = -edgeX / edgeLength;

				const taller = tallestAgainst(
					((p1.x + p2.x) / 2) + (normalX * probeStep),
					((p1.y + p2.y) / 2) + (normalY * probeStep),
					shape.top,
					this.#context);

				let inset = 0;
				let border = true;

				if (taller.highest > shape.top) {
					// The same width the neighbour lays on this edge, so the step clears it exactly
					const lean = Math.min(1, Math.abs((normalX * sunX) + (normalY * sunY)));
					const width = widest * (0.5 + (0.5 * lean)) * (Math.min(3, taller.highest - shape.top) / 3);

					if (width > 0.2) {
						inset = width;
						stepped = true;

						// One material either side, so a border here would only be a second line beside the contour
						border = taller.shape?.terrainTypeId !== shape.terrainTypeId;
					}
				}

				return { normalX, normalY, inset, border };
			});

			if (sides.some(side => !side.border)) anyHidden = true;

			return { vertices: insetRing(ring.vertices, sides), hidden: sides.map(side => !side.border) };
		});

		if (!stepped) {
			graphic._applyStyle();
			return null;
		}

		const fillPaths = rings.map(ring => toPathCommands(ring.vertices));
		const strokePaths = anyHidden ? rings.map(ring => toPathCommands(ring.vertices, ring.hidden)) : null;

		graphic._applyStyle(fillPaths[0], fillPaths.slice(1), strokePaths?.[0], strokePaths?.slice(1));
		return rings.map(ring => ring.vertices);
	}

	/**
	 * Every edge where the ground falls away, with how far it falls and which edges it sits between. The fall is
	 * measured against whatever terrain is butted against the edge, so an edge with an equal neighbour drops nothing
	 * and is left out.
	 * @param {{ x: number; y: number }[][] | null} insetRings Stepped vertices per ring, when the outline moved.
	 * @returns {{ edge: LineSegment; normalX: number; normalY: number; fall: number; interior: boolean }[]}
	 */
	#drops(insetRings) {
		const { shape } = this.#graphic;
		const { top } = shape;
		const probeStep = canvas.grid.size * 0.25;

		const rings = [shape.polygon, ...shape.holes];

		const drops = [];

		for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
			const polygon = rings[ringIndex];

			// Stepped back wherever a taller neighbour marks the edge
			const drawnVertices = insetRings?.[ringIndex];
			const sides = [];

			for (let edgeIndex = 0; edgeIndex < polygon.edges.length; edgeIndex++) {
				const edge = polygon.edges[edgeIndex];
				const { p1, p2 } = edge;
				const edgeX = p2.x - p1.x, edgeY = p2.y - p1.y;
				const edgeLength = Math.hypot(edgeX, edgeY);
				if (edgeLength < 1e-6) continue;

				// Away from the terrain: outwards on the perimeter, into the gap on a hole
				const normalX = edgeY / edgeLength, normalY = -edgeX / edgeLength;

				// Probed on the true edge, so the step back cannot walk the sample into the wrong cell
				const probeX = ((p1.x + p2.x) / 2) + (normalX * probeStep);
				const probeY = ((p1.y + p2.y) / 2) + (normalY * probeStep);

				const ground = groundAgainst(probeX, probeY, this.#supportTop, this.#context);

				const drawnEdge = drawnVertices
					? { p1: drawnVertices[edgeIndex], p2: drawnVertices[(edgeIndex + 1) % drawnVertices.length] }
					: edge;

				// Any terrain beside the edge buries it in the merged outline, whatever height that terrain reaches
				const beside = ownerAt(probeX, probeY, this.#context?.solids ?? []);
				const interior = !!beside && beside.shape !== shape;

				sides.push({ edge: drawnEdge, normalX, normalY, fall: top - ground, interior });
			}

			for (let index = 0; index < sides.length; index++) {
				const side = sides[index];
				if (side.fall <= 0) continue;

				const previous = sides[(index - 1 + sides.length) % sides.length];
				const next = sides[(index + 1) % sides.length];

				drops.push({
					edge: side.edge,
					normalX: side.normalX,
					normalY: side.normalY,
					fall: side.fall,
					interior: side.interior,
					previous,
					next
				});
			}
		}

		return drops;
	}

	/** Shades the ground beside a drop, reaching further out the further it falls. Paints nothing on the terrain. */
	#drawDropBand(segments) {
		if (!isDropBandEnabled() || segments.length === 0) return;

		const reachPerUnitAtBase = game.settings.get(moduleName, settingNames.dropBandReach) ?? 0;
		const reachPerUnit = reachPerUnitAtBase * (canvas.grid.size / baseGridSize);
		if (reachPerUnit <= 0) return;

		const { x: sunX, y: sunY } = getSunDirection();

		const bandColor = Color.from(game.settings.get(moduleName, settingNames.dropBandColor) ?? "#000000");
		const bandOpacity = game.settings.get(moduleName, settingNames.dropBandOpacity) ?? 0.3;

		const band = new PIXI.Graphics();
		band.zIndex = -1;

		// The side the light travels towards gets the most
		const peakOf = side => {
			if (!(side?.fall > 0)) return 0;

			const shadowed = Math.max(0, (side.normalX * sunX) + (side.normalY * sunY));
			return bandOpacity * (0.35 + (0.65 * shadowed));
		};

		for (const { from, to, side, previous, next } of segments) {
			const peak = peakOf(side);
			if (peak <= 0) continue;

			const previousPeak = peakOf(previous);
			const nextPeak = peakOf(next);

			// One opacity per corner, or a lit edge meeting a shadowed one creases along the join
			const startPeak = previousPeak > 0 ? (peak + previousPeak) / 2 : peak;
			const endPeak = nextPeak > 0 ? (peak + nextPeak) / 2 : peak;

			// A neighbour that shades nothing has no join to share, so this end squares off instead of shearing
			const start = miterBetween(previousPeak > 0 ? previous : side, side);
			const end = miterBetween(nextPeak > 0 ? next : side, side);

			const reach = reachPerUnit * Math.min(dropBandMaxFall, side.fall);

			// Depth at which two joins leaning towards each other run out of edge and the strip turns inside out
			const edgeX = to.x - from.x, edgeY = to.y - from.y;
			const edgeLength = Math.hypot(edgeX, edgeY) || 1;
			const closing = ((((start.x * start.scale) - (end.x * end.scale)) * edgeX)
				+ (((start.y * start.scale) - (end.y * end.scale)) * edgeY)) / edgeLength;
			const foldDepth = closing > 1e-6 ? edgeLength / closing : Infinity;

			// A step every couple of pixels, or the falloff reads as stripes
			const steps = Math.max(dropBandMinSteps, Math.min(dropBandMaxSteps, Math.round(reach / 2)));

			// Only a strip whose corners differ needs splitting along its length
			const cornersDiffer = Math.abs(startPeak - peak) > 0.004 || Math.abs(endPeak - peak) > 0.004;
			const spans = cornersDiffer ? dropBandSpans : 1;

			const peakAlong = along => along < 0.5
				? startPeak + ((peak - startPeak) * along * 2)
				: peak + ((endPeak - peak) * (along - 0.5) * 2);

			const pointAt = (along, depth) => {
				const fromX = from.x + (start.x * depth * start.scale);
				const fromY = from.y + (start.y * depth * start.scale);
				const toX = to.x + (end.x * depth * end.scale);
				const toY = to.y + (end.y * depth * end.scale);
				return { x: fromX + ((toX - fromX) * along), y: fromY + ((toY - fromY) * along) };
			};

			// Side by side, not stacked: stacking divides the opacity by the step count and a faint side rounds
			// away in 8 bits
			for (let step = 1; step <= steps; step++) {
				const inner = (reach * (step - 1)) / steps;
				if (inner >= foldDepth) break;

				const fade = 1 - ((step - 0.5) / steps);
				const outer = Math.min((reach * step) / steps, foldDepth);

				for (let span = 0; span < spans; span++) {
					const spanFrom = span / spans;
					const spanTo = (span + 1) / spans;
					const alpha = peakAlong((spanFrom + spanTo) / 2) * fade;
					if (!(alpha > 0.002)) continue;

					const innerFrom = pointAt(spanFrom, inner), innerTo = pointAt(spanTo, inner);
					const outerTo = pointAt(spanTo, outer), outerFrom = pointAt(spanFrom, outer);

					band.beginFill(bandColor, alpha);
					band.drawPolygon([
						innerFrom.x, innerFrom.y,
						innerTo.x, innerTo.y,
						outerTo.x, outerTo.y,
						outerFrom.x, outerFrom.y
					]);
					band.endFill();
				}
			}
		}

		// Outside the content, because it lands beyond the shape it belongs to
		this.#graphic.addChild(band);
		this.#parts.push(band);
	}

	/**
	 * Draws each drop as a lit or shaded mark rather than one flat outline, weighted by how squarely the edge turns
	 * into the light and by how far it falls.
	 */
	#drawTanaka(segments) {
		if (!isTanakaEnabled() || segments.length === 0) return;

		const widestAtBase = game.settings.get(moduleName, settingNames.tanakaWidth) ?? 0;
		const widest = widestAtBase * (canvas.grid.size / baseGridSize);
		if (widest <= 0) return;

		const terrainType = this.#graphic.terrainType;
		const strength = game.settings.get(moduleName, settingNames.tanakaOpacity) ?? 0.8;

		const tintsFromType = !!game.settings.get(moduleName, settingNames.tanakaTint) && terrainType?.fillColor;

		const lightColor = tintsFromType
			? blendColor(Color.from(terrainType.fillColor), 1, 0.68)
			: Color.from(game.settings.get(moduleName, settingNames.tanakaLight) ?? "#ffffff");

		const darkColor = tintsFromType
			? blendColor(Color.from(terrainType.fillColor), 0, 0.72)
			: Color.from(game.settings.get(moduleName, settingNames.tanakaDark) ?? "#0e1014");

		const { x: sunX, y: sunY } = getSunDirection();

		const usesTexture = !!game.settings.get(moduleName, settingNames.tanakaTexture)
			&& terrainType?.fillType === CONST.DRAWING_FILL_TYPES.PATTERN
			&& !!this.#graphic._fillTexture;

		const marks = new PIXI.Graphics();

		// Between the type's fill and its outline, so the outline stays on top
		marks.zIndex = 0.9;

		const widthOf = side => {
			if (!(side?.fall > 0)) return 0;

			// Floored at half, or an edge lying across the light goes thin and faint at once
			const lean = Math.min(1, Math.abs((side.normalX * sunX) + (side.normalY * sunY)));
			const width = widest * (0.5 + (0.5 * lean)) * (Math.min(3, side.fall) / 3);

			return width > 0.2 ? width : 0;
		};

		// Baked once, so an animated pattern can re-emit them each frame without redoing the geometry
		const quads = [];

		for (const { from, to, side, previous, next } of segments) {
			const width = widthOf(side);
			if (width <= 0) continue;

			const previousWidth = widthOf(previous);
			const nextWidth = widthOf(next);

			// Each edge offset by its own width, so a mark keeps its weight into a corner instead of meeting its
			// neighbour at an average. A neighbour with no mark takes zero and the corner slides along it
			const startOut = offsetCorner(previous, previousWidth, side, width);
			const endOut = offsetCorner(next, nextWidth, side, width);

			const facing = -((side.normalX * sunX) + (side.normalY * sunY));
			const lean = Math.min(1, Math.abs(facing));

			quads.push({
				shade: facing >= 0 ? lightColor : darkColor,
				alpha: strength * (0.55 + (0.45 * lean)),
				// A quad rather than a stroke, so the ends run along the join and neighbours tile like the band
				points: [
					from.x, from.y,
					to.x, to.y,
					to.x + endOut.x, to.y + endOut.y,
					from.x + startOut.x, from.y + startOut.y
				]
			});
		}

		this.#tanaka = {
			marks,
			quads,
			texture: usesTexture ? this.#graphic._fillTexture : null,
			scaleX: (terrainType?.fillTextureScale?.x ?? 100) / 100,
			scaleY: (terrainType?.fillTextureScale?.y ?? 100) / 100,
			offsetX: terrainType?.fillTextureOffset?.x ?? 0,
			offsetY: terrainType?.fillTextureOffset?.y ?? 0,
			drift: usesTexture ? terrainType?.fillTextureOffsetAnimation ?? null : null
		};

		this.#paintTanaka();
		this.#parts.push(this.#graphic._addToContent(marks));
	}

	/** Re-emits the marks. Cheap enough per frame because the geometry is already worked out. */
	#paintTanaka() {
		const baked = this.#tanaka;
		if (!baked) return;

		const { marks, quads, texture } = baked;
		marks.clear();

		let driftX = 0, driftY = 0;
		if (baked.drift) {
			const seconds = Date.now() / 1000;
			driftX = (seconds * (baked.drift.x ?? 0)) % (texture?.width || 1);
			driftY = (seconds * (baked.drift.y ?? 0)) % (texture?.height || 1);
		}

		for (const { shade, alpha, points } of quads) {
			if (texture) {
				marks.beginTextureFill({
					texture,
					color: shade,
					alpha,
					matrix: new PIXI.Matrix(baked.scaleX, 0, 0, baked.scaleY,
						baked.offsetX + driftX, baked.offsetY + driftY)
				});
			} else {
				marks.beginFill(shade, alpha);
			}

			marks.drawPolygon(points);
			marks.endFill();
		}
	}

	/** Called from the graphic's ticker while its terrain type animates. */
	tick() {
		if (this.#tanaka?.drift) this.#paintTanaka();
	}

}

/**
 * Works out what surrounds every shape and hands it to each graphic.
 * @param {TerrainShapeGraphic[]} graphics
 */
export function refreshElevationMarks(graphics) {
	if (!isDropBandEnabled() && !isTanakaEnabled()) return;

	const shapes = allTerrainShapes$.value;

	/** @type {Set<string>} */
	const shapePolygonKeys = new Set();
	for (const shape of shapes)
		shapePolygonKeys.add(polygonKey(shape.polygon));

	const solids = shapes
		.filter(shape => shape.height > 0
			&& terrainTypesWithPreviewMap$.value.get(shape.terrainTypeId)?.usesHeight)
		.map(shape => ({ shape, top: shape.top, elevation: shape.elevation }));

	const context = { supports: buildSupports(shapes), shapePolygonKeys, solids };
	context.outline = buildOutline(solids, context);

	for (const graphic of graphics)
		graphic._setElevationMarks(context);
}

/**
 * The tallest solid covering a point.
 * @param {number} x
 * @param {number} y
 * @param {MarkContext["solids"]} solids
 */
function ownerAt(x, y, solids) {
	let tallest = null;

	for (const solid of solids)
		if ((!tallest || solid.top > tallest.top) && solid.shape.containsPoint(x, y)) tallest = solid;

	return tallest;
}

/**
 * The outline of everything solid, merged into one set of rings. A boundary two shapes share falls inside the union
 * and disappears, leaving a single corner to resolve where their edges meet.
 * @param {MarkContext["solids"]} solids
 * @param {MarkContext} context
 * @returns {MarkContext["outline"]}
 */
function buildOutline(solids, context) {
	if (solids.length === 0) return [];

	const geometries = solids.map(solid => [
		solid.shape.polygon.vertices.map(({ x, y }) => [x, y]),
		...solid.shape.holes.map(hole => hole.vertices.map(({ x, y }) => [x, y]))
	]);

	let merged;
	try {
		merged = polygonUnion(geometries[0], ...geometries.slice(1));
	} catch {
		return [];
	}

	const probeStep = canvas.grid.size * 0.25;
	const rings = [];

	for (const polygon of merged)
		for (const ring of polygon) {
			const vertices = ring.map(([x, y]) => ({ x, y }));

			// polygon-clipping closes its rings by repeating the first point
			const first = vertices[0], last = vertices.at(-1);
			if (vertices.length > 1 && Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6)
				vertices.pop();

			if (vertices.length < 3) continue;

			const sides = vertices.map((from, index) => {
				const to = vertices[(index + 1) % vertices.length];
				const edgeX = to.x - from.x, edgeY = to.y - from.y;
				const edgeLength = Math.hypot(edgeX, edgeY) || 1;

				let normalX = edgeY / edgeLength, normalY = -edgeX / edgeLength;
				const midX = (from.x + to.x) / 2, midY = (from.y + to.y) / 2;

				// Winding is whatever the union produced, so the solid side is found rather than assumed
				let owner = ownerAt(midX - (normalX * probeStep), midY - (normalY * probeStep), solids);
				if (!owner) {
					normalX = -normalX;
					normalY = -normalY;
					owner = ownerAt(midX - (normalX * probeStep), midY - (normalY * probeStep), solids);
				}

				if (!owner) return { normalX, normalY, owner: null, fall: 0 };

				const ground = groundAgainst(
					midX + (normalX * probeStep),
					midY + (normalY * probeStep),
					supportTopOf(owner.shape, context),
					context);

				return { normalX, normalY, owner: owner.shape, fall: owner.top - ground };
			});

			rings.push({ vertices, sides });
		}

	return rings;
}

/**
 * The highest terrain standing over a point, or `top` when nothing there is taller.
 * @param {number} x
 * @param {number} y
 * @param {number} top
 * @param {MarkContext} context
 */
function tallestAgainst(x, y, top, context) {
	let highest = top;
	let shape = null;

	for (const solid of context.solids) {
		if (solid.top <= highest) continue;
		if (solid.shape.containsPoint(x, y)) {
			highest = solid.top;
			shape = solid.shape;
		}
	}

	return { highest, shape };
}

/**
 * Where two edges offset outward by their own distances meet. Equal distances give the bisector; a distance of zero
 * on one side slides the corner along that edge and leaves it in place.
 * @param {{ normalX: number; normalY: number }} first
 * @param {number} firstBy
 * @param {{ normalX: number; normalY: number }} second
 * @param {number} secondBy
 */
function offsetCorner(first, firstBy, second, secondBy) {
	const determinant = (first.normalX * second.normalY) - (first.normalY * second.normalX);

	// Edges doubling back on each other have no usable intersection
	if (Math.abs(determinant) < 1e-6) {
		const widest = Math.max(firstBy, secondBy);
		return { x: second.normalX * widest, y: second.normalY * widest };
	}

	const offsetX = ((firstBy * second.normalY) - (first.normalY * secondBy)) / determinant;
	const offsetY = ((first.normalX * secondBy) - (firstBy * second.normalX)) / determinant;

	// A corner turning back on itself runs a long way along the bisector and reads as a spike
	const distance = Math.hypot(offsetX, offsetY);
	const maxDistance = miterLimit * Math.max(firstBy, secondBy);
	const cutBack = distance > maxDistance && distance > 0 ? maxDistance / distance : 1;

	return { x: offsetX * cutBack, y: offsetY * cutBack };
}

/**
 * Moves a ring into its own material, each vertex by the mean of the edges that step there, so the border clears the
 * contour a taller neighbour lays over it.
 * @param {{ x: number; y: number }[]} vertices
 * @param {{ normalX: number; normalY: number; inset: number }[]} sides
 */
function insetRing(vertices, sides) {
	return vertices.map((vertex, index) => {
		const previous = sides[(index - 1 + sides.length) % sides.length];
		const current = sides[index];

		if (previous.inset <= 0 && current.inset <= 0) return { x: vertex.x, y: vertex.y };

		// The corner rule the contour uses, with the same distances, or the border stops meeting the mark it clears
		const inward = offsetCorner(previous, previous.inset, current, current.inset);

		return { x: vertex.x - inward.x, y: vertex.y - inward.y };
	});
}

/**
 * A ring as path commands. A hidden edge becomes a move rather than a line, lifting the pen over it.
 * @param {{ x: number; y: number }[]} vertices
 * @param {boolean[]} [hidden] Indexed by the edge that starts at the matching vertex.
 */
function toPathCommands(vertices, hidden) {
	const last = vertices.at(-1);
	const commands = [{ type: "m", x: last.x, y: last.y }];

	for (let index = 0; index < vertices.length; index++) {
		const { x, y } = vertices[index];

		// This command draws the edge that ends here, which is the one before it
		const edgeIndex = (index - 1 + vertices.length) % vertices.length;
		commands.push({ type: hidden?.[edgeIndex] ? "m" : "l", x, y });
	}

	return commands;
}

/**
 * Mixes a colour toward white or black, keeping its hue so the mark still reads as that terrain type.
 * @param {Color} color
 * @param {number} toward 1 for white, 0 for black.
 * @param {number} amount
 */
function blendColor(color, toward, amount) {
	const [red, green, blue] = color.rgb;
	return Color.fromRGB([
		red + ((toward - red) * amount),
		green + ((toward - green) * amount),
		blue + ((toward - blue) * amount)
	]);
}

/**
 * The join between two edges of the same outline: the bisector of their outward normals. Both edges run their shading
 * to this line, so they tile instead of overlapping.
 * @param {{ normalX: number; normalY: number }} neighbour
 * @param {{ normalX: number; normalY: number }} side
 * @returns {Miter}
 */
function miterBetween(neighbour, side) {
	const sumX = neighbour.normalX + side.normalX;
	const sumY = neighbour.normalY + side.normalY;
	const sumLength = Math.hypot(sumX, sumY);

	// Edges doubling back on themselves have no usable bisector
	if (sumLength < 0.2) return { x: side.normalX, y: side.normalY, scale: 1 };

	const unitX = sumX / sumLength, unitY = sumY / sumLength;
	const projection = (unitX * side.normalX) + (unitY * side.normalY);

	// Cut back past the limit, or a corner turning back on itself runs out as a spike
	return { x: unitX, y: unitY, scale: Math.min(miterLimit, 1 / Math.max(0.1, projection)) };
}

/**
 * Height terrain reaches at a point, starting from `floor` and only counting shapes that stack up from it without a
 * gap. A shape floating over the point leaves the drop below it on show, so it does not count.
 * @param {number} x
 * @param {number} y
 * @param {number} floor
 * @param {MarkContext | undefined} context
 */
function groundAgainst(x, y, floor, context) {
	let ground = floor;
	if (!context) return ground;

	const stack = context.solids
		.filter(solid => solid.shape.containsPoint(x, y))
		.sort((first, second) => first.elevation - second.elevation);

	for (const solid of stack) {
		if (solid.elevation > ground) break;
		if (solid.top > ground) ground = solid.top;
	}

	return ground;
}

/**
 * Heights of everything near enough to bury part of this shape's drops. Marks are drawn against these, so a shape has
 * to redraw when one of them changes even though its own height did not.
 * @param {import("../geometry/terrain-shape.mjs").TerrainShape} shape
 * @param {MarkContext} context
 */
function neighbourKey(shape, context) {
	const { x1, y1, w, h } = shape.polygon.boundingBox;
	const padding = canvas.grid.size;

	return context.solids
		.filter(solid => solid.shape !== shape)
		.filter(solid => {
			const box = solid.shape.polygon.boundingBox;
			return box.x1 - padding < x1 + w && x1 - padding < box.x1 + box.w
				&& box.y1 - padding < y1 + h && y1 - padding < box.y1 + box.h;
		})
		// Outline as well as height: a neighbour growing sideways changes what it marks here without changing height
		.map(solid => {
			const box = solid.shape.polygon.boundingBox;
			return `${solid.elevation}:${solid.top}:${Math.round(box.x1)},${Math.round(box.y1)}`
				+ `,${Math.round(box.w)},${Math.round(box.h)},${solid.shape.polygon.vertices.length}`;
		})
		.sort((first, second) => first.localeCompare(second))
		.join(",");
}

/**
 * Where a shape's drops start from: the top of whatever it stands in.
 * @param {import("../geometry/terrain-shape.mjs").TerrainShape} shape
 * @param {MarkContext} context
 */
function supportTopOf(shape, context) {
	return context.supports.get(shape)?.top ?? shape.elevation;
}

/**
 * Each shape mapped to what it stands in, by containment rather than by matching outlines. An outline match only holds
 * while a shape fills its hole exactly.
 * @param {readonly import("../geometry/terrain-shape.mjs").TerrainShape[]} shapes
 */
function buildSupports(shapes) {
	/** @type {Map<import("../geometry/terrain-shape.mjs").TerrainShape, { top: number; container: object | null }>} */
	const supports = new Map();

	// Tallest first, so the first container found is the immediate support
	const candidates = shapes
		.filter(shape => shape.height > 0)
		.sort((first, second) => second.top - first.top);

	for (const shape of shapes) {
		let support = shape.elevation;
		let container = null;

		for (const candidate of candidates) {
			if (candidate.top <= support) break;
			if (candidate === shape || candidate.top >= shape.top) continue;
			if (!candidate.polygon.containsPolygon(shape.polygon)) continue;

			support = candidate.top;
			container = candidate;
			break;
		}

		supports.set(shape, { top: Math.min(shape.top, Math.max(shape.elevation, support)), container });
	}

	return supports;
}
