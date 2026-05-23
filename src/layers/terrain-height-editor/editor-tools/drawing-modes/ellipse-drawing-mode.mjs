/** @import { PointLike } from "../../../../geometry/point.mjs" */
import { AbstractDrawingMode } from "./abstract-drawing-mode.mjs";

/**
 * Drawing mode for creating an ellipse/circle.
 * @extends {AbstractDrawingMode<{ polygon: PointLike[]; holes?: PointLike[][]; }[]>}
 */
export class EllipseDrawingMode extends AbstractDrawingMode {

	static minEllipseRadius = 5;

	/** @type {[number, number] | null} */
	#startPosition = null;

	/** @type {[number, number] | null} */
	#mousePosition = null;

	#isCtrlKeyPressed = false;

	#isAltKeyPressed = false;

	_onMouseDownLeft(x, y) {
		this.#startPosition = [x, y];
		this.#mousePosition = [x, y];
	}

	_onMouseUpLeft() {
		if (!this.#startPosition) return;

		const { cx, cy, rx, ry } = this.#getEllipse();
		const density = PIXI.Circle.approximateVertexDensity((rx + ry) / 2);

		if (rx >= EllipseDrawingMode.minEllipseRadius && ry >= EllipseDrawingMode.minEllipseRadius) {
			this._next([
				{
					polygon: Array.from({ length: density }, (_, i) => {
						const a = Math.PI * 2 * (i / density);
						return [(Math.cos(a) * rx) + cx, (Math.sin(a) * ry) + cy];
					})
				}
			]);
		}

		this.#startPosition = null;
		this.#mousePosition = null;
		this.#updatePreview();
	}

	_onMouseMove(x, y) {
		if (!this.#startPosition) return;
		this.#mousePosition = [x, y];
		this.#updatePreview();
	}

	_onMouseDownRight() {
		// Right click cancels
		this.#startPosition = null;
		this.#mousePosition = null;
		this.#updatePreview();
	}

	/** @param {KeyboardEvent} e  */
	_onKeyDown(e) {
		this.#isCtrlKeyPressed = e.ctrlKey;
		this.#isAltKeyPressed = e.altKey;
		this.#updatePreview();
	}

	/** @param {KeyboardEvent} e  */
	_onKeyUp(e) {
		this.#isCtrlKeyPressed = e.ctrlKey;
		this.#isAltKeyPressed = e.altKey;
		this.#updatePreview();
	}

	/**
	 * @param {number} mouseX Current mouse X coordinate
	 * @param {number} mouseY Current mouse Y coordinate
	 */
	#updatePreview() {
		this._previewGraphics.clear();
		if (!this.#startPosition) return;

		const { cx, cy, rx, ry } = this.#getEllipse();
		if (rx >= EllipseDrawingMode.minEllipseRadius && ry >= EllipseDrawingMode.minEllipseRadius) {
			this._setPreviewFillStyle();
			this._setPreviewLineStyle();
			this._previewGraphics.drawEllipse(cx, cy, rx, ry);
		}
	}

	#getEllipse() {
		let cx, cy;
		let rx, ry;
		if (this.#isCtrlKeyPressed) {
			// If ctrl key is held, draw the circle's center from the start position
			[cx, cy] = this.#startPosition;
			rx = Math.abs(this.#mousePosition[0] - this.#startPosition[0]);
			ry = Math.abs(this.#mousePosition[1] - this.#startPosition[1]);

			if (this.#isAltKeyPressed) {
				const rMax = Math.max(rx, ry);
				rx = ry = rMax;
			}

		} else {
			// If ctrl key is not held, draw circle within the rectangle that has been dragged
			let w = this.#mousePosition[0] - this.#startPosition[0];
			let h = this.#mousePosition[1] - this.#startPosition[1];

			if (this.#isAltKeyPressed) {
				const maxSize = Math.max(Math.abs(w), Math.abs(h));
				w = maxSize * Math.sign(w);
				h = maxSize * Math.sign(h);
			}

			cx = this.#startPosition[0] + (w / 2);
			cy = this.#startPosition[1] + (h / 2);

			rx = Math.abs(w / 2);
			ry = Math.abs(h / 2);
		}

		return { cx, cy, rx, ry };
	}
}
