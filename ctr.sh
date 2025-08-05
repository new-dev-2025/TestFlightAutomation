#!/bin/bash

echo "Deleting node_modules..."
rm -rf node_modules

echo "Deleting package-lock.json..."
rm -f package-lock.json

echo "Installing npm dependencies..."
npm install

if [ $? -eq 0 ]; then
   echo "npm install completed successfully"
   echo "Starting application..."
   node src/main.js
else
   echo "npm install failed"
   exit 1
fi