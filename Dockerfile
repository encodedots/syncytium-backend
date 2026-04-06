# Backend Dockerfile for NestJS + Fastify

FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install ALL dependencies (needed for build)
RUN npm ci && \
    npm cache clean --force

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build application
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Production image
FROM node:22-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy built application and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/scripts/docker-entrypoint.sh ./scripts/

# Create non-root user and make startup script executable
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 && \
    chmod +x /app/scripts/docker-entrypoint.sh && \
    chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Run migrations, seeding, and start the application
CMD ["sh", "/app/scripts/docker-entrypoint.sh"]
