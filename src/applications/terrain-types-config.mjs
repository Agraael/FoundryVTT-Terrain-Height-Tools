/** @import { Signal } from "@preact/signals-core" */
/** @import { TerrainType } from "../stores/terrain-types.mjs" */
import { html } from "@lit-labs/preact-signals";
import { computed, effect, signal } from "@preact/signals-core";
import { classMap } from "lit/directives/class-map.js";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { lineTypes, moduleName, settingNames, triggerActionTypes, triggerElevationRules, triggerEventModes, triggerTargetTokens } from "../consts.mjs";
import { createDefaultTerrainType, createDefaultTrigger, previewTerrainTypes$, terrainTypes$ } from "../stores/terrain-types.mjs";
import { abortableSubscribe } from "../utils/signal-utils.mjs";
import { colorPicker } from "./directives/color-picker.mjs";
import { rangePicker } from "./directives/range-picker.mjs";
import { selectOptions } from "./directives/select-options.mjs";
import { LitApplicationMixin } from "./mixins/lit-application-mixin.mjs";
import { TerrainTypesPreset } from "./terrain-types-presets.mjs";

/** @typedef {(context: { terrainType: TerrainType; index: number; }) => string | HTMLElement | import("lit").TemplateResult} UiPartRenderer */

const { ApplicationV2, DialogV2 } = foundry.applications.api;

/** @type {(k: string) => string} */
const l = k => game.i18n.localize(k);

/** Returns token-factions teams when the module is active and Advanced Factions colouring is on. */
function getAdvancedFactionTeams() {
	if (!game.modules.get("token-factions")?.active) return [];
	if (game.settings.get("token-factions", "color-from") !== "advanced-factions") return [];
	return game.settings.get("token-factions", "team-setup") || [];
}

export class TerrainTypesConfig extends LitApplicationMixin(ApplicationV2) {

	static DEFAULT_OPTIONS = {
		id: "tht_terrainTypesConfig",
		tag: "form",
		classes: ["sheet"],
		window: {
			title: "SETTINGS.TerrainTypes.Button",
			contentClasses: ["standard-form"],
			resizable: true
		},
		position: {
			width: 870,
			height: 720
		},
		form: {
			handler: this.#onFormSubmit,
			submitOnChange: true,
			closeOnSubmit: false
		}
	};

	/** @type {Signal<TerrainType[]>} */
	#terrainTypes = signal([...terrainTypes$.value]);

	/** @type {Signal<string | undefined>} */
	#selectedTerrainTypeId = signal(terrainTypes$.value[0]?.id);

	#selectedTab = signal("lines");

	/** @type {Map<string, any>} CodeMirror instances keyed by trigger ID. */
	#codeMirrors = new Map();

	/** @type {(() => void) | undefined} Disposer for the tab-change effect. */
	#tabEffectDisposer;

	/** @override */
	_renderHTML() {
		return html`
			<div class="terrain-type-list-container">
				<!-- List of terrain types -->
				<ul class="terrain-type-list">
					${repeat(this.#terrainTypes.value, terrainType => terrainType.id, terrainType => html`
						<li
							class=${computed(() => classMap({ active: terrainType.id === this.#selectedTerrainTypeId.value }))}
							@click=${() => this.#selectedTerrainTypeId.value = terrainType.id}
						>
							<span>${terrainType.name}</span>
							<button type="button" title=${l("TERRAINHEIGHTTOOLS.MoveUp")} @click=${() => this.#moveTerrainType(terrainType.id, -1)}><i class="fas fa-arrow-up"></i></button>
							<button type="button" title=${l("TERRAINHEIGHTTOOLS.MoveDown")} @click=${() => this.#moveTerrainType(terrainType.id, 1)}><i class="fas fa-arrow-down"></i></button>
							<button type="button" title=${l("Duplicate")} @click=${() => this.#duplicateTerrainType(terrainType.id)}><i class="fas fa-copy"></i></button>
							<button type="button" title=${l("Delete")} @click=${() => this.#deleteTerrainType(terrainType.id)}><i class="fas fa-trash"></i></button>
						</li>
					`)}
				</ul>

				<div class="terrain-type-list-vertical-separator"></div>

				<!-- Terrain type form -->
				<div class="terrain-type-edit-pane">
					${repeat(this.#terrainTypes.value, terrainType => terrainType.id, (terrainType, terrainTypeIndex) => html`
						<div
							class="standard-form"
							style=${computed(() => styleMap({ display: terrainType.id === this.#selectedTerrainTypeId.value ? "flex" : "none" }))}
							data-terrain-type-id=${terrainType.id}
						>
							<input type="hidden" name="${terrainTypeIndex}.id" value=${terrainType.id}>

							<div class="form-group">
								<label>${l("Name")}</label>
								<div class="form-fields">
									<input type="text" name="${terrainTypeIndex}.name" value=${terrainType.name} placeholder=${l("Name")}>
								</div>
							</div>

							<nav class="sheet-tabs tabs">
								${Object.entries(configTabs).map(([tabId, tab]) => html`
									<a
										class=${computed(() => classMap({ active: this.#selectedTab.value === tabId }))}
										@click=${() => this.#selectedTab.value = tabId}
										data-tab
									>
										<i class=${tab.icon}></i>
										<label>${l(tab.label)}</label>
									</a>
								`)}
							</nav>

							${Object.entries(configTabs).map(([tabId, tab]) => html`
								<div class=${computed(() => classMap({ tab: true, active: this.#selectedTab.value === tabId }))} data-tab>
									${tab.parts.map(part => {
										try {
											const result = part({ terrainType, index: terrainTypeIndex, html });
											return typeof result === "string" ? unsafeHTML(result) : result;
										} catch (err) {
											return html`<span>Failed to render part: ${err}</span>`;
										}
									})}
								</div>
							`)}
						</div>
					`)}
				</div>
			</div>

			<footer class="form-footer">
				<button type="button" @click=${() => this.#addTerrainType()}>
					<i class="fas fa-plus"></i>
					<label>${l("TERRAINHEIGHTTOOLS.AddTerrainType")}</label>
				</button>
				<button type="button" @click=${() => this.#showImportPresetsDialog()}>
					<i class="fas fa-palette"></i>
					<label>${l("TERRAINHEIGHTTOOLS.ImportTerrainTypesPreset")}</label>
				</button>
				<button type="button" @click=${() => this.#showImportTerrainTypeSettingsDialog()}>
					<i class="fas fa-upload"></i>
					<label>${l("TERRAINHEIGHTTOOLS.ImportTerrainTypes")}</label>
				</button>
				<button type="button" @click=${() => this.#showExportTerrainTypeSettingsDialog()}>
					<i class="fas fa-download"></i>
					<label>${l("TERRAINHEIGHTTOOLS.ExportTerrainTypes")}</label>
				</button>
				<button type="button" @click=${() => this.#saveTerrainTypes()}>
					<i class="fas fa-save"></i>
					<label>${l("Save Changes")}</label>
				</button>
			</footer>
		`;
	}

	_preFirstRender(options) {
		super._preFirstRender(options);

		// When user changes something, update the preview which will show on the scene
		abortableSubscribe(
			this.#terrainTypes,
			foundry.utils.debounce(t => previewTerrainTypes$.value = t, 500),
			this.closeSignal
		);
	}

	close(options) {
		previewTerrainTypes$.value = null;
		this.#tabEffectDisposer?.();
		this.#tabEffectDisposer = undefined;
		for (const cm of this.#codeMirrors.values()) cm.toTextArea();
		this.#codeMirrors.clear();
		return super.close(options);
	}

	// ---- //
	// Tabs //
	// ---- //
	/** @type {UiPartRenderer} */
	static _renderLinesTab = ({ terrainType, index }) => html`
		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.LineType")}</label>
			<div class="form-fields">
				<select name="${index}.lineType" data-dtype="Number">
					${selectOptions(lineTypes, {
						labelSelector: ([name]) => `TERRAINHEIGHTTOOLS.LineType${name.titleCase()}`,
						valueSelector: 1,
						selected: terrainType.lineType
					})}
				</select>
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.lineType === lineTypes.none })}>
			<label>${l("DRAWING.LineWidth")} <span class="hint">(${l("Pixels")})</span></label>
			<div class="form-fields">
				<input type="number" name="${index}.lineWidth" value=${terrainType.lineWidth} min="0" step="1">
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.lineType !== lineTypes.dashed })}>
			<label>${l("TERRAINHEIGHTTOOLS.LineDashSize")} / ${l("TERRAINHEIGHTTOOLS.LineGapSize")}</label>
			<div class="form-fields">
				<input type="number" name="${index}.lineDashSize" value=${terrainType.lineDashSize} min="1" step="1">
				<input type="number" name="${index}.lineGapSize" value=${terrainType.lineGapSize} min="1" step="1">
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.lineType === lineTypes.none })}>
			<label>${l("DRAWING.StrokeColor")}</label>
			<div class="form-fields">
				${colorPicker({ name: `${index}.lineColor`, value: terrainType.lineColor })}
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.lineType === lineTypes.none })}>
			<label>${l("DRAWING.LineOpacity")}</label>
			<div class="form-fields">
				${rangePicker({ name: `${index}.lineOpacity`, value: terrainType.lineOpacity, min: 0, max: 1, step: 0.05 })}
			</div>
		</div>

		<hr/>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.LineFadeDistance")} <span class="hint">(%)</span></label>
			<div class="form-fields">
				${rangePicker({ name: `${index}.lineFadeDistance`, value: terrainType.lineFadeDistance, min: 0, max: 0.5, step: 0.05 })}
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.lineFadeDistance === 0 })}>
			<label>${l("TERRAINHEIGHTTOOLS.LineFadeColor")}</label>
			<div class="form-fields">
				${colorPicker({ name: `${index}.lineFadeColor`, value: terrainType.lineFadeColor })}
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.lineFadeDistance === 0 })}>
			<label>${l("TERRAINHEIGHTTOOLS.LineFadeOpacity")}</label>
			<div class="form-fields">
				${rangePicker({ name: `${index}.lineFadeOpacity`, value: terrainType.lineFadeOpacity, min: 0, max: 1, step: 0.05 })}
			</div>
		</div>
	`;

	/** @type {UiPartRenderer} */
	static _renderFillTab = ({ terrainType, index }) => html`
		<div class="form-group">
			<label>${l("DRAWING.FillTypes")}</label>
			<div class="form-fields">
				<select name="${index}.fillType" data-dtype="Number">
					${selectOptions(CONST.DRAWING_FILL_TYPES, {
						labelSelector: ([name]) => `DRAWING.FillType${name.titleCase()}`,
						valueSelector: 1,
						selected: terrainType.fillType
					})}
				</select>
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.fillType === CONST.DRAWING_FILL_TYPES.NONE })}>
			<label>${l("DRAWING.FillColor")}</label>
			<div class="form-fields">
				${colorPicker({ name: `${index}.fillColor`, value: terrainType.fillColor })}
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.fillType === CONST.DRAWING_FILL_TYPES.NONE })}>
			<label>${l("DRAWING.FillOpacity")}</label>
			<div class="form-fields">
				${rangePicker({ name: `${index}.fillOpacity`, value: terrainType.fillOpacity, min: 0, max: 1, step: 0.1 })}
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.fillType !== CONST.DRAWING_FILL_TYPES.PATTERN })}>
			<label>${l("DRAWING.FillTexture")}</label>
			<div class="form-fields">
				<file-picker name="${index}.fillTexture" type="image" value=${terrainType.fillTexture}></file-picker>
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.fillType !== CONST.DRAWING_FILL_TYPES.PATTERN })}>
			<label>${l("TERRAINHEIGHTTOOLS.TextureOffset")} <span class="hint">(${l("Pixels")})</span></label>
			<div class="form-fields">
				<input type="number" name="${index}.fillTextureOffset.x" value=${terrainType.fillTextureOffset.x} step="1" required placeholder="X">
				<input type="number" name="${index}.fillTextureOffset.y" value=${terrainType.fillTextureOffset.y} step="1" required placeholder="Y">
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.fillType !== CONST.DRAWING_FILL_TYPES.PATTERN })}>
			<label>${l("TERRAINHEIGHTTOOLS.TextureScale")} <span class="hint">%</span></label>
			<div class="form-fields">
				<input type="number" name="${index}.fillTextureScale.x" value=${terrainType.fillTextureScale.x} step="1" required placeholder="X">
				<input type="number" name="${index}.fillTextureScale.y" value=${terrainType.fillTextureScale.y} step="1" required placeholder="Y">
			</div>
		</div>

		<div class=${classMap({ "form-group": true, "hidden": terrainType.fillType !== CONST.DRAWING_FILL_TYPES.PATTERN })}>
			<label>${l("TERRAINHEIGHTTOOLS.TextureOffsetAnimation")} <span class="hint">px/s</span></label>
			<div class="form-fields">
				<input type="number" name="${index}.fillTextureOffsetAnimation.x" value=${terrainType.fillTextureOffsetAnimation.x} step="1" required placeholder="X">
				<input type="number" name="${index}.fillTextureOffsetAnimation.y" value=${terrainType.fillTextureOffsetAnimation.y} step="1" required placeholder="Y">
			</div>
		</div>
	`;

	/** @type {UiPartRenderer} */
	static _renderLabelTab = ({ terrainType, index }) => html`
		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.LabelFormat.Name")}</label>
			<div class="form-fields">
				<textarea class="autoresize" name="${index}.textFormat">${terrainType.textFormat}</textarea>
				<div class="form-field-hint-icon" data-tooltip=${this.#getLabelPlaceholderTooltipHtml()} data-tooltip-class="tht_terrainTypesConfig_label-placeholder-tooltip">
					<i class="fas fa-question-circle"></i>
				</div>
			</div>
		</div>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.ElevatedLabelFormat.Name")}</label>
			<div class="form-fields">
				<textarea class="autoresize" name="${index}.elevatedTextFormat">${terrainType.elevatedTextFormat}</textarea>
				<div class="form-field-hint-icon" data-tooltip=${this.#getLabelPlaceholderTooltipHtml()} data-tooltip-class="tht_terrainTypesConfig_label-placeholder-tooltip">
					<i class="fas fa-question-circle"></i>
				</div>
			</div>
			<p class="hint">${l("TERRAINHEIGHTTOOLS.ElevatedLabelFormat.Hint")}</p>
		</div>

		<div class="form-group">
			<label>${l("DRAWING.FontFamily")}</label>
			<div class="form-fields">
				<select name="${index}.font">
					${selectOptions(FontConfig.getAvailableFontChoices(), { selected: terrainType.font })}
				</select>
			</div>
		</div>

		<div class="form-group">
			<label>${l("DRAWING.FontSize")}</label>
			<div class="form-fields">
				<input type="number" name="${index}.textSize" value=${terrainType.textSize} min="0" step="1">
			</div>
		</div>

		<div class="form-group">
			<label>${l("DRAWING.TextColor")}</label>
			<div class="form-fields">
				${colorPicker({ name: `${index}.textColor`, value: terrainType.textColor })}
			</div>
		</div>

		<div class="form-group">
			<label>${l("DRAWING.TextOpacity")}</label>
			<div class="form-fields">
				${rangePicker({ name: `${index}.textOpacity`, value: terrainType.textOpacity, min: 0, max: 1, step: 0.1 })}
			</div>
		</div>

		<hr/>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.StrokeThickness")} <span class="hint">(${l("Pixels")})</span></label>
			<div class="form-fields">
				<input type="number" name="${index}.textStrokeThickness" value=${terrainType.textStrokeThickness} min="0" step="1">
			</div>
		</div>

		<div class="form-group">
			<label>${l("DRAWING.StrokeColor")}</label>
			<div class="form-fields">
				${colorPicker({ name: `${index}.textStrokeColor`, value: terrainType.textStrokeColor, placeholder: "Automatic" })}
			</div>
		</div>

		<hr/>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.ShadowAmount")}</label>
			<div class="form-fields">
				<input type="number" name="${index}.textShadowAmount" value=${terrainType.textShadowAmount} min="0" step="1">
			</div>
		</div>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.ShadowColor")}</label>
			<div class="form-fields">
				${colorPicker({ name: `${index}.textShadowColor`, value: terrainType.textShadowColor, placeholder: "Automatic" })}
			</div>
		</div>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.ShadowOpacity")}</label>
			<div class="form-fields">
				${rangePicker({ name: `${index}.textShadowOpacity`, value: terrainType.textShadowOpacity, min: 0, max: 1, step: 0.1 })}
			</div>
		</div>

		<hr/>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.AllowTextRotation.Name")}</label>
			<div class="form-fields">
				<input type="checkbox" name="${index}.textRotation" .checked=${terrainType.textRotation}>
			</div>
			<p class="hint">${l("TERRAINHEIGHTTOOLS.AllowTextRotation.Hint")}</p>
		</div>
	`;

	/** @type {UiPartRenderer} */
	static _renderTriggersTab = ({ terrainType, index }) => {
		const triggers = terrainType.triggers ?? [];
		return html`
			<p class="hint">${l("TERRAINHEIGHTTOOLS.Trigger.TabHint")}</p>
			${repeat(triggers, t => t.id, (trigger, triggerIndex) => html`
				<div class="tht-trigger-row" data-trigger-id=${trigger.id}>
					<input type="hidden" name="${index}.triggers.${triggerIndex}.id" value=${trigger.id}>

					<div class="form-group">
						<label>${l("TERRAINHEIGHTTOOLS.Trigger.Enabled")}</label>
						<div class="form-fields">
							<input type="checkbox" name="${index}.triggers.${triggerIndex}.enabled" .checked=${trigger.enabled}>
							<button
								type="button"
								class="tht-trigger-delete"
								title=${l("Delete")}
								@click=${e => e.currentTarget.dispatchEvent(new CustomEvent("tht-trigger-delete", { bubbles: true, detail: { terrainTypeId: terrainType.id, triggerId: trigger.id } }))}
							><i class="fas fa-trash"></i></button>
						</div>
					</div>

					<div class="form-group">
						<label>${l("TERRAINHEIGHTTOOLS.Trigger.Mode.Label")}</label>
						<div class="form-fields">
							<select name="${index}.triggers.${triggerIndex}.mode">
								${selectOptions(triggerEventModes, { selected: trigger.mode })}
							</select>
						</div>
					</div>

					<div class="form-group">
						<label>${l("TERRAINHEIGHTTOOLS.Trigger.Elevation.Label")}</label>
						<div class="form-fields">
							<select
								name="${index}.triggers.${triggerIndex}.elevationRule"
								?disabled=${!terrainType.usesHeight}
							>
								${selectOptions(triggerElevationRules, {
									selected: terrainType.usesHeight ? trigger.elevationRule : "ANY_ELEVATION"
								})}
							</select>
						</div>
						${!terrainType.usesHeight ? html`<p class="hint">${l("TERRAINHEIGHTTOOLS.Trigger.Elevation.ZoneHint")}</p>` : ""}
					</div>

					<div class="form-group">
						<label>${l("TERRAINHEIGHTTOOLS.Trigger.Target.Label")}</label>
						<div class="form-fields">
							<select name="${index}.triggers.${triggerIndex}.targetTokens">
								${selectOptions(triggerTargetTokens, { selected: trigger.targetTokens })}
								${getAdvancedFactionTeams().map(team => html`
									<option value=${`TEAM:${team.id}`} ?selected=${trigger.targetTokens === `TEAM:${team.id}`}>${team.name}</option>
								`)}
							</select>
						</div>
					</div>

					<div class="form-group">
						<label>${l("TERRAINHEIGHTTOOLS.Trigger.Action.Label")}</label>
						<div class="form-fields">
							<select name="${index}.triggers.${triggerIndex}.actionType">
								${selectOptions(triggerActionTypes, { selected: trigger.actionType })}
							</select>
						</div>
					</div>

					<div class=${classMap({ "form-group": true, "hidden": trigger.actionType !== "macro" })}>
						<label>${l("TERRAINHEIGHTTOOLS.Trigger.Action.MacroId")}</label>
						<div class="form-fields">
							<input type="text" name="${index}.triggers.${triggerIndex}.actionMacroId" value=${trigger.actionMacroId ?? ""} placeholder="Macro UUID or ID">
						</div>
					</div>

					<div class=${classMap({ "form-group": true, "hidden": trigger.actionType !== "effect" })}>
						<label>${l("TERRAINHEIGHTTOOLS.Trigger.Action.EffectId")}</label>
						<div class="form-fields">
							<select name="${index}.triggers.${triggerIndex}.actionEffectId">
								<option value="" ?selected=${!trigger.actionEffectId}>${l("TERRAINHEIGHTTOOLS.Trigger.Action.None")}</option>
								${(CONFIG.statusEffects ?? []).map(e => html`
									<option value=${e.id} ?selected=${trigger.actionEffectId === e.id}>${l(e.name ?? e.label ?? e.id)}</option>
								`)}
							</select>
						</div>
						<p class="hint">${l("TERRAINHEIGHTTOOLS.Trigger.Action.EffectIdHint")}</p>
					</div>

					<div class=${classMap({ "form-group": true, "hidden": trigger.actionType !== "effect" })}>
						<label>${l("TERRAINHEIGHTTOOLS.Trigger.Action.EffectOverlay")}</label>
						<div class="form-fields">
							<input type="checkbox" name="${index}.triggers.${triggerIndex}.actionEffectOverlay" .checked=${!!trigger.actionEffectOverlay}>
						</div>
					</div>

					<div class=${classMap({ "form-group": true, "tht-trigger-code-group": true, "hidden": trigger.actionType !== "code" })}>
						<label>${l("TERRAINHEIGHTTOOLS.Trigger.Action.Code")}</label>
						<div class="tht-trigger-code-wrap">
							<textarea
								class="tht-trigger-code"
								name="${index}.triggers.${triggerIndex}.actionCode"
								rows="8"
								data-trigger-id=${trigger.id}
								spellcheck="false"
							>${trigger.actionCode ?? ""}</textarea>
						</div>
						<p class="hint">${l("TERRAINHEIGHTTOOLS.Trigger.Action.CodeHint")}</p>
					</div>

					<hr/>
				</div>
			`)}

			<button
				type="button"
				@click=${e => e.currentTarget.dispatchEvent(new CustomEvent("tht-trigger-add", { bubbles: true, detail: { terrainTypeId: terrainType.id } }))}
			>
				<i class="fas fa-plus"></i>
				<label>${l("TERRAINHEIGHTTOOLS.Trigger.Add")}</label>
			</button>
		`;
	};

	/** @type {UiPartRenderer} */
	static _renderOtherTab = ({ terrainType, index }) => html`
		<div class="form-group">
			<label for="terrainType${index}_isZone">${l("TERRAINHEIGHTTOOLS.IsZone.Name")}</label>
			<div class="form-fields">
				<input id="terrainType${index}_isZone" type="checkbox" name="${index}.isZone" .checked=${!terrainType.usesHeight}>
			</div>
			<p class="hint">${l("TERRAINHEIGHTTOOLS.IsZone.Hint")}</p>
		</div>

		<div class="form-group">
			<label for="terrainType${index}_isAlwaysVisible">${l("TERRAINHEIGHTTOOLS.IsAlwaysVisible.Name")}</label>
			<div class="form-fields">
				<input id="terrainType${index}_isAlwaysVisible" type="checkbox" name="${index}.isAlwaysVisible" .checked=${terrainType.isAlwaysVisible}>
			</div>
			<p class="hint">${l("TERRAINHEIGHTTOOLS.IsAlwaysVisible.Hint")}</p>
		</div>

		<div class="form-group">
			<label for="terrainType${index}_isSolid">${l("TERRAINHEIGHTTOOLS.IsSolid.Name")}</label>
			<div class="form-fields">
				<input id="terrainType${index}_isSolid" type="checkbox" name="${index}.isSolid" .checked=${terrainType.isSolid}>
			</div>
			<p class="hint">${l("TERRAINHEIGHTTOOLS.IsSolid.Hint")}</p>
		</div>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.DefaultHeight.Name")}</label>
			<div class="form-fields">
				<input type="number" name="${index}.defaultHeight" value=${terrainType.defaultHeight ?? ""} step="1">
			</div>
			<p class="hint">${l("TERRAINHEIGHTTOOLS.DefaultHeight.Hint")}</p>
		</div>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.DefaultElevation.Name")}</label>
			<div class="form-fields">
				<input type="number" name="${index}.defaultElevation" value=${terrainType.defaultElevation ?? ""} step="1">
			</div>
			<p class="hint">${l("TERRAINHEIGHTTOOLS.DefaultElevation.Hint")}</p>
		</div>

		<div class="form-group">
			<label>${l("TERRAINHEIGHTTOOLS.MovementPenalty.Name")}</label>
			<div class="form-fields">
				<input type="number" name="${index}.movementPenalty" value=${terrainType.movementPenalty} min="0" step="1">
			</div>
			<p class="hint">${l("TERRAINHEIGHTTOOLS.MovementPenalty.Hint")}</p>
		</div>
	`;

	// -------- //
	// Handlers //
	// -------- //
	/**
	 * @this {TerrainTypesConfig}
	 * @param {FormDataExtended} formData
	 */
	static #onFormSubmit(_event, _form, formData) {
		this.#terrainTypes.value = this.#getTerrainTypesFromForm(formData);
		this.render();
	}

	async #saveTerrainTypes() {
		const formData = new FormDataExtended(this.element);
		const terrainTypes = this.#getTerrainTypesFromForm(formData);
		await game.settings.set(moduleName, settingNames.terrainTypes, terrainTypes);
		await this.close();
	}

	#addTerrainType() {
		/** @type {TerrainType} */
		const newTerrainType = createDefaultTerrainType();
		this.#terrainTypes.value = [...this.#terrainTypes.value, newTerrainType];
		this.#selectedTerrainTypeId.value = newTerrainType.id;
		this.render();
	}

	/**
	 * @param {string} terrainTypeId
	 * @param {1 | -1} dir
	 */
	#moveTerrainType(terrainTypeId, dir) {
		const index = this.#terrainTypes.value.findIndex(t => t.id === terrainTypeId);

		// Cannot move if already at the start/end
		if ((dir > 0 && index >= this.#terrainTypes.value.length) || (dir < 0 && index <= 0)) return;

		const newTerrainTypes = [...this.#terrainTypes.value];
		const [terrainType] = newTerrainTypes.splice(index, 1);
		newTerrainTypes.splice(index + dir, 0, terrainType);
		this.#terrainTypes.value = newTerrainTypes;
		this.render();
	}

	/** @param {string} terrainTypeId */
	#duplicateTerrainType(terrainTypeId) {
		const existingTerrainType = this.#terrainTypes.value.find(t => t.id === terrainTypeId);
		const newTerrainType = {
			...existingTerrainType,
			id: foundry.utils.randomID(),
			name: existingTerrainType.name + " (2)"
		};
		this.#terrainTypes.value = [...this.#terrainTypes.value, newTerrainType];
		this.#selectedTerrainTypeId.value = newTerrainType.id;
		this.render();
	}

	/** @param {string} terrainTypeId */
	#deleteTerrainType(terrainTypeId) {
		this.#terrainTypes.value = this.#terrainTypes.value.filter(t => t.id !== terrainTypeId);
		this.render();
	}

	/** @param {string} terrainTypeId */
	#addTrigger(terrainTypeId) {
		this.#syncFromForm();
		this.#terrainTypes.value = this.#terrainTypes.value.map(t => t.id === terrainTypeId
			? { ...t, triggers: [...t.triggers ?? [], createDefaultTrigger()] }
			: t);
		this.render();
	}

	/** @param {string} terrainTypeId @param {string} triggerId */
	#deleteTrigger(terrainTypeId, triggerId) {
		this.#syncFromForm();
		this.#terrainTypes.value = this.#terrainTypes.value.map(t => t.id === terrainTypeId
			? { ...t, triggers: (t.triggers ?? []).filter(tr => tr.id !== triggerId) }
			: t);
		this.render();
	}

	#syncFromForm() {
		if (!this.element) return;
		for (const cm of this.#codeMirrors.values()) cm.save();
		const formData = new FormDataExtended(this.element);
		this.#terrainTypes.value = this.#getTerrainTypesFromForm(formData);
	}

	/** @override */
	_onRender(context, options) {
		super._onRender?.(context, options);
		this.#wireTriggerEvents();
		this.#attachCodeMirrors();
		// Tab switches re-patch the DOM via lit signals without re-firing _onRender, so we have
		// to listen for them directly to re-attach CodeMirror to newly-visible textareas.
		if (!this.#tabEffectDisposer) {
			let prev = this.#selectedTab.peek();
			this.#tabEffectDisposer = effect(() => {
				const next = this.#selectedTab.value;
				if (next === prev) return;
				prev = next;
				queueMicrotask(() => this.#attachCodeMirrors());
			});
		}
	}

	#wireTriggerEvents() {
		const root = this.element;
		if (!root || root._thtTriggerWired) return;
		root._thtTriggerWired = true;
		root.addEventListener("tht-trigger-add", e => {
			e.stopPropagation();
			this.#addTrigger(e.detail.terrainTypeId);
		});
		root.addEventListener("tht-trigger-delete", e => {
			e.stopPropagation();
			this.#deleteTrigger(e.detail.terrainTypeId, e.detail.triggerId);
		});
	}

	#attachCodeMirrors() {
		const CM = globalThis.CodeMirror;
		if (!CM) return;
		const root = this.element;
		if (!root) return;

		for (const [triggerId, cm] of this.#codeMirrors) {
			if (!root.contains(cm.getTextArea())) {
				cm.toTextArea();
				this.#codeMirrors.delete(triggerId);
			}
		}

		const textareas = root.querySelectorAll("textarea.tht-trigger-code");
		for (const textarea of textareas) {
			const triggerId = textarea.dataset.triggerId;
			if (!triggerId) continue;
			if (this.#codeMirrors.has(triggerId)) continue;
			// CM measures 0 width inside a hidden ancestor; defer until the textarea is visible.
			if (textarea.offsetParent === null) continue;
			const cm = CM.fromTextArea(textarea, {
				mode: "javascript",
				theme: "monokai",
				lineNumbers: true,
				lineWrapping: true,
				indentUnit: 2,
				tabSize: 2,
				viewportMargin: Infinity
			});
			this.#codeMirrors.set(triggerId, cm);
			cm.on("blur", () => {
				cm.save();
				textarea.dispatchEvent(new Event("change", { bubbles: true }));
			});
			requestAnimationFrame(() => cm.refresh());
		}

		for (const cm of this.#codeMirrors.values()) {
			if (cm.getWrapperElement().offsetParent !== null) cm.refresh();
		}
	}

	// ------------- //
	// Import/export //
	// ------------- //
	async #showImportPresetsDialog() {
		// Ask user to select a preset
		try {
			const { data, replace } = await TerrainTypesPreset.show();
			this._importTerrainTypeSettings(data, replace);
		} catch {
			return; // User cancelled
		}
	}

	#showImportTerrainTypeSettingsDialog() {
		new DialogV2({
			id: "tht_terrainTypesImport",
			window: {
				title: l("TERRAINHEIGHTTOOLS.ImportTerrainTypes"),
				icon: "fas fa-upload",
				resizable: true
			},
			content: `<textarea placeholder="${l("TERRAINHEIGHTTOOLS.ImportTextPlaceholder")}"></textarea>`,
			buttons: [
				{
					icon: "<i class='fas fa-upload'></i>",
					label: l("TERRAINHEIGHTTOOLS.ImportCombine"),
					action: "importCombine",
					callback: (_event, _target, element) => {
						if (!this._importTerrainTypeSettings(element.querySelector("textarea").value, false))
							throw new Error("Invalid data"); // Throw as an error to prevent dialog from closing
					}
				},
				{
					icon: "<i class='fas fa-upload'></i>",
					label: l("TERRAINHEIGHTTOOLS.ImportReplace"),
					action: "importReplace",
					callback: (_event, _target, element) => {
						if (!this._importTerrainTypeSettings(element.querySelector("textarea").value, true))
							throw new Error("Invalid data"); // Throw as an error to prevent dialog from closing
					}
				},
				{
					icon: "<i class='fas fa-times'></i>",
					label: l("Close"),
					action: "close"
				}
			],
			position: {
				width: 720,
				height: 350
			}
		}).render(true);
	}

	#showExportTerrainTypeSettingsDialog() {
		new DialogV2({
			id: "tht_terrainTypesExport",
			window: {
				title: l("TERRAINHEIGHTTOOLS.ExportTerrainTypes"),
				icon: "fas fa-download",
				contentClasses: ["terrain-height-tool-window"],
				resizable: true
			},
			content: `<textarea readonly>${JSON.stringify(this.#terrainTypes)}</textarea>`,
			buttons: [
				{
					icon: "<i class='fas fa-check'></i>",
					label: l("Close"),
					action: "close"
				}
			],
			position: {
				width: 720,
				height: 350
			}
		}).render(true);
	}

	/**
	 * @param {string | Partial<TerrainType>[]} data Data to import. Either a JSON string or an already-parsed array.
	 * @param {boolean} replace Whether or not to delete all existing terrain types on a successful import.
	 * @returns {boolean} Boolean indicating if the import was successful.
	 */
	_importTerrainTypeSettings(data, replace = false) {
		if (!data?.length) return;

		const parsed = Array.isArray(data) ? data : JSON.parse(data);

		if (!Array.isArray(parsed)) {
			ui.notifications.error("Failed to import terrain type data: Expected JSON to be an array.");
			return false;
		}

		const sanitisedData = [];
		const defaultTerrainType = createDefaultTerrainType();
		for (let i = 0; i < parsed.length; i++) {
			if (typeof parsed[i] !== "object") {
				ui.notifications.error(`Expected item at index ${i} to be an object, but found ${typeof parsed[i]}`);
				return false;
			}

			// If we're in combine mode (replace = false), then see if there is one already with the same ID
			const existing = replace
				? undefined
				: this.#terrainTypes.value.find(t => t.id === parsed[i].id);

			// Combine it with defaults,
			const sanitisedTerrainType = {
				...defaultTerrainType,
				...existing ?? {},
				...parsed[i]
			};

			// Check that property types match those declared in the defaultTerrainType
			for (const [key, value] of Object.entries(defaultTerrainType)) {
				if (value !== null && typeof sanitisedTerrainType[key] !== typeof value) {
					ui.notifications.error(`Expected property '${key}' of item at index ${i} to be of type ${typeof value}, but found ${typeof sanitisedTerrainType[key]}`);
					return false;
				}
			}

			sanitisedData.push(sanitisedTerrainType);
		}

		if (replace) {
			this.#terrainTypes.value = sanitisedData;
		} else {
			// If combining, remove any existing with the same ID as an imported one
			const newIds = sanitisedData.map(t => t.id);
			this.#terrainTypes.value = [
				...this.#terrainTypes.value.filter(t => !newIds.includes(t.id)),
				...sanitisedData
			];
		}

		this.render();
		return true;
	}

	// ---- //
	// Misc //
	// ---- //
	/**
	 * @param {FormDataExtended} formData
	 * @returns {TerrainType[]}
	 */
	#getTerrainTypesFromForm(formData) {
		/** @type {(TerrainType & { isZone: boolean; })[]} */
		const terrainTypes = Object.entries(foundry.utils.expandObject(formData.object))
			.sort((a, b) => a[0] - b[0])
			.map(([, value]) => value);

		// Since the "Uses height?" option was changed to "Is zone?" we need to invert the checkbox.
		// We don't create a new property for this because we don't want to mess with peoples' existing configs.
		for (const terrainType of terrainTypes) {
			terrainType.usesHeight = !terrainType.isZone;
			delete terrainType.isZone;

			// expandObject keys triggers as { "0": {...} }; flatten back to an array.
			if (terrainType.triggers && !Array.isArray(terrainType.triggers)) {
				terrainType.triggers = Object.entries(terrainType.triggers)
					.sort((a, b) => a[0] - b[0])
					.map(([, value]) => value);
			} else if (!terrainType.triggers) {
				terrainType.triggers = [];
			}
		}

		return terrainTypes;
	}

	static #getLabelPlaceholderTooltipHtml() {
		const placeholders = [
			["%h%", l("TERRAINHEIGHTTOOLS.Placeholders.Height")],
			["%e%", l("TERRAINHEIGHTTOOLS.Placeholders.Elevation")],
			["%t%", l("TERRAINHEIGHTTOOLS.Placeholders.Top")]
		];
		return `
			<p>${l("TERRAINHEIGHTTOOLS.Placeholders.PlaceholderHelpText")}</p>
			<table>
				<tbody>
					${placeholders.map(([key, description]) => `<tr>
						<th>${key}</th>
						<td>${description}</td>
					</tr>`).join("")}
				</tbody>
			</table>
		`;
	}
}

/** @type {Record<string, { label: string; icon: string; parts: UiPartRenderer[]; }>} */
const configTabs = {
	lines: {
		label: "DRAWING.TabLines",
		icon: "fas fa-paint-brush",
		parts: [TerrainTypesConfig._renderLinesTab]
	},
	fill: {
		label: "DRAWING.TabFill",
		icon: "fas fa-fill-drip",
		parts: [TerrainTypesConfig._renderFillTab]
	},
	label: {
		label: "DRAWING.TabText",
		icon: "fas fa-font",
		parts: [TerrainTypesConfig._renderLabelTab]
	},
	triggers: {
		label: "TERRAINHEIGHTTOOLS.Trigger.Tab",
		icon: "fas fa-bolt",
		parts: [TerrainTypesConfig._renderTriggersTab]
	},
	other: {
		label: "TERRAINHEIGHTTOOLS.Other",
		icon: "fas fa-cogs",
		parts: [TerrainTypesConfig._renderOtherTab]
	}
};

/**
 * Adds a new terrain type configuration section to the terrain type config UI.
 * @param {string | { id: string; label: string; icon: string; }} tab ID of an existing tab or config for a new tab to add to.
 * @param {UiPartRenderer} part UI configuration part to add.
 */
export function registerCustomConfigUi(tab, part) {
	if (typeof tab === "string") {
		const tabObj = configTabs[tab];
		if (!tabObj) throw new Error(`Could not add custom UI: Tab '${tab}' does not exist.`);
		tabObj.parts.push(part);

	} else {
		const { id, label, icon } = tab;
		const tabObj = configTabs[id];
		if (tabObj) {
			tabObj.parts.push(part);
		} else {
			configTabs[id] = { label, icon, parts: [part] };
		}
	}
}
