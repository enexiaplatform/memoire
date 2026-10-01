# Memoire Commercial Protocol v1

Status: implemented and verified locally in M28. Transport is person-controlled JSON or an authenticated observation receipt through Commercial API v1. This specification does not grant business authority, authenticate a company, require a shared database or execute commercial commands.

The normative wire grammar is `CommercialProtocolMessage` and `normalizeCommercialProtocol` in `src/domain/commercialKernel/commercialProtocol.ts`. The [complete reproducible example](commercial-v1.example.json) is checked against the implementation by the conformance suite. Every listed field is required, including explicit nulls and empty arrays. Unknown fields, unsupported versions/algorithms, malformed text, duplicate references, foreign-party references, dangling links and cyclic requirement dependencies are rejected before use. Object property order in input may vary; array order and string content remain significant.

## Envelope

The normalized top-level order is `protocol`, `version`, `messageId`, `issuedAt`, `issuerReference`, `recipientReference`, `sample`, `body`, `integrity`, `signature`.

| Field | v1 contract |
|---|---|
| protocol / version | Exactly `memoire.commercial` / `1`. Other versions need a separate reviewed adapter. |
| messageId | UUID v4 identifying an immutable message declaration. An amended message should use a new ID and predecessor digest. |
| issuedAt | Valid calendar date and ISO timestamp with seconds and explicit Z or numeric offset. Optional fractional seconds have at most three digits. This is issuer-reported time, never the receiver's knowledge time. |
| issuerReference / recipientReference | Distinct public, case-sensitive references, each at most 200 UTF-16 code units. Both must occur in parties. They are declarations, not account IDs or permissions. |
| sample | Boolean. Sample messages can only enter matching local sample intake; they are excluded from personal recovery/cloud writes. |
| body | The ten concepts and provenance described below. |
| integrity | Exactly `{algorithm: "SHA-256", digest: <lowercase 64 hex>}`. |
| signature | Explicit null, or `{algorithm: "ECDSA-P256-SHA256", publicKey: <canonical base64 SPKI DER>, value: <canonical base64 64-byte P1363 signature>}`. Private keys never enter the message. |

Nonempty text must be well-formed Unicode, fit its field bound and contain no control characters except tab/newline/carriage return. DEL is also refused. Whitespace and Unicode normalization are not silently changed. UUID text is preserved. The normalized full message is limited to 20,000 UTF-16 code units, including signature and capsules; callers must disclose less when this limit is reached.

## Body and the ten concepts

Body order is exactly the row order below. Nested field order is the order shown in each row. References are unique within their respective concept namespace; typed links distinguish those namespaces.

| Concept / field | Exact shape and interpretation |
|---|---|
| Party / parties | Exactly two `{reference, label}` objects. Each text field is bounded to 200. Neither label proves an authenticated organizational identity. |
| Outcome / outcome | `{reference, statement, assessedBy, sharedAcceptance}`. Statement maximum 1,000; assessedBy must equal envelope issuer; sharedAcceptance must be false. This is the shared objective and issuer's attribution, not jointly accepted success. |
| Condition / conditions | Zero to 20 `{reference, partyReference, statement, assessment, assessedBy}`. Statement maximum 1,000; partyReference must occur in parties; assessedBy must equal issuer. Assessment is `supported`, `assumed`, `hypothesis`, `contradicted` or `unknown`. These remain issuer assessments, never accepted recipient Conditions. |
| Requirement / requirements | One to 20 `{reference, partyReference, outcomeReference, conditionReference, expectedOutcome, localAssessment, assessedBy, commitmentStatementIds}`. Outcome reference must match the outcome; condition reference is null or a disclosed same-party Condition. Expected outcome maximum 1,000. Assessment is `resolved`, `unresolved` or `conflicted`, attributed only to issuer. Up to eight unique statement IDs must identify capsules issued by the requirement's declared party. |
| Commitment / commitments | Zero to eight `{statementId, capsuleDigest}`. Each must match one provenance capsule's statement ID and integrity digest. Exactly one row per capsule. The promise, responsible person, parties, due date, reported status and completion claim remain in the original M24 statement inside that M25 capsule, avoiding a second promise definition. |
| Dependency / dependencies | Zero to 30 `{dependentReference, prerequisiteReference, basis, assertedBy}`. Both references must identify disclosed Requirements. No duplicate pair, self link or cycle. Basis maximum 1,000; assertedBy must equal issuer. The recipient's dependency graph is not changed. |
| Evidence / evidenceReferences | Zero to eight `{reference, partyReference, sourceStatementId, kind, recipientAccepted}`. Kind must be `completion-claim`, recipientAccepted false. Source must be a disclosed completed statement with a non-null completion claim issued by that party. References and source IDs are unique. This points to an attributed claim, never accepted canonical Evidence. |
| Money reference / moneyReferences | Zero to eight `{reference, partyReference, externalReference, currency}`. Currency is null or three uppercase letters; other text maximum 200. No amount, transfer, approval or executable consequence is permitted. This is an opaque public document/reference, not a payment instruction. |
| Decision / decisionBoundary | Exactly `{canonicalMutationAllowed: false, humanConfirmationRequired: true, eachPartyControlsItsOwnDecisions: true}`. Every recipient retains its own consequential command and confirmation policy. |
| Shared state change / change | `{kind: "snapshot", previousMessageDigest: null | <lowercase 64 hex>}`. A predecessor is the previous message's **core integrity digest**, scoped to the same issuer, recipient and outcome. It expresses a claimed link, not automatic replacement, causal proof or consensus. |
| Provenance / provenance | `{sourceStateId, sourceStateFingerprint, capsules}`. Source state ID/fingerprint must both be null or UUID v4/64 lowercase hex. A Memoire adapter uses the public M27 disclosure ID and SHA-256 of its normalized public JSON. This is a comparison reference when that artifact is separately available, not proof of the issuer's private database. Capsules follow M25's exact normalization and verification rules; their declared parties and sample flag must match the envelope. |

All references except UUID IDs and digests follow the 200-character public text bound. A wire graph check validates references and cycles only. The existing Kernel remains responsible for canonical Requirement resolution, Evidence acceptance, business timing, money consequences and Decisions.

## Normalization, integrity and signatures

Normalize every object into the fixed order above, recursively normalize M25 capsules and M24 statements in their defined order, retain array order, and retain strings exactly. Serialize with ECMAScript `JSON.stringify` semantics, no indentation or additional escaping, then encode UTF-8. There are no floating-point business values in v1; version is the integer 1.

The core is the first eight envelope fields, ending at body. The integrity digest is SHA-256 of those normalized core bytes. Signing bytes are the normalized core followed by its integrity object. A signature covers party scope, sample mode, all claims/links/provenance, message identity and integrity. The complete normalized envelope's SHA-256 is the transport fingerprint; signatures with the same core can therefore have distinct receipt versions. The predecessor digest deliberately uses core identity rather than signature bytes.

Verification recalculates integrity, verifies every nested capsule and verifies the optional whole-message ECDSA P-256 signature with SHA-256. A signing-key fingerprint is SHA-256 of decoded SPKI bytes. An independently agreed fingerprint, when configured by the recipient, must match and requires a signed message. Verifying an embedded key alone proves control of that key, not that the key belongs to a named company. Unsigned messages prove only internal integrity and can be recomputed by an attacker. Verification always returns `acceptedCommercialTruth: false` and `issuerOrganizationIdentityVerified: false`.

Keys are host-managed. The product neither generates/persists private signing keys nor claims a certificate registry, key rotation service or external company authentication. M25 and M28 share the same signature helpers; no parallel cryptographic engine is introduced.

## Receipt, history and recovery

The local receive command requires explicit confirmation, exact recipient reference and matching sample scope after verification. It wraps the full normalized message as M17 `csv_import` data with namespace `commercial-protocol:` plus SHA-256 of the full declared issuer reference, source event ID equal to messageId, source version equal to full transport fingerprint and reported observedAt equal to issuedAt. Memoire records local receipt time independently. Exact retries return the original immutable receipt; changed message cores sharing the same issuer/ID remain separate conflicting claims.

`commercialProtocolObservation(await verifyCommercialProtocol(message, options))` prepares the same envelope for SDK `receiveObservation`. The existing API authenticates the receiving user and applies owner RLS. Generic observation transport does **not** certify protocol content; receivers must run protocol verification before interpreting it. A successful API receipt remains unaccepted even if arbitrary raw data was supplied.

`deriveProtocolHistory(scope, events, cutoff)` revalidates protocol bytes, source tuple, hashed identity, owner/sample scope and local receipt timestamps. It exposes conflicting issuer/ID declarations and missing same-party/outcome predecessors. It neither chooses a winner nor supersedes local truth. A later receipt cannot appear in an earlier cutoff even when its issuer claims an earlier date. Signed messages still need independently governed business acceptance.

Receipt Events use existing format-15 backup/export and immutable cloud history contracts. No mutable protocol table, global shared state, new State Revision source or new backup format exists. Restoring a receipt does not replay a command, send anything, grant sharing access or accept business claims. Cryptographic verification is repeated on use; archived database shape is not a cryptographic certificate.

## Memoire product adapter

Review offers a protocol download only from an already issued, owner-scoped M27 public assessment. The download is derived, deterministic, unsigned and adds no issuance Event. It reuses public aliases, selected capsules and the same issuer-local Requirements/dependencies. Conditions and money references remain empty because those facts were not disclosed in M27. Requirement condition references stay null. Completion references are emitted only for actual selected capsule completion claims; no accepted recipient Evidence is fabricated.

The folded intake checks content/scope and optional agreed key before enabling confirmation. Editing any input invalidates that check; changing owner/sample scope remounts intake. Receipt uses existing Event durability and leaves recipient Requirements, Conditions, Evidence, commitments, money and Decisions unchanged. No new top-level navigation, external send, execution engine, organization registry or mandatory shared platform is introduced.
