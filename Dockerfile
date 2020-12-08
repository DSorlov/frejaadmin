FROM node:14
WORKDIR /usr/src/frejaadmin
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3180
CMD [ "node", "index.js" ]