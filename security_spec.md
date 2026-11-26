# TECHMAN AI LMS — Security Specification & Threat Invariants

## Core Data Invariants
1. **Owner Immutability**: Only verified Firebase Auth accounts matching `techmanfgoc@gmail.com` or `mrashadh64@gmail.com` (`email_verified == true`) hold root `SUPER_ADMIN` privileges and can never be demoted or deleted by any non-owner or client mutation.
2. **No Self-Role Escalation**: A newly signed-in user creating `/users/{uid}` may ONLY create a `STUDENT` profile (unless they are a verified Owner account); non-owner users can NEVER modify their own `role`, `accountStatus`, or `studentId`.
3. **PII Isolation**: Emails, phone numbers, WhatsApp numbers, addresses, and guardian contacts reside in `/users/{uid}/private/pii` and are readable only by the owning user or authorized admins—never via blanket `isSignedIn()` reads.
4. **Payment Terminal Lock**: Students can only submit payments with `status == 'Pending Verification'` and no `receiptNumber`/`verifiedBy`. Once an Accountant/Admin marks a payment `Verified`, it becomes immutable against unauthorized tampering.
5. **Audit Trail Immutability**: `/auditLogs/{logId}` is strictly append-only; update and delete operations are universally denied (`if false`).
6. **AI Privacy Isolation**: `/aiConversations/{id}` and `/careerProfiles/{uid}` strictly enforce `userId == request.auth.uid` on both read and list queries.
7. **Public Verification Scoping**: Public visitors can read `/certificates/{certificateNumber}` and `/applicationTrackers/{applicationNumber}` by exact ID (`get`), never scraping the full collection (`list` restricted to admins).
8. **Human-in-the-Loop Approvals**: AI-generated exams stay `draft` until approved; CMS media stays `draft` until published by Content Manager/Admin; affiliate payouts require Admin/Owner approval.

## The Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Self-Admin Escalation**: Normal user writes `/users/{uid}` with `role: "SUPER_ADMIN"`.
2. **Unverified Email Spoof**: Request with `email: "mrashadh64@gmail.com"` and `email_verified: false` attempts admin write.
3. **Owner Deletion Attempt**: Admin attempts to delete `/admins/{ownerUid}` with `protectedOwner: true`.
4. **Shadow Field Injection**: Student updates `/users/{uid}` adding ghost field `isVerified: true`.
5. **PII Cross-Read**: Student A attempts `get` on `/users/studentB/private/pii`.
6. **Self-Approved Payment**: Student creates `/payments/{id}` with `status: "Verified"` and `receiptNumber: "RCP-999"`.
7. **Verified Payment Tampering**: Student or staff attempts to alter `amountLkr` after `status == "Verified"`.
8. **Audit Log Erasure**: Any user attempts `delete` or `update` on `/auditLogs/{logId}`.
9. **AI Conversation Leak**: Student A attempts `list` on `/aiConversations` without `userId == request.auth.uid`.
10. **ID Poisoning**: Client writes `/courses/<2000-char-invalid-id>` with special characters.
11. **Exam Score Spoofing**: Student creates `/examResults/{id}` with `resultStatus: "published"` and `approvedBy: "self"`.
12. **Unapproved Certificate Forgery**: Student creates `/certificates/TM-FAKE-001` with `status: "Issued"`.
