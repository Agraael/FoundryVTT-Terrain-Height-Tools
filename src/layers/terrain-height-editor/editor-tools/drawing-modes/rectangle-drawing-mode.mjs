/** @import { PointLike } from "../../../../geometry/point.mjs" */
import { AbstractDrawingMode } from "./abstract-drawing-mode.mjs";

/**
 * Drawing mode for creating a rectangle/square.
 * @extends {AbstractDrawingMode<{ polygon: PointLike[]; holes?: PointLike[][]; }[]>}
 */
export class RectangleDrawingMode extends AbstractDrawingMode {

	static minRectangleSize = 10;

	/** @type {[number, number] | null} */
	#startPosition = null;

	/** @type {[number, number] | null} */
	#mousePosition = null;

	#isAltKeyPressed = false;

	_onMouseDownLeft(x, y) {
		this.#startPosition = [x, y];
		this.#mousePosition = [x, y];
	}

	_onMouseUpLeft() {
		if (!this.#startPosition) return;

		const { x1, y1, x2, y2, aw, ah } = this.#getRect();
		if ((aw >= RectangleDrawingMode.minRectangleSize || ah >= RectangleDrawingMode.minRectangleSize) && aw > 0 && ah > 0) {
			this._next([
				{
					polygon: [
						[x1, y1],
						[x2, y1],
						[x2, y2],
						[x1, y2]
					]
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
		this.#isAltKeyPressed = e.altKey;
		this.#updatePreview();
	}

	/** @param {KeyboardEvent} e  */
	_onKeyUp(e) {
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

		const { x1, y1, w, h, aw, ah } = this.#getRect();
		if (aw >= RectangleDrawingMode.minRectangleSize || ah >= RectangleDrawingMode.minRectangleSize) {
			this._setPreviewFillStyle();
			this._setPreviewLineStyle();
			this._previewGraphics.drawRect(x1, y1, w, h);
		}
	}

	#getRect() {
		const [x1, y1] = this.#startPosition;
		let [x2, y2] = this.#mousePosition;
		let w = x2 - x1;
		let h = y2 - y1;

		// Draw a square if alt is held
		if (this.#isAltKeyPressed) {
			const maxSize = Math.max(Math.abs(w), Math.abs(h));
			w = maxSize * Math.sign(w);
			h = maxSize * Math.sign(h);
			x2 = x1 + w;
			y2 = y1 + h;
		}

		return { x1, y1, x2, y2, w, h, aw: Math.abs(w), ah: Math.abs(h) };
	}
}
