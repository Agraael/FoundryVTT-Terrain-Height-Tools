import { html } from "@lit-labs/preact-signals";
import { computed } from "@preact/signals-core";
import { classMap } from "lit/directives/class-map.js";
import { drawingModeTypes, moduleName } from "../consts.mjs";
import { ContextMenu } from "../shared/elements/context-menu/context-menu.mjs";
import "../shared/elements/segment/segment.mjs";
import "../shared/elements/template-dropdown/template-dropdown.mjs";
import { drawingMode$, eraseConfig$ } from "../stores/drawing.mjs";
import { terrainTypes$ } from "../stores/terrain-types.mjs";
import { fromSceneUnits, toSceneUnits } from "../utils/grid-utils.mjs";
import { styleTerrainColor } from "./directives/style-terrain-color.mjs";
import { LitApplicationMixin } from "./mixins/lit-application-mixin.mjs";
import { TerrainTypesConfig } from "./terrain-types-config.mjs";

const { ApplicationV2 } = foundry.applications.api;

/** @type {(k: string) => string} */
const l = k => game.i18n.localize(k);

export class TerrainEraseToolbar extends LitApplicationMixin(ApplicationV2) {

	static DEFAULT_OPTIONS = {
		id: "tht_terrainEraseToolbar",
		classes: ["tht-toolbar", "flexrow"],
		window: {
			frame: false,
			positioned: false
		}
	};

	/** @override */
	_renderHTML() {
		return html`
			<div class="flex0">
				<span class="tht-toolbar-item-label">${l("TERRAINHEIGHTTOOLS.Tool")}</span>
				<segment-fwl
					class="flex0"
					.items=${this.#getDrawingModes()}
					.value=${drawingMode$}
					@change=${e => drawingMode$.value = e.target.value}
				></segment-fwl>
			</div>

			<div>
				<span class="tht-toolbar-item-label">${l("TERRAINHEIGHTTOOLS.TerrainTypesToErase")}</span>
				<template-dropdown-fwl
					.buttonTemplate=${computed(() => html`
						<span class="tht-erase-dropdown-button-label">${this.#renderTerrainTypePickerButton()}</span>
					`)}
					.dropdownTemplate=${computed(() => this.#renderTerrainTypePickerDropdown())}
					dropdownClasses="p-0"
				></template-dropdown-fwl>
			</div>

			<div class="tht-toolbar-num-input">
				<label class="tht-toolbar-item-label" for="thtEraseToolbar_rangeBottom">
					${l("TERRAINHEIGHTTOOLS.Bottom")}
				</label>
				<input
					type="number"
					class="tht-erase-range-input text-align-center"
					id="thtEraseToolbar_rangeBottom"
					placeholder="- &#xf534;"
					.max=${computed(() => toSceneUnits(eraseConfig$.top.value))}
					.value=${computed(() => toSceneUnits(eraseConfig$.bottom.value))}
					@input=${e => eraseConfig$.bottom.value = fromSceneUnits(this.#getInputValue(e))}
					@blur=${this.#onBottomBlur}
				>
			</div>

			<div class="tht-toolbar-num-input">
				<label class="tht-toolbar-item-label" for="thtEraseToolbar_rangeTop">
					${l("TERRAINHEIGHTTOOLS.Top")}
				</label>
				<input
					type="number"
					class="tht-erase-range-input text-align-center"
					id="thtEraseToolbar_rangeTop"
					placeholder="+ &#xf534;"
					.min=${computed(() => toSceneUnits(eraseConfig$.bottom.value))}
					.value=${computed(() => toSceneUnits(eraseConfig$.top.value))}
					@input=${e => eraseConfig$.top.value = fromSceneUnits(this.#getInputValue(e))}
					@blur=${this.#onTopBlur}
				>
			</div>

			<button type="button" class="flex0" @click=${this.#openConfigurationMenu} style="border: 0">
				<i class="fas fa-cog"></i>
			</button>
		`;
	}

	#renderTerrainTypePickerButton() {
		const numberOfTypes = terrainTypes$.value.length;
		const numberOfTypesToNotErase = eraseConfig$.excludedTerrainTypeIds.value.length;

		switch (true) {
			case numberOfTypesToNotErase === 0:
				return "All";

			case numberOfTypesToNotErase === numberOfTypes:
				return html`None <i class="fa fa-triangle-exclamation"></i>`;

			case numberOfTypesToNotErase <= Math.min(Math.floor(numberOfTypes * 0.5), 5):
				return `All except ${terrainTypes$.value
					.filter(t => eraseConfig$.excludedTerrainTypeIds.value.includes(t.id))
					.map(t => t.name)
					.join(", ")}`;

			default:
				return terrainTypes$.value
					.filter(t => !eraseConfig$.excludedTerrainTypeIds.value.includes(t.id))
					.map(t => t.name)
					.join(", ");
		}
	}

	#renderTerrainTypePickerDropdown = () => html`
		<ul class="tht-terrain-type-palette">
			${terrainTypes$.value.map(terrainType => html`
				<li
					class=${computed(() => classMap({ "align-items-center": true, "opacity-04": eraseConfig$.excludedTerrainTypeIds.value.includes(terrainType.id) }))}
					@click=${() => this.#toggleTerrainType(terrainType.id)}
				>
					<div
						class="tht-terrain-preview-box"
						style=${styleTerrainColor(terrainType, { textColorCssPropertyName: "", lineWidthCssPropertyName: "" })}
						inert
					></div>
					<label class="terrain-type-name" inert>${terrainType.name}</label>
				</li>
			`)}
		</ul>

		<div class="p-05rem text-align-right">
			<a data-tooltip=${l("SelectAll")} @click=${this.#selectAll}>
				<i class="fas fa-circle"></i>
			</a>
			<a data-tooltip=${l("SelectNone")} @click=${this.#selectNone}>
				<i class="far fa-circle"></i>
			</a>
			<a data-tooltip=${l("InvertSelection")} @click=${this.#selectInverse}>
				<i class="fas fa-circle-half-stroke"></i>
			</a>
		</div>
	`;

	/** @override */
	_insertElement(element) {
		const existing = document.getElementById(element.id);
		if (existing) existing.replaceWith(element);
		else document.querySelector("#ui-top").appendChild(element);
	}

	#getDrawingModes() {
		return [
			canvas.grid?.type && canvas.grid.type !== CONST.GRID_TYPES.GRIDLESS && {
				value: drawingModeTypes.gridCells,
				icon: "fas fa-grid-3",
				toolclip: {
					heading: "CONTROLS.TerrainHeightToolsDrawingModeGridCells",
					src: `modules/${moduleName}/toolclips/drawingmode-cells.mp4`,
					items: [
						{ heading: "CONTROLS.CommonDraw", content: "CONTROLS.ClickOrClickDrag" },
						{ paragraph: "CONTROLS.TerrainHeightToolsDrawingModeP" }
					]
				}
			},
			{
				value: drawingModeTypes.rectangle,
				icon: "far fa-rectangle",
				toolclip: {
					heading: "CONTROLS.TerrainHeightToolsDrawingModeRectangle",
					src: `modules/${moduleName}/toolclips/drawingmode-rect.mp4`,
					items: [
						{ heading: "CONTROLS.CommonDraw", reference: "CONTROLS.ClickDrag" },
						{ heading: "CONTROLS.CommonDrawProportional", reference: "CONTROLS.AltClickDrag" },
						{ paragraph: "CONTROLS.TerrainHeightToolsDrawingModeP" }
					]
				}
			},
			{
				value: drawingModeTypes.ellipse,
				icon: "far fa-circle",
				toolclip: {
					heading: "CONTROLS.TerrainHeightToolsDrawingModeEllipse",
					src: `modules/${moduleName}/toolclips/drawingmode-ellipse.mp4`,
					items: [
						{ heading: "CONTROLS.CommonDraw", reference: "CONTROLS.ClickDrag" },
						{ heading: "CONTROLS.CommonDrawProportional", reference: "CONTROLS.AltClickDrag" },
						{ heading: "CONTROLS.TerrainHeightToolsDrawingModeEllipseDrawFromCenter", reference: "CONTROLS.CtrlClickDrag" },
						{ paragraph: "CONTROLS.TerrainHeightToolsDrawingModeP" }
					]
				}
			},
			{
				value: drawingModeTypes.customPoly,
				icon: "far fa-draw-polygon",
				toolclip: {
					heading: "CONTROLS.TerrainHeightToolsDrawingModeCustomPolygon",
					src: `modules/${moduleName}/toolclips/drawingmode-custom.mp4`,
					items: [
						{ heading: "CONTROLS.CommonDraw", content: "CONTROLS.TerrainHeightToolsDrawingModeCustomPolygonDraw" },
						{ heading: "CONTROLS.TerrainHeightToolsDrawingModeCustomPolygonRemoveLastPoint", reference: "CONTROLS.RightClick" },
						{ paragraph: "CONTROLS.TerrainHeightToolsDrawingModeP" }
					]
				}
			},
			{
				value: drawingModeTypes.deleteShape,
				icon: "far fa-rectangle-xmark",
				toolclip: {
					heading: "CONTROLS.TerrainHeightToolsDrawingModeDeleteShape",
					items: [
						{ heading: "CONTROLS.TerrainHeightToolsDrawingModeDeleteShape", content: "CONTROLS.TerrainHeightToolsDrawingModeDeleteShapeClick" },
						{ paragraph: "CONTROLS.TerrainHeightToolsDrawingModeDeleteShapeP" }
					]
				}
			}
		].filter(Boolean);
	}

	/** @param {string} terrainTypeId */
	#toggleTerrainType(terrainTypeId) {
		const excludedTerrainTypeIds = eraseConfig$.excludedTerrainTypeIds.value;

		eraseConfig$.excludedTerrainTypeIds.value = excludedTerrainTypeIds.includes(terrainTypeId)
			? excludedTerrainTypeIds.filter(id => id !== terrainTypeId)
			: [...excludedTerrainTypeIds, terrainTypeId];
	}

	/**
	 * @param {KeyboardEvent} event
	 * @param {number} min
	 */
	#getInputValue(event) {
		if (["", null, undefined].includes(event.currentTarget.value)) return null;
		const value = +event.currentTarget.value;
		return Math.max(isNaN(value) ? 0 : value, 0);
	}

	/** @param {InputEvent} evt */
	#onTopBlur(evt) {
		// On blur, ensure that the value is below/above the other value and then set the value of the input to the
		// Signal, so that if it was left as an invalid number it resets and shows the correct value again.
		let { bottom, top } = eraseConfig$.value;
		if (typeof bottom === "number" && typeof top === "number" && top < bottom)
			top = eraseConfig$.top.value = bottom;

		evt.target.value = toSceneUnits(top);
	}

	/** @param {InputEvent} evt */
	#onBottomBlur(evt) {
		// On blur, ensure that the value is below/above the other value and then set the value of the input to the
		// Signal, so that if it was left as an invalid number it resets and shows the correct value again.
		let { bottom, top } = eraseConfig$.value;
		if (typeof bottom === "number" && typeof top === "number" && bottom > top)
			bottom = eraseConfig$.bottom.value = top;

		evt.target.value = toSceneUnits(bottom);
	}

	#selectAll() {
		eraseConfig$.excludedTerrainTypeIds.value = [];
	}

	#selectNone() {
		eraseConfig$.excludedTerrainTypeIds.value = terrainTypes$.value.map(t => t.id);
	}

	#selectInverse() {
		const currentlySelected = new Set(eraseConfig$.excludedTerrainTypeIds.value);
		const allTerrainTypes = terrainTypes$.value.map(t => t.id);
		eraseConfig$.excludedTerrainTypeIds.value = allTerrainTypes.filter(t => !currentlySelected.has(t));
	}

	/** @param {PointerEvent} e */
	#openConfigurationMenu(e) {
		ContextMenu.open(e, [
			{
				label: l("SETTINGS.TerrainTypes.Button"),
				icon: "fas fa-cog",
				onClick: () => new TerrainTypesConfig().render(true)
			}
		]);
	}
}
