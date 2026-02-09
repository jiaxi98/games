export const RESOURCE_KINDS = ['wood', 'stone'] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];
