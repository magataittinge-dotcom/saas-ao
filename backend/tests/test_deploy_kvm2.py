"""Réglages de deploy/ pour le Hostinger KVM 2 (2 vCPU, 8 Go, 100 Go) : la somme des plafonds tient dans 8 Go.

Le calcul est celui des commentaires de deploy/systemd/synorix-api.service. Les chiffres mesurés (pic PDFium
603 Mo, pic LibreOffice 992 Mo) viennent du bilan du bloc 6 ; le reste est un budget annoncé. Ce test lit les
fichiers déposés sur le serveur : un plafond relevé sans que le budget suive fait échouer la somme.
"""
import re
from pathlib import Path

DEPLOY = Path(__file__).resolve().parents[2] / "deploy"

RAM_MO = 8192
DISQUE_GO = 100
VCPU = 2

# Hypothèses du budget (voir l'en-tête de synorix-api.service)
SYSTEME_MO = 700            # Ubuntu 24.04 + nginx + sshd + fail2ban + journald (estimation, à relever sur le VPS)
API_REPOS_PIC_MO = 400      # l'API seule, avec des mémoires en cours (estimation)
PIC_PDFIUM_MO = 603         # mesuré (bloc 6)
PIC_LIBREOFFICE_MO = 992    # mesuré (bloc 6) ; UNE conversion à la fois (verrou de fichier dans le code)
CONNEXION_MO = 6            # connexion Postgres inactive
TRIS_SIMULTANES = 12        # requêtes qui trient en même temps, 2 nœuds chacune
AUTOVACUUM_OUVRIERS = 3     # défaut Postgres
TAMPONS_REDIS_MO = 44
POOL_PAR_PROCESSUS = 15     # backend/database.py : pool_size 10 + max_overflow 5
CONNEXIONS_ADMIN = 10       # psql, sauvegarde, migrations
MARGE_ANNONCEE_MO = 1024    # cache de pages du noyau + sauvegarde de nuit (<= 1 Go) ; swap en dernier recours
TOTAL_ANNONCE_MO = 7100


def _lire(chemin: str) -> str:
    return (DEPLOY / chemin).read_text(encoding="utf-8")


def _mo(valeur: str) -> int:
    m = re.fullmatch(r"\s*(\d+)\s*([KMGkmg])[Bb]?\s*", valeur)
    assert m, f"taille illisible : {valeur!r}"
    n, u = int(m.group(1)), m.group(2).upper()
    return n * {"K": 1, "M": 1, "G": 1024}[u] // (1024 if u == "K" else 1)


def _directive(texte: str, nom: str, *, commentaires: str = "#") -> str:
    m = re.search(rf"^{re.escape(nom)}\s*=\s*([^\s{commentaires}][^{commentaires}\n]*?)\s*(?:{commentaires}.*)?$", texte, re.MULTILINE)
    assert m, f"{nom} absent"
    return m.group(1).strip().strip("'\"")


def _service(nom: str) -> str:
    return _lire(f"systemd/synorix-{nom}.service")


def _pdfium() -> int:
    m = re.search(r"^Environment=SYNORIX_PDFIUM_PROCESSUS=(\d+)\s*$", _service("api"), re.MULTILINE)
    assert m, "SYNORIX_PDFIUM_PROCESSUS absent de l'unité de l'API"
    return int(m.group(1))


def _concurrence_celery() -> int:
    m = re.search(r"worker\b.*?\s-c\s+(\d+)", _service("celery-worker"))
    assert m, "-c absent de la commande du worker"
    return int(m.group(1))


def _postgres_mo() -> int:
    p = _lire("postgres/synorix.conf")
    connexions = POOL_PAR_PROCESSUS * (1 + _concurrence_celery())
    return (
        _mo(_directive(p, "shared_buffers"))
        + connexions * CONNEXION_MO
        + TRIS_SIMULTANES * 2 * _mo(_directive(p, "work_mem"))
        + AUTOVACUUM_OUVRIERS * _mo(_directive(p, "autovacuum_work_mem"))
        + _mo(_directive(p, "wal_buffers"))
    )


def _redis_mo() -> int:
    return _mo(_directive(_lire("redis/synorix.conf").replace("maxmemory ", "maxmemory = ", 1), "maxmemory")) + TAMPONS_REDIS_MO


def _plafond(nom: str, cle: str = "MemoryMax") -> int:
    return _mo(_directive(_service(nom), cle))


# ─── La somme ─────────────────────────────────────────────────────────────────

def test_la_somme_des_plafonds_tient_dans_8_go_avec_la_marge_annoncee():
    total = (SYSTEME_MO + _postgres_mo() + _redis_mo()
             + _plafond("api") + _plafond("celery-worker") + _plafond("celery-beat"))
    assert total <= TOTAL_ANNONCE_MO, f"somme des plafonds {total} Mo > {TOTAL_ANNONCE_MO} Mo annoncés"
    assert RAM_MO - total >= MARGE_ANNONCEE_MO, f"marge {RAM_MO - total} Mo < {MARGE_ANNONCEE_MO} Mo"


def test_la_sauvegarde_de_nuit_tient_dans_la_marge():
    assert _plafond("sauvegarde") <= MARGE_ANNONCEE_MO


def test_les_plafonds_de_l_api_couvrent_le_pire_cas_simultane():
    pire = API_REPOS_PIC_MO + _pdfium() * PIC_PDFIUM_MO + PIC_LIBREOFFICE_MO
    haut, max_ = _plafond("api", "MemoryHigh"), _plafond("api")
    assert pire <= haut <= max_, f"pire cas {pire} Mo, MemoryHigh {haut} Mo, MemoryMax {max_} Mo"
    assert max_ >= pire * 1.2, "MemoryMax doit garder au moins 20 % au-dessus du pire cas"


def test_le_worker_couvre_ses_enfants():
    # parent ~100 Mo + enfants remplacés au-delà de 300 Mo (--max-memory-per-child 300000 Kio)
    cmd = _service("celery-worker")
    assert "--max-memory-per-child 300000" in cmd
    assert 100 + _concurrence_celery() * 300 <= _plafond("celery-worker", "MemoryHigh") <= _plafond("celery-worker")


# ─── Les valeurs ──────────────────────────────────────────────────────────────

def test_une_seule_api_deux_processus_pdfium_deux_enfants_celery():
    assert re.search(r"--workers 1\b", _service("api")), "l'API reste à un processus (progression en mémoire)"
    assert _pdfium() == 2
    assert _concurrence_celery() == 2


def test_cpu_le_worker_et_l_api_laissent_de_la_place_a_postgres():
    def quota(nom):
        m = re.search(r"^CPUQuota=(\d+)%", _service(nom), re.MULTILINE)
        assert m, f"CPUQuota absent de {nom}"
        return int(m.group(1))
    assert quota("api") <= (VCPU - 0.5) * 100
    assert quota("celery-worker") <= VCPU * 100 // 2
    assert quota("celery-beat") <= 20


def test_tasksmax_pose_sur_les_trois_services():
    for nom in ("api", "celery-worker", "celery-beat"):
        assert re.search(r"^TasksMax=\d+\s*$", _service(nom), re.MULTILINE), nom


def test_postgres_connexions_et_memoire():
    p = _lire("postgres/synorix.conf")
    connexions = POOL_PAR_PROCESSUS * (1 + _concurrence_celery()) + CONNEXIONS_ADMIN
    assert int(_directive(p, "max_connections")) >= connexions
    assert _mo(_directive(p, "shared_buffers")) * 4 <= RAM_MO, "shared_buffers au plus 25 % de la RAM"
    assert _mo(_directive(p, "effective_cache_size")) < RAM_MO - _mo(_directive(p, "shared_buffers"))
    assert _mo(_directive(p, "maintenance_work_mem")) >= _mo(_directive(p, "work_mem"))
    assert _mo(_directive(p, "max_wal_size")) <= DISQUE_GO * 1024 * 0.05, "WAL borné à 5 % du disque"
    assert _mo(_directive(p, "min_wal_size")) <= _mo(_directive(p, "max_wal_size"))
    assert _directive(p, "idle_in_transaction_session_timeout") == "10min"


def test_redis_plafonne_sans_eviction():
    r = _lire("redis/synorix.conf")
    assert re.search(r"^maxmemory 256mb\s*$", r, re.MULTILINE)
    assert re.search(r"^maxmemory-policy noeviction\s*$", r, re.MULTILINE)


def test_journaux_et_swap():
    j = _lire("journald/synorix.conf")
    assert _mo(_directive(j, "SystemMaxUse")) <= DISQUE_GO * 1024 * 0.02
    assert _mo(_directive(j, "SystemKeepFree")) >= 5 * 1024
    assert _directive(j, "MaxRetentionSec") == "1month"
    assert _directive(_lire("sysctl/99-synorix.conf"), "vm.swappiness") == "10"


def test_aucune_unite_ne_vise_encore_le_kvm_1():
    for f in (DEPLOY / "systemd").glob("*.service"):
        texte = f.read_text(encoding="utf-8")
        assert "Mémoire (KVM 1" not in texte and "pour le KVM 1" not in texte, f.name
