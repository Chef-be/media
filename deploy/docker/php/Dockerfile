FROM php:8.2-fpm

ARG APP_UID=10000
ARG APP_GID=1003

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        ffmpeg \
        libcurl4-openssl-dev \
        libexif-dev \
        git \
        unzip \
        libfreetype6-dev \
        libicu-dev \
        libjpeg62-turbo-dev \
        libxml2-dev \
        libpng-dev \
        libzip-dev \
        libonig-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" \
        curl \
        dom \
        exif \
        fileinfo \
        gd \
        intl \
        mbstring \
        mysqli \
        pdo \
        pdo_mysql \
        simplexml \
        xml \
        zip \
    && if getent group "${APP_GID}" >/dev/null; then group_name="$(getent group "${APP_GID}" | cut -d: -f1)"; else groupadd -g "${APP_GID}" appgroup; group_name="appgroup"; fi \
    && if getent passwd "${APP_UID}" >/dev/null; then user_name="$(getent passwd "${APP_UID}" | cut -d: -f1)"; usermod -g "${APP_GID}" "${user_name}"; else useradd -u "${APP_UID}" -g "${APP_GID}" -m -s /bin/bash appuser; user_name="appuser"; fi \
    && sed -i "s/^user = .*/user = ${user_name}/" /usr/local/etc/php-fpm.d/www.conf \
    && sed -i "s/^group = .*/group = ${group_name}/" /usr/local/etc/php-fpm.d/www.conf \
    && sed -i "s/^listen\\.owner = .*/listen.owner = ${user_name}/" /usr/local/etc/php-fpm.d/www.conf \
    && sed -i "s/^listen\\.group = .*/listen.group = ${group_name}/" /usr/local/etc/php-fpm.d/www.conf \
    && sed -i "s/^;clear_env = no/clear_env = no/" /usr/local/etc/php-fpm.d/www.conf \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www/html
