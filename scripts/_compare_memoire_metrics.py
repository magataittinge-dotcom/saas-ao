"""JETABLE — Métriques objectives d'un mémoire (JSON) pour comparaison A/B.

Usage: python scripts/_compare_memoire_metrics.py <chemin.json> [label]
"""
import json
import re
import sys

path = sys.argv[1]
label = sys.argv[2] if len(sys.argv) > 2 else path
d = json.load(open(path, encoding="utf-8"))

SUB = {
    "partie_a": ["implantation", "historique", "engagement_qualitatif", "activites",
                 "organigramme", "roles_missions", "moyens_informatiques", "vehicules",
                 "materiel", "references", "fournisseurs"],
    "partie_b": ["demarrage", "interlocuteur", "qualite_ouvrages", "respect_planning",
                 "securite", "dechets", "environnement"],
    "partie_c": ["methodologie", "effectifs", "materiels", "hygiene_securite",
                 "mesures_environnementales", "gpa", "delai"],
}


def text_of(part):
    sec = d.get(part, {})
    if isinstance(sec, dict):
        return "\n".join(str(v) for v in sec.values())
    return str(sec)


full = str(d.get("preambule", "")) + "\n"
for p in ("partie_a", "partie_b", "partie_c"):
    full += text_of(p) + "\n"

def count(pat):
    return len(re.findall(pat, full, re.IGNORECASE))

print(f"===== {label} =====")
# Sous-sections présentes
present = 0
miss = []
if d.get("preambule") and "À RÉGÉNÉRER" not in str(d["preambule"]):
    present += 1
else:
    miss.append("preambule")
for p, subs in SUB.items():
    for sk in subs:
        v = d.get(p, {}).get(sk, "")
        if v and "À RÉGÉNÉRER" not in str(v):
            present += 1
        else:
            miss.append(f"{p}.{sk}")
print(f"Sous-sections présentes : {present}/26  | manquantes: {miss or 'AUCUNE'}")

# Longueur
print(f"Longueur totale : {len(full):,} chars | {len(full.split()):,} mots")
print(f"  preambule : {len(str(d.get('preambule',''))):,} chars")
for p in ("partie_a", "partie_b", "partie_c"):
    t = text_of(p)
    print(f"  {p} : {len(t):,} chars | {len(t.split()):,} mots")

# Vague 2
print("--- Sections Vague 2 (présence/précision) ---")
print(f"  PPSPS : {count(r'PPSPS')}  | R.4532 : {count(r'R\.?\s?4532')}")
print(f"  SOGED : {count(r'SOGED')}  | REP PMCB : {count(r'REP|PMCB')}  | AGEC : {count(r'AGEC')}")
print(f"  DTU 43 : {count(r'DTU\s?43')}  | 43.1 : {count(r'43\.1')}  | 43.3 : {count(r'43\.3')}  | 43.5 : {count(r'43\.5')}")
print(f"  ISO 9001 : {count(r'9001')}  | PAQ : {count(r'PAQ')}  | KPI/indicateur : {count(r'KPI|indicateur')}")
print(f"  SPAC : {count(r'SPAC')}")

# Spécificité DCE Gueux
print("--- Spécificité DCE ---")
print(f"  Gueux : {count(r'Gueux')}  | Tilleuls : {count(r'Tilleuls')}  | Moutier : {count(r'Moutier')}")
print(f"  école/élémentaire : {count(r'école|élémentaire')}  | Commune : {count(r'Commune')}  | ERP : {count(r'ERP')}")
print(f"  étanchéité : {count(r'étanchéit')}  | couverture : {count(r'couverture')}")
print(f"  pénalité/€ HT (contraintes CCAP) : {count(r'pénalit|€ HT')}")
print(f"  SOPREMA/produits cités : {count(r'SOPREMA|ELASTOPHENE|EFIGREEN|SOPRALENE|ALSAN')}")

# Données entreprise inventées
print("--- Données entreprise ---")
print(f"  [À COMPLÉTER] : {count(r'À COMPLÉTER')}")

# Densité technique : normes/DTU/NF
print("--- Densité technique ---")
print(f"  'DTU' (toutes) : {count(r'DTU')}  | 'NF ' : {count(r'NF ')}  | 'Article/Art.' réglementaire : {count(r'Article R|Art\. |R\.\d|L\.?\d{3}')}")
print(f"  Avis Technique/ACERMI/CSTB : {count(r'Avis Technique|ACERMI|CSTB|ATEC')}")
