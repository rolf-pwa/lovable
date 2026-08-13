// Canonical insurance_policies.policy_type values and labels — shared so
// InsurancePanel, ContactDetail, and HouseholdDetail can't silently drift
// apart on what a given policy_type string means.
export const POLICY_TYPES = [
  { value: "term", label: "Term Life" },
  { value: "whole_life", label: "Whole Life" },
  { value: "universal_life", label: "Universal Life" },
  { value: "critical_illness", label: "Critical Illness" },
  { value: "disability", label: "Disability" },
  { value: "long_term_care", label: "Long-Term Care" },
  { value: "other", label: "Other" },
];

export function policyTypeLabel(value: string | null | undefined): string {
  return POLICY_TYPES.find((t) => t.value === value)?.label || value || "Other";
}
