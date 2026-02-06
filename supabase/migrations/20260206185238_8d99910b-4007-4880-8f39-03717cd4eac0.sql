
-- Seed 5 thank you email templates for payment received
-- Use a system UUID for created_by since these are system-seeded templates
DO $$
DECLARE
  system_user_id uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  -- Template 1: Professional Thank You
  INSERT INTO public.email_templates (name, subject_template, greeting_template, body_template, signoff_template, template_type, is_active, is_default, created_by)
  VALUES (
    'Professional Thank You',
    'Payment Received - Invoice {{invoice_number}} | Thank You',
    'Dear {{customer_name}},',
    'We are pleased to confirm receipt of your payment of £{{amount_paid}} for invoice {{invoice_number}}, received on {{payment_date}}.

Your account has been updated accordingly and this invoice is now marked as fully paid.

We truly appreciate your prompt payment and continued trust in our services. Should you require any further documentation or have any queries regarding this payment, please do not hesitate to contact us.',
    'Kind regards,
Credit Control
accounts@bhofire.com',
    'thank_you',
    true,
    true,
    system_user_id
  );

  -- Template 2: Friendly Thank You
  INSERT INTO public.email_templates (name, subject_template, greeting_template, body_template, signoff_template, template_type, is_active, is_default, created_by)
  VALUES (
    'Friendly Thank You',
    'Thank You for Your Payment - Invoice {{invoice_number}}',
    'Hi {{customer_name}},',
    'Just a quick note to say thank you! We have received your payment of £{{amount_paid}} for invoice {{invoice_number}} on {{payment_date}}.

Everything is all squared away on our end. We really appreciate you taking care of this and value your business greatly.

If there is anything else we can help with, just let us know!',
    'Many thanks,
The BHO Fire Team',
    'thank_you',
    true,
    false,
    system_user_id
  );

  -- Template 3: Brief Thank You
  INSERT INTO public.email_templates (name, subject_template, greeting_template, body_template, signoff_template, template_type, is_active, is_default, created_by)
  VALUES (
    'Brief Thank You',
    'Payment Confirmed - {{invoice_number}}',
    'Dear {{customer_name}},',
    'This email confirms we have received your payment of £{{amount_paid}} for invoice {{invoice_number}} on {{payment_date}}.

Thank you for your prompt payment.',
    'Best regards,
Accounts Department',
    'thank_you',
    true,
    false,
    system_user_id
  );

  -- Template 4: Formal Thank You
  INSERT INTO public.email_templates (name, subject_template, greeting_template, body_template, signoff_template, template_type, is_active, is_default, created_by)
  VALUES (
    'Formal Thank You',
    'Payment Acknowledgement - Invoice {{invoice_number}} | {{company_name}}',
    'Dear {{customer_name}},',
    'We write to formally acknowledge receipt of your payment in the amount of £{{amount_paid}} against invoice {{invoice_number}}, which was received on {{payment_date}}.

This payment has been applied to your account and the aforementioned invoice is now settled in full.

We wish to express our sincere gratitude for your timely remittance and for the confidence you place in our organisation. We remain committed to providing you with the highest standard of service.

Please retain this email as confirmation of payment for your records.',
    'Yours faithfully,
Credit Control Department
accounts@bhofire.com',
    'thank_you',
    true,
    false,
    system_user_id
  );

  -- Template 5: Thank You with Future Business
  INSERT INTO public.email_templates (name, subject_template, greeting_template, body_template, signoff_template, template_type, is_active, is_default, created_by)
  VALUES (
    'Thank You - Looking Forward',
    'Payment Received with Thanks - Invoice {{invoice_number}}',
    'Dear {{customer_name}},',
    'Thank you very much for your payment of £{{amount_paid}} for invoice {{invoice_number}}, received on {{payment_date}}. Your account is now fully up to date.

We greatly value our working relationship with you and look forward to continuing to support your fire safety needs. If you have any upcoming projects or service requirements, please do not hesitate to get in touch.

Thank you again for your continued business and trust.',
    'Warm regards,
The BHO Fire Team
accounts@bhofire.com',
    'thank_you',
    true,
    false,
    system_user_id
  );
END $$;
