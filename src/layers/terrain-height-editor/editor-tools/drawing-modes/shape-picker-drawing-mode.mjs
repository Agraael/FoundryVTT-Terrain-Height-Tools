/** @import { HeightMap } from "../../../../geometry/height-map.mjs"; */
import { heightMap } from "../../../../geometry/height-map.mjs";
import { AbstractDrawingMode } from "./abstract-drawing-mode.mjs";

/**
 * Drawing mode for picking a single existing shape on the canvas.
 * @extends {AbstractDrawingMode<import("../../../../geometry/terrain-shape.mjs").TerrainShape>}
 */
export class ShapePickerDrawingMode extends AbstractDrawingMode {

	#pickerDialogOptions;

	/** @param {Parameters<HeightMap["getSingleShapeAtPoint"]>[2]} pickerDialogOptions */
	constructor(pickerDialogOptions = {}) {
		super();
		this.#pickerDialogOptions = pickerDialogOptions;
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @override
	 */
	_onMouseDownLeft(x, y) {
		heightMap.getSingleShapeAtPoint(x, y, this.#pickerDialogOptions).then(shape => {
			if (shape)
				this._next(shape);
		});
	}
}
