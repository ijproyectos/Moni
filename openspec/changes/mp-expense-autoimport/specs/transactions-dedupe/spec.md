# Domain 3: transactions-dedupe (MODIFIED delta)
(No baseline spec in engram; ADDED/extended behaviour below. Previously: possible-duplicate and cross-claim covered manual entries, subscription charges and fixed payments only.)
## MODIFIED Requirements
### R3.1 Possible-duplicate includes imports
The possible-duplicate heuristic (same account+amount, date +-3 days, not owned by a charge/fixed payment) MUST consider imported MP transactions as candidates in both directions (manual vs import).
- S: GIVEN imported 800 on 05-10 WHEN user adds manual 800 on 05-11 same account THEN possible-duplicate suggested. [pgTAP]
- S: GIVEN already subscription-owned expense THEN still excluded as before. [pgTAP]
### R3.2 Cross-claim guard
One expense MUST NOT back more than one of: subscription charge, fixed payment, MP import. Claim attempts by a second owner type MUST be rejected.
- S: GIVEN imported expense WHEN user links it to a fixed payment already claimed by the import THEN error; unclaimed link works. [pgTAP]
### R3.3 Edit detection
Edits to an imported transaction MUST be detectable to drive R2.5.
- S: GIVEN imported expense WHEN note edited THEN edited marker set. [pgTAP]
