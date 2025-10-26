#!/usr/bin/env python3
"""
Test script for OCR functionality in the medicine-rag project.
This script demonstrates how to use the OCR features for scanned PDFs.
"""

import os
import sys
import logging
from pathlib import Path

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from workers.indexer_activities import IndexerActivities
from azure_storage import AzureStorage

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def test_ocr_functionality():
    """Test the OCR functionality with a sample PDF."""
    
    # Mock configuration and Azure storage for testing
    config = {
        "azure_storage_account": "test",
        "azure_storage_key": "test",
        "azure_container_name": "test"
    }
    
    # Create a mock Azure storage (you'll need to implement this for actual testing)
    azure_storage = None  # Replace with actual AzureStorage instance for real testing
    
    # Create IndexerActivities instance
    indexer = IndexerActivities(config, azure_storage)
    
    # Test PDF detection
    print("Testing PDF scanning detection...")
    
    # You can test with a local PDF file
    test_pdf_path = "sample_scanned.pdf"  # Replace with actual PDF path
    
    if os.path.exists(test_pdf_path):
        is_scanned = indexer._is_scanned_pdf(test_pdf_path)
        print(f"PDF {test_pdf_path} is scanned: {is_scanned}")
        
        if is_scanned:
            print("Testing OCR processing...")
            try:
                ocr_pdf_path = indexer._apply_ocr_to_pdf(test_pdf_path)
                print(f"OCR processing completed. Output saved to: {ocr_pdf_path}")
                
                # Clean up
                if os.path.exists(ocr_pdf_path):
                    os.unlink(ocr_pdf_path)
                    print("Temporary OCR file cleaned up.")
                    
            except Exception as e:
                print(f"OCR processing failed: {e}")
    else:
        print(f"Test PDF file {test_pdf_path} not found.")
        print("Please place a scanned PDF file named 'sample_scanned.pdf' in the current directory to test OCR functionality.")

def test_tesseract_installation():
    """Test if Tesseract OCR is properly installed."""
    try:
        import pytesseract
        from PIL import Image
        
        # Test Tesseract version
        version = pytesseract.get_tesseract_version()
        print(f"Tesseract OCR version: {version}")
        
        # Test with a simple image (if available)
        print("Tesseract OCR is properly installed and configured.")
        return True
        
    except ImportError as e:
        print(f"Required libraries not available: {e}")
        print("Please install OCR dependencies by running: ./install_ocr_dependencies.sh")
        return False
    except Exception as e:
        print(f"Tesseract OCR test failed: {e}")
        print("Please install Tesseract OCR and pytesseract package.")
        return False

if __name__ == "__main__":
    print("=== OCR Functionality Test ===")
    print()
    
    # Test Tesseract installation
    if test_tesseract_installation():
        print()
        test_ocr_functionality()
    else:
        print("Please install OCR dependencies first by running:")
        print("./install_ocr_dependencies.sh")
