/** @import { PointLike } from "../../../../geometry/point.mjs" */
import { union as polygonUnion } from "polygon-clipping";
import { Polygon } from "../../../../geometry/polygon.mjs";
import { getGridCellPolygon, polygonsFromGridCells } from "../../../../utils/grid-utils.mjs";
import { AbstractDrawingMode } from "./abstract-drawing-mode.mjs";

/**
 * Drawing mode for selecting grid cells.
 * @extends {AbstractDrawingMode<{ polygon: PointLike[]; holes?: PointLike[][]; }[]>}
 */
export class GridCellDrawingMode extends AbstractDrawingMode {

	/** @type {Set<string>} */
	#pendingCells = new Set();

	#isDrawing = false;

	get #pendingCellsCoords() {
		return [...this.#pendingCells].map(c => c.split("|").map(Number));
	}

	/** @override */
	_onMouseDownLeft(x, y) {
		this.#isDrawing = true;
		this.#highlightCell(x, y);
	}

	/** @override */
	_onMouseMove(x, y) {
		if (this.#isDrawing)
			this.#highlightCell(x, y);
	}

	/** @override */
	_onMouseUpLeft() {
		if (!this.#isDrawing) return;

		this.#isDrawing = false;
		const selectedCells = this.#pendingCellsCoords;
		this._previewGraphics.clear();
		this.#pendingCells.clear();
		this._next(polygonsFromGridCells(selectedCells, canvas.grid));
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 */
	#highlightCell(x, y) {
		if (!this.#isDrawing) return;

		const { i, j } = canvas.grid.getOffset({ x, y });
		const cellKey = `${i}|${j}`;
		if (this.#pendingCells.has(cellKey)) return;
		this.#pendingCells.add(cellKey);

		const combinedCellPolygons = polygonUnion(...this.#pendingCellsCoords.map(([i, j]) => [
			getGridCellPolygon(i, j).map(({ x, y }) => [x, y])
		]));

		this._previewGraphics.clear();
		this._setPreviewLineStyle();

		for (const polygon of combinedCellPolygons) {
			for (const ring of polygon) {
				const isHole = !Polygon.isClockwise(ring);

				if (isHole)
					this._previewGraphics.beginHole();

				else
					this._setPreviewFillStyle();

				this._previewGraphics.moveTo(...ring.at(-1));
				for (let i = 0; i < ring.length; i++)
					this._previewGraphics.lineTo(...ring[i]);

				if (isHole)
					this._previewGraphics.endHole();

				else
					this._previewGraphics.endFill();
			}
		}
	}
}
