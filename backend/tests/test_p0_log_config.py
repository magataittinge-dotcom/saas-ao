"""Phase 0 (rapport production-ready) — R2 : log_config.json versionné et valide.

L'unité systemd documentée (DEPLOYMENT.md §7) lance uvicorn avec
`--log-config /srv/synorix/backend/log_config.json`. Le fichier n'existait pas
dans le repo → FileNotFoundError avant même le bind → crash-loop systemd.
"""
import json
import subprocess
import sys
from pathlib import Path

LOG_CONFIG = Path(__file__).parent.parent / "log_config.json"


def test_log_config_exists_and_parses():
    assert LOG_CONFIG.is_file(), (
        "backend/log_config.json manquant — référencé par l'unité systemd "
        "synorix-api (DEPLOYMENT.md §7)"
    )
    cfg = json.loads(LOG_CONFIG.read_text(encoding="utf-8"))
    assert cfg["version"] == 1
    assert cfg["disable_existing_loggers"] is False
    for logger in ("uvicorn", "uvicorn.access"):
        assert logger in cfg["loggers"]
    # Les logs applicatifs (services/, routers/) doivent sortir aussi → root.
    assert "root" in cfg
    # journald horodate déjà et ne rend pas les couleurs ANSI.
    for fmt in cfg["formatters"].values():
        assert fmt.get("use_colors") is not True


def test_log_config_accepted_by_dictconfig():
    """Validation réelle : uvicorn charge un .json via logging.config.dictConfig.
    Exécuté en sous-process pour ne pas polluer la config logging de pytest."""
    code = (
        "import json, logging, logging.config, sys; "
        "logging.config.dictConfig(json.load(open(sys.argv[1], encoding='utf-8'))); "
        "logging.getLogger('uvicorn').info('log_config OK')"
    )
    res = subprocess.run(
        [sys.executable, "-c", code, str(LOG_CONFIG)],
        capture_output=True, text=True, timeout=30,
    )
    assert res.returncode == 0, f"dictConfig a rejeté log_config.json : {res.stderr}"
