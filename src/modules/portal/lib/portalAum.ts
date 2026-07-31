// Shared AUM logic for /portal and /vfo — mirrors /contacts logic:
// AUM = Vineyard + Storehouses (excluding real estate) + Holding Tank
//     + Insurance cash_value assigned to a storehouse in scope
// Life insurance coverage is NOT included in AUM.

const REAL_ESTATE = "Primary Residence & Protected Legacy Accounts";

export const isAumStorehouse = (s: any) => s?.asset_type !== REAL_ESTATE;

export const sumValues = (rows: any[]) =>
  (rows || []).reduce((s: number, r: any) => s + (Number(r?.current_value) || 0), 0);

export const insuranceCashForStorehouses = (
  policies: any[],
  storehouses: any[]
): number => {
  const ids = new Set((storehouses || []).map((s: any) => s.id));
  return (policies || [])
    .filter((p: any) => p?.cash_value_storehouse_id && ids.has(p.cash_value_storehouse_id))
    .reduce((s: number, p: any) => s + (Number(p.cash_value) || 0), 0);
};

export const computeAum = (
  vineyard: any[],
  storehouses: any[],
  holdingTank: any[] = [],
  insurance: any[] = []
): number => {
  const store = (storehouses || []).filter(isAumStorehouse);
  return (
    sumValues(vineyard) +
    sumValues(store) +
    sumValues(holdingTank) +
    insuranceCashForStorehouses(insurance, store)
  );
};
