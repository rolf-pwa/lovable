# ProsperWise Advisors — Privacy & Security Policy

**Last updated:** August 2026
**Applies to:** ProsperWise Portal (the client portal and internal CRM operated by ProsperWise Advisors)

## About this document

This policy describes how ProsperWise Advisors ("ProsperWise", "we", "us") collects, uses, protects, and retains personal and financial information through the ProsperWise Portal platform.

This document is structured around the domains used by recognized security frameworks (SOC 2 Trust Services Criteria and ISO 27001) — Security, Availability, Confidentiality, Processing Integrity, and Privacy — because that structure gives a clear, complete way to organize our practices. **ProsperWise has not undergone a formal SOC 2 or ISO 27001 certification audit, and this document does not claim such certification.** It is a self-attested statement of our current practices, informed by the rigor of those frameworks. The privacy commitments below are grounded in the Personal Information Protection and Electronic Documents Act (PIPEDA) and British Columbia's Personal Information Protection Act (PIPA), which govern how we handle personal information as a BC-based firm.

An internal technical document maps every commitment in this policy to its specific implementation, for our own audit and maintenance purposes.

---

## 1. Security

### 1.1 Authentication and access

Access to the internal system is restricted to ProsperWise staff, authenticated through their ProsperWise Google Workspace account. Client access to the portal does not use passwords; instead, clients receive a one-time passcode by email for each new session, with automatic lockout after repeated failed attempts. Returning devices may be remembered securely to reduce repeated verification, using a token that is never stored in a form that could be reversed to impersonate the device.

### 1.2 Data access controls

Our database enforces row-level access control on every table containing client or business data. Client-facing systems are architected so that clients never have direct database access — all requests pass through server-side logic that verifies the request belongs to that client's own household before returning any data.

### 1.3 Encrypted communications and storage

All data in transit between your device, our servers, and our infrastructure providers is encrypted using industry-standard TLS/HTTPS. Data at rest is encrypted at the infrastructure level by our cloud providers.

### 1.4 Third-party integration security

Where ProsperWise Portal connects to third-party services (payment processing, email, calendaring, task management, and telephony), those connections are authenticated using secure, revocable credentials. Inbound notifications from payment and telephony providers are cryptographically verified to confirm they genuinely originate from that provider before being processed.

### 1.5 Automated security monitoring

We run automated security self-checks against our production environment, covering access-control isolation, injection resistance, authentication lockout behavior, cross-origin request restrictions, and third-party credential validity. Failures trigger immediate internal alerts.

### 1.6 Outbound sensitive-data safeguard

Certain outbound client communications (SMS, email) pass through an automated filter designed to catch and block sensitive identifiers (such as government ID numbers, account numbers, and specific financial figures) and certain health-related terms before they are sent through third-party channels. This is an additional safeguard layered on top of our other controls — it is not represented as a complete or infallible data-loss-prevention system.

---

## 2. Availability

ProsperWise Portal is hosted on established cloud infrastructure providers (Google Firebase for the application, Supabase/PostgreSQL for the database) with automated deployment pipelines and platform-level redundancy provided by those vendors. **We are in the process of enabling formal database backups** for additional data-loss protection beyond the underlying infrastructure provider's own resilience — see "Where we're still building," below.

---

## 3. Confidentiality

Client information is treated as confidential and is only accessible to ProsperWise staff for legitimate business purposes related to serving that client. Documents shared through our secure Vault are access-controlled per client household, with staff able to designate specific files as client-visible before a client can see them. All Vault access is logged.

---

## 4. Processing Integrity

Our system is designed so that client-facing views of financial data (accounts, holdings, insurance policies) are always scoped to that client's own household, verified on every request. Automated tests run regularly to confirm this isolation holds.

---

## 5. Privacy

We are committed to protecting your personal information in accordance with PIPEDA and BC's PIPA. Our practices follow these principles:

**Accountability.** ProsperWise is responsible for personal information under its control and has designated individuals accountable for privacy practices.

**Identifying purposes.** We collect personal and financial information for the purpose of providing wealth advisory and family-office services — including household and relationship management, financial account tracking, insurance record-keeping, billing, and client communication.

**Consent.** Information is collected with your knowledge as part of engaging ProsperWise's services. Where we connect to third-party services on your behalf (such as sending calendar invitations or processing payments), this is done to deliver the services you've engaged us for.

**Limiting collection.** We collect information relevant to the advisory relationship — contact details, household and family structure, financial holdings, insurance information, and correspondence related to your engagement with us.

**Limiting use and disclosure.** Your information is used only for the purposes of providing our services and is disclosed to third parties only as necessary to deliver those services (see "Third parties we work with," below), or as required by law.

**Accuracy.** We maintain processes for staff to keep client records current and to correct information on request.

**Safeguards.** See Section 1 (Security) above for the technical and organizational measures protecting your information.

**Openness.** This document is our commitment to being transparent about our practices. We are also open about the current limits of those practices — see "Where we're still building," below.

**Individual access.** You may request a summary of the personal information we hold about you by contacting your advisor directly. **We do not yet have an automated self-service tool for this within the portal** — today, this is handled as a manual request to our team.

**Challenging compliance.** If you have concerns about how your information is handled, please contact your advisor or ProsperWise directly. You also have the right to file a complaint with the Office of the Privacy Commissioner of Canada or BC's Office of the Information and Privacy Commissioner.

### Third parties we work with

We work with the following categories of service providers, each of whom processes a limited scope of information necessary for their function:

- **Google Workspace** — email, calendar, document storage, and spreadsheet tools used by staff in serving your account
- **Square** — payment processing for invoicing (Square handles card details directly; ProsperWise's own systems do not store card numbers)
- **Asana** — internal task and workflow management
- **A telephony/SMS provider** — client calls and text communication, with calls and messages retained for service continuity

### Data retention

**We are in the process of formalizing a data retention schedule.** Today, records are retained for the duration of the advisory relationship and are removed by staff action when no longer needed, rather than on an automated schedule. We will update this policy as a formal retention schedule is adopted.

### Where your data is stored

Our production database is operated in the Canada Central data center region.

---

## Where we're still building

In the interest of transparency, here is what we consider works-in-progress rather than finished commitments:

- A formal, published data retention and deletion schedule
- A self-service tool for clients to request a copy or deletion of their information directly through the portal
- Move from firm-wide staff access toward more granular, role-based access restricted to each client's assigned advisory team
- A formally documented registry of service-provider agreements
- Formal, scheduled database backups (currently relying on underlying infrastructure resilience only)

We'd rather tell you what we're actively improving than overstate what's already finished.

---

## Contact

Questions about this policy, or requests related to your personal information, can be directed to your ProsperWise advisor or to **rolf@prosperwise.ca**.
