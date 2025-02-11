# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy only files needed for installation
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client and build
RUN npx prisma generate && \
    npm run build && \
    npm prune --production

# Production stage
FROM node:20-alpine

# Add metadata
LABEL maintainer="José Valdiviesso <me@zmiguel.me>"
LABEL author="José Valdiviesso <me@zmiguel.me>"
LABEL version="2.9.1"
LABEL description="MyFin API Server"
LABEL org.opencontainers.image.authors="José Valdiviesso <me@zmiguel.me>"
LABEL org.opencontainers.image.version="2.9.1"
LABEL org.opencontainers.image.title="MyFin API Server"
LABEL org.opencontainers.image.description="Rest API for the personal finances platform that'll help you budget, keep track of your income/spending and forecast your financial future."
LABEL org.opencontainers.image.source="https://github.com/afaneca/myfin-api"

WORKDIR /app

# Install necessary system dependencies
RUN apk --no-cache add curl openssl zlib libgcc musl

# Copy only the necessary files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Create startup script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'export DATABASE_URL="mysql://$DB_USER:$DB_PW@$DB_HOST:$DB_PORT/$DB_NAME"' >> /app/start.sh && \
    echo 'npm run db:deploy && npx tsx dist/server.js' >> /app/start.sh && \
    chmod +x /app/start.sh

# Set environment variables
ENV NODE_ENV=production \
    # Database Configuration
    DB_NAME="" \
    DB_USER="" \
    DB_PW="" \
    DB_PORT="3306" \
    DB_HOST="localhost" \
    # Email Configuration
    SMTP_HOST="" \
    SMTP_PORT="465" \
    SMTP_SECURE="true" \
    SMTP_USER="" \
    SMTP_PASSWORD="" \
    SMTP_FROM="" \
    # Application Configuration
    PORT="3001" \
    LOGGING="false" \
    BYPASS_SESSION_CHECK="false" \
    ENABLE_USER_SIGNUP="true"

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/ || exit 1

EXPOSE 3001

CMD ["/app/start.sh"]