"""Bloc 2, tranche 2 — l'ancrage compare toutes les pièces, avec un score par phrase.

Avant : la pièce désignée, puis les autres dans l'ordre de la base, et « la
première qui passe gagne », même au niveau « récupéré par termes ». Sur Gueux,
73 exigences du lot 05 étaient sourcées dans le CCTP d'un autre lot, que l'IA
n'avait pas reçu (G2).

Désormais :
- le texte exact (ou normalisé) gagne sur toute récupération, quelle que soit
  la pièce ;
- sinon, la meilleure phrase de toutes les pièces (score par phrase, termes
  pondérés par leur rareté) ;
- seules les pièces que l'IA a reçues pour la portée sont candidates, celles
  du lot avant les pièces communes.
Chaînes inventées.
"""
from models.project import Project, ProjectDocument
from services.ai.excerpt_anchor import anchor_requirements


def _req(extrait, piece="CCTP"):
    return {"exigence": "x", "source_document": piece, "source_page": None, "source_excerpt": extrait}


def test_le_texte_exact_gagne_sur_une_premiere_piece_approchante():
    pieces = {
        "CCTP lot 01.pdf": "Les menuiseries extérieures seront posées en applique sur la maçonnerie, calfeutrement compris.",
        "CCTP lot 05.pdf": "Préambule. Les menuiseries extérieures seront posées en tunnel, calfeutrement compris. Fin.",
    }
    reqs = [_req("Les menuiseries extérieures seront posées en tunnel, calfeutrement compris.")]
    anchor_requirements(reqs, pieces)
    assert reqs[0]["source_document"] == "CCTP lot 05.pdf"


def test_la_meilleure_phrase_de_toutes_les_pieces():
    pieces = {
        "CCTP lot 05.pdf": "Les panneaux isolants en polystyrène sont fixés par chevilles plastiques.",
        "CCTP lot 05 bis.pdf": "Les panneaux isolants en laine de roche sont fixés par chevilles métalliques.",
    }
    reqs = [_req("panneaux isolants en laine de roche fixés par chevilles")]
    anchor_requirements(reqs, pieces)
    assert reqs[0]["source_document"] == "CCTP lot 05 bis.pdf"
    assert "laine de roche" in reqs[0]["source_excerpt"]


def test_la_piece_du_lot_passe_avant_la_piece_commune():
    clause = "Les échantillons de parement seront soumis à l'architecte avant toute commande."
    pieces = {"Carnet commun.pdf": clause, "CCTP lot 05.pdf": "ARTICLE 4. " + clause}
    reqs = [_req(clause, piece="Carnet")]
    anchor_requirements(reqs, pieces, rangs={"CCTP lot 05.pdf": 0, "Carnet commun.pdf": 1})
    # la pièce désignée par l'IA (« Carnet ») reste prioritaire…
    assert reqs[0]["source_document"] == "Carnet commun.pdf"
    reqs = [_req(clause, piece="CCTP")]
    anchor_requirements(reqs, pieces, rangs={"CCTP lot 05.pdf": 0, "Carnet commun.pdf": 1})
    # …sinon, la pièce du lot passe avant la pièce commune
    assert reqs[0]["source_document"] == "CCTP lot 05.pdf"


def _projet(db, org_id, pid):
    db.add(Project(id=pid, organization_id=org_id, name="X"))
    for nom, typ, lots, texte in (
        ("rc.pdf", "rc", ["all"], "Règlement de la consultation. Les offres sont remises sur la plateforme. " * 3),
        ("cctp lot 02.pdf", "cctp", ["2"], "Étanchéité. Les relevés d'étanchéité auront une hauteur de 15 cm au-dessus de la protection. " * 3),
        ("cctp lot 05.pdf", "cctp", ["5"], "Façades. L'enduit sera appliqué en deux passes sur un support sain et sec. " * 3),
    ):
        db.add(ProjectDocument(project_id=pid, type=typ, file_url="x", file_name=nom,
                               related_lots=lots, extracted_text=texte))
    db.commit()


def test_exigence_d_un_lot_jamais_sourcee_dans_le_cctp_d_un_autre_lot(db_session, test_org):
    from routers.analysis import _anchor_requirements_safe
    _projet(db_session, test_org.id, "proj-ancrage-lots")
    reqs = [_req("Les relevés d'étanchéité auront une hauteur de 15 cm au-dessus de la protection."),
            _req("L'enduit sera appliqué en deux passes sur un support sain et sec.")]
    _anchor_requirements_safe(db_session, "proj-ancrage-lots", reqs, "lot5")
    assert reqs[0]["source_excerpt"] is None            # pas de source plutôt qu'une source du lot 02
    assert reqs[1]["source_document"] == "cctp lot 05.pdf"


def test_tronc_commun_source_dans_les_pieces_de_la_passe_1(db_session, test_org):
    from routers.analysis import _anchor_requirements_safe
    _projet(db_session, test_org.id, "proj-ancrage-commun")
    reqs = [_req("Les offres sont remises sur la plateforme.", piece="RC"),
            _req("L'enduit sera appliqué en deux passes sur un support sain et sec.", piece="RC")]
    _anchor_requirements_safe(db_session, "proj-ancrage-commun", reqs, "_commun")
    assert reqs[0]["source_document"] == "rc.pdf"
    assert reqs[1]["source_excerpt"] is None            # le CCTP n'est pas lu par la passe 1
