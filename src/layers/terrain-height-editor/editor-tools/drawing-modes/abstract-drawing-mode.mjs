// Each drawing mode is implemented within it's own class.
// This allows easily keeping the state and behaviour separate from other tools, instead of having lots of fields and
// conditionals within the main region editor tool class.
/**
 * @template T
 */
export class AbstractDrawingMode {

	/**
	 * Graphics instance that can be used for drawing the preview.
	 * @type {PIXI.Graphics}
	 */
	_previewGraphics;

	/** @type {(graphics: PIXI.Graphics) => void} */
	#setPreviewLineStyle;

	/** @type {(graphics: PIXI.Graphics) => void} */
	#setPreviewFillStyle;

	/**
	 * Function that should be called when the user has finished using the tool.
	 * @type {(result: T) => void}
	 * @protected
	 */
	_next;

	/**
	 * @param {{ line: (graphics: PIXI.Graphics) => void; fill: (graphics: PIXI.Graphics) => void; }} previewStyle
	 */
	constructor({ line, fill } = {}) {
		this.#setPreviewLineStyle = line ?? (() => {});
		this.#setPreviewFillStyle = fill ?? (() => {});
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 */
	// eslint-disable-next-line no-unused-vars
	_onMouseDownLeft(x, y) { }

	/**
	 * @param {number} x
	 * @param {number} y
	 */
	// eslint-disable-next-line no-unused-vars
	_onMouseUpLeft(x, y) { }

	/**
	 * @param {number} x
	 * @param {number} y
	 */
	// eslint-disable-next-line no-unused-vars
	_onMouseMove(x, y) { }

	/**
	 * @param {number} x
	 * @param {number} y
	 */
	// eslint-disable-next-line no-unused-vars
	_onMouseDownRight(x, y) { }

	/**
	 * @param {KeyboardEvent} e
	 */
	// eslint-disable-next-line no-unused-vars
	_onKeyDown(e) { }

	/**
	 * @param {KeyboardEvent} e
	 */
	// eslint-disable-next-line no-unused-vars
	_onKeyUp(e) { }

	/**
	 * Sets the line style of the preview graphics.
	 * @protected
	 */
	_setPreviewLineStyle() {
		this.#setPreviewLineStyle(this._previewGraphics);
	}

	/**
	 * Sets the fill style of the preview graphics.
	 * @protected
	 */
	_setPreviewFillStyle() {
		this.#setPreviewFillStyle(this._previewGraphics);
	}

	/**
	 * Sets the function that should be called once the tool usage is complete.
	 * @param {(result: T) => void} next
	 */
	then(next) {
		this._next = next;
		return this;
	}
}
