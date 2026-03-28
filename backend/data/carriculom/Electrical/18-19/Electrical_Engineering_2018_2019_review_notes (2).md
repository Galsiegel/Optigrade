# Review Notes — Electrical Engineering 2018/2019 draft

## Resolved from user confirmation

### Specialty 4 (Microelectronics and Nanoelectronics)
- The source block is shifted badly enough that row text cannot be trusted consistently.
- Per user instruction, this group now uses the **course numbers as the deterministic source**, in this exact order:
  - `046225`, `044231`, `046237`, `046052`, `046129`, `046241`, `124408`, `044239`, `046012`, `046232`, `046235`, `046239`, `046242`, `046265`, `046773`, `046851`, `046968`
- Names/credits were kept only where they could already be attached safely by code.

### Specialty 13 (Quantum Technologies)
- User provided a clean reconstruction of the group.
- The rule is now treated as:
  - 3 courses required
  - compulsory `046243`
  - plus one of `236990`, `116031`
- The course list now contains exactly:
  - `046243`, `236990`, `116031`, `046241`, `046052`, `046232`, `116037`
- The previous ambiguity note about a missing lab line was removed.

## Still worth reviewing

- The header says `Mandatory courses = 109` credits.
- The parsed mandatory table still sums to **107** credits.
- So either:
  - one or more mandatory rows are missing from `mandatory`, or
  - 2 credits are counted elsewhere.

### 2) Specialty 1 (Computer Networks)
- This block is also shifted in the source, but the user provided a clearer reconstruction.
- It is currently encoded with:
  - mandatory `044334`
  - choice group `046194 / 236330 / 104193`
  - choice group `234123 / 046209`
- This is probably right for the draft, but one last check against the original spreadsheet would still be good.

### 3) Specialty 5 rule text in English is noisy
- The English side of the source has visible copy/paste leftovers in the rule lines for the single/double requirement.
- The Hebrew side is much cleaner, so the rule logic in the draft was reconstructed from the Hebrew wording.

### 4) Specialty 7 (Biological Signals and Systems)
- This block contains duplicate/shifted code formatting like `46326    046326`, `46332    046332`, `44191    044191`.
- `134058*` appears with no English name in the TSV.
- The line `paired course: 125001 or 124114` is kept as a note/paired-course requirement, but the exact semantics should be confirmed.

### 5) Specialty 8 has `#N/A` placeholder lines
- The TSV includes `#N/A` in the OR lines around optimization.
- The logical meaning still seems clear, but the source is messy.

### 6) Specialty 10 (Honors Students)
- Only one concrete course code appears: `044180`.
- The remaining 3 courses are advisor-determined, so this track cannot be fully enumerated from the file alone.

### 7) Specialty 12 includes non-curricular explanatory text
- After the rule lines, the source adds text about registration in the Engineers Registry.
- This is kept as a note only, not as a formal requirement object.

### 8) Credits for non-EE/external courses
Some specialty courses are not present in the EE elective catalogue JSON (`18-19.json`), for example:
- `104193`, `236330`, `236501`, `236990`, `336522`, `116031`, `116037`, `234123`
- For these, `credits` are still `null` unless another source is supplied.

## Resolved notes
- Mandatory credits confirmed as **107**, not 109. The extra 2 points are **physical education** and should not be treated as part of the mandatory-course table.
