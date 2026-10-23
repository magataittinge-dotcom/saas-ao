"""Chronomètre le parcours complet d'un AO sur un vrai DCE, étape par étape.

    dépôt → extraction → lots → analyse → mémoire

Le parcours passe par les VRAIES routes de l'application (TestClient, dans ce
processus) et ses vrais travaux de fond (threads) ; seule l'authentification
Clerk est court-circuitée pour un compte local (dépendance get_auth_user
remplacée). Base de données : celle de backend/.env (base de développement).
Chaque étape lente est profilée avec pyinstrument DANS son thread de fond.

Les étapes analyse et mémoire appellent l'API Claude (payant) : elles ne
partent qu'avec --payant, et chaque passage payant est compté dans
--compteur (refus au-delà de --max-payants). Sans --payant, la clé API est
neutralisée : aucun appel facturable possible.

Usage (depuis backend/) :
    venv/bin/python scripts/mesure_parcours.py --dce <dossier ou .zip> \\
        --compte maga.taittinge@gmail.com --lot lot5 --sortie <dossier> [--payant]

Sorties dans --sortie : mesure.json (durées et détails), profil-<étape>.txt et
.html (pyinstrument), journal de l'application sur la sortie standard.
"""
from __future__ import annotations

import argparse
import json
import os
import resource
import sys
import time
import zipfile
from datetime import datetime
from pathlib import Path

ICI = Path(__file__).resolve().parent
BACKEND = ICI.parent
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

ETAPES = ["depot", "extraction", "lots", "analyse", "memoire"]
PAYANTES = {"analyse", "memoire"}


def lire_arguments() -> argparse.Namespace:
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("--dce", required=True, help="dossier du DCE (fichiers à zipper) ou archive .zip")
    a.add_argument("--compte", required=True, help="e-mail du compte local (table users)")
    a.add_argument("--lot", default="lot5", help="identifiant du lot à analyser (ex. lot5)")
    a.add_argument("--jusqua", choices=ETAPES, default="memoire", help="dernière étape à mesurer")
    a.add_argument("--payant", action="store_true", help="autorise analyse et mémoire (API Claude)")
    a.add_argument("--compteur", default=None, help="fichier JSON qui compte les passages payants")
    a.add_argument("--max-payants", type=int, default=3)
    a.add_argument("--sortie", required=True, help="dossier des résultats")
    a.add_argument("--nom", default=None, help="nom du projet créé")
    a.add_argument("--sans-profil", action="store_true", help="chronométrer sans pyinstrument")
    a.add_argument("--nb-ouvriers", type=int, default=4)
    a.add_argument("--delai", default="13 mois, période de préparation comprise")
    a.add_argument("--garder-en-cours", action="store_true",
                   help="ne pas classer l'AO mesuré « sans suite » à la fin (il resterait au tableau de bord)")
    return a.parse_args()


def preparer_zip(dce: Path, sortie: Path) -> Path:
    """Archive du DCE avec les noms d'origine (préfixe uuid de stockage retiré)."""
    if dce.suffix.lower() == ".zip":
        return dce
    cible = sortie / "dce.zip"
    if cible.exists():
        return cible
    with zipfile.ZipFile(cible, "w", compression=zipfile.ZIP_STORED) as z:
        for f in sorted(dce.iterdir()):
            if f.is_file():
                nom = f.name[37:] if len(f.name) > 37 and f.name[8] == "-" and f.name[36] == "-" else f.name
                z.write(f, arcname=nom)
    return cible


def compter_passage_payant(compteur: Path, maximum: int, nom: str) -> int:
    passages = json.loads(compteur.read_text(encoding="utf-8")) if compteur.exists() else []
    if len(passages) >= maximum:
        sys.exit(f"Refus : {len(passages)} passages payants déjà faits (maximum {maximum}).")
    passages.append({"nom": nom, "debut": datetime.now().isoformat(timespec="seconds")})
    compteur.write_text(json.dumps(passages, ensure_ascii=False, indent=1), encoding="utf-8")
    return len(passages)


def main() -> None:
    args = lire_arguments()
    sortie = Path(args.sortie).resolve()
    sortie.mkdir(parents=True, exist_ok=True)
    etapes = ETAPES[: ETAPES.index(args.jusqua) + 1]
    payant = bool(PAYANTES & set(etapes))
    if payant and not args.payant:
        sys.exit("Les étapes analyse et mémoire appellent l'API Claude : ajoutez --payant (ou --jusqua lots).")

    # Variables d'environnement AVANT tout import de l'application.
    from dotenv import load_dotenv
    load_dotenv(BACKEND / ".env")
    if not payant:
        os.environ["ANTHROPIC_API_KEY"] = "sk-ant-neutralisee-par-mesure-parcours"

    nom = args.nom or f"[Mesure {datetime.now():%d/%m %H:%M}] Gueux"
    rang_payant = None
    if payant:
        if not args.compteur:
            sys.exit("--compteur est obligatoire avec --payant.")
        rang_payant = compter_passage_payant(Path(args.compteur), args.max_payants, nom)
        print(f"[mesure] passage payant n° {rang_payant}/{args.max_payants}", flush=True)

    archive = preparer_zip(Path(args.dce), sortie)

    from pyinstrument import Profiler
    from fastapi.testclient import TestClient
    from database import SessionLocal
    from models.user import User
    import main as appli
    import routers.projects as r_projects
    import routers.analysis as r_analysis
    import routers.memoire as r_memoire
    from routers.auth import get_auth_user

    db = SessionLocal()
    utilisateur = db.query(User).filter(User.email == args.compte).first()
    if not utilisateur:
        sys.exit(f"Compte introuvable : {args.compte}")
    db.refresh(utilisateur)
    db.expunge(utilisateur)
    db.close()
    appli.app.dependency_overrides[get_auth_user] = lambda: utilisateur

    # ── Profils pyinstrument, chacun dans le thread qui fait le travail ──────
    profils: dict[str, float] = {}

    def sauver(p: "Profiler", etiquette: str) -> None:
        (sortie / f"profil-{etiquette}.txt").write_text(
            p.output_text(unicode=True, color=False), encoding="utf-8")
        (sortie / f"profil-{etiquette}.html").write_text(p.output_html(), encoding="utf-8")
        profils[etiquette] = round(p.last_session.duration, 2) if p.last_session else 0.0

    def envelopper(module, nom_fn: str, etiquette: str) -> None:
        if args.sans_profil:
            return
        original = getattr(module, nom_fn)

        def enveloppe(*a, **k):
            p = Profiler(interval=0.005)
            p.start()
            try:
                return original(*a, **k)
            finally:
                p.stop()
                sauver(p, etiquette)
        setattr(module, nom_fn, enveloppe)

    def envelopper_async(module, nom_fn: str, etiquette: str) -> None:
        if args.sans_profil:
            return
        original = getattr(module, nom_fn)

        async def enveloppe(*a, **k):
            p = Profiler(interval=0.005, async_mode="disabled")
            p.start()
            try:
                return await original(*a, **k)
            finally:
                p.stop()
                sauver(p, etiquette)
        setattr(module, nom_fn, enveloppe)

    envelopper_async(r_projects, "_handle_zip_upload", "depot")
    envelopper(r_projects, "_extract_all_parallel", "extraction")
    envelopper(r_projects, "_run_lot_detection_background", "lots")
    envelopper(r_analysis, "_run_analysis_job", "analyse")
    envelopper(r_memoire, "_run_memoire_job", "memoire")

    mesures: dict = {"nom": nom, "debut": datetime.now().isoformat(timespec="seconds"),
                     "dce": str(archive), "taille_mo": round(archive.stat().st_size / 1e6, 1),
                     "lot": args.lot, "passage_payant": rang_payant, "etapes": {}}

    def rss_mo() -> float:
        return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)

    client = TestClient(appli.app)

    def projet(pid: str) -> dict:
        r = client.get(f"/api/projects/{pid}")
        r.raise_for_status()
        return r.json()

    def attendre(pid: str, fini, delai: float, pas: float) -> dict:
        fin = time.monotonic() + delai
        while time.monotonic() < fin:
            p = projet(pid)
            if fini(p):
                return p
            time.sleep(pas)
        raise TimeoutError(f"étape non terminée après {delai:.0f} s")

    def noter(etape: str, t0: float, **details) -> None:
        mesures["etapes"][etape] = {"secondes": round(time.monotonic() - t0, 2), "rss_max_mo": rss_mo(), **details}
        print(f"[mesure] {etape} : {mesures['etapes'][etape]['secondes']} s {details}", flush=True)
        (sortie / "mesure.json").write_text(json.dumps(mesures, ensure_ascii=False, indent=1), encoding="utf-8")

    try:
        # 1. Dépôt : création de l'AO + envoi de l'archive (extraction du ZIP comprise)
        t0 = time.monotonic()
        r = client.post("/api/projects", json={"name": nom})
        r.raise_for_status()
        pid = r.json()["id"]
        mesures["project_id"] = pid
        with archive.open("rb") as f:
            r = client.post(f"/api/projects/{pid}/documents",
                            files={"file": (archive.name, f, "application/zip")}, data={"type": "autre"})
        r.raise_for_status()
        noter("depot", t0, documents=r.json().get("extracted_count"))

        # 2. Extraction du texte (thread de fond) jusqu'à « ready »
        t0 = time.monotonic()
        p = attendre(pid, lambda p: p.get("processing_status") in ("ready", "error"), 3600, 0.5)
        noter("extraction", t0, statut=p.get("processing_status"))
        if "lots" not in etapes:
            return

        # 3. Détection des lots (thread de fond), puis choix du lot
        t0 = time.monotonic()
        r = client.get(f"/api/projects/{pid}/lots")
        r.raise_for_status()
        if not r.json().get("lots"):
            attendre(pid, lambda p: p.get("processing_status") != "detecting_lots", 1800, 0.5)
            r = client.get(f"/api/projects/{pid}/lots")
            r.raise_for_status()
        lots = r.json().get("lots") or []
        choisi = next((l for l in lots if l.get("id") == args.lot), None)
        if not choisi:
            raise RuntimeError(f"lot {args.lot} introuvable parmi {[l.get('id') for l in lots]}")
        client.post(f"/api/projects/{pid}/lots/select",
                    json={"lot_id": choisi["id"], "lot_name": choisi.get("user_label") or choisi.get("nom")}).raise_for_status()
        noter("lots", t0, nb_lots=len(lots), lot=choisi.get("nom"))
        if "analyse" not in etapes:
            return

        # 4. Analyse IA (thread de fond) — payant
        t0 = time.monotonic()
        r = client.post(f"/api/projects/{pid}/analyze", json={"lots": [args.lot]})
        r.raise_for_status()
        reponse_post = round(time.monotonic() - t0, 2)   # temps passé DANS la requête HTTP
        p = attendre(pid, lambda p: p.get("processing_status") in ("ready", "error"), 3600, 2.0)
        exigences = client.get(f"/api/projects/{pid}/compliance").json() if p.get("processing_status") == "ready" else []
        noter("analyse", t0, statut=p.get("status"), traitement=p.get("processing_status"),
              exigences=len(exigences) if isinstance(exigences, list) else None, reponse_post_s=reponse_post)
        if "memoire" not in etapes or p.get("processing_status") != "ready":
            return

        # 5. Mémoire (thread de fond) — payant
        t0 = time.monotonic()
        r = client.post(f"/api/projects/{pid}/memoire/generate",
                        json={"nb_ouvriers": args.nb_ouvriers, "delai": args.delai})
        r.raise_for_status()
        reponse_post = round(time.monotonic() - t0, 2)   # temps passé DANS la requête HTTP
        p = attendre(pid, lambda p: p.get("processing_status") in ("ready", "error"), 3600, 2.0)
        details: dict = {"traitement": p.get("processing_status"), "reponse_post_s": reponse_post}
        m = client.get(f"/api/projects/{pid}/memoire")
        if m.status_code == 200:
            contenu = m.json().get("content_json") or {}
            meta = contenu.get("_generation_meta") or {}
            textes = [v for k, v in contenu.items() if k != "_generation_meta" and isinstance(v, str)]
            for k, v in contenu.items():
                if isinstance(v, dict) and k != "_generation_meta":
                    textes.extend(str(x) for x in v.values())
            details.update({
                "mots": sum(len(t.split()) for t in textes),
                "sections_a_regenerer": len(meta.get("warnings") or []),
                "segments": [{k: s.get(k) for k in ("segment", "elapsed_s", "output_tokens", "cache_read", "cache_write", "input_tokens", "stop_reason")}
                             for s in meta.get("segments") or []],
            })
        noter("memoire", t0, **details)
    finally:
        # L'AO de mesure quitte le tableau de bord du compte (réversible : « Annuler »/rouvrir).
        if mesures.get("project_id") and not args.garder_en_cours:
            try:
                client.patch(f"/api/projects/{mesures['project_id']}", json={"status": "sans_suite"})
                mesures["classe_sans_suite"] = True
            except Exception as e:  # noqa: BLE001 — la mesure prime
                mesures["classe_sans_suite"] = f"échec : {e}"
        mesures["fin"] = datetime.now().isoformat(timespec="seconds")
        mesures["profils_s"] = profils
        (sortie / "mesure.json").write_text(json.dumps(mesures, ensure_ascii=False, indent=1), encoding="utf-8")
        print(json.dumps(mesures, ensure_ascii=False, indent=1), flush=True)


if __name__ == "__main__":
    main()
