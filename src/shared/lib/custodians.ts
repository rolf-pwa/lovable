// Canonical custodian values for holding_tank/vineyard_accounts — shared so
// the Holding Tank form, Vault-scan normalization, and future AUM tiering
// logic can't silently drift apart on what "directly managed" means.
export const IA_FINANCIAL_GROUP = "iA Financial Group";
export const JUSTWEALTH = "JustWealth";

export const MANAGED_CUSTODIANS = [IA_FINANCIAL_GROUP, JUSTWEALTH] as const;

export const CUSTODIAN_OPTIONS = [...MANAGED_CUSTODIANS, "Other"] as const;

/** True only for accounts custodied where ProsperWise directly manages the
 *  assets — excludes pensions and other held-elsewhere accounts tracked in
 *  the household's financial picture for visibility only. */
export function isManagedCustodian(custodian: string | null | undefined): boolean {
  return !!custodian && (MANAGED_CUSTODIANS as readonly string[]).includes(custodian);
}
