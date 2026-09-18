/** @import { TerrainShape } from "../geometry/terrain-shape.mjs" */
/** @import { TerrainType } from "../stores/terrain-types.mjs" */
import { computed, effect, signal } from "@preact/signals-core";
import { html, nothing, svg } from "lit";
import { when } from "lit/directives/when.js";
import { keyPressed$ } from "../config/keybindings.mjs";
import { showTerrainStackViewerOnTokenLayer$, terrainStackViewerDisplayMode$ } from "../config/settings.mjs";
import { keybindings, terrainHeightEditorControlName } from "../consts.mjs";
import { LINE_TYPES } from "../shared/consts.mjs";
import { canvasReady$, cursorWorldPosition$ } from "../stores/canvas.mjs";
import { activeControl$ } from "../stores/scene-controls.mjs";
import { allTerrainShapes$, getShapesAtPoint } from "../stores/terrain-manager.mjs";
import { getTerrainType } from "../stores/terrain-types.mjs";
import { fromSceneUnits, toSceneUnits } from "../utils/grid-utils.mjs";
import { prettyFraction } from "../utils/misc-utils.mjs";
import { getTokenHeight } from "../utils/token-utils.mjs";
import { styleTerrainColor } from "./directives/style-terrain-color.mjs";
import { LitApplicationMixin } from "./mixins/lit-application-mixin.mjs";

const TEMPLATEMACRO_ID = "templatemacro";

// Bumped on template CRUD so the viewer refreshes while hovering a zone, not just on cursor move.
const templatesVersion$ = signal(0);
for (const hook of ["createMeasuredTemplate", "updateMeasuredTemplate", "deleteMeasuredTemplate"])
	Hooks.on(hook, () => templatesVersion$.value++);

const tokensVersion$ = signal(0);
for (const hook of ["createToken", "updateToken", "deleteToken", "controlToken"])
	Hooks.on(hook, () => tokensVersion$.value++);

const tokenColumnX = 174.8;
const tokenColumnWidth = 41.4;
const tokenAvatarRadius = 9.5;

// How many pixels each unit in height is represented by in proportional mode.
const proportionalModeScale = 28;

const proportionalModePadding = 1;

// How many pixels a 1-width border should be shown as in the SVG.
const proportionalModeBorderScale = 0.5;

const { ApplicationV2 } = foundry.applications.api;

/** @type {(k: string) => string} */
const l = k => game.i18n.localize(k);

export class TerrainStackViewer extends LitApplicationMixin(ApplicationV2) {

	static DEFAULT_OPTIONS = {
		id: "tht_terrainStackViewer",
		window: {
			title: "TERRAINHEIGHTTOOLS.Terrain",
			icon: "fas fa-chart-simple",
			contentClasses: ["terrain-height-tool-window"],
			minimizable: false,
			positioned: false
		}
	};

	#terrainShapesUnderMouse$ = computed(() => {
		if (!canvasReady$.value) return [];

		// Reference the Signal in allTerrainShapes so that this computed re-calculates when that changes.
		// getShapesAtPoint uses the quadtree (which is not a signal), so does not create a dependency, but this does.
		// eslint-disable-next-line no-unused-vars
		const _ = allTerrainShapes$.value;

		const { x, y } = cursorWorldPosition$.value;
		return getShapesAtPoint(x, y);
	});

	#templatesUnderMouse$ = computed(() => {
		if (!canvasReady$.value) return [];

		// Reference templatesVersion$ so edits to placed templates re-run this, not just cursor moves.
		// eslint-disable-next-line no-unused-vars
		const _ = templatesVersion$.value;

		const api = game.modules.get(TEMPLATEMACRO_ID)?.api;
		if (!api?.getTemplatesAtPoint) return [];

		const { x, y } = cursorWorldPosition$.value;
		try { return api.getTemplatesAtPoint(x, y); }
		catch { return []; }
	});

	#tokensUnderMouse$ = computed(() => {
		if (!canvasReady$.value) return [];

		// eslint-disable-next-line no-unused-vars
		const _ = tokensVersion$.value;

		const { x, y } = cursorWorldPosition$.value;
		const previews = canvas.tokens?.preview?.children ?? [];
		const placed = (canvas.tokens?.placeables ?? []).filter(token => !token._preview);
		return [...previews, ...placed]
			.filter(token => token.visible && token.getShape().contains(x - token.x, y - token.y))
			.sort((first, second) => (Number(second.controlled) - Number(first.controlled))
				|| (second.document.elevation - first.document.elevation));
	});

	// The stack viewer panel is visible when any of the following are true:
	// - The hotkey is being held down.
	// - The user is on the Terrain Height Tools toolbar
	// - The user is on the token layer, is hovering over a cell with terrain data, and has the option to
	//   show the toolbox on the token layer turned on.
	#isVisible$ = computed(() =>
		keyPressed$[keybindings.showTerrainStack].value ||
		activeControl$.value === terrainHeightEditorControlName ||
		(
			activeControl$.value === "tokens" &&
			showTerrainStackViewerOnTokenLayer$.value &&
			(this.#terrainShapesUnderMouse$.value.length > 0 || this.#templatesUnderMouse$.value.length > 0)
		));

	constructor() {
		super();

		effect(() => {
			const isVisible = this.#isVisible$.value;

			// Show/hide application window
			if (this.element)
				this.element.style.display = isVisible ? "block" : "none";

			// When terrain is changed, if we're drawing the stack viewer, update it
			// We track the terrainShapesUnderMouse$ signal in this effect so that the shape collision test is only run
			// when neccessary. If we were to subscribe to #terrainShapesUnderMouse$ instead, then it would always have
			// an active subscription and therefore would always be running the collision checks even if the viewer was
			// known to not be visible.
			if (isVisible) {
				// eslint-disable-next-line no-unused-vars
				const _ = this.#terrainShapesUnderMouse$.value;
				// eslint-disable-next-line no-unused-vars
				const __ = this.#templatesUnderMouse$.value;
				// eslint-disable-next-line no-unused-vars
				const ___ = this.#tokensUnderMouse$.value;
				this.render({ force: !this.rendered });
			}
		});

		// When display mode setting is changed, re-render
		terrainStackViewerDisplayMode$.subscribe(() => {
			if (this.#isVisible$.value)
				this.render({ force: !this.rendered });
		});
	}

	/** @override */
	bringToFront() {}

	/** @override */
	async _renderFrame(options) {
		const frame = await super._renderFrame(options);
		this.window.close.remove(); // Remove close button
		return frame;
	}

	/** @override */
	_insertElement(element) {
		element.style.display = this.#isVisible$.value ? "block" : "none";
		const existing = document.getElementById(element.id);
		if (existing) existing.replaceWith(element);
		else foundry.ui.players.element.before(element);
	}

	/** @override */
	_renderHTML() {
		const shapes = this.#terrainShapesUnderMouse$.value;
		const templates = this.#templatesUnderMouse$.value;
		const tokens = this.#tokensUnderMouse$.value;

		if (shapes.length === 0 && templates.length === 0 && tokens.length === 0) {
			return html`<p style="text-align: center;">${l("TERRAINHEIGHTTOOLS.HoverTerrainToShowDetails")}</p>`;
		}

		const tokenBlocks = tokens.map(token => {
			const bottom = fromSceneUnits(token.document.elevation);
			const height = fromSceneUnits(tokenHeightOf(token.document));
			return { token, bottom, height, top: bottom + height, color: tokenColor(token) };
		});

		const shapesWithMeta = shapes.map(shape => {
			const terrainType = getTerrainType(shape.terrainTypeId);
			return { shape, terrainType };
		});

		const nonZoneShapes = shapesWithMeta
			.filter(({ terrainType }) => terrainType.usesHeight)
			.sort((a, b) => b.shape.elevation - a.shape.elevation);

		const zoneShapes = shapesWithMeta
			.filter(({ terrainType }) => !terrainType.usesHeight)
			.sort((a, b) => a.terrainType.name.localeCompare(b.terrainType.name, undefined, { sensitivity: "accent" }));

		// Gated templatemacro templates have a real elevation band; render them in the proportional/
		// vertical-ruler block alongside terrain shapes instead of the flat-text fallback.
		const flatTemplates = templates.filter(t => !t.gated);
		for (const t of templates.filter(t => t.gated)) {
			nonZoneShapes.push({
				shape: { top: t.top, elevation: t.base, bottom: t.base, height: t.range },
				terrainType: {
					name: t.label,
					usesHeight: true,
					lineType: LINE_TYPES.SOLID,
					lineWidth: 4,
					lineColor: t.borderColor,
					lineOpacity: t.borderOpacity,
					lineColorAnimation: null,
					fillType: 1,
					fillColor: t.fillColor,
					fillOpacity: t.fillOpacity,
					fillColorAnimation: null,
					textColor: "#ffffff",
					textColorAnimation: null,
					triggers: t.hasTrigger ? [{ enabled: true }] : []
				}
			});
		}
		nonZoneShapes.sort((a, b) => b.shape.elevation - a.shape.elevation);

		const tops = [...nonZoneShapes.map(({ shape }) => shape.top), ...tokenBlocks.map(block => block.top)];
		const highestElevation = tops.length ? Math.max(...tops) : 0;
		const stacked = nonZoneShapes.length > 0 || tokenBlocks.length > 0;

		const configuredDisplayMode = terrainStackViewerDisplayMode$.value;
		const isProportionalDisplayMode = configuredDisplayMode === "auto"
			? highestElevation <= 8
			: configuredDisplayMode === "proportional";

		return html`
			${when(stacked || zoneShapes.length > 0, () => html`
				<!-- Non-zone shapes (terrain with height + gated templatemacro templates) -->
				${stacked ? (isProportionalDisplayMode
					? this.#renderProportionalDisplay(nonZoneShapes, tokenBlocks, highestElevation)
					: this.#renderCompactDisplay(nonZoneShapes, tokenBlocks)) : nothing}

				<!-- Separator -->
				${when(stacked && zoneShapes.length, () => html`<hr>`)}

				<!-- Zones -->
				${zoneShapes.map(({ terrainType }) => html`
					<div class="terrain-layer-block" ${styleTerrainColor(terrainType, { lineWidthCssPropertyName: "" })}>
						<p class="terrain-layer-block-title">${terrainType.name}${triggerIcon(terrainType)}</p>
					</div>
				`)}
			`)}

			<!-- Separator between terrain and non-gated templatemacro zones -->
			${when((shapes.length > 0 || stacked) && flatTemplates.length > 0, () => html`<hr>`)}

			<!-- Non-gated templatemacro zones (gated ones are in the proportional display above) -->
			${flatTemplates.length > 0 ? this.#renderTemplates(flatTemplates) : nothing}
		`;
	}

	/** @param {{ label: string; hasTrigger: boolean; fillColor: string; borderColor: string; fillOpacity: number; borderOpacity: number; gated: boolean; base: number; top: number; range: number; }[]} templates */
	#renderTemplates(templates) {
		const f = v => prettyFraction(v);
		return html`${templates.map(t => {
			const style = `background-color: ${rgba(t.fillColor, t.fillOpacity)}; border-color: ${rgba(t.borderColor, t.borderOpacity)};`;
			return html`
				<div class="terrain-layer-block" style=${style}>
					<p class="terrain-layer-block-title">
						${t.label}${t.hasTrigger ? html` <i class="fas fa-bolt" title=${l("TERRAINHEIGHTTOOLS.Trigger.Tab")}></i>` : ""}
					</p>
					${when(t.gated, () => html`
						<p class="terrain-layer-block-height">${f(t.base)} → ${f(t.top)} (${l("Height")} ${f(t.range)})</p>
					`)}
				</div>
			`;
		})}`;
	}

	// TODO: how to handle case where multiple shapes with height overlap at same elevation (e.g. from a provider)?

	/**
	 * @param {{ shape: TerrainShape; terrainType: TerrainType; }[]} shapes
	 * @param {TokenBlock[]} tokenBlocks
	 * @param {number} highestElevation
	 */
	#renderProportionalDisplay(shapes, tokenBlocks, highestElevation) {
		const viewBoxY = ((highestElevation + 0.5) * -proportionalModeScale) - proportionalModePadding;
		const viewBoxH = ((highestElevation + 0.5) * proportionalModeScale) + (2 * proportionalModePadding);
		const viewBox = `0 ${viewBoxY} 230 ${viewBoxH}`;

		const terrainWidth = tokenBlocks.length ? "57%" : "80%";
		const terrainLabelX = tokenBlocks.length ? "43.5%" : "55%";
		const barWidth = (tokenColumnWidth - (2 * (tokenBlocks.length - 1))) / Math.max(1, tokenBlocks.length);
		const format = value => prettyFraction(toSceneUnits(value));

		return html`
			<svg xmlns="http://www.w3.org/2000/svg" viewBox=${viewBox}>
				<!-- Vertical axis labels -->
				<line class="axis-line"
					x1="0%" y1="0"
					x2="100%" y2="0"
				/>

				${Array.from({ length: Math.ceil(highestElevation) }, (_, i) => svg`
					<line class="axis-line"
						x1="10%" y1=${(i + 1) * -proportionalModeScale}
						x2="95%" y2=${(i + 1) * -proportionalModeScale}
					/>
					<text class="axis-line-label"
						x="8%" y=${(i + 1) * -proportionalModeScale}
						text-anchor="end" dominant-baseline="middle"
					>
						${toSceneUnits(i + 1)}
					</text>
				`)}

				<!-- Shape blocks -->
				${shapes.map(({ shape, terrainType }) => {
					const borderWidth = terrainType.lineType === LINE_TYPES.NONE ? 0 : terrainType.lineWidth;
					return svg`
						<rect
							x="15%" y=${(shape.top * -proportionalModeScale) + (borderWidth * proportionalModeBorderScale * 0.5) + proportionalModePadding}
							width=${terrainWidth} height=${(shape.height * proportionalModeScale) + (borderWidth * -proportionalModeBorderScale) + (proportionalModePadding * -2)}
							stroke-width=${borderWidth * proportionalModeBorderScale}
							${styleTerrainColor(terrainType, { fillColorCssPropertyName: "fill", lineColorCssPropertyName: "stroke", lineWidthCssPropertyName: "", textColorCssPropertyName: "" })}
						/>

						<text class="shape-label"
							x=${terrainLabelX} y=${(shape.elevation + (shape.height / 2)) * -proportionalModeScale}
							text-anchor="middle" dominant-baseline="middle"
							${styleTerrainColor(terrainType, { fillColorCssPropertyName: "", lineColorCssPropertyName: "", lineWidthCssPropertyName: "", textColorCssPropertyName: "fill" })}
						>
							${terrainType.name}${hasEnabledTrigger(terrainType) ? " ⚡" : ""}
						</text>
					`;
				})}

				<!-- Token bars -->
				${tokenBlocks.map((block, index) => {
					const barX = tokenColumnX + (index * (barWidth + 2));
					const barY = (block.top * -proportionalModeScale) + proportionalModePadding + 1;
					const barHeight = (block.height * proportionalModeScale) - (proportionalModePadding * 2) - 2;
					const centreX = barX + (barWidth / 2);
					const radius = Math.min(tokenAvatarRadius, (barWidth / 2) - 2);
					const avatarY = barY + Math.min(radius + 4, barHeight / 2);
					const showAvatar = radius >= 5;
					const showLabel = barHeight >= 48;
					const clipId = `tht-stack-avatar-${index}`;
					return svg`
						<rect class="token-bar"
							x=${barX} y=${barY} width=${barWidth} height=${barHeight}
							style=${`fill: ${rgba(block.color, 0.32)}; stroke: ${block.color};`}
						/>

						${when(showAvatar, () => svg`
							<clipPath id=${clipId}><circle cx=${centreX} cy=${avatarY} r=${radius} /></clipPath>
							<image href=${block.token.document.texture.src}
								x=${centreX - radius} y=${avatarY - radius} width=${radius * 2} height=${radius * 2}
								clip-path=${`url(#${clipId})`} preserveAspectRatio="xMidYMid slice"
							/>
							<circle class="token-avatar-ring"
								cx=${centreX} cy=${avatarY} r=${radius}
								style=${`stroke: ${block.color};`}
							/>
						`)}

						${when(showLabel, () => svg`
							<text class="token-bar-label"
								x=${centreX} y=${barY + (radius * 2) + 18}
								text-anchor="middle" dominant-baseline="middle"
								style=${`fill: ${block.color};`}
							>
								${format(block.bottom)} → ${format(block.top)}
							</text>
						`)}
					`;
				})}
			</svg>
		`;
	}

	/**
	 * @param {{ shape: TerrainShape; terrainType: TerrainType; }[]} shapes
	 * @param {TokenBlock[]} tokenBlocks
	 */
	#renderCompactDisplay(shapes, tokenBlocks) {
		const format = value => prettyFraction(toSceneUnits(value));

		const rows = [
			...shapes.map(({ shape, terrainType }) => ({
				elevation: shape.elevation,
				content: html`
					<div class="terrain-layer-block" ${styleTerrainColor(terrainType, { lineWidthCssPropertyName: "" })}>
						<p class="terrain-layer-block-title">${terrainType.name}${triggerIcon(terrainType)}</p>
						<p class="terrain-layer-block-height">${format(shape.bottom)} → ${format(shape.top)} (${l("Height")} ${format(shape.height)})</p>
					</div>
				`
			})),
			...tokenBlocks.map(block => {
				const name = viewableName(block.token);
				return {
					elevation: block.bottom,
					content: html`
						<div class="terrain-layer-block token-block"
							style=${`border-color: ${block.color}; background-color: ${rgba(block.color, 0.32)};`}>
							<img class="token-avatar" src=${block.token.document.texture.src} alt="">
							<div>
								${name ? html`<p class="terrain-layer-block-title">${name}</p>` : nothing}
								<p class="terrain-layer-block-height">${format(block.bottom)} → ${format(block.top)} (${l("Height")} ${format(block.height)})</p>
							</div>
						</div>
					`
				};
			})
		].sort((first, second) => second.elevation - first.elevation);

		return html`${rows.map(row => row.content)}`;
	}
}

/** @typedef {{ token: foundry.canvas.placeables.Token; bottom: number; height: number; top: number; color: string }} TokenBlock */

function tokenHeightOf(tokenDoc) {
	const gameplayHeight = game.modules.get("lancer-automations")?.api?.laTokenGameplayHeight;
	return gameplayHeight ? gameplayHeight(tokenDoc) : getTokenHeight(tokenDoc);
}

function tokenColor(token) {
	const factions = game.modules.get("token-factions");
	if (!factions?.active || !factions.api?.getFactionColor) return dispositionColor(token);

	return factions.api.getFactionColor(token.id)?.INT_S ?? dispositionColor(token);
}

function dispositionColor(token) {
	const { HOSTILE, FRIENDLY, SECRET } = CONST.TOKEN_DISPOSITIONS;
	const colors = CONFIG.Canvas.dispositionColors;
	const byDisposition = { [HOSTILE]: colors.HOSTILE, [FRIENDLY]: colors.FRIENDLY, [SECRET]: colors.SECRET };
	return Color.from(byDisposition[token.document.disposition] ?? colors.NEUTRAL).toString();
}

function viewableName(token) {
	return token._canViewMode?.(token.document.displayName) ? token.document.name : null;
}

// "#rrggbb" (or a numeric colour) + alpha -> "rgba(...)", so template blocks get THT's translucent fill.
function rgba(hex, alpha) {
	const n = typeof hex === "number" ? hex : Number.parseInt(String(hex ?? "#000000").replace("#", ""), 16);
	const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
	return `rgba(${r}, ${g}, ${b}, ${alpha ?? 1})`;
}

function hasEnabledTrigger(terrainType) {
	return (terrainType?.triggers ?? []).some(t => t.enabled);
}

function triggerIcon(terrainType) {
	return hasEnabledTrigger(terrainType)
		? html` <i class="fas fa-bolt" title=${game.i18n.localize("TERRAINHEIGHTTOOLS.Trigger.Tab")}></i>`
		: "";
}
