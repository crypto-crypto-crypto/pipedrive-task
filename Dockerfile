FROM node:14

WORKDIR /usr/src/app
COPY package.json ./

RUN npm install
# RUN npm ci --only=production

COPY . .

EXPOSE 8080
EXPOSE 9991

CMD node server.js
