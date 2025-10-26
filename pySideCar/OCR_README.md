# OCR Support for Scanned PDFs

This document describes the OCR (Optical Character Recognition) functionality added to the medicine-rag project to handle scanned PDFs.

## Overview

The `pymupdf4llm.to_markdown` function does not automatically apply OCR when processing scanned PDFs. This enhancement adds automatic OCR detection and processing for scanned documents before converting them to Markdown format.

## Features

- **Automatic Detection**: Automatically detects if a PDF is scanned based on text content analysis
- **OCR Processing**: Uses Tesseract OCR to extract text from scanned PDF pages
- **Fallback Mechanism**: Falls back to direct conversion if OCR fails
- **Multi-language Support**: Supports multiple languages (English, Spanish, French, German)
- **Error Handling**: Comprehensive error handling with detailed logging

## Dependencies

### System Dependencies
- **Tesseract OCR**: The core OCR engine
- **Tesseract Language Packs**: For multi-language support

### Python Dependencies
- `pytesseract==0.3.13`: Python wrapper for Tesseract OCR
- `Pillow==10.4.0`: Image processing library
- `PyMuPDF==1.26.0`: PDF processing (already installed)
- `pymupdf4llm==0.0.24`: PDF to Markdown conversion (already installed)

## Installation

### Automatic Installation
Run the provided installation script:

```bash
./install_ocr_dependencies.sh
```

### Manual Installation

#### Ubuntu/Debian:
```bash
# Install Tesseract OCR
sudo apt-get update
sudo apt-get install -y tesseract-ocr

# Install language packs
sudo apt-get install -y tesseract-ocr-eng tesseract-ocr-spa tesseract-ocr-fra tesseract-ocr-deu

# Install Python dependencies
pip install -r requirements.txt
```

#### macOS (with Homebrew):
```bash
# Install Tesseract OCR
brew install tesseract

# Install Python dependencies
pip install -r requirements.txt
```

## Usage

The OCR functionality is automatically integrated into the existing `convert_pdf_to_md` activity. No changes are needed to existing workflows.

### How It Works

1. **PDF Analysis**: The system analyzes the first few pages of the PDF to determine if it contains sufficient text
2. **OCR Detection**: If the PDF appears to be scanned (low text content), OCR processing is triggered
3. **Text Extraction**: Each page is rendered as a high-resolution image and processed with Tesseract OCR
4. **PDF Reconstruction**: A new PDF is created with the extracted text overlaid on the original pages
5. **Markdown Conversion**: The OCR-processed PDF is then converted to Markdown using `pymupdf4llm.to_markdown`

### Configuration

The system automatically detects Tesseract installation in common locations:
- `/usr/bin/tesseract`
- `/usr/local/bin/tesseract`
- `/opt/homebrew/bin/tesseract` (macOS)
- System PATH

## Testing

Run the test script to verify OCR functionality:

```bash
python test_ocr.py
```

For a complete test, place a scanned PDF file named `sample_scanned.pdf` in the project directory.

## Error Handling

The system includes comprehensive error handling:

- **Tesseract Not Found**: Logs warning and falls back to direct conversion
- **OCR Processing Failure**: Logs error and falls back to direct conversion
- **Page Processing Failure**: Continues with remaining pages
- **File Cleanup**: Automatically cleans up temporary OCR files

## Logging

The OCR functionality provides detailed logging:

- PDF analysis results (text content per page)
- OCR processing progress (page by page)
- Error messages and fallback actions
- Performance metrics

## Performance Considerations

- **Processing Time**: OCR processing is significantly slower than direct text extraction
- **Memory Usage**: Higher memory usage due to image processing
- **File Size**: OCR-processed PDFs may be larger due to text overlay
- **Quality**: OCR accuracy depends on image quality and text clarity

## Troubleshooting

### Common Issues

1. **Tesseract Not Found**
   - Ensure Tesseract is installed and in PATH
   - Check installation with `tesseract --version`

2. **OCR Quality Issues**
   - Ensure PDF images are high resolution
   - Check if the PDF is actually scanned (not just low-quality text)

3. **Memory Issues**
   - Large PDFs may require more memory
   - Consider processing in smaller batches

### Debug Mode

Enable debug logging to see detailed OCR processing information:

```python
import logging
logging.getLogger().setLevel(logging.DEBUG)
```

## Future Enhancements

Potential improvements for future versions:

- **Preprocessing**: Image preprocessing for better OCR accuracy
- **Language Detection**: Automatic language detection for OCR
- **Batch Processing**: Parallel processing for multiple PDFs
- **Quality Metrics**: OCR confidence scoring
- **Custom Models**: Support for custom Tesseract models

## Support

For issues related to OCR functionality:

1. Check the logs for detailed error messages
2. Verify Tesseract installation and configuration
3. Test with the provided test script
4. Ensure PDF files are properly formatted scanned documents
