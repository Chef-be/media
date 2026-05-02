# Chef BE

Ce dépôt contient la plateforme Chef BE et les éléments nécessaires à son exploitation Docker compatible Plesk.

## Contenu principal

- plateforme PHP et thèmes applicatifs
- panneau d'administration
- service temps réel Node.js
- pile Docker avec Nginx, PHP-FPM, MariaDB, Redis, Node.js, Chef Live et moteur média
- documentation d'installation Docker et d'architecture Chef Live

## Documentation

- [Installation Docker](docs/docker-install.md)
- [Architecture Chef Live](docs/chef-live-architecture.md)

Toute documentation destinée au dépôt GitHub doit rester en français. À chaque dépôt Git, la documentation concernée doit être relue et mise à jour avec les changements publiés.

## Déploiement Docker

La pile Docker est prévue pour fonctionner derrière Plesk. Les ports sont liés à `127.0.0.1` par défaut via `HOST_BIND_IP`, ce qui permet à Plesk de jouer le rôle de mandataire frontal.

Pour préparer un environnement :

```bash
cp .env.docker.example .env
docker compose up -d --build
```

Pour un test local reproductible avec remise à zéro :

```bash
sh scripts/docker-reset-local.sh .env.docker.local.example
```

## Règles de dépôt

- Les fichiers ignorés par `.gitignore` ne doivent pas être suivis dans Git.
- Les fichiers de configuration locale, secrets, médias générés, dépendances installées et artefacts temporaires restent hors dépôt.
- Les captures d'écran, environnements isolés, profils navigateur et fichiers de débogage doivent être supprimés après validation, sauf demande explicite.
- Les gros fichiers suivis volontairement sont gérés avec Git LFS.

## Licence plateforme

Les contrôles de licence et de code d'achat de la plateforme ont été neutralisés pour ce déploiement. Les licences de bibliothèques tierces restent conservées dans les dossiers concernés.
