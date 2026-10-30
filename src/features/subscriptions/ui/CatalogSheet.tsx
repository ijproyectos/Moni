import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { DashedButton, SectionLabel } from '@/shared/ui/kit'
import { groupCatalog, searchCatalog, type CatalogService } from '../domain/catalog'
import { ServiceLogo } from './ServiceLogo'

/** Picks a service from the catalog (logos, grouped by category, with search) or asks for a custom one. */
export function CatalogSheet({
  onPick,
  onCustom,
  onClose,
}: {
  onPick: (service: CatalogService) => void
  /** `name` is whatever was typed in the search box. */
  onCustom: (name: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const groups = groupCatalog(searchCatalog(query))
  const typed = query.trim()

  return (
    <BottomSheet title="Nueva suscripción" subtitle="¿Cuál es?" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="relative block">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar servicio"
            aria-label="Buscar servicio"
            data-autofocus
            className="h-14 w-full rounded-full border border-sand bg-white pl-12 pr-4 text-[17px] text-forest placeholder:text-text-muted"
          />
        </label>

        {groups.length === 0 && (
          <p className="py-2 text-center text-[16px] text-text-muted">
            No encontramos «{typed}» en el catálogo.
          </p>
        )}

        {groups.map((group) => (
          <section key={group.category.id} aria-label={group.category.label}>
            <SectionLabel>{group.category.label}</SectionLabel>
            <ul className="mt-2 grid grid-cols-3 gap-2">
              {group.services.map((service) => (
                <li key={service.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onPick(service)}
                    className="flex h-full min-h-[104px] w-full flex-col items-center justify-start gap-2 rounded-[18px] border border-sand bg-white px-1.5 py-3 text-center"
                  >
                    <ServiceLogo serviceId={service.id} size="md" className="border-0" />
                    <span className="line-clamp-2 w-full break-words text-[14px] font-extrabold leading-[18px] text-forest">
                      {service.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <DashedButton onClick={() => onCustom(typed)}>
          <Plus aria-hidden="true" className="size-5" strokeWidth={2.5} />
          {typed ? `Agregar «${typed}»` : 'Otra suscripción'}
        </DashedButton>
      </div>
    </BottomSheet>
  )
}
