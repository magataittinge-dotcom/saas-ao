"""RESTES-2, point 7 — réglages que plus rien ne lisait (APP_NAME, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES : restes de
l'authentification d'avant Clerk) retirés de `Settings` ; un ancien .env qui les pose démarre toujours."""
from config import Settings


def test_reglages_retires_et_ancien_env_toujours_accepte(tmp_path):
    for champ in ("APP_NAME", "ALGORITHM", "ACCESS_TOKEN_EXPIRE_MINUTES"):
        assert champ not in Settings.model_fields
    env = tmp_path / ".env"
    env.write_text("SECRET_KEY=x\nDATABASE_URL=sqlite:///ignore.db\nANTHROPIC_API_KEY=sk-ant-test\nDEBUG=true\n"
                   "APP_NAME=SaaS AO BTP\nALGORITHM=HS256\nACCESS_TOKEN_EXPIRE_MINUTES=10080\n", encoding="utf-8")
    s = Settings(_env_file=str(env))
    assert s.DEBUG is True and not hasattr(s, "ALGORITHM")
