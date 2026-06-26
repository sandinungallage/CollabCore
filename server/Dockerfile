# Use official lightweight Node.js image
FROM node:20-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package.json to install dependencies first (leverages Docker cache)
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production || npm install --only=production

# Copy all backend source files to the working directory
COPY . .

# Expose the default Express port (5000)
EXPOSE 5000

# Start the server
CMD ["node", "server.js"]
