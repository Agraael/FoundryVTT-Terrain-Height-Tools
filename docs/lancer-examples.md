# Lancer Example

## Dangerous Terrain

> [!IMPORTANT]
> Note that due to the way Lancer works with the Foundry combat tracker, it DOES NOT properly trigger the "Token Ends Turn" behaviors when deactivating a combatant in the turn tracker by clicking on the button on the active token. Progressing to the next round using the <kbd>>|</kbd> button, and deactiving a combatant by activating another one however DOES work as expect. This is a limitation that exists in the Lancer system and there is no THT work-around for this.

1. Create and style your dangerous terrain type.
2. Create an "Execute Script" behavior on the terrain type.
3. Set the Events to "Token Moves In" and "Token Ends Turn".
4. Paste the following script, editing it as required, then save.

```js
// Change this to change which damage type you want
// Valid choices: "Kinetic", "Energy", "Explosive", "Burn", "Heat"
const damageType = "Kinetic";

// Change this to be how much damage to inflict on a failed check
const damageValue = 5;

// Change this if you want to change the check to be something other than engineering
// Valid choices: "system.hull", "system.agi", "system.sys", "system.eng"
const checkType = "system.eng";

// What the check roll must meet to pass. Change this if you want a heroic check for example.
const checkThreshold = 10;


// ------------------------------------------------------------------------
// ! Do not change any of the following unless you know what you're doing !

const { token } = event.data;
const { actor } = token;
const combatRound = game.combat?.current?.round;
const tokenFlag = `tht-dangerous-terrain-${region.flags["terrain-height-tools"]?.["terrainTypeId"] ?? "unknown"}-round`;

// Check flag to ensure we've not already done dangerous terrain this round
if (typeof combatRound === "number" && token.getFlag("world", tokenFlag) === combatRound) return;

if (!actor) {
	ui.notifications.warn("Token does not have an actor.");
	return
}

const StatRollFlow = game.lancer.flows.get("StatRollFlow");
const DamageRollFlow = game.lancer.flows.get("DamageRollFlow");
if (!StatRollFlow || !DamageRollFlow) {
	ui.notifications.warn("Missing stat roll flow or damage roll flow.");
	return;
}

const statRollFlow = new StatRollFlow(actor, {
	title: "Dangerous terrain check",
	path: checkType
});

if (!(await statRollFlow.begin())) return; // Player cancelled

// Flag to ensure we don't ask again on this round
if (typeof combatRound === "number") await token.setFlag("world", tokenFlag, combatRound);

const result = statRollFlow.state.data.result.roll.total;
if (result >= checkThreshold) return; // Check succeeded

token.object.setTarget();

const damageRollFlow = new DamageRollFlow(actor, {
	title: "Dangerous terrain damage",
	damage: [{ type: damageType, val: damageValue.toString() }]
});

await damageRollFlow.begin();

token.object.setTarget(false);
```

If you need different damage types for different zones, my recommendation would be to create one terrain type per damage type. That way you can also style them differently to allow your players to tell them apart. E.G. have one terrain type for "Lava", and another for "Acid", etc.
