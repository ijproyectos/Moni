// RevenueCat (StoreKit / Play Billing) wrapper for the native app. Mercado Pago (see billingRepository.ts) is NOT
// replaced: it keeps billing existing web subscribers, it is simply not offered inside the native build. Both
// sources write the same public.plus_entitlements row (see supabase/migrations/20261126000000_revenuecat_plus_billing.sql
// and supabase/functions/revenuecat-webhook), so my_plus_status() / isPlusActive() keep working unchanged regardless
// of who paid. No-op everywhere outside iOS/Android (Capacitor.isNativePlatform() === false): web keeps using
// billingRepository.ts exclusively.

import { Capacitor } from '@capacitor/core'
import { LOG_LEVEL, PURCHASES_ERROR_CODE, Purchases, type CustomerInfo } from '@revenuecat/purchases-capacitor'

// API keys PÚBLICAS de RevenueCat (no son secretas, viajan en el cliente igual que la de Supabase) — una por tienda,
// se consiguen en app.revenuecat.com → Apps, una vez conectadas App Store Connect y Google Play Console. Vacías
// hasta que ese proyecto exista: apiKeyForPlatform() devuelve null y configureRevenueCat() no hace nada, igual que
// en web.
function envKey(name: 'VITE_REVENUECAT_IOS_API_KEY' | 'VITE_REVENUECAT_ANDROID_API_KEY'): string {
  const value = import.meta.env[name]
  return typeof value === 'string' ? value.trim() : ''
}

// TODO: confirmar que coincide con el identifier real una vez se cree el entitlement "Plus" en el dashboard de
// RevenueCat (Entitlements) — hoy es solo el nombre propuesto.
export const PLUS_ENTITLEMENT_ID = 'plus'

function apiKeyForPlatform(): string | null {
  const platform = Capacitor.getPlatform()
  if (platform === 'ios') return envKey('VITE_REVENUECAT_IOS_API_KEY') || null
  if (platform === 'android') return envKey('VITE_REVENUECAT_ANDROID_API_KEY') || null
  return null
}

let configuredForUserId: string | null = null

/**
 * Configures the RevenueCat SDK once per signed-in user, with the Supabase user id as `appUserID` — the same id
 * revenuecat-webhook validates and writes to plus_entitlements, so there is one identity across Mercado Pago and
 * RevenueCat. No-op on web, and a no-op repeat call for the same user (RevenueCat keeps the session across app
 * restarts; there is no need to reconfigure). Switching the signed-in user (logout/login) is NOT handled here yet —
 * that needs Purchases.logOut() wired into the auth flow once there is a second real account to test it with.
 */
export async function configureRevenueCat(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || configuredForUserId === userId) return
  const apiKey = apiKeyForPlatform()
  if (!apiKey) {
    console.warn('RevenueCat: falta la API key de este build (VITE_REVENUECAT_IOS_API_KEY / _ANDROID_API_KEY).')
    return
  }
  await Purchases.setLogLevel({ level: LOG_LEVEL.WARN })
  await Purchases.configure({ apiKey, appUserID: userId })
  configuredForUserId = userId
}

export interface NativeEntitlement {
  isActive: boolean
  expiresAt: string | null
  /** Where the store lets the person manage/cancel the subscription (App Store or Play Store), when known. */
  managementUrl: string | null
}

function readEntitlement(customerInfo: CustomerInfo): NativeEntitlement {
  const active = customerInfo.entitlements.active[PLUS_ENTITLEMENT_ID]
  return {
    isActive: Boolean(active),
    expiresAt: active?.expirationDate ?? null,
    managementUrl: customerInfo.managementURL,
  }
}

/** Current entitlement state as RevenueCat sees it right now (a fresh network read, not a cache). */
export async function getNativeEntitlement(): Promise<NativeEntitlement> {
  const { customerInfo } = await Purchases.getCustomerInfo()
  return readEntitlement(customerInfo)
}

/**
 * Buys the monthly package of the current offering. Throws 'no_offering_configured' when RevenueCat has no
 * offering set up yet (expected until the dashboard and the store products exist) and rethrows RevenueCat's own
 * PurchasesError otherwise — callers should check `isPurchaseCancelled` to tell a cancel from a real failure.
 */
export async function purchaseMonthlyPlus(): Promise<NativeEntitlement> {
  const offerings = await Purchases.getOfferings()
  const monthly = offerings.current?.monthly ?? offerings.current?.availablePackages[0]
  if (!monthly) throw new Error('no_offering_configured')
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: monthly })
  return readEntitlement(customerInfo)
}

export async function restoreNativePurchases(): Promise<NativeEntitlement> {
  const { customerInfo } = await Purchases.restorePurchases()
  return readEntitlement(customerInfo)
}

/** True when a purchase failed because the person backed out of the store sheet (not a real error to show). */
export function isPurchaseCancelled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  )
}
