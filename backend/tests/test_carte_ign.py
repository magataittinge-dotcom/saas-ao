"""Carte de situation IGN (bloc 3, tranche B) — sans réseau : réponses simulées.

Adresses et coordonnées inventées. Aucune requête ne doit partir ailleurs que
chez data.geopf.fr (plus rien chez Google).
"""
import io
import json
from datetime import date
from types import SimpleNamespace

import httpx
import pytest
from PIL import Image

from services import maps_service as ms

SIEGE = "12 rue des Tilleuls 51100 Reims"
CHANTIER = "3 place du Marché 51390 Gueux"
COORDS = {SIEGE: (49.2583, 4.0317), CHANTIER: (49.2800, 3.9900)}


def _tuile_png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (256, 256), "#9FC5A0").save(buf, "PNG")
    return buf.getvalue()


class FauxReseau:
    def __init__(self, introuvables=(), geocodage_en_panne=False, tuiles_http=200):
        self.appels: list[tuple[str, dict]] = []
        self.introuvables = set(introuvables)
        self.geocodage_en_panne = geocodage_en_panne
        self.tuiles_http = tuiles_http

    def __call__(self, url, params, timeout):
        self.appels.append((url, params))
        assert timeout <= ms._TIMEOUT_APPEL_S          # délai court à chaque appel
        if url == ms._GEOCODAGE_URL:
            if self.geocodage_en_panne:
                raise httpx.ConnectError("panne simulée")
            q = params["q"]
            if q in self.introuvables or q not in COORDS:
                return httpx.Response(200, json={"features": []})
            lat, lon = COORDS[q]
            return httpx.Response(200, json={"features": [
                {"geometry": {"coordinates": [lon, lat]}, "properties": {"score": 0.93}}]})
        if url == ms._WMTS_URL:
            if self.tuiles_http != 200:
                return httpx.Response(self.tuiles_http, content=b"")
            return httpx.Response(200, content=_tuile_png(), headers={"content-type": "image/png"})
        raise AssertionError(f"appel inattendu : {url}")

    def hotes(self):
        return {a[0].split("/")[2] for a in self.appels}


@pytest.fixture
def reseau(monkeypatch, tmp_path):
    monkeypatch.setattr(ms, "_REPERTOIRE_CACHE", tmp_path / "cache")
    faux = FauxReseau()
    monkeypatch.setattr(ms, "_get", faux)
    return faux


def test_carte_du_siege_seul(reseau):
    png, legende = ms.generate_location_map(SIEGE)
    img = Image.open(io.BytesIO(png))
    assert img.format == "PNG" and img.size == (960, 480)
    assert f"extrait du {date.today().strftime('%d/%m/%Y')}" in legende
    assert "Source : IGN – Plan IGN v2 (Géoplateforme)" in legende
    assert SIEGE in legende
    assert reseau.hotes() == {"data.geopf.fr"}          # rien chez Google
    assert "voiture" not in legende and "min" not in legende


def test_siege_et_chantier_distance_a_vol_d_oiseau(reseau):
    png, legende = ms.generate_location_map(SIEGE, CHANTIER)
    assert png and "à vol d'oiseau" in legende
    assert "voiture" not in legende
    assert CHANTIER in legende
    # Reims -> Gueux : environ 3 a 4 km (coordonnees inventees)
    assert "Distance à vol d'oiseau : 3,9 km" in legende
    assert reseau.hotes() == {"data.geopf.fr"}


def test_deuxieme_appel_sans_aucun_reseau(reseau):
    png1, leg1 = ms.generate_location_map(SIEGE, CHANTIER)
    avant = len(reseau.appels)
    assert avant > 0
    png2, leg2 = ms.generate_location_map(SIEGE, CHANTIER)
    assert len(reseau.appels) == avant
    assert png2 == png1 and leg2 == leg1


def test_geocodage_mis_en_cache_pour_une_autre_carte(reseau):
    ms.generate_location_map(SIEGE)
    geo1 = [a for a in reseau.appels if a[0] == ms._GEOCODAGE_URL]
    ms.generate_location_map(SIEGE, CHANTIER)       # siège déjà géocodé
    geo2 = [a for a in reseau.appels if a[0] == ms._GEOCODAGE_URL]
    assert len(geo1) == 1 and len(geo2) == 2


def test_adresse_introuvable_pas_de_carte(monkeypatch, tmp_path):
    monkeypatch.setattr(ms, "_REPERTOIRE_CACHE", tmp_path / "c")
    monkeypatch.setattr(ms, "_get", FauxReseau(introuvables={SIEGE}))
    assert ms.generate_location_map(SIEGE) == (None, None)


def test_chantier_introuvable_la_carte_garde_le_siege(monkeypatch, tmp_path):
    monkeypatch.setattr(ms, "_REPERTOIRE_CACHE", tmp_path / "c")
    monkeypatch.setattr(ms, "_get", FauxReseau(introuvables={CHANTIER}))
    png, legende = ms.generate_location_map(SIEGE, CHANTIER)
    assert png and "vol d'oiseau" not in legende and CHANTIER not in legende


@pytest.mark.parametrize("faux", [
    FauxReseau(geocodage_en_panne=True),
    FauxReseau(tuiles_http=503),
])
def test_panne_pas_de_carte_sans_exception(monkeypatch, tmp_path, faux):
    monkeypatch.setattr(ms, "_REPERTOIRE_CACHE", tmp_path / "c")
    monkeypatch.setattr(ms, "_get", faux)
    assert ms.generate_location_map(SIEGE, CHANTIER) == (None, None)


def test_plafond_global_pas_d_attente(monkeypatch, tmp_path):
    monkeypatch.setattr(ms, "_REPERTOIRE_CACHE", tmp_path / "c")
    faux = FauxReseau()
    monkeypatch.setattr(ms, "_get", faux)
    monkeypatch.setattr(ms, "_BUDGET_TOTAL_S", 0.0)
    assert ms.generate_location_map(SIEGE) == (None, None)
    assert faux.appels == []


def test_adresses_vides_pas_de_carte(reseau):
    assert ms.generate_location_map("", None) == (None, None)
    assert ms.generate_location_map("   ", "  ") == (None, None)
    assert reseau.appels == []


def test_cache_borne(monkeypatch, tmp_path):
    monkeypatch.setattr(ms, "_REPERTOIRE_CACHE", tmp_path / "c")
    adresses = [f"{i} rue Inventée {i}" for i in range(5)]
    for a in adresses:
        COORDS[a] = (49.0 + i_ * 0.001, 4.0) if (i_ := adresses.index(a)) >= 0 else None
    monkeypatch.setattr(ms, "_get", FauxReseau())
    monkeypatch.setattr(ms, "_MAX_CARTES_EN_CACHE", 2)
    try:
        for a in adresses:
            assert ms.generate_location_map(a)[0]
        assert len(list((tmp_path / "c").glob("carte-*.png"))) == 2
        assert len(list((tmp_path / "c").glob("carte-*.json"))) == 2
    finally:
        for a in adresses:
            COORDS.pop(a, None)


def test_carte_trop_ancienne_recomposee(monkeypatch, tmp_path):
    monkeypatch.setattr(ms, "_REPERTOIRE_CACHE", tmp_path / "c")
    faux = FauxReseau()
    monkeypatch.setattr(ms, "_get", faux)
    ms.generate_location_map(SIEGE)
    meta = next((tmp_path / "c").glob("carte-*.json"))
    d = json.loads(meta.read_text())
    d["date"] = "2020-01-01"
    meta.write_text(json.dumps(d))
    n = len(faux.appels)
    _, legende = ms.generate_location_map(SIEGE)
    assert len(faux.appels) > n                       # tuiles retéléchargées
    assert date.today().strftime("%d/%m/%Y") in legende


# ── Lieu d'exécution : jamais le nom de l'acheteur ──────────────────────────

def _p(infos, mo="Commune de GUEUX"):
    return SimpleNamespace(infos_marche=infos, maitre_ouvrage=mo)


def test_lieu_execution():
    assert ms.lieu_execution(_p(None)) is None
    assert ms.lieu_execution(_p({})) is None                      # analyse actuelle
    assert ms.lieu_execution(_p({"maitre_ouvrage": "Commune de GUEUX"})) is None
    assert ms.lieu_execution(_p({"lieu_execution": "  "})) is None
    assert ms.lieu_execution(_p({"lieu_execution": 12})) is None
    assert ms.lieu_execution(_p({"lieu_execution": "Commune de GUEUX"})) is None
    assert ms.lieu_execution(_p({"lieu_execution": "3 place\ndu Marché 51390 Gueux"})) \
        == "3 place du Marché 51390 Gueux"


def test_export_ne_donne_jamais_le_nom_de_l_acheteur_a_la_carte(monkeypatch):
    import routers.memoire as rm
    vus = []

    def faux(company, project):
        vus.append((company, project))
        return None, None

    monkeypatch.setattr(rm, "generate_location_map", faux)
    projet = SimpleNamespace(
        id="p", name="AO", maitre_ouvrage="Commune de GUEUX", selected_lot_name=None,
        infos_marche={"maitre_ouvrage": "Commune de GUEUX"}, organization_id="o",
    )
    memoire = SimpleNamespace(content_json={}, variables={})
    org = SimpleNamespace(name="ENTREPRISE TEST", address=SIEGE, logo_url=None, siret=None)
    rm.build_project_memoire_docx(projet, memoire, org, db=None)
    assert vus == [(SIEGE, None)]
    projet.infos_marche = {"lieu_execution": CHANTIER}
    rm.build_project_memoire_docx(projet, memoire, org, db=None)
    assert vus[-1] == (SIEGE, CHANTIER)


def test_plus_aucune_trace_de_google_dans_le_service():
    import inspect
    src = inspect.getsource(ms).lower()
    assert "googleapis" not in src and "google_maps" not in src
