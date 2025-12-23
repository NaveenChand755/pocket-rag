FROM oven/bun:1
WORKDIR /app

# Install deps
COPY package.json bun.lock ./
RUN bun install --production

# Copy source
COPY src ./src

EXPOSE 3000
CMD ["bun", "src/index.ts"]