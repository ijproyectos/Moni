-- G1 · Grupos: categoría «Otros» para los gastos compartidos.
--
-- Los gastos de grupo eligen su categoría entre las plantillas (`category_templates`, de solo lectura). No existía una neutra:
-- la persona tenía que elegir una incorrecta. Se agrega la plantilla «otros» (gasto), al final de la lista. Los informes ya
-- agrupan los gastos compartidos por el nombre de la plantilla (una categoría propia llamada igual, o una virtual con el ícono
-- y color de la plantilla), así que «Otros» aparece en resúmenes e informes sin otro cambio.
-- No se toca ninguna categoría de usuario ni ningún identificador existente.
--
-- Rollback: supabase/ops/shared_category_otros_rollback.sql

begin;

insert into public.category_templates (slug, kind, name, icon, color, sort_order)
values ('otros', 'expense', 'Otros', 'Tag', '#7C8B84', 900)
on conflict (slug) do nothing;

commit;
