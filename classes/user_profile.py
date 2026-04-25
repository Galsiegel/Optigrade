"""
UserProfile class definition.
This class holds a user experience, and should be both the bridge between frontend and backend,
and hold all relevand data for the optimization
"""

from dataclasses import dataclass
from typing import Optional

from classes.degree import Points
from classes.student import StudentProfile


@dataclass
class UserProfile:
    
    self.student = StudentProfile
    self.degree = self.student.degree_name





def _load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


_DEGREE_RAW = _load_json(DEGREE_JSON_PATH)
_FACULTY_ELECTIVES_RAW = _load_json(FACULTY_ELECTIVES_JSON_PATH)


DEGREE_GENERAL_RULES: Dict[str, float] = {
    "totalCredits": Points(_DEGREE_RAW["generalRules"]["totalCredits"]),
    "mandatoryCredits": Points(_DEGREE_RAW["generalRules"]["mandatoryCredits"]),
    "electiveInPathMin": Points(_DEGREE_RAW["generalRules"]["electiveInPathMin"]), # The number isnt interesting, only metadata
    "electiveInPathMax": Points(_DEGREE_RAW["generalRules"]["electiveInPathMax"]),
    "freeElective": float(_DEGREE_RAW["generalRules"]["freeElective"]), # Faculty choice 
    "enrichment": Points(_DEGREE_RAW["generalRules"]["enrichment"]),  # Painting, spanish, etc..
    "physicalEducation": Points(_DEGREE_RAW["generalRules"]["physicalEducation"]),
    "mustChooseCoreGroups": Course(_DEGREE_RAW["generalRules"]["mustChooseCoreGroups"]),
    "mustTakeSpecialities": Course(_DEGREE_RAW["generalRules"]["mustTakeSpecialities"]),
}