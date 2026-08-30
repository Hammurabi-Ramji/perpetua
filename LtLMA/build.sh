#!/bin/bash

# Build script for LtLMA

echo "Building LtLMA..."

# Build frontend
npm run build

# Build Tauri app
npx tauri build

echo "Build complete. Check src-tauri/target/release/ for the executable."