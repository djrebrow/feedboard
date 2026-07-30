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

# Die AGPL verlangt, dass jede weitergegebene Kopie den Lizenztext mitbringt —
# ein Image ist eine solche Kopie.
COPY LICENSE.md ./

EXPOSE 8321
VOLUME /app/data

# Lebenszeichen ueber /api/healthz. Alpine bringt kein curl mit, also fragt
# Node selbst — das ist ohnehin schon da. Antwortet der Prozess dreimal nicht
# oder kommt er nicht mehr an die Datenbank, faellt der Container auf
# "unhealthy" und "restart: unless-stopped" greift.
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8321) + '/api/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
