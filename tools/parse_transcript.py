"""
Technion Grades PDF Parser
==========================
Parses official Technion transcript PDFs (English version) to extract:
  - Student info (name, ID, degree, faculty, GPA, credits)
  - Course records (ID, name, credits, grade, semester)

Usage:
    from tools.parse_transcript import parse_transcript_pdf
    result = parse_transcript_pdf("grades_July25.pdf")

Course ID Conversion:
    The PDF uses 8-digit zero-padded IDs (e.g., "00440101").
    Internally, the Technion uses 6 or 7 digit IDs (e.g., "044101", "1040013").
    
    The 8-digit format is: "0" + faculty(3) + course(4)
    - For 0XX faculties (EE/CS): 6-digit ID = faculty(3) + course_last_3_digits
    - For other faculties (Math/Physics/etc.): 7-digit ID = faculty(3) + course(4)
"""

import re
from dataclasses import dataclass, field
from typing import List, Optional, Set, Tuple

import pdfplumber


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class CourseRecord:
    """A single course record extracted from the transcript."""
    course_id: str                  # Standard Technion format (e.g., "044101")
    raw_pdf_id: str                 # 8-digit PDF format (e.g., "00440101")
    name: str                       # Course name (may be empty if parsing failed)
    credits: Optional[float]        # Credit points (None for exemptions without points)
    grade: str                      # Numeric string, "Pass", "Exemption with points",
                                    # or "Exemption without points"
    semester: str                   # e.g., "2022-2023 Spring"

    @property
    def is_numeric_grade(self) -> bool:
        return self.grade.isdigit()

    @property
    def numeric_grade(self) -> Optional[int]:
        return int(self.grade) if self.is_numeric_grade else None

    @property
    def is_pass(self) -> bool:
        return self.grade == "Pass"

    @property
    def is_exemption(self) -> bool:
        return "Exemption" in self.grade


@dataclass
class TranscriptData:
    """Full parsed transcript data."""
    student_name: str = ""
    student_id: str = ""
    degree: str = ""
    faculty: str = ""
    accumulated_credits: float = 0.0
    required_credits: float = 0.0
    gpa: float = 0.0
    courses: List[CourseRecord] = field(default_factory=list)

    def get_passed_course_ids(self) -> Set[str]:
        """Get set of all course IDs (standard format) from the transcript."""
        return {c.course_id for c in self.courses}

    def to_student_profile_dict(self) -> dict:
        """
        Convert to the JSON format used by dummy_student_profile_gal.json.
        All courses go into passed_course_ids; waived_course_ids is left empty
        (exemptions are still listed as passed for requirement checking).
        """
        return {
            "passed_course_ids": sorted(self.get_passed_course_ids()),
            "waived_course_ids": [],
        }


# ---------------------------------------------------------------------------
# Course ID conversion
# ---------------------------------------------------------------------------

def convert_pdf_course_id(pdf_id: str) -> str:
    """
    Convert 8-digit PDF course ID to standard Technion format.

    The PDF format is: "0" + faculty(3) + course(4)
      - 0XX faculties → 6-digit ID:  faculty(3) + course[1:]   (e.g., 044 + 101 = "044101")
      - Other faculties → 7-digit ID: faculty(3) + course(4)   (e.g., 104 + 0013 = "1040013")
    """
    if len(pdf_id) != 8 or not pdf_id.isdigit():
        return pdf_id  # Return as-is if not standard 8-digit format

    faculty = pdf_id[1:4]   # 3-digit faculty code
    course = pdf_id[4:8]    # 4-digit course number

    if faculty[0] == "0":
        # EE-type faculties (044, 045, 046, etc.): 6-digit format
        return faculty + course[1:]
    else:
        # Math/Physics/CS/General faculties: 7-digit format
        return faculty + course


# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

_SEMESTER = r'(\d{4}-\d{4}\s+(?:Winter|Spring|Summer))'

# Course-line patterns, ordered from most specific to least.
# Each pattern captures groups in a known order; the _parse_match() helper
# interprets them based on which pattern matched.
_PATTERNS: List[Tuple[str, re.Pattern]] = [
    # === No-name patterns (multi-line courses) — must come FIRST ===
    # ID  credits  grade  semester   (no name on the line)
    ("numeric_no_name", re.compile(
        r'^(\d{8})\s+(\d+(?:\.\d+)?)\s+(\d+)\s+' + _SEMESTER + r'\s*$'
    )),
    # ID  credits  Pass  semester
    ("pass_credits_no_name", re.compile(
        r'^(\d{8})\s+(\d+(?:\.\d+)?)\s+Pass\s+' + _SEMESTER + r'\s*$'
    )),
    # ID  Pass  semester   (no credits, no name)
    ("pass_no_name_no_credits", re.compile(
        r'^(\d{8})\s+Pass\s+' + _SEMESTER + r'\s*$'
    )),
    # ID  Exemption without points  semester   (no name, no credits)
    ("exempt_without_no_name", re.compile(
        r'^(\d{8})\s+Exemption without points\s+' + _SEMESTER + r'\s*$'
    )),

    # === With-name patterns (single-line courses) ===
    # 1. Numeric grade  — ID  name  credits  grade  semester
    ("numeric", re.compile(
        r'^(\d{8})\s+(.*?)\s+(\d+(?:\.\d+)?)\s+(\d+)\s+' + _SEMESTER + r'\s*$'
    )),
    # 2. Pass WITH credits  — ID  name  credits  Pass  semester
    ("pass_credits", re.compile(
        r'^(\d{8})\s+(.*?)\s+(\d+(?:\.\d+)?)\s+Pass\s+' + _SEMESTER + r'\s*$'
    )),
    # 3. Exemption WITH points  — ID  name  credits  Exemption with points  semester
    ("exempt_with", re.compile(
        r'^(\d{8})\s+(.*?)\s+(\d+(?:\.\d+)?)\s+Exemption with points\s+' + _SEMESTER + r'\s*$'
    )),
    # 4. Pass WITHOUT credits  — ID  name  Pass  semester
    ("pass_no_credits", re.compile(
        r'^(\d{8})\s+(.*?)\s*Pass\s+' + _SEMESTER + r'\s*$'
    )),
    # 5. Exemption WITHOUT points  — ID  name  Exemption without points  semester
    ("exempt_without", re.compile(
        r'^(\d{8})\s+(.*?)\s*Exemption without points\s+' + _SEMESTER + r'\s*$'
    )),
]


# Header patterns
_HEADER_RE = re.compile(r'Transcript of (.+?)\s+ID:\s*(\d+)')
_DEGREE_RE = re.compile(r'for the degree\s+(.+)', re.IGNORECASE)
_FACULTY_RE = re.compile(r'in the faculty of\s+(.+)', re.IGNORECASE)
_CREDITS_GPA_RE = re.compile(
    r'accumulated\s+(\d+(?:\.\d+)?)\s+credit points\s+out of\s+'
    r'(\d+(?:\.\d+)?)\s+credit points.*?GPA of\s+(\d+(?:\.\d+)?)',
    re.IGNORECASE,
)

# Lines that are metadata / boilerplate (not course data)
_META_PREFIXES = (
    "Transcript of",
    "who studies",
    "for the degree",
    "in the faculty",
    "and accumulated",
    "SUBJECT",
    "Grade Scale",
    "Minimal Passing",
    "END OF TRANSCRIPT",
    "I hereby confirm",
    "Academic Secretary",
    "Dr.",
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_metadata(line: str) -> bool:
    s = line.strip()
    return not s or any(s.startswith(p) for p in _META_PREFIXES)


def _is_course_id_line(line: str) -> bool:
    """True if the line starts with an 8-digit course ID."""
    return bool(re.match(r'^\d{8}\s', line.strip()))


def _parse_course_line(line: str) -> Optional[dict]:
    """
    Try each regex pattern against *line*. Return a dict with keys
    raw_id, name, credits (float|None), grade (str), semester (str),
    or None if no pattern matches.
    """
    for tag, pat in _PATTERNS:
        m = pat.match(line.strip())
        if not m:
            continue
        g = m.groups()
        raw_id = g[0]

        # --- No-name patterns (multi-line courses) ---
        if tag == "numeric_no_name":
            return dict(raw_id=raw_id, name="", credits=float(g[1]),
                        grade=g[2], semester=g[3].strip())
        if tag == "pass_credits_no_name":
            return dict(raw_id=raw_id, name="", credits=float(g[1]),
                        grade="Pass", semester=g[2].strip())
        if tag == "pass_no_name_no_credits":
            return dict(raw_id=raw_id, name="", credits=None,
                        grade="Pass", semester=g[1].strip())
        if tag == "exempt_without_no_name":
            return dict(raw_id=raw_id, name="", credits=None,
                        grade="Exemption without points", semester=g[1].strip())

        # --- With-name patterns (single-line courses) ---
        if tag == "numeric":
            return dict(raw_id=raw_id, name=g[1].strip(), credits=float(g[2]),
                        grade=g[3], semester=g[4].strip())
        if tag == "pass_credits":
            return dict(raw_id=raw_id, name=g[1].strip(), credits=float(g[2]),
                        grade="Pass", semester=g[3].strip())
        if tag == "exempt_with":
            return dict(raw_id=raw_id, name=g[1].strip(), credits=float(g[2]),
                        grade="Exemption with points", semester=g[3].strip())
        if tag == "pass_no_credits":
            return dict(raw_id=raw_id, name=g[1].strip(), credits=None,
                        grade="Pass", semester=g[2].strip())
        if tag == "exempt_without":
            return dict(raw_id=raw_id, name=g[1].strip(), credits=None,
                        grade="Exemption without points", semester=g[2].strip())
    return None


def _parse_header(lines: List[str]) -> dict:
    """Extract student info from the first few lines of the transcript."""
    info: dict = {}
    for line in lines:
        m = _HEADER_RE.search(line)
        if m:
            info["student_name"] = m.group(1).strip()
            info["student_id"] = m.group(2).strip()
        m = _DEGREE_RE.search(line)
        if m:
            info["degree"] = m.group(1).strip()
        m = _FACULTY_RE.search(line)
        if m:
            info["faculty"] = m.group(1).strip()
        m = _CREDITS_GPA_RE.search(line)
        if m:
            info["accumulated_credits"] = float(m.group(1))
            info["required_credits"] = float(m.group(2))
            info["gpa"] = float(m.group(3))
    return info


# ---------------------------------------------------------------------------
# Main parser
# ---------------------------------------------------------------------------

def parse_transcript_pdf(pdf_path: str) -> TranscriptData:
    """
    Parse a Technion transcript PDF and return structured data.

    Handles:
      - Single-line course records (name on the same line as the ID)
      - Multi-line course records (name wrapped across the line before
        and/or after the ID line)
      - Numeric grades, Pass, Exemption with/without points
      - Multiple pages, repeated headers/footers
    """
    with pdfplumber.open(pdf_path) as pdf:
        all_lines: List[str] = []
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                all_lines.extend(text.split("\n"))

    # --- Parse header (first page, first ~10 lines) ---
    header = _parse_header(all_lines[:10])

    # --- Parse courses ---
    courses: List[CourseRecord] = []
    pending_prefix: List[str] = []  # Accumulates name-prefix lines
    i = 0
    n = len(all_lines)

    while i < n:
        line = all_lines[i].strip()

        # Skip metadata / blank lines and reset the prefix buffer
        if _is_metadata(line):
            pending_prefix = []
            i += 1
            continue

        # --- Course ID line ---
        if _is_course_id_line(line):
            parsed = _parse_course_line(line)
            if parsed is None:
                # Line starts with 8 digits but didn't match any pattern
                pending_prefix = []
                i += 1
                continue

            if parsed["name"]:
                # Single-line record — name already extracted
                pending_prefix = []
            else:
                # Multi-line record — assemble name from prefix + suffix
                name_parts = list(pending_prefix)
                pending_prefix = []

                # Collect suffix line(s): typically exactly 1 line
                j = i + 1
                while j < n:
                    nxt = all_lines[j].strip()
                    if _is_course_id_line(nxt) or _is_metadata(nxt) or not nxt:
                        break
                    name_parts.append(nxt)
                    j += 1
                    # In observed transcripts, multi-line names have exactly
                    # 1 suffix line.  Taking only 1 avoids stealing the next
                    # course's prefix when two multi-line courses are adjacent.
                    break

                parsed["name"] = " ".join(name_parts)
                i = j  # skip past the suffix line(s)
                # Build CourseRecord and continue (don't increment i again)
                course_id = convert_pdf_course_id(parsed["raw_id"])
                courses.append(CourseRecord(
                    course_id=course_id,
                    raw_pdf_id=parsed["raw_id"],
                    name=parsed["name"],
                    credits=parsed["credits"],
                    grade=str(parsed["grade"]),
                    semester=parsed["semester"],
                ))
                continue  # i already advanced past suffix

            # Build CourseRecord for single-line case
            course_id = convert_pdf_course_id(parsed["raw_id"])
            courses.append(CourseRecord(
                course_id=course_id,
                raw_pdf_id=parsed["raw_id"],
                name=parsed["name"],
                credits=parsed["credits"],
                grade=str(parsed["grade"]),
                semester=parsed["semester"],
            ))
            i += 1
            continue

        # --- Non-ID, non-metadata line → potential name prefix ---
        pending_prefix.append(line)
        i += 1

    return TranscriptData(
        student_name=header.get("student_name", ""),
        student_id=header.get("student_id", ""),
        degree=header.get("degree", ""),
        faculty=header.get("faculty", ""),
        accumulated_credits=header.get("accumulated_credits", 0.0),
        required_credits=header.get("required_credits", 0.0),
        gpa=header.get("gpa", 0.0),
        courses=courses,
    )


# ---------------------------------------------------------------------------
# CLI — quick test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json
    import sys

    path = sys.argv[1] if len(sys.argv) > 1 else "grades_July25.pdf"
    data = parse_transcript_pdf(path)

    print(f"Student : {data.student_name}  (ID: {data.student_id})")
    print(f"Degree  : {data.degree}")
    print(f"Faculty : {data.faculty}")
    print(f"Credits : {data.accumulated_credits} / {data.required_credits}")
    print(f"GPA     : {data.gpa}")
    print(f"Courses : {len(data.courses)}")
    print("-" * 90)
    print(f"{'ID':<10} {'Credits':>7}  {'Grade':<28} {'Semester':<20} {'Name'}")
    print("-" * 90)
    for c in data.courses:
        cr = f"{c.credits}" if c.credits is not None else "-"
        print(f"{c.course_id:<10} {cr:>7}  {c.grade:<28} {c.semester:<20} {c.name}")

    print("\n--- Student Profile JSON ---")
    print(json.dumps(data.to_student_profile_dict(), indent=2))
