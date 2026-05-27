FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_GIF_API_KEY=""
ARG VITE_GIF_PROXY_URL=""

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs ./

ARG VITE_GIF_API_KEY=""
ARG VITE_GIF_PROXY_URL=""

COPY --from=build /app/dist ./dist

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.mjs"]