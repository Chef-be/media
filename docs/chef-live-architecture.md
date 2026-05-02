# Architecture Chef Live

## Objectif

Construire une couche de diffusion en direct intégrée à la plateforme qui permet :

- d'utiliser `Agora` quand il est activé
- d'utiliser `Chef Live` quand il est activé
- de piloter le choix du fournisseur depuis `/admin-cp/live`
- de préparer une pile Docker complète pour l'installation et l'exploitation

## Principe d'architecture

La solution cible est composée de deux plans distincts :

- plan `plateforme` : PHP, Node.js temps réel, base de données, cache, panneau d'administration
- plan `média` : ingestion, transcodage, diffusion, enregistrement, rediffusion, métriques

`Chef Live` ne remplace pas l'interface d'administration. Il expose un service média interne et une API interne. La plateforme garde la main sur :

- la création d'un live
- l'arrêt d'un live
- la génération des clés
- les droits d'accès
- les rediffusions
- les journaux et la modération

## Fournisseurs live

Le code doit évoluer vers une abstraction unique, par exemple :

- `agora`
- `chef_live`

Le fournisseur effectif sera déterminé par la configuration d'administration.

## Règles de coexistence

- Si `Agora` est activé et sélectionné, le flux actuel continue de fonctionner.
- Si `Chef Live` est activé et sélectionné, les écrans live utilisent l'API interne et les URL RTMP/HLS/WebRTC de `Chef Live`.
- Les deux fournisseurs peuvent rester installés en parallèle.
- Le panneau admin doit permettre :
  - l'activation ou la désactivation de chaque fournisseur
  - la sélection du fournisseur par défaut
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
- services de traitement de file d'attente dédiés
- service d'observabilité

## Capacités cibles de Chef Live

- entrée RTMP
- sortie HLS
- sortie WebRTC
- gestion des clés de diffusion
- enregistrement MP4
- stockage local ou S3
- transcodage multi-bitrate via FFmpeg
- métriques temps réel
- points d'appel web ou rappels d'état

## Plan de migration recommandé

### Phase 1

- créer la pile Docker de base
- externaliser les secrets en variables d'environnement
- ajouter la notion de `live_provider`
- conserver Agora sans régression

### Phase 2

- intégrer `Chef Live` comme fournisseur alternatif
- exposer l'état de santé dans `/admin-cp/live`
- permettre le basculement fournisseur par fournisseur

### Phase 3

- remplacer l'écran admin Agora par une vraie console en français
- gérer les diffusions actives, les rediffusions, les journaux, la qualité et le stockage

### Phase 4

- ajouter WebRTC, transcodage multi-qualité, quotas et supervision avancée

## Points d'attention

- Les secrets présents dans `config.php` et `nodejs/config.json` devront être sortis du dépôt.
- Le `nodejs` existant dépend d'un `server.js` qui n'est pas encore présent dans ce dépôt ; le conteneur devra être aligné avec l'implémentation réelle.
- La configuration Nginx Docker fournie est un socle de départ ; elle devra intégrer les règles de réécriture exactes de la plateforme.

## Documentation et dépôts

Cette documentation doit rester en français et être mise à jour à chaque dépôt Git qui modifie l'architecture, les services Docker, les fournisseurs live, les ports, les variables d'environnement ou les procédures de validation.
