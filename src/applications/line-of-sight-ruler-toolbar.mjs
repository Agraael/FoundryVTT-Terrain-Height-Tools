import { html } from "@lit-labs/preact-signals";
import { computed } from "@preact/signals-core";
import { when } from "lit/directives/when.js";
import { includeNoHeightTerrain$, lineOfSightRulerConfig$ } from "../stores/line-of-sight.mjs";
import { fromSceneUnits, toSceneUnits } from "../utils/grid-utils.mjs";
import { LitApplicationMixin } from "./mixins/lit-application-mixin.mjs";
import { ThtToolbarPositionMixin } from "./mixins/tht-toolbar-position-mixin.mjs";

const { ApplicationV2 } = foundry.applications.api;

/** @type {(k: string) => string} */
const l = k => game.i18n.localize(k);

export class LineOfSightRulerToolbar extends ThtToolbarPositionMixin(LitApplicationMixin(ApplicationV2)) {

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

			<label class="tht-toolbar-checkbox flex0">
				<input
					type="checkbox"
					name="rulerIncludeNoHeightTerrain"
					.checked=${includeNoHeightTerrain$}
					@change=${this.#onIncludeNoHeightTerrainChange}
				>
				<span inert>${l("TERRAINHEIGHTTOOLS.IncludeZones")}</span>
			</label>
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

	/** @param {InputEvent} e */
	#onIncludeNoHeightTerrainChange(e) {
		includeNoHeightTerrain$.value = e.target.checked;
	}
}
