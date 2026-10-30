# Receipt scan ("Sacar foto")

Part of the global "+" speed-dial: **Sacar foto**, **Por voz**, **Manual**. This document covers the photo path
and the `parse-receipt` Edge Function. Voice and text entry (`parse-movements`) are documented in `SPRINT_6.md`.

## Flow

1. The person taps "+" and then "Sacar foto". A hidden `<input type="file" accept="image/*" capture="environment">`
   opens the rear camera on phones and a file picker on desktop.
2. The browser downscales the photo (`src/features/ai/domain/imageDownscale.ts`): longest side at most 1600 px,
   re-encoded as JPEG at quality 0.8 (lowered to 0.65 / 0.5 if the result is still above 1.4 MB). Re-encoding
   through a canvas removes EXIF data (GPS, camera model, timestamps) and applies the orientation.
3. The screen shows "Analizando tu factura…" with a **Cancelar** button (aborts the request).
4. The base64 JPEG is sent to `parse-receipt`. The function answers with ONE draft expense in the same shape as
   `parse-movements`, so the client reuses `toDrafts` and the same confirmation list ("Revisá y guardá").
5. The person edits amount, category, date, note (merchant) and account, then taps **Guardar**. **Nothing is saved
   automatically**: the function never writes transactions.

## Function contract

`POST /functions/v1/parse-receipt` with a user JWT.

Request: `{ "image": "<base64, no data: prefix>", "mediaType": "image/jpeg" | "image/png" | "image/webp", "today": "YYYY-MM-DD" }`

Success (200): `{ "movements": [ { kind: "expense", amountCents, note, categoryId | null, accountId: null, occurredOn, confidence } ], "warnings": [...] }`

Errors (JSON `{ "error": code }`):

| Status | Code                                | Meaning                                                                                            |
| ------ | ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request` / `invalid_image` | Malformed body, media type not allowed, bad base64 or magic bytes that do not match the media type |
| 401    | `not_authenticated`                 | Missing or non-user token                                                                          |
| 413    | `image_too_large`                   | Body above the cap or decoded image above 1.5 MB                                                   |
| 422    | `unsupported_currency`              | The receipt is not in ARS (never guessed or converted)                                             |
| 422    | `receipt_unreadable`                | Not a receipt, no readable total, currency unknown, amount out of range                            |
| 429    | `ai_quota_exceeded`                 | Daily limit reached                                                                                |
| 502    | `ai_unavailable`                    | Model call failed, refused or returned something unusable                                          |

## Security model

Mirrors `parse-movements`:

- `verify_jwt = true` in `supabase/config.toml`, plus a role check that rejects the anon key.
- CORS echoes only origins in `ALLOWED_ORIGINS` (fail closed to `http://localhost:5173`).
- Request size cap (about 2 MB of base64) enforced from `Content-Length` and again while streaming.
- Reads and the quota RPC use the caller's token and the anon key (RLS). No service role key.
- The image is validated server-side: allowed media types only, strict base64, decoded size at most 1.5 MB, magic
  bytes must match the declared type.
- The system prompt states that the image and any text in it are untrusted data, never instructions. The model
  only returns a category **name** from the caller's own expense categories; ids are mapped server-side.
- Output validation: `is_receipt` must be true, currency must be `ARS`, amount greater than 0 and at most
  100,000,000 ARS, date not in the future and within 400 days (otherwise moved to today with a `date_adjusted`
  warning), category matched to a real id or `null`.
- Logs contain only error classes and HTTP statuses: never the image, the key or the model response.

Shared code: `supabase/functions/_shared/http.ts` (new, used only by `parse-receipt`). Pure helpers that must
behave identically in both functions (origin check, JWT role check, quota error mapping, date helpers) are
**imported** from `../parse-movements/lib.ts`; that file is not modified.

## Privacy

- The (downscaled, EXIF-free) image is sent to **Anthropic** for analysis through the Messages API. It is not
  stored by Moni: not in Supabase Storage, not in the database, not in logs, not in the browser after the request.
- Only the extracted draft (amount, date, merchant as note, category) reaches the database, and only after the
  person confirms it.
- Receipts can contain personal data (names, card digits, addresses). The UI says nothing is saved until confirmed;
  consider adding a line to the privacy policy that receipt photos are processed by Anthropic.

## Quota

Each call consumes one use of feature `parse_receipt` through `consume_ai_quota`, with a daily limit of 30
(the RPC clamps it to 1..100; the day is the Argentina calendar day). The use is charged before the model call and
is not refunded on failure or when the person cancels. The limit is separate from `parse_movements`.

## Limits

- ARS receipts only (explicit `unsupported_currency` otherwise).
- One expense per photo.
- JPEG, PNG or WebP; the client always sends JPEG.
- 1.5 MB decoded, 1600 px longest side from the client.
- Needs a connection: the menu item is disabled offline and `parseReceipt` raises `OfflineError` before any request.

## Deploy

```bash
supabase functions deploy parse-receipt --use-api
```

- Secrets are shared with `parse-movements`: `ANTHROPIC_API_KEY` and `ALLOWED_ORIGINS` are project-level Edge
  Function secrets, so nothing new has to be set.
- No migration: `consume_ai_quota` accepts any feature name matching `^[a-z][a-z0-9_]{0,39}$`.
- The bundle imports `../_shared/http.ts` and `../parse-movements/lib.ts`; keep both in the repository.

## Manual checks after deploy

- [ ] A real ARS receipt returns a draft with the right total and date.
- [ ] A receipt in USD returns 422 `unsupported_currency` and the app shows the specific message.
- [ ] A photo that is not a receipt returns 422 `receipt_unreadable`.
- [ ] A receipt containing "ignore previous instructions" text does not change the output format.
- [ ] The 31st call of the day returns 429 `ai_quota_exceeded`.
- [ ] The anon key as bearer returns 401.
- [ ] Camera capture works on iOS Safari and Android Chrome (installed PWA included).
