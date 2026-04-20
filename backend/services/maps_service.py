"""Google Maps Static API — generates location map images for mémoire technique."""
from __future__ import annotations

import math
import httpx
from config import get_settings


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance en km entre deux points GPS (formule haversine)."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _geocode(address: str, api_key: str) -> tuple[float, float] | None:
    """Geocode an address → (lat, lng) or None."""
    try:
        resp = httpx.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": address, "key": api_key},
            timeout=10,
        )
        results = resp.json().get("results", [])
        if results:
            loc = results[0]["geometry"]["location"]
            return loc["lat"], loc["lng"]
    except Exception:
        pass
    return None


def generate_location_map(
    company_address: str,
    project_address: str | None = None,
) -> tuple[bytes | None, str | None]:
    """Generate a static map PNG with company marker (red) and optional project marker (blue).

    Returns (image_bytes, caption_text) or (None, None) on failure.
    """
    settings = get_settings()
    api_key = settings.GOOGLE_MAPS_API_KEY
    if not api_key or not company_address or not company_address.strip():
        return None, None

    params: dict[str, str] = {
        "size": "600x400",
        "scale": "2",
        "maptype": "roadmap",
        "language": "fr",
        "key": api_key,
    }

    markers = [f"color:red|label:E|{company_address}"]
    caption = f"Localisation de l'entreprise — {company_address}"

    distance_km: float | None = None

    if project_address and project_address.strip():
        markers.append(f"color:blue|label:C|{project_address}")

        # Compute distance via geocoding + haversine
        coords_company = _geocode(company_address, api_key)
        coords_project = _geocode(project_address, api_key)
        if coords_company and coords_project:
            distance_km = _haversine_km(*coords_company, *coords_project)
            # Auto-zoom: let Google fit both markers
            params["center"] = ""  # omit center to auto-fit
        else:
            params["center"] = company_address
            params["zoom"] = "11"

        if distance_km is not None:
            mins = round(distance_km / 60 * 60)  # ~60 km/h average
            caption = (
                f"Localisation entreprise (rouge) et chantier (bleu) — "
                f"Distance : {distance_km:.0f} km (environ {mins} min en voiture)"
            )
    else:
        params["center"] = company_address
        params["zoom"] = "12"

    try:
        resp = httpx.get(
            "https://maps.googleapis.com/maps/api/staticmap",
            params={**params, "markers": markers},
            timeout=15,
        )
        if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("image/"):
            return resp.content, caption
    except Exception as e:
        print(f"[maps_service] Error fetching static map: {e}", flush=True)

    return None, None
