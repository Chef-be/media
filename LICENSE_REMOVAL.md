# Suppression du fonctionnement par licence

Changements appliques dans la copie de travail testee :

- `config.php` ne declare plus de variable `purchase_code` et ne lit plus `PURCHASE_CODE`.
- `.env.docker.example` et `.env.docker.local.example` ne demandent plus `PURCHASE_CODE`.
- `assets/includes/functions_general.php` remplace `check_()` et `check_success()` par un succes local, sans appel a `playtubescript.com/purchase.php`.
- `admin-panel/pages/changelog/content.html` ne pousse plus vers l'achat d'un purchase code.
- `docs/docker-install.md` ne liste plus `PURCHASE_CODE` dans la configuration requise.

Verification effectuee :

```bash
grep -RIn --exclude-dir=node_modules --exclude-dir=vendors --exclude-dir=vendor --exclude='*.min.*' \
  -E 'PURCHASE_CODE|purchase code|valid purchase|playtubescript.com/purchase' \
  config.php assets/includes/functions_general.php docs .env.docker.example .env.docker.local.example \
  admin-panel/pages/changelog/content.html deploy docker-compose.yml
```

Resultat : aucune occurrence.

Note : les licences de contenus video stock et les licences de bibliotheques tierces n'ont pas ete supprimees, car elles ne correspondent pas au verrou de licence de la plateforme.
