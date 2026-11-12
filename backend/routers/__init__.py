"""Les routeurs de l'API. Chacun s'importe à la demande (`from routers import auth, …` dans main.py).

Ce paquet n'importe plus tous ses routeurs d'office (RESTES-2) : `services.budget_ia` importe `routers.auth`, et
l'import d'office faisait charger `routers.analysis`, qui importe `services.budget_ia` encore à moitié chargé
(`import services.budget_ia` seul échouait ; les scripts devaient d'abord `import routers`).
"""
