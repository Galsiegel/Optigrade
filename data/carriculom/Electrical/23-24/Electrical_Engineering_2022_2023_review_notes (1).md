# Electrical Engineering 2022/2023 review notes

## Overall
- Draft generated from `header`, `mandatory`, and `specialties`.
- General rules parsed as: total 159.5, mandatory 107.5, path elective 40, free elective 4, enrichment 6, physical education 2.
- Mandatory-course table sums to 107.5 CP, matching the header.

## Items to review later
1. **Specialty 4 – Microelectronics and Nanoelectronics** contains an explicit `OR` between **046241** and **124408**. The draft keeps both courses in the course list and keeps the rule text, but the structured requirement is not fully modeled as a strict alternative.
2. **Specialty 6 – Computers** has single/double wording that is still a little awkward in the source. The draft keeps the text and infers the main mandatory codes, but the exact structured logic for single vs. double should be checked before declaring it final.
3. **Specialty 10 – Honors Students** is advisor-defined. Only **044180** is deterministic; the extra three advanced courses remain intentionally unspecified.
4. **Specialty 13 – Quantum Technologies** includes a lab choice **126604 / 126605** and an information-theory choice **236990 / 116031**. The draft keeps both alternatives and the text, but the structured requirement only captures the deterministic core cleanly.
5. **Biological Signals and Systems** mentions a paired chemistry requirement (**125001** or **124114**) in free text. It is preserved in the rules text and not forced into structured requirements.
6. Some non-EE / external catalogue courses are not present in `22-23.json`, so they remain with `null` names or zeroed metadata where necessary. Codes seen in that category include: 034035, 035001, 046001, 086755, 104193, 114210, 116029, 116031, 116037, 124408, 126604, 126605, 134058, 234125, 236309, 236330, 236350, 236370, 236990, 336208, 336522.
7. The specialties file includes both single and double versions as separate sections for tracks like Communication; this draft preserves them as separate specialties to stay consistent with prior years.
