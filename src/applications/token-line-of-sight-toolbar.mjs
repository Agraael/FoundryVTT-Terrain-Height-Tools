/** @import { Signal } from "@preact/signals-core" */
import { html } from "@lit-labs/preact-signals";
import { computed, signal } from "@preact/signals-core";
import { classMap } from "lit/directives/class-map.js";
import { createRef, ref } from "lit/directives/ref.js";
import { styleMap } from "lit/directives/style-map.js";
import { tokenRelativeHeights } from "../consts.mjs";
import { includeNoHeightTerrain$, tokenLineOfSightConfig$ } from "../stores/line-of-sight.mjs";
import { abortableEffect, abortableSubscribe } from "../utils/signal-utils.mjs";
import { LitApplicationMixin } from "./mixins/lit-application-mixin.mjs";
import { ThtToolbarMixin } from "./mixins/tht-toolbar-mixin.mjs";

const { ApplicationV2 } = foundry.applications.api;

/** @type {(k: string) => string} */
const l = k => game.i18n.localize(k);

export class TokenLineOfSightToolbar extends ThtToolbarMixin(LitApplicationMixin(ApplicationV2)) {

	/** @type {Signal<1 | 2 | undefined>} */
	#selectingToken$ = signal(undefined);

	_isSelectingToken$ = computed(() => typeof this.#selectingToken$.value === "number");

	static DEFAULT_OPTIONS = {
		id: "tht_tokenLineOfSightToolbar",
		classes: ["tht-toolbar", "flexrow"],
		window: {
			frame: false,
			positioned: false
		}
	};

	/** @type {TokenLineOfSightToolbar | undefined} */
	static current;

	constructor(...args) {
		super(...args);
		TokenLineOfSightToolbar.current = this;
	}

	/** @override */
	_renderHTML() {
		return html`
			<div>
				<span class="tht-toolbar-item-label">Token 1</span>
				${this.#renderTokenPicker(1, tokenLineOfSightConfig$.token1, tokenLineOfSightConfig$.h1)}
			</div>

			<div>
				<span class="tht-toolbar-item-label">Token 2</span>
				${this.#renderTokenPicker(2, tokenLineOfSightConfig$.token2, tokenLineOfSightConfig$.h2)}
			</div>

			<button
				type="button"
				name="rulerIncludeNoHeightTerrain"
				class="tht-toolbar-icon-toggle flex0"
				data-tooltip=${l("TERRAINHEIGHTTOOLS.IncludeZones")}
				style=${computed(() => `
					margin-top: 1.25rem; padding: 4px 8px;
					background: ${includeNoHeightTerrain$.value ? "var(--color-warm-2, rgba(255,100,0,0.18))" : "transparent"};
					border: 1px solid ${includeNoHeightTerrain$.value ? "var(--color-border-highlight, #ff6400)" : "var(--color-cool-4, #555)"};
					border-radius: 4px; cursor: pointer; opacity: ${includeNoHeightTerrain$.value ? "1" : "0.65"};
					line-height: 1;
				`)}
				@click=${() => includeNoHeightTerrain$.value = !includeNoHeightTerrain$.value}
			>
				<i class="fa-solid fa-layer-group"></i>
			</button>
		`;
	}

	/**
	 * @param {number} idx
	 * @param {Signal<Token | undefined>} token$
	 * @param {Signal<number>} height$
	 */
	#renderTokenPicker(idx, token$, height$) {
		const tokenName$ = computed(() => token$.value?.name ?? l("TERRAINHEIGHTTOOLS.NoTokenSelected"));
		const tokenImageSrc$ = computed(() => token$.value?.document.texture?.src ?? "");
		const tokenImageStyle$ = computed(() => styleMap({ visibility: tokenImageSrc$.value ? "visible" : "hidden" }));

		const heightButtonRef = createRef();

		const heightButtonTooltip$ = computed(() => game.i18n.format(
			"TERRAINHEIGHTTOOLS.TokenLineOfSightRelativeRayPosition",
			{ current: game.i18n.localize(tokenRelativeHeights[height$.value]) }
		));

		// After rendering the height button, if the tooltip is currently being shown to the user, we need to
		// re-activate it so that the tooltip updates
		abortableSubscribe(heightButtonTooltip$, () => Promise.resolve().then(() => {
			if (game.tooltip.element === heightButtonRef.value)
				game.tooltip.activate(game.tooltip.element);
		}, 0), this.closeSignal);

		const heightButtonIconClass$ = computed(() => ({
			[1]: "fas fa-chevron-up",
			[0.5]: "fas fa-minus",
			[0]: "fas fa-chevron-down"
		}[height$]));

		return html`
			<div
				class=${computed(() => classMap({
					"token-selection-container": true,
					"is-selecting-token": this.#selectingToken$.value === idx
				}))}
				data-tooltip=${l("TERRAINHEIGHTTOOLS.SelectToken")}
				@click=${() => this.#beginSelectToken(idx)}
			>
				<img
					class="token-image"
					src=${tokenImageSrc$}
					style=${tokenImageStyle$}
				>
				<span class="token-name">${tokenName$}</span>
				<a
					class="token-action"
					data-tooltip=${heightButtonTooltip$}
					@click=${e => {
						e.stopPropagation();
						height$.value = (height$.value + 0.5) % 1.5;
					}}
					${ref(heightButtonRef)}
				>
					<i class=${heightButtonIconClass$} style="width:20px;text-align:center"></i>
				</a>
				<a
					class="token-action"
					data-tooltip=${l("TERRAINHEIGHTTOOLS.ClearSelectedToken")}
					@click=${e => this.#clearSelectedToken(e, token$)}
				>
					<i class="fas fa-xmark"></i>
				</a>
			</div>
		`;
	}

	/** @override */
	_onFirstRender(...args) {
		super._onFirstRender(...args);
		abortableEffect(() => {
			const board = document.querySelector("#board");
			board?.classList[this._isSelectingToken$.value ? "add" : "remove"]("tht-selecting-token");
		}, this.closeSignal);
	}

	/** @override */
	close(options) {
		// Clear the selection and the ruler on close
		tokenLineOfSightConfig$.value = {
			token1: undefined,
			token2: undefined
		};

		// If waiting for user to select a token, stop
		this.#selectingToken$.value = undefined;

		return super.close(options);
	}

	/** @param {number} tokenIndex */
	#beginSelectToken(tokenIndex) {
		this.#selectingToken$.value = this.#selectingToken$.value === tokenIndex ? undefined : tokenIndex;

		if (this.#selectingToken$.value)
			ui.notifications.info(game.i18n.localize("TERRAINHEIGHTTOOLS.TokenLineOfSightSelectTokenHint"));
	}

	// Called via libWrapper on Token.prototype._onClickLeft
	/** @param {Token} token */
	_onSelectToken(token) {
		if (typeof this.#selectingToken$.value !== "number") return;

		const [selectingToken$, otherToken$] = this.#selectingToken$.value === 1
			? [tokenLineOfSightConfig$.token1, tokenLineOfSightConfig$.token2]
			: [tokenLineOfSightConfig$.token2, tokenLineOfSightConfig$.token1];

		if (otherToken$.value === token) {
			ui.notifications.error(game.i18n.localize("TERRAINHEIGHTTOOLS.SameTokenSelected"));
			return;
		}

		selectingToken$.value = token;
		this.#selectingToken$.value = undefined;
	}

	/**
	 * @param {Event} e
	 * @param {Signal<Token | undefined>} token$
	 */
	#clearSelectedToken(e, token$) {
		e.stopPropagation();
		token$.value = undefined;
		this.#selectingToken$.value = undefined;
	}
}
