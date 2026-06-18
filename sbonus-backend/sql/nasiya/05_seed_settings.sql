-- ═══════════════════════════════════════════════════════════════
-- NASIYA DAFTAR — default Settings. Idempotent (ON CONFLICT DO NOTHING).
-- docker exec -i sbonus_db psql -U sbonus -d sbonus_db < 05_seed_settings.sql
--
-- ⚠️ NASIYA_OWNER_PHONE — o'zingizning WhatsApp raqamingizni yozing
--    (egasiga "kim qancha" eslatmasi shu raqamga boradi). Bo'sh bo'lsa — yuborilmaydi.
-- ═══════════════════════════════════════════════════════════════

INSERT INTO settings (key, value, updated_at) VALUES
  ('NASIYA_REMINDER_ENABLED',     'true',   now()),
  ('NASIYA_REMINDER_DAYS_BEFORE', '3,1,0',  now()),  -- 3 kun oldin, 1 kun oldin, srok kuni
  ('NASIYA_NOTIFY_DEBTOR',        'true',   now()),  -- qarzdorga yuborilsinmi
  ('NASIYA_NOTIFY_OWNER',         'true',   now()),  -- egasiga ro'yxat yuborilsinmi
  ('NASIYA_OWNER_PHONE',          '',       now()),  -- ⚠️ +996XXXXXXXXX — TO'LDIRING
  ('NASIYA_WA_TEMPLATE_DEBTOR',
   E'Здравствуйте, {name}!\nНапоминание: срок оплаты {due_date}. К оплате: {remaining} сом.\nПожалуйста, оплатите вовремя. Спасибо!\n— Смарт Центр',
   now())
ON CONFLICT (key) DO NOTHING;

-- Egangiz raqamini keyin shunday yangilaysiz:
-- UPDATE settings SET value = '996557100505', updated_at = now() WHERE key = 'NASIYA_OWNER_PHONE';
