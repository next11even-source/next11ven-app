-- Allow drip jobs that are not tied to a specific message
-- (e.g. payment-failed follow-up step 99, win-back step 98)
ALTER TABLE drip_jobs ALTER COLUMN message_id DROP NOT NULL;

-- Extend allowed sequence steps for Stripe-triggered drip flows
ALTER TABLE drip_jobs DROP CONSTRAINT drip_jobs_sequence_step_check;
ALTER TABLE drip_jobs ADD CONSTRAINT drip_jobs_sequence_step_check
  CHECK (sequence_step IN (1, 2, 3, 98, 99));
