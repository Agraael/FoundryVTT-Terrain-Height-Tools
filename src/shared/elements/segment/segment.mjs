import { html, LitElement, nothing } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { when } from "lit/directives/when.js";
import { toolclip } from "../../../applications/directives/toolclip.mjs";
import "./segment.css";

export const elementName = "segment-fwl";

export class SegmentElement extends LitElement {

	static properties = {
		value: {},
		items: { type: Array },
		labelSelector: { type: String },
		iconSelector: { type: String },
		valueSelector: { type: String },
		toolclipSelector: { type: String }
	};

	constructor() {
		super();

		this.value = undefined;
		this.items = [];

		/** @type {string | ((item: any) => any) | undefined} */
		this.labelSelector = undefined;

		/** @type {string | ((item: any) => any) | undefined} */
		this.iconSelector = undefined;

		/** @type {string | ((item: any) => any) | undefined} */
		this.valueSelector = undefined;

		/** @type {string | ((item: any) => any) | undefined} */
		this.toolclipSelector = undefined;
	}

	render() {
		return html`
			<div class="segment-fwl">
				${this.items.map(item => html`
					<div
						class=${classMap({ "segment-fwl-item": true, "active": this.#getItemValue(item) === this.value })}
						@click=${() => this.#selectItem(item)}
						data-tooltip=${when(this.#getItemToolclip(item), tc => toolclip(tc), nothing)}
					>
						${when(this.#getItemIcon(item), icon => html`<i class=${icon}></i>`)}
						${when(this.#getItemLabel(item), label => html`<span>${label}</span>`)}
					</div>
				`)}
			</div>
		`;
	}

	#getItemLabel(item) {
		switch (typeof this.labelSelector) {
			case "function":
				return this.labelSelector(item);
			case "string":
				return item[this.labelSelector];
			default:
				return typeof item === "object" ? item["label"] : item;
		}
	}

	#getItemIcon(item) {
		switch (typeof this.iconSelector) {
			case "function":
				return this.iconSelector(item);
			case "string":
				return item[this.iconSelector];
			default:
				return typeof item === "object" ? item["icon"] : undefined;
		}
	}

	#getItemValue(item) {
		switch (typeof this.valueSelector) {
			case "function":
				return this.valueSelector(item);
			case "string":
				return item[this.valueSelector];
			default:
				return typeof item === "object" ? item["value"] : item;
		}
	}

	#getItemToolclip(item) {
		switch (typeof this.toolclipSelector) {
			case "function":
				return this.toolclipSelector(item);
			case "string":
				return item[this.toolclipSelector];
			default:
				return typeof item === "object" ? item["toolclip"] : undefined;
		}
	}

	#selectItem(item) {
		const value = this.#getItemValue(item);
		this.value = value;
		this.dispatchEvent(new Event("change", { bubbles: true, cancelable: false, composed: true }));
	}

	createRenderRoot() {
		return this;
	}
}

customElements.define(elementName, SegmentElement);
