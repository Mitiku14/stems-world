# SMS Provider Activation & Integration Guide (Phase 3A)

This document serves as the operational readiness guide and decision checklist for activating a real SMS transport vendor for phone OTP verification on the backend.

---

## 1. Provider Decision Checklist

Before activating `SMS_ENABLED=true` in production, obtain and verify the following details from the chosen SMS vendor during the technical decision meeting:

| # | Information Item | Provider Value / Decision | Notes / Requirement |
| :--- | :--- | :--- | :--- |
| 1 | **Provider Name** | *(e.g., Africa's Talking, Infobip, Ethio Telecom)* | Set as `SMS_PROVIDER` |
| 2 | **API Base URL** | `https://...` | Set as `SMS_API_BASE_URL` |
| 3 | **API Credential / Key** | `[SECURE]` | Set as `SMS_API_KEY` (never commit) |
| 4 | **Account / Username** | *(if required)* | Set as `SMS_USERNAME` |
| 5 | **Sender ID** | *(e.g., STEMWORLD)* | Set as `SMS_SENDER_ID` |
| 6 | **Sender-ID Approval Status** | Approved / Pending | Must be approved by Ethio Telecom / Gateway |
| 7 | **OTP Permitted** | Yes / No | OTP content template must be allowed |
| 8 | **Transactional SMS Permitted** | Yes / No | Ensure non-marketing route |
| 9 | **Ethiopian Destination Support** | Yes / No | Must support `+251` destination numbers |
| 10 | **Ethio Telecom Interconnect** | Direct / Aggregator | Verify delivery rates to Ethio Telecom subnets |
| 11 | **Sandbox Credentials** | *(for testing)* | Required for staging verification |
| 12 | **Production Credentials** | `[SECURE]` | Required for live deployment |
| 13 | **Price per Segment** | *(cost in ETB/USD)* | Track operational budget |
| 14 | **Prepaid / Minimum Balance** | *(balance)* | Ensure auto-refill or low-balance alerts |
| 15 | **Rate Limits** | *(requests per sec)* | Configure request rate limiting if needed |
| 16 | **Delivery Receipts (DLR)** | Supported / Optional | Webhook callback support |
| 17 | **Required Business Documents** | Business License, TIN, etc. | Required for Sender ID registration |
| 18 | **Production Activation Steps** | Sign-off & Env Config | Toggle `SMS_ENABLED=true` |

---

## 2. Architecture & Provider Adapter Boundary

The authentication pipeline remains 100% independent of the SMS vendor:

```
[Auth Controller]
       │
       ▼
[Token Service]  (Generates OTP, hashes HMAC-SHA256)
       │
       ▼
[SmsService]    (Provider-neutral boundary, handles logging/masking)
       │
       ▼
[Provider Registry] ──► [Concrete Provider Adapter] (Africa's Talking / Infobip / REST)
```

- **Authentication Logic**: Provider-agnostic. No vendor code in controllers or validators.
- **Provider Registration**: Adapters are registered in `src/services/sms/provider.registry.js`.
- **Diagnostic Logging**: Destination phones are masked (e.g. `+251****5678`). Raw OTPs, secrets, and authorization headers are never logged.

---

## 3. Minimal Steps to Activate Selected Provider

When the provider is chosen tomorrow:

1. Create a concrete adapter file in `src/services/sms/providers/<provider_name>.js` implementing:
   ```js
   async ({ to, message, config, timeoutMs }) => {
     // Execute native fetch call with AbortController timeout
     // Return normalized result: { accepted, providerMessageId, status, reason, ambiguous }
   }
   ```
2. Register the adapter in `src/services/sms/provider.registry.js`:
   ```js
   registerProvider('vendor_name', vendorAdapter);
   ```
3. Set production environment variables in `.env`:
   ```env
   SMS_ENABLED=true
   SMS_PROVIDER=vendor_name
   SMS_API_BASE_URL=https://api.vendor.com/v1/sms
   SMS_API_KEY=your_actual_api_key
   SMS_SENDER_ID=YOUR_SENDER_ID
   SMS_TIMEOUT_MS=5000
   ```
4. Execute `npm test` to verify zero regressions.
