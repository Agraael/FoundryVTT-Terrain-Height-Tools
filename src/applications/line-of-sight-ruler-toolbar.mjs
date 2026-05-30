import { html } from "@lit-labs/preact-signals";
import { computed } from "@preact/signals-core";
import { when } from "lit/directives/when.js";
import { includeNoHeightTerrain$, lineOfSightRulerConfig$ } from "../stores/line-of-sight.mjs";
import { fromSceneUnits, toSceneUnits } from "../utils/grid-utils.mjs";
import { LitApplicationMixin } from "./mixins/lit-application-mixin.mjs";
import { ThtToolbarMixin } from "./mixins/tht-toolbar-mixin.mjs";

const { ApplicationV2 } = foundry.applications.api;

/** @type {(k: string) => string} */
const l = k => game.i18n.localize(k);

export class LineOfSightRulerToolbar extends ThtToolbarMixin(LitApplicationMixin(ApplicationV2)) {

	static DEFAULT_OPTIONS = {
		id: "tht_lineOfSightRulerToolbar",
		classes: ["tht-toolbar", "flexrow"],
		window: {
			frame: false,
			positioned: false
		}
	};

	/** @type {LineOfSightRulerToolbar | undefined} */
	static current;

	constructor(...args) {
		super(...args);
		LineOfSightRulerToolbar.current = this;
	}

	/** @override */
	_renderHTML() {
		return html`
			<div>
				<label class="tht-toolbar-item-label" for="tht_lineOfSightRulerToolbar_startHeight">
					${l("TERRAINHEIGHTTOOLS.StartHeight.Name")}
				</label>
				<div class="flexrow gap-05rem">
					<input
						type="number"
						id="tht_lineOfSightRulerToolbar_startHeight"
						.value=${computed(() => toSceneUnits(lineOfSightRulerConfig$.h1.value))}
						min="0"
						@input=${this.#onStartHeightInput}
					>
					${when(canvas.scene.grid.units, () => html`<span class="flex0">${canvas.scene.grid.units}</span>`)}
				</div>
			</div>

			<div>
				<label class="tht-toolbar-item-label" for="tht_lineOfSightRulerToolbar_endHeight">
					${l("TERRAINHEIGHTTOOLS.EndHeight.Name")}
				</label>
				<div class="flexrow gap-05rem">
					<input
						type="number"
						id="tht_lineOfSightRulerToolbar_endHeight"
						.value=${computed(() => {
							const h2 = lineOfSightRulerConfig$.h2.value;
							return typeof h2 === "number" ? toSceneUnits(h2) : "";
						})}
						min="0"
						placeholder=${l("TERRAINHEIGHTTOOLS.SameAsStart")}
						@input=${this.#onEndHeightInput}
					>
					${when(canvas.scene.grid.units, () => html`<span class="flex0">${canvas.scene.grid.units}</span>`)}
				</div>
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
				@click=${this.#onIncludeNoHeightTerrainToggle}
			>
				<i class="fa-solid fa-layer-group"></i>
			</button>
		`;
	}

	/** @param {InputEvent} e */
	#onStartHeightInput(e) {
		const val = fromSceneUnits(+e.target.value);
		if (!isNaN(val) && lineOfSightRulerConfig$.h1.value !== val)
			lineOfSightRulerConfig$.h1.value = val;
	}

	/** @param {InputEvent} e */
	#onEndHeightInput(e) {
		// Allow leaving blank to inherit start height
		if (e.target.value === "") {
			lineOfSightRulerConfig$.h2.value = undefined;
			return;
		}

		const val = fromSceneUnits(+e.target.value);
		if (!isNaN(val) && lineOfSightRulerConfig$.h2.value !== val)
			lineOfSightRulerConfig$.h2.value = val;
	}

	#onIncludeNoHeightTerrainToggle() {
		includeNoHeightTerrain$.value = !includeNoHeightTerrain$.value;
	}
}
