/**
 * Mixin for Application which positions it in the top right of the canvas area on first render.
 * @template {!(new (...args: any[]) => any)} T
 * @param {T} BaseClass
 */
export const ThtApplicationPositionMixin = BaseClass => class extends BaseClass {

	// Copied from RegionLegend
	/** @override */
	_configureRenderOptions(options) {
		super._configureRenderOptions(options);
		if (options.isFirstRender && ui.nav) {
			const { right, top } = ui.nav.element.getBoundingClientRect();
			const uiScale = game.settings.get("core", "uiConfig").uiScale;
			options.position.left ??= right + (16 * uiScale);
			options.position.top ??= top;
		}
	}
};
