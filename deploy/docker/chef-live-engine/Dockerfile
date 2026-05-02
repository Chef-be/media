FROM bluenviron/mediamtx:latest AS mediamtx

FROM alpine:3.21

COPY --from=mediamtx /mediamtx /usr/local/bin/mediamtx

COPY mediamtx.default.yml /defaults/mediamtx.yml
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
