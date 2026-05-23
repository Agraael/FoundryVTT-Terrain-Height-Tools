import { AbstractDrawingMode } from "./abstract-drawing-mode.mjs";

/**
 * Drawing mode for clicking any point on the canvas.
 * @extends {AbstractDrawingMode<{ x: number; y: number; }>}
 */
export class PointDrawingMode extends AbstractDrawingMode {

	constructor() {
		super();
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 */
	_onMouseDownLeft(x, y) {
		this._next({ x, y });
	}
}
