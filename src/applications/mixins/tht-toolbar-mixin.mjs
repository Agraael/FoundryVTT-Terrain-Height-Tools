/** @import { toolbarPositions } from "../../consts.mjs"; */
import { toolbarAutofade$, toolbarPosition$ } from "../../config/settings.mjs";

/**
 * Mixin for Application for THT toolbars, which positions them according to the user's setting, and adds the faded-ui
 * class according to user settings.
 * @template {!(new (...args: any[]) => any)} T
 * @param {T} BaseClass
 */
export const ThtToolbarMixin = BaseClass => class extends BaseClass {

	/** @type {(() => void)[]} */
	#cleanupFns;

	/** @override */
	_insertElement(element) {
		const existing = document.getElementById(element.id);
		if (existing) existing.replaceWith(element);
		else this.#insertElement(element, toolbarPosition$.value);
	}

	_onFirstRender(...args) {
		this.#cleanupFns = [
			toolbarPosition$.subscribe(newPosition => {
				const existing = document.getElementById(this.element.id);
				if (existing) existing.replaceWith(this.element);
				this.#insertElement(this.element, newPosition);
			}),
			toolbarAutofade$.subscribe(autoFade => {
				this.element.classList[autoFade ? "add" : "remove"]("faded-ui");
			})
		];

		return super._onFirstRender(...args);
	}

	close(...args) {
		for (const cleanup of this.#cleanupFns)
			cleanup();
		return super.close(...args);
	}

	/**
	 * @param {HTMLElement} element
	 * @param {toolbarPositions} pos
	 */
	#insertElement(element, pos) {
		switch (pos) {
			case "topCenter":
				document.querySelector("#ui-top").append(element);
				break;
			case "bottomCenter":
				document.querySelector("#ui-bottom").prepend(element);
				break;
		}
	}
};
