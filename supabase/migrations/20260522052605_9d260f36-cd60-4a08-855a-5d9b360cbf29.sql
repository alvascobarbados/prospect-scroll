UPDATE public.product_decoration_bands b
SET inland_freight_usd = CASE b.qty
  WHEN 50 THEN 37
  WHEN 100 THEN 74
  WHEN 250 THEN 185
  WHEN 500 THEN 360
END
FROM public.product_decorations d
JOIN public.products p ON p.id = d.product_id
WHERE b.product_decoration_id = d.id
  AND p.supplier_item_number = 'LOG-KM2401'
  AND b.qty IN (50, 100, 250, 500);