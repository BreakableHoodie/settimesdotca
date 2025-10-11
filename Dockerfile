# Build stage for frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --production

# Copy backend source
COPY backend/ ./

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist ./public

WORKDIR /app/backend

EXPOSE 3000

CMD ["node", "server.js"]
