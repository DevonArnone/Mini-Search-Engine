FROM node:20-alpine

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json
COPY packages/search-engine/package.json ./packages/search-engine/package.json

RUN npm install

COPY apps/web ./apps/web
COPY packages ./packages

# Builds the search engine worker, then the Next.js application.
RUN npm run build

# The native index is read from a volume shared with the crawler.
ENV SEARCH_BACKEND=native
ENV SEARCH_INDEX_DIR=/data/search-index

EXPOSE 3000

CMD ["npm", "--workspace", "apps/web", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
