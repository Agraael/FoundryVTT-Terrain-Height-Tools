/** @import { ReadonlySignal, Signal } from "@preact/signals-core" */
/** @import { AbstractDrawingMode } from "../drawing-modes/abstract-drawing-mode.mjs"; */
import { signal } from "@preact/signals-core";
import { AbstractEditorTool } from "./abstract-editor-tool.mjs";

/**
 * Base class from with tools that require the user to draw a polygon to use can extend from.
 */
export class AbstractPolygonEditorTool extends AbstractEditorTool {

	/** @type {Signal<string | undefined>} */
	_previousModeName = signal(undefined);

	/** @type {Signal<string | undefined>} */
	_currentModeName = signal(undefined);

	/**
	 * @type {Record<string, AbstractDrawingMode>}
	 * @protected
	 */
	modes = {};

	/** @type {PIXI.Graphics} */
	#previewGraphics;

	/** @type {AbstractDrawingMode | undefined} */
	#drawingMode;

	/** @type {ReadonlySignal<boolean>} */
	_canInteract = signal(true);

	#cleanupController;

	constructor() {
		super();

		this.#previewGraphics = canvas.interface.addChild(new PIXI.Graphics());

		this.#cleanupController = new AbortController();
	}

	get _cleanupSignal() {
		return this.#cleanupController.signal;
	}

	/** @param {string} modeName */
	_selectDrawingMode(modeName) {
		const drawingMode = this.modes[modeName];
		if (drawingMode) {
			this.#previewGraphics.clear();
			this.#drawingMode = drawingMode;
			this.#drawingMode._previewGraphics = this.#previewGraphics;
			this._previousModeName.value = this._currentModeName.value;
			this._currentModeName.value = modeName;
		}
	}

	/** @override */
	_onMouseDownLeft(x, y) {
		if (this._canInteract.value)
			this.#drawingMode?._onMouseDownLeft?.(x, y);
	}

	/** @override */
	_onMouseUpLeft(x, y) {
		if (this._canInteract.value)
			this.#drawingMode?._onMouseUpLeft?.(x, y);
	}

	/** @override */
	_onMouseMove(x, y) {
		if (this._canInteract.value)
			this.#drawingMode?._onMouseMove?.(x, y);
	}

	/** @override */
	_onMouseDownRight(x, y) {
		if (this._canInteract.value)
			this.#drawingMode?._onMouseDownRight?.(x, y);
	}

	/** @override */
	_onKeyDown(e) {
		this.#drawingMode?._onKeyDown(e);
	}

	/** @override */
	_onKeyUp(e) {
		this.#drawingMode?._onKeyUp(e);
	}

	/** @override */
	_cleanup() {
		super._cleanup();
		canvas.interface.removeChild(this.#previewGraphics);
		this.#cleanupController.abort();
	}
}
