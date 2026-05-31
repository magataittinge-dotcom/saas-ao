# Raw NotebookLM extract — Skill #19 `enrichissement-source-document`

**Captured:** 2026-05-31 — aucune requête NotebookLM (skill technique).

## Nature
Skill technique : mapping offset→page imprimée d'un PDF DCE. En production via PyMuPDF (`page.get_text("dict")`). L'assistant valide/normalise la citation, ne fabrique jamais de page (not_found si indéterminable). notebook_sources=[].
