FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Alle Backend-Dateien statt einer Aufzaehlung: die Liste hier wurde beim
# Hinzufuegen von config.js und errors.js vergessen, wodurch der naechste
# Neubau mit "Cannot find module './errors'" abbrach.
COPY *.js ./
COPY public ./public

# Die Lizenz verlangt, dass jede weitergegebene Kopie die Bedingungen und den
# "Required Notice" mitbringt — ein Image ist eine solche Kopie.
COPY LICENSE.md ./

EXPOSE 8321
VOLUME /app/data

CMD ["node", "server.js"]
