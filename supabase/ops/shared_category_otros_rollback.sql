-- Rollback de 20261126000300_shared_category_otros.sql.
-- Solo se puede borrar la plantilla si ningún gasto compartido la usa (FK no action); si falla, ya hay gastos con «Otros».
delete from public.category_templates where slug = 'otros';
