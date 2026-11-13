"""Accord en nombre des textes que le client lit (notifications, refus, libellés, documents téléchargés).

Jamais de pluriel entre parenthèses (« 605 exigence(s) extraite(s) ») : l'accord se fait au moment d'écrire.
« 0 » et « 1 » s'écrivent au singulier, comme en français (« 0 exigence extraite », « 1 exigence extraite »)."""


def mot(n: int, singulier: str, pluriel: str) -> str:
    """Le mot (ou le groupe de mots) accordé au nombre, sans le nombre : « autre élément » / « autres éléments »."""
    return pluriel if abs(n) > 1 else singulier


def accord(n: int, singulier: str, pluriel: str) -> str:
    """Le nombre suivi de son nom accordé : « 1 personne », « 3 personnes », « 0 personne »."""
    return f"{n} {mot(n, singulier, pluriel)}"
