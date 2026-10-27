import type { HTMLAttributes } from 'react'
import { cn } from './cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-cream bg-white p-4', className)} {...props} />
}
