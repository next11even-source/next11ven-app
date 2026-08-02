-- Drop the throwaway diagnostic functions used to investigate the MRR
-- discrepancy (comped accounts, renewal-row dedup, live/test-mode split).
drop function if exists analytics_tmp_livemode_diag();
drop function if exists analytics_tmp_livemode_diag2();
