# Ghost Protocol Hybrid Database — Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Default-Deny Catch-All:** Every unlisted collection or document path is unconditionally denied (`allow read, write: if false`).
2. **Verified Identity Gate:** All authenticated operations require `request.auth != null && request.auth.token.email_verified == true`.
3. **Bootstrapped & Registry Admin:** `isAdmin()` is true only if `exists(/databases/$(database)/documents/admins/$(request.auth.uid))` OR `(request.auth.token.email == 'abinavthejas2001@gmail.com' && request.auth.token.email_verified == true)`.
4. **PII Strict Isolation:** `/users/{userId}/private/{docId}` contains `email`, `phone`, and `bikeRegistrationNumber` and can ONLY be read or written when `request.auth.uid == userId || isAdmin()`. Non-owners can never read private PII documents.
5. **Anti-Update-Gap & Strict Key Whitelisting:** Every `create` and `update` invokes its standalone `isValid[Entity](incoming())` helper, enforcing `keys().hasAll(...)` and `keys().hasOnly(...)` with strict `.size()` bounds on every string and list.
6. **Temporal Integrity & Immutable Ownership:** `createdAt == request.time` on `create`, `updatedAt == request.time` on `update`, and `incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt` on all updates.
7. **Terminal State Locking:** Once a `CommunityRecord` reaches `status == 'archived'`, no non-admin updates are permitted.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Payload 1 (Identity Spoofing on Create):** User `uid_attacker` creates `/community_records/rec_1` with `ownerId: "uid_victim"`. -> `PERMISSION_DENIED`.
2. **Payload 2 (Shadow Field Injection on Create):** User creates `/community_records/rec_2` with an undeclared field `isSuperAdmin: true`. -> `PERMISSION_DENIED`.
3. **Payload 3 (Email Spoofing Without Verification):** User with `email: "abinavthejas2001@gmail.com"` but `email_verified: false` attempts admin write to `/admins/uid_1`. -> `PERMISSION_DENIED`.
4. **Payload 4 (PII Cross-User Read):** Authenticated user `uid_attacker` attempts `get` on `/users/uid_victim/private/info`. -> `PERMISSION_DENIED`.
5. **Payload 5 (ID Poisoning / Oversized Path Variable):** User attempts to create `/community_records/invalid$id!with@spaces`. -> `PERMISSION_DENIED`.
6. **Payload 6 (Denial-of-Wallet String Overflow):** User creates `/community_records/rec_6` with a 10,000-character `summary` (exceeding max 4000). -> `PERMISSION_DENIED`.
7. **Payload 7 (Update-Gap Value Poisoning):** User updates whitelisted field `title` on `/community_records/rec_1` with a boolean `true` instead of a bounded string. -> `PERMISSION_DENIED`.
8. **Payload 8 (Immutable Field Tampering):** Owner updates `/community_records/rec_1` attempting to mutate `ownerId` or `createdAt`. -> `PERMISSION_DENIED`.
9. **Payload 9 (Client Timestamp Forgery):** User creates `/shared_modules/discussions` with a past/future `createdAt` not equal to `request.time`. -> `PERMISSION_DENIED`.
10. **Payload 10 (Terminal State Bypass):** Owner attempts to update a `CommunityRecord` whose existing `status` is already `'archived'`. -> `PERMISSION_DENIED`.
11. **Payload 11 (Unbounded Array Injection):** User updates `/shared_modules/discussions` with an `items` array containing 250 elements (exceeding max 100) or non-map first element. -> `PERMISSION_DENIED`.
12. **Payload 12 (Self-Assigned Admin Privilege Escalation):** Regular user `uid_regular` attempts to create `/admins/uid_regular`. -> `PERMISSION_DENIED`.
