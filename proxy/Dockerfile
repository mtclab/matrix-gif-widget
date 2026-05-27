FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY . .
ENV PROXY_PORT=3100
EXPOSE 3100
CMD ["node", "server.mjs"]