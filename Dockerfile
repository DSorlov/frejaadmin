FROM node:current-alpine
WORKDIR /usr/src/frejaadmin
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3180
VOLUME ["/data","/logs"]
CMD [ "node", "index.js" ]