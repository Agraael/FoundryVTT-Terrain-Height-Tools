/**
 * Mixin for Application which positions it at the top center of the UI.
 * @template {!(new (...args: any[]) => any)} T
 * @param {T} BaseClass
 */
export const ThtToolbarPositionMixin = BaseClass => class extends BaseClass {

	/** @override */
	_insertElement(element) {
		const existing = document.getElementById(element.id);
		if (existing) existing.replaceWith(element);
		else document.querySelector("#ui-top").appendChild(element);
	}
};
