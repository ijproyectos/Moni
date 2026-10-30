export type ActivityView = 'calendar' | 'list'

// Versioned so a future change of shape can ignore stale values instead of misreading them.
const STORAGE_KEY = 'moni:activity-view:v1'

export function loadActivityView(): ActivityView {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'list' || value === 'calendar' ? value : 'calendar'
  } catch {
    return 'calendar'
  }
}

export function saveActivityView(view: ActivityView): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, view)
  } catch {
    // Private mode or blocked storage: the choice just is not remembered.
  }
}
