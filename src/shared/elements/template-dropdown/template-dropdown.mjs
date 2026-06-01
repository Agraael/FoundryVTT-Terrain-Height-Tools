import { nothing } from "lit";
import { AbstractDropdownElement } from "../abstract-dropdown/abstract-dropdown.mjs";

const elementName = "template-dropdown-fwl";

/**
 * Dropdown element that uses template results as it's button/dropdown content.
 */
export class TemplateDropdownElement extends AbstractDropdownElement {

	static properties = {
		buttonTemplate: {},
		dropdownTemplate: {},
		dropdownClasses: { type: String }
	};

	constructor() {
		super();

		// This weird syntax is to get around vscode-lit-plugin treating these as symbols and showing an error about incompatible type
		// bindings. It seems like using the @type before the property name doesn't get picked up by the plugin for some reason.
		this.buttonTemplate = /** @type {any} */ (nothing);
		this.dropdownTemplate = /** @type {any} */ (nothing);

		this.dropdownClasses = "";
	}

	_renderButton() {
		return this.buttonTemplate;
	}

	_renderDropdown() {
		return this.dropdownTemplate;
	}
}

customElements.define(elementName, TemplateDropdownElement);
