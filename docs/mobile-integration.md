# VERSYS mobile integration contract

**Contract version:** OpenAPI `2.0.0` (`docs/openapi.yaml`)
**REST base:** `{API_HOST}/v1` (local default `http://localhost:3000/v1`)  
**Realtime:** Socket.IO on `{REALTIME_HOST}` (local default `http://localhost:3001`), namespace `/realtime`

This document is the locked client guide for Phase 9. Treat field names as camelCase JSON.

---

## 1. Auth (OTP → device-bound JWT session)

Create a random UUID v4 once per app installation and retain it as `deviceId`. It is an installation identifier, not an FCM token, IMEI, advertising ID, or phone number.

1. `POST /v1/auth/otp/request`  
   Body: `{ "phoneE164": "+2348012345678" }`  
   - Pattern: `^\+[1-9]\d{7,14}$`  
   - `202` → `{ "expiresInSeconds": number }`  
   - `429` rate limited · `502` SMS provider failed (when not mock)

2. `POST /v1/auth/otp/verify`  
   Body: `{ "phoneE164": "+234…", "code": "123456", "deviceId": "<installation-uuid>" }`
   - `201` → `{ "accessToken", "refreshToken", "expiresIn" }`
   - Store both tokens in Keychain/Keystore-backed secure storage.
   - Send `Authorization: Bearer <accessToken>` on protected routes.

3. `POST /v1/auth/refresh`
   Body: `{ "refreshToken": "<current-token>", "deviceId": "<same-installation-uuid>" }`
   - `200` → a new `{ "accessToken", "refreshToken", "expiresIn" }`
   - A refresh token is single-use. Allow only one in-flight refresh in the app and atomically replace the stored token after success.
   - A missing or malformed request returns `400`. A wrong installation identity, token reuse, expiry, revocation, or an inactive account returns `401`. Re-authenticate with OTP after `401`.
   - A lost refresh response can require OTP again because replaying the old token revokes its family.

Auth responses use `Cache-Control: no-store`; never log either token or persist them in ordinary app preferences.

---

## 2. Device tokens (FCM)

After login (and whenever the FCM token rotates):

`POST /v1/devices/tokens`  
`{ "token": "<fcm-registration-token>", "platform": "android" | "ios" | "web" }`

On logout / uninstall:

`DELETE /v1/devices/tokens`  
`{ "token": "<same-token>" }` → `204`

### FCM data payload (server → device)

Notification title/body plus data map (all string values):

| Key | Meaning |
|-----|---------|
| `incidentId` | UUID or empty |
| `publicCode` | Human code |
| `alertLevel` | `"1"`…`"4"` |
| `attemptId` | Notification attempt UUID (ack with this) |
| `alarm` | `"1"` / `"0"` — play alarm |
| `vibrate` | `"1"` / `"0"` |
| `blinkingBlue` | `"1"` / `"0"` — announcement UX |

Ack delivery (cancels SMS fallback):  
`POST /v1/notifications/{attemptId}/ack`

---

## 3. Core reporter loop

| Step | Call |
|------|------|
| Raise alert | `POST /v1/incidents` `{ type, channel, latitude?, longitude?, placeId?, locationLabel? }` |
| Offline flush | `POST /v1/incidents/offline` — **requires** `clientEventId`, `type`, `channel`, `capturedAt` (ISO-8601) |
| Staff self-accept | `POST /v1/incidents/{id}/assignments` `{}` (omit assignee = self-accept) |
| Accept / reject | `POST /v1/assignments/{id}/accept` · `…/reject` `{ reason, note? }` |
| Location | `POST /v1/location/ping` `{ latitude, longitude, recordedAt, incidentId?, onDuty?, accuracyMetres? }` |

`type` enum: `fire`, `fight`, `ongoing_crime`, `suspicious_movement`, `accident`, `invasion`, `violent_attack`  
`channel` for app: prefer `app_button` or `rapid_sos`

---

## 4. Socket.IO (live updates)

Connect to realtime process (port **3001** locally), namespace **`/realtime`**.

```text
io(REALTIME_URL, { path: '/socket.io', transports: ['websocket'] })
// namespace: /realtime
```

| Client emit | Body | Server ack |
|-------------|------|------------|
| `subscribe:incident` | `{ incidentId }` | `{ ok: true }` |
| `subscribe:dispatch` | (none) | `{ ok: true }` |

| Server emit | Room | Payload |
|-------------|------|---------|
| `incident.created` | `dispatch` | `{ incidentId }` |
| `incident.updated` | `incident:{id}` + `dispatch` | `{ incidentId }` |
| `assignment.accepted` | `dispatch` | assignment payload |
| `assignment.rejected` | `dispatch` | assignment payload |

Dispatchers should `subscribe:dispatch`. Staff following one incident should `subscribe:incident`.

---

## 5. Error shape

All HTTP errors:

```json
{
  "statusCode": 401,
  "error": { "message": "invalid_otp", "statusCode": 401 },
  "correlationId": "…",
  "path": "/v1/auth/otp/verify",
  "timestamp": "2026-11-09T20:00:00.000Z"
}
```

`error` may be a string or object (Nest `HttpException` body). Prefer reading `statusCode` + message string when present.

Maintenance: when `MAINTENANCE_MODE=true`, non-health routes return **503**.

---

## 6. Minimum screens ↔ APIs

| Screen | APIs |
|--------|------|
| Login | otp request/verify |
| Home / SOS | create incident · offline queue |
| My assignment | assignments accept/reject · location ping |
| Announcements | `GET/POST /v1/announcements` |
| Muster | `GET /v1/places/muster` |
| Dispatcher board | `GET /v1/dispatch/board` + socket `subscribe:dispatch` |

Full path list: `docs/openapi.yaml`.

---

## 7. Change policy

- Additive fields are OK without a major bump.  
- Renames / removals / meaning changes require OpenAPI major version bump and mobile coordination.  
- Current lock: **2.0.0**. The major bump makes `deviceId` mandatory for OTP verification.
