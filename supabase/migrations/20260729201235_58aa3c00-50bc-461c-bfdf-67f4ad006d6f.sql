update public.crm_intake_pushes
set status = 'provisioned',
    household_folder_url = coalesce(household_folder_url, callback_payload->>'vaultRootUrl')
where callback_payload->>'event' = 'vault.provisioned';

update public.households h
set vault_root_folder_id = p.callback_payload->>'vaultRootFolderId'
from public.crm_intake_pushes p
where p.household_id = h.id
  and p.callback_payload->>'event' = 'vault.provisioned'
  and h.vault_root_folder_id is distinct from p.callback_payload->>'vaultRootFolderId';