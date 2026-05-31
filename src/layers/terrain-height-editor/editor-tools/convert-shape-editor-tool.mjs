/** @import { TerrainShape } from "../../../geometry/terrain-shape.mjs"; */
import { ShapeConversionConfig } from "../../../applications/shape-conversion-config.mjs";
import { wallHeightModuleName } from "../../../consts.mjs";
import { heightMap } from "../../../geometry/height-map.mjs";
import { convertConfig$, wallConfig$ } from "../../../stores/drawing.mjs";
import { getTerrainType } from "../../../stores/terrain-types.mjs";
import { toSceneUnits } from "../../../utils/grid-utils.mjs";
import { getLabelText } from "../../terrain-height-graphics/terrain-shape-graphic.mjs";
import { AbstractEditorTool } from "./abstract/abstract-editor-tool.mjs";

/**
 * Tool that allows a user to convert an existing shape into drawing/walls/region.
 */
export class ConvertShapeEditorTool extends AbstractEditorTool {

	static APPLICATION_TYPE = ShapeConversionConfig;

	_onMouseDownLeft(x, y) {
		heightMap.getSingleShapeAtPoint(x, y, {
			hint: "TERRAINHEIGHTTOOLS.SelectAShapeConvertHint",
			submitLabel: "TERRAINHEIGHTTOOLS.ConvertSelectedShape",
			submitIcon: "fas fa-arrow-turn-right"
		}).then(shape => {
			if (shape) this._selectShape(shape);
		});
	}

	/**
	 * @param {TerrainShape} shape
	 * @override
	 */
	async _selectShape(shape) {
		const { toDrawing, toRegion, toWalls, setWallHeightFlags, deleteAfter } = convertConfig$.value;

		const terrainType = getTerrainType(shape.terrainTypeId);
		if (!terrainType) return;

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
					fillAlpha: terrainType.fillOpacity,
					fillColor: terrainType.fillColor,
					fillType: terrainType.fillType,
					texture: terrainType.fillTexture,
					strokeAlpha: terrainType.lineOpacity,
					strokeColor: terrainType.lineColor,
					strokeWidth: terrainType.lineWidth,
					text: getLabelText(shape, terrainType),
					textAlpha: terrainType.textOpacity,
					textColor: terrainType.textColor,
					fontFamily: terrainType.font,
					fontSize: terrainType.textSize
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
						texture: terrainType.fillTexture,
						strokeAlpha: terrainType.lineOpacity,
						strokeColor: terrainType.lineColor,
						strokeWidth: terrainType.lineWidth
					};
				})
			].filter(Boolean));
		}

		if (toRegion) {
			await canvas.scene.createEmbeddedDocuments("Region", [
				{
					name: terrainType.name,
					color: Color.from(terrainType.fillColor),
					elevation: terrainType.usesHeight
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
					visibility: CONST.REGION_VISIBILITY.ALWAYS,
					behaviors: terrainType.regionBehaviors
				}
			]);
		}

		if (toWalls) {
			const flags = setWallHeightFlags && game.modules.get(wallHeightModuleName)?.active
				? { "wall-height": { top: toSceneUnits(shape.top), bottom: toSceneUnits(shape.bottom) } }
				: {};

			await canvas.scene.createEmbeddedDocuments("Wall", [...shape.polygon.edges, ...shape.holes.flatMap(h => h.edges)]
				.map(edge => ({
					...wallConfig$.value,
					c: [
						edge.p1.x,
						edge.p1.y,
						edge.p2.x,
						edge.p2.y
					],
					flags
				})));
		}

		if (deleteAfter)
			await heightMap.eraseShapes(shape);

		// Notify user, because it may not be obvious that it's worked.
		ui.notifications.info(game.i18n.localize("TERRAINHEIGHTTOOLS.NotifyShapeConversionComplete"));
	}
}
