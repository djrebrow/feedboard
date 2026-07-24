FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js db.js feedFetcher.js telegram.js opml.js extract.js auth.js ai.js ./
COPY public ./public

EXPOSE 8321
VOLUME /app/data

CMD ["node", "server.js"]
