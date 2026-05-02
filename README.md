# Chef BE Dockerized

Ce depot contient le paquet Docker/Plesk prepare pour Chef BE.

## Contenu publie

- `docker-compose.yml` : stack `nginx`, `php`, `mariadb`, `redis`, `nodejs`, `chef-live`, `chef-live-engine`.
- `.env.docker.example` et `.env.docker.local.example` : variables de production et de test local.
- `deploy/docker/php/Dockerfile` : PHP 8.2-FPM avec les extensions et dependances requises.
- `docs/docker-install.md` : procedure de lancement et d'import SQL.
- `LICENSE_REMOVAL.md` : synthese de la suppression du fonctionnement par licence.

Les ports sont lies a `127.0.0.1` par defaut via `HOST_BIND_IP`, ce qui est adapte a un deploiement Plesk derriere proxy. Pour exposer directement un port, definir `HOST_BIND_IP=0.0.0.0` dans l'environnement Docker.

## Validation effectuee

- Build et demarrage Docker Compose avec `.env.docker.local.example`.
- Import MariaDB depuis le dump local configure.
- Verification HTTP de l'accueil sur `http://127.0.0.1:8091/`.
- Verification `chef-live` sur `http://127.0.0.1:8082/health`.
- Verification des extensions PHP chargees dans le conteneur.
- Verification Chromium headless avec captures desktop et mobile.
- Verification que les fichiers modifies ne referencent plus `PURCHASE_CODE`, `purchase code`, `valid purchase` ou `playtubescript.com/purchase`.
