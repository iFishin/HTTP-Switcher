FROM node:20-alpine AS build

WORKDIR /app
COPY package.json ./
RUN npm install --production

FROM node:20-alpine

WORKDIR /app
RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/node_modules ./node_modules
COPY . .

USER app

EXPOSE 8080

CMD ["node", "src/app.js"]
