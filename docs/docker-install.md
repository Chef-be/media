# Installation Docker

## Objectif

Lancer la plateforme et `Chef Live` avec `docker compose`, selon deux modes :

- installation vierge
- initialisation depuis une sauvegarde SQL existante

## Préparation

1. Copier le fichier d'environnement :

```bash
cp .env.docker.example .env
```

Pour un lancement local prêt à l'emploi avec la sauvegarde actuellement validée :

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

`APP_UID` et `APP_GID` doivent correspondre au propriétaire du dépôt monté dans le conteneur. Sur ce serveur, la valeur actuelle est `10000:1003`.

Pour un lancement local, `APP_URL` doit pointer vers l'URL du compose, par exemple `http://127.0.0.1:8091`, afin d'éviter les redirections ou URLs absolues vers la production.

## Base vide

Lancer simplement :

```bash
docker compose up -d --build
```

La base sera créée vide. Ce mode est utile pour préparer une future procédure d'installation ou raccorder un schéma vierge.

## Base préchargée

Définir `DB_BOOTSTRAP_SQL` dans `.env`, par exemple :

```env
DB_BOOTSTRAP_SQL=/docker-entrypoint-initdb.d/backups/17-02-2025/1739762655/SQL-Backup-1739762655-17-02-2025.sql
```

Puis lancer :

```bash
docker compose up -d --build
```

Au premier démarrage du volume MariaDB, la sauvegarde sera importée automatiquement.

Le script d'import désactive maintenant `FOREIGN_KEY_CHECKS` pendant le chargement, ce qui évite les imports partiels sur certaines sauvegardes historiques.

## Remise à zéro locale reproductible

Pour repartir d'une pile locale propre avec suppression des volumes puis reconstruction complète :

```bash
sh scripts/docker-reset-local.sh .env.local
```

Si tu ne fournis pas de fichier, le script utilise `.env.docker.local.example`.

## Services attendus

- plateforme web : `nginx` + `php`
- base de données : `db`
- cache : `redis`
- temps réel Node.js : `nodejs`
- API Chef Live : `chef-live`
- moteur média : `chef-live-engine`

## Vérifications rapides

```bash
docker ps
curl http://127.0.0.1:8081/health
```

## Documentation et dépôts

Avant chaque dépôt Git, vérifier que cette documentation reste alignée avec les fichiers Docker publiés. Toute modification de ports, variables d'environnement, services, volumes, dépendances ou procédure de test doit être documentée dans ce fichier.

## Limites actuelles

- la pile Docker web couvre maintenant l'accès aux scripts PHP avec les bons UID/GID, et les contextes de construction ont été réduits par service pour accélérer les reconstructions; elle peut encore nécessiter des ajustements de règles Nginx selon les personnalisations historiques du site
- l'application ne fournit pas dans ce dépôt un installateur moderne autonome; l'initialisation la plus fiable reste aujourd'hui l'import d'une sauvegarde SQL existante
