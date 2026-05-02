#!/bin/sh
set -eu

if [ -z "${DB_BOOTSTRAP_SQL:-}" ]; then
  echo "No DB_BOOTSTRAP_SQL provided, skipping bootstrap import."
  exit 0
fi

if [ ! -f "$DB_BOOTSTRAP_SQL" ]; then
  echo "Bootstrap SQL not found: $DB_BOOTSTRAP_SQL"
  exit 1
fi

echo "Importing bootstrap SQL from $DB_BOOTSTRAP_SQL"
(
  printf 'SET FOREIGN_KEY_CHECKS=0;\n'
  cat "$DB_BOOTSTRAP_SQL"
  printf '\nSET FOREIGN_KEY_CHECKS=1;\n'
) | mysql -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}"
