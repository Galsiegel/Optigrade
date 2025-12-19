"""
Degree is a subclass of faculty.
It is the actual degree program (maslol).
It will have a must dict (or hash) containing mandatory requirements.
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict, TYPE_CHECKING
from .programs import Program_bucket

if TYPE_CHECKING:
    from .faculty import Faculty




@dataclass
class Degree:
    """
    Represents a degree program within a faculty.
    
    Attributes:
        name: Name of the degree
        id: Optional unique identifier for the degree
        faculty: The faculty this degree belongs to
        must: Dictionary/hash of mandatory program requirements
        possible_specialties: List of possible specialty programs available
        core: Optional core program instance
        level: Optional degree level (BSc, MSc, etc.)
    """
    name: str
    faculty: 'Faculty'
    must: Program_bucket  # Required - mandatory program bucket
    possible_specialties: List[Program_bucket] = field(default_factory=list)  # Required, defaults to empty list
    core: Optional[Program_bucket] = None
    id: Optional[str] = None
    #level: Optional[str] = None  # BSc, MSc, etc.
    
    def get_mandatory_bucket(self) -> Program_bucket:
        """
        Get the mandatory (must) bucket.
        
        Returns:
            The mandatory program bucket
        """
        return self.must
    
    def get_specialties_bucket(self) -> List[Program_bucket]:
        """
        Get list of specialty buckets.
        
        Returns:
            List of specialty program buckets
        """
        return self.possible_specialties.copy()  # Return a copy to avoid external modification
    
    def get_core_bucket(self) -> Optional[Program_bucket]:
        """
        Get the core bucket if it exists.
        
        Returns:
            The core program bucket, or None if not set
        """
        return self.core
    
    def get_buckets(self) -> List[Program_bucket]:
        """
        Get all buckets for this degree (must, core if exists, and specialties).
        
        Returns:
            List of all program buckets
        """
        buckets = [self.must]
        if self.core is not None:
            buckets.append(self.core)
        buckets.extend(self.possible_specialties)
        return buckets