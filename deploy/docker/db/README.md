# DB Bootstrap

Le service `db` peut démarrer de deux façons :

- base vide, pour une installation manuelle
- base préchargée via un dump SQL

Pour précharger la base, définissez `DB_BOOTSTRAP_SQL` dans l'environnement Compose vers un fichier SQL présent dans le conteneur, par exemple :

`/docker-entrypoint-initdb.d/bootstrap.sql`

Le script `import-backup.sh` exécutera l'import au premier démarrage du volume MariaDB.
