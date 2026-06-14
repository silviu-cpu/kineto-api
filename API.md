# kineto-api — Referință API pentru Frontend

Base URL (dev): `http://localhost:3000`

## Autentificare
- Doar **staff** (DOCTOR / ADMIN) au cont. Pacienții **nu** au cont.
- Login → primești `accessToken` (JWT). Trimite-l pe rutele protejate ca header:
  `Authorization: Bearer <accessToken>`
- Tokenul expiră în `JWT_EXPIRES_IN` (default `1d`).

## Roluri
- `ADMIN` — acces total (servicii, doctori, toate programările).
- `DOCTOR` — își gestionează doar profilul, programul, time-off-ul și programările proprii.

## Coduri de eroare
- `400` validare eșuată / slot în afara programului / în trecut / blocat.
- `401` fără token sau token invalid.
- `403` rol insuficient (ex. DOCTOR încearcă acțiune de ADMIN).
- `404` resursă inexistentă.
- `409` slot deja rezervat.
- `429` rate-limit depășit (vezi booking public).

---

## AUTH

### POST `/auth/login` — public
Body:
```json
{ "email": "admin@kineto.local", "password": "admin1234" }
```
Răspuns `201`:
```json
{
  "accessToken": "eyJhbGciOiJI...",
  "user": { "id": "ck...", "fullName": "Administrator", "role": "ADMIN" }
}
```
Credențiale greșite → `401`.

### GET `/auth/me` — protejat
Răspuns `200`:
```json
{
  "id": "ck...",
  "email": "admin@kineto.local",
  "fullName": "Administrator",
  "role": "ADMIN",
  "doctorProfileId": null
}
```
(`doctorProfileId` e completat doar pentru DOCTOR.)

---

## SERVICES

### GET `/services` — public
Doar servicii active. Răspuns `200`:
```json
[{ "id": "ck...", "name": "Kinetoterapie", "durationMinutes": 30, "price": null, "active": true }]
```

### POST `/services` — ADMIN
```json
{ "name": "Masaj terapeutic", "durationMinutes": 45, "price": 150 }
```
`price` opțional (int ≥ 0). `durationMinutes` int > 0.

### PATCH `/services/:id` — ADMIN
Body parțial (orice câmp din POST).

### DELETE `/services/:id` — ADMIN
Soft delete (`active=false`). Nu mai apare în `GET /services`.

---

## DOCTORS
`:id` = **DoctorProfile.id** (NU User.id).

### GET `/doctors` — public
Doctori activi:
```json
[{
  "id": "ck...", "specialty": "Kinetoterapie", "bio": null, "photoUrl": null,
  "defaultSlotMinutes": 30, "active": true,
  "user": { "fullName": "Dr. Ana Pop", "email": "dr.pop@kineto.local" }
}]
```

### GET `/doctors/:id` — public
Un singur doctor (același shape).

### POST `/doctors` — ADMIN
Creează cont DOCTOR + profil (parola e hash-uită):
```json
{
  "email": "dr.pop@kineto.local",
  "password": "doctor1234",
  "fullName": "Dr. Ana Pop",
  "specialty": "Kinetoterapie",
  "bio": "optional",
  "photoUrl": "optional",
  "defaultSlotMinutes": 30
}
```

### PATCH `/doctors/:id` — ADMIN sau doctorul însuși
Editează profilul (toate opționale):
```json
{ "fullName": "...", "specialty": "...", "bio": "...", "photoUrl": "...", "defaultSlotMinutes": 30 }
```

### DELETE `/doctors/:id` — ADMIN
Soft delete (`active=false`).

---

## PROGRAM (Working Hours)

### GET `/doctors/:id/working-hours` — public
```json
[{ "id": "ck...", "doctorId": "ck...", "weekday": 1, "startTime": "09:00", "endTime": "12:00" }]
```
`weekday`: 0=Duminică … 6=Sâmbătă. Ore în format `"HH:mm"` (24h).

### PUT `/doctors/:id/working-hours` — ADMIN sau doctorul însuși
**Înlocuiește complet** programul. Body:
```json
{
  "items": [
    { "weekday": 1, "startTime": "09:00", "endTime": "12:00" },
    { "weekday": 2, "startTime": "09:00", "endTime": "17:00" }
  ]
}
```
Validare: `HH:mm` și `startTime < endTime`. `items: []` golește programul.

---

## TIME-OFF (concedii / blocaje)

### GET `/doctors/:id/time-off` — public
```json
[{ "id": "ck...", "doctorId": "ck...", "date": "2026-07-01T00:00:00.000Z",
   "startTime": "10:00", "endTime": "12:00", "reason": "Concediu" }]
```

### POST `/doctors/:id/time-off` — ADMIN sau doctorul
```json
{ "date": "2026-07-01", "startTime": "10:00", "endTime": "12:00", "reason": "optional" }
```
Fără `startTime`/`endTime` ⇒ **toată ziua** blocată. (Ambele împreună sau deloc.)

### DELETE `/time-off/:id` — ADMIN sau doctorul

---

## AVAILABILITY (sloturi libere)

### GET `/doctors/:id/availability?date=YYYY-MM-DD&serviceId=<id>` — public
Calculează sloturile libere pe baza programului, duratei serviciului, programărilor existente și time-off.
```json
[{ "startTime": "09:00", "endTime": "09:30" }, { "startTime": "09:30", "endTime": "10:00" }]
```
- Pas slot = `service.durationMinutes`.
- Exclude sloturi ocupate (programări `CONFIRMED`), time-off și, dacă `date == azi`, orele trecute.
- Fără program în acea zi ⇒ `[]`.

---

## APPOINTMENTS (programări)

### POST `/appointments` — **PUBLIC** (booking pacient)
Rate-limit: **5 req / minut / IP** (`429` la depășire).
```json
{
  "doctorId": "ck...",
  "serviceId": "ck...",
  "date": "2026-06-15",
  "startTime": "09:00",
  "patientName": "Ion Ionescu",
  "patientPhone": "0712345678",
  "patientEmail": "ion@example.com",
  "notes": "durere genunchi"
}
```
`patientEmail` și `notes` opționale. Serverul recalculează `endTime` din durata serviciului și re-validează slotul.

Răspuns `201` (status mereu `CONFIRMED`):
```json
{
  "id": "ck...", "doctorId": "ck...", "serviceId": "ck...",
  "patientName": "Ion Ionescu", "patientPhone": "0712345678", "patientEmail": "ion@example.com",
  "date": "2026-06-15T00:00:00.000Z", "startTime": "09:00", "endTime": "09:30",
  "status": "CONFIRMED", "notes": "durere genunchi", "createdAt": "..."
}
```
Erori:
- slot ocupat → `409 { "message": "Slotul tocmai a fost rezervat" }`
- slot în afara programului / în trecut / blocat → `400`
- doctor/serviciu inexistent sau inactiv → `404`

> La succes, backendul trimite email de notificare către doctor/clinică (EmailJS). Pacientul NU primește email. Eșecul emailului NU anulează programarea.

### GET `/appointments?doctorId=&date=&status=` — protejat
- **ADMIN**: vede tot; filtre opționale `doctorId`, `date` (`YYYY-MM-DD`), `status` (`CONFIRMED`|`CANCELLED`).
- **DOCTOR**: vede DOAR programările lui (`doctorId` din query e ignorat).

Răspuns include serviciul:
```json
[{
  "id": "ck...", "patientName": "Ion Ionescu", "startTime": "09:00", "endTime": "09:30",
  "status": "CONFIRMED", "date": "2026-06-15T00:00:00.000Z",
  "service": { "id": "ck...", "name": "Kinetoterapie", "durationMinutes": 30 }
}]
```

### PATCH `/appointments/:id/status` — protejat (ADMIN sau doctorul deținător)
```json
{ "status": "CANCELLED" }
```
La `CANCELLED`, slotul redevine automat liber în `availability`.

---

## Flux tipic în FE
1. **Pagina publică**: `GET /doctors`, `GET /services`, apoi `GET /doctors/:id/availability?date=&serviceId=` → afișezi sloturile → `POST /appointments`.
2. **Login staff**: `POST /auth/login` → salvezi `accessToken`.
3. **Dashboard doctor/admin**: `GET /appointments?...`, `PATCH /appointments/:id/status`, `PUT /doctors/:id/working-hours`, time-off etc.

## Note de integrare
- CORS e activat pentru `FRONTEND_URL` (din `.env`, default `http://localhost:4200`).
- Toate datele sunt `YYYY-MM-DD`, orele `HH:mm` (24h).
- Body invalid → `400` cu listă de mesaje (`whitelist` activ: câmpurile necunoscute sunt respinse).