"""Synorix skills — modular, NotebookLM-grounded skill catalogue.

9 pipeline-aware categories: upload, lots, extraction, expert_metier,
memoire, verification, export, sidebar, chatbot.

Skills self-register in `registry.SKILLS` via the `@register` decorator at
import time. Import the category packages to populate the registry.
"""
