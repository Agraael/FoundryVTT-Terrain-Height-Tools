# Terrain Height Tools (Lasossis's Fork)

[![Latest module version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgithub.com%2FAgraael%2FFoundryVTT-Terrain-Height-Tools%2Freleases%2Flatest%2Fdownload%2Fmodule.json&query=%24.version&prefix=v&style=for-the-badge&label=module%20version)](https://github.com/Agraael/FoundryVTT-Terrain-Height-Tools/releases/latest)
![Latest Foundry version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgithub.com%2FAgraael%2FFoundryVTT-Terrain-Height-Tools%2Freleases%2Flatest%2Fdownload%2Fmodule.json&query=%24.compatibility.verified&style=for-the-badge&label=foundry%20version&color=fe6a1f)

Fork of [Wibble199's Terrain Height Tools](https://github.com/Wibble199/FoundryVTT-Terrain-Height-Tools). For core features (height painting, line of sight ruler, terrain viewer) see the upstream readme. This page only covers what the fork adds.

## What this fork adds

- **Terrain Triggers**: per-terrain actions on enter/leave/move. Macro, JS, or status effect. See [Triggers](#triggers).
- **Movement Penalty**: terrain cost field used by the Elevation Ruler fork.
- **Extra API**: token-in-shape and trigger-match helpers.

---

## Installation

**Manifest URL:**
```
https://github.com/Agraael/FoundryVTT-Terrain-Height-Tools/releases/latest/download/module.json
```

### Required

| Module | Why |
|--------|-----|
| FoundryVTT v12 | Built against v12 |
| [lib-wrapper](https://foundryvtt.com/packages/lib-wrapper) | Used by upstream THT |

### Optional

| Module | What it adds |
|--------|--------------|
| [Lancer Automations](https://github.com/Agraael/lancer-automations) | Trigger code can call Lancer flows like `triggerDangerousZoneFlow` |
| [Elevation Ruler (Lancer fork)](https://github.com/Agraael/Lancer-elevationRuler-Fork) | Reads the **Movement Penalty** of each terrain type for live movement cost |
| [Token Factions](https://github.com/Agraael/foundryvtt-token-factions) | Lets triggers target a specific team instead of disposition |
| [_CodeMirror](https://github.com/League-of-Foundry-Developers/codemirror-lib) | Syntax highlighting in the inline JS trigger editor |

---

## Movement Penalty

Every terrain type has a **Movement Penalty** field (Terrain Types > Other). My [Elevation Ruler fork](https://github.com/Agraael/Lancer-elevationRuler-Fork) reads it and adds the cost to the ruler when a token drags through a matching shape. Difficult Terrain usually wants 1.

---

## Triggers

A new **Triggers** tab on each terrain type. Each trigger fires an action when a token enters, leaves, or moves through a painted shape of that type. You can add as many as you want.

### Fields

**Event**: On Enter, On Leave, On Enter & Leave, On Move Inside, or any of the combat turn/round modes.

**Elevation Rule**:
- `Inside Volume (inclusive top)`: `bottom <= elev <= top`. A 2-high tower at elevation 0 fires for 0, 1, 2.
- `Inside Volume (excluding top)`: `bottom <= elev < top`.
- `On Floor`: `elev === bottom`.
- `Any Elevation`: skip the check.

Zone-type terrain (no height) is locked to Any Elevation.

**Target Tokens**: disposition filter (All / Friendly / Hostile / Neutral / Player-Owned). When Token Factions Advanced is on, your teams are listed here too.

**Action Type**:
- **Macro**: pick a Foundry macro by ID or UUID.
- **JavaScript**: inline async code. Scope: `token, shape, terrainType, trigger, options, api`. Errors are caught and logged.
- **Status Effect**: pick a `CONFIG.statusEffects` entry. Added on enter, removed on leave.

### Example: dangerous fire

Paint a Dangerous Fire shape. On the terrain type, add a trigger:

- Event: `On Enter`
- Elevation Rule: `Inside Volume (inclusive top)`
- Action Type: `JavaScript`
- Code:
  ```js
  await game.modules.get("lancer-automations").api.triggerDangerousZoneFlow(token, "burn", 5);
  ```

### External hook

`terrain-height-tools.enterLeaveTerrain` fires for every match with `{ token, shape, terrainType, trigger, hasEntered, isPreview, reason }`. Useful for reacting from another module without configuring a trigger.

The action only runs on the active GM client. The hook itself fires for everyone.

---

## Extra API

Added on top of upstream:
- `terrainHeightTools.isTokenInsideShape(tokenDoc, shape, rule, position?)`
- `terrainHeightTools.getContainingTriggerMatches(tokenDoc, position?)`
