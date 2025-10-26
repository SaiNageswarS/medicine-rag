import io
import logging
import os
import tempfile
from typing import Optional

from temporalio import activity

from azure_storage import AzureStorage

from workers.indexer_types import parse_section_chunk_file, Chunk
from workers.window_chunker import WindowChunker

# Set up logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class IndexerActivities:
    def __init__(self, config: dict[str, str], azure_storage: AzureStorage):
        self._config = config
        self._azure_storage = azure_storage

        self.window_chunker = WindowChunker()
        
        # Configure Tesseract path if needed (for different OS environments)
        self._configure_tesseract()

    def _configure_tesseract(self):
        """Configure Tesseract OCR path for different environments."""
        try:
            import pytesseract
        except ImportError:
            logger.warning("pytesseract not available. OCR functionality will not work.")
            return
            
        # Try common Tesseract installation paths
        tesseract_paths = [
            '/usr/bin/tesseract',
            '/usr/local/bin/tesseract',
            '/opt/homebrew/bin/tesseract',  # macOS with Homebrew
            'tesseract'  # If it's in PATH
        ]
        
        for path in tesseract_paths:
            if os.path.exists(path) or path == 'tesseract':
                try:
                    pytesseract.pytesseract.tesseract_cmd = path
                    # Test if tesseract is working
                    pytesseract.get_tesseract_version()
                    logger.info(f"Tesseract configured at: {path}")
                    return
                except (OSError, RuntimeError) as e:
                    logger.warning(f"Tesseract at {path} not working: {e}")
                    continue
        
        logger.warning("Tesseract not found. OCR functionality may not work properly.")

    def _is_scanned_pdf(self, pdf_path: str) -> bool:
        """
        Check if a PDF is scanned (contains mostly images with little to no text).
        
        Args:
            pdf_path (str): Path to the PDF file
            
        Returns:
            bool: True if the PDF appears to be scanned, False otherwise
        """
        try:
            import fitz  # PyMuPDF
        except ImportError:
            logger.error("PyMuPDF not available. Cannot check if PDF is scanned.")
            return True  # Assume scanned if we can't check
            
        try:
            doc = fitz.open(pdf_path)
            total_text_length = 0
            total_pages = len(doc)
            
            # Check first few pages for text content
            pages_to_check = min(3, total_pages)
            
            for page_num in range(pages_to_check):
                page = doc[page_num]
                text = page.get_text().strip()
                total_text_length += len(text)
            
            doc.close()
            
            # If average text per page is very low, likely scanned
            avg_text_per_page = total_text_length / pages_to_check
            is_scanned = avg_text_per_page < 50  # Threshold for scanned content
            
            logger.info(
                f"PDF text analysis: {avg_text_per_page:.1f} chars/page, "
                f"scanned: {is_scanned}"
            )
            return is_scanned
            
        except (OSError, RuntimeError, ValueError) as e:
            logger.error(f"Error checking if PDF is scanned: {e}")
            # If we can't determine, assume it might be scanned and try OCR
            return True

    def _apply_ocr_to_pdf(self, pdf_path: str) -> str:
        """
        Apply OCR to a scanned PDF and return the path to the OCR-processed PDF.
        
        Args:
            pdf_path (str): Path to the original PDF file
            
        Returns:
            str: Path to the OCR-processed PDF file
        """
        try:
            import fitz  # PyMuPDF
            import pytesseract
            from PIL import Image
        except ImportError as import_error:
            logger.error(f"Required OCR libraries not available: {import_error}")
            return pdf_path  # Return original PDF if libraries not available
            
        try:
            logger.info(f"Applying OCR to PDF: {pdf_path}")
            
            # Open the original PDF
            doc = fitz.open(pdf_path)
            new_doc = fitz.open()  # New PDF to store OCR-processed pages
            
            for page_num, page in enumerate(doc):
                logger.info(f"Processing page {page_num + 1}/{len(doc)}")
                self._process_page_with_ocr(page, new_doc, page_num)
            
            doc.close()
            
            # Save the OCR-processed PDF to a temporary file
            temp_fd, temp_path = tempfile.mkstemp(suffix='_ocr.pdf')
            os.close(temp_fd)
            new_doc.save(temp_path)
            new_doc.close()
            
            logger.info(f"OCR processing completed. Saved to: {temp_path}")
            return temp_path
            
        except (OSError, RuntimeError, ValueError) as e:
            logger.error(f"Error applying OCR to PDF: {e}")
            # Return original PDF path if OCR fails
            return pdf_path
    
    def _process_page_with_ocr(self, page, new_doc, page_num):
        """Process a single page with OCR."""
        try:
            import fitz  # PyMuPDF
            import pytesseract
            from PIL import Image
        except ImportError:
            return
            
        # Render page as an image with higher DPI for better OCR
        pix = page.get_pixmap(dpi=300)
        img_data = pix.tobytes("png")
        
        # Convert to PIL Image for OCR
        img = Image.open(io.BytesIO(img_data))
        
        # Apply OCR using pytesseract
        try:
            # Get OCR text from the image
            ocr_text = pytesseract.image_to_string(img, lang='eng')
            
            if ocr_text.strip():
                self._add_ocr_text_to_page(page, new_doc, ocr_text)
            else:
                # If no text found, try PyMuPDF's built-in OCR
                logger.warning(f"No text found on page {page_num + 1}, trying PyMuPDF OCR")
                self._try_pymupdf_ocr(page, new_doc, pix)
            
        except (OSError, RuntimeError) as ocr_error:
            logger.error(f"OCR failed for page {page_num + 1}: {ocr_error}")
            # Insert original page if OCR fails
            self._insert_original_page(page, new_doc, pix)
    
    def _add_ocr_text_to_page(self, page, new_doc, ocr_text):
        """Add OCR text to a new page."""
        try:
            import fitz  # PyMuPDF
        except ImportError:
            return
            
        # Create a new page with the same dimensions
        new_page = new_doc.new_page(width=page.rect.width, height=page.rect.height)
        
        # Add the OCR text to the page
        # Split text into lines and add them
        lines = ocr_text.strip().split('\n')
        y_position = 50  # Start position
        line_height = 20
        
        for line in lines:
            if line.strip():
                new_page.insert_text(
                    (50, y_position),  # Position
                    line.strip(),
                    fontsize=12,
                    color=(0, 0, 0)  # Black text
                )
                y_position += line_height
        
        # Insert the processed page
        new_doc.insert_pdf(
            fitz.open("pdf", new_page.get_pixmap().pdfocr_tobytes())
        )
    
    def _try_pymupdf_ocr(self, page, new_doc, pix):
        """Try PyMuPDF's built-in OCR."""
        try:
            import fitz  # PyMuPDF
        except ImportError:
            return
            
        try:
            ocr_pdf_bytes = pix.pdfocr_tobytes()
            if ocr_pdf_bytes:
                temp_doc = fitz.open("pdf", ocr_pdf_bytes)
                new_doc.insert_pdf(temp_doc)
                temp_doc.close()
            else:
                # If all OCR fails, insert original page
                self._insert_original_page(page, new_doc, pix)
        except (OSError, RuntimeError) as ocr_error:
            logger.warning(f"PyMuPDF OCR failed: {ocr_error}")
            # Insert original page if OCR fails
            self._insert_original_page(page, new_doc, pix)
    
    def _insert_original_page(self, page, new_doc, pix):
        """Insert original page if OCR fails."""
        try:
            import fitz  # PyMuPDF
        except ImportError:
            return
            
        new_doc.insert_pdf(
            fitz.open("pdf", pix.pdfocr_tobytes())
        )

    @activity.defn(name="convert_pdf_to_md")
    async def convert_pdf_to_md(self, tenant: str, pdf_file_name: str) -> str:
        """
        Convert a PDF file stored in Azure Blob Storage to Markdown format.
        Automatically detects scanned PDFs and applies OCR if needed.

        Args:
            tenant (str): The tenant identifier.
            pdf_file_name (str): The name of the PDF file in Azure Blob Storage.

        Returns:
            str: The name of the converted Markdown file.
        """
        try:
            import pymupdf4llm
        except ImportError:
            logger.error("pymupdf4llm not available. Cannot convert PDF to Markdown.")
            raise

        logging.info(f"Starting conversion of {pdf_file_name} to Markdown")

        # Download the PDF file from Azure Blob Storage
        pdf_file_path = self._azure_storage.download_file(tenant, pdf_file_name)

        # Check if the PDF is scanned and needs OCR
        is_scanned = self._is_scanned_pdf(pdf_file_path)
        
        if is_scanned:
            logging.info(f"PDF {pdf_file_name} appears to be scanned, applying OCR")
            try:
                # Apply OCR to the scanned PDF
                ocr_pdf_path = self._apply_ocr_to_pdf(pdf_file_path)
                
                # Use the OCR-processed PDF for markdown conversion
                md_text = pymupdf4llm.to_markdown(ocr_pdf_path)
                
                # Clean up the temporary OCR file
                try:
                    os.unlink(ocr_pdf_path)
                except OSError as cleanup_error:
                    logging.warning(f"Failed to clean up OCR file {ocr_pdf_path}: {cleanup_error}")
                    
            except (OSError, RuntimeError, ValueError) as ocr_error:
                logging.error(f"OCR processing failed for {pdf_file_name}: {ocr_error}")
                logging.info("Falling back to direct markdown conversion without OCR")
                # Fallback to direct conversion if OCR fails
                md_text = pymupdf4llm.to_markdown(pdf_file_path)
        else:
            logging.info(f"PDF {pdf_file_name} contains text, converting directly to Markdown")
            # Convert the PDF to Markdown directly
            md_text = pymupdf4llm.to_markdown(pdf_file_path)

        # Upload the markdown content to Azure Blob Storage
        md_file_name = pdf_file_name.replace(".pdf", ".md")
        self._azure_storage.upload_bytes(tenant, md_file_name, md_text.encode("utf-8"))

        logging.info(f"Converted {pdf_file_name} to {md_file_name}")

        return md_file_name

    @activity.defn(name="window_section_chunks")
    async def window_section_chunks(
        self,
        tenant: str,
        md_section_json_urls: list[str],
        windows_output_path: str,
    ) -> list[str]:
        """
        Process Markdown sections into windowed chunks.

        Args:
            tenant (str): The tenant identifier.
            md_section_json_url (str): JSON URL of a single Markdown section.
            windows_output_path (str): Output path for the windowed chunks.
        Returns:
            list[str]: Storage blob path of windows.
        """
        logging.info(
            f"Processing {len(md_section_json_urls)} Markdown sections for tenant {tenant}"
        )

        result = []     # chunk blob paths
        previous_last_chunk: Optional[Chunk] = None

        for idx, md_section_json_url in enumerate(md_section_json_urls):
            md_section_json_file = self._azure_storage.download_file(
                tenant, md_section_json_url
            )
            md_section = parse_section_chunk_file(md_section_json_file)

            # Process the sections into windowed chunks
            for window_chunk in self.window_chunker.chunk_windows(md_section):
                if previous_last_chunk is not None:
                    # Link the previous chunk to the current one
                    previous_last_chunk.nextChunkId = window_chunk.chunkId
                    window_chunk.prevChunkId = previous_last_chunk.chunkId

                    # Upload the previous chunk to Azure Blob Storage
                    blob_path = f"{windows_output_path}/{previous_last_chunk.chunkId}.chunk.json"
                    self._azure_storage.upload_bytes(
                        tenant, blob_path, previous_last_chunk.to_json_bytes()
                    )

                    result.append(blob_path)

                # Update the previous chunk to the current one
                previous_last_chunk = window_chunk
            
            activity.heartbeat({"progress": f"{idx+1}/{len(md_section_json_urls)}"})
            logger.info(
                f"Processed section {idx + 1}/{len(md_section_json_urls)}: {md_section.chunkId}"
            )

        # Handle the last chunk
        if previous_last_chunk is not None:
            blob_path = f"{windows_output_path}/{previous_last_chunk.chunkId}.chunk.json"
            self._azure_storage.upload_bytes(
                tenant, blob_path, previous_last_chunk.to_json_bytes()
            )
            result.append(blob_path)

        return result
