-- Backfill email_marketing_opt_out for users who unsubscribed from MailerLite.
-- These addresses were exported from MailerLite's unsubscribed list and must be
-- honoured in our native sending stack. Marketing emails (drip, weekly digest,
-- coach recommendations, etc.) already gate on this flag; transactional emails
-- (payment failed, application decisions) are deliberately unaffected.

update profiles
set email_marketing_opt_out = true
where email in (
  'joshuaniland07@gmail.com',
  'arronricho19@icloud.com',
  'babagebu08@gmail.com',
  'coconutv010@gmail.com',
  'uhr2002@gmail.com',
  'jeff1.eastham@gmail.com',
  'papis.touray17@gmail.com',
  'gloirengangaa@yahoo.com',
  'mystery101unfolded@gmail.com',
  'levi12dirawu@gmail.com',
  'ryantalbot664@gmail.com',
  'oliverjriva@gmail.com',
  'cm.kamara6@gmail.com',
  'alextonner123@icloud.com',
  'sheriff9.com@gmail.com',
  'vd.ladybridge2008@gmail.com',
  'archifordmakonye577@gmail.com',
  'isaacmodi42@gmail.com',
  'joehampson3@gmail.com',
  'bradkec@gmail.com',
  'darius6199@hotmail.co.uk',
  'tobiaru61@gmail.com',
  'hjmc20@gmail.com',
  'njiesheriff03@gmail.com',
  'regan.jarrett15@gmail.com',
  'andre05mendes@gmail.com',
  'callum.foster@sufc-community.com',
  'lamameite22@gmail.com',
  'calebrichards123@hotmail.com',
  'seedat_ebrahim@hotmail.com'
)
and email_marketing_opt_out is not true;
