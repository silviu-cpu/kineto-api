# kineto-api production image
# ---------- Builder ----------
FROM node:22-slim AS builder

# openssl e necesar pentru Prisma; build tools pentru bcrypt (modul nativ)
RUN apt-get update -y && apt-get install -y openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
# npm install (nu npm ci): unele optional deps native (ex. unrs-resolver/@emnapi din
# tooling-ul eslint) diferă între Windows și Linux, iar npm ci cere lock perfect sincron.
RUN npm install --no-audit --no-fund

COPY . .
# DATABASE_URL dummy doar ca prisma.config.ts (env()) să se încarce; generate NU se conectează.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" npx prisma generate
RUN npm run build

# Notă: păstrăm node_modules întreg (include prisma CLI) pentru `migrate deploy`
# la pornirea containerului.

# ---------- Runner ----------
FROM node:22-slim AS runner

RUN apt-get update -y && apt-get install -y openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

CMD ["./docker-entrypoint.sh"]