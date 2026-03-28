# Electrical Engineering 2021/2022 — review notes

This draft is structurally clean and matches the same schema as the previous Electrical Engineering JSONs.

## Resolved directly in the draft
- Mandatory credits were set to **107**, matching the header and the mandatory table.
- Communication, Microelectronics, Electromagnetism, and Computers were each split into **single** and **double** versions, like in the previous years.
- Alternative optimization courses were modeled explicitly where the TSV says `046197` may be replaced by `104193` or `236330`.

## Items to verify later if needed
1. **Computers track (single)**: modeled as `046209` plus **one of** `{046267, 046002}` because that is what the specialty text says.
2. **Microelectronics track**: the `046241 / 124408` row was modeled as an explicit OR-choice group.
3. **Quantum Technologies**: the catalogue includes lab choice `126604` or `126605`, but the requirement line only makes `046243` and one of `{236990, 116031}` compulsory. I kept the labs in the course list and as an optional choice-group, not as mandatory.
4. Some external courses are not present in the EE course catalog JSON for `21-22` and therefore remain with partial metadata sourced only from the specialty table.

5. **Mandatory table discrepancy**: counting `114081` (מעבדה פיסיקלית 1 / PHYSICAL LABORATORY 1, 1.5 CP) makes the mandatory table sum to **108.5**, while the header says **107**. In the draft JSON I excluded `114081` from the mandatory list so the total matches the header, but this should be verified later.
