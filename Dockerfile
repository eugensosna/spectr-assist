# Adjust NODE_VERSION as desired
ARG NODE_VERSION=24.11.0
FROM node:${NODE_VERSION}-slim AS build

# Use an official Node.js image
# FROM node:20-alpine as build

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json bun.lockb ./
RUN npm install

# Copy the rest of the frontend source code
COPY . .

# Build the Vite app for production
RUN npm run build

# ------------------------------
# Final stage: lightweight server
FROM node:${NODE_VERSION}-slim

WORKDIR /app

# Copy built files from previous stage and other needed files
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

RUN npm i -g serve

# Install only production dependencies (if needed, optional for preview)
# RUN npm ci --only=production

# Expose Vite preview port
EXPOSE 3000

# Use Vite’s preview server to serve the built frontend
# CMD ["npm", "run", "preview"]
CMD [ "serve", "-s", "dist" ]