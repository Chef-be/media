FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json ./package.json
COPY server.js ./server.js

RUN npm install --omit=dev

EXPOSE 8081 1935 8088 8889

CMD ["node", "server.js"]
