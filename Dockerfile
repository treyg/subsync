# Multi-stage build for Reddit Transfer App
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# Install dependencies stage
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock* /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# Production dependencies
RUN mkdir -p /temp/prod
COPY package.json bun.lock* /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# Build stage
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# Set production environment
ENV NODE_ENV=production

# Build the application
RUN bun run build

# Final production stage
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/dist ./dist
COPY --from=prerelease /usr/src/app/src/static ./src/static
COPY package.json .

# Create non-root user for security
RUN addgroup --system --gid 1001 appgroup
RUN adduser --system --uid 1001 --gid 1001 appuser

# Change ownership of app directory
RUN chown -R appuser:appgroup /usr/src/app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Start the application
ENTRYPOINT ["bun", "run", "dist/server.js"]