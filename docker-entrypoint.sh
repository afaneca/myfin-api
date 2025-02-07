#!/bin/sh

echo "Starting myfin-backend"
npm run db:deploy && \
  npm run start