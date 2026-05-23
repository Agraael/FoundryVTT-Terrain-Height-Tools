import { computed } from "@preact/signals-core";
import { TerrainPaintToolbar } from "../../../applications/terrain-paint-toolbar.mjs";
import { drawingModeTypes } from "../../../consts.mjs";
import { heightMap } from "../../../geometry/height-map.mjs";
import { drawingMode$, paintingConfig$ } from "../../../stores/drawing.mjs";
import { getTerrainType, terrainTypeMap$ } from "../../../stores/terrain-types.mjs";
import { abortableSubscribe } from "../../../utils/signal-utils.mjs";
import { AbstractPolygonEditorTool } from "./abstract/abstract-polygon-editor-tool.mjs";
import { CustomPolygonDrawingMode } from "./drawing-modes/custom-polygon-drawing-mode.mjs";
import { EllipseDrawingMode } from "./drawing-modes/ellipse-drawing-mode.mjs";
import { GridCellDrawingMode } from "./drawing-modes/grid-cell-drawing-mode.mjs";
import { PointDrawingMode } from "./drawing-modes/point-drawing-mode.mjs";
import { RectangleDrawingMode } from "./drawing-modes/rectangle-drawing-mode.mjs";
import { ShapePickerDrawingMode } from "./drawing-modes/shape-picker-drawing-mode.mjs";

/**
 * Tool for allowing the user to paint terrain on the canvas.
 */
export class PaintEditorTool extends AbstractPolygonEditorTool {

	static APPLICATION_TYPE = TerrainPaintToolbar;

	#previewStyle = {
		line: g => {
			const terrainTypeId = paintingConfig$.terrainTypeId.value;
			const terrainType = getTerrainType(terrainTypeId);

			g.lineStyle(terrainType.lineWidth, Color.from(terrainType.lineColor ?? "#000000"), terrainType.lineOpacity);
		},
		fill: g => {
			const terrainTypeId = paintingConfig$.terrainTypeId.value;
			const terrainType = getTerrainType(terrainTypeId);

			if (terrainType.fillType !== CONST.DRAWING_FILL_TYPES.NONE)
				g.beginFill(Color.from(terrainType.fillColor ?? "#000000"), terrainType.fillOpacity);
		}
	};

	modes = {
		[drawingModeTypes.gridCells]: new GridCellDrawingMode(this.#previewStyle).then(this.#paintRegions),
		[drawingModeTypes.rectangle]: new RectangleDrawingMode(this.#previewStyle).then(this.#paintRegions),
		[drawingModeTypes.ellipse]: new EllipseDrawingMode(this.#previewStyle).then(this.#paintRegions),
		[drawingModeTypes.customPoly]: new CustomPolygonDrawingMode(this.#previewStyle).then(this.#paintRegions),
		[drawingModeTypes.fill]: new PointDrawingMode().then(this.#fillRegion),
		[drawingModeTypes.pipette]: new ShapePickerDrawingMode({
			hint: "TERRAINHEIGHTTOOLS.SelectAShapeCopyHint",
			submitLabel: "TERRAINHEIGHTTOOLS.CopySelectedShapeConfiguration",
			submitIcon: "fas fa-eye-dropper"
		}).then(this.#usePipette.bind(this))
	};

	constructor() {
		super();

		// If selected drawing mode not valid for this tool (e.g. delete shape tool), switch to default
		if (!(drawingMode$.value in this.modes))
			drawingMode$.value = [...Object.keys(this.modes)][0];

		// If selected drawing mode is cells and the scene is gridless, select another
		if (canvas.grid?.type === CONST.GRID_TYPES.GRIDLESS && drawingMode$.value === "gridCells")
			drawingMode$.value = "rectangle";

		// Update drawing mode when changed in UI
		abortableSubscribe(drawingMode$, drawingMode => this._selectDrawingMode(drawingMode), this._cleanupSignal);
	}

	/** @override */
	_canInteract = computed(() => {
		if (this._currentModeName.value === drawingModeTypes.pipette) return true;
		const terrainTypeId = paintingConfig$.terrainTypeId.value;
		return !!terrainTypeId && terrainTypeMap$.value.has(terrainTypeId);
	});

	/** @param {{ polygon: PointLike[]; holes?: PointLike[][]; }[]} regions */
	#paintRegions(regions) {
		const { terrainTypeId, height, elevation, mode } = paintingConfig$.value;
		const usesHeight = getTerrainType(terrainTypeId)?.usesHeight ?? false;

		heightMap.paintRegions(
			regions,
			terrainTypeId,
			usesHeight ? height : 0,
			usesHeight ? elevation : 0,
			{ mode }
		);
	}

	/** @param {{ x: number; y: number; }} point */
	#fillRegion({ x, y }) {
		const { terrainTypeId, height, elevation, mode } = paintingConfig$.value;
		const usesHeight = getTerrainType(terrainTypeId)?.usesHeight ?? false;

		heightMap.fillRegion(
			[x, y],
			terrainTypeId,
			usesHeight ? height : 0,
			usesHeight ? elevation : 0,
			{ fillMode: "applicableBoundary", paintMode: mode }
		);
	}

	/** @param {import("../../../geometry/terrain-shape.mjs").TerrainShape} shape */
	#usePipette(shape) {
		paintingConfig$.value = {
			terrainTypeId: shape.terrainTypeId,
			height: Math.max(shape.height, 1),
			elevation: Math.max(shape.elevation, 0)
		};

		drawingMode$.value = this._previousModeName.value;
	}
}
