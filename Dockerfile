FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_GIF_API_KEY=""
ARG VITE_GIF_PROXY_URL=""

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]