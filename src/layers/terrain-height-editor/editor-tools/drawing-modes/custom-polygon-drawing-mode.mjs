/** @import { PointLike } from "../../../../geometry/point.mjs" */
import { drawDashedComplexPath } from "../../../../shared/pixi/drawing.mjs";
import { AbstractDrawingMode } from "./abstract-drawing-mode.mjs";

/**
 * Drawing mode for creating an arbitrary custom polygon.
 * @extends {AbstractDrawingMode<{ polygon: PointLike[]; holes?: PointLike[][]; }[]>}
 */
export class CustomPolygonDrawingMode extends AbstractDrawingMode {

	#lastClickTime = 0;

	/** @type {[number, number][]} */
	#currentPoints = [];

	/** @override */
	_onMouseDownLeft(x, y) {
		// If the user is already drawing a polygon, then double clicking will end the polygon
		if ((Date.now() - this.#lastClickTime) < 250 && this.#currentPoints.length >= 3) {
			this._next(ClipperLib.Clipper.SimplifyPolygon(
				this.#currentPoints.map(p => new ClipperLib.IntPoint(p[0], p[1])),
				ClipperLib.PolyFillType.pftNonZero
			).map(polygon => ({ polygon })));
			this.#currentPoints = [];

		} else {
			// Otherwise, then single clicking will add a new point to the polygon
			this.#currentPoints.push([Math.round(x), Math.round(y)]);
		}

		this.#lastClickTime = Date.now();
		this.#updatePreview(x, y);
	}

	/** @override */
	_onMouseMove(x, y) {
		// If the user is already drawing a polygon, just update the preview
		if (this.#currentPoints.length > 0) {
			this.#updatePreview(x, y);
			return;
		}
	}

	/** @override */
	_onMouseDownRight(x, y) {
		if (this.#currentPoints.length > 0) {
			this.#currentPoints.pop();
			this.#updatePreview(x, y);
		}
	}

	/**
	 * @param {number} mouseX Current mouse X coordinate
	 * @param {number} mouseY Current mouse Y coordinate
	 */
	#updatePreview(mouseX, mouseY) {
		this._previewGraphics.clear();

		if (this.#currentPoints.length === 0) return;

		// Draw fill (needs to be done before the dashed preview line)
		// We need to simplify the polygon first since PIXI uses triangulation when drawing, which is not how our polys
		// behave.
		if (this.#currentPoints.length > 1) {
			const simplifiedPolygons = ClipperLib.Clipper.SimplifyPolygon([
				...this.#currentPoints.map(p => new ClipperLib.IntPoint(p[0], p[1])),
				new ClipperLib.IntPoint(Math.round(mouseX), Math.round(mouseY))
			], ClipperLib.PolyFillType.pftNonZero);

			for (const simplified of simplifiedPolygons) {
				this._setPreviewFillStyle();
				this._previewGraphics.moveTo(simplified[0].X, simplified[0].Y);
				for (let i = 1; i < simplified.length; i++)
					this._previewGraphics.lineTo(simplified[i].X, simplified[i].Y);
				this._previewGraphics.endFill();
			}

		}

		this._setPreviewLineStyle();

		// Draw main (solid) border
		this._previewGraphics.moveTo(...this.#currentPoints[0]);
		for (let i = 1; i < this.#currentPoints.length; i++)
			this._previewGraphics.lineTo(...this.#currentPoints[i]);

		// Draw dashed preview line
		drawDashedComplexPath(this._previewGraphics, [
			{ type: "m", x: this.#currentPoints.at(-1)[0], y: this.#currentPoints.at(-1)[1] },
			{ type: "l", x: mouseX, y: mouseY },
			this.#currentPoints.length > 1 && { type: "l", x: this.#currentPoints[0][0], y: this.#currentPoints[0][1] } // don't double-draw line if only one
		].filter(Boolean));
	}
}
