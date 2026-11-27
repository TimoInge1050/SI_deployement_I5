# SI_deployement_I5
TP de déploiement SI

## Utilisation de l’intelligence artificielle

Le fichier `backend/routes/automates.js` précise l’origine des fonctions
auxiliaires et des routes de gestion des automates.

Ces mentions signalent l’utilisation d’une IA ; elles ne remplacent pas la
relecture, la validation ni les tests par l’équipe.

## Interface Suivi Process

Le backend sert le frontend depuis la racine (`http://localhost:3000/`) lorsque
les variables d’environnement et MariaDB sont configurés. La page d’accueil
présente les automates disponibles ; chaque automate ouvre sa page de suivi
avec le graphique et les relevés de ses variables (1 000 relevés maximum par
variable).

La page permet de configurer les variables Modbus à acquérir : nom, adresse du
registre, type (`INT16` ou `UINT16`), unité, fréquence et activation. Les
relevés affichés sous le graphique sont consultables uniquement. Désactiver
une variable suspend les nouvelles acquisitions en préservant son historique ;
la suppression d’une variable supprime également ses relevés associés.
La page de suivi permet aussi de choisir librement les variables à afficher
avec des cases à cocher, de choisir une période de 1 à 30 jours et de parcourir
les relevés par pages.

Depuis l’accueil, le bouton « Connecter une nouvelle API » permet d’enregistrer
un automate Modbus TCP (nom, adresse IP, port et Unit ID) et ses variables
directement dans la base via le backend. Les variables peuvent aussi être
ajoutées ultérieurement depuis la fiche de l’automate.

Le backend teste la connexion TCP de chaque automate actif toutes les cinq
secondes, même sans variable configurée. L’état de connexion des automates est
visible dans la liste et sur leur fiche ; le terminal affiche chaque tentative,
son résultat et les lectures de variables. Les 100 derniers événements par
automate sont conservés en mémoire et sont réinitialisés au redémarrage du
backend.

L’interface s’appuie principalement sur Bootstrap 5.3.3 chargé depuis jsDelivr ;
`frontend/css/style.css` ne contient que les ajustements visuels propres au site.
