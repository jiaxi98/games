export const FactionId = Object.freeze({
  PLAYER: 1,
  VANGUARD: 1,
  SAINT_ORENS: 2,
  NEUTRAL: 0,
});

export const FACTIONS = Object.freeze({
  [FactionId.VANGUARD]: Object.freeze({
    id: FactionId.VANGUARD,
    key: 'vanguard',
    name: 'The Ashen Company',
    cloth: 0x31485c,
    clothSecondary: 0xb0a17a,
    standard: 0x293d50,
    accent: 0xc3a65a,
  }),
  [FactionId.SAINT_ORENS]: Object.freeze({
    id: FactionId.SAINT_ORENS,
    key: 'saint-orens',
    name: 'Saint-Orens Levy',
    cloth: 0x742e2b,
    clothSecondary: 0xc1aa75,
    standard: 0x7a2825,
    accent: 0xd0b46a,
  }),
  [FactionId.NEUTRAL]: Object.freeze({
    id: FactionId.NEUTRAL,
    key: 'neutral',
    name: 'Unaligned',
    cloth: 0x6c675b,
    clothSecondary: 0x998d72,
    standard: 0x5f5a50,
    accent: 0x8d8066,
  }),
});

export function getFaction(id) {
  return FACTIONS[id] ?? FACTIONS[FactionId.NEUTRAL];
}

