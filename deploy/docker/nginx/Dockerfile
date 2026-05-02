FROM nginx:1.27-alpine

ARG APP_UID=10000
ARG APP_GID=1003

RUN if getent group "${APP_GID}" >/dev/null; then group_name="$(getent group "${APP_GID}" | cut -d: -f1)"; else addgroup -g "${APP_GID}" -S appgroup; group_name="appgroup"; fi \
    && if getent passwd "${APP_UID}" >/dev/null; then user_name="$(getent passwd "${APP_UID}" | cut -d: -f1)"; else adduser -S -D -H -u "${APP_UID}" -G "${group_name}" appuser; user_name="appuser"; fi \
    && sed -i "s/^user\\s\\+nginx;/user ${user_name} ${group_name};/" /etc/nginx/nginx.conf

COPY default.conf /etc/nginx/conf.d/default.conf
