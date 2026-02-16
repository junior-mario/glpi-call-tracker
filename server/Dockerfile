FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY index.js .

ENV DB_PATH=/data/db.sqlite

VOLUME ["/data"]

EXPOSE 3000

CMD ["node", "index.js"]
