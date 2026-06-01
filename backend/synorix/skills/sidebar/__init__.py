"""Synorix skills — sidebar category (Bibliothèque / Entreprise / Références).

Importing this package self-registers every sidebar skill in registry.SKILLS
via the @register decorator.
"""

from synorix.skills.sidebar.extraction_memoire_importe import (  # noqa: F401
    ExtractionMemoireImporte,
)
