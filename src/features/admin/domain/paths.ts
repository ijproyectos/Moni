export const ADMIN_PATH = '/adminmoni'

export const adminPath = (...segments: string[]): string => [ADMIN_PATH, ...segments].join('/')
