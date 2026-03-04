FROM node:22-alpine AS runtime

WORKDIR /app

# Install production dependencies
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts 2>/dev/null || npm install --omit=dev

# Copy built output
COPY dist/ ./dist/

ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "./dist/server/entry.mjs"]
