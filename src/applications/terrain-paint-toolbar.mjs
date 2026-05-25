/** @import { Ref } from "lit/directives/ref.js"; */
/** @import { TemplateDropdownElement } from "../shared/elements/template-dropdown/template-dropdown.mjs"; */
import { html } from "@lit-labs/preact-signals";
import { computed } from "@preact/signals-core";
import { choose } from "lit/directives/choose.js";
import { classMap } from "lit/directives/class-map.js";
import { createRef, ref } from "lit/directives/ref.js";
import { paintToolbarUseHeightElevation$ } from "../config/settings.mjs";
import { drawingModeTypes, moduleName, settingNames, terrainPaintMode } from "../consts.mjs";
import { ContextMenu } from "../shared/elements/context-menu/context-menu.mjs";
import "../shared/elements/segment/segment.mjs";
import "../shared/elements/template-dropdown/template-dropdown.mjs";
import { drawingMode$, paintingConfig$, paintingConfigTop$, setPaintingConfigBottom, setPaintingConfigTop } from "../stores/drawing.mjs";
import { terrainTypeMap$, terrainTypes$ } from "../stores/terrain-types.mjs";
import { fromSceneUnits, toSceneUnits } from "../utils/grid-utils.mjs";
import { styleTerrainColor } from "./directives/style-terrain-color.mjs";
import { LitApplicationMixin } from "./mixins/lit-application-mixin.mjs";
import { ThtToolbarMixin } from "./mixins/tht-toolbar-mixin.mjs";
import { TerrainTypesConfig } from "./terrain-types-config.mjs";

const { ApplicationV2 } = foundry.applications.api;

/** @type {(k: string) => string} */
const l = k => game.i18n.localize(k);

export class TerrainPaintToolbar extends ThtToolbarMixin(LitApplicationMixin(ApplicationV2)) {

	static DEFAULT_OPTIONS = {
		id: "tht_terrainPaintToolbar",
		classes: ["tht-toolbar", "flexrow"],
		window: {
			frame: false,
			positioned: false
		}
	};

	/** @type {Ref<TemplateDropdownElement>} */
	#terrainTypeSelectRef = createRef();

	/** @override */
	_renderHTML() {
		const selectedTerrainType$ = computed(() => paintingConfig$.terrainTypeId.value
			? terrainTypeMap$.value.get(paintingConfig$.terrainTypeId.value)
			: undefined);

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
				<span class="tht-toolbar-item-label">${l("TERRAINHEIGHTTOOLS.TerrainType")}</span>
				<template-dropdown-fwl
					.buttonTemplate=${computed(() => choose(true, [
						[!terrainTypes$.value.length, () => html`<span>${l("TERRAINHEIGHTTOOLS.NoTerrainTypesWarn")}</span>`],
						[!selectedTerrainType$.value, () => html`<span>${l("TERRAINHEIGHTTOOLS.SelectATerrainType")}</span>`],
						[!!selectedTerrainType$.value, () => html`
							<div
								class="tht-terrain-preview-box"
								style=${styleTerrainColor(selectedTerrainType$.value, { textColorCssPropertyName: "", lineWidthCssPropertyName: "" })}
							></div>
							<span>${selectedTerrainType$.value?.name}</span>
						`]
					]))}
					.dropdownTemplate=${computed(() => this.#renderTerrainTypePickerDropdown())}
					dropdownClasses="p-0"
					@open=${this.#onTerrainTypeSelectionOpen}
					${ref(this.#terrainTypeSelectRef)}
				></template-dropdown-fwl>
			</div>

			<!-- Height+elevation or top+bottom (depending on users preferences) -->
			${computed(() => paintToolbarUseHeightElevation$.value ? html`
				<div class="tht-toolbar-num-input" data-tooltip=${l("TERRAINHEIGHTTOOLS.Height.Hint")}>
					<label class="tht-toolbar-item-label" for="thtPaintToolbar_selectedHeight">
						${l("TERRAINHEIGHTTOOLS.Height.Name")}
					</label>
					<input
						type="number"
						class="text-align-center"
						id="thtPaintToolbar_selectedHeight"
						min="0"
						.value=${computed(() => toSceneUnits(paintingConfig$.height.value))}
						?disabled=${computed(() => !selectedTerrainType$.value?.usesHeight)}
						@change=${e => paintingConfig$.height.value = fromSceneUnits(this.#getInputValue(e, 0.1))}
						@blur=${e => e.target.value = toSceneUnits(paintingConfig$.height.value)}
					>
				</div>

				<div class="tht-toolbar-num-input" data-tooltip=${l("TERRAINHEIGHTTOOLS.Elevation.Hint")}>
					<label class="tht-toolbar-item-label" for="thtPaintToolbar_selectedElevation">
						${l("TERRAINHEIGHTTOOLS.Elevation.Name")}
					</label>
					<input
						type="number"
						class="text-align-center"
						id="thtPaintToolbar_selectedElevation"
						min="0"
						.value=${computed(() => toSceneUnits(paintingConfig$.elevation.value))}
						?disabled=${computed(() => !selectedTerrainType$.value?.usesHeight)}
						@change=${e => paintingConfig$.elevation.value = fromSceneUnits(this.#getInputValue(e))}
						@blur=${e => e.target.value = toSceneUnits(paintingConfig$.elevation.value)}
					>
				</div>
			` : html`
				<div class="tht-toolbar-num-input">
					<label class="tht-toolbar-item-label" for="thtPaintToolbar_selectedBottom">
						${l("TERRAINHEIGHTTOOLS.Bottom")}
					</label>
					<input
						type="number"
						class="text-align-center"
						id="thtPaintToolbar_selectedBottom"
						min="0"
						.max=${computed(() => toSceneUnits(paintingConfigTop$.value))}
						.value=${computed(() => toSceneUnits(paintingConfig$.elevation.value))}
						?disabled=${computed(() => !selectedTerrainType$.value?.usesHeight)}
						@change=${e => setPaintingConfigBottom(fromSceneUnits(this.#getInputValue(e)))}
						@blur=${e => e.target.value = toSceneUnits(paintingConfig$.elevation.value)}
					>
				</div>

				<div class="tht-toolbar-num-input">
					<label class="tht-toolbar-item-label" for="thtPaintToolbar_selectedTop">
						${l("TERRAINHEIGHTTOOLS.Top")}
					</label>
					<input
						type="number"
						class="text-align-center"
						id="thtPaintToolbar_selectedTop"
						.min=${computed(() => toSceneUnits(paintingConfig$.elevation.value))}
						.value=${computed(() => toSceneUnits(paintingConfigTop$.value))}
						?disabled=${computed(() => !selectedTerrainType$.value?.usesHeight)}
						@change=${e => setPaintingConfigTop(fromSceneUnits(this.#getInputValue(e)))}
						@blur=${e => e.target.value = toSceneUnits(paintingConfigTop$.value)}
					>
				</div>
			`)}

			<button type="button" class="flex0" @click=${this.#openConfigurationMenu} style="border: 0">
				<i class="fas fa-cog"></i>
			</button>
		`;
	}

	#renderTerrainTypePickerDropdown = () => html`
		<ul class="tht-terrain-type-palette">
			${terrainTypes$.value.map(terrainType => html`
				<li
					class=${computed(() => classMap({ active: paintingConfig$.terrainTypeId.value === terrainType.id }))}
					@click=${() => this.#selectTerrainType(terrainType)}
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
	`;

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
				value: drawingModeTypes.fill,
				icon: "fas fa-fill-drip",
				toolclip: {
					heading: "CONTROLS.TerrainHeightToolsDrawingModeFill",
					src: `modules/${moduleName}/toolclips/drawingmode-fill.mp4`,
					items: [
						{ heading: "CONTROLS.TerrainHeightToolsDrawingModeFill", content: "CONTROLS.TerrainHeightToolsDrawingModeFillClick" },
						{ paragraph: "CONTROLS.TerrainHeightToolsDrawingModeFillP" }
					]
				}
			},
			{
				value: drawingModeTypes.pipette,
				icon: "fas fa-eye-dropper",
				toolclip: {
					heading: "CONTROLS.TerrainHeightToolsDrawingModePipette",
					items: [
						{ heading: "CONTROLS.Copy", content: "CONTROLS.TerrainHeightToolsDrawingModePipetteClick" },
						{ paragraph: "CONTROLS.TerrainHeightToolsDrawingModePipetteP" }
					]
				}
			}
		].filter(Boolean);
	}

	/** @param {import("../stores/terrain-types.mjs").TerrainType} terrainType */
	#selectTerrainType(terrainType) {
		paintingConfig$.value = {
			terrainTypeId: terrainType.id,
			height: terrainType.defaultHeight ?? paintingConfig$.height.value,
			elevation: terrainType.defaultElevation ?? paintingConfig$.elevation.value
		};
		this.#terrainTypeSelectRef.value?.close();
	}

	/**
	 * @param {KeyboardEvent} event
	 * @param {number} min
	 */
	#getInputValue(event, min = 0) {
		const value = +event.currentTarget.value;
		return Math.max(isNaN(value) ? 0 : value, min);
	}

	/** @param {PointerEvent} e */
	#openConfigurationMenu(e) {
		ContextMenu.open(e, [
			{
				type: "header",
				label: l("TERRAINHEIGHTTOOLS.PaintMode.Label")
			},
			...Object.keys(terrainPaintMode).map(mode => {
				const modePascal = mode[0].toUpperCase() + mode.substring(1);
				return {
					label: l(`TERRAINHEIGHTTOOLS.PaintMode.${modePascal}.Name`),
					hint: l(`TERRAINHEIGHTTOOLS.PaintMode.${modePascal}.Hint`),
					icon: `fas fa-check${paintingConfig$.mode.value === mode ? "" : " opacity-0"} tht-terrain-paint-mode-context-icon`,
					onClick: () => paintingConfig$.mode.value = mode
				};
			}),
			{
				type: "separator"
			},
			{
				label: paintToolbarUseHeightElevation$.value
					? l("TERRAINHEIGHTTOOLS.UseBottomTop")
					: l("TERRAINHEIGHTTOOLS.UseHeightElevation"),
				icon: "fas fa-arrow-up-arrow-down",
				onClick: () => game.settings.set(moduleName, settingNames.paintToolbarUseHeightElevation, !paintToolbarUseHeightElevation$.value)
			},
			{
				label: l("SETTINGS.TerrainTypes.Button"),
				icon: "fas fa-cog",
				onClick: () => new TerrainTypesConfig().render(true)
			}
		]);
	}

	/** @param {Event} e */
	#onTerrainTypeSelectionOpen(e) {
		// If no terrain types have been set, instead of opening the dropdown open the config dialog
		if (!terrainTypes$.value.length) {
			e.preventDefault();
			new TerrainTypesConfig().render(true);
			return;
		}
	}
}
