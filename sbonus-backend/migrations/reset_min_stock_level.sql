-- Сброс min_stock_level: default 5 → 0 для всех товаров где оно не было настроено
-- Это убирает 1808 ложных "критических алертов"
UPDATE products SET min_stock_level = 0 WHERE min_stock_level = 5;

-- Установить default на уровне колонки
ALTER TABLE products ALTER COLUMN min_stock_level SET DEFAULT 0;
