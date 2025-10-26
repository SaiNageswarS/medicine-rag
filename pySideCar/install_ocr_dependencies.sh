#!/bin/bash

# Script to install OCR dependencies for the medicine-rag project
# This script installs Tesseract OCR and Python dependencies

echo "Installing OCR dependencies for medicine-rag project..."

# Update package lists
echo "Updating package lists..."
sudo apt-get update

# Install Tesseract OCR
echo "Installing Tesseract OCR..."
sudo apt-get install -y tesseract-ocr

# Install additional language packs (optional)
echo "Installing additional Tesseract language packs..."
sudo apt-get install -y tesseract-ocr-eng tesseract-ocr-spa tesseract-ocr-fra tesseract-ocr-deu

# Install Python dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt

# Verify Tesseract installation
echo "Verifying Tesseract installation..."
tesseract --version

echo "OCR dependencies installation completed!"
echo "You can now process scanned PDFs with OCR support."
