ALTER TABLE channels ADD COLUMN image_url TEXT;
ALTER TABLE sellers ADD COLUMN payout_bank_name TEXT;
ALTER TABLE sellers ADD COLUMN payout_account_name TEXT;
ALTER TABLE sellers ADD COLUMN payout_account_last4 TEXT;