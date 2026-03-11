FROM node:18-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ .
EXPOSE 3001
CMD ["node", "src/index.js"]
