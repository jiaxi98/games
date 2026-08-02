/**
 * Original historical-fiction framing for The Ashen Standard.
 *
 * The people and places below are invented. Material culture, military roles,
 * and political pressures are inspired by Anglo-Gascon warfare in 1356.
 */

export const CAMPAIGN = Object.freeze({
  id: 'the-ashen-standard',
  title: 'THE ASHEN STANDARD',
  subtitle: 'Battle of Saint-Orens Ford',
  date: 'Autumn 1356',
  place: 'Gascony',
  player: Object.freeze({
    name: 'Martin',
    role: 'Landless Man-at-Arms',
  }),
  factions: Object.freeze({
    player: Object.freeze({
      id: 'vanguard',
      shortName: 'Vanguard',
      name: 'Anglo-Gascon Vanguard',
      colour: '#af9a62',
    }),
    enemy: Object.freeze({
      id: 'orens',
      shortName: 'Saint-Orens',
      name: 'Saint-Orens Host',
      colour: '#823b34',
    }),
  }),
  premise:
    'An Anglo-Gascon vanguard has been thrown back from Saint-Orens Ford. Its standard lies in the mud, its companies are scattered, and an opposing spear formation is closing on the bridge.',
  mission: Object.freeze({
    id: 'recover-the-ashen-standard',
    title: 'Recover the Ashen Standard',
    kicker: 'GASCONY · 1356',
    briefing:
      'The vanguard is breaking beneath cold rain. Fight through the collapsed centre, recover the fallen standard, and turn the retreat at Saint-Orens Ford.',
    order:
      'Recover the standard. Rally the hedgerow. Break the spear line. Take the ford.',
    objectives: Object.freeze([
      Object.freeze({
        id: 'recover',
        title: 'Recover the fallen standard',
        detail: 'Fight through the collapsing melee and lift the Ashen Standard.',
        short: 'Recover the standard',
      }),
      Object.freeze({
        id: 'rally',
        title: 'Rally the hedgerow',
        detail: 'Carry the standard to the survivors and withstand the counterattack.',
        short: 'Rally the survivors',
      }),
      Object.freeze({
        id: 'break',
        title: 'Break the spear line',
        detail: 'Assault the formation or turn its flank through the burning mill.',
        short: 'Break the spear line',
      }),
      Object.freeze({
        id: 'captain',
        title: 'Defeat the enemy captain',
        detail: 'Advance to Saint-Orens Ford and bring down its commander.',
        short: 'Defeat the captain',
      }),
      Object.freeze({
        id: 'victory',
        title: 'Raise the captured standard',
        detail: 'Secure the bridge and signal the vanguard’s return.',
        short: 'Secure the ford',
      }),
    ]),
  }),
  battleLabels: Object.freeze({
    allied: 'Vanguard',
    enemy: 'Saint-Orens Host',
  }),
  endings: Object.freeze({
    victory: Object.freeze({
      eyebrow: 'THE BRIDGE IS SECURE',
      title: 'The Standard Rises',
      body:
        'The captured colours rise above Saint-Orens Ford. Along the hedgerow, scattered men close ranks and advance through the rain.',
    }),
    death: Object.freeze({
      eyebrow: 'THE VANGUARD BREAKS',
      title: 'You Fell at Saint-Orens',
      body:
        'The standard remains in the mud. Without a rallying point, the survivors give ground from the ford.',
    }),
  }),
});

export function getMissionObjective(id) {
  return CAMPAIGN.mission.objectives.find((objective) => objective.id === id) ?? null;
}

export function getNextMissionObjective(id) {
  const objectives = CAMPAIGN.mission.objectives;
  const index = objectives.findIndex((objective) => objective.id === id);
  if (index < 0) return objectives[0] ?? null;
  return objectives[index + 1] ?? null;
}
