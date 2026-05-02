# Chef Live Architecture

## Objectif

Construire une couche de streaming intégrée à la plateforme qui permet :

- d'utiliser `Agora` quand il est activé
- d'utiliser `Chef Live` quand il est activé
- de piloter le choix du provider depuis `/admin-cp/live`
- de préparer une stack Docker complète pour l'installation et l'exploitation

## Principe d'architecture

La solution cible est composée de deux plans distincts :

- plan `plateforme` : PHP, Node.js temps réel, base de données, cache, panneau d'administration
- plan `média` : ingestion, transcodage, diffusion, enregistrement, replay, métriques

`Chef Live` ne remplace pas l'interface d'administration. Il expose un backend média et une API interne. La plateforme garde la main sur :

- la création d'un live
- l'arrêt d'un live
- la génération des clés
- les droits d'accès
- les replays
- les journaux et la modération

## Providers live

Le code doit évoluer vers une abstraction unique, par exemple :

- `agora`
- `chef_live`

Le provider effectif sera déterminé par la configuration d'administration.

## Règles de coexistence

- Si `Agora` est activé et sélectionné, le flux actuel continue de fonctionner.
- Si `Chef Live` est activé et sélectionné, les écrans live utilisent l'API interne et les URLs RTMP/HLS/WebRTC de `Chef Live`.
- Les deux providers peuvent rester installés en parallèle.
- Le panneau admin doit permettre :
  - l'activation ou désactivation de chaque provider
  - la sélection du provider par défaut
  - l'affichage de l'état de santé de `Chef Live`

## Conteneurs cibles

### Socle plateforme

- `nginx`
- `php-fpm`
- `mariadb`
- `redis`
- `nodejs`

### Socle live

- `chef-live`

### Extensions futures

- `minio` pour stockage objet local
- `meilisearch` ou `opensearch` si la plateforme évolue côté recherche
- workers de file d'attente dédiés
- service d'observabilité

## Capacités cibles de Chef Live

- entrée RTMP
- sortie HLS
- sortie WebRTC
- gestion des stream keys
- enregistrement MP4
- stockage local ou S3
- transcodage multi-bitrate via FFmpeg
- métriques temps réel
- webhooks ou callbacks d'état

## Plan de migration recommandé

### Phase 1

- créer la stack Docker de base
- externaliser les secrets en variables d'environnement
- ajouter la notion de `live_provider`
- conserver Agora sans régression

### Phase 2

- intégrer `Chef Live` comme provider alternatif
- exposer l'état de santé dans `/admin-cp/live`
- permettre le basculement provider par provider

### Phase 3

- remplacer l'écran admin Agora par une vraie console en français
- gérer les lives actifs, les replays, les logs, la qualité, le stockage

### Phase 4

- ajouter WebRTC, transcodage multi-qualité, quotas et supervision avancée

## Points d'attention

- Les secrets présents dans `config.php` et `nodejs/config.json` devront être sortis du dépôt.
- Le `nodejs` existant dépend d'un `server.js` qui n'est pas encore présent dans ce dépôt ; le conteneur devra être aligné avec l'implémentation réelle.
- La configuration Nginx Docker fournie est un socle de départ ; elle devra intégrer les règles de réécriture exactes de la plateforme.
