# Frontend Dockerfile (Next
# Frontend Dockerfile (Fast Test Mode)
FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy project files
COPY . .

# Disable linting/typecheck and run in dev mode for fast startup
ENV NEXT_DISABLE_ESLINT=true NEXT_DISABLE_TYPECHECK=true

EXPOSE 3000

CMD ["npm", "run", "dev"]