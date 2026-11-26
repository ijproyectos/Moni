/** Keys of the derived events a push can be about: a payment due (subscription or fixed expense) or a registered charge. */
export const PUSH_EVENT_KEY = /^(due|fdue|charged):[0-9a-f-]{36}(:\d{4}-\d{2}-\d{2})?$/i
