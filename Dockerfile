# ==========================================
# Stage 1: Build Frontend (React + Vite)
# ==========================================
FROM node:20-bookworm-slim AS client-builder

WORKDIR /app/client

# Install dependencies with clean install
COPY client/package*.json ./
RUN npm ci

# Client build arguments (for Coolify environment variables or build args)
ARG VITE_API_URL=/api
ARG VITE_SERVER_URL=
ARG VITE_SUPABASE_URL=https://bfjkgfhvlvqeylvhjqce.supabase.co
ARG VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmamtnZmh2bHZxZXlsdmhqcWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MjUzMDMsImV4cCI6MjEwMjEwMTMwM30.I7_yft17dq9JzUaxCx3nP1rMuv1icghB2u1qs4Z6eF8

ENV VITE_API_URL=$VITE_API_URL \
    VITE_SERVER_URL=$VITE_SERVER_URL \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Copy client source code and build production bundle
COPY client/ ./
RUN npm run build

# ==========================================
# Stage 2: Production Server (Node.js + LibreOffice)
# ==========================================
FROM node:20-bookworm-slim AS runner

WORKDIR /app/server

# Install LibreOffice and fonts for headless DOCX-to-PDF conversion on Linux
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-calc \
    fonts-dejavu-core \
    fonts-freefont-ttf \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install server production dependencies
COPY server/package*.json ./
RUN npm ci --omit=dev

# Copy backend source files
COPY server/ ./

# Copy built frontend assets from stage 1 into public directory
COPY --from=client-builder /app/client/dist ./public

# Ensure uploads, generated bills, and database folders exist
RUN mkdir -p uploads generated_bills database

# Expose volume mounts for persistent files
VOLUME ["/app/server/uploads", "/app/server/generated_bills", "/app/server/database"]

# Default environment configuration
ENV NODE_ENV=production \
    PORT=5000

# Expose container port (Coolify routes domain traffic to this port)
EXPOSE 5000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Start the Express server
CMD ["node", "index.js"]
