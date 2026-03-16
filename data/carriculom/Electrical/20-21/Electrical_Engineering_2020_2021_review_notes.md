# Electrical Engineering 2020/2021 review notes

- Mandatory table sums to **107.0** credits, matching the header mandatory requirement of **107**.
- The specialties file is much cleaner than 2018/2019, but it still includes inline editorial notes and a few non-course rows that were ignored.
- **Specialty 4** includes an explicit `OR` row between **046241** and **124408**. I modeled that as a `chooseOneOfGroups` option, but this may still need confirmation.
- **Specialty 6** has ambiguous wording for the single-version requirement: “046209 and 046267 or 046002”. I modeled it as **046209 + one of {046267, 046002}**.
- **Specialty 10** only lists **044180** explicitly; the remaining three courses are advisor-determined, so they appear only in the rules text.
- **Specialty 13** contains “Quantum Technologies Lab” with **no deterministic course code** in the source. I preserved it as a placeholder entry with `code: null`.
- Several courses are outside the EE 20-21 catalog file (for example some `104xxx`, `114xxx`, `236xxx`, `336xxx`, `086xxx`, `124xxx`, `134xxx`, `034xxx` codes). For those, catalog metadata could not be filled from `20-21.json`, so the draft keeps parsed names/credits where possible and leaves lecture/tutorial/lab/project as zeros.
- The source includes one inline editor note near Specialty 4 (“לתקן בשאר ההתמחויות...”). It was ignored and not represented as curriculum data.
