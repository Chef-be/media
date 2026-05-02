# Docker Install

## Objectif

Lancer la plateforme et `Chef Live` via `docker compose`, avec deux modes :

- installation vierge
- initialisation depuis un dump SQL existant

## Preparation

1. Copier le fichier d'environnement :

```bash
cp .env.docker.example .env
```

Pour un lancement local pret a l'emploi avec le dump actuellement valide :

```bash
cp .env.docker.local.example .env.local
```

2. Renseigner au minimum :

- `APP_URL`
- `APP_UID`
- `APP_GID`
- `DB_ROOT_PASSWORD`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `SITE_ENCRYPT_KEY`

`APP_UID` et `APP_GID` doivent correspondre au proprietaire du depot monte dans le conteneur. Sur ce serveur, la valeur actuelle est `10000:1003`.

Pour un lancement local, `APP_URL` doit pointer vers l'URL du compose, par exemple `http://127.0.0.1:8091`, afin d'eviter les redirections ou URLs absolues vers la production.

## Base vide

```bash
docker compose up -d --build
```

La base sera creee vide. Ce mode est utile pour preparer une future procedure d'installation ou brancher un schema vierge.

## Base prechargee

Definir `DB_BOOTSTRAP_SQL` dans `.env`, par exemple :

```env
DB_BOOTSTRAP_SQL=/docker-entrypoint-initdb.d/backups/17-02-2025/1739762655/SQL-Backup-1739762655-17-02-2025.sql
```

Puis lancer :

```bash
docker compose up -d --build
```

Au premier demarrage du volume MariaDB, le dump sera importe automatiquement.

Le script d'import desactive `FOREIGN_KEY_CHECKS` pendant le chargement, ce qui evite les imports partiels sur certains dumps historiques.

## Reset local reproductible

```bash
sh scripts/docker-reset-local.sh .env.local
```

Si aucun fichier n'est fourni, le script utilise `.env.docker.local.example`.

## Services attendus

- plateforme web : `nginx` + `php`
- base de donnees : `db`
- cache : `redis`
- temps reel Node.js : `nodejs`
- API Chef Live : `chef-live`
- moteur media : `chef-live-engine`

## Verifications rapides

```bash
docker ps
curl http://127.0.0.1:8081/health
```

## Notes Plesk

Les ports sont lies a `127.0.0.1` par defaut via `HOST_BIND_IP`, afin de laisser Plesk publier le service via son proxy web. Pour une exposition directe, definir explicitement `HOST_BIND_IP=0.0.0.0`.
