/** @import { TerrainShape } from "../../../geometry/terrain-shape.mjs"; */
import { ShapeConversionConfig } from "../../../applications/shape-conversion-config.mjs";
import { wallHeightModuleName } from "../../../consts.mjs";
import { heightMap } from "../../../geometry/height-map.mjs";
import { convertConfig$ } from "../../../stores/drawing.mjs";
import { getTerrainType } from "../../../stores/terrain-types.mjs";
import { toSceneUnits } from "../../../utils/grid-utils.mjs";
import { getLabelText } from "../../terrain-height-graphics/terrain-shape-graphic.mjs";
import { AbstractShapePickerEditorTool } from "./abstract/abstract-shape-picker-editor-tool.mjs";

/**
 * Tool that allows a user to convert an existing shape into drawing/walls/region.
 */
export class ConvertShapeEditorTool extends AbstractShapePickerEditorTool {

	static APPLICATION_TYPE = ShapeConversionConfig;

	static hint = "TERRAINHEIGHTTOOLS.SelectAShapeConvertHint";

	static submitLabel = "TERRAINHEIGHTTOOLS.ConvertSelectedShape";

	static submitIcon = "fas fa-arrow-turn-right";

	/** @type {Set<TerrainShape>} */
	#convertedShapes = new Set();

	/** @type {PIXI.Graphics | null} */
	#doneOverlay = null;

	constructor() {
		super();
		this.#doneOverlay = new PIXI.Graphics();
		this.#doneOverlay.eventMode = "none";
		canvas.controls.addChild(this.#doneOverlay);
	}

	/** @override */
	_cleanup() {
		super._cleanup();
		this.#convertedShapes.clear();
		if (this.#doneOverlay) {
			this.#doneOverlay.parent?.removeChild(this.#doneOverlay);
			this.#doneOverlay.destroy({ children: true });
			this.#doneOverlay = null;
		}
	}

	/**
	 * @param {TerrainShape} shape
	 * @override
	 */
	async _selectShape(shape) {
		const { toDrawing, toRegion, toWalls, wallConfig, setWallHeightFlags, deleteAfter } = convertConfig$.value;

		const terrainData = getTerrainType(shape.terrainTypeId);
		if (!terrainData) return;

		if (toDrawing) {
			const { x1, y1, w, h } = shape.polygon.boundingBox;
			await canvas.scene.createEmbeddedDocuments("Drawing", [
				{
					x: x1,
					y: y1,
					shape: {
						type: "p",
						width: w,
						height: h,
						points: [
							...shape.polygon.vertices.flatMap(v => [v.x - x1, v.y - y1]),
							shape.polygon.vertices[0].x - x1,
							shape.polygon.vertices[0].y - y1
						]
					},
					fillAlpha: terrainData.fillOpacity,
					fillColor: terrainData.fillColor,
					fillType: terrainData.fillType,
					texture: terrainData.fillTexture,
					strokeAlpha: terrainData.lineOpacity,
					strokeColor: terrainData.lineColor,
					strokeWidth: terrainData.lineWidth,
					text: getLabelText(shape, terrainData),
					textAlpha: terrainData.textOpacity,
					textColor: terrainData.textColor,
					fontFamily: terrainData.font,
					fontSize: terrainData.textSize
				},
				...shape.holes.map(hole => {
					const { x1, y1, w, h } = hole.boundingBox;
					return {
						x: x1,
						y: y1,
						shape: {
							type: "p",
							width: w,
							height: h,
							points: [
								...hole.vertices.flatMap(v => [v.x - x1, v.y - y1]),
								hole.vertices[0].x - x1,
								hole.vertices[0].y - y1
							]
						},
						fillType: CONST.DRAWING_FILL_TYPES.NONE,
						texture: terrainData.fillTexture,
						strokeAlpha: terrainData.lineOpacity,
						strokeColor: terrainData.lineColor,
						strokeWidth: terrainData.lineWidth
					};
				})
			].filter(Boolean));
		}

		if (toRegion) {
			await canvas.scene.createEmbeddedDocuments("Region", [
				{
					name: terrainData.name,
					color: Color.from(terrainData.fillColor),
					elevation: terrainData.usesHeight
						? { top: shape.top, bottom: shape.bottom }
						: { top: null, bottom: null },
					shapes: [
						{
							type: "polygon",
							hole: false,
							points: shape.polygon.vertices.flatMap(v => [v.x, v.y])
						},
						...shape.holes.map(hole => ({
							type: "polygon",
							hole: true,
							points: hole.vertices.flatMap(v => [v.x, v.y])
						}))
					],
					visibility: CONST.REGION_VISIBILITY.ALWAYS
				}
			]);
		}

		if (toWalls) {
			const flags = setWallHeightFlags && game.modules.get(wallHeightModuleName)?.active
				? { "wall-height": { top: toSceneUnits(shape.top), bottom: toSceneUnits(shape.bottom) } }
				: {};

			await canvas.scene.createEmbeddedDocuments("Wall", [...shape.polygon.edges, ...shape.holes.flatMap(h => h.edges)]
				.map(edge => ({
					...wallConfig,
					c: [
						edge.p1.x,
						edge.p1.y,
						edge.p2.x,
						edge.p2.y
					],
					flags
				})));
		}

		if (deleteAfter) {
			await heightMap.eraseShape(shape);
		} else {
			// Persistent visual mark so the user can see which shapes have already been converted in this tool session.
			this.#convertedShapes.add(shape);
			this.#redrawDoneOverlay();
		}

		// Notify user, because it may not be obvious that it's worked.
		ui.notifications.info(game.i18n.localize("TERRAINHEIGHTTOOLS.NotifyShapeConversionComplete"));
	}

	#redrawDoneOverlay() {
		const g = this.#doneOverlay;
		if (!g) return;
		g.clear();
		for (const shape of this.#convertedShapes) {
			ConvertShapeEditorTool.#drawDoneMarker(g, shape);
		}
	}

	/**
	 * @param {PIXI.Graphics} g
	 * @param {TerrainShape} shape
	 */
	static #drawDoneMarker(g, shape) {
		const outline = shape.polygon.vertices.flatMap(v => [v.x, v.y]);

		// Tinted polygon overlay (with holes punched out)
		g.lineStyle({ width: 4, color: 0x00cc00, alpha: 0.95, alignment: 0.5 });
		g.beginFill(0x00ff00, 0.18);
		g.drawPolygon(outline);
		for (const hole of shape.holes) {
			g.beginHole();
			g.drawPolygon(hole.vertices.flatMap(v => [v.x, v.y]));
			g.endHole();
		}
		g.endFill();

		// Centered checkmark badge
		const { x1, y1, w, h } = shape.polygon.boundingBox;
		const cx = x1 + w / 2;
		const cy = y1 + h / 2;
		const r = Math.max(8, Math.min(w, h, canvas.grid.size) * 0.25);

		g.lineStyle(0);
		g.beginFill(0x000000, 0.55);
		g.drawCircle(cx, cy, r);
		g.endFill();

		const s = r * 0.7;
		g.lineStyle({ width: Math.max(2, r * 0.22), color: 0xffffff, alpha: 1, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND });
		g.moveTo(cx - s * 0.55, cy + s * 0.05);
		g.lineTo(cx - s * 0.1, cy + s * 0.45);
		g.lineTo(cx + s * 0.55, cy - s * 0.4);
	}
}
