FROM node:20-alpine

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json

RUN npm install

COPY apps/web ./apps/web
COPY packages ./packages

RUN npm run build

EXPOSE 3000

CMD ["npm", "--workspace", "apps/web", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]

