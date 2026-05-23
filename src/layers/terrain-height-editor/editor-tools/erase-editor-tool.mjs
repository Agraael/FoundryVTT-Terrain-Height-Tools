import { TerrainErasePalette } from "../../../applications/terrain-erase-palette.mjs";
import { drawingModeTypes } from "../../../consts.mjs";
import { heightMap } from "../../../geometry/height-map.mjs";
import { drawingMode$, eraseConfig$ } from "../../../stores/drawing.mjs";
import { abortableSubscribe } from "../../../utils/signal-utils.mjs";
import { AbstractPolygonEditorTool } from "./abstract/abstract-polygon-editor-tool.mjs";
import { CustomPolygonDrawingMode } from "./drawing-modes/custom-polygon-drawing-mode.mjs";
import { EllipseDrawingMode } from "./drawing-modes/ellipse-drawing-mode.mjs";
import { GridCellDrawingMode } from "./drawing-modes/grid-cell-drawing-mode.mjs";
import { RectangleDrawingMode } from "./drawing-modes/rectangle-drawing-mode.mjs";
import { ShapePickerDrawingMode } from "./drawing-modes/shape-picker-drawing-mode.mjs";

/**
 * Tool for allowing the user to erase terrain from the canvas.
 */
export class EraseEditorTool extends AbstractPolygonEditorTool {

	static APPLICATION_TYPE = TerrainErasePalette;

	#previewStyle = {
		line: g => g.lineStyle(4, 0x000000, 0.6),
		fill: g => g.beginFill(0x000000, 0.2)
	};

	modes = {
		[drawingModeTypes.gridCells]: new GridCellDrawingMode(this.#previewStyle).then(this.#eraseRegions),
		[drawingModeTypes.rectangle]: new RectangleDrawingMode(this.#previewStyle).then(this.#eraseRegions),
		[drawingModeTypes.ellipse]: new EllipseDrawingMode(this.#previewStyle).then(this.#eraseRegions),
		[drawingModeTypes.customPoly]: new CustomPolygonDrawingMode(this.#previewStyle).then(this.#eraseRegions),
		[drawingModeTypes.deleteShape]: new ShapePickerDrawingMode({
			hint: "TERRAINHEIGHTTOOLS.SelectAShapeEraseHint",
			submitLabel: "TERRAINHEIGHTTOOLS.EraseSelectedShape",
			submitIcon: "fas fa-eraser"
		}).then(this.#eraseShape)
	};

	constructor() {
		super();

		// If selected drawing mode is cells and the scene is gridless, select another
		if (canvas.grid?.type === CONST.GRID_TYPES.GRIDLESS && drawingMode$.value === "gridCells")
			drawingMode$.value = "rectangle";

		// Update drawing mode when changed in UI
		abortableSubscribe(drawingMode$, drawingMode => this._selectDrawingMode(drawingMode), this._cleanupSignal);
	}

	/** @param {{ polygon: PointLike[]; holes?: PointLike[][]; }[]} regions */
	#eraseRegions(regions) {
		const { excludedTerrainTypeIds: excludingTerrainTypeIds, bottom, top } = eraseConfig$.value;
		heightMap.eraseRegions(regions, { excludingTerrainTypeIds, bottom, top });
	}

	/** @param {import("../../../geometry/terrain-shape.mjs").TerrainShape} shape */
	#eraseShape(shape) {
		heightMap.eraseShapes(shape);
	}
}
