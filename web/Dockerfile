FROM node:22-alpine

WORKDIR /app

# Install dependencies first for better layer caching
# Aggressive fetch retries harden npm against flaky networks (e.g. mobile hotspots)
COPY package.json package-lock.json ./
RUN npm ci --fetch-retries=8 --fetch-retry-mintimeout=5000 --fetch-retry-maxtimeout=120000 --fetch-timeout=600000

# Copy the rest of the app (source only; .dockerignore keeps node_modules out)
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
